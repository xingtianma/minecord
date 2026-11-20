require('dotenv').config({ path: require('node:path').join(__dirname, '..', '..', '.env') });
const amp = require('../../lib/amp');

const PREFIX = 'minecord-test-';

async function create() {
  // Copy the module name from your existing Minecraft server
  const existing = await amp.findInstance(i => /minecraft/i.test(i.Module ?? ''));
  const module = existing?.Module ?? 'Minecraft';
  const friendlyName = PREFIX + Date.now();

  console.log(`Creating "${friendlyName}" using module "${module}"...`);
  const result = await amp.createInstance({ module, friendlyName });
  console.log('CreateInstance result:', JSON.stringify(result));

  // AMP creates instances in the background, so wait for it to appear
  for (let i = 0; i < 12; i++) {
    await amp.wait(5000);
    const inst = await amp.findInstance(x => x.FriendlyName === friendlyName);
    if (inst) {
      console.log(`Created! InstanceName: ${inst.InstanceName}  ID: ${inst.InstanceID}`);
      console.log(`To delete it: node scripts/test/create delete ${inst.InstanceName}`);
      return;
    }
    console.log('Waiting for it to appear...');
  }
  console.log('It did not appear within 60 seconds. Check the AMP panel.');
}

async function remove(name) {
  const inst = await amp.findInstance(x => x.InstanceName === name);
  if (!inst) return console.log(`No instance named "${name}".`);

  // Safety: only delete servers this script created
  if (!inst.FriendlyName?.startsWith(PREFIX)) {
    return console.log(`Refusing: "${name}" was not created by this test script.`);
  }

  const result = await amp.deleteInstance(name);
  console.log('DeleteInstance result:', JSON.stringify(result));
}

(async () => {
  const [action, name] = process.argv.slice(2);
  try {
    if (action === 'create') await create();
    else if (action === 'delete' && name) await remove(name);
    else console.log('Usage: node scripts/test/create create\n       node scripts/test/create delete <InstanceName>');
  } catch (err) {
    console.error('Test failed:', err.message);
  }
})();