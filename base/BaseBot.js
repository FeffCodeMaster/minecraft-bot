const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');


class BaseBot {
  constructor(username, work, stop, basePosition, importantCommunication = false) {
    const options = {
      host: 'localhost',
      port: 25565,
      username: username
    };
    this.fullStatus = importantCommunication;
    this.bot = mineflayer.createBot(options);
    this.bot.loadPlugin(pathfinder);
    this.intervalBetweenReports = null;
    this.intervalBetweenReportsTime = 30000;
    this.noReportCounter = 0;
    this.basePosition = basePosition;

    this.bot.on('spawn', () => {
      // Set up default movements
      const defaultMove = new Movements(this.bot, this.bot.mcData);
      this.bot.pathfinder.setMovements(defaultMove);
    });

    // setting up base chat commands
    this.bot.on('chat', (username, message) => {
      if (username === this.bot.username) return;

      const commands = message.split(' ');

      if (commands[0] === this.bot.username) {
        const player = this.bot.players[username];
        const action = commands[1];
        if (action.toLowerCase() === 'come') {
          if (player && player.entity) {
            this.bot.chat('On my way!');

            const playerPos = player.entity.position;
            moveToPosition(playerPos, this.bot);
          } else {
            this.bot.chat('I cannot find you.');
          }
        }
        else if (action.toLowerCase() === 'stop') {
          this.bot.chat('I will stop working now.');
          stop();
        }
        else if (action.toLowerCase() === 'work') {
          this.bot.chat('I will start working now.');
          work();
        } else if (action.toLowerCase() === 'return') {
          this.bot.chat('I will return to base now.');
          moveToPosition(this.basePosition, this.bot);
        } else if (action.toLowerCase() === 'status') {
          this.fullStatus = !this.fullStatus;

          if (this.fullStatus) {
            this.bot.chat('Status report: Full');
          } else {
            this.bot.chat('Status report: Just improtant');
          }
        } else if (action.toLowerCase() === 'deposit') {
          dumpAllItems(this.bot);
        }
      }
    });
  }
}

async function dumpAllItems(bot) {
  const items = bot.inventory.items();  // Get all items in the bot's inventory

  if (items.length === 0) {
    bot.chat('My inventory is empty.');
    return;
  }

  bot.chat(`I have ${items.length} items. Dropping them now...`);

  // Loop through each item and drop it
  for (const item of items) {
    try {
      setTimeout(() => bot.toss(item.type, null, item.count), 1000);  // Drop the entire stack of the item
      bot.chat(`Dropped ${item.count} ${item.name}(s).`);
    } catch (err) {
      bot.chat(`Failed to drop ${item.name}: ${err.message}`);
    }
  }

  bot.chat('Finished dropping all items.');
}

function moveToPosition(position, bot) {
  const goal = new GoalNear(position.x, position.y, position.z, 1);
  bot.pathfinder.setGoal(goal);

  bot.once('goal_reached', () => {
    bot.chat('I am here!');
  });
}

function returnToBase(baseBot, action) {
  const goal = new GoalNear(baseBot.basePosition.x, baseBot.basePosition.y, baseBot.basePosition.z, 10);
  baseBot.bot.pathfinder.setGoal(goal);

  baseBot.bot.once('goal_reached', () => {
    baseBot.bot.chat('I am here!');
    if (action) {
      baseBot.bot.chat('Doing my action when returning to base.');
      action();
    }
  });
}

function chat(baseBot, message, important) {
  clearTimeout(baseBot.intervalBetweenReports);
  if (baseBot.fullStatus || important) {
    baseBot.bot.chat(message);
  }

  baseBot.intervalBetweenReports = setTimeout(() => {
    chat(baseBot, "I haven't reported to base for a while.", true);
    baseBot.noReportCounter++;

    if (baseBot.noReportCounter >= 1) {
      baseBot.noReportCounter = 0;

      returnToBase(baseBot);
    }

  }, baseBot.intervalBetweenReportsTime);
}



module.exports = { BaseBot, returnToBase, chat, ...module.exports }