const { BaseBot } = require('../base/BaseBot.js');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');

// Define a threshold for the number of logs
const LOG_THRESHOLD = 64;
const MAX_REACH_HEIGHT = 4;
const MS_BETWEEN_ACTIONS = 1250;
const ignoredBlocks = [];  // Array to store ignored blockst

// Work function for LumberJack to start chopping wood
async function work() {
    if (!hasAxeEquipped()) {
        baseBot.bot.chat('Looking for an axe before starting work.');

        // Look for the axe in a chest and equip it
        const foundAxe = await findAndEquipAxeInChest();

        if (!foundAxe) {
            baseBot.bot.chat('No axe found in the chest. Stopping work.');
        }

        setTimeout(findingBlockToChop, MS_BETWEEN_ACTIONS);

    } else {
        baseBot.bot.chat('Searching for a block to chop.');
        setTimeout(findingBlockToChop, MS_BETWEEN_ACTIONS);
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
            baseBot.bot.chat(`Ignoring ${woodBlock.name} as it is too high to reach.`);
            ignoredBlocks.push({
                x: woodBlock.position.x,
                y: woodBlock.position.y,
                z: woodBlock.position.z,
            });
            setTimeout(findingBlockToChop, MS_BETWEEN_ACTIONS);  // Search for another block
        } else {
            baseBot.bot.chat('Found reachable wood.');
            moveToBlockAndChop(woodBlock);
        }
    } else {
        baseBot.bot.chat('No wood nearby. I will rest now.');
        stop();
    }
}


// Function to find and equip an axe from the chest
async function findAndEquipAxeInChest() {
    baseBot.bot.chat('Looking for an axe in the chest.');
  
    try {
      // Find a nearby chest
      const chestBlock = baseBot.bot.findBlock({
        matching: block => block.name === 'chest',
        maxDistance: 32,  // Search within 32 blocks for a chest
      });
  
      if (chestBlock) {
        baseBot.bot.chat('Found a chest. Moving to it.');
        
        // Move to the chest
        const goal = new GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 1);
        baseBot.bot.pathfinder.setGoal(goal);
  
        return new Promise((resolve, reject) => {
          baseBot.bot.once('goal_reached', async () => {
            baseBot.bot.chat('Reached the chest. Checking for an axe.');
  
            // Open the chest container
            const chest = await baseBot.bot.openContainer(chestBlock);
  
            // Look for any axe in the chest
            const axeTypes = ['wooden_axe', 'stone_axe', 'iron_axe', 'golden_axe', 'diamond_axe'];
            const axeInChest = chest.slots.find(item => item && axeTypes.includes(item.name));
  
            if (axeInChest) {
              baseBot.bot.chat(`Found an axe (${axeInChest.name}). Moving it to inventory.`);
  
              try {
                // Transfer the axe to the bot's inventory
                await chest.withdraw(axeInChest.type, null, axeInChest.count);
                baseBot.bot.chat(`Successfully moved the axe to inventory.`);
                chest.close();
                
                // Now equip the axe from the inventory
                setTimeout(() => {
                    equipAxeFromInventory()
                    resolve(true);  
                }, MS_BETWEEN_ACTIONS);
              } catch (transferErr) {
                baseBot.bot.chat(`Failed to transfer axe to inventory: ${transferErr.message}`);
                chest.close();
                resolve(false);  // Failed to transfer
              }
            } else {
              baseBot.bot.chat('No axe found in the chest.');
              chest.close();
              resolve(false);  // No axe found
            }
          });
        });
      } else {
        baseBot.bot.chat('No chest found nearby.');
        return false;  // No chest found
      }
    } catch (err) {
      baseBot.bot.chat('Error while searching for an axe in the chest.');
      logError(err);
      return false;
    }
  }

  async function equipAxeFromInventory() {
    const axeTypes = ['wooden_axe', 'stone_axe', 'iron_axe', 'golden_axe', 'diamond_axe'];
  
    // Search for an axe in the bot's inventory
    const axeInInventory = baseBot.bot.inventory.items().find(item => axeTypes.includes(item.name));
  
    if (axeInInventory) {
      baseBot.bot.chat(`Found an axe (${axeInInventory.name}) in the inventory. Attempting to equip.`);
  
      try {
        await baseBot.bot.equip(axeInInventory, 'hand');  // Equip the axe in the hand
        baseBot.bot.chat('Successfully equipped the axe from inventory.');
      } catch (err) {
        baseBot.bot.chat(`Failed to equip axe from inventory: ${err.message}`);
      }
    } else {
      baseBot.bot.chat('No axe found in inventory to equip.');
    }
  }
  

