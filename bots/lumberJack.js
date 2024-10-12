const { BaseBot, returnToBase, chat } = require('../base/BaseBot.js');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const {LUBER_BASE_POSITION} = require('../constants/bases.js');

// Define a threshold for the number of logs
const LOG_THRESHOLD = 64;
const MAX_REACH_HEIGHT = 4;
const MAX_DISTANCE_TO_CHOP = 5;
const MS_BETWEEN_ACTIONS = 1250;
const ignoredBlocks = [];  // Array to store ignored blockst

let WORKING_STATE = "IDLE";

// Work function for LumberJack to start chopping wood
async function work() {
    if (!hasAxeEquipped()) {
        chat(baseBot, 'Looking for an axe before starting work.');

        // Look for the axe in a chest and equip it
        const foundAxe = await findAndEquipAxeInChest();

        if (!foundAxe) {
            chat(baseBot, 'Could not find chest or no axe found in the chest.');
            chat(baseBot, 'Returning to base.');

            returnToBase(baseBot, () => {setTimeout(work, MS_BETWEEN_ACTIONS)});
        } else {
            findingBlockToChop();
            return;
        }


    } else {
        chat(baseBot, 'Searching for a block to chop.');
        findingBlockToChop();
    }
}


function findingBlockToChop(){
    // Find nearest wood block and chop it
    const woodBlock = baseBot.bot.findBlock({
        matching: block => block && block.name && block.name.includes('log') && !isIgnoredBlock(block),  // Find wood logs that are not ignored
        maxDistance: 100,  // Search within 100 blocks
    });

    if (woodBlock) {
        const heightDifference = Math.abs(baseBot.bot.entity.position.y - woodBlock.position.y);

        // Ignore the block if it's too high or too low to reach
        if (heightDifference > MAX_REACH_HEIGHT) {
            ignoredBlocks.push({
                x: woodBlock.position.x,
                y: woodBlock.position.y,
                z: woodBlock.position.z,
            });
            findingBlockToChop();  // Search for another block
        } else {
            chat(baseBot, 'Found reachable wood.');
            moveToBlockAndChop(woodBlock);
        }
    } else {
        chat(baseBot, 'No wood nearby. I will rest now.', true);
        setTimeout(() => {returnToBase(baseBot)}, MS_BETWEEN_ACTIONS);
    }
}


// Function to find and equip an axe from the chest
async function findAndEquipAxeInChest() {
    chat(baseBot, 'Looking for an axe in the chest.');
  
    try {
      // Find a nearby chest
      const chestBlock = baseBot.bot.findBlock({
        matching: block => block.name === 'chest',
        maxDistance: 32,  // Search within 32 blocks for a chest
      });
  
      if (chestBlock) {
        chat(baseBot, 'Found a chest. Moving to it.');
        
        // Move to the chest
        const goal = new GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 1);
        baseBot.bot.pathfinder.setGoal(goal);
  
        return new Promise((resolve, reject) => {
          baseBot.bot.once('goal_reached', async () => {
            chat(baseBot, 'Reached the chest. Checking for an axe.');
  
            // Open the chest container
            const chest = await baseBot.bot.openContainer(chestBlock);
  
            // Look for any axe in the chest
            const axeTypes = ['wooden_axe', 'stone_axe', 'iron_axe', 'golden_axe', 'diamond_axe'];
            const axeInChest = chest.slots.find(item => item && axeTypes.includes(item.name));
  
            if (axeInChest) {
              chat(baseBot, `Found an axe (${axeInChest.name}). Moving it to inventory.`);
  
              try {
                // Transfer the axe to the bot's inventory
                await chest.withdraw(axeInChest.type, null, axeInChest.count);
                chat(baseBot, `Successfully moved the axe to inventory.`);
                chest.close();
                
                // Now equip the axe from the inventory
                setTimeout(() => {
                    equipAxeFromInventory()
                    resolve(true);  
                }, MS_BETWEEN_ACTIONS);
              } catch (transferErr) {
                chat(baseBot, `Failed to transfer axe to inventory: ${transferErr.message}`, true);
                chest.close();
                resolve(false);  // Failed to transfer
              }
            } else {
              chat(baseBot, 'No axe found in the chest.', true);
              chest.close();
              resolve(false);  // No axe found
            }
          });
        });
      } else {
        chat(baseBot, 'No chest found nearby.', true);
        return false;  // No chest found
      }
    } catch (err) {
      chat(baseBot, 'Error while searching for an axe in the chest.', true);
      logError(err);
      return false;
    }
  }

  async function equipAxeFromInventory() {
    const axeTypes = ['wooden_axe', 'stone_axe', 'iron_axe', 'golden_axe', 'diamond_axe'];
  
    // Search for an axe in the bot's inventory
    const axeInInventory = baseBot.bot.inventory.items().find(item => axeTypes.includes(item.name));
  
    if (axeInInventory) {
      chat(baseBot, `Found an axe (${axeInInventory.name}) in the inventory. Attempting to equip.`);
  
      try {
        await baseBot.bot.equip(axeInInventory, 'hand');  // Equip the axe in the hand
        chat(baseBot, 'Successfully equipped the axe from inventory.');
      } catch (err) {
        chat(baseBot, `Failed to equip axe from inventory: ${err.message}`, true);
      }
    } else {
      chat(baseBot, 'No axe found in inventory to equip.', true);
    }
  }
  

