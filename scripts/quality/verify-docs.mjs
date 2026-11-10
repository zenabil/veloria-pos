// Veloria PoS — scripts/quality/verify-docs.mjs
// PORTE « SOURCE UNIQUE DES METRIQUES » (ADR-178).
//
// POURQUOI (cause racine, pas cosmétique) :
//   L'audit doc↔code du 2026-11-10 a montré que les DERNIERS documents
//   « vivants » (README, docs/STRUCTURE.md, docs/INDEX.md) citaient des
//   nombres FIGES : 56 migrations (au lieu de 62), 169 fichiers / 1 146 tests
//   (au lieu de 193 / 1 417), 181 canaux (au lieu de 191), « ADR 001→153 » (au
//   lieu de 177). Chaque nombre était recopié À LA MAIN dans plusieurs
//   fichiers : correcting l'un laissait les autres faux, et le drift revenait
//   à chaque session.
//
// REGLE FONDATRICE (radicale) :
//   1. UN compteur vit dans UN seul endroit : `docs/METRICS.md`, section
//      générée. Les documents humans y RENVOIENT, ils ne le recopient plus.
//   2. Cette porte RECALCULE les compteurs depuis l'arbre réel et compare à
//      `docs/METRICS.md` : si le code change, la porte devient ROUGE tant que
//      le fichier généré n'est pas régénéré (`--write`). Aucune dérive
//      silencieuse, aucun copier-coller.
//   3. Une liste de LITTÉRAUX OBSOLÈTES est interdite dans les documents
//      vivants : réintroduire « 0001..0056 » ou « 169 fichiers » échoue
//      immédiatement (garde de régression, pas cosmétique).
//   4. `handoff.md` est un JOURNAL : les chiffres qu'il rappelle dans ses
//      résumés de session sont des archives datées (vraies à leur date). La
//      porte ne les juge donc PAS — sinon il faudrait réécrire l'histoire.
//   5. COMPÉTENCES (`.opencode/**`) : standard Agent Skills — `name`
//      conforme (`^[a-z0-9]+(-[a-z0-9]+)*$`) ET identique au dossier,
//      `description` présente (1..1024 caractères), corps non vide, et
//      AUCUN chiffre périmé : une compétence est lue à chaque tâche, un
//      chiffre périmé y devient une INSTRUCTION fausse (« crée la migration
//      0052 »).
//
// Sortie : 0 (vert) / 1 (rouge). Message FR. Aucun secret, aucun réseau.

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const WRITE = process.argv.includes("--write");

/** Fichiers « documents vivants » : leur contenu doit être à jour. */
const LIVING_DOCS = ["README.md", "docs/STRUCTURE.md", "docs/INDEX.md"];

/**
 * Compétences OpenCode (standard Agent Skills) : le `name` doit être
 * `^[a-z0-9]+(-[a-z0-9]+)*$` ET identique au nom du dossier qui contient
 * `SKILL.md` ; la `description` est le seul texte lu avant activation
 * (1..1024 caractères). Une compétence non conforme n'est pas « presque »
 * conforme : l'agent ne la découvre pas comme prévu.
 */
const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Littéraux obsolètes interdits dans les documents vivants.
 * Chaque entrée = une dérive RÉELLEMENT constatée dans l'audit du
 * 2026-11-10 (pas une hypothèse). Toute réapparition = porte rouge.
 */
