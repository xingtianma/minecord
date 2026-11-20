const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { addUser, removeUser, listUsers } = require('../../lib/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('access')
    .setDescription('Manage who can use the bot')
    .addSubcommand(sub => sub.setName('add').setDescription('Give a user access')
      .addUserOption(opt => opt.setName('user').setDescription('User to add').setRequired(true)))
    .addSubcommand(sub => sub.setName('remove').setDescription('Remove a user\'s access')
      .addUserOption(opt => opt.setName('user').setDescription('User to remove').setRequired(true)))
    .addSubcommand(sub => sub.setName('list').setDescription('List users with access')),

  async execute(interaction) {
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ content: 'Only the bot owner can manage access.', flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const users = listUsers();
      const content = users.length
        ? users.map(u => `<@${u.discord_id}> (added ${u.added_at})`).join('\n')
        : 'No users have access yet.';
      return interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    const user = interaction.options.getUser('user');

    if (sub === 'add') {
      const added = addUser(user.id, interaction.user.id);
      return interaction.reply({
        content: added ? `${user} can now use the bot.` : `${user} already has access.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'remove') {
      const removed = removeUser(user.id);
      return interaction.reply({
        content: removed ? `${user} no longer has access.` : `${user} didn't have access.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};