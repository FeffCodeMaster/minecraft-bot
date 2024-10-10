const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');

const BASE_POSITION = {
  x: -3,
  y: 75,
  z: 56
}

class BaseBot {
  constructor(username, work, stop) {
        const options = {
            host: 'localhost',
            port: 25565,
            username: username
        };

        this.bot = mineflayer.createBot(options);
        this.bot.loadPlugin(pathfinder);

        this.bot.on('spawn', () => {
            // Set up default movements
            const defaultMove = new Movements(this.bot, this.bot.mcData);
            this.bot.pathfinder.setMovements(defaultMove);
        });

        // setting up base chat commands
        this.bot.on('chat', (username, message) => {
            if (username === this.bot.username) return;
            
            const commands = message.split(' ');

            if(commands[0] === this.bot.username) {
                const player = this.bot.players[username];
                const action = commands[1];
                if (action.toLowerCase() === 'come') {
                  if (player && player.entity) {
                    this.bot.chat('On my way!');
                    
                    const playerPos = player.entity.position;
                    moveToPlayer(playerPos, this.bot); 
                  } else {
                    this.bot.chat('I cannot find you.');
                  }
                }
                else if(action.toLowerCase() === 'stop') {
                    this.bot.chat('I will stop working now.');
                    stop();
                }
                else if(action.toLowerCase() === 'work') {
                    this.bot.chat('I will start working now.');
                    work();
                } else if(action.toLowerCase() === 'return') {
                  this.bot.chat('I will return to base now.');
                  moveToPosition(BASE_POSITION, this.bot);
                }
            }
          });
    }
}

function moveToPosition(position, bot) {
  const goal = new GoalNear(position.x, position.y, position.z, 1); 
  bot.pathfinder.setGoal(goal);
  
  bot.once('goal_reached', () => {
    bot.chat('I am here!');
  });
}

function returnToBase(bot, action){
  const goal = new GoalNear(BASE_POSITION.x, BASE_POSITION.y, BASE_POSITION.z, 1); 
  bot.pathfinder.setGoal(goal);
  
  bot.once('goal_reached', () => {
    bot.chat('I am here!');
    if(action){
      bot.chat('Doing my action when returning to base.');
      action();
    }
  });
}



module.exports = { BaseBot, returnToBase, ...module.exports }