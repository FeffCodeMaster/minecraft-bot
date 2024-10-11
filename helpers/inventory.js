function hasItemInInventory(baseBot, itemName) {
    return baseBot.bot.inventory.items().some(item => item.name === itemName);
}

function hasItemInInventoryCount(baseBot, itemName, count) {
    return baseBot.bot.inventory.items().some(item => item.name === itemName && item.count >= count);
}

function equipItem(baseBot, itemName, action = null) {
    const item = baseBot.bot.inventory.items().find(item => item.name === itemName);
    if(item) {
        baseBot.bot.equip(item, 'hand');
    }

    if(action) {
        action();
    }
}

module.exports = {hasItemInInventory, hasItemInInventoryCount, equipItem, ...module.exports }