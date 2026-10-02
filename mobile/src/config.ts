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
