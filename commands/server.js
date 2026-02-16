const { SlashCommandBuilder } = require('discord.js');
const { exec } = require('child_process');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Control the Minecraft server')
    .addSubcommand(sub =>
      sub.setName('start').setDescription('Start the Minecraft server'))
    .addSubcommand(sub =>
      sub.setName('stop').setDescription('Stop the Minecraft server'))
    .addSubcommand(sub =>
      sub.setName('status').setDescription('Check server status')),

  async execute(interaction) {
    const action = interaction.options.getSubcommand();

    if (action === 'start') {
      exec('docker start minecraft', (err) => {
        if (err) {
          return interaction.reply('Failed to start server');
        }
        interaction.reply('Minecraft server started');
      });
    }

    if (action === 'stop') {
      exec('docker stop minecraft', (err) => {
        if (err) {
          return interaction.reply('Failed to stop server');
        }
        interaction.reply('Minecraft server stopped');
      });
    }

    if (action === 'status') {
      exec('docker ps --filter "name=minecraft" --format "{{.Status}}"',
        (err, stdout) => {
          if (!stdout) {
            interaction.reply('Server is offline');
          } else {
            interaction.reply(`Server status: ${stdout}`);
          }
        });
    }
  }
};