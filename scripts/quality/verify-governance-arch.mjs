// Veloria PoS — Porte de COHÉRENCE GOUVERNANCE / ARCHITECTURE (ADR-184).
//
// PROBLÈME CORRIGÉ (audit 2026-11-11, ORCH-01 / SYNC-01) :
//   Le contrat de projet et la compétence `veloria-sync` désignaient Google
//   Sheets comme pont client V1, alors que l'implémentation livrée — et
//   l'ADR-053 accepté — utilisent une miroir Supabase. Un agent suivant les
//   instructions aurait conçu un SECOND chemin de données clients, avec le
//   mauvais modèle de menace.
//
//   La correction (ADR-184) a réaligné les textes. Cette porte empêche la
//   DÉRIVE de revenir.
//
// CE QUE LA PORTE VÉRIFIE :
//   1. Toute technologie nommée comme « pont client approuvé » dans la couche
//      gouvernante existe RÉELLEMENT dans le dépôt (ou est explicitement
//      marquée comme direction non implémentée).
//   2. La compétence `veloria-sync` ne peut pas nommer une technologie qui
//      n'existe pas dans le code.
//   3. Les textes gouvernants et le code ne divergent pas sur le PONT (le
//      point le plus coûteux à détecter, parce qu'il n'échoue pas).
//
// Elle ne compare pas des NUMÉROS figés (un compteur en dur est un second
// compteur à maintenir — voir ADR-178) : elle compare des TOKENS
// d'architecture, vérifiés par la présence RÉELLE dans le dépôt.

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const FAIL = [];
const NOTES = [];

/** Outillage local GITIGNORÉ (cf. `.gitignore` : `.opencode/`). */
const LOCAL_SKILLS_DIR = ".opencode/skills";

function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/**
 * Un texte gouvernant qui vit dans l'outillage LOCAL (`.opencode/`, gitignoré)
 * n'est pas vérifiable sur un runner CI ni sur une copie propre du dépôt :
 * le fichier n'y existe pas. Exiger sa présence rendrait la porte ROUGE PAR
 * CONSTRUCTION en CI — exactement le défaut que la CI a déjà subi (E-57).
 *
 * La porte ne perd rien de sa morsure : les textes qui portent la décision
 * (`governance/`) sont versionnés et vérifiés TOUJOURS ; les fichiers de
 * compétence ne sont vérifiés QUE s'ils sont présents (poste de dev).
 * C'est le même traitement que `verify:docs` (§3.5).
 */
function isLocalSkillFile(rel) {
  return rel.startsWith(`${LOCAL_SKILLS_DIR}/`);
}

/**
 * Ponts clients connus, avec la preuve de leur EXISTENCE dans le dépôt.
 * `probe` : chemin relatif dont la présence prouve que la technologie est
 * réellement livrée (et non seulement nommée).
 */
const BRIDGES = [
  {
    id: "supabase",
    /** Le pont V1 livré. */
    probe: "cloud/supabase/rls.sql",
    /** Textes gouvernants qui doivent porter cette mention. */
    mustMention: [
      "governance/VELORIA_PROJECT_CONTRACT.md",
      ".opencode/skills/veloria-sync/SKILL.md",
    ],
  },
  {
    id: "sheets",
    /** Technologie REJETÉE par ADR-053 : ne doit plus être présentée comme approuvée. */
    probe: null,
    forbiddenAsApproved: [
      "governance/VELORIA_PROJECT_CONTRACT.md",
      "governance/PROJECT_FACTS_TO_VERIFY.md",
      ".opencode/skills/veloria-sync/SKILL.md",
      ".opencode/skills/veloria-sync/references/google-sheets-bridge.md",
    ],
  },
];

// --- 1. Le pont livré existe-t-il réellement ? -------------------------------
for (const b of BRIDGES) {
  if (!b.probe) continue;
  if (!fs.existsSync(path.join(root, b.probe))) {
    FAIL.push(
      `pont « ${b.id} » : la preuve d'implémentation est absente (${b.probe}) — ` +
        "le texte gouvernant promet une technologie qui n'est pas livrée.",
    );
  }
}

