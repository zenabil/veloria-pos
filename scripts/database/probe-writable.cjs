// Probe : diagnostique l'erreur "attempt to write a readonly database".
// Lecture seule + écriture testée DANS un ROLLBACK (aucune donnée touchée).
const { app } = require("electron");
const os = require("node:os");

app.whenReady().then(() => {
  try {
    console.log(JSON.stringify({ user: os.userInfo().username, uid: os.userInfo().uid }));
    const Database = require("better-sqlite3");
    const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
    const p = arg || "C:\\ProgramData\\Veloria PoS\\Data\\Veloria POS DB.sqlite";
    // S2 : fileMustExist — sans lui, better-sqlite3 CRÉE une base vide si le
    // chemin est faux/absent, et le diagnostic « lecture seule » devenait
    // (ou pire, un writeProbe OK sur une base neuve) : un diagnostic qui
    // fabrique sa propre preuve. Absence = signal distinct (ENOENT).
    const db = new Database(p, { fileMustExist: true });
    console.log(
      JSON.stringify({
        journal_mode: db.pragma("journal_mode", { simple: true }),
        query_only: db.pragma("query_only", { simple: true }),
        locking_mode: db.pragma("locking_mode", { simple: true }),
      }),
    );
    try {
      db.exec("BEGIN IMMEDIATE; CREATE TABLE IF NOT EXISTS __probe_rw (x INTEGER); ROLLBACK;");
      console.log(JSON.stringify({ writeProbe: "OK" }));
    } catch (werr) {
      console.log(
        JSON.stringify({
          writeProbe: "FAIL",
          error: String((werr && werr.message) || werr),
          code: werr && werr.code,
        }),
      );
    }
    db.close();
  } catch (err) {
    console.log(JSON.stringify({ fatal: String((err && err.message) || err) }));
  } finally {
    app.exit(0);
  }
});
