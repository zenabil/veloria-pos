// Veloria — test de la porte `verify:docs` (ADR-178).
//
// DOCTRINE (ADR-120) : « une garde qui ne peut pas échouer n'est pas une
// garde ». Cette porte est la SEULE chose qui empêche les compteurs
// documentés de dériver du code : elle doit donc être testée dans les DEUX
// sens — verte sur un arbre sain, ROUGE sur un arbre dérivé.
//
// Méthode : la porte lit l'arbre via `process.cwd()`. On lui fabrique donc un
// arbre minimal dans un dossier temporaire (huit fichiers), et on l'exécute
// en pointant `cwd` dessus. Aucun accès réseau, aucune écriture hors du
// temporaire, aucune dépendance au contenu réel du dépôt.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const GATE = path.resolve(__dirname, "../../scripts/quality/verify-docs.mjs");

/** Exécute la porte dans `cwd` et renvoie { code, out }. */
function runGate(cwd: string, args: string[] = []): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [GATE, ...args], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/**
 * Bloc de volumétrie d'un arbre de test minimal (une migration, un ADR, deux
 * canaux dont un servi, deux modules de coquille, deux pages + une feature de
 * licence, deux fichiers de test, une spec E2E, zéro dossier de domaine).
 */
const METRICS_BLOCK = [
  "<!-- GENERATED:verify-docs:START -->",
  "",
  "| Indicateur | Valeur |",
  "| --- | --- |",
  "| Migrations SQL (numérotées, immuables) | 1 (0001..0001) |",
  "| Tables réelles (hors `*_new` temporaires) | 1 |",
  "| ADRs (décisions) | 1 (jusqu'à ADR-001) |",
  "| Canaux IPC déclarés | 2 |",
  "| Canaux IPC servis (snapshot gelé) | 1 |",
  "| Fichiers de test (unit + integration + database) | 2 |",
  "| Specs E2E (Playwright) | 1 |",
  "| Modules de la coquille POS | 2 |",
  "| Pages de licence | 2 |",
  "| Features de licence | 1 |",
  "| Dossiers du domaine (`src/domain`) | 0 |",
  "",
  "<!-- GENERATED:verify-docs:END -->",
].join("\n");

/** Installe une compétence CONFORME au standard Agent Skills dans l'arbre. */
function writeSkill(root: string, id: string): void {
  const skill = path.join(root, ".opencode/skills", id, "SKILL.md");
  fs.mkdirSync(path.dirname(skill), { recursive: true });
  fs.writeFileSync(
    skill,
    `---\nname: ${id}\ndescription: "Compétence de test pour la porte de routage."\n---\n\n` +
      `# ${id}\n\n` +
      "Ligne 1\nLigne 2\nLigne 3\nLigne 4\nLigne 5\nLigne 6\nLigne 7\nLigne 8\n" +
      "Ligne 9\nLigne 10\nLigne 11\nLigne 12\nLigne 13\nLigne 14\nLigne 15\nLigne 16\n",
    "utf-8",
  );
}

/** Écrit un `AGENTS.md` porteur d'une table de routage (déclencheurs factices). */
function writeAgents(root: string, routedIds: string[]): void {
  const rows = routedIds.map((id) => `| \`${id}\` | déclencheur de test |`).join("\n");
  fs.writeFileSync(
    path.join(root, "AGENTS.md"),
    "# AGENTS.md de test\n\n" +
      "<!-- SKILL-ROUTING:START -->\n\n" +
      "| Compétence | Déclencheur |\n| --- | --- |\n" +
      `${rows}\n\n` +
      "<!-- SKILL-ROUTING:END -->\n",
    "utf-8",
  );
}

/**
 * Arbre de test du routage : volumétrie générée par la porte elle-même
 * (`--write`, donc jamais dérivée à la main), une compétence installée et un
 * `AGENTS.md` porteur — ou non — de la table de routage.
 */
