// Veloria PoS — Parité CORS du contrat `client-sync`.
// La build WEB de l'app client (Expo `--web`) échoue sans en-têtes CORS, et
// l'E2E ne pouvait pas le voir : les deux serveurs locaux qui émulent le même
// contrat les envoyaient déjà, seule la fonction Edge réelle en manquait
// (symptôme mesuré sur le cloud réel : « لا اتصال بالإنترنت » alors que le
// même POST hors navigateur répondait 200 avec la facture).
// Ce test verrouille la parité des TROIS implémentations du contrat.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const FN = path.join(process.cwd(), "cloud/supabase/functions/client-sync/index.ts");
const RELAY = path.join(process.cwd(), "scripts/e2e-mirror-relay.mjs");
const DEMO = path.join(process.cwd(), "scripts/demo-client-sync-server.mjs");

/** Valeurs des en-têtes CORS telles qu'écrites dans un fichier. */
function corsOf(file: string): Record<string, string> {
  const src = fs.readFileSync(file, "utf-8");
  const out: Record<string, string> = {};
  const re = /"(Access-Control-[A-Za-z-]+)"\s*:\s*"([^"]*)"/g;
  for (;;) {
    const m = re.exec(src);
    if (m === null) break;
    const header = m[1];
    const value = m[2];
    if (header === undefined || value === undefined) continue;
    if (out[header] === undefined) out[header] = value;
  }
  return out;
}

describe("parité CORS du contrat client-sync", () => {
  it("la fonction Edge répond au preflight AVANT la garde de méthode", () => {
    const src = fs.readFileSync(FN, "utf-8");
    const optionsAt = src.indexOf('req.method === "OPTIONS"');
    const postGuardAt = src.indexOf('req.method !== "POST"');
    expect(optionsAt, "branche OPTIONS absente : le navigateur bloque tout").toBeGreaterThan(-1);
    expect(postGuardAt).toBeGreaterThan(-1);
    expect(optionsAt, "OPTIONS doit passer avant le refus 405").toBeLessThan(postGuardAt);
  });

  it("toutes les réponses portent les en-têtes CORS (les erreurs aussi)", () => {
    const src = fs.readFileSync(FN, "utf-8");
    const marker = "new Response(";
    let at = src.indexOf(marker);
    let count = 0;
    while (at !== -1) {
      count += 1;
      const window = src.slice(at, at + 400);
      expect(
        window.includes("CORS_HEADERS"),
        `réponse sans en-têtes CORS : ${window.slice(0, 140)}`,
      ).toBe(true);
      at = src.indexOf(marker, at + marker.length);
    }
    // fail + preflight + détail + snapshot : la moindre réponse nue est un blocage navigateur.
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it("les trois implémentations du contrat déclarent les mêmes valeurs", () => {
    const fn = corsOf(FN);
    const relay = corsOf(RELAY);
    const demo = corsOf(DEMO);
    expect(fn["Access-Control-Allow-Origin"]).toBe(relay["Access-Control-Allow-Origin"]);
    expect(fn["Access-Control-Allow-Headers"]).toBe(relay["Access-Control-Allow-Headers"]);
    expect(fn["Access-Control-Allow-Methods"]).toBe(relay["Access-Control-Allow-Methods"]);
    expect(fn["Access-Control-Allow-Headers"]).toBe(demo["Access-Control-Allow-Headers"]);
    expect(fn["Access-Control-Allow-Methods"]).toBe(demo["Access-Control-Allow-Methods"]);
    // Le strict, pas le « non vide » : `Prefer` est envoyé par l'app et PostgREST.
    expect(fn["Access-Control-Allow-Headers"]).toMatch(/Prefer/);
    expect(fn["Access-Control-Allow-Headers"]).toMatch(/apikey/);
    expect(fn["Access-Control-Allow-Methods"]).toMatch(/OPTIONS/);
  });
});
