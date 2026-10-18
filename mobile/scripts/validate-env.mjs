// Veloria Client — refuse un build avec placeholder ou HTTP clair (#29).
// Vérifie les profils EAS (mobile/eas.json) + l'environnement courant :
// - placeholder (VOTRE-PROJET / VOTRE-CLE-…) = build REFUSÉ (exit 1) ;
// - http:// non-localhost = REFUSÉ (jamais de PIN en clair, Android le
//   bloquerait de toute façon) ; seuls https://, le miroir démo local
//   (http://127.0.0.1:8099, clé « demo ») et le relais E2E loopback (:8100,
//   jamais hors machine — voir config.ts) sont acceptés.
// Usage : `npm run validate-env` (branché sur `build:apk` et `test`).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobileDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = process.cwd();
const base = root.endsWith("mobile") ? root : mobileDir;

const PLACEHOLDER = /VOTRE-PROJET|VOTRE-CLE|VOTRE_|EXAMPLE|PLACEHOLDER/i;

function isLocalDemoHttp(url) {
  return (
    url === "http://127.0.0.1:8099" ||
    url.startsWith("http://127.0.0.1:8099/") ||
    url === "http://localhost:8099" ||
    url.startsWith("http://localhost:8099/") ||
    url === "http://127.0.0.1:8100" ||
    url.startsWith("http://127.0.0.1:8100/") ||
    url === "http://localhost:8100" ||
    url.startsWith("http://localhost:8100/")
  );
}

function check(url, key, origin) {
  const errs = [];
  if (typeof url !== "string" || url.length === 0) errs.push(`${origin}: SYNC_URL manquante`);
  else {
    if (PLACEHOLDER.test(url))
      errs.push(`${origin}: SYNC_URL placeholder (remplacez par https://<projet>.supabase.co)`);
    else if (url.startsWith("http://") && !isLocalDemoHttp(url))
      errs.push(`${origin}: SYNC_URL HTTP clair refusée (PIN jamais en clair, https:// exigée)`);
    else if (!url.startsWith("https://") && !isLocalDemoHttp(url))
      errs.push(`${origin}: SYNC_URL invalide (https:// ou miroir démo local)`);
  }
  if (typeof key !== "string" || key.length === 0) errs.push(`${origin}: ANON_KEY manquante`);
  else if (PLACEHOLDER.test(key))
    errs.push(`${origin}: ANON_KEY placeholder (clé anon publique du projet)`);
  return errs;
}

const failures = [];
const envOnly = process.argv.includes("--env-only");
if (!envOnly) {
  try {
    // EAS lit le JSON5 (commentaires pleine ligne) : on les retire avant
    // JSON.parse sans toucher aux `https://` dans les chaînes.
    const rawEas = fs.readFileSync(path.join(base, "eas.json"), "utf8");
    const eas = JSON.parse(rawEas.replace(/^\s*\/\/.*$/gm, ""));
    for (const profile of ["preview", "production"]) {
      const env = eas?.build?.[profile]?.env;
      if (!env) {
        failures.push(`eas.json: profil ${profile} sans env`);
        continue;
      }
      failures.push(
        ...check(env.EXPO_PUBLIC_SYNC_URL, env.EXPO_PUBLIC_ANON_KEY, `eas.json:${profile}`),
      );
    }
  } catch (err) {
    failures.push(`eas.json illisible: ${String(err)}`);
  }
}

// Environnement courant (repli démo local autorisé : 127.0.0.1:8099 + demo).
failures.push(
  ...check(
    process.env.EXPO_PUBLIC_SYNC_URL ?? "http://127.0.0.1:8099",
    process.env.EXPO_PUBLIC_ANON_KEY ?? "demo",
    "env",
  ),
);

if (failures.length > 0) {
  console.error("validate-env ÉCHEC :");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("OK validate-env (profils EAS + env, ni placeholder ni HTTP clair distant)");
