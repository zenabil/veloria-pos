// Veloria Client — Écran 04 : paiements V4 « Daylight plat ».
// Bandeau d'encre plat + puces de mois sur le fond clair, total mensuel sur
// surface tonale, une ligne par paiement dans un groupe séparé par un filet.
// Logique inchangée : filtre mois AAAA-MM + total + facture/avance + reçu.
import { useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import { Icon } from "../ui/Icon.tsx";
import { COLORS, FONTS, SPACE, SIZES, TYPE } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { formatDateFr, formatMinor, monthLabel } from "../format.ts";
import { paymentsOfMonth, type HomePayment } from "../views.ts";
import {
  Amount,
  Badge,
  Card,
  Chip,
  Divider,
  Group,
  Row,
  Tap,
  flow,
  type IconName,
} from "../ui/kit.tsx";
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
      <View
        style={{
          backgroundColor: COLORS.headerBg,
          paddingHorizontal: SPACE.lg,
          paddingTop: SPACE.md,
          paddingBottom: SPACE.md,
        }}
      >
        <Text style={{ ...TYPE.title, color: COLORS.white, letterSpacing: 0.2 }}>
          {t(l, "payments")}
        </Text>
      </View>

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

      <FlatList
        data={rows}
        keyExtractor={(p) => String(p.id)}
        initialNumToRender={20}
        contentContainerStyle={{
          paddingHorizontal: SPACE.lg,
          paddingTop: SPACE.xs,
          paddingBottom: SIZES.dockInset,
        }}
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
          <Card tone={COLORS.toneBg} style={{ marginBottom: SPACE.md }}>
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
                  ...TYPE.label,
                  color: COLORS.cardMuted,
                  letterSpacing: 0.5,
                  textAlign: rtl ? "right" : "left",
                }}
              >
                {t(l, "monthlySummary")}
              </Text>
              <Badge
                label={`${rows.length} · ${selected ? monthLabel(selected, l) : t(l, "payments")}`}
                color={COLORS.debtOk}
              />
            </View>
            <Amount
              text={amount(total)}
              tone={COLORS.debtOk}
              size={SIZES.amountLg}
              align={rtl ? "right" : "left"}
              style={{ marginTop: SPACE.xs }}
            />
          </Card>
        }
        ListEmptyComponent={
          <View style={{ paddingVertical: SPACE.xxl }}>
            <EmptyState icon="wallet-outline" title={t(l, "noPayments")} hint={t(l, "emptyHint")} />
          </View>
        }
        renderItem={({ item: p }) => (
          <Group style={{ marginBottom: SPACE.sm }}>
            <Row
              dir={dir}
              icon={methodIcon(p.method)}
              iconTone={COLORS.debtOk}
              title={formatDateFr(p.payment_date)}
              caption={p.sale_id != null ? t(l, "invoicePayment") : t(l, "accountAdvance")}
              badge={<Badge label={methodLabel(l, p.method)} color={COLORS.headerBg} dot={false} />}
              value={`+${amount(p.amount_minor)}`}
              valueTone={COLORS.debtOk}
            />
            <Divider />
            <Tap
              onPress={() => setReceiptId(p.id)}
              accessibilityLabel={t(l, "viewReceipt")}
              style={{
                minHeight: SIZES.touchMin,
                paddingHorizontal: SPACE.lg,
                paddingVertical: SPACE.sm,
                flexDirection: flow(dir),
                alignItems: "center",
                gap: SPACE.sm,
                backgroundColor: COLORS.cardBg,
              }}
            >
              <Text
                style={{
                  ...TYPE.caption,
                  fontFamily: FONTS.mono,
                  color: COLORS.cardMuted,
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {p.reference ?? "—"}
              </Text>
              <View
                style={{
                  flexDirection: flow(dir),
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon name="receipt-outline" size={15} color={COLORS.headerBg} />
                <Text style={{ color: COLORS.headerBg, fontWeight: "800", fontSize: 12 }}>
                  {t(l, "viewReceipt")}
                </Text>
              </View>
            </Tap>
          </Group>
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
