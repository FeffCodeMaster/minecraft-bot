const { BaseBot, returnToBase, chat, BASE_BOT_STATUS_IDLE} = require('../base/BaseBot.js');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const { MINE_BASE_POSITION } = require('../constants/bases.js');
const { pickaxeTypes } = require('../constants/tools.js');
const { findBlockAndGoToBlock, findAnyOfAndGoToBlock, goToBlock } = require('../helpers/findBlock.js');
const { hasItemInInventory, equipItem } = require('../helpers/inventory.js');


const STONE_THRESHOLD = 64;
const MAX_REACH_HEIGHT = 4;
const MAX_DISTANCE_TO_CHOP = 5;
const MS_BETWEEN_ACTIONS = 1250;

const IDLE = "IDLE";
const STARTWORKING = "STARTWORKING";
const GETTING_BACK_TO_POSITION = "GETTING_BACK_TO_POSITION";
const WORKING = "WORKING";

const STONE_TYPES = [
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


const ignoredBlocks = [];
let maxDistanceToMine = 1;
let miningPosition = null;

let WORKER_STATE = IDLE;
let timeout = null;

async function work() {
    if(baseBot.baseBotStatus === BASE_BOT_STATUS_IDLE) {
        WORKER_STATE = STARTWORKING
    }
}

async function stop() {
    WORKER_STATE = IDLE;
    clearTimeout(timeout);
}

async function verifyEquippedPickaxe() {
    if (WORKER_STATE === IDLE) return;

    WORKER_STATE = WORKING;
    const foundPickaxe = await hasAxeEquipped();
   
    if (!foundPickaxe) {
        if (hasItemInInventory(baseBot, 'stone_pickaxe')) {
            equipItem(baseBot, 'stone_pickaxe');
            timeout = setTimeout(verifyEquippedPickaxe, MS_BETWEEN_ACTIONS);
            return;
        } else {
            chat(baseBot, 'No pickaxe found in inventory to equip.');
            findPickaxeInChest();
            return;
        }
    } else {
        chat(baseBot, 'I am ready to work.');
        startMining();
    }
}

async function hasAxeEquipped() {
    const heldItem = await baseBot.bot.heldItem;
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
            verifyEquippedPickaxe();
            return pickaxe;
        }
        verifyEquippedPickaxe();
        return null;
    })
}

async function startMining() {
    const block = baseBot.bot.findBlock({
        matching: block => {
            return STONE_TYPES.includes(block.name) && !isIgnoredBlock(block);
        },
        maxDistance: maxDistanceToMine,
    });

    if (block) {
        if (block.position.y < MINE_BASE_POSITION.y && block.position.y >= MINE_BASE_POSITION.y - MAX_REACH_HEIGHT) {
            ignoredBlocks.push({
                x: block.position.x,
                y: block.position.y,
                z: block.position.z,
            });
            startMining(); 
            return;
        } else {
            const goal = new GoalNear(block.position.x, block.position.y, block.position.z, 2);
            baseBot.bot.pathfinder.setGoal(goal);

            baseBot.bot.once('goal_reached', async () => {
                mineBlock(block);
                return;
            })
        }
    } else {
        maxDistanceToMine += 0.5;
        chat(baseBot, `Increasing searching distnance to (${maxDistanceToMine})`);
        startMining();
        return;
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

        pickUpNearbyItems(block.drops)
    } else {
        chat(baseBot, 'No block to mine.');
        stop();
    }
}

async function pickUpNearbyItems(blockDrops) {
    const droppedItems = Object.values(baseBot.bot.entities).filter(entity => {
        return entity.displayName === 'Item' && blockDrops.includes(entity.metadata[8].itemId) ;  // Check if the item is wood
    });

    if (droppedItems.length > 0) {
        const nearestItem = droppedItems[droppedItems.length - 1];  // Pick the first dropped item (you could add sorting if necessary)
        chat(baseBot, 'Found dropped stone. Moving to pick it up.');

        // Move the bot near the dropped item
        const goal = new GoalNear(nearestItem.position.x, nearestItem.position.y, nearestItem.position.z, 1);
        baseBot.bot.pathfinder.setGoal(goal);

        baseBot.bot.once('goal_reached', async () => {
            chat(baseBot, 'Picked up items.');
          checkInventoryAndDecide();
        });
    } else {
        chat(baseBot, 'No dropped items found.');
        checkInventoryAndDecide();
    }
}

async function checkInventoryAndDecide() {
    try {
       
        let totalStones = 0;
        baseBot.bot.inventory.items().forEach(item => {
            if (STONE_TYPES.includes(item.name)) {
                totalStones += item.count;
            }
        });

        chat(baseBot, `I have ${totalStones} stones in my inventory.`, true);

        if (totalStones >= STONE_THRESHOLD) {
            chat(baseBot, `I have reached the stone limit of ${STONE_THRESHOLD}. I will retun to base.`, true);
            miningPosition = {
                x: baseBot.bot.entity.position.x,
                y: baseBot.bot.entity.position.y,
                z: baseBot.bot.entity.position.z,
            };
            returnToBase(baseBot, () => { timeout = setTimeout(storeLogsInChest, MS_BETWEEN_ACTIONS)});
            return;
        } else {
            chat(baseBot, 'I have not reached the stone limit. Continuing to mine.');
            verifyEquippedPickaxe();
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
            maxDistance: 100, 
        });

        if (chestBlock) {
            chat(baseBot, 'Found a chest. Moving to it.');

            // Move to the chest
            const goal = new GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 1);
            baseBot.bot.pathfinder.setGoal(goal);

            baseBot.bot.once('goal_reached', async () => {
                chat(baseBot, 'Reached the chest. Storing stones.');
            
                const chest = await baseBot.bot.openContainer(chestBlock);
       
                for (const item of baseBot.bot.inventory.items()) {
                    if (STONE_TYPES.includes(item.name)) {
                        await chest.deposit(item.type, null, item.count);
                        chat(baseBot, `Stored ${item.count} ${item.name} in the chest.`, true);
                    }
                }

                chest.close();
                verifyEquippedPickaxe();
            });
        } else {
            chat(baseBot, 'No chest found nearby. Continuing to mining stone.');
            verifyEquippedPickaxe();
        }
    } catch (err) {
        await chat(baseBot, 'Error storing logs in chest.');
        logError(err);  // Log the error for debugging
        verifyEquippedPickaxe();
    }
}

const arguments = process.argv.slice(2);
const botName = arguments[0] || "Miner";

const baseBot = new BaseBot(botName, work, stop, MINE_BASE_POSITION);


baseBot.bot.on('physicTick', () => {
    if (WORKER_STATE === STARTWORKING) {
        if (miningPosition) {
            WORKER_STATE = GETTING_BACK_TO_POSITION;
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