function buildRoutingTree(root: string, skillId: string, routedIds: string[] | null): void {
  buildTree(root, METRICS_BLOCK);
  // La porte régénère la volumétrie : l'arbre est alors vert SAUF pour le
  // routage — le test rouge porte donc sur le routage, rien d'autre.
  runGate(root, ["--write"]);
  writeSkill(root, skillId);
  if (routedIds !== null) writeAgents(root, routedIds);
}

/**
 * Arbre minimal cohérent : une migration, un ADR, deux canaux IPC (un servi,
 * un push-only), un module de coquille, deux pages + une feature de licence,
 * trois fichiers de test, un snapshot d'un canal, et les trois documents
 * vivants pointant vers `docs/METRICS.md`.
 */
function buildTree(root: string, metricsBlock: string): void {
  const write = (rel: string, content: string): void => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf-8");
  };
  write("database/migrations/0001_init.sql", "CREATE TABLE IF NOT EXISTS t (id INTEGER);");
  write("docs/ADR-001-demo.md", "# ADR-001 demo\n");
  write(
    "electron/ipc/channels.ts",
    'export const IPC_CHANNELS = {\n  "a.one": "a.one",\n  "a.two": "a.two",\n};\n',
  );
  write(
    "electron/licensing/catalog.ts",
    'export const LICENSE_PAGES = [\n  "sales",\n  "zakat",\n] as const;\n' +
      'export const LICENSE_FEATURES = [\n  "returns",\n] as const;\n',
  );
  write("src/app/shell/modules.ts", 'const MODULES = [{ id: "sell" }, { id: "zakat" }];\n');
  write("tests/unit/__snapshots__/ipc-channels.json", '["a.one"]\n');
  write("tests/unit/a.test.ts", "it('x', () => {});\n");
  write("tests/integration/b.test.ts", "it('y', () => {});\n");
  write("tests/e2e/c.spec.ts", "test('z', () => {});\n");
  write("README.md", "Volumetrie : docs/METRICS.md\n");
  write("docs/STRUCTURE.md", "Volumetrie : docs/METRICS.md\n");
  write("docs/INDEX.md", "Volumetrie : docs/METRICS.md\n");
  write("docs/METRICS.md", `# METRICS\n\n${metricsBlock}\n`);
}

