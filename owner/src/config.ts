// Veloria Owner — configuration de l'endpoint de supervision.
// En l'absence de variables EXPO_PUBLIC_*, l'app démarre en MODE DÉMONSTRATION
// (liasse figée, aucun appel réseau) : indispensable pour la revue UI avant
// le déploiement de l'Edge Function `owner-sync`.
//
// Les valeurs sont gravées dans le bundle à la compilation (Expo), jamais
// saisies dans l'écran de connexion (protection contre un endpoint trompeur).

export const OWNER_SYNC_URL: string = process.env.EXPO_PUBLIC_OWNER_SYNC_URL ?? "";

export const OWNER_ANON_KEY: string = process.env.EXPO_PUBLIC_OWNER_ANON_KEY ?? "";

export const DEMO_MODE: boolean = OWNER_SYNC_URL === "";

const IS_PLACEHOLDER = /VOTRE-PROJET|VOTRE-CLE|VOTRE_|EXAMPLE|PLACEHOLDER/i;

function isLocalHttp(url: string): boolean {
  return url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:");
}

/** Garde-fou d'exécution : jamais d'identifiants vers un endpoint douteux. */
export function assertConfig(): void {
  if (DEMO_MODE) return;
  if (IS_PLACEHOLDER.test(OWNER_SYNC_URL) || IS_PLACEHOLDER.test(OWNER_ANON_KEY)) {
    throw new Error(
      "Configuration Supabase manquante (placeholder) : renseignez EXPO_PUBLIC_OWNER_SYNC_URL / EXPO_PUBLIC_OWNER_ANON_KEY.",
    );
  }
  if (OWNER_SYNC_URL.startsWith("http://") && !isLocalHttp(OWNER_SYNC_URL)) {
    throw new Error("Endpoint HTTP clair refusé : https:// exigée.");
  }
}
