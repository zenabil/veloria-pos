// Veloria Client — Écran « السلة » (ADR-182, tranche B).
//
// Le panier est un ÉTAT LOCAL : il survit à la fermeture (commande
// hebdomadaire) et ne touche jamais le miroir. Les prix viennent du
// catalogue publié (projection du POS) : le total affiché est un ESTIMÉ et
// l'écran le dit — le prix fait foi est celui de la vente au comptoir.
//
// L'envoi se fait par **WhatsApp** (ADR-182 §10) : aucun écrit cloud, aucun
// risque de « commande » fantôme dans la base du commerçant.
import { FlatList, ScrollView, Text, View } from "react-native";
import { Icon } from "../ui/Icon.tsx";
import { COLORS, FONTS, HAIRLINE, RADIUS, SPACE, SIZES } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { formatMinor } from "../format.ts";
import { cartCount, cartTotalMinor, multiplyMinorByQuantity, type CartLine } from "../cart.ts";
import type { SentOrder } from "../order.ts";
import { Amount, Button, Divider, Field, Tap, farEdge, flow } from "../ui/kit.tsx";
import { EmptyState } from "../ui/states.tsx";

export function CartScreen(props: {
  lang: Lang;
  lines: CartLine[];
  note: string;
  /** Masquage des montants (réglage « cachée » de l'application). */
  hidden: boolean;
  busy: boolean;
  onChangeQty: (productId: number, priceMinor: number, quantity: number) => void;
  onRemove: (productId: number) => void;
  onNoteChange: (note: string) => void;
  onSend: () => void;
  onBrowse: () => void;
  /** Commandes déjà envoyées par cet appareil (historique local). */
  sentOrders: SentOrder[];
  onResend: (order: SentOrder) => void;
}): React.JSX.Element {
  const l = props.lang;
  const dir = direction(l);
  const rtl = dir === "rtl";
  const total = cartTotalMinor(props.lines);
  const count = cartCount(props.lines);
  const amount = (minor: number): string => (props.hidden ? "•••" : formatMinor(minor, l));
  const hasUnavailable = props.lines.some((line) => !line.available);

  const keyOf = (line: CartLine): string => `${line.productId}:${line.priceMinor}`;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.contentBg }}>
      {/* En-tête d'encre : titre + compteur d'articles. */}
      <View
        style={{
          backgroundColor: COLORS.headerBg,
          paddingHorizontal: SPACE.lg,
          paddingTop: SPACE.sm,
          paddingBottom: SPACE.md,
        }}
      >
        <View
          style={{
            flexDirection: flow(dir),
            alignItems: "center",
            justifyContent: "space-between",
            gap: SPACE.sm,
          }}
        >
          <Text
            style={{ color: COLORS.white, fontWeight: "800", fontSize: 20, letterSpacing: 0.3 }}
          >
            {t(l, "cart")}
          </Text>
          <View
            style={{
              flexDirection: flow(dir),
              alignItems: "center",
              gap: 4,
              backgroundColor: COLORS.navySoft,
              borderRadius: RADIUS.pill,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Icon name="cart-outline" size={12} color={COLORS.navyMuted} />
            <Text
              style={{
                color: COLORS.navyMuted,
                fontWeight: "800",
                fontSize: 12,
                fontFamily: FONTS.mono,
              }}
            >
              {count}
            </Text>
          </View>
        </View>
      </View>

      {props.lines.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", paddingVertical: SPACE.xxl }}>
          <EmptyState icon="cart-outline" title={t(l, "cartEmpty")} hint={t(l, "cartEmptyHint")} />
          <View style={{ paddingHorizontal: SPACE.lg }}>
            <Button label={t(l, "shop")} variant="outline" onPress={props.onBrowse} full />
          </View>
        </View>
      ) : (
        <>
          <View
            style={{
              marginHorizontal: SPACE.lg,
              marginTop: SPACE.md,
              borderRadius: RADIUS.card,
              overflow: "hidden",
              backgroundColor: COLORS.cardBg,
              ...HAIRLINE,
            }}
          >
            <FlatList
              data={props.lines}
              keyExtractor={(line) => keyOf(line)}
              ItemSeparatorComponent={() => <Divider inset={SPACE.lg} />}
              contentContainerStyle={{ paddingBottom: SPACE.sm }}
              renderItem={({ item: line }) => {
                const lineTotal = multiplyMinorByQuantity(line.priceMinor, line.quantity);
                return (
                  <View
                    style={{
                      flexDirection: flow(dir),
                      alignItems: "center",
                      gap: SPACE.md,
                      paddingHorizontal: SPACE.md,
                      paddingVertical: SPACE.sm,
                      opacity: line.available ? 1 : 0.6,
                    }}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text
                        style={{ color: COLORS.cardText, fontWeight: "700", fontSize: 14 }}
                        numberOfLines={2}
                      >
                        {line.name}
                      </Text>
                      <Text style={{ color: COLORS.cardMuted, fontSize: 11 }}>
                        {amount(line.priceMinor)}
                        {line.available ? "" : ` · ${t(l, "outOfStock")}`}
                      </Text>
                      {/* Quantité : − / champ / + (48 dp de cible tactile). */}
                      <View
                        style={{
                          flexDirection: flow(dir),
                          alignItems: "center",
                          gap: SPACE.sm,
                          marginTop: 2,
                        }}
                      >
                        <Tap
                          onPress={() =>
                            props.onChangeQty(
                              line.productId,
                              line.priceMinor,
                              Math.max(0, line.quantity - 1),
                            )
                          }
                          accessibilityLabel={t(l, "removeLine")}
                          hitSlop={12}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: RADIUS.pill,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: COLORS.toneBg,
                          }}
                        >
                          <Icon name="remove" size={16} color={COLORS.cardText} />
                        </Tap>
                        <Text
                          style={{
                            fontFamily: FONTS.mono,
                            color: COLORS.cardText,
                            fontWeight: "800",
                            fontSize: 14,
                            minWidth: 34,
                            textAlign: "center",
                          }}
                        >
                          {line.quantity}
                        </Text>
                        <Tap
                          onPress={() =>
                            props.onChangeQty(line.productId, line.priceMinor, line.quantity + 1)
                          }
                          accessibilityLabel={t(l, "addToCart")}
                          hitSlop={12}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: RADIUS.pill,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: COLORS.toneBg,
                          }}
                        >
                          <Icon name="add" size={16} color={COLORS.cardText} />
                        </Tap>
                        <Tap
                          onPress={() => props.onRemove(line.productId)}
                          accessibilityLabel={t(l, "removeLine")}
                          hitSlop={12}
                          style={{ paddingHorizontal: 6, paddingVertical: 6 }}
                        >
                          <Icon name="trash-outline" size={15} color={COLORS.cardMuted} />
                        </Tap>
                      </View>
                    </View>
                    <View
                      style={{ alignItems: farEdge(rtl) === "left" ? "flex-start" : "flex-end" }}
                    >
                      <Amount
                        text={amount(lineTotal)}
                        size={15}
                        tone={COLORS.cardText}
                        align={farEdge(rtl)}
                      />
                    </View>
                  </View>
                );
              }}
            />
          </View>

          {/* Total estimé + préférence de retrait + envoi. */}
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{
              paddingHorizontal: SPACE.lg,
              paddingBottom: SIZES.dockInset,
              paddingTop: SPACE.md,
              gap: SPACE.sm,
            }}
          >
            <View
              style={{
                flexDirection: flow(dir),
                alignItems: "center",
                justifyContent: "space-between",
                gap: SPACE.sm,
                paddingHorizontal: SPACE.md,
                paddingVertical: SPACE.sm,
                borderRadius: RADIUS.card,
                backgroundColor: COLORS.cardBg,
                ...HAIRLINE,
              }}
            >
              <Text style={{ color: COLORS.cardText, fontWeight: "700", fontSize: 13 }}>
                {t(l, "estimatedTotal")}
              </Text>
              <Amount text={amount(total)} size={17} tone={COLORS.headerBg} align={farEdge(rtl)} />
            </View>

            {hasUnavailable ? (
              <Text style={{ color: COLORS.debtDue, fontSize: 12, fontWeight: "700" }}>
                ⚠️ {t(l, "cartUnavailableWarning")}
              </Text>
            ) : null}

            <Field
              value={props.note}
              onChangeText={props.onNoteChange}
              placeholder={t(l, "pickupPreference")}
              ariaLabel={t(l, "pickupPreference")}
              lang={l}
              icon="time-outline"
              mono={false}
            />
            <Text style={{ color: COLORS.cardMuted, fontSize: 11 }}>
              {t(l, "pickupPreferenceHint")}
            </Text>

            <Button
              label={t(l, "sendOrderWhatsapp")}
              icon="logo-whatsapp"
              size="lg"
              full
              busy={props.busy}
              onPress={props.onSend}
              style={{ marginTop: SPACE.sm }}
            />
            <Text style={{ color: COLORS.cardMuted, fontSize: 11, textAlign: "center" }}>
              {t(l, "sendOrderHint")}
            </Text>

            {/* Historique local : la commande peut être renvoyée (la commande
                hebdomadaire revient souvent : « comme la semaine dernière »). */}
            <View style={{ marginTop: SPACE.md, gap: SPACE.xs }}>
              <Text
                style={{
                  color: COLORS.cardMuted,
                  fontSize: 11,
                  fontWeight: "800",
                  letterSpacing: 0.4,
                }}
              >
                {t(l, "sentOrders").toUpperCase()}
              </Text>
              {props.sentOrders.length === 0 ? (
                <Text style={{ color: COLORS.cardMuted, fontSize: 12 }}>
                  {t(l, "noSentOrders")}
                </Text>
              ) : (
                props.sentOrders.slice(0, 5).map((order) => (
                  <View
                    key={order.reference}
                    style={{
                      flexDirection: flow(dir),
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: SPACE.sm,
                      paddingHorizontal: SPACE.md,
                      paddingVertical: SPACE.sm,
                      borderRadius: RADIUS.card,
                      backgroundColor: COLORS.cardBg,
                      ...HAIRLINE,
                    }}
                  >
                    <View style={{ gap: 2 }}>
                      <Text
                        style={{
                          fontFamily: FONTS.mono,
                          color: COLORS.cardText,
                          fontWeight: "800",
                          fontSize: 12,
                        }}
                      >
                        {order.reference}
                      </Text>
                      <Text style={{ color: COLORS.cardMuted, fontSize: 11 }}>
                        {order.count} {t(l, "cartItems")} · {amount(order.totalMinor)}
                      </Text>
                    </View>
                    <Button
                      label={t(l, "resendOrder")}
                      variant="outline"
                      onPress={() => props.onResend(order)}
                    />
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </>
      )}
    </View>
  );
}
