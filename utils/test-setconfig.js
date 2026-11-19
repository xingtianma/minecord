require('dotenv').config();
const amp = require('./amp');

const TARGET = 'temp01';   // only ever touches this test server

const settings = {
  'MinecraftModule.Minecraft.ReleaseStream':   '3',                 // Specific Version
  'MinecraftModule.Minecraft.SpecificVersion': '1.20.1 (release)',
  'MinecraftModule.Game.Difficulty':           '1',                 // Easy
  'MinecraftModule.Game.AllowCommandBlocks':   'true',
};

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
    const inst = await amp.findInstance(i => i.InstanceName === TARGET);
    if (!inst) throw new Error(`${TARGET} not found`);
    const call = await amp.instanceApi(inst.InstanceID);

    const result = await call('Core/SetConfigs', { data: settings });
    console.log('SetConfigs result:', JSON.stringify(result));

    // Read the settings back to confirm they changed
    const spec = await call('Core/GetSettingsSpec');
    for (const s of findSettings(spec).filter(s => s.Node in settings)) {
      console.log(`${s.Node} = ${JSON.stringify(s.CurrentValue)}`);
    }
  } catch (err) {
    console.error('Test failed:', err.message);
  }
})();