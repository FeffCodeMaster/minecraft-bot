const { BaseBot } = require('../base/BaseBot.js');

const baseBot = new BaseBot("Bot", work, stop);

function work() {
  baseBot.bot.chat('Work work');
}

function stop() {
  baseBot.bot.chat('Rest rest');
}   