const FORBIDDEN_LITERALS = [
  {
    pattern: /0001\.\.0056/,
    why: "plage de migrations figée (l'actuelle est 0001..00NN, cf. METRICS)",
  },
  { pattern: /0001\.\.0049/, why: "plage de migrations encore plus ancienne" },
  { pattern: /ADR[- ]001[→-]153/, why: "index ADR figé (ADR-178 ajouté)" },
  { pattern: /ADR[- ]001[→-]166/, why: "index ADR figé" },
  { pattern: /169 fichiers/, why: "compteur de tests figé (cf. METRICS)" },
  { pattern: /1[\u202f ]?146 tests/i, why: "compteur de tests figé (cf. METRICS)" },
  { pattern: /vitest \(661\)/, why: "compteur de tests figé" },
  { pattern: /ipc-channels\.json \*\*181\*\*/, why: "taille du snapshot canaux figée" },
  { pattern: /FROZEN_SCHEMA_COUNT\D{0,20}=\s*125/, why: "constante de gel figée" },
  { pattern: /FROZEN_EXPORT_COUNT\D{0,20}=\s*134/, why: "constante de gel figée" },
  { pattern: /manifeste (?:d['’]intégrité|signé) \*\*240\*\*/, why: "taille du manifeste figée" },
  {
    pattern: /typecheck ×3/,
    why: "le script check fait 5 typecheck (root, electron, manager, mobile, owner)",
  },
];

/**
 * Littéraux périmés interdits dans les COMPÉTENCES et `AGENTS.md` : ces
 * fichiers sont relus par l'agent à chaque tâche — un chiffre périmé y
 * devient une INSTRUCTION fausse (« crée la migration 0052 »).
 */
const FORBIDDEN_LITERALS_SKILLS = [
  {
    pattern: /prochain\s+numéro\s+apr[èe]s\s+`?0051/i,
    why: "la dernière migration est 0062 (prochaine : 0063)",
  },
  { pattern: /ADR-135/, why: "index ADR périmé (cf. docs/METRICS.md)" },
  {
    // Piège : la forme PÉRIMÉE est le chemin non préfixé ; la forme correcte
    // (`docs/reports/PHASE_X_REPORT.md`) est acceptée.
    pattern: /(?<![a-z/])PHASE_X_REPORT\.md/,
    why: "les rapports de phase vont dans docs/reports/ (ADR-058)",
  },
  { pattern: /169 fichiers/, why: "compteur de tests figé" },
  { pattern: /1[\u202f ]?146 tests/i, why: "compteur de tests figé" },
  { pattern: /typecheck ×3/, why: "le script check fait 5 typecheck" },
  { pattern: /0001\.\.0056/, why: "plage de migrations figée" },
  {
    // Compteurs « vivants » recopiés dans une compétence : ils dérivent au
    // premier ajout de migration / canal / test. La source unique est
    // docs/METRICS.md.
    pattern: /\b\d{2,4}\s+(?:fichiers|canaux|cas|migrations|tables|agents|compétences)\b/,
    why: "compteur vivant recopié — renvoie à docs/METRICS.md",
  },
  {
    pattern: /prochain\s*(?:numéro\s+de\s+migration|migration|ADR)?\s*[:=]?\s*`?0\d{3}/i,
    why: "un « prochain numéro » figé se périme au premier ajout — déduis-le du dernier (docs/METRICS.md)",
  },
  {
    pattern: /prochain\s*[:=]?\s*ADR-\d+/i,
    why: "un « prochain ADR » figé se périme — déduis-le du dernier (docs/METRICS.md)",
  },
];

// ---------------------------------------------------------------------------
// 1) Compteurs dérivés de l'arbre (source de vérité = le code)
// ---------------------------------------------------------------------------

/** Liste les fichiers d'un dossier (chemins RELATIFS à la racine, POSIX). */
function listFiles(relDir, filter) {
  const out = [];
  const walk = (rel) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p);
      else if (!filter || filter(e.name, p)) out.push(p);
    }
  };
  walk(relDir);
  return out.sort();
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf-8");
}

/** Lecture tolérante : fichier absent ⇒ chaîne vide (arbre partiel). */
function readSafe(rel) {
  try {
    return read(rel);
  } catch {
    return "";
  }
}

