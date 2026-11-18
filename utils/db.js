const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'minecord.db'));
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS allowed_users (
    discord_id TEXT PRIMARY KEY,
    added_by   TEXT NOT NULL,
    added_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS maps (
    name       TEXT PRIMARY KEY,
    file_path  TEXT NOT NULL,
    mc_version TEXT,
    mode       TEXT NOT NULL DEFAULT 'reset' CHECK (mode IN ('reset', 'persistent')),
    added_by   TEXT NOT NULL,
    added_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS instances (
    instance_id    TEXT PRIMARY KEY,
    instance_name  TEXT NOT NULL,
    map_name       TEXT REFERENCES maps(name),
    owner_id       TEXT NOT NULL,
    port           INTEGER NOT NULL,
    temporary      INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    sleeping_since TEXT
  );
`);

const stmts = {
  isAllowed: db.prepare('SELECT 1 FROM allowed_users WHERE discord_id = ?'),
  add: db.prepare('INSERT OR IGNORE INTO allowed_users (discord_id, added_by) VALUES (?, ?)'),
  remove: db.prepare('DELETE FROM allowed_users WHERE discord_id = ?'),
  list: db.prepare('SELECT discord_id, added_at FROM allowed_users ORDER BY added_at'),
  addMap: db.prepare('INSERT INTO maps (name, file_path, mc_version, mode, added_by) VALUES (?, ?, ?, ?, ?)'),
  getMap: db.prepare('SELECT * FROM maps WHERE name = ?'),
  listMaps: db.prepare('SELECT name, mode, mc_version FROM maps ORDER BY name'),
  addInstance: db.prepare('INSERT INTO instances (instance_id, instance_name, map_name, owner_id, port) VALUES (?, ?, ?, ?, ?)'),
  tempInstances: db.prepare('SELECT * FROM instances WHERE temporary = 1'),
  markSleeping: db.prepare("UPDATE instances SET sleeping_since = datetime('now') WHERE instance_id = ?"),
  clearSleeping: db.prepare('UPDATE instances SET sleeping_since = NULL WHERE instance_id = ?'),
  removeInstance: db.prepare('DELETE FROM instances WHERE instance_id = ?'),
};

module.exports = {
  isAllowed: id => id === process.env.OWNER_ID || !!stmts.isAllowed.get(id),
  addUser: (id, by) => stmts.add.run(id, by).changes > 0,
  removeUser: id => stmts.remove.run(id).changes > 0,
  listUsers: () => stmts.list.all(),
};