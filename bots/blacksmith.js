const { BaseBot, returnToBase, chat, } = require('../base/BaseBot.js');
const { CRAFTING_BASE_POSITION, LUMBER_BASE_STATION_POSITION, MINE_BASE_STATION_POSITION } = require('../constants/bases.js');
const { pathfinder, Movements, goals: { GoalNear, GoalFollow } } = require('mineflayer-pathfinder');

const { moveToPosition, findBlockAndGoToBlock } = require('../helpers/findBlock.js');

const pickaxeTypes = ['stone_pickaxe',];
const swordTypes = ['stone_sword'];
const shovelTypes = ['stone_shovel'];
const axeTypes = ['stone_axe'];

const allCraftingTypes = [...pickaxeTypes, ...swordTypes, ...shovelTypes, ...axeTypes];

const logsTypes = [
    "oak_log",
    "spruce_log",
    "birch_log",
    "jungle_log",
    "acacia_log",
    "dark_oak_log"
];

const planksTypes = [
    "oak_planks",
    "spruce_planks",
    "birch_planks",
    "jungle_planks",
    "acacia_planks",
    "dark_oak_planks"
];

const CRAFTING_INTERVAL = 60000;

const IDLE = "IDLE";

const CHECK_FOR_INGREDIENTS = "CHECK_FOR_INGREDIENTS";
const CHECKING_FOR_INGREDIENTS = "CHECKING_FOR_INGREDIENTS";

const PREPARE_CRAFTING = "PREPARE_CRAFTING";
const PREPARING_CRAFTING = "PREPARING_CRAFTING";

const CHECK_CRAFTING_ORDERS = "CHECK_CRAFTING_ORDERS";
const CHECKING_CRAFTING_ORDERS = "CHECKING_CRAFTING_ORDERS";

const DONE_CRAFTING = "DONE_CRAFTING";


let WORKING_STATE = IDLE;
let PREVIOUS_STATE = null;

let craftingOrders = [];

let timeoutId = null;

// BLACKSMITH MAKEING STONE PICKAXES, STONE SWORDS, STONE SHOVELS, STONE AXES. 

// CHECK FOR INGREDIENTS
// -- STICKS 
// ---- DO WE HAVE ENOUGH?
// ------ IF NOT, GO FIND SOME
// ------ IF NOT FOUND, GRAB SOME WOOD AND CRAFT SOME
// -- STONE
// ---- DO WE HAVE ENOUGH?
// ------ IF NOT, GO FIND SOME
// IF ALL INGREDIENTS ARE AVAILABLE, CRAFT THE ITEM
// --- IF CRAFTING IS SUCCESSFUL, PUT ITEM IN INVENTORY
// IF NOT ENOUGH INGREDIENTS, WAIT FOR THEM TO BE AVAILABLE

async function work() {
    WORKING_STATE = CHECK_FOR_INGREDIENTS;
}

async function stop() {
    WORKING_STATE = IDLE;
    craftingOrders = [];
    clearTimeout(timeoutId);
}

async function checkForIngredients() {
    baseBot.bot.chat("Checking for ingredients...", true);
    WORKING_STATE = CHECKING_FOR_INGREDIENTS;

    let haveStone = false;
    let haveSticks = false;


    const sticks = checkInventoryForMaterial('stick');
    if (sticks) {
        baseBot.bot.chat(`I have ${sticks} sticks.`);
        haveSticks = true;
    } else {
        baseBot.bot.chat("I do not have enough sticks.");
        const doIHaveMaterialToMakeSticks = checkIfIHaveMaterialToMakeSticks();

        if (doIHaveMaterialToMakeSticks) {
            baseBot.bot.chat(`I have material to craft sticks or planks.`);
            await craftSticksOrPlanks();
        } else {
            const sticksOrMaterial = await findSticksOrMaterialToMakeIt();
            if (sticksOrMaterial) {
                if (sticksOrMaterial.name.includes('stick')) {
                    baseBot.bot.chat(`I found ${sticksOrMaterial.count} sticks at the lumber base.`);
                } else if (sticksOrMaterial.name.includes('planks')) {
                    baseBot.bot.chat(`I found ${sticksOrMaterial.count} planks at the lumber base.`);

                } else if (sticksOrMaterial.name.includes('log')) {
                    baseBot.bot.chat(`I found ${sticksOrMaterial.count} logs at the lumber base.`);
                }
                WORKING_STATE = CHECK_FOR_INGREDIENTS;
            } else {
                baseBot.bot.chat("I did not find any sticks or material to make sticks.");
            }
        }
    }

    const stone = checkInventoryForMaterial('cobblestone');
    if (stone) {
        baseBot.bot.chat(`I have ${stone} stone.`);
        haveStone = true;
    } else {
        baseBot.bot.chat("I do not have enough stone.");
        haveStone = await findStone();
    }

    if (haveSticks && haveStone) {
        returnToBase(baseBot, () => { WORKING_STATE = PREPARE_CRAFTING });
    } else {
        chat(baseBot, "I do not have enough ingredients to craft.");
        // should set the interval to check for ingredients again
        WORKING_STATE = DONE_CRAFTING;
    }
}

