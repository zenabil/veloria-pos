// Veloria Client — Navigation V3 : barre flottante à 4 onglets (icônes +
// labels, état actif or) + barre de page (retour circulaire + actions).
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, GRADIENTS, RADIUS, SHADOW, SPACE, SIZES, tint } from "../tokens.ts";
import { flow, Tap, type IconName } from "./kit.tsx";
import { LinearGradient } from "expo-linear-gradient";
import type { Lang } from "../i18n.ts";

export type TabId = "home" | "invoices" | "payments" | "account";

const TAB_ICON: Record<TabId, IconName> = {
  home: "home",
  invoices: "receipt",
  payments: "wallet",
  account: "person",
};

/** Dock flottant navy : icône + label, actif en or, ombre profonde. */
export function TabBar(props: {
  lang: Lang;
  active: TabId;
  tabs: { id: TabId; label: string }[];
  onChange: (id: TabId) => void;
}): React.JSX.Element {
  const dir = props.lang === "ar" ? "rtl" : "ltr";
  return (
    // testID → data-testid sur RN web : c'est l'ancre du script E2E
    // scripts/e2e-mobile-shots.mjs (onglets, libellés partagés avec l'accueil).
    <View
      testID="tab-bar"
      style={{ position: "absolute", bottom: SPACE.lg, left: SPACE.lg, right: SPACE.lg }}
    >
      <LinearGradient
        colors={GRADIENTS.heroDeep}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: RADIUS.pill,
          paddingHorizontal: SPACE.xs,
          paddingVertical: SPACE.xs,
          flexDirection: flow(dir),
          ...SHADOW.nav,
          borderWidth: 1,
          borderColor: tint(COLORS.white, "1A"),
        }}
      >
        {props.tabs.map((x) => {
          const active = props.active === x.id;
          return (
            <Tap
              key={x.id}
              onPress={() => props.onChange(x.id)}
              accessibilityLabel={x.label}
              scaleTo={0.94}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                paddingVertical: 8,
                borderRadius: RADIUS.pill,
                backgroundColor: active ? tint(COLORS.primary, "1F") : "transparent",
                minHeight: SIZES.tabBar - 8,
              }}
            >
              <Ionicons
                name={TAB_ICON[x.id]}
                size={20}
                color={active ? COLORS.primary : COLORS.navyMuted}
              />
              <Text
                style={{
                  color: active ? COLORS.white : COLORS.navyMuted,
                  fontWeight: active ? "800" : "600",
                  fontSize: 11,
                }}
                numberOfLines={1}
              >
                {x.label}
              </Text>
            </Tap>
          );
        })}
      </LinearGradient>
    </View>
  );
}

/** Barre de page (détail / sous-page) : retour circulaire + titre + actions.
 * Convention chevrons RTL (ADR-051) : en arabe on lit de droite à gauche —
 * « retour » pointe donc vers la droite (`chevron-forward`), « aller vers le
 * détail » vers la gauche (`chevron-back` dans les listes). */
export function PageBar(props: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel: string;
  dir: "rtl" | "ltr";
  right?: React.ReactNode;
}): React.JSX.Element {
  const backIcon = props.dir === "rtl" ? "chevron-forward" : "chevron-back";
  return (
    <LinearGradient
      colors={GRADIENTS.heroDeep}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        flexDirection: flow(props.dir),
        alignItems: "center",
        gap: SPACE.sm,
        paddingHorizontal: SPACE.md,
        paddingVertical: SPACE.sm,
      }}
    >
      {props.onBack ? (
        <Tap
          onPress={props.onBack}
          accessibilityLabel={props.backLabel}
          scaleTo={0.9}
          style={{
            width: SIZES.touchMin,
            height: SIZES.touchMin,
            borderRadius: SIZES.touchMin / 2,
            backgroundColor: tint(COLORS.white, "14"),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={backIcon} size={20} color={COLORS.white} />
        </Tap>
      ) : (
        <View style={{ width: SPACE.sm }} />
      )}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: COLORS.white,
            fontWeight: "800",
            fontSize: 16,
            textAlign: props.dir === "rtl" ? "right" : "left",
          }}
          numberOfLines={1}
        >
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text
            style={{
              color: COLORS.navyMuted,
              fontSize: 11,
              textAlign: props.dir === "rtl" ? "right" : "left",
            }}
            numberOfLines={1}
          >
            {props.subtitle}
          </Text>
        ) : null}
      </View>
      {props.right}
    </LinearGradient>
  );
}
