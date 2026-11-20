require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });

const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const { isAllowed } = require('./lib/db');
const { loadCommands } = require('./lib/commands');
const { runCleanup } = require('./lib/cleanup');

const PUBLIC_COMMANDS = ['ping'];   // commands anyone can use
const CLEANUP_INTERVAL_MS = 60_000;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection(loadCommands());

// Check the temporary servers every minute
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
  }, CLEANUP_INTERVAL_MS);
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
    const reply = { content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
