const AdmZip = require('adm-zip');
const path = require('node:path');

const MAPS_DIR = path.join(__dirname, '..', 'maps');

// Look inside a map zip and find where the world starts (the folder with level.dat)
function inspectMap(fileName) {
  const safeName = path.basename(fileName);   // blocks paths like ../../etc/passwd
  const zipPath = path.join(MAPS_DIR, safeName);
  const zip = new AdmZip(zipPath);

  const levelFiles = zip.getEntries()
    .map(entry => entry.entryName)
    .filter(name => name === 'level.dat' || name.endsWith('/level.dat'));

  if (levelFiles.length === 0) {
    throw new Error("No level.dat found, so this zip doesn't contain a Minecraft world.");
  }

  // If there are several, the shortest path is the main world
  levelFiles.sort((a, b) => a.length - b.length);
  const folder = path.posix.dirname(levelFiles[0]);

  return {
    zipPath,
    worldRoot: folder === '.' ? '' : folder,   // '' means level.dat is at the top
  };
}

module.exports = { MAPS_DIR, inspectMap };