// Veloria PoS — scripts/quality/verify-site.mjs
// PORTE « SITE VITRINE » : le site statique (website/) doit être sain.
//
// Ce que la porte refuse :
//   1. une erreur console ou une exception page sur l'une des 6 pages ;
//   2. un débordement horizontal (le symptôme n°1 d'un design cassé) ;
//   3. un élément structurel manquant (header, navigation, pied de page,
//      titre unique, point d'ancrage « contenu ») ;
//   4. une image sans dimensions (source de décalage de mise en page — CLS) ;
//   5. un lien interne mort (404 local).
//
// Elle rend aussi des captures (docs/shots/site/) pour la revue visuelle.
//
// GRÂCE : si le navigateur Playwright n'est pas installé sur le poste, la
// porte **saute** (note + exit 0) au lieu de faire échouer la chaîne de
// livraison — un runner sans navigateur ne doit pas bloquer la CI.
// Zéro dépendance ajoutée : serveur HTTP intégré à `node:http`.

/* global document, window */
// `document` et `window` ci-dessous sont utilisés DANS les fonctions
// `page.evaluate(...)` : elles s'exécutent dans la page, pas dans Node.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const siteDir = path.join(root, "website");
const shotsDir = path.join(root, "docs/shots/site");

const PAGES = ["index.html", "pos.html", "client.html", "pricing.html", "contact.html"];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
};

/** Serveur statique éphémère (aucunpaquet externe). */
function startServer() {
  const server = http.createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];
    const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
    const abs = path.join(siteDir, rel);
    if (!abs.startsWith(siteDir) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs)] || "application/octet-stream" });
    fs.createReadStream(abs).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const failures = [];
const notes = [];

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  notes.push("Playwright absent — porte SITE sautée (aucun contrôle visuel possible).");
  chromium = null;
}

