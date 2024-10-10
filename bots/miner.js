const { BaseBot, returnToBase, chat } = require('../base/BaseBot.js');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const { MINE_BASE_POSITION } = require('../constants/bases.js');
const { pickaxeTypes } = require('../constants/tools.js');
const { findBlockAndGoToBlock, findAnyOfAndGoToBlock, goToBlock } = require('../helpers/findBlock.js');
const { hasItemInInventory, equipItem } = require('../helpers/inventory.js');


const STONE_THRESHOLD = 64;
const MAX_REACH_HEIGHT = 4;
const MAX_DISTANCE_TO_CHOP = 5;
const MS_BETWEEN_ACTIONS = 1550;

const IDLE = "IDLE";
const STARTWORKING = "STARTWORKING";
const GETTING_BACK_TO_POSITION = "GETTING_BACK_TO_POSITION";
const WORKING = "WORKING";
const ignoredBlocks = [];
let maxDistanceToMine = 1;
let miningPosition = null;

let state = IDLE;
let timeout = null;

async function work() {
    state = STARTWORKING
}

async function verifyEquippedPickaxe() {
    state = WORKING;

    if (!hasAxeEquipped()) {
        if (hasItemInInventory(baseBot, 'stone_pickaxe')) {
            equipItem(baseBot, 'stone_pickaxe');
            setTimeout(verifyEquippedPickaxe, MS_BETWEEN_ACTIONS);
        } else {
            chat(baseBot, 'No pickaxe found in inventory to equip.');
            await findPickaxeInChest();
            setTimeout(verifyEquippedPickaxe, MS_BETWEEN_ACTIONS);
        }
    } else {
        chat(baseBot, 'I am ready to work.');
        setTimeout(startMining, MS_BETWEEN_ACTIONS);
    }
}

async function stop() {
    state = IDLE;
    clearTimeout(timeout);
}

function hasAxeEquipped() {
    const heldItem = baseBot.bot.heldItem;
    if (heldItem) {
        chat(baseBot, `Currently holding: ${heldItem.name}`);
    } else {
        chat(baseBot, 'Not holding any item.');
    }

    return heldItem && pickaxeTypes.includes(heldItem.name);
}

async function findPickaxeInChest() {
    chat(baseBot, 'Looking for a chest with a pickaxe to equip.');
    findBlockAndGoToBlock(baseBot, 'chest', 32, async (block) => {
        const chest = await baseBot.bot.openContainer(block);
        const pickaxe = chest.slots.find(item => item && pickaxeTypes.includes(item.name));
        if (pickaxe) {
            await chest.withdraw(pickaxe.type, null, pickaxe.count);
            chat(baseBot, `Found a pickaxe (${pickaxe.name}). Moving it to inventory.`, true);
            chest.close();
            return pickaxe;
        }
        return null;
    })
}

async function startMining() {
    const blockNames = [
        'stone', 
        'cobblestone', 
        'granite', 
        'diorite', 
        'andesite', 
        'deepslate', 
        'tuff', 
        'gravel', 
        'basalt', 
        'blackstone'
    ];

    const block = baseBot.bot.findBlock({
        matching: block => {
            return blockNames.includes(block.name) && !isIgnoredBlock(block);
        },
        maxDistance: maxDistanceToMine,
    });

    if (block) {
        if (block.position.y < MINE_BASE_POSITION.y && block.position.y >= MINE_BASE_POSITION.y - MAX_REACH_HEIGHT) {
            chat(baseBot, 'Ignoring block and try to find another.');
            ignoredBlocks.push({
                x: block.position.x,
                y: block.position.y,
                z: block.position.z,
            });

            setTimeout(startMining, MS_BETWEEN_ACTIONS / 2);
            return;
        } else {
            chat(baseBot, 'The block is above me.');
            const goal = new GoalNear(block.position.x, block.position.y, block.position.z, 2);
            baseBot.bot.pathfinder.setGoal(goal);

            baseBot.bot.once('goal_reached', async () => {
                chat(baseBot, 'I am at the block.');
                setTimeout(() => mineBlock(block), MS_BETWEEN_ACTIONS);
            })
        }
    } else {
        chat(baseBot, 'Did not find a block to mine.');
        maxDistanceToMine += 0.5;
        chat(baseBot, `Increasing searching distnance to (${maxDistanceToMine})`);
        setTimeout(startMining, MS_BETWEEN_ACTIONS);

    }
}

