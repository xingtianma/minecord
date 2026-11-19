const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { MAPS_DIR, inspectMap } = require('../../utils/maps');
const { addMap, getMap, listMaps, removeMap, updateMap } = require('../../utils/db');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const ephemeral = { flags: MessageFlags.Ephemeral };
const MAX_UPLOAD_MB = 500;

// Turn "a=true,b=easy" into { a: 'true', b: 'easy' }
function parseProperties(text) {
  const props = {};
  if (!text) return props;
  for (const pair of text.split(',')) {
    const [rawKey, ...rest] = pair.split('=');
    const key = rawKey?.trim();
    const value = rest.join('=').trim();
    if (!/^[a-z0-9.-]+$/.test(key) || !value || /[\r\n]/.test(value)) {
      throw new Error(`Invalid setting: "${pair.trim()}"`);
    }
    props[key] = value;
  }
  return props;
}

// Format a map's settings for display
function formatSettings(propertiesJson) {
  return Object.entries(JSON.parse(propertiesJson))
    .map(([k, v]) => `${k}=${v}`)
    .join(', ') || 'none';
}

// Download a Discord attachment into the maps folder and return its file name
async function saveAttachment(attachment) {
  const fileName = path.basename(attachment.name).replace(/[^A-Za-z0-9._-]/g, '_');

  if (!fileName.toLowerCase().endsWith('.zip')) {
    throw new Error('The attachment must be a `.zip` file.');
  }
  if (attachment.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(`The file is over ${MAX_UPLOAD_MB} MB.`);
  }

  const target = path.join(MAPS_DIR, fileName);
  if (fs.existsSync(target)) {
    throw new Error(`A file named \`${fileName}\` is already in the maps folder. Use the \`file\` option to register it, or rename the zip.`);
  }

  const res = await fetch(attachment.url);
  if (!res.ok) throw new Error(`Couldn't download the attachment (HTTP ${res.status}).`);

  fs.mkdirSync(MAPS_DIR, { recursive: true });
  try {
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(target));
  } catch (err) {
    fs.rmSync(target, { force: true });   // don't leave a half-downloaded file
    throw new Error(`The download failed: ${err.message}`);
  }
  return fileName;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('map')
    .setDescription('Manage saved maps')
    .addSubcommand(sub => sub.setName('add').setDescription('Save a map from an attachment or the maps folder (owner only)')
      .addStringOption(opt => opt.setName('name').setDescription('Short name, e.g. mario-party').setRequired(true))
      .addStringOption(opt => opt.setName('version').setDescription('Minecraft version, e.g. 1.20.1').setRequired(true))
      .addAttachmentOption(opt => opt.setName('attachment').setDescription('The map as a .zip file'))
      .addStringOption(opt => opt.setName('file').setDescription('Or: a zip already in the maps folder'))
      .addStringOption(opt => opt.setName('mode').setDescription('reset = fresh every time, persistent = keep progress')
        .addChoices({ name: 'reset', value: 'reset' }, { name: 'persistent', value: 'persistent' }))
      .addStringOption(opt => opt.setName('properties')
        .setDescription('Server settings, e.g. enable-command-block=true,difficulty=easy')))
    .addSubcommand(sub => sub.setName('files').setDescription('List zip files in the maps folder (owner only)'))
    .addSubcommand(sub => sub.setName('list').setDescription('List saved maps'))
    .addSubcommand(sub => sub.setName('remove').setDescription('Remove a saved map (owner only)')
      .addStringOption(opt => opt.setName('name').setDescription('Map name').setRequired(true)))
    .addSubcommand(sub => sub.setName('edit').setDescription('Change a saved map (owner only)')
      .addStringOption(opt => opt.setName('name').setDescription('Map to edit').setRequired(true))
      .addStringOption(opt => opt.setName('version').setDescription('New Minecraft version, e.g. 1.20.1'))
      .addStringOption(opt => opt.setName('mode').setDescription('reset or persistent')
        .addChoices({ name: 'reset', value: 'reset' }, { name: 'persistent', value: 'persistent' }))
      .addStringOption(opt => opt.setName('properties')
        .setDescription('Replaces ALL settings, e.g. enable-command-block=true. Use "none" to clear.'))
      .addStringOption(opt => opt.setName('file').setDescription('New zip file name in the maps folder'))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // Anyone with bot access can see the list
    if (sub === 'list') {
      const maps = listMaps();
      const content = maps.length
        ? maps.map(m => `**${m.name}**: Minecraft ${m.mc_version}, ${m.mode}`).join('\n')
        : 'No maps saved yet.';
      return interaction.reply({ content, ...ephemeral });
    }

    // Everything else is owner only
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ content: 'Only the bot owner can manage maps.', ...ephemeral });
    }

    if (sub === 'files') {
      const files = fs.existsSync(MAPS_DIR)
        ? fs.readdirSync(MAPS_DIR).filter(f => f.endsWith('.zip'))
        : [];
      return interaction.reply({
        content: files.length ? files.map(f => `\`${f}\``).join('\n') : 'No zip files in the maps folder.',
        ...ephemeral,
      });
    }

    if (sub === 'remove') {
      const name = interaction.options.getString('name').toLowerCase();
      const removed = removeMap(name);
      return interaction.reply({
        content: removed
          ? `Removed **${name}**. The zip file is still in the maps folder.`
          : `No map named **${name}**.`,
        ...ephemeral,
      });
    }

    if (sub === 'edit') {
      const name = interaction.options.getString('name').toLowerCase();
      const version = interaction.options.getString('version');
      const mode = interaction.options.getString('mode');
      const propsText = interaction.options.getString('properties');
      const fileOption = interaction.options.getString('file');

      if (!getMap(name)) {
        return interaction.reply({ content: `No map named **${name}**. Try \`/map list\`.`, ...ephemeral });
      }
      if (!version && !mode && !propsText && !fileOption) {
        return interaction.reply({ content: 'Nothing to change. Fill in at least one option.', ...ephemeral });
      }
      if (version && !/^\d+\.\d+(\.\d+)?$/.test(version)) {
        return interaction.reply({ content: 'The version should look like `1.20.1`.', ...ephemeral });
      }

      let properties = null, file = null, worldRoot = null;
      try {
        if (propsText) {
          properties = propsText.trim().toLowerCase() === 'none'
            ? '{}'
            : JSON.stringify(parseProperties(propsText));
        }
        if (fileOption) {
          file = path.basename(fileOption);
          if (!fs.existsSync(path.join(MAPS_DIR, file))) {
            return interaction.reply({ content: `No file named \`${file}\` in the maps folder. Try \`/map files\`.`, ...ephemeral });
          }
          ({ worldRoot } = inspectMap(file));
        }
      } catch (err) {
        return interaction.reply({ content: err.message, ...ephemeral });
      }

      updateMap({ name, file_name: file, world_root: worldRoot, mc_version: version, mode, properties });

      const map = getMap(name);
      return interaction.reply({
        content: `Updated **${name}** (Minecraft ${map.mc_version}, ${map.mode}).\nFile: \`${map.file_name}\`\nWorld folder: \`${map.world_root || '(top of zip)'}\`\nSettings: ${formatSettings(map.properties)}`,
        ...ephemeral,
      });
    }

    if (sub === 'add') {
      // Downloading can take a while, so reply "thinking..." first
      await interaction.deferReply(ephemeral);
      const reply = content => interaction.editReply({ content });

      const name = interaction.options.getString('name').toLowerCase();
      const version = interaction.options.getString('version');
      const attachment = interaction.options.getAttachment('attachment');
      const fileOption = interaction.options.getString('file');
      const mode = interaction.options.getString('mode') ?? 'reset';

      // Check everything cheap before downloading anything
      if (!!attachment === !!fileOption) {
        return reply('Give either an `attachment` or a `file` name (one, not both).');
      }
      if (!/^[a-z0-9-]{1,32}$/.test(name)) {
        return reply('Names can only use lowercase letters, numbers and dashes (max 32).');
      }
      if (!/^\d+\.\d+(\.\d+)?$/.test(version)) {
        return reply('The version should look like `1.20.1`.');
      }
      if (getMap(name)) {
        return reply(`A map named **${name}** already exists.`);
      }

      let properties;
      try {
        properties = parseProperties(interaction.options.getString('properties'));
      } catch (err) {
        return reply(err.message);
      }

      // Get the zip, from the attachment or the maps folder
      let file, downloaded = false, worldRoot;
      try {
        if (attachment) {
          file = await saveAttachment(attachment);
          downloaded = true;
        } else {
          file = path.basename(fileOption);
          if (!fs.existsSync(path.join(MAPS_DIR, file))) {
            return reply(`No file named \`${file}\` in the maps folder. Try \`/map files\`.`);
          }
        }
        ({ worldRoot } = inspectMap(file));
      } catch (err) {
        // A bad upload shouldn't be left behind in the maps folder
        if (downloaded) fs.rmSync(path.join(MAPS_DIR, file), { force: true });
        return reply(err.message);
      }

      addMap({
        name,
        file_name: file,
        world_root: worldRoot,
        mc_version: version,
        mode,
        properties: JSON.stringify(properties),
        added_by: interaction.user.id,
      });

      return reply(`Saved **${name}** (Minecraft ${version}, ${mode}).\nFile: \`${file}\`\nWorld folder: \`${worldRoot || '(top of zip)'}\`\nSettings: ${formatSettings(JSON.stringify(properties))}`);
    }
  },
};