if (chromium) {
  // Fraîcheur de la sortie générée : le site servi doit correspondre EXACTEMENT
  // aux sources (partials + pages + couches CSS). Sans cette porte, une
  // retouche faite dans `website/src/` ne se verrait jamais sur le site.
  try {
    const { execFileSync } = await import("node:child_process");
    execFileSync(process.execPath, [path.join(root, "website/build.mjs"), "--check"], {
      cwd: root,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    notes.push("Sortie du site à jour (build --check).");
  } catch (err) {
    const e = err;
    failures.push(
      `Sortie du site PÉRIMÉE : \`npm run site:build\` à lancer. ${
        String(e.stderr ?? e.stdout ?? e)
          .trim()
          .split("\n")[0]
      }`,
    );
  }

  let browser = null;
  try {
    browser = await chromium.launch();
  } catch (err) {
    notes.push(`Navigateur Playwright absent (${String(err).split("\n")[0]}) — porte SITE sautée.`);
  }

  if (browser) {
    const { server, port } = await startServer();
    const base = `http://127.0.0.1:${port}`;
    fs.mkdirSync(shotsDir, { recursive: true });

    for (const file of PAGES) {
      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 1,
          reducedMotion: "no-preference",
        });
        const page = await context.newPage();
        const consoleErrors = [];
        const pageErrors = [];
        page.on("console", (msg) => {
          if (msg.type() === "error") consoleErrors.push(msg.text());
        });
        page.on("pageerror", (err) => pageErrors.push(String(err)));
        const response = await page.goto(`${base}/${file}`, { waitUntil: "load" });
        if (!response || !response.ok()) {
          failures.push(`${file} (${vp.name}) : HTTP ${response ? response.status() : "?"}`);
        }
        await page.waitForTimeout(350);

        // — Parcours de la page (déclenche les révélations au défilement et
        //   rend la capture pleine page fidèle à ce que voit un visiteur) —
        await page.evaluate(async () => {
          // Défilement INSTANT : `scroll-behavior: smooth` transformerait chaque
          // saut en animation et la page n'atteindrait jamais le bas (les
          // révélations ne se déclencheraient pas).
          const prev = document.documentElement.style.scrollBehavior;
          document.documentElement.style.scrollBehavior = "auto";
          const step = Math.round(window.innerHeight * 0.8);
          for (let y = 0; y < document.body.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 70));
          }
          window.scrollTo(0, 0);
          await new Promise((r) => setTimeout(r, 150));
          document.documentElement.style.scrollBehavior = prev;
        });
        await page.waitForTimeout(400);

        // — Débordement horizontal —
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 1) {
          failures.push(
            `${file} (${vp.name}) : débordement horizontal de ${overflow}px (design cassé).`,
          );
        }

        // — Structure —
        const structure = await page.evaluate(() => ({
          h1: document.querySelectorAll("h1").length,
          header: !!document.querySelector(".site-header"),
          nav: !!document.querySelector("#main-nav"),
          footer: !!document.querySelector(".site-footer"),
          main: !!document.querySelector("main#main"),
          skip: !!document.querySelector('a[href="#main"]'),
          lang: document.documentElement.lang,
          title: (document.title || "").trim().length,
        }));
        if (structure.h1 !== 1)
          failures.push(`${file} : ${structure.h1} titre(s) h1 (attendu : 1).`);
        if (!structure.header) failures.push(`${file} : en-tête manquant.`);
        if (!structure.nav) failures.push(`${file} : navigation manquante.`);
        if (!structure.footer) failures.push(`${file} : pied de page manquant.`);
        if (!structure.main)
          failures.push(`${file} : <main id="main"> manquant (lien d'évitement).`);
        if (!structure.skip) failures.push(`${file} : lien d'évitement manquant.`);
        if (structure.lang !== "fr")
          failures.push(`${file} : lang="${structure.lang}" (attendu : fr).`);
        if (structure.title < 10) failures.push(`${file} : <title> vide ou trop court.`);

        // — Images sans dimensions (CLS) —
        const noDims = await page.evaluate(() =>
          Array.from(document.images)
            .filter((img) => !img.getAttribute("width") || !img.getAttribute("height"))
            .map((img) => img.getAttribute("src")),
        );
        if (noDims.length > 0) {
          failures.push(
            `${file} (${vp.name}) : image(s) sans width/height (décalage CLS) : ${noDims.join(", ")}`,
          );
        }

        // — Liens internes morts —
        const broken = await page.evaluate(() =>
          Array.from(document.querySelectorAll("a[href]"))
            .map((a) => a.getAttribute("href") || "")
            .filter(
              (h) => h && !h.startsWith("#") && !h.startsWith("http") && !h.startsWith("mailto:"),
            )
            .filter((h) => !h.startsWith("assets/")),
        );
        for (const href of new Set(broken)) {
          const target = href.split("#")[0];
          if (!target) continue;
          if (!fs.existsSync(path.join(siteDir, target))) {
            failures.push(`${file} : lien interne mort « ${href} ».`);
          }
        }

        // — Erreurs console —
        for (const err of consoleErrors) {
          failures.push(`${file} (${vp.name}) : erreur console — ${err}`);
        }
        for (const err of pageErrors) {
          failures.push(`${file} (${vp.name}) : exception — ${err}`);
        }

        await page.screenshot({
          path: path.join(shotsDir, `${file.replace(".html", "")}-${vp.name}.png`),
          fullPage: vp.name === "desktop",
        });
        await context.close();
      }
    }

    server.close();
    await browser.close();
    notes.push(
      `Site vérifié : ${PAGES.length} pages × ${VIEWPORTS.length} viewports, captures dans docs/shots/site/.`,
    );
  }
}

for (const n of notes) console.log(`OK  ${n}`);
if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL  ${f}`);
  console.error(`\n${failures.length} défaut(s) sur le site vitrine.`);
  process.exit(1);
}
console.log("SITE VERIFIED");
