// Veloria Owner — coquille : porte de connexion, 5 onglets, 4 sous-écrans.
// Lecture seule stricte : aucune mutation métier n'est possible ici.
// Aucune donnée fictive : sans endpoint configuré, l'app refuse d'ouvrir.
import { useEffect, useState } from "react";
import { Modal, StatusBar, Text, View } from "react-native";
import { COLORS, RADIUS, SIZES, SPACE, TYPE } from "./tokens.ts";
import { assertConfig, isConfigured } from "./config.ts";
import { fetchOwnerSnapshot, isSnapshotShape, OwnerError, signInWithPassword } from "./api.ts";
import {
  clearSession,
  clearSnapshot,
  loadSession,
  loadSnapshot,
  saveSession,
  saveSnapshot,
} from "./cache.ts";
import {
  findDebtor,
  findJournalEntry,
  findProduct,
  type OwnerSnapshot,
  type SaleKind,
  type Session,
} from "./store.ts";
import { AppHeader, TabBar, type TabId } from "./ui/nav.tsx";
import { Button, Card, Tap } from "./ui/kit.tsx";
import { OwnerErrorBoundary } from "./ui/error-boundary.tsx";
import { Icon } from "./ui/Icon.tsx";
import { LoginScreen } from "./screens/Login.tsx";
import { TodayScreen } from "./screens/Today.tsx";
import { MoneyScreen } from "./screens/Money.tsx";
import { StockScreen } from "./screens/Stock.tsx";
import { PeriodsScreen } from "./screens/Periods.tsx";
import { AlertsScreen } from "./screens/Alerts.tsx";
import { ProductDetailScreen } from "./screens/ProductDetail.tsx";
import { DebtorDetailScreen } from "./screens/DebtorDetail.tsx";
import { CashAuditScreen } from "./screens/CashAudit.tsx";
import { TransactionDetailScreen } from "./screens/TransactionDetail.tsx";

assertConfig();

type Detail =
  | { kind: "product"; id: string }
  | { kind: "debtor"; id: string }
  | { kind: "transaction"; id: string }
  | { kind: "cashAudit" }
  | null;

const TAB_LABEL: Record<TabId, string> = {
  today: "Aujourd'hui",
  money: "Argent",
  stock: "Stock",
  periods: "Périodes",
  alerts: "Alertes",
};

interface Toast {
  tone: "success" | "error";
  text: string;
}

function errorText(err: unknown): string {
  if (err instanceof OwnerError) return err.message;
  return "Opération impossible. Vérifiez votre connexion.";
}

/** Liasse driftée : phrase française affichée, jamais de rendu ni d'exception brute. */
const INVALID_LIASSE_TEXT = "Liasse de supervision invalide ou de version incompatible.";

/**
 * Un jeton dont l'expiration est connue et dépassée est MORT : on ne le rejoue
 * pas contre le réseau (401 garanti), on ferme la session. `expiresAt` absent
 * (session ancienne) = on tente, le 401 fermera la session de toute façon.
 */
function isExpired(session: Session, nowMs: number): boolean {
  const raw = session.expiresAt;
  if (typeof raw !== "string") return false;
  const expires = Date.parse(raw);
  return Number.isFinite(expires) && expires <= nowMs;
}

