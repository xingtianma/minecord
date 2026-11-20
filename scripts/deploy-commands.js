// Registers every command in commands/ with Discord. Run after adding a command
// or changing a command's name, description or options.
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

const { REST, Routes } = require('discord.js');
const { loadCommands } = require('../lib/commands');

const commands = [...loadCommands().values()].map(command => command.data.toJSON());
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error(error);
  }
})();