// Function to check if the bot has an axe equipped
function hasAxeEquipped() {
    const axeTypes = ['wooden_axe', 'stone_axe', 'iron_axe', 'golden_axe', 'diamond_axe'];
    const heldItem = baseBot.bot.heldItem;
  
    // Debugging check to see if the bot actually has an item in hand
    if (heldItem) {
      baseBot.bot.chat(`Currently holding: ${heldItem.name}`);
    } else {
      baseBot.bot.chat('Not holding any item.');
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
    baseBot.bot.chat('Stopping work. Resting now.');
    baseBot.bot.stopDigging();
}

// Function to move the bot to the wood block and chop it
function moveToBlockAndChop(woodBlock) {
    const distance = baseBot.bot.entity.position.distanceTo(woodBlock.position);
    if (distance > 5) {
        baseBot.bot.chat('Moving closer to the wood block.');
        const goal = new GoalNear(woodBlock.position.x, woodBlock.position.y, woodBlock.position.z, MAX_REACH_HEIGHT); // Move within 1 block of wood
        baseBot.bot.pathfinder.setGoal(goal);

        baseBot.bot.once('goal_reached', () => {
            baseBot.bot.chat('Reached the wood block.');
            startChopping(woodBlock);
        });
    } else {
        startChopping(woodBlock);
    }

}

// Function to start chopping wood with error handling
async function startChopping(woodBlock) {
    if (!woodBlock) {
        baseBot.bot.chat('No valid wood block to chop.');
        return;
    }

    try {
        // Chop the wood asynchronously
        if (woodBlock.diggable) {
            await baseBot.bot.dig(woodBlock);
            baseBot.bot.chat(`Finished chopping wood`);
        }
        // After chopping, pick up the wood before resuming work

        setTimeout(pickUpNearbyItems, 1000);
    } catch (err) {
        baseBot.bot.chat(`Couldn't chop ${woodBlock.name}: ${err.message}`);
    }
}


function pickUpNearbyItems() {
    try {
        const droppedItems = Object.values(baseBot.bot.entities).filter(entity => {
            return entity.displayName === 'item' && entity.metadata[7].name.includes('log');  // Check if the item is wood
        });

        if (droppedItems.length > 0) {
            const nearestItem = droppedItems[0];  // Pick the first dropped item (you could add sorting if necessary)
            baseBot.bot.chat('Found dropped wood. Moving to pick it up.');

            // Move the bot near the dropped item
            const goal = new GoalNear(nearestItem.position.x, nearestItem.position.y, nearestItem.position.z, 1);
            baseBot.bot.pathfinder.setGoal(goal);

            baseBot.bot.once('goal_reached', () => {
                baseBot.bot.chat('Picked up the wood.');
                setTimeout(checkInventoryAndDecide, MS_BETWEEN_ACTIONS);
            });
        } else {
            baseBot.bot.chat('No dropped items found.');
            setTimeout(checkInventoryAndDecide, MS_BETWEEN_ACTIONS);
        }
    } catch (err) {
        baseBot.bot.chat('Error finding dropped items.');

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

        baseBot.bot.chat(`I have ${totalLogs} logs in my inventory.`);

        if (totalLogs >= LOG_THRESHOLD) {
            baseBot.bot.chat(`I have reached the log limit of ${LOG_THRESHOLD}. I will stop or store logs.`);
            storeLogsInChest();  // Example: Call a function to store the logs
        } else {
            setTimeout(work, MS_BETWEEN_ACTIONS);  // Resume working after checking the inventory
        }
    } catch (err) {
        baseBot.bot.chat('Error checking inventory.');

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
            baseBot.bot.chat('Found a chest. Moving to it.');

            // Move to the chest
            const goal = new GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 1);
            baseBot.bot.pathfinder.setGoal(goal);

            baseBot.bot.once('goal_reached', async () => {
                baseBot.bot.chat('Reached the chest. Storing logs.');

                // Open the chest container
                const chest = await baseBot.bot.openContainer(chestBlock);

                // Deposit all wood logs into the chest
                const woodTypes = ['oak_log', 'birch_log', 'spruce_log'];
                for (const item of baseBot.bot.inventory.items()) {
                    if (woodTypes.includes(item.name)) {
                        await chest.deposit(item.type, null, item.count);
                        baseBot.bot.chat(`Stored ${item.count} ${item.name} in the chest.`);
                    }
                }

                // Close the chest when done
                chest.close();
                baseBot.bot.chat('Logs stored. Resuming work.');

                // Resume chopping wood
                setTimeout(work, MS_BETWEEN_ACTIONS);
            });
        } else {
            baseBot.bot.chat('No chest found nearby. Continuing to chop wood.');
            setTimeout(work, MS_BETWEEN_ACTIONS);  // Continue working if no chest is found
        }
    } catch (err) {
        baseBot.bot.chat('Error storing logs in chest.');
        logError(err);  // Log the error for debugging
        setTimeout(work, MS_BETWEEN_ACTIONS);  // Resume working after a delay
    }
}


const arguments = process.argv.slice(2);
const botName = arguments[0] || "LumberJack";

const baseBot = new BaseBot(botName, work, stop);