export function App(): React.JSX.Element {
  const [booted, setBooted] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [snapshot, setSnapshot] = useState<OwnerSnapshot | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("today");
  const [todayView, setTodayView] = useState<"summary" | "journal">("summary");
  const [todayKind, setTodayKind] = useState<"all" | SaleKind>("all");
  const [detail, setDetail] = useState<Detail>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await loadSession();
        if (stored && isExpired(stored, Date.now())) {
          // Session morte en cache : elle ne rouvre aucune donnée périmée.
          setLoginError("Session expirée. Veuillez vous réauthentifier.");
          await endSession();
        } else if (stored) {
          setSession(stored);
          const cached = loadSnapshot();
          if (isSnapshotShape(cached.snapshot)) {
            const valid = cached.snapshot;
            setSnapshot(valid);
            setGeneratedAt(cached.generatedAt ?? valid.generatedAt);
          } else if (cached.snapshot !== null) {
            // Liasse driftée en cache : purgée tout de suite. Sans ce nettoyage
            // elle serait re-testée à chaque lancement — et c'est exactement
            // comme ça qu'une seule valeur flottante faisait planter l'app.
            clearSnapshot();
          }
        }
      } catch {
        /* stockage illisible : l'écran de connexion s'ouvre normalement */
      } finally {
        setBooted(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  function applySnapshot(next: OwnerSnapshot, generated: string): void {
    setSnapshot(next);
    setGeneratedAt(generated);
    saveSnapshot(next, generated);
  }

  async function handleLogin(email: string, password: string): Promise<void> {
    setLoginBusy(true);
    setLoginError(null);
    try {
      const auth = await signInWithPassword(email, password, fetch);
      const res = await fetchOwnerSnapshot(auth.accessToken, fetch);
      if (!isSnapshotShape(res.snapshot)) {
        throw new OwnerError("SERVER_ERROR", INVALID_LIASSE_TEXT);
      }
      const stored: Session = {
        email: email.trim(),
        accessToken: auth.accessToken,
        // L'expiration est CONSERVÉE : sans elle, l'app ne peut pas savoir que
        // son jeton est mort et le rejoue contre le réseau à chaque geste.
        expiresAt: auth.expiresAt,
        lastLoginAt: new Date().toISOString(),
      };
      await saveSession(stored);
      setSession(stored);
      applySnapshot(res.snapshot, res.generatedAt);
      setTab("today");
      setToast({ tone: "success", text: "Données de supervision chargées." });
    } catch (err) {
      setLoginError(errorText(err));
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleRefresh(): Promise<void> {
    if (!session) return;
    if (isExpired(session, Date.now())) {
      setLoginError("Session expirée. Veuillez vous réauthentifier.");
      await endSession();
      return;
    }
    setRefreshing(true);
    try {
      if (!session.accessToken) throw new OwnerError("UNAUTHORIZED", "Session expirée.");
      const res = await fetchOwnerSnapshot(session.accessToken, fetch);
      if (!isSnapshotShape(res.snapshot)) {
        // Liasse driftée : on GARDE la dernière liasse saine et on le dit.
        // Rien de cette réponse n'est rendu — c'est elle qui déclenchait le
        // crash bouclé (montant flottant ou absent publié par le POS).
        setOffline(true);
        setToast({ tone: "error", text: `${INVALID_LIASSE_TEXT} Dernières données conservées.` });
        return;
      }
      applySnapshot(res.snapshot, res.generatedAt);
      setOffline(false);
      setToast({ tone: "success", text: "Données actualisées." });
    } catch (err) {
      if (err instanceof OwnerError && err.code === "UNAUTHORIZED") {
        // Terminal, comme l'APK : un 401 ne se rejoue pas en « hors ligne » à
        // vie — la session est fermée et la liasse cachée purgée.
        setLoginError(err.message);
        await endSession();
        return;
      }
      setOffline(true);
      setToast({ tone: "error", text: errorText(err) });
    } finally {
      setRefreshing(false);
    }
  }

  /**
   * Ferme tout : session SecureStore + liasse en cache + écrans ouverts.
   * Une copie locale ne survit JAMAIS à une session terminale (sinon l'app
   * rouvrirait des chiffres que le magasin n'a plus autorisés à consulter).
   */
  async function endSession(): Promise<void> {
    await clearSession();
    clearSnapshot();
    setSession(null);
    setSnapshot(null);
    setGeneratedAt(null);
    setDetail(null);
    setAccountOpen(false);
    setTab("today");
    setOffline(false);
  }

  async function handleLogout(): Promise<void> {
    setLoginError(null);
    await endSession();
  }

  function handleTab(next: TabId): void {
    setDetail(null);
    setTab(next);
  }

  if (!booted) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.headerBg,
          alignItems: "center",
          justifyContent: "center",
          gap: SPACE.md,
        }}
      >
        <StatusBar barStyle="light-content" />
        <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 28 }}>V</Text>
        <Text style={{ color: COLORS.navyMuted, ...TYPE.label }}>
          Chargement de la supervision…
        </Text>
      </View>
    );
  }

  if (!isConfigured) {
    return <ConfigScreen />;
  }

  if (!session) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <LoginScreen
          busy={loginBusy}
          error={loginError}
          initialEmail=""
          onLogin={(email, password) => void handleLogin(email, password)}
          onForgot={() =>
            setToast({
              tone: "error",
              text: "Contactez l'administrateur du magasin pour réinitialiser votre mot de passe.",
            })
          }
        />
      </>
    );
  }

  if (!snapshot) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.contentBg }}>
        <StatusBar barStyle="light-content" />
        <AppHeader
          shopName="Veloria"
          screenLabel={TAB_LABEL[tab]}
          generatedAt={generatedAt}
          offline={offline}
          refreshing={refreshing}
          onRefresh={() => void handleRefresh()}
          onAccount={() => setAccountOpen(true)}
        />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: SPACE.xl,
            gap: SPACE.md,
          }}
        >
          <Icon name="cloud-offline-outline" size={40} color={COLORS.cardMuted} />
          <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted, textAlign: "center" }}>
            Aucune donnée locale. Lancez une actualisation dès que le POS aura publié sa première
            liasse.
          </Text>
          <Button
            label={refreshing ? "Actualisation…" : "Actualiser"}
            icon="refresh"
            busy={refreshing}
            onPress={() => void handleRefresh()}
          />
        </View>
        <TabBar active={tab} onChange={handleTab} />
        <AccountModal
          open={accountOpen}
          session={session}
          onClose={() => setAccountOpen(false)}
          onLogout={() => void handleLogout()}
        />
      </View>
    );
  }

  const product = detail?.kind === "product" ? findProduct(snapshot, detail.id) : null;
  const debtor = detail?.kind === "debtor" ? findDebtor(snapshot, detail.id) : null;
  const entry = detail?.kind === "transaction" ? findJournalEntry(snapshot, detail.id) : null;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.contentBg }}>
      <StatusBar barStyle="light-content" />

      {detail === null ? (
        <AppHeader
          shopName={snapshot.shopName}
          screenLabel={TAB_LABEL[tab]}
          generatedAt={generatedAt}
          offline={offline || refreshing}
          refreshing={refreshing}
          onRefresh={() => void handleRefresh()}
          onAccount={() => setAccountOpen(true)}
        />
      ) : null}

      <View style={{ flex: 1 }}>
        {detail?.kind === "product" && product ? (
          <ProductDetailScreen product={product} onBack={() => setDetail(null)} />
        ) : detail?.kind === "debtor" && debtor ? (
          <DebtorDetailScreen debtor={debtor} onBack={() => setDetail(null)} />
        ) : detail?.kind === "transaction" && entry ? (
          <TransactionDetailScreen entry={entry} onBack={() => setDetail(null)} />
        ) : detail?.kind === "cashAudit" ? (
          <CashAuditScreen snapshot={snapshot} onBack={() => setDetail(null)} />
        ) : tab === "today" ? (
          <TodayScreen
            snapshot={snapshot}
            view={todayView}
            onView={setTodayView}
            kindFilter={todayKind}
            onKindFilter={setTodayKind}
            onOpenTransaction={(id) => setDetail({ kind: "transaction", id })}
          />
        ) : tab === "money" ? (
          <MoneyScreen
            snapshot={snapshot}
            onOpenCashAudit={() => setDetail({ kind: "cashAudit" })}
            onOpenDebtor={(id) => setDetail({ kind: "debtor", id })}
          />
        ) : tab === "stock" ? (
          <StockScreen
            snapshot={snapshot}
            onOpenProduct={(id) => setDetail({ kind: "product", id })}
          />
        ) : tab === "periods" ? (
          <PeriodsScreen snapshot={snapshot} />
        ) : (
          <AlertsScreen
            snapshot={snapshot}
            onOpenProduct={(id) => setDetail({ kind: "product", id })}
            onOpenDebtor={(id) => setDetail({ kind: "debtor", id })}
          />
        )}
      </View>

      <TabBar active={tab} onChange={handleTab} />

      {toast ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: SPACE.lg,
            right: SPACE.lg,
            bottom: SIZES.dockInset + SPACE.md,
            backgroundColor: toast.tone === "success" ? COLORS.headerBg : COLORS.criticalTone,
            borderRadius: RADIUS.control,
            paddingHorizontal: SPACE.lg,
            paddingVertical: SPACE.md,
            flexDirection: "row",
            alignItems: "center",
            gap: SPACE.sm,
          }}
        >
          <Icon
            name={toast.tone === "success" ? "checkmark-circle-outline" : "alert-circle-outline"}
            size={18}
            color={toast.tone === "success" ? COLORS.primary : COLORS.criticalText}
          />
          <Text
            style={{
              ...TYPE.bodySm,
              color: toast.tone === "success" ? COLORS.headerText : COLORS.criticalText,
              flex: 1,
            }}
          >
            {toast.text}
          </Text>
        </View>
      ) : null}

      <AccountModal
        open={accountOpen}
        session={session}
        onClose={() => setAccountOpen(false)}
        onLogout={() => void handleLogout()}
      />
    </View>
  );
}