// Function to check if the bot has an axe equipped
function hasAxeEquipped() {
    const axeTypes = ['wooden_axe', 'stone_axe', 'iron_axe', 'golden_axe', 'diamond_axe'];
    const heldItem = baseBot.bot.heldItem;
  
    // Debugging check to see if the bot actually has an item in hand
    if (heldItem) {
      chat(baseBot, `Currently holding: ${heldItem.name}`);
    } else {
      chat(baseBot, 'Not holding any item.');
    }
  
    return heldItem && axeTypes.includes(heldItem.name);
  }

function isIgnoredBlock(block) {
    if (!block || !block.position) return false;
    return ignoredBlocks.some(ignoredBlock => {
        return ignoredBlock.x === block.position.x &&
            ignoredBlock.y === block.position.y &&
            ignoredBlock.z === block.position.z;
    });
}

// Function to stop the bot from working
function stop() {
    chat(baseBot, 'Stopping work. Resting now.', true);
    baseBot.bot.stopDigging();
}

// Function to move the bot to the wood block and chop it
function moveToBlockAndChop(woodBlock) {
    const distance = baseBot.bot.entity.position.distanceTo(woodBlock.position);
    if (distance > MAX_DISTANCE_TO_CHOP) {
        chat(baseBot, 'Moving closer to the wood block.');
        const goal = new GoalNear(woodBlock.position.x, woodBlock.position.y, woodBlock.position.z, MAX_DISTANCE_TO_CHOP); // Move within 1 block of wood
        baseBot.bot.pathfinder.setGoal(goal);

        baseBot.bot.once('goal_reached', () => {
            chat(baseBot, 'Reached the wood block.');
            startChopping(woodBlock);
        });
    } else {
        startChopping(woodBlock);
    }

}

// Function to start chopping wood with error handling
async function startChopping(woodBlock) {
    if (!woodBlock) {
        chat(baseBot, 'No valid wood block to chop.');
        return;
    }

    try {
        // Chop the wood asynchronously
        if (woodBlock.diggable) {
            await baseBot.bot.dig(woodBlock);
            chat(baseBot, `Finished chopping wood`);
        }
        // After chopping, pick up the wood before resuming work

        setTimeout(() => { pickUpNearbyItems(woodBlock.drops) }, MS_BETWEEN_ACTIONS);
    } catch (err) {
        chat(baseBot, `Couldn't chop ${woodBlock.name}: ${err.message}`, true);
    }
}


