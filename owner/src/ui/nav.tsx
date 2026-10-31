// Veloria Owner — barre de supervision (haut), onglets bas, barre de page.
// Cinq onglets, français uniquement, accent or sur l'onglet actif.
import { Platform, StatusBar, Text, View } from "react-native";
import { Icon, type IconName } from "./Icon.tsx";
import { COLORS, RADIUS, SIZES, SPACE, TYPE } from "../tokens.ts";
import { freshnessLabel } from "../format.ts";
import { Tap } from "./kit.tsx";

export type TabId = "today" | "money" | "stock" | "periods" | "alerts";

export const TABS: { id: TabId; label: string; icon: IconName; iconActive: IconName }[] = [
  { id: "today", label: "Aujourd'hui", icon: "grid-outline", iconActive: "grid" },
  { id: "money", label: "Argent", icon: "wallet-outline", iconActive: "wallet" },
  { id: "stock", label: "Stock", icon: "cube-outline", iconActive: "cube" },
  { id: "periods", label: "Périodes", icon: "calendar-outline", iconActive: "calendar" },
  { id: "alerts", label: "Alertes", icon: "warning-outline", iconActive: "warning" },
];

const TOP_INSET = (Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0) + SPACE.sm;

/** Bandeau persistant : magasin, écran courant, fraîcheur, compte. */
export function AppHeader(props: {
  shopName: string;
  screenLabel: string;
  generatedAt: string | null;
  offline: boolean;
  demo: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onAccount: () => void;
}): React.JSX.Element {
  const fresh = props.generatedAt ? freshnessLabel(props.generatedAt) : "Synchronisation inconnue";
  return (
    <View
      style={{
        backgroundColor: COLORS.headerBg,
        paddingTop: TOP_INSET,
        paddingHorizontal: SIZES.screenMargin,
        paddingBottom: SPACE.md,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACE.md,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: RADIUS.inner,
          backgroundColor: COLORS.navySoft,
          borderWidth: 1,
          borderColor: COLORS.navyLine,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 15 }}>V</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.headerText, ...TYPE.headlineSm }} numberOfLines={1}>
          {props.shopName}{" "}
          <Text style={{ color: COLORS.navyMuted, fontWeight: "600" }}>• {props.screenLabel}</Text>
        </Text>
        <View
          style={{
            marginTop: 3,
            flexDirection: "row",
            alignItems: "center",
            gap: SPACE.sm,
            flexWrap: "wrap",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              backgroundColor: COLORS.onNavyChip,
              borderRadius: RADIUS.inner,
              paddingHorizontal: SPACE.sm,
              paddingVertical: 2,
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: props.offline ? COLORS.statusWatch : COLORS.statusOk,
              }}
            />
            <Text style={{ color: COLORS.headerText, fontSize: 11, fontWeight: "500" }}>
              {props.offline
                ? `Hors ligne — données du ${fresh.replace("Mis à jour ", "")}`
                : fresh}
            </Text>
          </View>
          {props.demo ? (
            <View
              style={{
                backgroundColor: COLORS.onNavyChip,
                borderRadius: RADIUS.inner,
                paddingHorizontal: SPACE.sm,
                paddingVertical: 2,
              }}
            >
              <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: "700" }}>
                DÉMONSTRATION
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <Tap
        onPress={props.onRefresh}
        disabled={props.refreshing}
        accessibilityLabel="Actualiser les données"
        style={{
          width: 38,
          height: 38,
          borderRadius: RADIUS.pill,
          backgroundColor: COLORS.navySoft,
          borderWidth: 1,
          borderColor: COLORS.navyLine,
          alignItems: "center",
          justifyContent: "center",
          opacity: props.refreshing ? 0.5 : 1,
        }}
      >
        <Icon name="refresh" size={19} color={COLORS.primary} />
      </Tap>
      <Tap
        onPress={props.onAccount}
        accessibilityLabel="Compte"
        style={{
          width: 38,
          height: 38,
          borderRadius: RADIUS.pill,
          backgroundColor: COLORS.navySoft,
          borderWidth: 1,
          borderColor: COLORS.navyLine,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="person-outline" size={19} color={COLORS.headerText} />
      </Tap>
    </View>
  );
}

/** Barre de page (sous-écran) : retour + titre + badge à droite. */
export function PageBar(props: {
  title: string;
  onBack: () => void;
  badge?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACE.md,
        paddingHorizontal: SIZES.screenMargin,
        paddingVertical: SPACE.md,
      }}
    >
      <Tap
        onPress={props.onBack}
        accessibilityLabel="Retour"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: SPACE.sm,
          backgroundColor: COLORS.cardBg,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: RADIUS.control,
          paddingHorizontal: SPACE.md,
          minHeight: 44,
        }}
      >
        <Icon name="arrow-back" size={18} color={COLORS.cardText} />
        <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "700" }}>
          {props.title}
        </Text>
      </Tap>
      <View style={{ flex: 1 }} />
      {props.badge}
    </View>
  );
}

/** Séparateur d'onglet actif (tiret or) + état inactif neutre. */
export function TabBar(props: { active: TabId; onChange: (id: TabId) => void }): React.JSX.Element {
  return (
    <View
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: "row",
        backgroundColor: COLORS.cardBg,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        paddingHorizontal: SPACE.sm,
        paddingBottom: SPACE.xs,
        paddingTop: SPACE.sm,
      }}
    >
      {TABS.map((t) => {
        const active = props.active === t.id;
        return (
          <Tap
            key={t.id}
            onPress={() => props.onChange(t.id)}
            accessibilityLabel={t.label}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              paddingVertical: SPACE.xs,
              minHeight: SIZES.tabBar,
            }}
          >
            <View
              style={{
                width: 22,
                height: 3,
                borderRadius: RADIUS.pill,
                backgroundColor: active ? COLORS.primary : "transparent",
                marginBottom: 2,
              }}
            />
            <Icon
              name={active ? t.iconActive : t.icon}
              size={19}
              color={active ? COLORS.primary : COLORS.cardMuted}
            />
            <Text
              style={{
                ...TYPE.micro,
                color: active ? COLORS.primary : COLORS.cardMuted,
                letterSpacing: 0.2,
              }}
              numberOfLines={1}
            >
              {t.label}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}
