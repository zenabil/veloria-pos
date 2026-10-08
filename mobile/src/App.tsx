// Veloria Client — Coquille : 5 onglets max + porte de connexion.
// Session persistée (SecureStore, repli mémoire) + clichés persistés
// (expo-sqlite, repli mémoire) : l'appli rouvre sur les dernières données.
import { useEffect, useRef, useState } from "react";
import { BackHandler, Image, Linking, Modal, Platform, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, GRADIENTS, RADIUS, SHADOW, SIZES, SPACE, tint } from "./tokens.ts";
import { formatDateFr } from "./format.ts";
import { t, type Lang } from "./i18n.ts";
import { SyncError, fetchInvoiceDetail, syncNow } from "./api.ts";
import { ANON_KEY, SYNC_URL } from "./config.ts";
import { EMPTY_CACHE, type MirrorCache, type Session } from "./store.ts";
import {
  clearCache,
  clearSession,
  loadCache,
  loadDetail,
  loadSession,
  saveCache,
  saveDetail,
  saveSession,
} from "./cache.ts";
import { num, toHome } from "./views.ts";
import { buildShareText, toDetail, type InvoiceDetail } from "./views.ts";
import type { HomeInvoice, HomePayment } from "./views.ts";
import { TabBar, type TabId } from "./ui/nav.tsx";
import { IconBubble, flow, Tap } from "./ui/kit.tsx";
import { RootErrorBoundary } from "./ui/error-boundary.tsx";
import { LoginScreen } from "./screens/Login.tsx";
import { HomeScreen } from "./screens/Home.tsx";
import { InvoicesScreen } from "./screens/Invoices.tsx";
import { InvoiceDetailScreen } from "./screens/InvoiceDetail.tsx";
import { PaymentsScreen } from "./screens/Payments.tsx";
import { AccountScreen } from "./screens/Account.tsx";

type Tab = TabId;

