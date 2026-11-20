require('dotenv').config({ path: require('node:path').join(__dirname, '..', '..', '.env') });
const { getMap } = require('../../lib/db');
const { playMap } = require('../../lib/play-map');

(async () => {
  const name = process.argv[2];
  const map = getMap(name);
  if (!map) {
    console.log(`No map named "${name}". Usage: node scripts/test/play <map name>`);
    process.exit(1);
  }

  try {
    const result = await playMap(map, {
      friendlyName: `minecord-test-${Date.now()}`,
      onProgress: msg => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`),
    });
    console.log('\nReady!', result);
    console.log(`Join at ${process.env.MC_ADDRESS || '192.168.1.236'}:${result.port}`);
    console.log(`To delete: node scripts/test/create delete ${result.instanceName}`);
  } catch (err) {
    console.error('Failed:', err.message);
  }
})();