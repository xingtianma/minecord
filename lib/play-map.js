const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const AdmZip = require('adm-zip');
const amp = require('./amp');
const { MAPS_DIR } = require('./maps');

const { STATE, wait } = amp;
const INSTANCES_DIR = '/home/amp/.ampdata/instances';
const POLL_MS = 5000;

// Map settings that AMP manages, translated into AMP's own setting names
const DIFFICULTY = { peaceful: '0', easy: '1', normal: '2', hard: '3' };
const AMP_MANAGED = ['enable-command-block', 'difficulty'];

function toAmpSettings(map) {
    const props = JSON.parse(map.properties);
    const settings = {
        'MinecraftModule.Minecraft.ReleaseStream': '3',   // Specific Version
        'MinecraftModule.Minecraft.SpecificVersion': `${map.mc_version} (release)`,
        'MinecraftModule.Limits.SleepMode': 'true',
        'MinecraftModule.Limits.SleepDelayMinutes': '5',
        'MinecraftModule.Limits.SleepOnStart': 'false',
    };
    if (props['enable-command-block']) {
        settings['MinecraftModule.Game.AllowCommandBlocks'] = props['enable-command-block'];
    }
    if (props.difficulty && DIFFICULTY[props.difficulty]) {
        settings['MinecraftModule.Game.Difficulty'] = DIFFICULTY[props.difficulty];
    }
    return settings;
}

// Settings AMP doesn't manage go straight into server.properties
function writeServerProperties(file, props) {
    const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : [];
    for (const [key, value] of Object.entries(props)) {
        if (AMP_MANAGED.includes(key)) continue;
        const i = lines.findIndex(line => line.startsWith(`${key}=`));
        if (i >= 0) lines[i] = `${key}=${value}`;
        else lines.push(`${key}=${value}`);
    }
    fs.writeFileSync(file, lines.join('\n'));
}

function readPort(serverDir) {
    const text = fs.readFileSync(path.join(serverDir, 'server.properties'), 'utf8');
    return Number(text.match(/^server-port=(\d+)/m)?.[1]);
}

// Copy the map's world folder out of the zip into the server's world folder
function extractWorld(map, worldDir) {
    const zip = new AdmZip(path.join(MAPS_DIR, map.file_name));
    const prefix = map.world_root ? `${map.world_root}/` : '';
    fs.mkdirSync(worldDir, { recursive: true });

    for (const entry of zip.getEntries()) {
        if (entry.isDirectory || !entry.entryName.startsWith(prefix)) continue;
        const target = path.resolve(worldDir, entry.entryName.slice(prefix.length));
        if (!target.startsWith(worldDir + path.sep)) continue;   // block files escaping the folder
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, entry.getData());
    }
}

// Keep trying something until it works or time runs out
async function waitFor(check, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const result = await check();
            if (result) return result;
        } catch { /* not ready yet */ }
        await wait(POLL_MS);
    }
    throw new Error(`Timed out waiting for ${label}.`);
}

// Wait until the Minecraft server reaches a state we want
async function waitForState(call, isDone, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const { State } = await call('Core/GetStatus');
        if (isDone(State)) return State;

        if (State === STATE.FAILED) throw new Error(`The server failed while ${label}. Check the AMP console.`);
        if (State === STATE.AWAITING_INPUT) throw new Error(`AMP is waiting for input while ${label}. Check the AMP panel.`);
        await wait(POLL_MS);
    }
    throw new Error(`Timed out while ${label}.`);
}

async function playMap(map, { friendlyName, onProgress = () => { }, onCreated = () => { } }) {
    // 1. Create the server
    onProgress('Creating server...');
    const existing = await amp.findInstance(i => /minecraft/i.test(i.Module ?? ''));
    await amp.createInstance({ module: existing?.Module ?? 'Minecraft', friendlyName });
    const inst = await waitFor(
        () => amp.findInstance(i => i.FriendlyName === friendlyName), 120_000, 'the server to be created');

    if (!/^[A-Za-z0-9_-]+$/.test(inst.InstanceName)) {
        throw new Error(`Unexpected instance name: ${inst.InstanceName}`);
    }
    onCreated(inst);

    // 2. Wait for it to come up, then stop Minecraft
    onProgress('Waiting for the server to come up...');
    await amp.startInstance(inst.InstanceName).catch(() => { });   // fine if already running
    const call = await waitFor(() => amp.instanceApi(inst.InstanceID), 120_000, 'the server to come up');

    onProgress('Preparing...');
    await waitForState(call, s => [STATE.STOPPED, STATE.RUNNING, STATE.SLEEPING].includes(s), 600_000, 'finishing its first setup');
    await call('Core/Stop').catch(() => { });
    await waitForState(call, s => s === STATE.STOPPED, 120_000, 'stopping');

    // 3. Apply the version and map settings
    onProgress(`Setting up Minecraft ${map.mc_version}...`);
    await call('Core/SetConfigs', { data: toAmpSettings(map) });

    // 4. Download that version
    onProgress(`Downloading Minecraft ${map.mc_version}...`);
    await call('Core/UpdateApplication');
    await waitForState(call, s => s !== STATE.STOPPED, 30_000, 'starting the download').catch(() => { });
    await waitForState(call, s => s === STATE.STOPPED, 600_000, 'downloading');

    // 5. Swap in the map's world
    onProgress('Copying the map...');
    const serverDir = path.join(INSTANCES_DIR, inst.InstanceName, 'Minecraft');
    const worldDir = path.join(serverDir, 'world');
    fs.rmSync(worldDir, { recursive: true, force: true });
    extractWorld(map, worldDir);
    writeServerProperties(path.join(serverDir, 'server.properties'), JSON.parse(map.properties));
    fs.writeFileSync(path.join(serverDir, 'eula.txt'), 'eula=true\n');   // otherwise it waits in state 100
    execFileSync('chown', ['-R', 'amp:amp', serverDir]);                 // files written as root are unreadable to AMP

    // 6. Start it
    onProgress('Starting Minecraft...');
    await call('Core/Start');
    await waitForState(call, s => s === STATE.RUNNING || s === STATE.SLEEPING, 300_000, 'starting');

    return {
        instanceName: inst.InstanceName,
        instanceId: inst.InstanceID,
        port: readPort(serverDir),
    };
}

module.exports = { playMap };
