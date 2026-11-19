require('dotenv').config();
const amp = require('./amp');

const pattern = /ReleaseStream|SpecificVersion|AllowCommandBlocks|Difficulty/i;

// Collect every setting (anything with a "Node" name) from AMP's nested settings list
function findSettings(obj, found = []) {
  if (Array.isArray(obj)) obj.forEach(item => findSettings(item, found));
  else if (obj && typeof obj === 'object') {
    if (typeof obj.Node === 'string') found.push(obj);
    else Object.values(obj).forEach(value => findSettings(value, found));
  }
  return found;
}

(async () => {
  try {
    const inst = await amp.findInstance(i => i.InstanceName === 'Minecraft01');
    const call = await amp.instanceApi(inst.InstanceID);
    const spec = await call('Core/GetSettingsSpec');

    for (const s of findSettings(spec).filter(s => pattern.test(s.Node))) {
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