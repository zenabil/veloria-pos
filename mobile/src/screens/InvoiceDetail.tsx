// Veloria Client — Écran 06 : page détail facture V3 (barre de page + ticket
// 80 mm avec LIGNES produits, totaux sur fond navy, statut, QR, partage).
// Données via `fetchInvoiceDetail` (App : `detail`, `loading`, `error`, `onRetry`).
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, GRADIENTS, RADIUS, SHADOW, SPACE, tint } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { errorReportText, formatDateFr, formatMinor } from "../format.ts";
import type { HomeInvoice, InvoiceDetail } from "../views.ts";
import { Amount, Badge, Button, Dashed, Tap, farEdge, flow } from "../ui/kit.tsx";
import { SkeletonList } from "../ui/states.tsx";
import { PageBar } from "../ui/nav.tsx";

function statusLabel(l: Lang, s: HomeInvoice): string {
  if (s.is_cancelled === 1) return t(l, "cancelled");
  if (s.payment_status === "paid") return t(l, "paid");
  if (s.payment_status === "partial") return t(l, "partial");
  return t(l, "unpaid");
}

function statusColor(s: HomeInvoice): string {
  if (s.is_cancelled === 1) return COLORS.cardMuted;
  if (s.payment_status === "paid") return COLORS.debtOk;
  if (s.payment_status === "partial") return COLORS.debtDue;
  return COLORS.debtOverdue;
}

