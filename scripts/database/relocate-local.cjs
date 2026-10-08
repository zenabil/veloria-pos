// Veloria — Exploitation locale : déplace la base vers un dossier inscriptible.
// Exécution : npx electron ./scripts/database/relocate-local.cjs [--to=<dossier>]
// Cas d'usage : la base ProgramData hérite parfois d'ACLs lecture-seule
// (fichier créé par un processus élevé) et l'app tourne en utilisateur standard
// → "attempt to write a readonly database". Ce script applique le protocole
// applicatif (copie → contrôle readonly → bascule config.json) vers le repli
// prévu par database-path.service (userData/Data), sans toucher au schéma.
// CommonJS volontaire : l'ESM suspend app.whenReady() sur ce runtime.
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const cliArgs = process.argv.slice(2);
function flagValue(name) {
  const hit = cliArgs.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

// userData RÉEL du POS (jamais celui du Manager).
app.setPath("userData", path.join(app.getPath("appData"), "Veloria PoS"));

function isWritableFile(p) {
  // P0: fs.accessSync(W_OK) لا يكشف رفض ACL على Windows (يفحص السمة فقط).
  // الاختبار الحقيقي الوحيد : فتح فعلي للكتابة ثم إغلاق فوري (بدون تعديل).
  let fd = null;
  try {
    fd = fs.openSync(p, "r+");
    return true;
  } catch {
    return false;
  } finally {
    try {
      if (fd !== null) fs.closeSync(fd);
    } catch {
      /* ignore */
    }
  }
}

app.whenReady().then(() => {
  let code = 0;
  try {
    const pathSvc = require(
      path.join(root, "dist-electron", "database", "database-path.service.js"),
    );
    const security = require(path.join(root, "dist-electron", "security", "security.js"));
    const Database = require("better-sqlite3");

    const current = pathSvc.getConfiguredDbPath();
    const curExists = fs.existsSync(current);
    if (curExists && isWritableFile(current)) {
      console.log(JSON.stringify({ moved: false, reason: "already-writable", path: current }));
      return;
    }

    const destDirRaw = flagValue("--to");
    const destDir = destDirRaw
      ? security.assertSafeUserFolder(path.normalize(destDirRaw))
      : path.join(app.getPath("userData"), "Data");
    security.assertSafeUserFolder(destDir);
    const target = path.join(destDir, "Veloria POS DB.sqlite");
    if (!security.isAllowedDatabaseFile(target)) throw new Error("Destination invalide.");
    if (path.normalize(target).toLowerCase() === path.normalize(current).toLowerCase()) {
      throw new Error("La base est déjà à cet emplacement.");
    }
    if (fs.existsSync(target)) {
      throw new Error("La destination contient déjà une base. Choisissez un dossier vide.");
    }
    if (!curExists) throw new Error("Base actuelle introuvable.");

    fs.mkdirSync(path.dirname(target), { recursive: true });
    // WAL actif : wal_checkpoint(TRUNCATE) rabat les frames dans le fichier
    // principal AVANT toute copie — copier main + -wal séparément est une
    // course. Base lecture-seule (cas nominal ici) : checkpoint impossible,
    // on copie ALORS les compagnons, et tout échec devient fatal (un -wal
    // abandonné silencieusement = transactions perdues malgré un probe vert).
    let collapsed = false;
    let ck = null;
    try {
      ck = new Database(current, { fileMustExist: true });
      const row = ck.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
      if (row && Number(row.busy) === 0) collapsed = true;
    } catch {
      collapsed = false; // Lecture seule : repli copie stricte des compagnons.
    } finally {
      try {
        if (ck) ck.close();
      } catch {
        /* ignore */
      }
    }
    fs.copyFileSync(current, target);
    if (!collapsed) {
      for (const suffix of ["-wal", "-shm", "-journal"]) {
        const src = `${current}${suffix}`;
        if (fs.existsSync(src) && fs.statSync(src).size > 0) {
          try {
            fs.copyFileSync(src, `${target}${suffix}`);
          } catch (err) {
            throw new Error(
              `Compagnon ${suffix} illisible : déplacement annulé (${err instanceof Error ? err.message : String(err)}).`,
            );
          }
        }
      }
    }
    // Contrôle readonly miroir de verifyDbFileCopy (jamais la connexion principale).
    let probe = null;
    try {
      probe = new Database(target, { readonly: true, fileMustExist: true });
      const rows = probe.prepare("PRAGMA integrity_check").all();
      if (rows.length !== 1 || rows[0].integrity_check !== "ok") {
        throw new Error("Copie corrompue (integrity_check).");
      }
      if (probe.prepare("PRAGMA foreign_key_check").all().length !== 0) {
        throw new Error("Copie incohérente (foreign_key_check).");
      }
      const row = probe.prepare("SELECT MAX(version) AS v FROM schema_migrations").get();
      const schemaVersion = row && row.v ? row.v : 0;
      if (schemaVersion <= 0) throw new Error("Copie sans migrations.");
    } finally {
      try {
        if (probe) probe.close();
      } catch {
        /* ignore */
      }
    }
    // La copie doit être inscriptible, sinon le déplacement est inutile.
    if (!isWritableFile(target)) throw new Error("Destination non inscriptible.");
    pathSvc.persistDbPath(target);
    // Relecture : le prochain démarrage utilisera ce chemin.
    const effective = pathSvc.getConfiguredDbPath();
    if (path.normalize(effective).toLowerCase() !== path.normalize(target).toLowerCase()) {
      throw new Error("Bascule non persistée.");
    }
    console.log(JSON.stringify({ moved: true, from: current, path: target }));
  } catch (err) {
    console.error(`ÉCHEC: ${err instanceof Error ? err.message : String(err)}`);
    code = 1;
  } finally {
    app.exit(code);
  }
});
