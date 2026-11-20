const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getMap, addInstance, countInstances } = require('../../lib/db');
const { playMap } = require('../../lib/play-map');
const amp = require('../../lib/amp');

const MAX_TEMP_SERVERS = 1;                                  // raise later if RAM allows
const ADDRESS = process.env.MC_ADDRESS || '192.168.1.236';   // address shown to players

let busy = false;   // only one server gets built at a time

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Start a temporary server with a saved map')
    .addStringOption(opt => opt.setName('map').setDescription('Map name (see /map list)').setRequired(true)),

  async execute(interaction) {
    const name = interaction.options.getString('map').toLowerCase();
    const map = getMap(name);
    const ephemeral = { flags: MessageFlags.Ephemeral };

    if (!map) {
      return interaction.reply({ content: `No map named **${name}**. Try \`/map list\`.`, ...ephemeral });
    }
    if (busy) {
      return interaction.reply({ content: 'Another server is being set up right now. Try again in a minute.', ...ephemeral });
    }
    if (countInstances() >= MAX_TEMP_SERVERS) {
      return interaction.reply({ content: 'A temporary server is already running. Only one is allowed at a time for now.', ...ephemeral });
    }

    busy = true;
    await interaction.deferReply();
    let created = null;

    try {
      const result = await playMap(map, {
        friendlyName: `play-${map.name}-${Date.now()}`,
        onCreated: inst => { created = inst; },
        onProgress: msg => interaction.editReply(`**${map.name}**: ${msg}`).catch(() => {}),
      });

      addInstance({
        instance_id: result.instanceId,
        instance_name: result.instanceName,
        map_name: map.name,
        owner_id: interaction.user.id,
        port: result.port,
      });

      await interaction.editReply(
        `**${map.name}** is ready! Join at \`${ADDRESS}:${result.port}\` with Minecraft ${map.mc_version}.`
      );
    } catch (err) {
      console.error('Play error:', err);
      if (created) {
        await amp.deleteInstance(created.InstanceName).catch(e => console.error('Cleanup failed:', e));
      }
      await interaction.editReply(
        `Couldn't start **${map.name}**: ${err.message}` + (created ? '\nThe half-built server was removed.' : '')
      );
    } finally {
      busy = false;
    }
  },
};