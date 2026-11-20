require('dotenv').config({ path: require('node:path').join(__dirname, '..', '..', '.env') });
const amp = require('../../lib/amp');

const pattern = /ReleaseStream|SpecificVersion|AllowCommandBlocks|Difficulty/i;

(async () => {
  try {
    const inst = await amp.findInstance(i => i.InstanceName === 'Minecraft01');
    const call = await amp.instanceApi(inst.InstanceID);
    const spec = await call('Core/GetSettingsSpec');

    for (const s of amp.findSettings(spec).filter(s => pattern.test(s.Node))) {
      console.log(s.Node);
      console.log(`   current: ${JSON.stringify(s.CurrentValue)}`);
      if (s.EnumValues && !/SpecificVersion/.test(s.Node)) {
        console.log(`   options: ${JSON.stringify(s.EnumValues)}`);
      }
    }
  } catch (err) {
    console.error('Test failed:', err.message);
  }
})();