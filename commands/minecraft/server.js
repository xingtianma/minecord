const { SlashCommandBuilder } = require('discord.js');
const amp = require('../../lib/amp');

const { STATE } = amp;
const AMP_INSTANCE_NAME = process.env.AMP_INSTANCE;
const START_TIMEOUT_MS = 3 * 60 * 1000;
const POLL_MS = 5000;

const STATE_LABELS = {
  [-1]: 'in an undefined state',
  [STATE.STOPPED]: 'offline',
  [STATE.PRE_START]: 'preparing to start',
  [STATE.CONFIGURING]: 'configuring',
  [STATE.STARTING]: 'starting',
  [STATE.RUNNING]: 'online',
  [STATE.RESTARTING]: 'restarting',
  [STATE.STOPPING]: 'stopping',
  [STATE.PREPARING_TO_SLEEP]: 'preparing to sleep',
  [STATE.SLEEPING]: 'sleeping (it wakes up when someone joins)',
  [STATE.WAITING]: 'waiting',
  [STATE.INSTALLING]: 'installing',
  [STATE.PREPARING_TO_UPDATE]: 'preparing to update',
  [STATE.UPDATING]: 'updating',
  [STATE.AWAITING_INPUT]: 'waiting for input in AMP',
  [STATE.FAILED]: 'in a failed state',
  [STATE.SUSPENDED]: 'suspended',
  [STATE.MAINTENANCE]: 'in maintenance',
  [STATE.INDETERMINATE]: 'in an indeterminate state',
};

// Already on its way up: don't send another Start
const STARTING_STATES = [STATE.PRE_START, STATE.CONFIGURING, STATE.STARTING, STATE.RESTARTING];
// Busy with something else: ask the user to try again later
const BUSY_STATES = [STATE.STOPPING, STATE.PREPARING_TO_SLEEP, STATE.INSTALLING, STATE.PREPARING_TO_UPDATE, STATE.UPDATING];

// Log in to the main server (AMP_INSTANCE) and return a function for calling its API
async function mainServerApi() {
  const inst = await amp.findInstance(i => i.InstanceName === AMP_INSTANCE_NAME);
  if (!inst) throw new Error(`Instance "${AMP_INSTANCE_NAME}" not found`);
  return amp.instanceApi(inst.InstanceID);
}

async function start(interaction, call) {
  const { State } = await call('Core/GetStatus');

  if (State === STATE.RUNNING) {
    return interaction.editReply('Server is already online.');
  }
  if (BUSY_STATES.includes(State)) {
    return interaction.editReply(`Server is ${STATE_LABELS[State]} right now. Try again in a moment.`);
  }

  if (STARTING_STATES.includes(State)) {
    await interaction.editReply('Server is already starting...');
  } else {
    await call('Core/Start');
    await interaction.editReply('Minecraft server starting...');
  }

  // Check every 5 seconds, for up to 3 minutes
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await amp.wait(POLL_MS);
    const { State: current } = await call('Core/GetStatus');

    if (current === STATE.RUNNING) {
      return interaction.editReply('Minecraft server started! You can join now.');
    }
    if (current === STATE.FAILED) {
      return interaction.editReply('Minecraft server failed to start. Check the AMP console.');
    }
  }

  return interaction.editReply('Server is taking longer than usual to start. Use `/server status` to check on it.');
}

async function stop(interaction, call) {
  await call('Core/Stop');
  return interaction.editReply('Minecraft server stopping...');
}

async function status(interaction, call) {
  const result = await call('Core/GetStatus');
  const state = STATE_LABELS[result.State] ?? `in an unknown state (${result.State})`;
  let reply = `Server is ${state}.`;

  const users = result.Metrics?.['Active Users'];
  if (result.State === STATE.RUNNING && users) {
    reply += ` Players: ${users.RawValue}/${users.MaxValue}`;
  }

  return interaction.editReply(reply);
}

const ACTIONS = { start, stop, status };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Controls the Minecraft server')
    .addSubcommand(sub =>
      sub.setName('start').setDescription('Start the Minecraft server'))
    .addSubcommand(sub =>
      sub.setName('stop').setDescription('Stop the Minecraft server'))
    .addSubcommand(sub =>
      sub.setName('status').setDescription('Check server status')),

  async execute(interaction) {
    const action = ACTIONS[interaction.options.getSubcommand()];
    await interaction.deferReply();

    try {
      const call = await mainServerApi();
      await action(interaction, call);
    } catch (err) {
      console.error('AMP Error: ', err);
      await interaction.editReply(err.message);
    }
  },
};
