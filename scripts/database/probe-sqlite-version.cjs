// Probe : version SQLite réelle embarquée + mode journal par défaut.
const { app } = require("electron");

app.whenReady().then(() => {
  try {
    const Database = require("better-sqlite3");
    const db = new Database(":memory:");
    const row = db.prepare("SELECT sqlite_version() AS v").get();
    const enc = db.pragma("encoding", { simple: true });
    console.log(JSON.stringify({ sqlite_version: row && row.v, encoding: enc }));
    db.close();
  } catch (err) {
    console.log(JSON.stringify({ fatal: String((err && err.message) || err) }));
  } finally {
    app.exit(0);
  }
});
