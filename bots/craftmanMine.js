const { BaseBot, returnToBase, chat } = require('../base/BaseBot.js');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const {MINE_BASE_STATION_POSITION} = require('../constants/bases.js');


const PICKAXE_THRESHOLD = 5;
const pickaxeTypes = ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'golden_pickaxe', 'diamond_pickaxe'];

const IDLE = "IDLE";
const STARTWORKING = "STARTWORKING";
const WORKING = "WORKING";

let state = IDLE;
let workTimeout = null;
const workInterval = 30000;

async function work() {
    state = STARTWORKING;
    clearTimeout(workTimeout);
}

async function verifyPickaxeCount() {
    state = WORKING;

    chat(baseBot, 'Checking the chest for pickaxes...');

    const chestBlock = findNearbyChest();

    if (!chestBlock) {
        chat(baseBot, 'No chest found nearby.');
        return;
    }

    const goal = new GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 1);
    baseBot.bot.pathfinder.setGoal(goal);

    baseBot.bot.once('goal_reached', async () => {
        const chest = await baseBot.bot.openContainer(chestBlock);
        let pickaxeCount = chest.slots.filter(item => item && pickaxeTypes.includes(item.name)).length;

        if (pickaxeCount < PICKAXE_THRESHOLD) {
            chat(baseBot, 'Not enough pickaxes in the chest');
            chest.close();
            const pickaxeType = whatTypeOfPickaxeCanICraft();


            if (pickaxeType) {
                chat(baseBot, `I can craft ${pickaxeType.name}`);
                craftPickaxes(pickaxeType);

            } else {
                chat(baseBot, 'I cannot craft any axe.');
                withdrawMaterialsFromChest();
            }

        } else {
            chat(baseBot, 'Enough pickaxes in the chest');
            chest.close();
            state = IDLE;
            workTimeout = setTimeout(work, workInterval);
        }
    })
}

function whatTypeOfPickaxeCanICraft() {
    const materials = baseBot.bot.inventory.items();

    if (!materials.some(item => item.name === 'stick' && item.count >= 2)) {
        return null;
    }

    if (materials.some(item => item.name === 'planks' && item.count >= 3) || materials.some(item => item.name === 'birch_planks' && item.count >= 3)) {
        return baseBot.bot.registry.itemsByName.wooden_pickaxe;
    }

    if (materials.some(item => item.name === 'cobblestone' && item.count >= 3)) {
        return baseBot.bot.registry.itemsByName.stone_pickaxe;
    }

    return null;
}

async function withdrawMaterialsFromChest() {
    const chestBlock = findNearbyChest();

    if (!chestBlock) {
        chat(baseBot, 'No chest found nearby.');
        return;
    }

    const goal = new GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 1);
    baseBot.bot.pathfinder.setGoal(goal);

    baseBot.bot.once('goal_reached', async () => {
        const chest = await baseBot.bot.openContainer(chestBlock);

        const materialsNeeded = [
            { name: 'cobblestone', count: 3 }, // For stone pickaxes
            { name: 'stick', count: 2 } // For all pickaxes
          ];
        
          for (const material of materialsNeeded) {
            const chestItem = chest.slots.find(item => item && item.name === material.name);
        
            if (chestItem && chestItem.count >= material.count) {
              baseBot.bot.chat(`Withdrawing ${material.count} ${material.name}(s) from the chest.`);
              try {
                await chest.withdraw(chestItem.type, null, material.count);
                baseBot.bot.chat(`Successfully withdrew ${material.count} ${material.name}(s).`);
              } catch (err) {
                baseBot.bot.chat(`Failed to withdraw ${material.name}: ${err.message}`);
              }
            } else {
              baseBot.bot.chat(`Not enough ${material.name} in the chest.`);
            }
        }
        chest.close();
        workTimeout = setTimeout(verifyPickaxeCount, workInterval);
    });

  }

async function craftPickaxes(pickaxeType) {
    chat(baseBot, 'Lets craft an pickaxe');

    const craftingTable = findNearbyCraftingTable();

    if (!craftingTable) {
        chat(baseBot, 'No crafting table found nearby.');
        return;
    }

    const goal = new GoalNear(craftingTable.position.x, craftingTable.position.y, craftingTable.position.z, 1);
    baseBot.bot.pathfinder.setGoal(goal);

    baseBot.bot.once('goal_reached', async () => {
        const recipe = baseBot.bot.recipesFor(pickaxeType.id, null, 1, craftingTable)[0];

        if (recipe) {
            chat(baseBot, `Crafting ${pickaxeType.name}(s)...`, true);
            try {
                await baseBot.bot.craft(recipe, 1, craftingTable);
                chat(baseBot, `Successfully crafted ${pickaxeType.name}(s).`);
                const axeInInventory = verifyIfAnyPickaxeIsInInventory();

                if (axeInInventory) {
                    chat(baseBot, `I have ${axeInInventory.count} ${axeInInventory.name} in my inventory`);
                    depositPickaxeInChest();
                } else {
                    chat(baseBot, 'No axe in my inventory');
                }
            } catch (err) {
                chat(baseBot, `Failed to craft ${pickaxeType.name}: ${err.message}`);
            }
        } else {
            chat(baseBot, `No recipe available for ${pickaxeType.name}.`);
        }
    })
}

function verifyIfAnyPickaxeIsInInventory() {
    const materials = baseBot.bot.inventory.items();

    if (materials.some(item => pickaxeTypes.includes(item.name) && item.count >= 1)) {
        return true;
    }

    return false;
}

function depositPickaxeInChest() {
    const chestBlock = findNearbyChest();

    if (!chestBlock) {
        chat(baseBot, 'No chest found nearby.');
        return;
    }

    const goal = new GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 1);
    baseBot.bot.pathfinder.setGoal(goal);

    baseBot.bot.once('goal_reached', async () => {
        chat(baseBot, 'Reached the chest. Storing logs.');

        // Open the chest container
        const chest = await baseBot.bot.openContainer(chestBlock);
        for (const item of baseBot.bot.inventory.items()) {
            if (pickaxeTypes.includes(item.name)) {
                await chest.deposit(item.type, null, item.count);
                chat(baseBot, `Stored ${item.count} ${item.name} in the chest.`);
            }
        }

        chest.close();
        workTimeout = setTimeout(verifyPickaxeCount, workInterval);
    })
}

async function stop() {
    state = IDLE;
    clearTimeout(workTimeout);
}

function findNearbyChest() {
    return baseBot.bot.findBlock({
        matching: block => block.name === 'chest',
        maxDistance: 32,
    });
}

function findNearbyCraftingTable() {
    return baseBot.bot.findBlock({
        matching: block => block.name === 'crafting_table',
        maxDistance: 32,
    });
}

const arguments = process.argv.slice(2);
const botName = arguments[0] || "CraftmanMine";

const baseBot = new BaseBot(botName, work, stop, MINE_BASE_STATION_POSITION, state,true);

baseBot.bot.on('physicTick', () => {
    if (state === STARTWORKING) {
        verifyPickaxeCount();
    }
})
