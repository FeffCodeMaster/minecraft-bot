const { BaseBot, returnToBase, chat } = require('../base/BaseBot.js');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const {LUBER_BASE_STATION_POSITION} = require('../constants/bases.js');


const AXE_THRESHOLD = 5;
const axeTypes = ['wooden_axe', 'stone_axe', 'iron_axe', 'golden_axe', 'diamond_axe'];

const IDLE = "IDLE";
const STARTWORKING = "STARTWORKING";
const WORKING = "WORKING";

let state = IDLE;
let workTimeout = null;
const workInterval = 45000;

async function work() {
    state = STARTWORKING;
    clearTimeout(workTimeout);
}

async function verifyAxeCount() {
    state = WORKING;

    chat(baseBot, 'Checking the chest for axes...');

    const chestBlock = findNearbyChest();

    if (!chestBlock) {
        chat(baseBot, 'No chest found nearby.');
        return;
    }

    const goal = new GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 1);
    baseBot.bot.pathfinder.setGoal(goal);

    baseBot.bot.once('goal_reached', async () => {
        const chest = await baseBot.bot.openContainer(chestBlock);
        let axeCount = chest.slots.filter(item => item && axeTypes.includes(item.name)).length;

        if (axeCount < AXE_THRESHOLD) {
            chat(baseBot, 'Not enough axes in the chest');
            chest.close();
            const axeType = whatTypeOfAxeCanICraft();


            if (axeType) {
                chat(baseBot, `I can craft ${axeType.name}`);
                craftAxes(axeType);

            } else {
                chat(baseBot, 'I cannot craft any axe.');
                withdrawMaterialsFromChest();
            }

        } else {
            chat(baseBot, 'Enough axes in the chest');
            chest.close();
            state = IDLE;
            workTimeout = setTimeout(work, workInterval);
        }
    })
}

function whatTypeOfAxeCanICraft() {
    const materials = baseBot.bot.inventory.items();

    if (!materials.some(item => item.name === 'stick' && item.count >= 2)) {
        return null;
    }

    if (materials.some(item => item.name === 'planks' && item.count >= 3) || materials.some(item => item.name === 'birch_planks' && item.count >= 3)) {
        return baseBot.bot.registry.itemsByName.wooden_axe;
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
            { name: 'planks', count: 3 }, // For wooden axes
            { name: 'birch_planks', count: 3 }, // For wooden axes
            { name: 'stick', count: 2 } // For all axes
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
          setTimeout(verifyAxeCount, workInterval);
    });

  }

async function craftAxes(axeType) {
    chat(baseBot, 'Lets craft an axe');

    const craftingTable = findNearbyCraftingTable();

    if (!craftingTable) {
        chat(baseBot, 'No crafting table found nearby.');
        return;
    }

    const goal = new GoalNear(craftingTable.position.x, craftingTable.position.y, craftingTable.position.z, 1);
    baseBot.bot.pathfinder.setGoal(goal);

    baseBot.bot.once('goal_reached', async () => {
        const recipe = baseBot.bot.recipesFor(axeType.id, null, 1, craftingTable)[0];

        if (recipe) {
            chat(baseBot, `Crafting ${axeType.name}(s)...`, true);
            try {
                await baseBot.bot.craft(recipe, 1, craftingTable);
                chat(baseBot, `Successfully crafted ${axeType.name}(s).`);
                const axeInInventory = verifyIfAnyAxeIsInInventory();

                if (axeInInventory) {
                    chat(baseBot, `I have ${axeInInventory.count} ${axeInInventory.name} in my inventory`);
                    depositAxeInChest();
                } else {
                    chat(baseBot, 'No axe in my inventory');
                }
            } catch (err) {
                chat(baseBot, `Failed to craft ${axeType.name}: ${err.message}`);
            }
        } else {
            chat(baseBot, `No recipe available for ${axeType.name}.`);
        }
    })
}

function verifyIfAnyAxeIsInInventory() {
    const materials = baseBot.bot.inventory.items();

    if (materials.some(item => item.name === 'wooden_axe' && item.count >= 1)) {
        return true;
    }

    return false;
}

function depositAxeInChest() {
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
            if (axeTypes.includes(item.name)) {
                await chest.deposit(item.type, null, item.count);
                chat(baseBot, `Stored ${item.count} ${item.name} in the chest.`);
            }
        }

        chest.close();
        setTimeout(verifyAxeCount, workInterval);
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
const botName = arguments[0] || "CraftmanLumber";

const baseBot = new BaseBot(botName, work, stop, LUBER_BASE_STATION_POSITION, true);

baseBot.bot.on('physicTick', () => {
    if (state === STARTWORKING) {
        verifyAxeCount();
    }
})
