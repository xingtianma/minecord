const crypto = require('node:crypto');

const AMP_URL = process.env.AMP_URL?.replace(/\/$/, '');
const AMP_USER = process.env.AMP_USER;
const AMP_PASS = process.env.AMP_PASS;

// Send one request to AMP's API
async function ampCall(endpoint, data = {}) {
  const res = await fetch(`${AMP_URL}/API/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/javascript' },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error(`AMP HTTP ${res.status}`);

  const json = await res.json();
  if (json?.Title || json?.Message) {
    throw new Error(`AMP: ${json.Title}: ${json.Message}`);
  }
  return json;
}

// Log in to the main AMP panel and return a session ID
async function login() {
  const result = await ampCall('Core/Login', {
    username: AMP_USER,
    password: AMP_PASS,
    token: '',
    rememberMe: false,
  });
  if (!result.success) throw new Error(`AMP login failed for user "${AMP_USER}".`);
  return result.sessionID;
}

// Call an action on the main panel (ADSModule)
async function ads(action, data = {}) {
  const SESSIONID = await login();
  return ampCall(`ADSModule/${action}`, { ...data, SESSIONID });
}

// Find the first instance that matches a condition
async function findInstance(match) {
  const targets = await ads('GetInstances');
  for (const target of targets) {
    for (const inst of target.AvailableInstances) {
      if (match(inst)) return inst;
    }
  }
  return null;
}

// The ID of this AMP install (the "target" new instances are created on)
async function getTargetId() {
  const targets = await ads('GetInstances');
  return targets[0].InstanceId ?? targets[0].InstanceID;
}

// Log in to one instance and return a function for calling its API
async function instanceApi(instanceId) {
  const sessionId = await login();
  const base = `ADSModule/Servers/${instanceId}/API`;

  const instLogin = await ampCall(`${base}/Core/Login`, {
    username: AMP_USER,
    password: AMP_PASS,
    token: '',
    rememberMe: false,
    SESSIONID: sessionId,
  });
  if (!instLogin.success) throw new Error(`Instance login failed for ${instanceId}.`);

  return (endpoint, data = {}) => ampCall(`${base}/${endpoint}`, { ...data, SESSIONID: instLogin.sessionID });
}

module.exports = {
  findInstance,
  instanceApi,
  // Reading
  getInstances:           () => ads('GetInstances'),
  getInstanceStatuses:    () => ads('GetInstanceStatuses'),
  getInstanceNetworkInfo: name => ads('GetInstanceNetworkInfo', { InstanceName: name }),

  // Creating and deleting
  createInstance: async ({ module, friendlyName }) => ads('CreateInstance', {
    TargetADSInstance: await getTargetId(),
    NewInstanceId: crypto.randomUUID(),
    Module: module,
    InstanceName: null,
    FriendlyName: friendlyName,
    IPBinding: '0.0.0.0',
    PortNumber: 0,
    AdminUsername: 'admin',
    AdminPassword: crypto.randomUUID(),
    ProvisionSettings: {},
    AutoConfigure: true,   // let AMP choose the name, port, etc.
  }),
  deleteInstance: name => ads('DeleteInstance', { InstanceName: name }),
  startInstance:  name => ads('StartInstance', { InstanceName: name }),
};