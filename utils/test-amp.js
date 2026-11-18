require('dotenv').config();
const amp = require('./amp');

(async () => {
  try {
    const targets = await amp.getInstances();
    console.log('Instances:');
    for (const target of targets) {
      for (const inst of target.AvailableInstances) {
        console.log(`- ${inst.InstanceName} | ${inst.FriendlyName} | ${inst.InstanceID}`);
      }
    }
  } catch (err) {
    console.error('Test failed:', err.message);
  }
})();