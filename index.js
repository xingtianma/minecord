require('dotenv').config();

const { MessageFlags } = require('discord.js');
const { isAllowed } = require('./utils/db');
const PUBLIC_COMMANDS = ['ping'];   // commands anyone can use
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);
const token = process.env.DISCORD_TOKEN;
const { runCleanup } = require('./utils/cleanup');

let cleanupRunning = false;
function scheduleCleanup() {
  setInterval(async () => {
    if (cleanupRunning) return;   // don't start a new check while one is still going
    cleanupRunning = true;
    try {
      await runCleanup({
        dryRun: false,
        // Only log actual actions, not "keeping" or "waiting" every minute
        log: msg => { if (/deleting|removing|couldn't/.test(msg)) console.log(`[cleanup] ${msg}`); },
      });
    } catch (err) {
      console.error('[cleanup] failed:', err.message);
    } finally {
      cleanupRunning = false;
    }
  }, 60_000);
}

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

client.once(Events.ClientReady, readyClient => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
	scheduleCleanup();
});

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		if (!PUBLIC_COMMANDS.includes(interaction.commandName) && !isAllowed(interaction.user.id)) {
			return interaction.reply({
				content: "You don't have permission to use this command.",
				flags: MessageFlags.Ephemeral,
			});
		}
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
		} else {
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
	}
});

client.login(token);