function asRows(payload: unknown, key: string): Record<string, unknown>[] {
  const p = (payload ?? {}) as Record<string, unknown>;
  const v = p[key];
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

export function App(): React.JSX.Element {
  const [lang, setLang] = useState<Lang>("ar");
  const [session, setSession] = useState<{
    phone: string;
    pin: string;
    supabaseUrl: string | null;
    anonKey: string | null;
  } | null>(null);
  const [cache, setCache] = useState<MirrorCache>(EMPTY_CACHE);
  const [tab, setTab] = useState<Tab>("home");
  const [hidden, setHidden] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [booted, setBooted] = useState(false);
  const [detailRow, setDetailRow] = useState<HomeInvoice | null>(null);
  const [detailData, setDetailData] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  // Jeton de requête du détail : seule la dernière ouverture a le droit
  // d'écrire dans detailData/detailLoading/detailError.
  const detailReq = useRef(0);

  function nameOf(snapshot: unknown): string {
    const c = ((snapshot ?? {}) as Record<string, unknown>)["customer"] as
      | Record<string, unknown>
      | undefined;
    const fn = typeof c?.["first_name"] === "string" ? c["first_name"] : "";
    const ln = typeof c?.["last_name"] === "string" ? c["last_name"] : "";
    return `${fn} ${ln}`.trim();
  }

  // Restauration au démarrage : session SecureStore + clichés expo-sqlite,
  // puis rafraîchissement silencieux si une session existe.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [sess, cached] = await Promise.all([loadSession(), Promise.resolve(loadCache())]);
        if (!alive) return;
        if (sess) {
          setSession({
            phone: sess.phone,
            pin: sess.pin,
            supabaseUrl: sess.supabaseUrl ?? null,
            anonKey: sess.anonKey ?? null,
          });
          setLang(sess.lang);
          setHidden(sess.amountsHidden);
        }
        if (cached.syncedAt) {
          setCache(cached);
          setCustomerName(nameOf(cached.snapshot));
          setStale(true);
        }
        if (sess) await refreshWith(sess);
      } catch {
        // Stockage illisible : on démarre quand même sur l'écran de connexion.
      } finally {
        if (alive) setBooted(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Mémorise langue + masquage + dernière synchro (session existante).
  // Toutes les dépendances sont déclarées : sinon un rafraîchissement suivi
  // d'un changement de langue réécrirait un `lastLoginAt` périmé.
  useEffect(() => {
    if (!session || !booted) return;
    const s: Session = {
      phone: session.phone,
      pin: session.pin,
      lang,
      amountsHidden: hidden,
      lastLoginAt: cache.syncedAt,
      supabaseUrl: session.supabaseUrl ?? null,
      anonKey: session.anonKey ?? null,
    };
    void saveSession(s);
  }, [lang, hidden, session, booted, cache.syncedAt]);

  // Retour matériel Android : ferme la couche superposée (détail d'abord,
  // puis panneau) au lieu de quitter l'appli ; sinon on laisse la sortie au
  // système. Web/iOS : pas de retour matériel (BackHandler non supporté).
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (detailRow) {
        closeDetail();
        return true;
      }
      if (notifOpen) {
        setNotifOpen(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [detailRow, notifOpen]);

  function syncErrorMessage(code: SyncError["code"]): string {
    if (code === "AUTH_ERROR") return t(lang, "loginError");
    if (code === "LOCKED_ERROR") return t(lang, "lockedError");
    if (code === "REVOKED_ERROR") return t(lang, "revokedError");
    if (code === "OFFLINE_ERROR") return t(lang, "offlineError");
    return t(lang, "serverError");
  }

  function applyPayloads(data: {
    snapshot: unknown;
    invoices: unknown;
    payments: unknown;
    syncedAt: string;
  }): void {
    const next = {
      snapshot: data.snapshot,
      invoices: data.invoices,
      payments: data.payments,
      syncedAt: data.syncedAt,
    };
    setCache(next);
    saveCache(next);
    setCustomerName(nameOf(data.snapshot));
    setStale(false);
  }

  async function login(
    phone: string,
    pin: string,
    endpoint?: { supabaseUrl: string; anonKey: string } | null,
  ): Promise<void> {
    setError(null);
    // QR V2 (ADR-068) : l'endpoint du magasin prime ; sinon repli V1 gravé.
    const baseUrl = endpoint?.supabaseUrl ?? SYNC_URL;
    const anon = endpoint?.anonKey ?? ANON_KEY;
    try {
      const data = await syncNow(baseUrl, anon, phone, pin, fetch);
      setSession({
        phone,
        pin,
        supabaseUrl: endpoint?.supabaseUrl ?? null,
        anonKey: endpoint?.anonKey ?? null,
      });
      applyPayloads(data);
      await saveSession({
        phone,
        pin,
        lang,
        amountsHidden: hidden,
        lastLoginAt: data.syncedAt,
        supabaseUrl: endpoint?.supabaseUrl ?? null,
        anonKey: endpoint?.anonKey ?? null,
      });
      setTab("home");
    } catch (e) {
      if (e instanceof SyncError) {
        setError(syncErrorMessage(e.code));
      } else {
        // Exception inattendue : phrase complète, sans prétendre qu'une copie
        // locale est affichée (on est sur l'écran de connexion).
        setError(t(lang, "serverError"));
      }
    }
  }

  async function refreshWith(sess: {
    phone: string;
    pin: string;
    supabaseUrl?: string | null;
    anonKey?: string | null;
  }): Promise<void> {
    try {
      const data = await syncNow(
        sess.supabaseUrl ?? SYNC_URL,
        sess.anonKey ?? ANON_KEY,
        sess.phone,
        sess.pin,
        fetch,
      );
      applyPayloads(data);
    } catch (e) {
      // Accès refusé (PIN changé, révoqué ou verrouillé) : on n'affiche JAMAIS
      // la copie offline à vie — on efface la session et on reforce la connexion.
      if (
        e instanceof SyncError &&
        (e.code === "AUTH_ERROR" || e.code === "REVOKED_ERROR" || e.code === "LOCKED_ERROR")
      ) {
        setError(syncErrorMessage(e.code));
        await endSession();
        return;
      }
      // Réseau/serveur indisponible : la copie locale reste affichée (stale).
      setStale(true);
    }
  }

  async function refresh(): Promise<void> {
    if (!session) return;
    await refreshWith(session);
  }

  /** Ferme tout et efface la session locale (PIN, cache, détails). */
  async function endSession(): Promise<void> {
    setSession(null);
    setCache(EMPTY_CACHE);
    setCustomerName("");
    setStale(false);
    setTab("home");
    closeDetail();
    await Promise.all([clearSession(), Promise.resolve(clearCache())]);
  }

  async function logout(): Promise<void> {
    setError(null);
    await endSession();
  }

  function detailMessage(code: SyncError["code"]): string {
    if (code === "NOT_FOUND_ERROR") return t(lang, "detailNotFound");
    if (code === "OFFLINE_ERROR") return t(lang, "offlineError");
    if (code === "AUTH_ERROR") return t(lang, "loginError");
    if (code === "LOCKED_ERROR") return t(lang, "lockedError");
    if (code === "REVOKED_ERROR") return t(lang, "revokedError");
    return t(lang, "serverError");
  }

  /** Ferme la page détail et invalide les réponses encore en vol. */
  function closeDetail(): void {
    detailReq.current += 1;
    setDetailRow(null);
    setDetailData(null);
    setDetailError(null);
    setDetailLoading(false);
  }

  // Page détail : cache sqlite d'abord, puis miroir (frais), jamais d'écran vide.
  // Un jeton de requête garantit que seule LA DERNIÈRE ouverture écrit dans
  // l'état : sinon une réponse lente d'une facture A écrase le détail B et
  // annule son squelette.
  async function openDetail(row: HomeInvoice): Promise<void> {
    const req = ++detailReq.current;
    const current = (): boolean => detailReq.current === req;
    setDetailRow(row);
    setDetailData(null);
    setDetailError(null);
    setDetailLoading(true);
    let cached: InvoiceDetail | null = null;
    try {
      cached = toDetail(loadDetail(row.id)?.detail);
    } catch {
      cached = null;
    }
    if (!current()) return;
    if (cached) setDetailData(cached);
    if (!session) {
      if (!cached) setDetailError(t(lang, "detailNotFound"));
      setDetailLoading(false);
      return;
    }
    try {
      const d = await fetchInvoiceDetail(
        session.supabaseUrl ?? SYNC_URL,
        session.anonKey ?? ANON_KEY,
        session.phone,
        session.pin,
        row.id,
        fetch,
      );
      if (!current()) return;
      const parsed = toDetail(d.detail);
      if (!parsed) throw new SyncError("NOT_FOUND_ERROR", "Facture indisponible.");
      setDetailData(parsed);
      saveDetail(row.id, d.detail, d.syncedAt);
      setDetailError(null);
    } catch (e) {
      if (!current()) return;
      if (!cached) {
        setDetailError(e instanceof SyncError ? detailMessage(e.code) : t(lang, "serverError"));
      }
    } finally {
      if (current()) setDetailLoading(false);
    }
  }

  if (!booted) {
    return (
      <LinearGradient
        colors={GRADIENTS.heroDeep}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: SPACE.md }}
      >
        <Image
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require("../assets/brand/veloria-customer.png")}
          style={{
            width: 76,
            height: 76,
            borderRadius: 24,
          }}
          accessibilityLabel="Veloria"
        />
        <Text style={{ fontSize: 24, fontWeight: "900", color: COLORS.white, letterSpacing: 0.6 }}>
          Veloria
        </Text>
        <Text style={{ color: COLORS.navyMuted, fontSize: 12 }}>{t(lang, "loading")}</Text>
      </LinearGradient>
    );
  }

  if (!session) {
    return <LoginScreen lang={lang} onLang={setLang} onLogin={login} error={error} />;
  }

  // Montants passés par `num()` STRICT (vue testée) : un montant legacy non
  // entier (ex. 12.9) dégrade en dérivé `total - remaining` (ou 0), jamais
  // tronqué en valeur plausible. Les quantités décimales vont à `numQty`.
  const invoiceRows = asRows(cache.invoices, "sales").map((s) => ({
    id: num(s["id"]),
    invoice_number: String(s["invoice_number"] ?? ""),
    total_minor: num(s["total_minor"]),
    amount_paid_minor:
      typeof s["amount_paid_minor"] === "number" && Number.isSafeInteger(s["amount_paid_minor"])
        ? (s["amount_paid_minor"] as number)
        : num(s["total_minor"]) - num(s["remaining_balance_minor"]),
    remaining_balance_minor: num(s["remaining_balance_minor"]),
    payment_status: String(s["payment_status"] ?? ""),
    is_cancelled: num(s["is_cancelled"]),
    created_at: String(s["created_at"] ?? ""),
  })) as HomeInvoice[];
  const paymentRows = asRows(cache.payments, "payments").map((p) => ({
    id: num(p["id"]),
    amount_minor: num(p["amount_minor"]),
    method: String(p["method"] ?? ""),
    reference: typeof p["reference"] === "string" ? p["reference"] : null,
    sale_id: typeof p["sale_id"] === "number" ? num(p["sale_id"]) : null,
    payment_date: String(p["payment_date"] ?? ""),
  })) as HomePayment[];

  const tabs: { id: Tab; label: string }[] = [
    { id: "home", label: t(lang, "home") },
    { id: "invoices", label: t(lang, "invoices") },
    { id: "payments", label: t(lang, "payments") },
    { id: "account", label: t(lang, "account") },
  ];
  const home = toHome(cache.snapshot);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.contentBg, paddingTop: 36 }}>
      {/* TopAppBar V3 : marque + état synchro + cloche + langue */}
      <LinearGradient
        colors={GRADIENTS.heroDeep}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          flexDirection: flow(lang === "ar" ? "rtl" : "ltr"),
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: SPACE.lg,
          paddingVertical: SPACE.sm,
          gap: SPACE.sm,
        }}
      >
        <View
          style={{
            flexDirection: flow(lang === "ar" ? "rtl" : "ltr"),
            alignItems: "center",
            gap: SPACE.sm,
            flex: 1,
          }}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 11,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              source={require("../assets/brand/veloria-customer.png")}
              style={{ width: 34, height: 34 }}
              accessibilityLabel="Veloria"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: COLORS.white, fontWeight: "900", fontSize: 15 }}
              numberOfLines={1}
            >
              Veloria Client
            </Text>
            <View
              style={{
                flexDirection: flow(lang === "ar" ? "rtl" : "ltr"),
                alignItems: "center",
                gap: 5,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: stale ? COLORS.primary : COLORS.headerAccent,
                }}
              />
              <Text style={{ color: COLORS.navyMuted, fontSize: 10 }} numberOfLines={1}>
                {stale ? t(lang, "staleData") : t(lang, "connected")}
              </Text>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: flow(lang === "ar" ? "rtl" : "ltr"), gap: SPACE.sm }}>
          {/* Cloche : annonce boutique + fraîcheur (pas de push en V1).
              Changement de langue : écran Compte (post-connexion) et écran
              de connexion (pré-connexion) — un seul endroit par contexte. */}
          <Tap
            onPress={() => setNotifOpen(true)}
            accessibilityLabel={t(lang, "notifications")}
            style={{
              width: SIZES.touchMin,
              height: SIZES.touchMin,
              borderRadius: SIZES.touchMin / 2,
              backgroundColor: tint(COLORS.white, "14"),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name={home.announcement ? "notifications" : "notifications-outline"}
              size={18}
              color={home.announcement ? COLORS.primary : COLORS.headerText}
            />
          </Tap>
        </View>
      </LinearGradient>
      <View style={{ flex: 1 }}>
        {detailRow ? (
          <InvoiceDetailScreen
            lang={lang}
            row={detailRow}
            customerName={customerName}
            shopName={home.shop.name}
            hidden={hidden}
            detail={detailData}
            loading={detailLoading}
            error={detailError}
            onBack={closeDetail}
            onRetry={() => void openDetail(detailRow)}
            onReport={(text) => {
              // Signaler une erreur → conversation avec LA BOUTIQUE (numéro connu),
              // pas un partage générique.
              const shop = home.shop.phone ?? "";
              const url =
                shop !== ""
                  ? `https://wa.me/${shop}?text=${encodeURIComponent(text)}`
                  : `https://wa.me/?text=${encodeURIComponent(text)}`;
              void Linking.openURL(url).catch(() => undefined);
            }}
            onShare={(text) => {
              void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`).catch(
                () => undefined,
              );
            }}
          />
        ) : tab === "home" ? (
          <HomeScreen
            lang={lang}
            snapshot={cache.snapshot}
            syncedAt={cache.syncedAt}
            stale={stale}
            hidden={hidden}
            onToggleHidden={() => setHidden((h) => !h)}
            onRefresh={() => refresh()}
            onOpenTab={(t2) => setTab(t2)}
            onOpenDetail={(row) => void openDetail(row)}
          />
        ) : tab === "invoices" ? (
          <InvoicesScreen
            lang={lang}
            rows={invoiceRows}
            customerName={customerName}
            shopName={home.shop.name}
            hidden={hidden}
            onOpenDetail={(row) => void openDetail(row)}
            onReport={(text) => {
              const shop = home.shop.phone ?? "";
              const url =
                shop !== ""
                  ? `https://wa.me/${shop}?text=${encodeURIComponent(text)}`
                  : `https://wa.me/?text=${encodeURIComponent(text)}`;
              void Linking.openURL(url).catch(() => undefined);
            }}
            onRefresh={() => refresh()}
          />
        ) : tab === "payments" ? (
          <PaymentsScreen
            lang={lang}
            rows={paymentRows}
            customerName={customerName}
            shopName={home.shop.name}
            hidden={hidden}
            onRefresh={() => refresh()}
          />
        ) : (
          <AccountScreen
            lang={lang}
            customerName={customerName}
            phone={session.phone}
            lastLoginAt={cache.syncedAt}
            shopName={home.shop.name}
            shopPhone={home.shop.phone ?? ""}
            shopAddress={home.shop.address}
            announcement={home.announcement}
            appVersion="1.0.0"
            developer="Veloria"
            supportPhone={home.shop.phone ?? ""}
            debtMinor={home.debtMinor}
            debtStatus={home.debtStatus}
            overLimit={home.overLimit}
            hidden={hidden}
            onLogout={() => {
              void logout();
            }}
            onChangePin={() => {
              const contact = home.shop.phone ?? "";
              const text = `${t(lang, "newPinRequest")} — ${customerName} (${session.phone})`;
              const url =
                contact !== "" ? `https://wa.me/${contact}?text=${encodeURIComponent(text)}` : null;
              if (url) void Linking.openURL(url).catch(() => undefined);
              else setError(t(lang, "emptyHint"));
            }}
            onShare={() => {
              const text = buildShareText({
                lang,
                name: customerName,
                debtMinor: home.debtMinor,
                syncedAt: cache.syncedAt,
              });
              void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`).catch(
                () => undefined,
              );
            }}
            onToggleLang={() => setLang(lang === "ar" ? "fr" : "ar")}
          />
        )}
      </View>
      {/* Bandeau d'erreur façon toast (disparaît au tap) */}
      {error && session ? (
        <Tap
          onPress={() => setError(null)}
          accessibilityLabel={`${error} — ${t(lang, "close")}`}
          accessibilityLiveRegion="polite"
          hitSlop={16}
          style={[
            {
              position: "absolute",
              bottom: 96,
              left: SPACE.lg,
              right: SPACE.lg,
              backgroundColor: COLORS.headerBg,
              borderRadius: RADIUS.cardSm,
              padding: SPACE.md,
              flexDirection: flow(lang === "ar" ? "rtl" : "ltr"),
              alignItems: "center",
              gap: SPACE.sm,
              borderWidth: 1,
              borderColor: tint(COLORS.debtOverdue, "66"),
            },
            SHADOW.nav,
          ]}
        >
          <IconBubble icon="alert-circle" color={COLORS.dangerLight} size={30} />
          <Text style={{ color: COLORS.white, flex: 1, fontSize: 13, fontWeight: "600" }}>
            {error}
          </Text>
          <Ionicons name="close" size={16} color={COLORS.navyMuted} />
        </Tap>
      ) : null}
      {/* Panneau notifications V3 : annonce + fraîcheur (bottom-sheet) */}
      <Modal
        visible={notifOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setNotifOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(lang, "close")}
          onPress={() => setNotifOpen(false)}
          style={{
            flex: 1,
            backgroundColor: COLORS.overlay,
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: COLORS.cardBg,
              borderTopLeftRadius: RADIUS.sheet,
              borderTopRightRadius: RADIUS.sheet,
              padding: SPACE.xl,
              paddingBottom: 32,
            }}
          >
            <View
              style={{
                alignSelf: "center",
                width: 44,
                height: 5,
                borderRadius: 3,
                backgroundColor: COLORS.border,
                marginBottom: SPACE.lg,
              }}
            />
            <View
              style={{
                flexDirection: flow(lang === "ar" ? "rtl" : "ltr"),
                alignItems: "center",
                justifyContent: "space-between",
                gap: SPACE.sm,
              }}
            >
              <View
                style={{
                  flexDirection: flow(lang === "ar" ? "rtl" : "ltr"),
                  alignItems: "center",
                  gap: SPACE.sm,
                }}
              >
                <IconBubble icon="notifications-outline" color={COLORS.headerBg} size={36} />
                <Text style={{ color: COLORS.cardText, fontWeight: "900", fontSize: 18 }}>
                  {t(lang, "notifications")}
                </Text>
              </View>
            </View>

            <View
              style={{
                backgroundColor: home.announcement ? tint(COLORS.debtOk, "14") : COLORS.contentBg,
                borderRadius: RADIUS.cardSm,
                borderWidth: 1,
                borderColor: home.announcement ? tint(COLORS.debtOk, "3D") : COLORS.border,
                padding: SPACE.md,
                marginTop: SPACE.lg,
                flexDirection: flow(lang === "ar" ? "rtl" : "ltr"),
                gap: SPACE.sm,
                alignItems: "flex-start",
              }}
            >
              <IconBubble
                icon={home.announcement ? "megaphone" : "checkmark-circle"}
                color={home.announcement ? COLORS.debtOk : COLORS.cardMuted}
                size={32}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.cardText, fontWeight: "700", fontSize: 14 }}>
                  {home.announcement ?? t(lang, "noAnnouncement")}
                </Text>
                <Text style={{ color: COLORS.cardMuted, fontSize: 12, marginTop: 4 }}>
                  {t(lang, "lastSync")}: {cache.syncedAt ? formatDateFr(cache.syncedAt) : "—"}
                  {stale ? ` · ${t(lang, "staleData")}` : ""}
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => setNotifOpen(false)}
              style={{
                backgroundColor: COLORS.headerBg,
                borderRadius: RADIUS.pill,
                padding: 14,
                marginTop: SPACE.lg,
                alignItems: "center",
              }}
            >
              <Text style={{ color: COLORS.white, fontWeight: "800" }}>{t(lang, "close")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      {/* Dock flottant 4 onglets (masqué sur la page détail) */}
      {!detailRow ? (
        <TabBar lang={lang} active={tab} tabs={tabs} onChange={(id) => setTab(id)} />
      ) : null}
    </View>
  );
}

/** Point d'entrée enregistré : toute exception au rendu affiche l'écran
 * bilingue de secours au lieu de fermer l'appli sans message. */
export function Root(): React.JSX.Element {
  return (
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  );
}
