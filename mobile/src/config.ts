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
// AUCUN repli gravé (#29 renforcé) : avant, un build sans variable EAS
// démarrait en silence sur `http://127.0.0.1:8099` + clé « demo », et chaque
// connexion échouait sous un message « magasin hors ligne » — un faux panne
// réseau cachant un vrai build non configuré. Le bundle non configuré
// s'affiche maintenant comme TEL (bandeau « non configuré », voir App.tsx) et
// refuse la connexion manuelle. En local, on passe les variables explicites :
//   EXPO_PUBLIC_SYNC_URL=http://127.0.0.1:8099 EXPO_PUBLIC_ANON_KEY=demo npx expo start
// NB : Android bloque le HTTP clair (cleartext) en production — toute URL de
// production doit être HTTPS, idéalement celle du projet Supabase.

/** URL de base du service `client-sync` (sans slash final) ; "" = non gravé. */
export const SYNC_URL: string = process.env.EXPO_PUBLIC_SYNC_URL ?? "";

/** Clé `anon` (publique) envoyée en `apikey` + `Authorization: Bearer`. */
export const ANON_KEY: string = process.env.EXPO_PUBLIC_ANON_KEY ?? "";

/**
 * Le miroir d'activation (QR V2, ADR-068) peut fournir URL + clé : un build
 * non gravé reste donc UTILISABLE par scan. Ce drapeau ne commande que la
 * connexion manuelle téléphone + PIN, qui n'a aucun autre endpoint.
 */
export const isConfigured: boolean = SYNC_URL !== "" && ANON_KEY !== "";

// RADICAL (#29) : garde-fou d'exécution — un bundle avec placeholder ou HTTP
// clair distant DOIT échouer FORT au démarrage (jamais de PIN envoyé dans le
// vide/en clair). Seuls https://, le miroir démo local (:8099) et le relais
// E2E loopback (:8100, jamais hors machine — voir scripts/e2e-mirror-relay.mjs
// + e2e-mobile-shots.mjs) sont acceptés.
const IS_PLACEHOLDER = /VOTRE-PROJET|VOTRE-CLE|VOTRE_|EXAMPLE|PLACEHOLDER/i;
function isLocalDemoHttp(url: string): boolean {
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
if (IS_PLACEHOLDER.test(SYNC_URL) || IS_PLACEHOLDER.test(ANON_KEY)) {
  throw new Error(
    "Configuration Supabase manquante (placeholder) : renseignez EXPO_PUBLIC_SYNC_URL / EXPO_PUBLIC_ANON_KEY.",
  );
}
if (SYNC_URL.startsWith("http://") && !isLocalDemoHttp(SYNC_URL)) {
  throw new Error("SYNC_URL HTTP clair refusée : https:// exigée (jamais de PIN en clair).");
}
