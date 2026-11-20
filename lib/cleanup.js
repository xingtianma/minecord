const amp = require('./amp');
const db = require('./db');

const { STATE } = amp;

const MIN_AGE_MINUTES = 15;     // never delete a server younger than this
const MIN_ASLEEP_MINUTES = 5;   // must be asleep this long before deleting

async function runCleanup({ dryRun = true, log = console.log } = {}) {
  const rows = db.listInstancesWithAges();
  if (rows.length === 0) return log('No temporary servers.');

  for (const row of rows) {
    const label = `${row.instance_name} (${row.map_name})`;

    // Deleted by hand in the AMP panel? Then just forget it.
    const inst = await amp.findInstance(i => i.InstanceID === row.instance_id);
    if (!inst) {
      log(`${label}: no longer exists in AMP, ${dryRun ? 'would remove' : 'removing'} its record`);
      if (!dryRun) db.removeInstance(row.instance_id);
      continue;
    }

    // Check its state. If that fails, leave it alone this time.
    let state;
    try {
      const call = await amp.instanceApi(row.instance_id);
      ({ State: state } = await call('Core/GetStatus'));
    } catch (err) {
      log(`${label}: couldn't check its status (${err.message}), skipping`);
      continue;
    }

    // Awake: reset the sleep timer and keep it
    if (state !== STATE.SLEEPING && state !== STATE.STOPPED) {
      db.clearSleeping(row.instance_id);
      log(`${label}: awake (state ${state}), keeping`);
      continue;
    }

    // Asleep or stopped: start (or continue) the sleep timer
    db.markSleeping(row.instance_id);
    const age = row.age_minutes;
    const asleep = row.asleep_minutes ?? 0;

    if (age < MIN_AGE_MINUTES || asleep < MIN_ASLEEP_MINUTES) {
      log(`${label}: asleep ${asleep.toFixed(1)} min, ${age.toFixed(1)} min old, waiting`);
      continue;
    }

    // Persistent maps would need their world saved first, which isn't built yet
    if (db.getMap(row.map_name)?.mode === 'persistent') {
      log(`${label}: persistent map, keeping (saving worlds isn't supported yet)`);
      continue;
    }

    if (dryRun) {
      log(`${label}: WOULD DELETE (asleep ${asleep.toFixed(1)} min)`);
      continue;
    }

    log(`${label}: deleting`);
    await amp.deleteInstance(row.instance_name);
    db.removeInstance(row.instance_id);
  }
}

module.exports = { runCleanup };