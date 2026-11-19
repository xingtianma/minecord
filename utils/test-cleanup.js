require('dotenv').config();
const { runCleanup } = require('./cleanup');

runCleanup({ dryRun: true })
  .then(() => console.log('Done. (Trial run: nothing was deleted.)'))
  .catch(err => console.error('Failed:', err.message));y