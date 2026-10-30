// Veloria Client — Écran 06 : page détail facture V5 « fiche + ticket ».
// Le bandeau de navigation reste encre ; la fiche financière (boutique, statut,
// reste en héros, total/payé) devient la première carte, les articles vivent
// dans leur propre carte, puis la référence QR et les actions. Le ticket 80 mm
// (Dashed + Mono) est conservé comme vocabulaire, sans dégradé ni bloc navy.
// Données via `fetchInvoiceDetail` (App : `detail`, `loading`, `error`, `onRetry`).
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Icon } from "../ui/Icon.tsx";
import { COLORS, FONTS, HAIRLINE, RADIUS, SIZES, SPACE, tint } from "../tokens.ts";
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
        title={t(l, "detailTitle")}
        subtitle={`${s.invoice_number} · ${props.shopName}`}
        onBack={props.onBack}
        backLabel={t(l, "back")}
        dir={dir}
        right={
          <Tap
            onPress={() => props.onShare(shareText)}
            accessibilityLabel={t(l, "shareStatement")}
            style={{
              backgroundColor: COLORS.primary,
              borderRadius: RADIUS.button,
              paddingHorizontal: SPACE.md,
              minHeight: 40,
              flexDirection: flow(dir),
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Icon name="share-social-outline" size={15} color={COLORS.primaryText} />
            <Text style={{ color: COLORS.primaryText, fontWeight: "800", fontSize: 12 }}>
              {t(l, "shareStatement")}
            </Text>
          </Tap>
        }
      />

      <ScrollView
        contentContainerStyle={{
          padding: SPACE.lg,
          // Le dock est masqué sur cette page : confort de pouce seulement.
          paddingBottom: SPACE.xxl,
        }}
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
        {/* Fiche financière : identité du ticket + reste en héros. */}
        <View
          style={{
            backgroundColor: COLORS.cardBg,
            borderRadius: RADIUS.card,
            padding: SPACE.lg,
            ...HAIRLINE,
          }}
        >
          <View style={{ flexDirection: flow(dir), alignItems: "center", gap: SPACE.md }}>
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: RADIUS.cardSm,
                backgroundColor: COLORS.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: COLORS.headerBg, fontWeight: "900", fontSize: 20 }}>V</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: COLORS.cardText, fontWeight: "800", fontSize: 17, lineHeight: 22 }}
                numberOfLines={1}
              >
                {props.shopName}
              </Text>
              <Text style={{ color: COLORS.cardMuted, fontSize: 12 }} numberOfLines={1}>
                {props.customerName}
              </Text>
            </View>
            <Badge label={statusLabel(l, s)} color={tone} />
          </View>

          <Dashed style={{ marginVertical: SPACE.md }} />

          <Text style={{ color: COLORS.cardMuted, fontSize: 11, fontWeight: "700" }}>
            {t(l, "remaining")}
          </Text>
          <Amount
            text={s.is_cancelled === 1 ? t(l, "cancelled") : amount(s.remaining_balance_minor)}
            tone={s.is_cancelled === 1 ? COLORS.cardMuted : tone}
            size={SIZES.heroAmount}
            align={rtl ? "right" : "left"}
          />

          {/* Total / Payé : deux mini-cartes sous le héros — côte à côte, le
              montant « DZD » du héros se tronquait en français. */}
          <View style={{ flexDirection: flow(dir), gap: SPACE.sm, marginTop: SPACE.sm }}>
            <View
              style={{
                flex: 1,
                backgroundColor: COLORS.toneBg,
                borderRadius: RADIUS.inner,
                padding: SPACE.sm,
                gap: 2,
              }}
            >
              <Text style={{ color: COLORS.cardMuted, fontSize: 10, fontWeight: "700" }}>
                {t(l, "total")}
              </Text>
              <Amount text={amount(s.total_minor)} size={13} align={rtl ? "right" : "left"} />
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: COLORS.toneBg,
                borderRadius: RADIUS.inner,
                padding: SPACE.sm,
                gap: 2,
              }}
            >
              <Text style={{ color: COLORS.cardMuted, fontSize: 10, fontWeight: "700" }}>
                {t(l, "paidAmount")}
              </Text>
              <Amount
                text={paid != null ? amount(paid) : "—"}
                tone={COLORS.debtOk}
                size={13}
                align={rtl ? "right" : "left"}
              />
            </View>
          </View>

          <Text style={{ color: COLORS.cardMuted, fontSize: 11, marginTop: SPACE.md }}>
            {t(l, "dateLabel")} · {formatDateFr(s.created_at)}
          </Text>
        </View>

        {/* Articles : une carte, des filets internes. */}
        <View
          style={{
            backgroundColor: COLORS.cardBg,
            borderRadius: RADIUS.card,
            padding: SPACE.lg,
            marginTop: SPACE.md,
            ...HAIRLINE,
          }}
        >
          <View
            style={{
              flexDirection: flow(dir),
              alignItems: "center",
              justifyContent: "space-between",
              gap: SPACE.sm,
              marginBottom: SPACE.sm,
            }}
          >
            <Text
              style={{
                color: COLORS.cardMuted,
                fontWeight: "800",
                fontSize: 12,
                letterSpacing: 0.6,
              }}
            >
              {t(l, "itemsTitle")}
            </Text>
            <Text style={{ color: COLORS.cardMuted, fontSize: 11, fontFamily: FONTS.mono }}>
              {props.detail ? props.detail.items.length : "—"}
            </Text>
          </View>

          {props.loading && !props.detail ? (
            <SkeletonList count={3} bare />
          ) : props.detail && props.detail.items.length > 0 ? (
            props.detail.items.map((it, i) => (
              <View key={`${it.name}-${i}`}>
                {i > 0 ? <View style={{ height: 1, backgroundColor: COLORS.divider }} /> : null}
                <View
                  style={{
                    flexDirection: flow(dir),
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingVertical: SPACE.sm,
                    gap: SPACE.sm,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: COLORS.cardText,
                        fontWeight: "700",
                        fontSize: 14,
                        // Nom (souvent arabe) aligné sur le bord de LECTURE de
                        // l'UI : en FR il ne touche plus le montant à droite.
                        textAlign: rtl ? "right" : "left",
                      }}
                    >
                      {it.name}
                    </Text>
                    <Text style={{ color: COLORS.cardMuted, fontSize: 11, fontFamily: FONTS.mono }}>
                      {t(l, "qtyShort")}: {it.quantity} × {amount(it.unitPriceMinor)}
                    </Text>
                  </View>
                  <Amount text={amount(it.lineTotalMinor)} size={15} align={farEdge(rtl)} />
                </View>
              </View>
            ))
          ) : (
            <View
              style={{
                flexDirection: flow(dir),
                alignItems: "center",
                gap: SPACE.sm,
                backgroundColor: COLORS.dangerTone,
                borderRadius: RADIUS.inner,
                padding: SPACE.md,
                borderWidth: 1,
                borderColor: tint(COLORS.debtOverdue, "33"),
              }}
            >
              <Icon name="alert-circle-outline" size={18} color={COLORS.debtOverdue} />
              <Text style={{ color: COLORS.dangerText, fontSize: 12, flex: 1, fontWeight: "600" }}>
                {props.error ?? t(l, "detailNotFound")}
              </Text>
            </View>
          )}
        </View>

        {/* Référence QR + note de reçu. */}
        <View
          style={{
            backgroundColor: COLORS.cardBg,
            borderRadius: RADIUS.card,
            padding: SPACE.lg,
            marginTop: SPACE.md,
            alignItems: "center",
            ...HAIRLINE,
          }}
        >
          <View
            style={{
              flexDirection: flow(dir),
              alignItems: "center",
              gap: SPACE.sm,
              backgroundColor: COLORS.sunkenBg,
              borderRadius: RADIUS.pill,
              paddingHorizontal: SPACE.lg,
              paddingVertical: SPACE.sm,
            }}
          >
            <Icon name="qr-code-outline" size={18} color={COLORS.headerBg} />
            <Text
              style={{
                fontFamily: FONTS.mono,
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

        {/* Actions */}
        <View style={{ gap: SPACE.sm, marginTop: SPACE.md }}>
          {props.error ? (
            <Button
              label={t(l, "retry")}
              variant="gold"
              size="lg"
              full
              icon="refresh-outline"
              onPress={props.onRetry}
            />
          ) : null}
          <Button
            label={t(l, "reportError")}
            variant="outline"
            full
            icon="flag-outline"
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
