const { BaseBot, returnToBase, chat, } = require('../base/BaseBot.js');
const { FOOD_STATION_POSITION, MINE_BASE_STATION_POSITION } = require('../constants/bases.js');
const { pathfinder, Movements, goals: { GoalNear, GoalFollow } } = require('mineflayer-pathfinder');

const { moveToPosition, findBlockAndGoToBlock } = require('../helpers/findBlock.js');

const fuels = [
    'coal',
    'charcoal',
    'wood',
]; // Can add more fuel types if needed

const rawFoods = [
    'beef',        // Comes from cows
    'porkchop',    // Comes from pigs
    'chicken',     // Comes from chickens
    'mutton',      // Comes from sheep
    'rabbit',      // Comes from rabbits
    'cod',         // Comes from cod fish
    'salmon',      // Comes from salmon fish
    'potato'       // Can be baked
]

const cookedFoods = [
    'cooked_beef',     // Cooked version of raw beef (steak)
    'cooked_porkchop', // Cooked version of raw porkchop
    'cooked_chicken',  // Cooked version of raw chicken
    'cooked_mutton',   // Cooked version of raw mutton
    'cooked_rabbit',   // Cooked version of raw rabbit
    'cooked_cod',      // Cooked version of raw cod
    'cooked_salmon',   // Cooked version of raw salmon
    'baked_potato'     // Cooked version of raw potato
]


const IDLE = "IDLE";
const CHECK_FURNACE = "CHECK_FURNACE";
const CHECKING_FURNACE = "CHECKING_FURNACE";

const PREPARE_TO_COOK = "PREPARE_TO_COOK";
const PREPARING_TO_COOK = "PREPARING_TO_COOK";

const FIND_FUEL = "FIND_FUEL";
const FINDING_FUEL = "FINDING_FUEL";

const CHECK_INGREDIENTS = "CHECK_INGREDIENTS";
const CHECKING_INGREDIENTS = "CHECKING_INGREDIENTS";

const STARTING_COOKING = "STARTING_COOKING";
const STARTED_COOKING = "STARTED_COOKING";

const WAITING_FOR_COOKING = "WAITING_FOR_COOKING";

const CHECK_COOKING_INTERVAL = 30000;

let WORKING_STATE = IDLE;
let PREVIOUS_STATE = null;

let timeout = null;

async function work() {
    WORKING_STATE = CHECK_FURNACE;
}

async function stop() {
    WORKING_STATE = IDLE;
    baseBot.bot.pathfinder.setGoal(null);
    clearTimeout(timeout);
}

async function checkFurnaceProgress() {
    WORKING_STATE = CHECKING_FURNACE;
    chat(baseBot, 'Checking furnace progress...', true);
    try {
        const result = await checkingFurnaceProgress();
        if (result) {
            chat(baseBot, `Something is cooking in the furnace.`);
            WORKING_STATE = WAITING_FOR_COOKING;
        } else {    
            chat(baseBot, `No cooking in the furnace.`);
            const checkIfAnyCookedFood = await checkIfAnyCookedFoodInInventory();
            if (checkIfAnyCookedFood) {
                chat(baseBot, 'Found cooked food in my inventory.');
                await depositCookedFoodInChest();
            } else {
                chat(baseBot, 'No cooked food found in my inventory.');
            }

            WORKING_STATE = PREPARE_TO_COOK;
        }
    } catch (error) {
        chat(baseBot, 'Error checking furnace progress.');
        chat(baseBot, error.message);
        WORKING_STATE = IDLE;
    }
}

async function prepareToCook() {
    WORKING_STATE = PREPARING_TO_COOK;
    chat(baseBot, 'Preparing the cooking...', true);
    try {
        const furnaceReady = await checkFurnaceReady();
        if (!furnaceReady) {
            chat(baseBot, 'No furnace found or no fuel in the furnace.');
            WORKING_STATE = FIND_FUEL;
            return;
        } else {
            chat(baseBot, 'Furnace is ready.');
            WORKING_STATE = CHECK_INGREDIENTS;
        }
    } catch (error) {
        chat(baseBot, 'Error checking furnace.');
        chat(baseBot, error.message);
        WORKING_STATE = PREPARE_TO_COOK;
    }
}

async function checkIngredients() {
    WORKING_STATE = CHECKING_INGREDIENTS;
    chat(baseBot, 'Checking ingredients...', true);

    try {
        const inventoryIngredients = await checkInventoryForIngredients();
        if (inventoryIngredients.length > 0) {
            chat(baseBot, 'Found ingredients in my inventory.');
            WORKING_STATE = STARTING_COOKING;
        } else {
            chat(baseBot, 'No ingredients found in my inventory when checking ingredients.');
            const chestIngredients = await checkChestForIngredientsAndWidthdraw();
            if (chestIngredients) {
                chat(baseBot, 'Found ingredients in the chest.');
                WORKING_STATE = STARTING_COOKING;
                return;
            }
        }

        chat(baseBot, 'Nothing to cook right now...', true);
        WORKING_STATE = WAITING_FOR_COOKING;
    } catch (error) {
        chat(baseBot, 'Error checking ingredients.');
        chat(baseBot, error.message);
        WORKING_STATE = CHECK_INGREDIENTS;
    }
}

