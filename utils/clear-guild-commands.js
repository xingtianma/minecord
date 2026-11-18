//removes commands from whatever guild is set in .env

require('dotenv').config();
const { REST, Routes } = require('discord.js');

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: [] },
  );
  console.log('Cleared guild commands.');
})();