// --- 2. Les textes gouvernants DÉCLARENT-ILS le pont livré comme approuvé ? ---
// On cherche la MENTION D'A/APPROBATION (pas une simple occurrence du mot) :
// « le pont approuvé est X », « approved ... X », etc. Une occurrence
// isolée ne prouve rien (le mot peut apparaître dans une trace de
// réconciliation).
const APPROVAL_PATTERNS = [
  /approved[^.\n]{0,80}\b(supabase)\b/i,
  /\b(supabase)\b[^.\n]{0,80}(is the approved|approved intermediary|approved mirror)/i,
  /bridge (?:client )?(?:approuvé|v1)[^.\n]{0,80}\b(supabase)\b/i,
  /\b(supabase)\b[^.\n]{0,60}\b(bridge|miroir|mirror)\b/i,
];
for (const b of BRIDGES) {
  if (!b.probe) continue;
  for (const rel of b.mustMention ?? []) {
    const text = read(rel);
    if (text === null) {
      if (isLocalSkillFile(rel)) {
        NOTES.push(`${rel} absent (outillage local gitignoré) : contrôle de la compétence sauté.`);
        continue;
      }
      FAIL.push(`texte gouvernant absent : ${rel}`);
      continue;
    }
    const approves = APPROVAL_PATTERNS.some((re) => re.test(text));
    if (!approves) {
      FAIL.push(
        `${rel} ne DÉclare plus le pont livré « ${b.id} » comme approuvé — ` +
          "le texte gouvernant et l'implémentation divergent à nouveau.",
      );
    }
  }
}

// --- 3. Une technologie rejetée est-elle présentée comme approuvée ? -----------
// Heuristique : la mention doit être NEGATIVE (« previously named », « rejected »,
// « stale », « REJETÉ », « ne doit pas »). Sinon, la mention est présentée comme
// une direction courante → dérive.
const NEGATION_MARKERS = [
  "previously named",
  "was stale",
  "rejected",
  "rejeté",
  "rejete",
  "do not",
  "ne doit pas",
  "not the approved",
  "n'est pas",
  "not a per-customer",
  "forbidden",
  "interdit",
];
for (const b of BRIDGES) {
  if (b.probe) continue; // technologies vivantes : rien à interdire
  for (const rel of b.forbiddenAsApproved ?? []) {
    const text = read(rel);
    if (text === null) continue;
    // Analyse par PARAGRAPHE : une mention peut s'étendre sur plusieurs
    // lignes (le marqueur de négation n'est pas forcément sur la même ligne),
    // et un NOM DE FICHIER cité comme référence n'est pas une présentation
    // de direction (`references/google-sheets-bridge.md` — nom historique,
    // cf. ADR-184).
    const paragraphs = text.split(/\r?\n\s*\r?\n/);
    paragraphs.forEach((para) => {
      const low = para.toLowerCase();
      if (!low.includes(b.id.toLowerCase())) return;
      if (low.includes("google-sheets-bridge.md")) return;
      const negated = NEGATION_MARKERS.some((m) => low.includes(m));
      if (!negated) {
        const lineNo = text.slice(0, text.indexOf(para)).split(/\r?\n/).length;
        FAIL.push(
          `${rel} (≈l${lineNo}) présente « ${b.id} » SANS la mention de son rejet — ` +
            "un lecteur pressé la prendra pour une direction approuvée.",
        );
      }
    });
  }
}

