const fs = require('fs');
const path = require('path');

// Backups live inside the hub folder, never inside the user's project.
const BACKUPS_DIR = path.join(__dirname, '..', '..', 'backups');

function backup(projectId, absFile, relPath) {
  try {
    if (!fs.existsSync(absFile)) return;
    const safe = String(relPath).replace(/[\\/]/g, '__');
    const dir = path.join(BACKUPS_DIR, projectId);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(absFile, path.join(dir, safe));
  } catch {
    /* backup is best-effort */
  }
}

module.exports = { backup, BACKUPS_DIR };