describe("porte verify:docs (ADR-178)", () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-verify-docs-"));
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("est verte sur l'arbre réel du dépôt", () => {
    const res = runGate(path.resolve(__dirname, "../.."));
    expect(res.code, res.out).toBe(0);
    expect(res.out).toContain("DOCS VERIFIED");
  });

  it("rougit quand la volumétrie générée est périmée", () => {
    const dir = path.join(root, "stale");
    // Section générée volontairement fausse (compteurs inventés).
    buildTree(
      dir,
      [
        "<!-- GENERATED:verify-docs:START -->",
        "",
        "| Indicateur | Valeur |",
        "| --- | --- |",
        "| Migrations SQL (numérotées, immuables) | 999 (0001..0999) |",
        "",
        "<!-- GENERATED:verify-docs:END -->",
      ].join("\n"),
    );
    const res = runGate(dir);
    expect(res.code).toBe(1);
    expect(res.out).toContain("docs/METRICS.md obsolète");
  });

  it("rougit quand un document vivant réintroduit un littéral obsolète", () => {
    const dir = path.join(root, "stale-literal");
    buildTree(
      dir,
      [
        "<!-- GENERATED:verify-docs:START -->",
        "",
        "| Indicateur | Valeur |",
        "| --- | --- |",
        "| Migrations SQL (numérotées, immuables) | 1 (0001..0001) |",
        "| Tables réelles (hors `*_new` temporaires) | 1 |",
        "| ADRs (décisions) | 1 (jusqu'à ADR-001) |",
        "| Canaux IPC déclarés | 2 |",
        "| Canaux IPC servis (snapshot gelé) | 1 |",
        "| Fichiers de test (unit + integration + database) | 2 |",
        "| Specs E2E (Playwright) | 1 |",
        "| Modules de la coquille POS | 2 |",
        "| Pages de licence | 2 |",
        "| Features de licence | 1 |",
        "| Dossiers du domaine (`src/domain`) | 0 |",
        "",
        "<!-- GENERATED:verify-docs:END -->",
      ].join("\n"),
    );
    fs.appendFileSync(path.join(dir, "README.md"), "\nAncienne valeur : 169 fichiers\n", "utf-8");
    const res = runGate(dir);
    expect(res.code).toBe(1);
    expect(res.out).toContain("169 fichiers");
    expect(res.out).toContain("littéral obsolète");
  });

  it("rougit quand un document vivant ne renvoie pas vers docs/METRICS.md", () => {
    const dir = path.join(root, "no-pointer");
    buildTree(
      dir,
      [
        "<!-- GENERATED:verify-docs:START -->",
        "",
        "| Indicateur | Valeur |",
        "| --- | --- |",
        "| Migrations SQL (numérotées, immuables) | 1 (0001..0001) |",
        "| Tables réelles (hors `*_new` temporaires) | 1 |",
        "| ADRs (décisions) | 1 (jusqu'à ADR-001) |",
        "| Canaux IPC déclarés | 2 |",
        "| Canaux IPC servis (snapshot gelé) | 1 |",
        "| Fichiers de test (unit + integration + database) | 2 |",
        "| Specs E2E (Playwright) | 1 |",
        "| Modules de la coquille POS | 2 |",
        "| Pages de licence | 2 |",
        "| Features de licence | 1 |",
        "| Dossiers du domaine (`src/domain`) | 0 |",
        "",
        "<!-- GENERATED:verify-docs:END -->",
      ].join("\n"),
    );
    fs.writeFileSync(path.join(dir, "README.md"), "Sans renvoi.\n", "utf-8");
    const res = runGate(dir);
    expect(res.code).toBe(1);
    expect(res.out).toContain("docs/METRICS.md");
  });

  it("rougit quand une compétence ne respecte pas le standard Agent Skills", () => {
    const dir = path.join(root, "bad-skill");
    buildTree(
      dir,
      [
        "<!-- GENERATED:verify-docs:START -->",
        "",
        "| Indicateur | Valeur |",
        "| --- | --- |",
        "| Migrations SQL (numérotées, immuables) | 1 (0001..0001) |",
        "| Tables réelles (hors `*_new` temporaires) | 1 |",
        "| ADRs (décisions) | 1 (jusqu'à ADR-001) |",
        "| Canaux IPC déclarés | 2 |",
        "| Canaux IPC servis (snapshot gelé) | 1 |",
        "| Fichiers de test (unit + integration + database) | 2 |",
        "| Specs E2E (Playwright) | 1 |",
        "| Modules de la coquille POS | 2 |",
        "| Pages de licence | 2 |",
        "| Features de licence | 1 |",
        "| Dossiers du domaine (`src/domain`) | 0 |",
        "",
        "<!-- GENERATED:verify-docs:END -->",
      ].join("\n"),
    );
    // Compétence au `name` non conforme (espaces + majuscules) : le standard
    // Agent Skills exige `^[a-z0-9]+(-[a-z0-9]+)*$` ET le nom du dossier.
    const skill = path.join(dir, ".opencode/skills/veloria-money/SKILL.md");
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(
      skill,
      "---\nname: Veloria Money\ndescription: Compétence de test.\n---\n\n# Titre\n\n" +
        "Ligne 1\nLigne 2\nLigne 3\nLigne 4\nLigne 5\nLigne 6\nLigne 7\nLigne 8\n" +
        "Ligne 9\nLigne 10\nLigne 11\nLigne 12\nLigne 13\nLigne 14\nLigne 15\nLigne 16\n",
      "utf-8",
    );
    const res = runGate(dir);
    expect(res.code).toBe(1);
    expect(res.out).toContain("non conforme au standard Agent Skills");
  });

  it("rougit quand une compétence contient un chiffre périmé", () => {
    const dir = path.join(root, "stale-skill");
    buildTree(
      dir,
      [
        "<!-- GENERATED:verify-docs:START -->",
        "",
        "| Indicateur | Valeur |",
        "| --- | --- |",
        "| Migrations SQL (numérotées, immuables) | 1 (0001..0001) |",
        "| Tables réelles (hors `*_new` temporaires) | 1 |",
        "| ADRs (décisions) | 1 (jusqu'à ADR-001) |",
        "| Canaux IPC déclarés | 2 |",
        "| Canaux IPC servis (snapshot gelé) | 1 |",
        "| Fichiers de test (unit + integration + database) | 2 |",
        "| Specs E2E (Playwright) | 1 |",
        "| Modules de la coquille POS | 2 |",
        "| Pages de licence | 2 |",
        "| Features de licence | 1 |",
        "| Dossiers du domaine (`src/domain`) | 0 |",
        "",
        "<!-- GENERATED:verify-docs:END -->",
      ].join("\n"),
    );
    const agent = path.join(dir, ".opencode/agents/qa.md");
    fs.mkdirSync(path.dirname(agent), { recursive: true });
    fs.writeFileSync(
      agent,
      "---\ndescription: Agent de test.\nmode: subagent\n---\n\nProchain numéro après ADR-135.\n",
      "utf-8",
    );
    const res = runGate(dir);
    expect(res.code).toBe(1);
    expect(res.out).toContain("littéral périmé");
  });

  /* -------------------------------------------------------------------
   * ROUTAGE (3.7) — « l'agent choisit la compétence adaptée à la tâche ».
   *
   * Ces tests vérifient que le routage est contrôlé dans les DEUX sens :
   *   - une compétence INSTALLÉE doit être ROUTABLE (sinon l'agent ne la
   *     chargera jamais) ;
   *   - une compétence ROUTÉE doit être INSTALLÉE (sinon l'agent vise le
   *     vide) ;
   *   - la table de routage doit EXISTER.
   * Et — surtout — que la garde n'est PAS vacante : dès que la compétence
   * est routée, l'erreur disparaît et l'arbre redevient vert.
   * ----------------------------------------------------------------- */
  it("rougit quand une compétence installée n'est pas routable", () => {
    const dir = path.join(root, "unroutable-skill");
    // Installée : `veloria-money`. Routée : seulement `veloria-gates`.
    buildRoutingTree(dir, "veloria-money", ["`veloria-gates`"]);
    const res = runGate(dir);
    expect(res.code).toBe(1);
    expect(res.out).toContain("absente de la table de routage");
    expect(res.out).toContain("veloria-money");
  });

  it("redevient vert dès que la compétence installée est routée (garde non vacante)", () => {
    const dir = path.join(root, "routable-skill");
    buildRoutingTree(dir, "veloria-money", ["`veloria-money`"]);
    const res = runGate(dir);
    expect(res.out).not.toContain("absente de la table de routage");
    expect(res.code, res.out).toBe(0);
    expect(res.out).toContain("DOCS VERIFIED");
  });

  it("rougit quand la table de routage cite une compétence inexistante", () => {
    const dir = path.join(root, "ghost-skill");
    // Faute de frappe : la compétence routée n'existe pas sur le disque.
    buildRoutingTree(dir, "veloria-money", ["`veloria-money`", "`veloria-licence`"]);
    const res = runGate(dir);
    expect(res.code).toBe(1);
    expect(res.out).toContain("la table de routage cite");
    expect(res.out).toContain("veloria-licence");
  });

  it("rougit quand la table de routage est absente", () => {
    const dir = path.join(root, "no-routing-table");
    buildRoutingTree(dir, "veloria-money", null);
    const res = runGate(dir);
    expect(res.code).toBe(1);
    expect(res.out).toContain("table de routage des compétences absente");
  });
});
