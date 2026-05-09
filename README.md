# Minecord

A Discord bot that lets you manage a Dockerized Minecraft server directly from your Discord server using slash commands.

## Features

- **Start / Stop** your Minecraft server with a single command
- **Check server status** without leaving Discord
- Built with [discord.js](https://discord.js.org/) v14 slash commands
- Controls the server via Docker — no need to SSH into the host

## Commands

| Command | Description |
|---------|-------------|
| `/ping` | Health check — replies with "pong!" |
| `/server start` | Starts the Minecraft Docker container |
| `/server stop` | Stops the Minecraft Docker container |
| `/server status` | Returns the current container status (uptime or offline) |

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Docker](https://www.docker.com/) with a Minecraft server container named `minecraft`
- A [Discord bot application](https://discord.com/developers/applications) with slash command permissions

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/xingtianma/minecord.git
cd minecord
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_client_id
GUILD_ID=your_discord_server_id
```

### 4. Deploy slash commands

Register the bot's slash commands with Discord:

```bash
node utils/deploy-commands.js
```

### 5. Run the bot

```bash
node index.js
```

## Utility Scripts

| Script | Description |
|--------|-------------|
| `node utils/deploy-commands.js` | Registers all slash commands globally with Discord |
| `node utils/delete-commands.js` | Removes all registered slash commands |
| `node utils/refresh-commands.js` | Deletes then re-deploys all commands (full reset) |

## Project Structure

```
minecord/
├── index.js                       # Bot entry point — loads commands & handles interactions
├── commands/
│   ├── ping.js                    # /ping command
│   └── server.js                  # /server start|stop|status commands
├── utils/
│   ├── deploy-commands.js         # Register slash commands with Discord API
│   ├── delete-commands.js         # Remove all slash commands
│   └── refresh-commands.js        # Delete + re-deploy commands
├── .env                           # Bot credentials (git-ignored)
├── .gitignore
└── package.json
```

## Adding New Commands

1. Create a new `.js` file in the `commands/` directory
2. Export an object with `data` (a `SlashCommandBuilder`) and an `execute` function:

```js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mycommand')
    .setDescription('Does something cool'),
  async execute(interaction) {
    await interaction.reply('Hello!');
  }
};
```

3. Re-deploy commands:

```bash
node utils/refresh-commands.js
```

## Setting Up the Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** and give it a name
3. Navigate to **Bot** → click **Reset Token** and copy it for your `.env`
4. Under **OAuth2 → URL Generator**, select the `bot` and `applications.commands` scopes
5. Select the permissions you need (at minimum: Send Messages, Use Slash Commands)
6. Copy the generated URL and open it to invite the bot to your server

## Docker Setup

The bot expects a Docker container named `minecraft`. If you don't have one yet, you can set one up with [itzg/minecraft-server](https://hub.docker.com/r/itzg/minecraft-server):

```bash
docker run -d --name minecraft -p 25565:25565 \
  -e EULA=TRUE \
  itzg/minecraft-server
```

## License

ISC
