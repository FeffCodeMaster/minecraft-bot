const { BaseBot, returnToBase, chat, BASE_BOT_STATUS_IDLE } = require('../base/BaseBot.js');
const { HUNTING_BASE_POSITION, FOOD_STATION_POSITION } = require('../constants/bases.js');
const { pathfinder, Movements, goals: { GoalNear, GoalFollow } } = require('mineflayer-pathfinder');

const { moveToPosition } = require('../helpers/findBlock.js');

const IDLE = "IDLE";
const PREPARE_TO_HUNT = "PREPARE_TO_HUNT";
const CHECK_STORAGE = "CHECK_STORAGE";
const STARTHUNTING = "STARTHUNTING";
const HUNTING = "HUNTING";
const COLLECT_HUNTED_MATERIAL = "COLLECT_HUNTED_MATERIAL";
const COLLECTING_HUNTED_MATERIAL = "COLLECTING_HUNTED_MATERIAL";
const DISPOSE_HUNTED_MATERIAL = "DISPOSE_HUNTED_MATERIAL";
const DISPOSING_HUNTED_MATERIAL = "DISPOSING_HUNTED_MATERIAL";
const GETTING_BACK_TO_POSITION = "GETTING_BACK_TO_POSITION";

const MIN_FOOD_IN_CHEST_TO_NOT_HUNT = 10;
const TIMEOUT_BETWEEN_HUNTING = 30000;

let WORKING_STATE = IDLE;
let PREVIOUS_STATE = IDLE;

let currentPrey = null;
let timeout = null;

const rawFoods = [
    'beef',        // Comes from cows
    'porkchop',    // Comes from pigs
    'chicken',     // Comes from chickens
    'mutton',      // Comes from sheep
    'rabbit',      // Comes from rabbits
    'cod',         // Comes from cod fish
    'salmon',      // Comes from salmon fish
    'potato'           // Can be baked
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

const foodEntities = [
    'cow',              // Drops raw beef
    'pig',              // Drops raw porkchop
    'chicken',          // Drops raw chicken
    'sheep',            // Drops raw mutton
    'rabbit',           // Drops raw rabbit
    'cod',              // Drops raw cod
    'salmon',           // Drops raw salmon
    'zombie',           // Has a small chance of dropping potato
    'zombified_piglin'  // Occasionally drops raw porkchop
]

const entityDropsItems = [
    'beef',        // From cow
    'leather',         // From cow
    'porkchop',    // From pig and zombified piglin
    'chicken',     // From chicken
    'feather',         // From chicken
    'mutton',      // From sheep
    'wool',            // From sheep (various colors)
    'rabbit',      // From rabbit
    'rabbit_hide',     // From rabbit
    'rabbit_foot',     // Rare drop from rabbit
    'cod',         // From cod
    'bone',            // Occasionally dropped from cod and salmon
    'salmon',      // From salmon
    'rotten_flesh',    // From zombie
    'carrot',          // Rare drop from zombie
    'potato',          // Rare drop from zombie
    'iron_ingot',      // Rare drop from zombie
    'gold_nugget',     // From zombified piglin
    'golden_sword',    // Rare drop from zombified piglin
    'golden_helmet',   // Rare drop from zombified piglin
    'egg',             // From chicken
    'white_wool',      // White wool
    'orange_wool',     // Orange wool
    'magenta_wool',    // Magenta wool
    'light_blue_wool', // Light blue wool
    'yellow_wool',     // Yellow wool
    'lime_wool',       // Lime wool
    'pink_wool',       // Pink wool
    'gray_wool',       // Gray wool
    'light_gray_wool', // Light gray wool
    'cyan_wool',       // Cyan wool
    'purple_wool',     // Purple wool
    'blue_wool',       // Blue wool
    'brown_wool',      // Brown wool
    'green_wool',      // Green wool
    'red_wool',        // Red wool
    'black_wool'       // Black wool
];

async function work() {
    WORKING_STATE = PREPARE_TO_HUNT;
}

async function stop() {
    clearTimeout(timeout);
    WORKING_STATE = IDLE;
}

async function checkStorage() {
    WORKING_STATE = CHECK_STORAGE;
    chat(baseBot, 'Checking storage for food...');
    await moveToPosition(baseBot, FOOD_STATION_POSITION,);
    const totalFood = await checkFoodInChest();
    if (totalFood > MIN_FOOD_IN_CHEST_TO_NOT_HUNT) {
        chat(baseBot, `Found ${totalFood} food in the chest. I will not go hunting now`, true);
        WORKING_STATE = GETTING_BACK_TO_POSITION;
    } else {
        chat(baseBot, 'No enough food found in the chest, I should go hunting.', true);
        WORKING_STATE = STARTHUNTING;
    }
}

async function checkFoodInChest() {
    return new Promise(async (resolve, reject) => {
        try {
            const chestBlock = baseBot.bot.findBlock({
                matching: block => block.name === 'chest',
                maxDistance: 10,
            });

            if (chestBlock) {
                chat(baseBot, 'Found a chest. Moving to it.');

                const goal = new GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 1);
                baseBot.bot.pathfinder.setGoal(goal);

                const chest = await baseBot.bot.openContainer(chestBlock);
                let rawFoodCount = 0;
                let cookedFoodCount = 0;

                chat(baseBot, 'Chest opened, checking for food...');

                chest.containerItems().forEach(item => {
                    if (rawFoods.includes(item.name)) {
                        rawFoodCount += item.count;
                    } else if (cookedFoods.includes(item.name)) {
                        cookedFoodCount += item.count;
                    }
                });

                chest.close();

                chat(baseBot, `Total Raw Food: ${rawFoodCount}`);
                chat(baseBot, `Total Cooked Food: ${cookedFoodCount}`);
            /*     resolve(rawFoodCount + cookedFoodCount); */
            resolve(rawFoodCount);

            }

        } catch (err) {
            resolve(error);
        }
    })
}

