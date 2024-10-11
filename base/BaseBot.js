const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const { findBlockAndGoToBlock } = require('../helpers/findBlock.js');

const BASE_BOT_STATUS_IDLE = "IDLE";
const BASE_BOT_STATUS_SLEEP = "SLEEP";
const BASE_BOT_STATUS_SLEEPING = "SLEEPING";
const BASE_BOT_STATUS_NEEDS_FOOD = "NEEDS_FOOD";

class BaseBot {
  constructor(username, work, stop, basePosition, workingState,importantCommunication = false) {
    const MESSAGE_IDLE = "IDLE";
    const MESSAGE_WORKING = "WORKING";

    const INTERVAL_BETWEEN_MESSAGES = 1250;

    const options = {
      host: 'localhost',
      port: 25565,
      username: username
    };
    this.bot = mineflayer.createBot(options);
    this.bot.loadPlugin(pathfinder);

    this.fullStatus = importantCommunication;

    this.intervalBetweenReports = null;
    this.intervalBetweenReportsTime = 30000;
    this.noReportCounter = 0;

    this.basePosition = basePosition;
    this.messageQueue = [];

    this.messageStatus = MESSAGE_IDLE;
    this.baseBotStatus = BASE_BOT_STATUS_IDLE;
    this.isCurrentlyDay = false;

    this.needsFood = false;
    this.foodTimer = null;
    this.foodInterval = 60000;

    this.workingState = workingState;
  

    this.bot.on('spawn', () => {
      const defaultMove = new Movements(this.bot, this.bot.mcData);
      this.bot.pathfinder.setMovements(defaultMove);
    });

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
        } else if (action.toLowerCase() === 'speak') {
          this.fullStatus = !this.fullStatus;
          if (this.fullStatus) {
            this.bot.chat('Status report: Full');
          } else {
            this.bot.chat('Status report: Just improtant');
          }
        } else if (action.toLowerCase() === 'deposit') {
          dumpAllItems(this.bot);
        }
        else if (action.toLowerCase() === 'position') {
          this.bot.chat(`My position is ${this.bot.entity.position}`);
        }
        else if (action.toLowerCase() === 'status') {
          this.bot.chat(`My base status is ${this.baseBotStatus}, and working status is ${this.workingState}`);
        }
        else if (action.toLowerCase() === 'time') {
          this.bot.chat(`It is ${this.isCurrentlyDay ? 'day' : 'night'}!`);
        }
        else if (action.toLowerCase() === 'sleep') {
          this.bot.chat('I will sleep now.');
          this.baseBotStatus = BASE_BOT_STATUS_SLEEP;
          stop();
        }
      }
    });

    this.bot.on('physicTick', () => {
      handleMessageQueue();
      handleDayTime();
      handleSleep();
      handleFood();
    });

    const handleDayTime = () => {
      if(this.isCurrentlyDay !== this.bot.time.isDay) {
        this.isCurrentlyDay = this.bot.time.isDay;
        if(this.isCurrentlyDay) {
          this.baseBotStatus = BASE_BOT_STATUS_IDLE;
          work();
        } else {
          this.baseBotStatus = BASE_BOT_STATUS_SLEEP;
          stop();
        }
      }
    }

    const handleSleep = () => {
      if(this.baseBotStatus === BASE_BOT_STATUS_SLEEP && !this.isCurrentlyDay) {
        this.bot.chat('Time for bed!');
        this.baseBotStatus = BASE_BOT_STATUS_SLEEPING;

        returnToBase(this, () =>{
          setTimeout(() => {
            findBlockAndGoToBlock(this, 'bed', 32, (bedBlock) => {
              this.bot.sleep(bedBlock, (error) => {
                if(error) {
                  this.bot.chat(`Error sleeping: ${error}`);
                } else {
                  this.bot.chat('Sleeping...');
                }
              });
          });
          }, 1000);
        });
      } 
      else if (this.baseBotStatus === BASE_BOT_STATUS_SLEEPING && this.isCurrentlyDay) {
        this.bot.wake((err) => {
          if (err) {
            this.bot.chat("I'm not sleeping!");
            console.error(err);
          } else {
            this.bot.chat("Good morning! I'm awake now.");
            this.baseBotStatus = BASE_BOT_STATUS_IDLE;
            work();
          }
        });
      }
    }

    const handleFood = () => {
      if(this.baseBotStatus === BASE_BOT_STATUS_IDLE) {
        if(!this.foodTimer) {
          this.foodTimer = setTimeout(() => {
            this.bot.chat(`health ${this.bot.health} hunger ${this.bot.food}`);
            this.foodTimer = null;
          }, this.foodInterval);
        }
      }
    }

    const handleMessageQueue = () => {
      if (this.messageQueue.length > 0 && this.messageStatus === MESSAGE_IDLE) {
        clearTimeout(this.intervalBetweenReports);
        this.messageStatus = MESSAGE_WORKING;
        const message = this.messageQueue.shift();

        if (this.fullStatus || message.important) {
          this.bot.chat(message.message);
        }

        setTimeout(() => this.messageStatus = MESSAGE_IDLE, INTERVAL_BETWEEN_MESSAGES);
      } else if (this.messageQueue.length === 0) {
        if (!this.intervalBetweenReports) {
          this.intervalBetweenReports = setTimeout(() => {
            this.bot.chat("I haven't reported to base for a while.", true);
            this.noReportCounter++;

            if (this.noReportCounter >= 1) {
              this.noReportCounter = 0;
              if(this.baseBotStatus === BASE_BOT_STATUS_IDLE) {
                returnToBase(this);
              }
            }
            clearTimeout(this.intervalBetweenReports);
          }, this.intervalBetweenReportsTime);
        }
      }
    }
  }
}



async function dumpAllItems(bot) {
  const items = bot.inventory.items();  // Get all items in the bot's inventory

  if (items.length === 0) {
    bot.chat('My inventory is empty.');
    return;
  }

  bot.chat(`I have ${items.length} items. Dropping them now...`);

  for (const item of items) {
    try {
      setTimeout(() => bot.toss(item.type, null, item.count), 1000);  
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
  baseBot.bot.chat('Returning to base...');
  const goal = new GoalNear(baseBot.basePosition.x, baseBot.basePosition.y, baseBot.basePosition.z, 2);
  baseBot.bot.pathfinder.setGoal(goal);

  baseBot.bot.once('goal_reached', () => {
    baseBot.bot.chat('I am here!');
    if (action) {
      baseBot.bot.chat('Doing my action when returning to base.');
      action();
    }
  });
}

async function chat(baseBot, message, important) {
  baseBot.messageQueue.push({ baseBot, message, important: important });
}

module.exports = { BaseBot, returnToBase, chat, BASE_BOT_STATUS_IDLE, BASE_BOT_STATUS_SLEEPING: BASE_BOT_STATUS_SLEEP, BASE_BOT_STATUS_NEEDS_FOOD, ...module.exports }