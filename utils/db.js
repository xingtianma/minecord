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
    file_name  TEXT NOT NULL,
    world_root TEXT NOT NULL,
    mc_version TEXT NOT NULL,
    mode       TEXT NOT NULL DEFAULT 'reset' CHECK (mode IN ('reset', 'persistent')),
    properties TEXT NOT NULL DEFAULT '{}',
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

// Access list
const stmts = {
  isAllowed: db.prepare('SELECT 1 FROM allowed_users WHERE discord_id = ?'),
  add:       db.prepare('INSERT OR IGNORE INTO allowed_users (discord_id, added_by) VALUES (?, ?)'),
  remove:    db.prepare('DELETE FROM allowed_users WHERE discord_id = ?'),
  list:      db.prepare('SELECT discord_id, added_at FROM allowed_users ORDER BY added_at'),
};

// Maps
const mapStmts = {
  add: db.prepare(`
    INSERT INTO maps (name, file_name, world_root, mc_version, mode, properties, added_by)
    VALUES (@name, @file_name, @world_root, @mc_version, @mode, @properties, @added_by)
  `),
  get:    db.prepare('SELECT * FROM maps WHERE name = ?'),
  list:   db.prepare('SELECT name, mc_version, mode FROM maps ORDER BY name'),
  remove: db.prepare('DELETE FROM maps WHERE name = ?'),
   update: db.prepare(`
    UPDATE maps SET
      file_name  = COALESCE(@file_name,  file_name),
      world_root = COALESCE(@world_root, world_root),
      mc_version = COALESCE(@mc_version, mc_version),
      mode       = COALESCE(@mode,       mode),
      properties = COALESCE(@properties, properties)
    WHERE name = @name
  `),
};

module.exports = {
  // Access
  isAllowed:  id => id === process.env.OWNER_ID || !!stmts.isAllowed.get(id),
  addUser:    (id, by) => stmts.add.run(id, by).changes > 0,
  removeUser: id => stmts.remove.run(id).changes > 0,
  listUsers:  () => stmts.list.all(),

  // Maps
  addMap:    map => mapStmts.add.run(map),
  getMap:    name => mapStmts.get.get(name),
  listMaps:  () => mapStmts.list.all(),
  removeMap: name => mapStmts.remove.run(name).changes > 0,
  updateMap: changes => mapStmts.update.run(changes).changes > 0,
};