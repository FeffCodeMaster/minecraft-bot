const mineflayer = require('mineflayer');

const options = {
  host: 'localhost',
  port: 25565,
  username: "BOT-TEST"
};

const bot = mineflayer.createBot(options);

function lookAtPlayer() {
    const playerFilter = (entity) => entity.type === "player"
    const player = bot.nearestEntity(playerFilter)

    if (player) {
        bot.lookAt(player.position.offset(0, player.height, 0));
    }

}

bot.on('spawn', () => {
  console.log('Bot spawned');
  bot.chat("Hello, world!");
});

bot.on("physicTick", lookAtPlayer);


    