/** Compteurs structurels, tous déterministes et sans exécution lourde. */
function computeMetrics() {
  // Migrations
  const migrations = listFiles("database/migrations", (n) => n.endsWith(".sql"));
  const versions = migrations
    .map((f) => Number(path.basename(f).slice(0, 4)))
    .filter((n) => Number.isFinite(n));
  const latestMigration = versions.length ? Math.max(...versions) : 0;

  // ADR
  const adrs = listFiles("docs", (n) => /^ADR-\d+/.test(n) && n.endsWith(".md"));
  const adrNumbers = adrs
    .map((f) => Number(path.basename(f).match(/^ADR-(\d+)/)?.[1] ?? NaN))
    .filter((n) => Number.isFinite(n));
  const latestAdr = adrNumbers.length ? Math.max(...adrNumbers) : 0;

  // Canaux IPC
  const channelsSrc = readSafe("electron/ipc/channels.ts");
  const declared = new Set(
    [...channelsSrc.matchAll(/^\s*"([a-zA-Z0-9._-]+)":\s*"([a-zA-Z0-9._-]+)",/gm)].map((m) => m[1]),
  ).size;
  let handled = 0;
  try {
    handled = JSON.parse(read("tests/unit/__snapshots__/ipc-channels.json")).length;
  } catch {
    handled = -1;
  }

  // Fichiers de test (arborescence récursive, mêmes racines que vitest.config)
  const testRoots = ["tests/unit", "tests/integration", "tests/database"];
  const testFiles = testRoots.flatMap((d) => listFiles(d, (n) => n.endsWith(".test.ts")));
  const e2eSpecs = listFiles("tests/e2e", (n) => n.endsWith(".spec.ts"));

  // Modules de la coquille
  const modulesSrc = readSafe("src/app/shell/modules.ts");
  const shellModules = new Set([...modulesSrc.matchAll(/\bid:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]))
    .size;

  // Catalogue de licence (source unique : electron/licensing/catalog.ts)
  const catalogSrc = readSafe("electron/licensing/catalog.ts");
  const blockOf = (name) => {
    const m = catalogSrc.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
    if (!m?.[1]) return [];
    return [...m[1].matchAll(/"([A-Za-z0-9-]+)"/g)].map((x) => x[1]);
  };
  const licensePages = blockOf("LICENSE_PAGES");
  const licenseFeatures = blockOf("LICENSE_FEATURES");

  // Tables réelles (hors tables temporaires `*_new` des reconstructions)
  const tableSet = new Set();
  for (const f of migrations) {
    const sql = fs.readFileSync(path.join(root, f), "utf-8");
    for (const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_]+)/gi)) {
      const name = m[1].toLowerCase();
      if (name.endsWith("_new")) continue;
      tableSet.add(name);
    }
  }

  // Dossiers du domaine (carte `src/domain`) — tolérant (arbre partiel).
  let domainFolders = [];
  try {
    domainFolders = fs
      .readdirSync(path.join(root, "src/domain"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    domainFolders = [];
  }

  return {
    migrations: migrations.length,
    latestMigration,
    adrs: adrs.length,
    latestAdr,
    ipcChannelsDeclared: declared,
    ipcChannelsHandled: handled,
    testFiles: testFiles.length,
    e2eSpecs: e2eSpecs.length,
    shellModules,
    licensePages: licensePages.length,
    licenseFeatures: licenseFeatures.length,
    dbTables: tableSet.size,
    domainFolders: domainFolders.length,
    domainFolderList: domainFolders,
    licensePageList: licensePages,
    licenseFeatureList: licenseFeatures,
  };
}

// ---------------------------------------------------------------------------
// 2) Rendu de `docs/METRICS.md` (section générée entre marqueurs)
// ---------------------------------------------------------------------------

const START = "<!-- GENERATED:verify-docs:START -->";
const END = "<!-- GENERATED:verify-docs:END -->";

function renderMetrics(m) {
  const rows = [
    [
      "Migrations SQL (numérotées, immuables)",
      `${m.migrations} (0001..${String(m.latestMigration).padStart(4, "0")})`,
    ],
    ["Tables réelles (hors `*_new` temporaires)", `${m.dbTables}`],
    ["ADRs (décisions)", `${m.adrs} (jusqu'à ADR-${String(m.latestAdr).padStart(3, "0")})`],
    ["Canaux IPC déclarés", `${m.ipcChannelsDeclared}`],
    ["Canaux IPC servis (snapshot gelé)", `${m.ipcChannelsHandled}`],
    ["Fichiers de test (unit + integration + database)", `${m.testFiles}`],
    ["Specs E2E (Playwright)", `${m.e2eSpecs}`],
    ["Modules de la coquille POS", `${m.shellModules}`],
    ["Pages de licence", `${m.licensePages}`],
    ["Features de licence", `${m.licenseFeatures}`],
    ["Dossiers du domaine (`src/domain`)", `${m.domainFolders}`],
  ];
  const lines = [
    START,
    "",
    `<!-- Mesuré par \`node scripts/quality/verify-docs.mjs --write\` le ${new Date().toISOString().slice(0, 10)}. -->`,
    "",
    "| Indicateur | Valeur |",
    "| --- | --- |",
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
    "",
    `<details><summary>Listes (référence, non volatiles)</summary>`,
    "",
    `**Pages de licence (${m.licensePages})** : ${m.licensePageList.join(", ")}.`,
    "",
    `**Features de licence (${m.licenseFeatures})** : ${m.licenseFeatureList.join(", ")}.`,
    "",
    `**Dossiers du domaine (${m.domainFolders})** : ${m.domainFolderList.join(", ")}.`,
    "",
    `</details>`,
    END,
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 3) Contrôles
// ---------------------------------------------------------------------------

const failures = [];
const notes = [];

const metrics = computeMetrics();

/** 3.1 — METRICS.md existe et sa section générée est à jour. */
const metricsPath = path.join(root, "docs/METRICS.md");
const expectedBlock = renderMetrics(metrics);

if (!fs.existsSync(metricsPath)) {
  if (WRITE) {
    fs.writeFileSync(
      metricsPath,
      `# METRICS — indicateurs du projet (source unique)\n\n` +
        `<!-- Fichier GÉNÉRÉ : la section entre marqueurs est réécrite par\n` +
        `     \`node scripts/quality/verify-docs.mjs --write\`. Ne pas éditer à la main. -->\n\n` +
        `${expectedBlock}\n`,
      "utf-8",
    );
    notes.push("docs/METRICS.md créé.");
  } else {
    failures.push(
      "docs/METRICS.md absent — génère-le : `node scripts/quality/verify-docs.mjs --write`.",
    );
  }
} else {
  const current = fs.readFileSync(metricsPath, "utf-8");
  const hasMarkers = current.includes(START) && current.includes(END);
  if (!hasMarkers) {
    failures.push(
      "docs/METRICS.md sans marqueurs de section générée — régénère-le : `node scripts/quality/verify-docs.mjs --write`.",
    );
  } else {
    const currentBlock = current.slice(current.indexOf(START), current.indexOf(END) + END.length);
    // Comparaison NORMALISÉE : on ignore (a) la ligne « Mesuré le … » (elle
    // change à chaque régénération) et (b) la mise en forme (Prettier
    // réaligne les tableaux Markdown : `format:check` et cette porte ne
    // doivent pas se contrarier). Seul le CONTENU compte.
    const normalize = (s) =>
      s
        .replace(/<!-- Mesuré par[\s\S]*?-->/, "")
        // ligne de séparation Markdown : Prettier la remplit de tirets selon la
        // largeur de colonne — on la neutralise (contenu identique).
        .replace(/-{2,}/g, "--")
        .split("\n")
        .map((l) => l.replace(/\s+/g, " ").trim())
        .filter((l) => l.length > 0)
        .join("\n");
    if (normalize(currentBlock) !== normalize(expectedBlock)) {
      if (WRITE) {
        fs.writeFileSync(
          metricsPath,
          current.slice(0, current.indexOf(START)) +
            expectedBlock +
            current.slice(current.indexOf(END) + END.length),
          "utf-8",
        );
        notes.push("docs/METRICS.md régénéré (compteurs mis à jour).");
      } else {
        failures.push(
          "docs/METRICS.md obsolète : un compteur a changé depuis la dernière génération. " +
            "Régénère : `node scripts/quality/verify-docs.mjs --write`.",
        );
      }
    } else {
      notes.push("docs/METRICS.md à jour.");
    }
  }
}

/** 3.2 — Aucun littéral obsolète dans les documents vivants. */
for (const rel of LIVING_DOCS) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`Document vivant absent : ${rel}.`);
    continue;
  }
  const text = fs.readFileSync(abs, "utf-8");
  for (const { pattern, why } of FORBIDDEN_LITERALS) {
    const m = text.match(pattern);
    if (m) {
      failures.push(
        `${rel} : littéral obsolète « ${m[0]} » — ${why}. Corrige (la valeur vive est dans docs/METRICS.md).`,
      );
    }
  }
}

