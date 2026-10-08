// Veloria Client — Écran 04 : paiements V3 (mois pills sur dégradé, résumé
// surélevé, timeline avec tuiles icônes + reçu bottom-sheet).
// Logique inchangée : filtre mois AAAA-MM + total + facture/avance.
import { useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, GRADIENTS, RADIUS, SPACE, SIZES, tint } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { formatDateFr, formatMinor, monthLabel } from "../format.ts";
import { paymentsOfMonth, type HomePayment } from "../views.ts";
import { Amount, Badge, Card, IconBubble, Tap, farEdge, flow, type IconName } from "../ui/kit.tsx";
import { EmptyState } from "../ui/states.tsx";
import { ReceiptSheet, Ticket } from "./ReceiptSheet.tsx";

function methodLabel(l: Lang, method: string): string {
  if (method === "cash") return t(l, "cash");
  if (method === "cheque") return t(l, "cheque");
  if (method === "transfer") return t(l, "transfer");
  return method;
}

function methodIcon(method: string): IconName {
  if (method === "cash") return "cash-outline";
  if (method === "cheque") return "document-text-outline";
  if (method === "transfer") return "swap-horizontal-outline";
  return "wallet-outline";
}

export function PaymentsScreen(props: {
  lang: Lang;
  rows: HomePayment[];
  customerName: string;
  shopName: string;
  hidden: boolean;
  onRefresh: () => Promise<void>;
}): React.JSX.Element {
  const l = props.lang;
  const dir = direction(l);
  const rtl = dir === "rtl";
  const [spinning, setSpinning] = useState(false);
  const months = [...new Set(props.rows.map((p) => p.payment_date.slice(0, 7)))].sort().reverse();
  const [month, setMonth] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<number | null>(null);
  // RTL : la bande en `row-reverse` repose sur le MOIS le plus ancien (le plus
  // à gauche) et le premier mois sort de l'écran à droite → on recale sur le
  // mois le plus récent (premier élément). FR (LTR) : inchangé.
  const monthsRef = useRef<ScrollView>(null);
  const alignFirst = (): void => {
    if (rtl) monthsRef.current?.scrollToEnd({ animated: false });
  };
  useEffect(() => {
    if (!rtl) return;
    const id = setTimeout(() => monthsRef.current?.scrollToEnd({ animated: false }), 0);
    return () => clearTimeout(id);
  }, [rtl]);
  // Mois actif = choix conservé s'il existe encore, sinon le plus récent.
  // (Corrige le défaut "Tout" après login : months[] n'existait pas au 1er rendu.)
  const selected = month && months.includes(month) ? month : (months[0] ?? null);
  const rows = selected ? paymentsOfMonth(props.rows, selected) : props.rows;
  const receipt = props.rows.find((p) => p.id === receiptId) ?? null;
  const amount = (v: number): string => (props.hidden ? "•••" : formatMinor(v, l));
  const total = rows.reduce((a, p) => a + p.amount_minor, 0);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.contentBg }}>
      <LinearGradient
        colors={GRADIENTS.heroDeep}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: SPACE.md, paddingTop: SPACE.sm, paddingBottom: SPACE.sm }}
      >
        <Text style={{ color: COLORS.white, fontWeight: "900", fontSize: 20 }}>
          {t(l, "payments")}
        </Text>
        <ScrollView
          ref={monthsRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={alignFirst}
          contentContainerStyle={{
            flexDirection: flow(dir),
            gap: SPACE.sm,
            paddingVertical: SPACE.sm,
          }}
        >
          {months.map((m) => {
            const active = selected === m;
            return (
              <Tap
                key={m}
                onPress={() => setMonth(m)}
                accessibilityLabel={monthLabel(m, l)}
                style={{
                  backgroundColor: active ? COLORS.primary : tint(COLORS.white, "14"),
                  borderRadius: RADIUS.pill,
                  paddingHorizontal: SPACE.lg,
                  minHeight: SIZES.filterChipHeight,
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: active ? COLORS.primary : "transparent",
                }}
              >
                <Text
                  style={{
                    color: active ? COLORS.primaryText : COLORS.headerText,
                    fontWeight: "800",
                    fontSize: 12,
                  }}
                >
                  {monthLabel(m, l)}
                </Text>
              </Tap>
            );
          })}
        </ScrollView>
      </LinearGradient>

      <FlatList
        data={rows}
        keyExtractor={(p) => String(p.id)}
        initialNumToRender={20}
        contentContainerStyle={{ padding: SPACE.md, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={spinning}
            onRefresh={() => {
              setSpinning(true);
              void props.onRefresh().finally(() => setSpinning(false));
            }}
          />
        }
        ListHeaderComponent={
          <Card raised style={{ marginBottom: SPACE.md }}>
            <View
              style={{
                flexDirection: flow(dir),
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: COLORS.cardMuted, fontSize: 12 }}>
                {t(l, "monthlySummary")}
              </Text>
              <IconBubble icon="trending-up" color={COLORS.debtOk} size={30} />
            </View>
            <Amount
              text={amount(total)}
              tone={COLORS.debtOk}
              size={SIZES.heroAmount}
              style={{ marginTop: 4 }}
            />
            <View style={{ flexDirection: flow(dir), marginTop: SPACE.sm }}>
              <Badge
                label={`${rows.length} · ${selected ? monthLabel(selected, l) : t(l, "payments")}`}
                color={COLORS.debtOk}
                icon="checkmark-circle"
              />
            </View>
          </Card>
        }
        ListEmptyComponent={
          <EmptyState icon="wallet-outline" title={t(l, "noPayments")} hint={t(l, "emptyHint")} />
        }
        renderItem={({ item: p }) => (
          <View style={{ flexDirection: flow(dir), marginBottom: SPACE.sm }}>
            {/* Timeline */}
            <View style={{ alignItems: "center", marginHorizontal: 4 }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: COLORS.debtOk,
                  marginTop: 16,
                }}
              />
              <View style={{ width: 2, flex: 1, backgroundColor: COLORS.border }} />
            </View>
            <Card style={{ flex: 1, padding: SPACE.md, gap: SPACE.sm }}>
              <View
                style={{
                  flexDirection: flow(dir),
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View style={{ flexDirection: flow(dir), alignItems: "center", gap: 8 }}>
                  <IconBubble icon={methodIcon(p.method)} color={COLORS.debtOk} size={34} />
                  <View>
                    <Text style={{ color: COLORS.cardText, fontWeight: "700", fontSize: 13 }}>
                      {formatDateFr(p.payment_date)}
                    </Text>
                    <Text style={{ color: COLORS.cardMuted, fontSize: 11 }}>
                      {p.sale_id != null ? t(l, "invoicePayment") : t(l, "accountAdvance")}
                    </Text>
                  </View>
                </View>
                <Amount
                  text={`+${amount(p.amount_minor)}`}
                  tone={COLORS.debtOk}
                  size={20}
                  align={farEdge(rtl)}
                />
              </View>

              <View
                style={{
                  flexDirection: flow(dir),
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: SPACE.sm,
                  backgroundColor: COLORS.contentBg,
                  borderRadius: RADIUS.inner,
                  paddingHorizontal: SPACE.sm,
                  paddingVertical: 6,
                }}
              >
                <Text
                  style={{
                    color: COLORS.cardMuted,
                    fontSize: 11,
                    fontFamily: "monospace",
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {p.reference ?? "—"}
                </Text>
                <Badge label={methodLabel(l, p.method)} color={COLORS.headerBg} />
              </View>

              <Tap
                onPress={() => setReceiptId(p.id)}
                accessibilityLabel={t(l, "viewReceipt")}
                style={{
                  flexDirection: flow(dir),
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  backgroundColor: COLORS.contentBg,
                  borderRadius: RADIUS.pill,
                  paddingVertical: 10,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Ionicons name="receipt-outline" size={15} color={COLORS.cardText} />
                <Text style={{ color: COLORS.cardText, fontWeight: "800", fontSize: 12 }}>
                  {t(l, "viewReceipt")}
                </Text>
              </Tap>
            </Card>
          </View>
        )}
      />

      {/* Bottom-sheet reçu paiement */}
      {receipt ? (
        <ReceiptSheet
          lang={l}
          title={t(l, "viewReceipt")}
          onClose={() => setReceiptId(null)}
          shareText={`${t(l, "receipt")} ${t(l, "payments")} : ${amount(receipt.amount_minor)} — ${formatDateFr(receipt.payment_date)} (${props.shopName})`}
        >
          <Ticket
            lang={l}
            shopName={props.shopName}
            headLines={[
              { label: t(l, "clientLabel"), value: props.customerName },
              { label: t(l, "amountLabel"), value: amount(receipt.amount_minor) },
              { label: t(l, "methodLabel"), value: methodLabel(l, receipt.method) },
              { label: t(l, "dateLabel"), value: formatDateFr(receipt.payment_date) },
              {
                label: t(l, "typeLabel"),
                value: receipt.sale_id != null ? t(l, "invoicePayment") : t(l, "accountAdvance"),
              },
              ...(receipt.reference ? [{ label: t(l, "refLabel"), value: receipt.reference }] : []),
            ]}
            qrText={receipt.reference ?? `PAY-${receipt.id}`}
          />
        </ReceiptSheet>
      ) : null}
    </View>
  );
}