function pickUpNearbyItems(blockDrops) {
    const droppedItems = Object.values(baseBot.bot.entities).filter(entity => {
        return entity.displayName === 'Item' && blockDrops.includes(entity.metadata[8].itemId) ;  // Check if the item is wood
    });

    if (droppedItems.length > 0) {
        const nearestItem = droppedItems[0];  // Pick the first dropped item (you could add sorting if necessary)
        chat(baseBot, 'Found dropped wood. Moving to pick it up.');

        // Move the bot near the dropped item
        const goal = new GoalNear(nearestItem.position.x, nearestItem.position.y, nearestItem.position.z, 1);
        baseBot.bot.pathfinder.setGoal(goal);

        baseBot.bot.once('goal_reached', () => {
            chat(baseBot, 'Picked up the wood.');
            setTimeout(checkInventoryAndDecide, MS_BETWEEN_ACTIONS);
        });
    } else {
        chat(baseBot, 'No dropped items found.');
        setTimeout(checkInventoryAndDecide, MS_BETWEEN_ACTIONS);
    }
}

function checkInventoryAndDecide() {
    try {
        const woodTypes = ['oak_log', 'birch_log', 'spruce_log'];  // Define wood types to count
        let totalLogs = 0;

        // Count the number of wood logs in the bot's inventory
        baseBot.bot.inventory.items().forEach(item => {
            if (woodTypes.includes(item.name)) {
                totalLogs += item.count;
            }
        });

        chat(baseBot, `I have ${totalLogs} logs in my inventory.`, true);

        if (totalLogs >= LOG_THRESHOLD) {
            chat(baseBot, `I have reached the log limit of ${LOG_THRESHOLD}. I will stop or store logs.`, true);
            returnToBase(baseBot, () => {setTimeout(storeLogsInChest, MS_BETWEEN_ACTIONS)});
        } else {
            setTimeout(work, MS_BETWEEN_ACTIONS);  // Resume working after checking the inventory
        }
    } catch (err) {
        chat(baseBot, 'Error checking inventory.');

    }
}

async function storeLogsInChest() {
    try {
        // Find a nearby chest
        const chestBlock = baseBot.bot.findBlock({
            matching: block => block.name === 'chest',
            maxDistance: 100,  // Search within 32 blocks for a chest
        });

        if (chestBlock) {
            chat(baseBot, 'Found a chest. Moving to it.');

            // Move to the chest
            const goal = new GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 1);
            baseBot.bot.pathfinder.setGoal(goal);

            baseBot.bot.once('goal_reached', async () => {
                chat(baseBot, 'Reached the chest. Storing logs.');

                // Open the chest container
                const chest = await baseBot.bot.openContainer(chestBlock);

                // Deposit all wood logs into the chest
                const woodTypes = ['oak_log', 'birch_log', 'spruce_log'];
                for (const item of baseBot.bot.inventory.items()) {
                    if (woodTypes.includes(item.name)) {
                        await chest.deposit(item.type, null, item.count);
                        chat(baseBot, `Stored ${item.count} ${item.name} in the chest.`, true);
                    }
                }

                // Close the chest when done
                chest.close();
                chat(baseBot, 'Logs stored. Resuming work.');

                // Resume chopping wood
                setTimeout(work, MS_BETWEEN_ACTIONS);
            });
        } else {
            chat(baseBot, 'No chest found nearby. Continuing to chop wood.');
            setTimeout(work, MS_BETWEEN_ACTIONS);  // Continue working if no chest is found
        }
    } catch (err) {
        chat(baseBot, 'Error storing logs in chest.');
        logError(err);  // Log the error for debugging
        setTimeout(work, MS_BETWEEN_ACTIONS);  // Resume working after a delay
    }
}


const arguments = process.argv.slice(2);
const botName = arguments[0] || "LumberJack";

const baseBot = new BaseBot(botName, work, stop, LUBER_BASE_POSITION, WORKING_STATE);