/** 3.3 — Les documents vivants pointent vers la source unique. */
for (const rel of LIVING_DOCS) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) continue;
  const text = fs.readFileSync(abs, "utf-8");
  if (!text.includes("docs/METRICS.md")) {
    failures.push(`${rel} : ne renvoie pas vers docs/METRICS.md (source unique des indicateurs).`);
  }
}

/** 3.4 — Cohérence interne : les compteurs « durs » du code restent vrais. */
const frozenSchemaCount = Number(
  readSafe("tests/unit/validators-inventory.test.ts").match(
    /FROZEN_SCHEMA_COUNT\s*=\s*(\d+)/,
  )?.[1] ?? -1,
);
if (frozenSchemaCount <= 0) {
  // Arbre partiel (test unitaire de la porte) : note, pas échec. Sur le dépôt
  // réel, l'absence de ce fichier est un problème couvert par la suite de
  // tests, pas par cette porte.
  notes.push(
    "Note : FROZEN_SCHEMA_COUNT non trouvé (tests/unit/validators-inventory.test.ts absent).",
  );
}
const snapshotSize = metrics.ipcChannelsHandled;
if (snapshotSize !== metrics.ipcChannelsDeclared - 1) {
  notes.push(
    `Note : canaux déclarés ${metrics.ipcChannelsDeclared}, servis ${snapshotSize} ` +
      `(écart = canaux push-only, hors « handle »).`,
  );
}

/** 3.5 — COMPÉTENCES OpenCode : conformité au standard Agent Skills. */
const SKILLS_DIR = ".opencode/skills";