// --- 4. La compétence sync ne doit pas promettre une technologie inexistante --
// (elle ne peut nommer que ce que le dépôt implémente réellement)
const skillSync = read(".opencode/skills/veloria-sync/SKILL.md");
if (skillSync !== null) {
  const KNOWN = ["supabase", "postgrest", "edge function", "rls", "sqlite", "outbox"];
  // Heuristique ciblée : toute mention d'un service Google Sheets doit être
  // NÉGATIVE dans la compétence (cf. règle 3 appliquée au fichier de compétence).
  // Analyse par PARAGRAPHE (une mention peut s'étendre sur plusieurs lignes :
  // le marqueur de négation n'est pas forcément sur la même ligne).
  const paragraphs = skillSync.split(/\r?\n\s*\r?\n/);
  paragraphs.forEach((para) => {
    const low = para.toLowerCase();
    if (!low.includes("google sheets") && !low.includes("spreadsheet")) return;
    // Un NOM DE FICHIER cité comme référence n'est pas une présentation de
    // direction : `references/google-sheets-bridge.md` reste un nom historique
    // (ADR-184) et ne doit pas déclencher la porte.
    if (low.includes("google-sheets-bridge.md")) return;
    const negated = NEGATION_MARKERS.some((m) => low.includes(m));
    if (!negated) {
      const lineNo = skillSync.slice(0, skillSync.indexOf(para)).split(/\r?\n/).length;
      FAIL.push(
        `.opencode/skills/veloria-sync/SKILL.md (≈l${lineNo}) mentionne « Google Sheets » ` +
          "sans rappeler son rejet — la compétence guiderait vers la mauvaise architecture.",
      );
    }
  });
  void KNOWN;
}

// --- 5. Le contrat doit pointer vers l'ADR de réconciliation -------------------
const contract = read("governance/VELORIA_PROJECT_CONTRACT.md");
if (contract !== null && !/ADR-184/.test(contract)) {
  FAIL.push(
    "governance/VELORIA_PROJECT_CONTRACT.md ne référence pas ADR-184 — " +
      "la réconciliation ne serait plus traçable (protocole de résolution de conflit).",
  );
}

// --- 6. L'ADR de réconciliation doit exister ----------------------------------
if (!fs.existsSync(path.join(root, "docs", "ADR-184-reconciliation-gouvernance-supabase.md"))) {
  FAIL.push(
    "docs/ADR-184-reconciliation-gouvernance-supabase.md absent — la décision n'est pas tracée.",
  );
}

// --- 7. Plancher de NON-VACUITÉ ------------------------------------------------
// Une porte qui ne contrôle RIEN est une porte qui ne peut pas échouer
// (ADR-120) : elle donne une garantie imaginaire.
//
// Les deux textes VERSIONNÉS qui portent la décision (le contrat et le
// fichier de faits) doivent EXISTER et être effectivement lus. Avant ce
// plancher, la suppression de `governance/PROJECT_FACTS_TO_VERIFY.md` rendait
// la porte silencieusement verte (le contrôle « technologie rejetée » saute
// un fichier absent) : une dérive de gouvernance pouvait être retirée de la
// porte sans que la porte ne s'en aperçoive.
const REQUIRED_GOVERNING_TEXTS = [
  "governance/VELORIA_PROJECT_CONTRACT.md",
  "governance/PROJECT_FACTS_TO_VERIFY.md",
];

let checkedTexts = 0;
for (const rel of REQUIRED_GOVERNING_TEXTS) {
  if (read(rel) === null) {
    FAIL.push(
      `texte gouvernant versionné absent : ${rel} — la décision de pont n'est plus ` +
        "tracée dans un fichier versionné (la porte ne peut plus rien contrôler).",
    );
    continue;
  }
  checkedTexts += 1;
}
if (checkedTexts < REQUIRED_GOVERNING_TEXTS.length) {
  FAIL.push(
    `plancher de non-vacuité : ${checkedTexts}/${REQUIRED_GOVERNING_TEXTS.length} ` +
      "texte(s) gouvernant(s) versionné(s) contrôlé(s) — une porte qui ne contrôle " +
      "rien ne peut pas échouer.",
  );
}

if (FAIL.length > 0) {
  console.error("GOUVERNANCE-ARCH ÉCHEC :");
  for (const f of FAIL) console.error(`  - ${f}`);
  process.exit(1);
}
for (const n of NOTES) console.log(`Note : ${n}`);
console.log(
  `OK  gouvernance-architecture (le pont client approuvé existe dans le dépôt, ${checkedTexts} ` +
    "texte(s) gouvernant(s) contrôlé(s), et aucune technologie rejetée n'est présentée comme approuvée).",
);