async function startCooking() {
    WORKING_STATE = STARTING_COOKING;
    chat(baseBot, 'Starting cooking...');
    try {
        const furnace = await putIngredientsInFurnace();
        if (furnace) {
            chat(baseBot, 'Ingredients added to the furnace.');
            WORKING_STATE = CHECK_FURNACE;
        } else {
            chat(baseBot, 'No ingredients found in my inventory when starting to cook.');c1
            WORKING_STATE = WAITING_FOR_COOKING;
        }
    } catch (error) {
        chat(baseBot, 'Error starting to cook.');
        chat(baseBot, error.message);
    }

}

async function checkingFurnaceProgress() {
    return new Promise(async (resolve, reject) => {
        try {
            await findBlockAndGoToBlock(baseBot, 'furnace', 10, async (block) => {
                const furnace = await baseBot.bot.openFurnace(block);
                const progress = furnace.progress;
                const output = furnace.outputItem();
                if (output) {
                    await furnace.takeOutput();
                    chat(baseBot, `Found ${output.count} ${output.name} in the furnace. Put in inventory.`);
                }

                chat(baseBot, `Furnace progress: ${progress}`);
                furnace.close();
                resolve(progress);
            })
        } catch (error) {
            chat(baseBot, 'Error checking furnace progress.');
            chat(baseBot, error.message);
            resolve(false);
        }
    });
}

async function checkIfAnyCookedFoodInInventory() {
    const inventory = baseBot.bot.inventory.items();
    const cookedFood = inventory.filter(item => cookedFoods.includes(item.name));
    return cookedFood.length > 0;
}

async function depositCookedFoodInChest() {
    return new Promise(async (resolve, reject) => {
        try {
            await findBlockAndGoToBlock(baseBot, 'chest', 32, async (block) => {
                const chest = await baseBot.bot.openContainer(block);
                for (const item of baseBot.bot.inventory.items()) {
                    if (cookedFoods.includes(item.name)) {
                        await chest.deposit(item.type, null, item.count);
                        chat(baseBot, `Stored ${item.count} ${item.name} in the chest.`, true);
                    }
                }
                chest.close();
                resolve(true);
            })
        } catch (error) {
            chat(baseBot, 'Error depositing cooked food in chest.');
            chat(baseBot, error.message);
            resolve(false);
        }
    });
}

async function checkFurnaceReady() {
    return new Promise(async (resolve, reject) => {
        try {
            const furnaceBlock = baseBot.bot.findBlock({
                matching: block => block.name === 'furnace',
                maxDistance: 10,
            });

            if (furnaceBlock) {
                chat(baseBot, 'Found a furnace. Moving to it.');

                const goal = new GoalNear(furnaceBlock.position.x, furnaceBlock.position.y, furnaceBlock.position.z, 1);
                baseBot.bot.pathfinder.setGoal(goal);

                chat(baseBot, 'Found a furnace. Opening it');
                const furnace = await baseBot.bot.openFurnace(furnaceBlock);

                let currentFuel = furnace.fuelItem();

                if (!currentFuel) {
                    chat(baseBot, 'No fuel in the furnace.');
                    const materials = baseBot.bot.inventory.items();
                    const fuel = materials.find(item => fuels.includes(item.name));

                    if (fuel) {
                        chat(baseBot, `Found ${fuel.count} ${fuel.name} in my inventory.`);
                        await furnace.putFuel(fuel.type, null, fuel.count);
                    } else {
                        chat(baseBot, 'No fuel found in my inventory.');
                    }
                }

                currentFuel = furnace.fuelItem();
                if (currentFuel) {  
                    chat(baseBot, `Furnace has ${currentFuel.count} ${currentFuel.name} fuel.`);
                }

                furnace.close();
                resolve(currentFuel);
            } else {
                chat(baseBot, 'No furnace found.');
                resolve(false);
            }
        } catch (error) {
            chat(baseBot, 'Error checking furnace.');
            chat(baseBot, error.message);
            reject(false);
        }
    });
}

async function findFuel() {
    WORKING_STATE = FINDING_FUEL;
    chat(baseBot, 'Finding fuel...');
    try {
        await moveToPosition(baseBot, MINE_BASE_STATION_POSITION);
        const fuelFound = await checkMiningStationForFuel();
        if (!fuelFound) {
            chat(baseBot, 'No fuel found in the mining station.');
        } else {
            chat(baseBot, 'Found fuel in the mining station.');
            returnToBase(baseBot, () => { WORKING_STATE = PREPARE_TO_COOK; });
        }
    } catch (error) {
        chat(baseBot, 'Error finding fuel.');
        chat(baseBot, error.message);
        WORKING_STATE = IDLE;
    }
}