async function startHunting() {
    WORKING_STATE = HUNTING;
    chat(baseBot, 'Starting hunting...');
    const prey = await findPrey();

    if (prey) {
        chat(baseBot, `Found a ${prey.name}, moving to it...`, true);
        const goal = new GoalFollow(prey, 1);
        baseBot.bot.pathfinder.setGoal(goal);

        baseBot.bot.once('goal_reached', async () => {
            baseBot.bot.chat(`Reached the ${prey.name}, attacking now!`);
            attackPrey(prey);
        });

    } else {
        chat(baseBot, 'No prey found, I should go back to base.', true);
        WORKING_STATE = GETTING_BACK_TO_POSITION;
    }
}

function attackPrey(prey) {
    const goal = new GoalFollow(prey, 1);
    baseBot.bot.pathfinder.setGoal(goal);

    baseBot.bot.attack(prey); // Attack once the bot reaches the prey

    timeout = setTimeout(() => {
        if (isEntityAlive(prey)) {
            attackPrey(prey);
        } else {
            baseBot.bot.chat(`${prey.displayName}, is dead`);
            currentPrey = prey;
            WORKING_STATE = COLLECT_HUNTED_MATERIAL;
        }
    }, 500);
}

async function collectHuntedMaterial() {
    WORKING_STATE = COLLECTING_HUNTED_MATERIAL;
    if (!currentPrey || !currentPrey.drops) {
        chat(baseBot, 'No prey found drop found');
        WORKING_STATE = DISPOSE_HUNTED_MATERIAL;
        return;
    }

    const droppedItems = Object.values(baseBot.bot.entities).filter(entity => {
        return entity.displayName === 'Item' && currentPrey.drops.includes(entity.metadata[8].itemId);
    });

    if (droppedItems.length > 0) {
        const nearestItem = droppedItems[droppedItems.length - 1];

        const goal = new GoalNear(nearestItem.position.x, nearestItem.position.y, nearestItem.position.z, 1);
        baseBot.bot.pathfinder.setGoal(goal);

        baseBot.bot.once('goal_reached', async () => {
            chat(baseBot, 'Picked up items.', true);
        });
    } else {
        chat(baseBot, 'No dropped items found.');
    }

    WORKING_STATE = DISPOSE_HUNTED_MATERIAL;
}

function isEntityAlive(entity) {
    return baseBot.bot.entities[entity.id];
}

async function findPrey() {
    return new Promise(async (resolve) => {
        const prey = baseBot.bot.nearestEntity(entity => {
            return foodEntities.includes(entity.name); // Check if entity is in foodEntities list and is a mob
        });

        resolve(prey);
    })
}

async function disposeHuntedMaterial() {
    WORKING_STATE = DISPOSING_HUNTED_MATERIAL;
    chat(baseBot, 'Disposing hunted material...');

    try {
        await moveToPosition(baseBot, FOOD_STATION_POSITION);
        await depositItemsInChest();
        WORKING_STATE = GETTING_BACK_TO_POSITION;
    } catch (err) {
        chat(baseBot, 'Error disposing hunted material.', true);
    }   
}

async function depositItemsInChest() {
    return new Promise(async (resolve, reject) => {
        try {
            const chestBlock = baseBot.bot.findBlock({
                matching: block => block.name === 'chest',
                maxDistance: 10,
            });

            if (chestBlock) {
                chat(baseBot, 'Found a chest. Moving to it.');

                const goal = new GoalNear(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, 1);
                baseBot.bot.pathfinder.setGoal(goal);

                const chest = await baseBot.bot.openContainer(chestBlock);
                for (const item of baseBot.bot.inventory.items()) {
                    chat(baseBot, `I have ${item.count} ${item.name} in my inventory.`);
                    if (entityDropsItems.includes(item.name)) {
                        await chest.deposit(item.type, null, item.count);
                        chat(baseBot, `Stored ${item.count} ${item.name} in the chest.`, true);
                    }
                }
                chest.close();
                resolve();
            }
        } catch (err) {
            chat(baseBot, 'Error depositing items in chest.');
            reject();
        }
    })  
}


const arguments = process.argv.slice(2);
const botName = arguments[0] || "Hunter";
const baseBot = new BaseBot(botName, work, stop, HUNTING_BASE_POSITION, WORKING_STATE);

baseBot.bot.on('physicTick', () => {
    if (PREVIOUS_STATE !== WORKING_STATE) {
        PREVIOUS_STATE = WORKING_STATE;
        if (WORKING_STATE === PREPARE_TO_HUNT) {
            checkStorage();
        } else if (WORKING_STATE === GETTING_BACK_TO_POSITION) {
            WORKING_STATE = IDLE;

            returnToBase(baseBot, () => { 
                timeout = setTimeout(() => {
                    WORKING_STATE = PREPARE_TO_HUNT;
                }, TIMEOUT_BETWEEN_HUNTING);
            });
        } else if (WORKING_STATE === STARTHUNTING) {
            startHunting();
        } else if (WORKING_STATE === COLLECT_HUNTED_MATERIAL) {
            collectHuntedMaterial();
        } else if (WORKING_STATE === DISPOSE_HUNTED_MATERIAL) {
            disposeHuntedMaterial();
        }
    }
})


baseBot.bot.on('chat', (username, message) => {
    if (username === baseBot.bot.username) return;

    const commands = message.split(' ');

    if (commands[0] === baseBot.bot.username) {
        if (commands[1] === 'dispose') {
            WORKING_STATE = DISPOSE_HUNTED_MATERIAL;
        }   
    }
});