function isIgnoredBlock(block) {
    if (!block || !block.position) return false;
    return ignoredBlocks.some(ignoredBlock => {
        return ignoredBlock.x === block.position.x &&
            ignoredBlock.y === block.position.y &&
            ignoredBlock.z === block.position.z;
    });
}



async function mineBlock(block) {
    if (hasItemInInventory(baseBot, 'stone_pickaxe')) {
        equipItem(baseBot, 'stone_pickaxe');
    }

    if (block) {
        await baseBot.bot.dig(block);
        chat(baseBot, `Finished mining ${block.name}`);

        setTimeout(() => { pickUpNearbyItems(block.drops) }, MS_BETWEEN_ACTIONS);
    } else {
        chat(baseBot, 'No block to mine.');
        stop();
    }
}

function pickUpNearbyItems(blockDrops) {
    const droppedItems = Object.values(baseBot.bot.entities).filter(entity => {
        return entity.displayName === 'Item' && blockDrops.includes(entity.metadata[8].itemId) ;  // Check if the item is wood
    });

    if (droppedItems.length > 0) {
        const nearestItem = droppedItems[droppedItems.length - 1];  // Pick the first dropped item (you could add sorting if necessary)
        chat(baseBot, 'Found dropped stone. Moving to pick it up.');

        // Move the bot near the dropped item
        const goal = new GoalNear(nearestItem.position.x, nearestItem.position.y, nearestItem.position.z, 1);
        baseBot.bot.pathfinder.setGoal(goal);

        baseBot.bot.once('goal_reached', () => {
            chat(baseBot, 'Picked up the stone.');
            setTimeout(checkInventoryAndDecide, MS_BETWEEN_ACTIONS);
        });
    } else {
        chat(baseBot, 'No dropped items found.');
        setTimeout(checkInventoryAndDecide, MS_BETWEEN_ACTIONS);
    }
}

function checkInventoryAndDecide() {
    try {
        const stoneTypes = [
            'stone', 
            'cobblestone', 
            'granite', 
            'diorite', 
            'andesite', 
            'deepslate', 
            'tuff', 
            'gravel', 
            'basalt', 
            'blackstone'
        ];  // Define wood types to count
        let totalLogs = 0;

        // Count the number of wood logs in the bot's inventory
        baseBot.bot.inventory.items().forEach(item => {
            if (stoneTypes.includes(item.name)) {
                totalLogs += item.count;
            }
        });

        chat(baseBot, `I have ${totalLogs} stones in my inventory.`, true);

        if (totalLogs >= STONE_THRESHOLD) {
            chat(baseBot, `I have reached the stone limit of ${STONE_THRESHOLD}. I will stop or store stone.`, true);
            miningPosition = {
                x: baseBot.bot.entity.position.x,
                y: baseBot.bot.entity.position.y,
                z: baseBot.bot.entity.position.z,
            };
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
                chat(baseBot, 'Reached the chest. Storing stones.');

                // Open the chest container
                const chest = await baseBot.bot.openContainer(chestBlock);

                // Deposit all wood logs into the chest
                const stoneTypes = [
                    'stone', 
                    'cobblestone', 
                    'granite', 
                    'diorite', 
                    'andesite', 
                    'deepslate', 
                    'tuff', 
                    'gravel', 
                    'basalt', 
                    'blackstone'
                ];  
                for (const item of baseBot.bot.inventory.items()) {
                    if (stoneTypes.includes(item.name)) {
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
const botName = arguments[0] || "Miner";

const baseBot = new BaseBot(botName, work, stop, MINE_BASE_POSITION);


baseBot.bot.on('physicTick', () => {
    if (state === STARTWORKING) {
        if (miningPosition) {
            state = GETTING_BACK_TO_POSITION;
            const goal = new GoalNear(miningPosition.x, miningPosition.y, miningPosition.z, 1);
            baseBot.bot.pathfinder.setGoal(goal);

            baseBot.bot.once('goal_reached', () => {
                miningPosition = null;
                verifyEquippedPickaxe();
            });
        } else {
            verifyEquippedPickaxe();
        }
    }
})