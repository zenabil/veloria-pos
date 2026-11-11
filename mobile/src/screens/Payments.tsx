// Veloria Client — Écran 04 : paiements V5 « panneau + résumé par méthode ».
// Bandeau d'encre (titre + compteur), puces de mois, puis UN panneau blanc :
// en-tête tonal (total du mois + répartition espèces/chèque/virement) et une
// ligne tactile par paiement (reçu en bottom-sheet). Plus de seconde ligne
// « voir le reçu » par paiement : la ligne entière ouvre le reçu.
// Logique inchangée : mois AAAA-MM + total + facture/avance + reçu.
import { useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import { Icon } from "../ui/Icon.tsx";
import { COLORS, FONTS, HAIRLINE, RADIUS, SPACE, SIZES } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { formatDateFr, formatMinor, monthLabel } from "../format.ts";
import {
  paymentMethodLabel as methodLabel,
  paymentsByMethod,
  paymentsOfMonth,
  type HomePayment,
} from "../views.ts";
import { Amount, Badge, Chip, Divider, IconBubble, Tap, farEdge, flow } from "../ui/kit.tsx";
import { EmptyState } from "../ui/states.tsx";
import { ReceiptSheet, Ticket } from "./ReceiptSheet.tsx";
import type { IconName } from "../ui/kit.tsx";

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
  /** Rendu sous un contrôle segmenté : l'en-tête d'encre est masqué. */
  embedded?: boolean;
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
  const selected = month && months.includes(month) ? month : (months[0] ?? null);
  const rows = selected ? paymentsOfMonth(props.rows, selected) : props.rows;
  const receipt = props.rows.find((p) => p.id === receiptId) ?? null;
  const amount = (v: number): string => (props.hidden ? "•••" : formatMinor(v, l));
  const total = rows.reduce((a, p) => a + p.amount_minor, 0);
  const byMethod = paymentsByMethod(rows);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.contentBg }}>
      {props.embedded ? null : (
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
              {t(l, "payments")}
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
              <Icon name="wallet-outline" size={12} color={COLORS.navyMuted} />
              <Text
                style={{
                  color: COLORS.navyMuted,
                  fontWeight: "800",
                  fontSize: 12,
                  fontFamily: FONTS.mono,
                }}
              >
                {rows.length}
              </Text>
            </View>
          </View>
        </View>
      )}
      <ScrollView
        ref={monthsRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={alignFirst}
        contentContainerStyle={{
          flexDirection: flow(dir),
          gap: SPACE.sm,
          paddingHorizontal: SPACE.lg,
          paddingVertical: SPACE.md,
        }}
        style={{ flexGrow: 0, marginTop: 2 }}
      >
        {months.map((m) => (
          <Chip
            key={m}
            label={monthLabel(m, l)}
            active={selected === m}
            onPress={() => setMonth(m)}
          />
        ))}
      </ScrollView>
      {rows.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", paddingVertical: SPACE.xxl }}>
          <EmptyState icon="wallet-outline" title={t(l, "noPayments")} hint={t(l, "emptyHint")} />
        </View>
      ) : (
        <View
          style={{
            flex: 1,
            marginHorizontal: SPACE.lg,
            borderRadius: RADIUS.card,
            overflow: "hidden",
            backgroundColor: COLORS.cardBg,
            ...HAIRLINE,
          }}
        >
          <FlatList
            data={rows}
            keyExtractor={(p) => String(p.id)}
            initialNumToRender={20}
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
            ListHeaderComponent={
              <View>
                <View style={{ backgroundColor: COLORS.toneBg, padding: SPACE.md }}>
                  <View
                    style={{
                      flexDirection: flow(dir),
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: SPACE.sm,
                    }}
                  >
                    <Text style={{ color: COLORS.cardMuted, fontSize: 12, fontWeight: "700" }}>
                      {t(l, "monthlySummary")}
                    </Text>
                    <Badge
                      label={`${rows.length} · ${
                        selected ? monthLabel(selected, l) : t(l, "payments")
                      }`}
                      color={COLORS.debtOk}
                    />
                  </View>
                  <View
                    style={{
                      flexDirection: flow(dir),
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                      gap: SPACE.sm,
                      marginTop: SPACE.xs,
                    }}
                  >
                    <Text style={{ color: COLORS.cardMuted, fontSize: 12, fontWeight: "700" }}>
                      {t(l, "total")}
                    </Text>
                    <Amount
                      text={amount(total)}
                      tone={COLORS.debtOk}
                      size={SIZES.amountLg}
                      align={farEdge(rtl)}
                    />
                  </View>
                  {byMethod.length > 0 ? (
                    <View style={{ flexDirection: flow(dir), marginTop: SPACE.md }}>
                      {byMethod.map((m, i) => (
                        <View
                          key={m.method}
                          style={{
                            flex: 1,
                            gap: 2,
                            paddingHorizontal: i > 0 ? SPACE.md : 0,
                            ...(i > 0
                              ? rtl
                                ? { borderRightWidth: 1, borderRightColor: COLORS.divider }
                                : { borderLeftWidth: 1, borderLeftColor: COLORS.divider }
                              : null),
                          }}
                        >
                          <View style={{ flexDirection: flow(dir), alignItems: "center", gap: 4 }}>
                            <Icon name={methodIcon(m.method)} size={13} color={COLORS.cardMuted} />
                            <Text
                              style={{ color: COLORS.cardMuted, fontSize: 10, fontWeight: "700" }}
                              numberOfLines={1}
                            >
                              {methodLabel(l, m.method)}
                            </Text>
                          </View>
                          <Amount text={amount(m.totalMinor)} size={12} />
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
                <Divider />
              </View>
            }
            renderItem={({ item: p }) => (
              <Tap
                onPress={() => setReceiptId(p.id)}
                accessibilityLabel={`${t(l, "viewReceipt")} ${formatDateFr(p.payment_date)} ${amount(
                  p.amount_minor,
                )}`}
                style={{
                  minHeight: 68,
                  flexDirection: flow(dir),
                  alignItems: "center",
                  gap: SPACE.md,
                  paddingHorizontal: SPACE.md,
                  paddingVertical: SPACE.sm,
                  backgroundColor: COLORS.cardBg,
                }}
              >
                <IconBubble icon={methodIcon(p.method)} color={COLORS.debtOk} size={34} />
                <View style={{ flex: 1, gap: 2 }}>
                  {/* Méthode sur la ligne de la date : le type garde toute la
                      largeur (sinon « Paiement facture » était tronqué). */}
                  <View style={{ flexDirection: flow(dir), alignItems: "center", gap: SPACE.sm }}>
                    <Text style={{ color: COLORS.cardText, fontWeight: "800", fontSize: 14 }}>
                      {formatDateFr(p.payment_date)}
                    </Text>
                    <Badge label={methodLabel(l, p.method)} color={COLORS.headerBg} dot={false} />
                  </View>
                  <Text style={{ color: COLORS.cardMuted, fontSize: 11 }} numberOfLines={1}>
                    {p.sale_id != null ? t(l, "invoicePayment") : t(l, "accountAdvance")}
                  </Text>
                  {p.reference ? (
                    <Text
                      style={{ fontFamily: FONTS.mono, color: COLORS.cardMuted, fontSize: 10 }}
                      numberOfLines={1}
                    >
                      {p.reference}
                    </Text>
                  ) : null}
                </View>
                <Amount
                  text={`+${amount(p.amount_minor)}`}
                  tone={COLORS.debtOk}
                  size={15}
                  align={farEdge(rtl)}
                />
                <Icon name="receipt-outline" size={16} color={COLORS.headerBg} />
              </Tap>
            )}
          />
        </View>
      )}
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