async function prepareCrafting() {
    WORKING_STATE = PREPARING_CRAFTING;
    baseBot.bot.chat("Preparing crafting...", true);

    await findBlockAndGoToBlock(baseBot, 'chest', 32, async (block) => {
        const chest = await baseBot.bot.openContainer(block);

        const pickaxeCount = chest.slots.filter(item => item && pickaxeTypes.includes(item.name)).length;
        if (pickaxeCount < 1) {
            craftingOrders.push('stone_pickaxe');
        }

        const swordCount = chest.slots.filter(item => item && swordTypes.includes(item.name)).length;
        if (swordCount < 1) {
            craftingOrders.push('stone_sword');
        }

        const shovelCount = chest.slots.filter(item => item && shovelTypes.includes(item.name)).length;
        if (shovelCount < 1) {
            craftingOrders.push('stone_shovel');
        }

        const axeCount = chest.slots.filter(item => item && axeTypes.includes(item.name)).length;
        if (axeCount < 1) {
            craftingOrders.push('stone_axe');
        }

        chest.close();
        WORKING_STATE = CHECK_CRAFTING_ORDERS;
    });
}

async function checkCraftingOrders() {
    WORKING_STATE = CHECKING_CRAFTING_ORDERS;
    baseBot.bot.chat("Checking crafting orders...", true);

    if (craftingOrders.length > 0) {
        baseBot.bot.chat(`I have ${craftingOrders.length} crafting orders.`, true);
        await findBlockAndGoToBlock(baseBot, 'crafting_table', 32, async (craftingTable) => {
            const order = craftingOrders.shift();
            const isCrafted = await craftItem(order, craftingTable);

           
            if (isCrafted) {
                await findBlockAndGoToBlock(baseBot, 'chest', 32, async (block) => {
                    const chest = await baseBot.bot.openContainer(block);
                    for (const item of baseBot.bot.inventory.items()) {
                        if (allCraftingTypes.includes(item.name)) {
                            await chest.deposit(item.type, null, item.count);
                            chat(baseBot, `Stored ${item.count} ${item.name} in the chest.`);
                        }
                    }
                    chest.close();

                    if (craftingOrders.length === 0) {
                        baseBot.bot.chat("No more crafting orders.");
                        WORKING_STATE = DONE_CRAFTING;
                    } else {
                        baseBot.bot.chat(`I have ${craftingOrders.length} crafting orders left.`);
                        setTimeout(() => {
                            WORKING_STATE = CHECK_CRAFTING_ORDERS;
                        }, 1000);
                    }
                });
            } else {
                chat(baseBot, `Failed to craft ${order}. Will try again later.`);
                craftingOrders.unshift(order);
            }
        });
    } else {
        baseBot.bot.chat("No crafting orders...");
        WORKING_STATE = DONE_CRAFTING;
    }
}

async function craftItem(item, craftingTable) {
    return new Promise(async (resolve, reject) => {
        try {
            baseBot.bot.chat(`Crafting ${item}...`);
            const itemType = baseBot.bot.registry.itemsByName[item];
            const recipe = baseBot.bot.recipesFor(itemType.id, null, 1, craftingTable)[0];

            await baseBot.bot.craft(recipe, 1, craftingTable);

            resolve(true);
        } catch (error) {
            baseBot.bot.chat(`Error crafting ${item}.`); 
            baseBot.bot.chat(error.message);
            resolve(false);
        }
    });
}

function checkInventoryForMaterial(material) {
    const materialItems = baseBot.bot.inventory.items().filter(item => item.name === material);
    let materialCount = 0;
    if (materialItems.length > 0) {
        for (const item of materialItems) {
            materialCount += item.count;
        }
    }
    return materialCount;
}