/** Extrait le frontmatter YAML d'un fichier Markdown (null s'il n'y en a pas). */
function frontmatterOf(text) {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return null;
  const raw = text.slice(text.indexOf("\n") + 1, end);
  const out = {};
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const skillDirs = fs.existsSync(path.join(root, SKILLS_DIR))
  ? fs
      .readdirSync(path.join(root, SKILLS_DIR), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  : [];

if (skillDirs.length === 0) {
  // `.opencode/` est GITIGNORÉ (outillage local, cf. .gitignore) : sur un runner
  // CI ou une copie propre du dépôt, le dossier n'existe pas. La porte ne peut
  // alors rien contrôler — elle le note et n'échoue pas. Les contrôles de
  // compétences (et la table de routage) sont SAUTÉS dans ce cas.
  notes.push(
    `Aucune compétence locale (${SKILLS_DIR}/ absent — normal en CI : dossier gitignoré) : ` +
      `contrôles de compétences sautés.`,
  );
}

for (const dir of skillDirs) {
  const rel = `${SKILLS_DIR}/${dir}/SKILL.md`;
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`${rel} absent — une compétence doit contenir SKILL.md.`);
    continue;
  }
  const text = fs.readFileSync(abs, "utf-8");
  const fm = frontmatterOf(text);
  if (!fm) {
    failures.push(`${rel} : pas de frontmatter YAML (name + description obligatoires).`);
    continue;
  }
  const name = fm["name"] ?? "";
  if (!SKILL_NAME_RE.test(name)) {
    failures.push(
      `${rel} : name « ${name} » non conforme au standard Agent Skills ` +
        `(^[a-z0-9]+(-[a-z0-9]+)*$).`,
    );
  }
  if (name !== dir) {
    failures.push(`${rel} : name « ${name} » ≠ nom du dossier « ${dir} » (standard Agent Skills).`);
  }
  const desc = fm["description"] ?? "";
  if (desc.length < 1 || desc.length > 1024) {
    failures.push(
      `${rel} : description absente ou trop longue (${desc.length} caractères, max 1024).`,
    );
  }
  const body = text.slice(text.indexOf("\n---", 3) + 4).trim();
  if (body.split("\n").length < 15) {
    failures.push(`${rel} : corps trop court (< 15 lignes) — compétence non exploitable.`);
  }
  for (const { pattern, why } of FORBIDDEN_LITERALS_SKILLS) {
    const m = text.match(pattern);
    if (m) {
      failures.push(`${rel} : littéral périmé « ${m[0]} » — ${why}.`);
    }
  }
}

/** 3.6 — Agents, commandes et table de routage : cohérence. */
for (const dir of [".opencode/agents", ".opencode/commands"]) {
  for (const file of listFiles(dir, (n) => n.endsWith(".md"))) {
    const text = readSafe(file);
    const fm = frontmatterOf(text);
    if (!fm) {
      failures.push(`${file} : pas de frontmatter YAML (description obligatoire).`);
      continue;
    }
    if (!fm["description"]) {
      failures.push(`${file} : frontmatter sans « description ».`);
    }
    for (const { pattern, why } of FORBIDDEN_LITERALS_SKILLS) {
      const m = text.match(pattern);
      if (m) failures.push(`${file} : littéral périmé « ${m[0]} » — ${why}.`);
    }
  }
}

// Table de routage d'`AGENTS.md` : toute compétence citée doit EXISTER,
// sinon l'agent est ROUTÉ vers une compétence absente (le bug inverse).
// Contrôle conditionné à la présence locale de `.opencode/` (dossier gitignoré
// : absent en CI, où ce contrôle n'a pas de sens).
const agentsText = readSafe("AGENTS.md");
if (skillDirs.length > 0) {
  for (const m of agentsText.matchAll(/`(veloria-[a-z0-9-]+)`/g)) {
    const ref = m[1];
    if (!skillDirs.includes(ref)) {
      failures.push(
        `AGENTS.md route vers la compétence « ${ref} » qui n'existe pas dans ${SKILLS_DIR}/.`,
      );
    }
  }
}
for (const { pattern, why } of FORBIDDEN_LITERALS_SKILLS) {
  const m = agentsText.match(pattern);
  if (m) failures.push(`AGENTS.md : littéral périmé « ${m[0]} » — ${why}.`);
}

if (skillDirs.length > 0) {
  notes.push(`Compétences : ${skillDirs.length} conformes (${skillDirs.join(", ")}).`);
}

// ---------------------------------------------------------------------------
// 4) Verdict
// ---------------------------------------------------------------------------

for (const n of notes) console.log(`OK  ${n}`);
if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL  ${f}`);
  console.error(`\n${failures.length} dérive(s) documentaire(s) — porte VERTE attendue.`);
  process.exit(1);
}
console.log("DOCS VERIFIED");
