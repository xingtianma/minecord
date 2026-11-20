require('dotenv').config({ path: require('node:path').join(__dirname, '..', '..', '.env') });
const { runCleanup } = require('../../lib/cleanup');

runCleanup({ dryRun: true })
  .then(() => console.log('Done. (Trial run: nothing was deleted.)'))
  .catch(err => console.error('Failed:', err.message));