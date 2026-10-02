// Veloria PoS — Edge Function `client-sync` (V1 lecture seule).
// Un seul aller-retour : vérifie téléphone + PIN puis renvoie les derniers
// clichés (accueil + factures + paiements + annonce). Deno runtime.
// Secrets : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (jamais dans l'APK).
// Verrous miroirs du domaine : 5 échecs → 5 minutes (même règle que le POS).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_FAILED = 5;
const LOCK_MS = 5 * 60_000;
/**
 * Détail à la demande : on ne balaye que les 50 derniers clichés
 * `invoice_detail` (ils s'accumulent, UNIQUE operation_id).
 * LIMITE CONNUE : une facture plus ancienne que ces 50 lignes répond 404
 * tant que le POS n'a pas repoussé son détail. Le relais E2E
 * (`scripts/e2e-mirror-relay.mjs`) applique la MÊME borne nommée pour que
 * l'E2E ne passe jamais là où la production ferait un 404 (parité stricte).
 */
const DETAIL_SCAN_LIMIT = 50;

type Json = Record<string, unknown>;

function sha256Hex(input: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(input))
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""));
}

/**
 * Comparaison de condensats en temps constant : accumulation d'un XOR de
 * caractères sur TOUTE la longueur, sans sortie anticipée. Un `!==` ordinaire
 * s'arrête à la première différence et laisse mesurer (timing) combien de
 * caractères du `pin_hash` étaient justes — brute force accélérée.
 * Les longueurs entrent aussi dans l'accumulateur (XOR des longueurs) : la
 * durée ne dépend ni du contenu ni de l'endroit de la divergence. Les deux
 * condensats SHA-256 hex font 64 caractères en pratique.
 */
