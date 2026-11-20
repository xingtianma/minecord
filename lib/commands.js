const fs = require('node:fs');
const path = require('node:path');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

// Find every command file under commands/ (any depth) and return them by name
function loadCommands(dir = COMMANDS_DIR, commands = new Map()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      loadCommands(filePath, commands);
      continue;
    }
    if (!entry.name.endsWith('.js')) continue;

    const command = require(filePath);
    if (!('data' in command && 'execute' in command)) {
      console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
      continue;
    }
    if (commands.has(command.data.name)) {
      console.log(`[WARNING] Duplicate command name "${command.data.name}" at ${filePath}, skipping.`);
      continue;
    }
    commands.set(command.data.name, command);
  }
  return commands;
}

module.exports = { loadCommands };
