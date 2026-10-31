// Veloria Owner — coquille : porte de connexion, 5 onglets, 3 sous-écrans.
// Lecture seule stricte : aucune mutation métier n'est possible ici.
import { useEffect, useState } from "react";
import { Modal, StatusBar, Text, View } from "react-native";
import { COLORS, RADIUS, SIZES, SPACE, TYPE } from "./tokens.ts";
import { DEMO_MODE, assertConfig } from "./config.ts";
import { DEMO_SNAPSHOT } from "./demo.ts";
import { fetchOwnerSnapshot, isSnapshotShape, OwnerError, signInWithPassword } from "./api.ts";
import {
  clearSession,
  clearSnapshot,
  loadSession,
  loadSnapshot,
  saveSession,
  saveSnapshot,
} from "./cache.ts";
import { findDebtor, findProduct, type OwnerSnapshot, type Session } from "./store.ts";
import { AppHeader, TabBar, type TabId } from "./ui/nav.tsx";
import { Button, Card, Tap } from "./ui/kit.tsx";
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

assertConfig();

type Detail =
  { kind: "product"; id: string } | { kind: "debtor"; id: string } | { kind: "cashAudit" } | null;

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

export function Root(): React.JSX.Element {
  const [booted, setBooted] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [snapshot, setSnapshot] = useState<OwnerSnapshot | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("today");
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
        if (stored) {
          setSession(stored);
          const cached = loadSnapshot();
          if (isSnapshotShape(cached.snapshot)) {
            setSnapshot(cached.snapshot as OwnerSnapshot);
            setGeneratedAt(cached.generatedAt ?? (cached.snapshot as OwnerSnapshot).generatedAt);
          } else if (stored.demo) {
            setSnapshot(DEMO_SNAPSHOT);
            setGeneratedAt(DEMO_SNAPSHOT.generatedAt);
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
      if (DEMO_MODE) {
        const stored: Session = {
          email: email.trim(),
          accessToken: null,
          demo: true,
          lastLoginAt: new Date().toISOString(),
        };
        await saveSession(stored);
        setSession(stored);
        applySnapshot(DEMO_SNAPSHOT, DEMO_SNAPSHOT.generatedAt);
        setTab("today");
        setToast({ tone: "success", text: "Session de démonstration ouverte." });
        return;
      }
      const auth = await signInWithPassword(email, password, fetch);
      const res = await fetchOwnerSnapshot(auth.accessToken, fetch);
      if (!isSnapshotShape(res.snapshot)) {
        throw new OwnerError("SERVER_ERROR", "Liasse de supervision invalide.");
      }
      const stored: Session = {
        email: email.trim(),
        accessToken: auth.accessToken,
        demo: false,
        lastLoginAt: new Date().toISOString(),
      };
      await saveSession(stored);
      setSession(stored);
      applySnapshot(res.snapshot as OwnerSnapshot, res.generatedAt);
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
    setRefreshing(true);
    try {
      if (session.demo) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        applySnapshot(DEMO_SNAPSHOT, new Date().toISOString());
      } else {
        if (!session.accessToken) throw new OwnerError("UNAUTHORIZED", "Session expirée.");
        const res = await fetchOwnerSnapshot(session.accessToken, fetch);
        if (!isSnapshotShape(res.snapshot)) {
          throw new OwnerError("SERVER_ERROR", "Liasse de supervision invalide.");
        }
        applySnapshot(res.snapshot as OwnerSnapshot, res.generatedAt);
      }
      setOffline(false);
      setToast({ tone: "success", text: "Données actualisées." });
    } catch (err) {
      setOffline(true);
      setToast({ tone: "error", text: errorText(err) });
    } finally {
      setRefreshing(false);
    }
  }

  async function handleLogout(): Promise<void> {
    await clearSession();
    clearSnapshot();
    setAccountOpen(false);
    setDetail(null);
    setSession(null);
    setSnapshot(null);
    setGeneratedAt(null);
    setOffline(false);
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

  if (!session) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <LoginScreen
          busy={loginBusy}
          error={loginError}
          demo={DEMO_MODE}
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
          demo={session.demo}
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

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.contentBg }}>
      <StatusBar barStyle="light-content" />

      {detail === null ? (
        <AppHeader
          shopName={snapshot.shopName}
          screenLabel={TAB_LABEL[tab]}
          generatedAt={generatedAt}
          offline={offline || refreshing}
          demo={session.demo}
          onAccount={() => setAccountOpen(true)}
        />
      ) : null}

      <View style={{ flex: 1 }}>
        {detail?.kind === "product" && product ? (
          <ProductDetailScreen product={product} onBack={() => setDetail(null)} />
        ) : detail?.kind === "debtor" && debtor ? (
          <DebtorDetailScreen debtor={debtor} onBack={() => setDetail(null)} />
        ) : detail?.kind === "cashAudit" ? (
          <CashAuditScreen snapshot={snapshot} onBack={() => setDetail(null)} />
        ) : tab === "today" ? (
          <TodayScreen
            snapshot={snapshot}
            refreshing={refreshing}
            offline={offline}
            onRefresh={() => void handleRefresh()}
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
                {props.session.demo
                  ? "Session de démonstration — lecture seule"
                  : "Session propriétaire — lecture seule"}
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