/**
 * Point d'entrée enregistré par `index.js` (même montage que l'APK) : une
 * exception au rendu affiche l'écran de secours français au lieu de tuer
 * l'appli, et « effacer les données synchronisées » casse la boucle de crash
 * entretenue par la liasse mise en cache par `cache.ts`.
 */
export function Root(): React.JSX.Element {
  return (
    <OwnerErrorBoundary onClearCachedData={clearSnapshot}>
      <App />
    </OwnerErrorBoundary>
  );
}

/** Endpoint absent : aucune donnée locale, aucun accès offert. */
function ConfigScreen(): React.JSX.Element {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.headerBg,
        padding: SPACE.xl,
        justifyContent: "center",
        gap: SPACE.md,
      }}
    >
      <StatusBar barStyle="light-content" />
      <Icon name="settings-outline" size={40} color={COLORS.primary} />
      <Text style={{ color: COLORS.headerText, ...TYPE.title }}>Supervision non configurée</Text>
      <Text style={{ color: COLORS.navyMuted, ...TYPE.bodySm }}>
        Cette application ne contient aucune donnée locale. Renseignez EXPO_PUBLIC_OWNER_SYNC_URL et
        EXPO_PUBLIC_OWNER_ANON_KEY au moment du build, puis reconstruisez l'application.
      </Text>
      <Text style={{ color: COLORS.navyMuted, ...TYPE.label }}>
        Aucune donnée locale n'est embarquée dans l'application.
      </Text>
    </View>
  );
}

function AccountModal(props: {
  open: boolean;
  session: Session;
  onClose: () => void;
  onLogout: () => void;
}): React.JSX.Element {
  return (
    <Modal visible={props.open} transparent animationType="fade" onRequestClose={props.onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(5, 20, 36, 0.55)",
          justifyContent: "flex-end",
          padding: SPACE.lg,
        }}
      >
        <Card style={{ gap: SPACE.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
            <Icon name="person-circle-outline" size={30} color={COLORS.cardText} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...TYPE.headlineSm, color: COLORS.cardText }}>
                {props.session.email}
              </Text>
              <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                Session propriétaire — lecture seule
              </Text>
            </View>
          </View>
          <Button
            label="Se déconnecter"
            variant="quiet"
            icon="log-out-outline"
            onPress={props.onLogout}
            full
          />
          <Tap
            onPress={props.onClose}
            accessibilityLabel="Fermer"
            style={{ minHeight: SIZES.touchMin, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted }}>Fermer</Text>
          </Tap>
        </Card>
      </View>
    </Modal>
  );
}
