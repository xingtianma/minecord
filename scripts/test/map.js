const { inspectMap } = require('../../lib/maps');

const file = process.argv[2];
if (!file) {
  console.log('Usage: node scripts/test/map <zip file name in maps/>');
  process.exit(1);
}

try {
  console.log(inspectMap(file));
} catch (err) {
  console.error('Failed:', err.message);
}