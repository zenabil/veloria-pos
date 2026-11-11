// Veloria Client — Écran « طلباتي » (ADR-182, tranche D).
//
// Les commandes du client remontent dans le cliché `customer_snapshot`
// (champ `orders`) : l'application sait donc où en est sa réservation —
// préparée, prête, servie ou refusée — et peut afficher la RÉFÉRENCE à
// montrer au comptoir.
//
// La référence officielle (`CMD-…`) est celle du POS (seul master) : c'est
// elle qui fait foi, pas l'identifiant local de l'appareil.
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useState } from "react";
import { Icon } from "../ui/Icon.tsx";
import { COLORS, FONTS, HAIRLINE, RADIUS, SPACE, SIZES } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { formatDateFr, formatMinor } from "../format.ts";
import { orderStatusLabel, type ClientOrder } from "../views.ts";
import { Amount, Badge, Divider, farEdge, flow } from "../ui/kit.tsx";
import { EmptyState } from "../ui/states.tsx";

/** Teinte de l'état (point + texte teinté, ADR-150). */
function statusTone(status: string): string {
  switch (status) {
    case "ready":
      return COLORS.debtOk;
    case "served":
      return COLORS.cardMuted;
    case "cancelled":
      return COLORS.debtOverdue;
    default:
      return COLORS.debtDue;
  }
}

export function OrdersScreen(props: {
  lang: Lang;
  orders: ClientOrder[];
  hidden: boolean;
  onRefresh: () => Promise<void>;
}): React.JSX.Element {
  const l = props.lang;
  const dir = direction(l);
  const rtl = dir === "rtl";
  const [spinning, setSpinning] = useState(false);
  const amount = (v: number): string => (props.hidden ? "•••" : formatMinor(v, l));

  if (props.orders.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.contentBg }}>
        <View style={{ flex: 1, justifyContent: "center", paddingVertical: SPACE.xxl }}>
          <EmptyState icon="receipt-outline" title={t(l, "noOrders")} hint={t(l, "noOrdersHint")} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.contentBg }}>
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
          data={props.orders}
          keyExtractor={(o) => String(o.id)}
          ItemSeparatorComponent={() => <Divider inset={SPACE.lg} />}
          contentContainerStyle={{ paddingBottom: SIZES.dockInset }}
          refreshControl={
            <RefreshControl
              refreshing={spinning}
              onRefresh={() => {
                setSpinning(true);
                void props.onRefresh().finally(() => setSpinning(false));
              }}
            />
          }
          renderItem={({ item: o }) => {
            const tone = statusTone(o.status);
            return (
              <View
                style={{
                  flexDirection: flow(dir),
                  alignItems: "center",
                  gap: SPACE.md,
                  paddingHorizontal: SPACE.md,
                  paddingVertical: SPACE.sm,
                }}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  {/* La référence : c'est elle qui est demandée au comptoir. */}
                  <View
                    style={{
                      flexDirection: flow(dir),
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: SPACE.sm,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FONTS.mono,
                        color: COLORS.cardText,
                        fontWeight: "800",
                        fontSize: 13,
                        flexShrink: 1,
                      }}
                      numberOfLines={1}
                    >
                      {o.reference}
                    </Text>
                    <Badge label={orderStatusLabel(o.status, l)} color={tone} />
                  </View>
                  <Text style={{ color: COLORS.cardMuted, fontSize: 11 }}>
                    {o.createdAt !== "" ? formatDateFr(o.createdAt) : ""}
                    {o.note ? ` · ${o.note}` : ""}
                  </Text>
                  {o.cancelReason ? (
                    <Text style={{ color: COLORS.debtOverdue, fontSize: 11 }}>
                      {o.cancelReason}
                    </Text>
                  ) : null}
                  {/* Rappel : la référence à montrer au comptoir. */}
                  <View
                    style={{
                      flexDirection: flow(dir),
                      alignItems: "center",
                      gap: 4,
                      marginTop: 2,
                    }}
                  >
                    <Icon name="pricetag-outline" size={12} color={COLORS.cardMuted} />
                    <Text style={{ color: COLORS.cardMuted, fontSize: 10 }}>
                      {t(l, "orderShowAtCounter")}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: farEdge(rtl) === "left" ? "flex-start" : "flex-end" }}>
                  <Amount
                    text={amount(o.totalMinor)}
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
    </View>
  );
}