export function InvoiceDetailScreen(props: {
  lang: Lang;
  row: HomeInvoice;
  customerName: string;
  shopName: string;
  hidden: boolean;
  detail: InvoiceDetail | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onRetry: () => void;
  onReport: (text: string) => void;
  onShare: (text: string) => void;
}): React.JSX.Element {
  const l = props.lang;
  const dir = direction(l);
  const rtl = dir === "rtl";
  const [spinning, setSpinning] = useState(false);
  const s = props.row;
  const amount = (v: number): string => (props.hidden ? "•••" : formatMinor(v, l));
  const tone = statusColor(s);
  const paid = props.detail ? props.detail.sale.amount_paid_minor : null;

  const shareText = `${t(l, "receipt")} ${s.invoice_number} : ${t(l, "total")} ${amount(s.total_minor)} — ${t(l, "remaining")} ${amount(s.remaining_balance_minor)} (${props.shopName})`;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.contentBg }}>
      <PageBar
        title={`${t(l, "detailTitle")} · ${s.invoice_number}`}
        subtitle={props.shopName}
        onBack={props.onBack}
        backLabel={t(l, "back")}
        dir={dir}
        right={
          <Tap
            onPress={() => props.onShare(shareText)}
            accessibilityLabel={t(l, "shareStatement")}
            style={{
              backgroundColor: COLORS.primary,
              borderRadius: RADIUS.pill,
              paddingHorizontal: SPACE.md,
              paddingVertical: 9,
              flexDirection: flow(dir),
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Ionicons name="share-social-outline" size={15} color={COLORS.primaryText} />
            <Text style={{ color: COLORS.primaryText, fontWeight: "800", fontSize: 12 }}>
              {t(l, "shareStatement")}
            </Text>
          </Tap>
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: SPACE.md, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={spinning}
            onRefresh={() => {
              setSpinning(true);
              void Promise.resolve(props.onRetry()).finally(() => setSpinning(false));
            }}
          />
        }
      >
        {/* Ticket 80 mm */}
        <View
          style={[
            { backgroundColor: COLORS.cardBg, borderRadius: RADIUS.card, padding: SPACE.lg },
            SHADOW.card,
          ]}
        >
          <View style={{ alignItems: "center", marginBottom: SPACE.md }}>
            <LinearGradient
              colors={GRADIENTS.gold}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: COLORS.headerBg, fontWeight: "900", fontSize: 24 }}>V</Text>
            </LinearGradient>
            <Text
              style={{
                color: COLORS.cardText,
                fontWeight: "900",
                fontSize: 20,
                marginTop: 10,
                letterSpacing: 0.3,
              }}
            >
              {props.shopName}
            </Text>
            <Text style={{ color: COLORS.cardMuted, fontSize: 12 }}>{props.customerName}</Text>
          </View>

          <Dashed />

          <View
            style={{
              flexDirection: flow(dir),
              justifyContent: "space-between",
              paddingTop: SPACE.md,
              gap: SPACE.md,
            }}
          >
            <View>
              <Text style={{ color: COLORS.cardMuted, fontSize: 11 }}>{t(l, "invoiceLabel")}</Text>
              <Text style={{ fontFamily: "monospace", fontWeight: "800", color: COLORS.cardText }}>
                {s.invoice_number}
              </Text>
            </View>
            <View style={{ alignItems: rtl ? "flex-start" : "flex-end" }}>
              <Text style={{ color: COLORS.cardMuted, fontSize: 11 }}>{t(l, "dateLabel")}</Text>
              <Text
                style={{
                  color: COLORS.cardText,
                  fontWeight: "700",
                  textAlign: farEdge(rtl),
                }}
              >
                {formatDateFr(s.created_at)}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: SPACE.sm }}>
            <Badge label={statusLabel(l, s)} color={tone} />
          </View>

          {/* Lignes produits */}
          <Text
            style={{
              fontWeight: "900",
              marginTop: SPACE.lg,
              marginBottom: SPACE.sm,
              color: COLORS.cardText,
            }}
          >
            {t(l, "itemsTitle")}
          </Text>
          {props.loading && !props.detail ? (
            <SkeletonList count={3} bare />
          ) : props.detail && props.detail.items.length > 0 ? (
            props.detail.items.map((it, i) => (
              <View
                key={`${it.name}-${i}`}
                style={{
                  flexDirection: flow(dir),
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: SPACE.sm,
                  gap: SPACE.sm,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: COLORS.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.cardText, fontWeight: "700" }}>{it.name}</Text>
                  <Text style={{ color: COLORS.cardMuted, fontSize: 11, fontFamily: "monospace" }}>
                    {t(l, "qtyShort")}: {it.quantity} × {amount(it.unitPriceMinor)}
                  </Text>
                </View>
                <Amount text={amount(it.lineTotalMinor)} size={15} />
              </View>
            ))
          ) : (
            <View
              style={{
                flexDirection: flow(dir),
                alignItems: "center",
                gap: SPACE.sm,
                backgroundColor: COLORS.dangerBg,
                borderRadius: RADIUS.inner,
                padding: SPACE.md,
                borderWidth: 1,
                borderColor: tint(COLORS.debtOverdue, "3D"),
              }}
            >
              <Ionicons name="alert-circle-outline" size={18} color={COLORS.debtOverdue} />
              <Text style={{ color: COLORS.dangerText, fontSize: 12, flex: 1, fontWeight: "600" }}>
                {props.error ?? t(l, "detailNotFound")}
              </Text>
            </View>
          )}

          {/* Totaux */}
          <View
            style={{
              marginTop: SPACE.md,
              backgroundColor: COLORS.headerBg,
              borderRadius: RADIUS.cardSm,
              padding: SPACE.md,
              gap: SPACE.sm,
            }}
          >
            {[
              { k: t(l, "total"), v: amount(s.total_minor), c: COLORS.white, size: 18 },
              {
                k: t(l, "paidAmount"),
                v: paid != null ? amount(paid) : "—",
                c: COLORS.headerAccent,
                size: 14,
              },
              {
                k: t(l, "remaining"),
                v: s.is_cancelled === 1 ? t(l, "cancelled") : amount(s.remaining_balance_minor),
                c: COLORS.primary,
                size: 18,
              },
            ].map((row) => (
              <View
                key={row.k}
                style={{
                  flexDirection: flow(dir),
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: COLORS.navyMuted, fontSize: 13 }}>{row.k}</Text>
                <Amount text={row.v} tone={row.c} size={row.size} align={farEdge(rtl)} />
              </View>
            ))}
          </View>

          {/* QR / référence */}
          <View style={{ alignItems: "center", marginTop: SPACE.md }}>
            <View
              style={{
                flexDirection: flow(dir),
                alignItems: "center",
                gap: SPACE.sm,
                backgroundColor: COLORS.contentBg,
                borderRadius: RADIUS.pill,
                paddingHorizontal: SPACE.lg,
                paddingVertical: SPACE.sm,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Ionicons name="qr-code-outline" size={18} color={COLORS.headerBg} />
              <Text
                style={{
                  fontFamily: "monospace",
                  fontWeight: "800",
                  color: COLORS.cardText,
                  fontSize: 13,
                }}
              >
                {s.invoice_number}
              </Text>
            </View>
            <Text
              style={{
                color: COLORS.cardMuted,
                fontSize: 11,
                marginTop: SPACE.sm,
                textAlign: "center",
              }}
            >
              {t(l, "receiptNote")}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={{ gap: SPACE.sm, marginTop: SPACE.md }}>
          {props.error ? (
            <Button
              label={t(l, "retry")}
              variant="gold"
              size="lg"
              icon="refresh-outline"
              onPress={props.onRetry}
            />
          ) : null}
          <Button
            label={t(l, "reportError")}
            variant="outline"
            icon="flag-outline"
            // Rapport d'erreur (format.ts) et NON le reçu : WhatsApp doit
            // recevoir le texte de signalement, comme sur la liste factures.
            onPress={() =>
              props.onReport(
                errorReportText({
                  lang: l,
                  name: props.customerName,
                  invoice: s.invoice_number,
                  amountMinor: s.total_minor,
                }),
              )
            }
          />
        </View>
      </ScrollView>
    </View>
  );
}