function constantTimeEquals(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

function fail(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return fail("METHOD_ERROR", "Méthode invalide.", 405);
  let body: Json;
  try {
    body = (await req.json()) as Json;
  } catch {
    return fail("VALIDATION_ERROR", "Requête illisible.", 400);
  }
  const phone = typeof body["phone"] === "string" ? body["phone"].trim() : "";
  const pin = typeof body["pin"] === "string" ? body["pin"] : "";
  // `saleId` présent mais invalide (chaîne, non entier, négatif…) = ERREUR DE
  // VALIDATION explicite. Le laisser retomber en `null` répondrait 200 avec le
  // cliché global SANS `detail`, et l'APK afficherait alors un NOT_FOUND
  // mensonger au lieu du vrai problème. Absent/null = requête de snapshot.
  const rawSaleId = body["saleId"];
  let saleId: number | null = null;
  if (rawSaleId !== undefined && rawSaleId !== null) {
    if (typeof rawSaleId !== "number" || !Number.isInteger(rawSaleId) || rawSaleId <= 0) {
      return fail("VALIDATION_ERROR", "Identifiant de facture invalide.", 400);
    }
    saleId = rawSaleId;
  }
  // Même message générique qu'au POS (jamais lequel des deux est faux).
  if (phone.length < 1 || phone.length > 30 || !/^[0-9]{6}$/.test(pin)) {
    return fail("AUTH_ERROR", "Téléphone ou code incorrect.", 401);
  }

  // Variables d'environnement : avec `?? ""`, une URL/clé absente partait dans
  // `createClient` → exception non interceptée → 500 « nu » du framework sans
  // message FR. On valide avant tout appel réseau.
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("client-sync: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY absent");
    return fail("SERVER_ERROR", "Service de synchronisation indisponible.", 500);
  }
  const supa = createClient(supabaseUrl, serviceKey);
  const phoneHash = await sha256Hex(phone);
  // Recherche en TABLEAU borné à 2 lignes, ACTIVES D'ABORD (jamais
  // `.maybeSingle()` : deux lignes lui font lever une erreur de coercion
  // PostgREST → deux clients partageant/reutilisant un numéro recevaient un
  // AUTH_ERROR 401 permanent, même avec le bon PIN).
  // Migration 0034 : au plus UNE ligne active par condensat (index unique
  // partiel), mais les lignes RÉVOQUÉES historiques coexistent toujours (le
  // condensat reste tracé sans bloquer) → on trie `revoked_at` NULL d'abord
  // pour tomber sur l'identité active quelle que soit l'historique.
  //   - 0 ligne            → identifiants inconnus (401)
  //   - 2 lignes ACTIVES   → incohérence (0034 l'interdit) → échec fermé (500)
  //   - 1 ligne active     → c'est le client (les révoquées sont ignorées)
  //   - aucune active, ≥ 1 révoquée → accès coupé (403)
  const { data: matches, error: lookupError } = await supa
    .from("client_access")
    .select("customer_id, pin_hash, revoked_at, failed_attempts, locked_until")
    .eq("phone_hash", phoneHash)
    .order("revoked_at", { ascending: true, nullsFirst: true })
    .limit(2);
  if (lookupError) {
    // Détail technique au log, sans valeur de téléphone ni de condensat.
    console.error("client-sync: lecture client_access impossible", lookupError.code);
    return fail("SERVER_ERROR", "Service de synchronisation indisponible.", 500);
  }
  const foundRows = matches ?? [];
  const actives = foundRows.filter((r) => r.revoked_at == null);
  if (actives.length > 1) {
    console.error("client-sync: phone_hash ambigu (plusieurs lignes actives) -> echec ferme");
    return fail("SERVER_ERROR", "Service de synchronisation indisponible.", 500);
  }
  const access = actives[0] ?? null;
  if (!access) {
    if (foundRows.length > 0) {
      return fail("REVOKED_ERROR", "Accès coupé. Contactez votre magasin.", 403);
    }
    return fail("AUTH_ERROR", "Téléphone ou code incorrect.", 401);
  }
  const now = new Date();
  // (défense en profondeur) la ligne retenue est active par construction.
  if (access.revoked_at != null) {
    return fail("REVOKED_ERROR", "Accès coupé. Contactez votre magasin.", 403);
  }
  if (typeof access.locked_until === "string" && Date.parse(access.locked_until) > now.getTime()) {
    return fail("LOCKED_ERROR", "Compte verrouillé 5 minutes (5 échecs).", 429);
  }
  const pinHash = await sha256Hex(pin);
  // Verrou éventuel déjà expiré (sinon on aurait répondu 429 plus haut).
  const lockExpired =
    typeof access.locked_until === "string" && Date.parse(access.locked_until) <= now.getTime();
  if (!constantTimeEquals(pinHash, access.pin_hash)) {
    // Quand le verrou PRÉCÉDENT a expiré, on repart de 0 : sans cette remise
    // à zéro, `failed_attempts` restait ≥5 et le tout premier mauvais PIN
    // après l'expiration reverrouillait instantanément (1 essai / 5 min pour
    // toujours, au lieu de 5 échecs / 5 min — règle du POS).
    const base = lockExpired ? 0 : (access.failed_attempts ?? 0);
    const failed = base + 1;
    const locked = failed >= MAX_FAILED ? new Date(now.getTime() + LOCK_MS).toISOString() : null;
    // Écriture de SÉCURITÉ : si elle échoue, le compteur ne bouge plus =
    // force brute PIN illimitée. On échoue fermé (500) plutôt que de servir.
    const { error: attemptError } = await supa
      .from("client_access")
      .update({ failed_attempts: failed, locked_until: locked, updated_at: now.toISOString() })
      .eq("customer_id", access.customer_id);
    if (attemptError) {
      console.error("client-sync: compteur d'echecs non mis a jour", attemptError.code);
      return fail("SERVER_ERROR", "Service de synchronisation indisponible.", 500);
    }
    return fail("AUTH_ERROR", "Téléphone ou code incorrect.", 401);
  }
  // Succès : compteur remis à zéro, puis derniers clichés en une lecture.
  // Écriture de sécurité contrôlée aussi : un reset perdu laisserait un
  // compte verrouillé/denied sans raison (déni de service silencieux).
  const { error: resetError } = await supa
    .from("client_access")
    .update({ failed_attempts: 0, locked_until: null, updated_at: now.toISOString() })
    .eq("customer_id", access.customer_id);
  if (resetError) {
    console.error("client-sync: compteur non remis a zero", resetError.code);
    return fail("SERVER_ERROR", "Service de synchronisation indisponible.", 500);
  }
  const { data: rows, error: payloadError } = await supa
    .from("latest_client_payloads")
    .select("kind, payload, created_at")
    .eq("customer_id", access.customer_id);
  // Un échec de lecture ignoré répondrait 200 { snapshot: null } = « connexion
  // réussie sur un compte vide » : le client croirait sa dette à zéro. Fermé.
  if (payloadError) {
    console.error("client-sync: lecture des cliches impossible", payloadError.code);
    return fail("SERVER_ERROR", "Service de synchronisation indisponible.", 500);
  }

  const pick = (kind: string): unknown => rows?.find((r) => r.kind === kind)?.payload ?? null;
  // Détail à la demande (page facture APK) : dernier cliché `invoice_detail`
  // dont `payload.sale.id` correspond (comparaison lâche entier/chaîne).
  // Balaye les DETAIL_SCAN_LIMIT derniers (borne partagée avec le relais E2E).
  if (saleId != null) {
    const { data: details, error: detailError } = await supa
      .from("client_payloads")
      .select("payload")
      .eq("customer_id", access.customer_id)
      .eq("kind", "invoice_detail")
      .order("id", { ascending: false })
      .limit(DETAIL_SCAN_LIMIT);
    if (detailError) {
      console.error("client-sync: lecture des details impossible", detailError.code);
      return fail("SERVER_ERROR", "Échec de synchronisation.", 500);
    }
    const match = (details ?? []).find((r) => {
      const sale = ((r.payload ?? {}) as Json)["sale"] as Json | undefined;
      return sale != null && String(sale["id"]) === String(saleId);
    });
    if (!match) {
      return fail("NOT_FOUND", "Facture indisponible.", 404);
    }
    return new Response(
      JSON.stringify({
        ok: true,
        data: { detail: (match.payload ?? {}) as Json, syncedAt: now.toISOString() },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
  return new Response(
    JSON.stringify({
      ok: true,
      data: {
        snapshot: pick("customer_snapshot"),
        invoices: pick("invoice_list"),
        payments: pick("payment_list"),
        syncedAt: now.toISOString(),
      },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
