const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'minecord.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS allowed_users (
    discord_id TEXT PRIMARY KEY,
    added_by   TEXT NOT NULL,
    added_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const stmts = {
  isAllowed: db.prepare('SELECT 1 FROM allowed_users WHERE discord_id = ?'),
  add:       db.prepare('INSERT OR IGNORE INTO allowed_users (discord_id, added_by) VALUES (?, ?)'),
  remove:    db.prepare('DELETE FROM allowed_users WHERE discord_id = ?'),
  list:      db.prepare('SELECT discord_id, added_at FROM allowed_users ORDER BY added_at'),
};

module.exports = {
  isAllowed: id => id === process.env.OWNER_ID || !!stmts.isAllowed.get(id),
  addUser:    (id, by) => stmts.add.run(id, by).changes > 0,
  removeUser: id => stmts.remove.run(id).changes > 0,
  listUsers:  () => stmts.list.all(),
};