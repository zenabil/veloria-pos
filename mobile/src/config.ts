// Veloria Client (APK) — Configuration de synchronisation.
// Aucune chaîne affichable ici : uniquement des réglages techniques, donc
// pas de traduction (l'UI reste 100 % ar/fr, ADR-051).
//
// `EXPO_PUBLIC_*` est le seul canal de configuration supporté par Expo :
// Metro remplace ces expressions littérales À LA COMPILATION, la valeur est
// donc gravée dans le bundle JS sans recompiler le code natif.
// Un build EAS les surcharge sans toucher aux sources (voir mobile/eas.json) :
//   eas build -p android --profile preview
//   → profile.preview.env.EXPO_PUBLIC_SYNC_URL / EXPO_PUBLIC_ANON_KEY
// En l'absence de variable (développement local), repli sur le miroir de démo
// `scripts/demo-client-sync-server.mjs` (127.0.0.1:8099, clé « demo »).
// NB : Android bloque le HTTP clair (cleartext) en production — toute URL de
// production doit être HTTPS, idéalement celle du projet Supabase.

/** URL de base du service `client-sync` (sans slash final). */
export const SYNC_URL: string = process.env.EXPO_PUBLIC_SYNC_URL ?? "http://127.0.0.1:8099";

/** Clé `anon` (publique) envoyée en `apikey` + `Authorization: Bearer`. */
export const ANON_KEY: string = process.env.EXPO_PUBLIC_ANON_KEY ?? "demo";

// RADICAL (#29) : garde-fou d'exécution — un bundle avec placeholder ou HTTP
// clair distant DOIT échouer FORT au démarrage (jamais de PIN envoyé dans le
// vide/en clair). Seuls https:// et le miroir démo local sont acceptés.
const IS_PLACEHOLDER = /VOTRE-PROJET|VOTRE-CLE|VOTRE_|EXAMPLE|PLACEHOLDER/i;
function isLocalDemoHttp(url: string): boolean {
  return (
    url === "http://127.0.0.1:8099" ||
    url.startsWith("http://127.0.0.1:8099/") ||
    url === "http://localhost:8099" ||
    url.startsWith("http://localhost:8099/")
  );
}
if (IS_PLACEHOLDER.test(SYNC_URL) || IS_PLACEHOLDER.test(ANON_KEY)) {
  throw new Error(
    "Configuration Supabase manquante (placeholder) : renseignez EXPO_PUBLIC_SYNC_URL / EXPO_PUBLIC_ANON_KEY.",
  );
}
if (SYNC_URL.startsWith("http://") && !isLocalDemoHttp(SYNC_URL)) {
  throw new Error("SYNC_URL HTTP clair refusée : https:// exigée (jamais de PIN en clair).");
}
