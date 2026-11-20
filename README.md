# Minecord

A Discord bot for running Minecraft servers from Discord. It controls a main server through [AMP](https://cubecoders.com/AMP) (CubeCoders' Application Management Panel), and it can spin up **temporary servers from saved maps** (a Mario Party map for game night, say) that delete themselves once everyone has left.

## Features

- **Main server control**: start, stop, and check the status of your main Minecraft server
- **Smart start**: won't double-start a server, and edits its reply from "starting..." to "started!" when the server is up
- **Map library**: save map zips (uploaded straight from Discord, or placed on the server) along with the Minecraft version and server settings each map needs
- **Temporary servers**: `/play <map>` builds a fresh server with the right version, settings, and world, then replies with the address to join
- **Automatic cleanup**: temporary servers fall asleep when empty and are deleted about 10 minutes after the last player leaves
- **Access control**: only the owner and users on an allow list (stored in SQLite) can use the bot

## How It Works

```
Discord  →  Minecord bot  →  AMP API  →  Minecraft servers
                 │
                 ├── SQLite (access list, maps, temporary servers)
                 └── maps/ folder (saved map zips)
```

The bot talks to AMP's HTTP API to start, stop, create, configure and delete servers. For `/play`, it also writes directly into the new server's folder on disk (to copy the world in), so **the bot must run on the same machine as AMP**.

## Commands

| Command | Who | Description |
|---------|-----|-------------|
| `/ping` | Anyone | Health check |
| `/server start` | Access list | Starts (or wakes) the main server, then updates the message when it's online |
| `/server stop` | Access list | Stops the main server |
| `/server status` | Access list | Shows the main server's state and player count |
| `/play <map>` | Access list | Builds a temporary server for a saved map and replies with the address |
| `/map list` | Access list | Lists saved maps |
| `/map add` | Owner | Saves a map from a Discord attachment or a zip in the `maps/` folder |
| `/map edit` | Owner | Changes a map's version, mode, settings, or file |
| `/map files` | Owner | Lists zip files in the `maps/` folder |
| `/map remove` | Owner | Removes a saved map (the zip file is kept) |
| `/access add <user>` | Owner | Gives a user access to the bot |
| `/access remove <user>` | Owner | Removes a user's access |
| `/access list` | Owner | Lists users with access |

## Prerequisites

- **Linux**, on the same machine (or container) as AMP
- [Node.js](https://nodejs.org/) **v22+** (v24 LTS recommended). `better-sqlite3` crashes with a segmentation fault on older versions.
- [AMP](https://cubecoders.com/AMP) with a Minecraft Java Edition instance for the main server
- An AMP user account with access to the instances
- A [Discord bot application](https://discord.com/developers/applications)
- The bot must run as **root** (or a user that can write to `/home/amp/.ampdata/instances` and run `chown`)

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/xingtianma/minecord.git
cd minecord
npm install
```

### 2. Configure `.env`

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

# Address shown to players by /play (optional, defaults to the LAN IP)
MC_ADDRESS=your.public.ip.or.domain
```

- `CLIENT_ID` is the **Application ID** from the Developer Portal's General Information page, not the Public Key.
- `OWNER_ID` is your Discord user ID. Turn on **User Settings → Advanced → Developer Mode**, then right-click your name and choose **Copy User ID**.
- `AMP_USER` / `AMP_PASS` are your **AMP panel** login, not your Linux login.
- `AMP_INSTANCE` is the main server's internal instance name. Find it with `su -l amp -c "ampinstmgr list"`.
- `MC_ADDRESS` is what `/play` tells players to connect to. See [Letting Friends Join](#letting-friends-join).

`.env`, `data/` and `maps/` are git-ignored. Never commit them.

### 3. Deploy slash commands and run

```bash
node utils/deploy-commands.js
node index.js
```

Commands are registered as **guild commands** for the server in `GUILD_ID`, so changes show up instantly.

## Running as a Service

Create `/etc/systemd/system/minecord.service`:

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

```bash
systemctl daemon-reload
systemctl enable --now minecord
```

Day-to-day commands:

```bash
systemctl status minecord      # is the bot running?
journalctl -u minecord -f      # live logs
systemctl restart minecord     # apply code or .env changes
```

Don't run a second copy of the bot (for example on your PC) while the service is running, or both will answer commands.

## Updating

| What changed | What to run |
|--------------|-------------|
| Code inside a command, `utils/`, `index.js`, or `.env` | `systemctl restart minecord` |
| A command was added, or a command's name, description, or options changed | `node utils/deploy-commands.js`, then restart |
| An npm package was added | `npm install`, then restart |

## Access Control

The owner (`OWNER_ID`) always has access and is the only one who can manage maps and the access list. The owner isn't stored in the database, so you can't lock yourself out. Everyone else needs `/access add`. Commands listed in `PUBLIC_COMMANDS` in `index.js` (currently just `ping`) are open to all.

The check runs in `index.js` before every command, so new commands are protected automatically.

## Maps

A saved map is a zip in `maps/` plus a database record describing how to run it:

| Field | Example | Purpose |
|-------|---------|---------|
| name | `marioparty` | What you type in `/play` |
| file | `mario-party-5618-v1.4.3.zip` | The zip in `maps/` |
| world folder | `MarioParty` | Where `level.dat` is inside the zip (found automatically) |
| version | `1.20.1` | The Minecraft version the server will run |
| mode | `reset` | `reset` = fresh world every time; `persistent` = keep progress (not fully supported yet, see below) |
| settings | `enable-command-block=true,difficulty=easy` | Server settings the map needs |

### Adding a map

**From Discord:** `/map add` with `name`, `version`, and the zip as `attachment`. Uploads are limited by your Discord account's upload limit (10 MB on free accounts) and by the bot's own limit (`MAX_UPLOAD_MB` in `map.js`, 500 MB by default).

**From the server:** for big files, copy the zip into `maps/` first (drag it onto the folder in VS Code's Remote-SSH explorer, or use `scp`), then `/map add` with `name`, `version`, and `file`.

Check the map's download page for the Minecraft version and any required settings. Many minigame maps need `enable-command-block=true`.

## Temporary Servers

`/play <map>` builds a new server in about a minute:

1. Creates an AMP instance (AMP picks the name and port)
2. Waits for it to come up, then stops Minecraft
3. Applies the map's version, settings, and sleep mode
4. Downloads that Minecraft version
5. Replaces the world with the map's world, writes the remaining settings to `server.properties`, and accepts the EULA
6. Starts the server and replies with the address

If anything fails partway, the half-built server is deleted automatically.

Only one temporary server can exist at a time (`MAX_TEMP_SERVERS` in `commands/utility/play.js`), to keep RAM in check.

### Cleanup

Every minute, the bot checks its temporary servers:

- **Awake**: kept.
- **Asleep or stopped**: a sleep timer starts. Temporary servers fall asleep after 5 minutes with nobody online.
- **Asleep 5+ minutes and created 15+ minutes ago**: deleted.

In practice, a server is deleted about 10 minutes after the last player leaves. The bot only ever deletes servers it created and recorded in its database. Servers made by hand in AMP are never touched.

Persistent-mode maps are never deleted automatically, because saving the world back to the library isn't built yet.

### Sleep mode

A sleeping server uses almost no resources but keeps its port open. The first join attempt wakes it up, and joining works again after about 30 seconds.

## Letting Friends Join

`192.168.x.x` addresses only work on your home network. For friends elsewhere:

1. **Forward ports** on your router to the bot's machine. Temporary servers get ports like 25566, 25567, and so on, so forward a small range (for example 25565–25570, TCP).
2. **Set `MC_ADDRESS`** in `.env` to your public IP, or to a dynamic DNS name if your IP changes.

If you'd rather not open ports, tools like Tailscale or playit.gg work without router changes.

## Project Structure

```
minecord/
├── index.js                     # Entry point: loads commands, permission check, cleanup schedule
├── commands/utility/
│   ├── access.js                # /access
│   ├── map.js                   # /map
│   ├── ping.js                  # /ping
│   ├── play.js                  # /play
│   └── server.js                # /server (main server)
├── utils/
│   ├── amp.js                   # AMP API helpers (login, create, delete, settings)
│   ├── cleanup.js               # Deletes sleeping temporary servers
│   ├── db.js                    # SQLite tables and queries
│   ├── deploy-commands.js       # Registers slash commands with Discord
│   ├── maps.js                  # Reads map zips (finds level.dat)
│   ├── play.js                  # Builds a temporary server from a map
│   └── test-*.js                # Manual test scripts (see below)
├── data/minecord.db             # Database (git-ignored, created automatically)
├── maps/                        # Saved map zips (git-ignored)
├── .env                         # Credentials (git-ignored)
└── package.json
```

### Test scripts

| Script | What it does |
|--------|--------------|
| `node utils/test-amp` | Lists AMP instances (read-only) |
| `node utils/test-map <zip>` | Shows where the world is inside a zip in `maps/` (read-only) |
| `node utils/test-settings` | Prints key settings of `Minecraft01` (read-only) |
| `node utils/test-play <map>` | Builds a temporary server without Discord |
| `node utils/test-create delete <InstanceName>` | Deletes a server whose display name starts with `minecord-test-` |
| `node utils/test-cleanup` | Runs the cleanup check in trial mode (deletes nothing) |

## Troubleshooting

| Problem | Cause |
|---------|-------|
| `AMP login failed for user "..."` | `AMP_USER` / `AMP_PASS` are wrong. Use the AMP panel login. |
| `Instance "..." not found` | `AMP_INSTANCE` doesn't match `ampinstmgr list` |
| Bot crashes with `status=11` | Node is older than v22. Upgrade, then `rm -rf node_modules && npm install`. |
| A new command doesn't appear | Run `node utils/deploy-commands.js`, then refresh Discord (Ctrl+R / Cmd+R) |
| Commands appear twice | Old global commands exist alongside guild commands. Clear the global ones. |
| `/play` says a server is already running | The one-server limit. Wait for cleanup, or delete the server and its record. |
| `/play` times out or says AMP is waiting for input | Check the new instance's console in the AMP panel |
| Map board doesn't work | Command blocks are probably off. `/map edit` with `properties: enable-command-block=true`. |
| `Connection refused` in Minecraft | The server is asleep and waking, or stopped. Wait 30 seconds and try again. |
| Push rejected for a large file | A map zip was committed. Make sure `maps/` is in `.gitignore`, then untrack it with `git rm -r --cached maps`. |

## Backups

`.env`, `data/` and `maps/` exist only on the server. If the bot runs in a Proxmox container, back up the whole container, or schedule backups under **Datacenter → Backup**.

## License

ISC