function checkIfIHaveMaterialToMakeSticks() {
    const planks = baseBot.bot.inventory.items().filter(item => planksTypes.includes(item.name) && item.count >= 2);
    const logs = baseBot.bot.inventory.items().filter(item => logsTypes.includes(item.name) && item.count >= 1);

    if (planks.length > 0) {
        return planks[0];
    } else if (logs.length > 0) {
        return logs[0];
    }

    return false;
}

async function craftSticksOrPlanks() {
    return new Promise(async (resolve, reject) => {
        try {
            const planks = baseBot.bot.inventory.items().filter(item => planksTypes.includes(item.name) && item.count >= 2);
            const logs = baseBot.bot.inventory.items().filter(item => logsTypes.includes(item.name) && item.count >= 1);

            if (planks.length > 0) {
                const stickRecipe = baseBot.bot.recipesFor(baseBot.bot.registry.itemsByName.stick.id, null, 1, null)[0];
                baseBot.bot.craft(stickRecipe, planks[0].count * 2);
            } else if (logs.length > 0) {
                const typeOfPlanks = logs[0].name.replace('log', 'planks');
                const plankType = Object.values(baseBot.bot.registry.itemsByName).find(item => item.name === typeOfPlanks);

                const plankRecipe = baseBot.bot.recipesFor(plankType.id, null, 1, null)[0];
                baseBot.bot.craft(plankRecipe, logs[0].count * 4, null);
            }

            resolve(true);
        } catch (error) {
            resolve(false);
        }
    })
}

async function findSticksOrMaterialToMakeIt() {
    baseBot.bot.chat("Finding sticks...");
    return new Promise(async (resolve, reject) => {
        try {
            await moveToPosition(baseBot, LUMBER_BASE_STATION_POSITION);
            await findBlockAndGoToBlock(baseBot, 'chest', 32, async (block) => {
                const chest = await baseBot.bot.openContainer(block);

                // check for sticks
                const sticks = chest.slots.find(item => item && item.name === 'stick');
                if (sticks) {
                    await chest.withdraw(sticks.type, null, sticks.count);
                    chest.close();
                    resolve(sticks);
                }

                // check for log
                const logs = chest.slots.find(item => item && item.name.includes('planks'));
                if (logs) {
                    await chest.withdraw(logs.type, null, logs.count);
                    chest.close();
                    resolve(logs);
                }

                // check for wood
                const wood = chest.slots.find(item => item && item.name.includes('log'));
                if (wood) {
                    await chest.withdraw(wood.type, null, wood.count);
                    chest.close();
                    resolve(wood);
                }

                resolve(false);
            })
        } catch (error) {
            baseBot.bot.chat("Error finding sticks.");
            resolve(false);
        }
    })
}

async function findStone() {
    baseBot.bot.chat("Finding stone...");
    return new Promise(async (resolve, reject) => {
        try {
            await moveToPosition(baseBot, MINE_BASE_STATION_POSITION);
            await findBlockAndGoToBlock(baseBot, 'chest', 32, async (block) => {
                const chest = await baseBot.bot.openContainer(block);

                const cobblestone = chest.slots.find(item => item && item.name === 'cobblestone');
                if (cobblestone) {
                    await chest.withdraw(cobblestone.type, null, cobblestone.count);
                    chest.close();
                    resolve(cobblestone);
                }
            })
        } catch (error) {
            resolve(false);
        }
    })
}


const arguments = process.argv.slice(2);
const botName = arguments[0] || "Blacksmith";

const baseBot = new BaseBot(botName, work, stop, CRAFTING_BASE_POSITION, WORKING_STATE);

baseBot.bot.on('physicTick', () => {
    if (PREVIOUS_STATE !== WORKING_STATE) {
        PREVIOUS_STATE = WORKING_STATE;

        if (WORKING_STATE === CHECK_FOR_INGREDIENTS) {
            checkForIngredients();
        }
        else if (WORKING_STATE === PREPARE_CRAFTING) {
            prepareCrafting();
        }
        else if (WORKING_STATE === CHECK_CRAFTING_ORDERS) {
            checkCraftingOrders();
        }
        else if (WORKING_STATE === DONE_CRAFTING) {
            setTimeout(() => {
                WORKING_STATE = CHECK_FOR_INGREDIENTS;
            }, CRAFTING_INTERVAL);
        }
    }
})

baseBot.bot.on('chat', (username, message) => {

});