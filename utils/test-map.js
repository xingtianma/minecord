const { inspectMap } = require('./maps');

const file = process.argv[2];
if (!file) {
  console.log('Usage: node utils/test-map <zip file name in maps/>');
  process.exit(1);
}

try {
  console.log(inspectMap(file));
} catch (err) {
  console.error('Failed:', err.message);
}