async function checkMiningStationForFuel() {
    return new Promise(async (resolve, reject) => {
        try {
            await findBlockAndGoToBlock(baseBot, 'chest', 32, async (block) => {
                const chest = await baseBot.bot.openContainer(block);
                const fuel = chest.slots.find(item => item && fuels.includes(item.name));
                if (fuel) {
                    await chest.withdraw(fuel.type, null, fuel.count);
                    chat(baseBot, `Found ${fuel.count} ${fuel.name}.`, true);
                    chest.close();
                    resolve(true);
                } else {
                    chest.close();
                    resolve(false);
                }
            })
        } catch (error) {
            chat(baseBot, 'Error checking mining station for fuel.');
            chat(baseBot, error.message);
            resolve(false);
        }
    });
}

async function checkInventoryForIngredients() {
    return new Promise(async (resolve, reject) => {
        try {
            const materials = baseBot.bot.inventory.items();
            const ingredients = materials.filter(item => rawFoods.includes(item.name));
            resolve(ingredients);
        } catch (error) {
            chat(baseBot, 'Error checking inventory for ingredients.');
            chat(baseBot, error.message);
            resolve(false);
        }
    });
}

async function checkChestForIngredientsAndWidthdraw() {
    return new Promise(async (resolve, reject) => {
        try {
            await findBlockAndGoToBlock(baseBot, 'chest', 32, async (block) => {
                const chest = await baseBot.bot.openContainer(block);
                const ingredient = chest.slots.find(item => item && rawFoods.includes(item.name));
                if (ingredient) {
                    chat(baseBot, `Found ${ingredient.count} ${ingredient.name}.`, true);
                    await chest.withdraw(ingredient.type, null, ingredient.count);
                    chest.close();
                    resolve(true);
                } else {
                    chest.close();
                    resolve(false);
                }
            })
        } catch (error) {
            chat(baseBot, 'Error checking chest for ingredients.');
            chat(baseBot, error.message);
            resolve([]);
        }
    });
}

async function putIngredientsInFurnace() {
    return new Promise(async (resolve, reject) => {
        try {
            chat(baseBot, 'Starting to cook...');
            WORKING_STATE = STARTED_COOKING;

            await findBlockAndGoToBlock(baseBot, 'furnace', 5, async (furnaceBlock) => {
                const furnace = await baseBot.bot.openFurnace(furnaceBlock);
                const inventoryIngredients = baseBot.bot.inventory.items();
                const ingredients = inventoryIngredients.filter(item => rawFoods.includes(item.name));
                if (ingredients.length > 0) {
                    const ingredient = ingredients[0];
                    await furnace.putInput(ingredient.type, null, ingredient.count);
                    chat(baseBot, `Added ${ingredient.count} ${ingredient.name} to the furnace.`, true);
                    resolve(furnace);
                } else {
                    chat(baseBot, 'No ingredients found in my inventory when adding ingredients to the furnace.');
                    resolve(false);
                }
                furnace.close();
            })
        } catch (error) {
            chat(baseBot, 'Error starting to cook.');
            chat(baseBot, error.message);
            reject(false);
        }
    });

}

const arguments = process.argv.slice(2);
const botName = arguments[0] || "Chef";
const baseBot = new BaseBot(botName, work, stop, FOOD_STATION_POSITION, WORKING_STATE);

baseBot.bot.on('physicTick', () => {
    if (PREVIOUS_STATE !== WORKING_STATE) {
        PREVIOUS_STATE = WORKING_STATE;

        if (WORKING_STATE === CHECK_FURNACE) {
            checkFurnaceProgress();
        }
        else if (WORKING_STATE === PREPARE_TO_COOK) {
            prepareToCook();
        }
        else if (WORKING_STATE === FIND_FUEL) {
            findFuel();
        } else if (WORKING_STATE === CHECK_INGREDIENTS) {
            checkIngredients();
        } else if (WORKING_STATE === STARTING_COOKING) {
            startCooking();
        } else if (WORKING_STATE === WAITING_FOR_COOKING) {
            chat(baseBot, 'Waiting for cooking to finish or to start again.');
             timeout = setTimeout(() => {
                 WORKING_STATE = CHECK_FURNACE;
             }, CHECK_COOKING_INTERVAL);
        }
    }
})


baseBot.bot.on('chat', (username, message) => {
    if (username === baseBot.bot.username) return;

    const commands = message.split(' ');

    if (commands[0] === baseBot.bot.username) {
        if (commands[1] === 'checkFurnaceProgress') {
            checkFurnaceProgress();
        }
        else if (commands[1] === 'prepareToCook') {
            prepareToCook();
        }
        else if (commands[1] === 'findFuel') {
            findFuel();
        }
        else if (commands[1] === 'checkIngredients') {
            checkIngredients();
        }
        else if (commands[1] === 'startCooking') {
            startCooking();
        }
    }
});


