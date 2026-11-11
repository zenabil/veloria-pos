// Veloria Client — Navigation V4 : barre plaquée en bas (filet supérieur,
// état actif = tiret or) + barre de page plate.
// Le dock flottant V3 mangeait la dernière ligne des listes : la barre est
// désormais ancrée, et les écrans réservent `SIZES.dockInset`.
import { Text, View } from "react-native";
import { Icon } from "./Icon.tsx";
import { COLORS, RADIUS, SHADOW, SPACE, SIZES, TYPE } from "../tokens.ts";
import { flow, Tap, type IconName } from "./kit.tsx";
import type { Lang } from "../i18n.ts";

export type TabId = "home" | "invoices" | "payments" | "shop" | "cart" | "account";

const TAB_ICON: Record<TabId, IconName> = {
  home: "home",
  invoices: "receipt",
  payments: "wallet",
  // ADR-182 : catalogue du magasin (boutique).
  shop: "storefront-outline",
  // ADR-182 tranche B : panier (nombre d'articles en pastille).
  cart: "cart-outline",
  account: "person",
};

/** Barre d'onglets pleine largeur : une surface, un filet, un seul accent. */
export function TabBar(props: {
  lang: Lang;
  active: TabId;
  tabs: { id: TabId; label: string }[];
  /** Pastille : nombre d'articles dans le panier (0 = pas de pastille). */
  badge?: Partial<Record<TabId, number>>;
  onChange: (id: TabId) => void;
}): React.JSX.Element {
  const dir = props.lang === "ar" ? "rtl" : "ltr";
  return (
    // testID → data-testid sur RN web : c'est l'ancre du script de captures
    // (onglets, libellés partagés avec l'accueil).
    <View
      testID="tab-bar"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: flow(dir),
        backgroundColor: COLORS.cardBg,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        paddingHorizontal: SPACE.sm,
        paddingBottom: SPACE.xs,
        paddingTop: SPACE.sm,
        ...SHADOW.nav,
      }}
    >
      {props.tabs.map((x) => {
        const active = props.active === x.id;
        return (
          <Tap
            key={x.id}
            onPress={() => props.onChange(x.id)}
            accessibilityLabel={x.label}
            scaleTo={0.97}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              paddingVertical: SPACE.xs,
              minHeight: SIZES.tabBar,
            }}
          >
            {/* Le témoin d'onglet actif est un tiret or, pas un halo. */}
            <View
              style={{
                width: 22,
                height: 3,
                borderRadius: RADIUS.pill,
                backgroundColor: active ? COLORS.primary : "transparent",
                marginBottom: 2,
              }}
            />
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon
                name={TAB_ICON[x.id]}
                size={19}
                color={active ? COLORS.headerBg : COLORS.cardMuted}
              />
              {/* Pastille du panier : le nombre d'articles (jamais le prix). */}
              {props.badge?.[x.id] ? (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -9,
                    minWidth: 15,
                    height: 15,
                    paddingHorizontal: 3,
                    borderRadius: RADIUS.pill,
                    backgroundColor: COLORS.primary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: COLORS.primaryText, fontSize: 9, fontWeight: "800" }}>
                    {String(props.badge[x.id])}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              style={{
                ...TYPE.micro,
                color: active ? COLORS.headerBg : COLORS.cardMuted,
                letterSpacing: 0.2,
              }}
              numberOfLines={1}
            >
              {x.label}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

/** Barre de page (détail / sous-page) : retour + titre + actions, encre plate.
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
    <View
      style={{
        flexDirection: flow(props.dir),
        alignItems: "center",
        gap: SPACE.sm,
        paddingHorizontal: SPACE.md,
        paddingVertical: SPACE.sm,
        backgroundColor: COLORS.headerBg,
      }}
    >
      {props.onBack ? (
        <Tap
          onPress={props.onBack}
          accessibilityLabel={props.backLabel}
          scaleTo={0.92}
          style={{
            width: SIZES.touchMin,
            height: SIZES.touchMin,
            borderRadius: RADIUS.pill,
            backgroundColor: COLORS.navySoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={backIcon} size={19} color={COLORS.white} />
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
            lineHeight: 22,
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
              lineHeight: 15,
              textAlign: props.dir === "rtl" ? "right" : "left",
            }}
            numberOfLines={1}
          >
            {props.subtitle}
          </Text>
        ) : null}
      </View>
      {props.right}
    </View>
  );
}
