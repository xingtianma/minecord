require('dotenv').config();
const { getMap } = require('./db');
const { playMap } = require('./play');

(async () => {
  const name = process.argv[2];
  const map = getMap(name);
  if (!map) {
    console.log(`No map named "${name}". Usage: node utils/test-play <map name>`);
    process.exit(1);
  }

  try {
    const result = await playMap(map, {
      friendlyName: `minecord-test-${Date.now()}`,
      onProgress: msg => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`),
    });
    console.log('\nReady!', result);
    console.log(`Join at 192.168.1.236:${result.port}`);
    console.log(`To delete: node utils/test-create delete ${result.instanceName}`);
  } catch (err) {
    console.error('Failed:', err.message);
  }
})();