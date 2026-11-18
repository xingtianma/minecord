# Minecord

A Discord bot that lets you manage a Minecraft server from your Discord server using slash commands. The server itself is run by [AMP](https://cubecoders.com/AMP) (CubeCoders' Application Management Panel), and the bot controls it through AMP's API.

## Features

- **Start / stop** the Minecraft server with a single command
- **Smart start**: won't send a second start if the server is already online or starting, and edits its reply from "starting..." to "started!" once the server is up
- **Status checks** that show the server's real state (online, sleeping, starting, stopping, etc.) and the player count when online
- **Sleep mode aware**: if AMP has put the server to sleep, `/server start` wakes it up
- **Access control**: only the owner and users on an allow list (stored in SQLite) can use the bot's commands
- Built with [discord.js](https://discord.js.org/) v14 slash commands

## How It Works

```
Discord  →  Minecord bot  →  AMP API  →  Minecraft instance
```

The bot logs in to AMP with the credentials in `.env`, finds the instance named in `AMP_INSTANCE`, and sends it start, stop, and status requests. AMP handles actually running Minecraft.

## Commands

| Command | Description |
|---------|-------------|
| `/ping` | Health check, replies with "pong" |
| `/server start` | Starts (or wakes) the Minecraft server, then updates the message when it's online |
| `/server stop` | Stops the Minecraft server |
| `/server status` | Shows the server's current state, plus the player count when online |
| `/access add <user>` | Gives a user access to the bot (owner only) |
| `/access remove <user>` | Removes a user's access (owner only) |
| `/access list` | Lists the owner and every user with access (owner only) |

All commands except `/ping` require access. See [Access Control](#access-control).

## Prerequisites

- [Node.js](https://nodejs.org/) v22+ (v24 LTS recommended). `better-sqlite3` requires Node 22 or newer, and crashes with a segmentation fault on older versions.
- An [AMP](https://cubecoders.com/AMP) installation with a Minecraft Java Edition instance
- An AMP user account with access to that instance
- A [Discord bot application](https://discord.com/developers/applications)

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

> **Windows:** if PowerShell says running scripts is disabled, run
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, then try again.

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
# Discord
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_discord_server_id
OWNER_ID=your_discord_user_id

# AMP
AMP_URL=http://localhost:8080
AMP_USER=your_amp_panel_username
AMP_PASS=your_amp_panel_password
AMP_INSTANCE=Minecraft01
```

- `CLIENT_ID` is the **Application ID** from the Developer Portal's General Information page, not the Public Key.
- `OWNER_ID` is your own Discord user ID. To copy it, turn on **User Settings → Advanced → Developer Mode**, then right-click your name and choose **Copy User ID**.
- `AMP_URL` is the address of the AMP panel. Use `localhost` if AMP runs on the same machine as the bot.
- `AMP_USER` / `AMP_PASS` are your **AMP panel** login, not your Linux login.
- `AMP_INSTANCE` must match the instance's internal name exactly. See [Finding the instance name](#finding-the-instance-name).

`.env` and `data/` are git-ignored. Never commit them, since they contain your bot token, AMP password, and the access list.

### 4. Deploy slash commands

```bash
node utils/deploy-commands.js
```

This registers the commands as **guild commands** for the server in `GUILD_ID`, so changes show up instantly.

### 5. Run the bot

```bash
node index.js
```

The bot only runs while this terminal is open. To keep it running permanently, see [Running as a service](#running-as-a-service).

## Access Control

Commands are restricted to the bot owner and an allow list stored in a SQLite database at `data/minecord.db`. The folder and database are created automatically the first time the bot starts.

- **The owner** (`OWNER_ID` in `.env`) always has access and is the only one who can use `/access`. The owner isn't stored in the database, so you can't lock yourself out, even if the database is deleted.
- **Other users** get access with `/access add @user` and lose it with `/access remove @user`.
- **Public commands** are listed in `PUBLIC_COMMANDS` in `index.js` (currently just `ping`). Anyone can use those.

The check runs in `index.js` before every command, so new commands are protected automatically.

To view the table directly:

```bash
sqlite3 data/minecord.db "SELECT * FROM allowed_users;"
```

Discord IDs are stored as `TEXT`, because they're too large for JavaScript to represent exactly as numbers. All queries use `?` placeholders to prevent SQL injection.

## Running as a Service

On a Linux server, run the bot with systemd so it starts on boot and restarts if it crashes. Create `/etc/systemd/system/minecord.service`:

```ini
[Unit]
Description=Minecord Discord bot
After=network-online.target

[Service]
WorkingDirectory=/opt/minecord
ExecStart=/usr/bin/node index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Then enable it:

```bash
systemctl daemon-reload
systemctl enable --now minecord
```

Useful commands:

```bash
systemctl status minecord      # is the bot running?
journalctl -u minecord -f      # live logs
systemctl restart minecord     # apply code or .env changes
systemctl stop minecord        # take the bot offline
```

Don't run the bot on your own computer while the service is running, or two copies will answer commands.

## Updating the Bot

After pulling new changes on the server:

| What changed | What to run |
|--------------|-------------|
| Code inside a command, `index.js`, or `.env` | `systemctl restart minecord` |
| Added a command, or changed a command's name, description, or options | `node utils/deploy-commands.js`, then restart |
| Added an npm package | `npm install`, then restart |

Or run everything at once:

```bash
cd /opt/minecord && git pull && npm install && node utils/deploy-commands.js && systemctl restart minecord
```

## Utility Scripts

| Script | Description |
|--------|-------------|
| `node utils/deploy-commands.js` | Registers all commands as guild commands, replacing the existing list |
| `node utils/clear-global-commands.js` | Removes any global commands (fixes duplicate commands in Discord) |
| `node utils/delete-commands.js` | Removes all registered slash commands |
| `node utils/refresh-commands.js` | Deletes then re-deploys all commands (full reset) |

`deploy-commands.js` does a bulk overwrite: commands that no longer exist in the `commands/` folder are removed from Discord automatically.

## Project Structure

```
minecord/
├── index.js                          # Bot entry point: loads commands & handles interactions
├── commands/
│   └── utility/
│       ├── access.js                 # /access add|remove|list (owner only)
│       ├── ping.js                   # /ping command
│       └── server.js                 # /server start|stop|status (talks to AMP)
├── utils/
│   ├── db.js                         # SQLite database and access-list helpers
│   ├── deploy-commands.js            # Register slash commands with Discord
│   ├── clear-global-commands.js      # Remove global commands
│   ├── delete-commands.js            # Remove all slash commands
│   └── refresh-commands.js           # Delete + re-deploy commands
├── data/
│   └── minecord.db                   # Access list database (git-ignored, created automatically)
├── .env                              # Credentials (git-ignored)
├── .gitignore
└── package.json
```

## Adding New Commands

1. Create a `.js` file in a category folder inside `commands/` (for example `commands/utility/`).
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

3. Deploy the commands and restart the bot:

```bash
node utils/deploy-commands.js
systemctl restart minecord
```

## AMP Setup

### Installing AMP

On a Linux server, as root:

```bash
bash <(wget -qO- getamp.sh)
```

Say yes to installing Java for Minecraft. Then open `http://<server-ip>:8080`, complete the setup wizard with your license key, and create a **Minecraft Java Edition** instance.

If AMP runs inside a Proxmox LXC container with Docker isolation enabled, turn on **Nesting** and **keyctl** under the container's Options → Features.

### Finding the instance name

The bot matches AMP's internal instance name, which may differ from the name shown in the web panel. List the real names with:

```bash
su -l amp -c "ampinstmgr list"
```

Copy the **Instance Name** into `AMP_INSTANCE`.

### Sleep mode

AMP can put Minecraft to sleep when nobody is playing. While sleeping, the server uses almost no resources but keeps its port open. The first join attempt wakes it up, and joining works again after roughly 30 seconds. `/server status` reports this as "sleeping", and `/server start` wakes it. Sleep mode can be turned off in the instance's settings in AMP.

## Troubleshooting

| Error | Cause |
|-------|-------|
| `AMP login failed for user "..."` | `AMP_USER` or `AMP_PASS` is wrong. Use your AMP panel login. |
| `Instance "..." not found` | `AMP_INSTANCE` doesn't match a name from `ampinstmgr list` |
| `Instance login failed` | The AMP user doesn't have access to that instance |
| `AMP HTTP ...` or connection errors | AMP isn't running, or `AMP_URL` is wrong |
| Commands appear twice in Discord | Old global commands exist. Run `node utils/clear-global-commands.js`. |
| `Connection refused` in Minecraft | The server is stopped or still waking up. Check `/server status`. |
| Bot crashes with `status=11` (segmentation fault) | Node is older than v22. Upgrade Node, then `rm -rf node_modules && npm install`. |
| "You don't have permission to use this command." | The user isn't on the allow list. The owner can run `/access add @user`. |
| A new command doesn't appear in Discord | Run `node utils/deploy-commands.js`, then refresh Discord (Ctrl+R on Windows, Cmd+R on Mac). |

## Backups

`data/minecord.db` and `.env` exist only on the server, not in Git. If the bot runs in a Proxmox container, back up the whole container (select it, go to **Backup**, then **Backup now**), or schedule automatic backups under **Datacenter → Backup**.

## Setting Up the Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and give it a name.
3. Copy the **Application ID** from General Information into `CLIENT_ID`.
4. Go to **Bot**, click **Reset Token**, and copy it into `DISCORD_TOKEN`.
5. Optionally, turn off **Public Bot** so only you can invite it.
6. Under **OAuth2 → URL Generator**, select the `bot` and `applications.commands` scopes, plus at least the Send Messages permission.
7. Open the generated URL to invite the bot to your server.

## License

ISC