const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');

async function findBlockAndGoToBlock(baseBot, blockName, maxDistance, action) {
    const block = baseBot.bot.findBlock({
        matching: block => block.name === blockName,
        maxDistance: maxDistance,
    });

    const goal = new GoalNear(block.position.x, block.position.y, block.position.z, 1);
    baseBot.bot.pathfinder.setGoal(goal);

    baseBot.bot.once('goal_reached', async () => {
        if(action) {
            action(block);
        }
    })
}

async function findAnyOfAndGoToBlock(baseBot, blockNames, maxDistance, action) {
    const block = baseBot.bot.findBlock({
        matching: block => blockNames.includes(block.name),
        maxDistance: maxDistance,
    });

    const goal = new GoalNear(block.position.x, block.position.y, block.position.z, 1);
    baseBot.bot.pathfinder.setGoal(goal);

    baseBot.bot.once('goal_reached', async () => {
        if(action) {
            action(block);
        }
    })
}

function findAnyOfAndGoToBlockWithInBotHeight(baseBot, blockNames, maxDistance, action) {
    const block = baseBot.bot.findBlock({
        matching: block => {
            return blockNames.includes(block.name); 
          },
        maxDistance: maxDistance,
    });

    const goal = new GoalNear(block.position.x, block.position.y, block.position.z, 1);
    baseBot.bot.pathfinder.setGoal(goal);

    baseBot.bot.once('goal_reached', () => {
        if(action) {
            action(block);
        }
    })
}

function goToBlock(baseBot, block, action) {
    const goal = new GoalNear(block.position.x, block.position.y, block.position.z, 0);
    baseBot.bot.pathfinder.setGoal(goal);

    baseBot.bot.once('goal_reached', () => {
        if(action) {
            action(block);
        }
    })
}

module.exports = {findBlockAndGoToBlock, findAnyOfAndGoToBlock, findAnyOfAndGoToBlockWithInBotHeight, goToBlock, ...module.exports }