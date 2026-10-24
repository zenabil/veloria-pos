// Veloria Client — Écran 02 : accueil V3 « Veloria Fintech ».
// Héros dégradé + carte solde surélevée en débord, actions rapides, bento KPI,
// fidélité or, aperçus factures/paiements cliquables. Logique inchangée :
// toHome() + masquage montants + refresh + stale.
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, GRADIENTS, RADIUS, SHADOW, SPACE, SIZES, debtColor, tint } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { formatDateFr, formatMinor } from "../format.ts";
import { toHome, type HomeInvoice } from "../views.ts";
import {
  Amount,
  Badge,
  Card,
  IconBubble,
  SectionHead,
  Tap,
  farEdge,
  flow,
  type IconName,
} from "../ui/kit.tsx";
import { EmptyState } from "../ui/states.tsx";

function statusLabel(l: Lang, status: string, overLimit: boolean): string {
  if (overLimit || status === "over_limit") return t(l, "overLimit");
  if (status === "overdue") return t(l, "late");
  if (status === "due") return t(l, "indebted");
  return t(l, "upToDate");
}

function statusIcon(s: HomeInvoice): IconName {
  if (s.is_cancelled === 1) return "close-circle";
  if (s.payment_status === "paid") return "checkmark-circle";
  if (s.payment_status === "partial") return "time";
  return "alert-circle";
}

function sideColor(s: HomeInvoice): string {
  if (s.is_cancelled === 1) return COLORS.cardMuted;
  if (s.payment_status === "paid") return COLORS.debtOk;
  if (s.payment_status === "partial") return COLORS.debtDue;
  return COLORS.debtOverdue;
}

function statusText(l: Lang, s: HomeInvoice): string {
  if (s.is_cancelled === 1) return t(l, "cancelled");
  if (s.payment_status === "paid") return t(l, "paid");
  if (s.payment_status === "partial") return t(l, "partial");
  return t(l, "unpaid");
}

function invoiceStatusLabel(l: Lang, status: string, overLimit: boolean): string {
  return statusLabel(l, status, overLimit);
}

export function HomeScreen(props: {
  lang: Lang;
  snapshot: unknown;
  syncedAt: string | null;
  stale: boolean;
  hidden: boolean;
  onToggleHidden: () => void;
  onRefresh: () => Promise<void>;
  onOpenTab: (tab: "invoices" | "payments") => void;
  onOpenDetail?: (row: HomeInvoice) => void;
}): React.JSX.Element {
  const l = props.lang;
  const dir = direction(l);
  const rtl = dir === "rtl";
  const h = toHome(props.snapshot);
  const [spinning, setSpinning] = useState(false);
  const tone = debtColor(h.debtStatus, h.overLimit);
  // D12 : salut selon l'heure (soir après 18h) + ligne dynamique — une seule
  // phrase utile sous le nom : les impayés s'ils existent, sinon rien (propre).
  const hour = new Date().getHours();
  const greetKey = hour >= 18 || hour < 5 ? "greetingEvening" : "greeting";
  const dueCount = h.lastSales.filter(
    (s) => s.is_cancelled !== 1 && s.payment_status !== "paid",
  ).length;
  const amount = (v: number): string => (props.hidden ? "•••" : formatMinor(v, l));
  const creditUsed =
    h.creditLimitMinor > 0
      ? Math.min(100, Math.round((h.debtMinor / h.creditLimitMinor) * 100))
      : null;
  const actions: { id: string; label: string; icon: IconName; color: string; run: () => void }[] = [
    {
      id: "invoices",
      label: t(l, "invoices"),
      icon: "receipt-outline",
      color: COLORS.headerBg,
      run: () => props.onOpenTab("invoices"),
    },
    {
      id: "payments",
      label: t(l, "payments"),
      icon: "wallet-outline",
      color: COLORS.debtOk,
      run: () => props.onOpenTab("payments"),
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.contentBg }}
      contentContainerStyle={{ paddingBottom: 110 }}
      refreshControl={
        <RefreshControl
          refreshing={spinning}
          onRefresh={() => {
            setSpinning(true);
            void props.onRefresh().finally(() => setSpinning(false));
          }}
        />
      }
    >
      {/* Héros dégradé : accueil + boutique + masquage */}
      <LinearGradient
        colors={GRADIENTS.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          padding: SPACE.lg,
          paddingBottom: 64,
          borderBottomLeftRadius: RADIUS.heroBottom + 4,
          borderBottomRightRadius: RADIUS.heroBottom + 4,
        }}
      >
        <View
          style={{
            flexDirection: flow(dir),
            justifyContent: "space-between",
            alignItems: "center",
            gap: SPACE.md,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.navyMuted, fontSize: 12, fontWeight: "700" }}>
              {t(l, greetKey)}
            </Text>
            <Text
              style={{
                color: COLORS.white,
                fontSize: 24,
                fontWeight: "900",
                marginTop: 2,
                letterSpacing: 0.3,
              }}
              numberOfLines={1}
            >
              {h.shop.name}
            </Text>
            {dueCount > 0 ? (
              <Text
                style={{ color: COLORS.primary, fontSize: 12, fontWeight: "700", marginTop: 4 }}
              >
                {dueCount} · {t(l, "dueInvoices")}
              </Text>
            ) : null}
            <View
              style={{
                flexDirection: flow(dir),
                alignItems: "center",
                gap: 6,
                marginTop: 6,
              }}
            >
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: props.stale ? COLORS.primary : COLORS.headerAccent,
                }}
              />
              <Text style={{ color: COLORS.headerText, fontSize: 11 }} numberOfLines={1}>
                {props.stale
                  ? `${t(l, "staleDataOn")} ${props.syncedAt ? formatDateFr(props.syncedAt) : "—"}`
                  : `${t(l, "connected")} · ${props.syncedAt ? formatDateFr(props.syncedAt) : "—"}`}
              </Text>
            </View>
          </View>
          <Tap
            onPress={props.onToggleHidden}
            accessibilityLabel={props.hidden ? t(l, "showAmounts") : t(l, "hideAmounts")}
            hitSlop={8}
            style={{
              width: SIZES.touchMin,
              height: SIZES.touchMin,
              borderRadius: SIZES.touchMin / 2,
              backgroundColor: tint(COLORS.white, "14"),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name={props.hidden ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={COLORS.primary}
            />
          </Tap>
        </View>

        {props.stale ? (
          <Tap
            onPress={props.onRefresh}
            accessibilityLabel={t(l, "retry")}
            style={{
              marginTop: SPACE.md,
              backgroundColor: tint(COLORS.primary, "1F"),
              borderRadius: RADIUS.pill,
              paddingHorizontal: SPACE.md,
              paddingVertical: 10,
              flexDirection: flow(dir),
              alignItems: "center",
              gap: SPACE.sm,
            }}
          >
            <Ionicons name="cloud-offline-outline" size={16} color={COLORS.primary} />
            <Text style={{ color: COLORS.primary, fontWeight: "700", fontSize: 12, flex: 1 }}>
              {t(l, "staleDataOn")} {props.syncedAt ? formatDateFr(props.syncedAt) : "—"} ·{" "}
              {t(l, "retry")}
            </Text>
            <Ionicons name="refresh-outline" size={16} color={COLORS.primary} />
          </Tap>
        ) : null}
      </LinearGradient>

      <View style={{ padding: SPACE.lg, paddingTop: 0 }}>
        {/* Carte solde — déborde sur le héros */}
        <Card raised style={{ marginTop: -48, borderLeftWidth: 4, borderLeftColor: tone }}>
          <View
            style={{
              flexDirection: flow(dir),
              justifyContent: "space-between",
              alignItems: "center",
              gap: SPACE.sm,
            }}
          >
            <Text style={{ color: COLORS.cardMuted, fontWeight: "700", fontSize: 13 }}>
              {t(l, "debtRemaining")}
            </Text>
            <Badge
              label={invoiceStatusLabel(l, h.debtStatus, h.overLimit)}
              color={tone}
              icon={
                tone === COLORS.debtOk
                  ? "checkmark-circle"
                  : tone === COLORS.debtDue
                    ? "time"
                    : "alert-circle"
              }
            />
          </View>
          <Amount text={amount(h.debtMinor)} tone={tone} size={SIZES.heroAmount + 4} />
          {creditUsed != null ? (
            <View
              style={{
                marginTop: SPACE.md,
                backgroundColor: COLORS.contentBg,
                borderRadius: RADIUS.inner,
                padding: SPACE.md,
              }}
            >
              <View
                style={{
                  flexDirection: flow(dir),
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: COLORS.cardMuted, fontSize: 12 }}>
                  {/* Pourcentage masqué comme les montants (« Masquer » actif). */}
                  {props.hidden ? "•••" : `${creditUsed}%`} {t(l, "ofLimit")}
                </Text>
                <Amount text={amount(h.creditLimitMinor)} size={13} tone={COLORS.cardText} />
              </View>
              {/* D13 : barre segmentée (10 crans) — lisible d'un coup d'œil,
                  jamais d'anneau décoratif. Danger à 90 %+. */}
              <View
                style={{
                  flexDirection: flow(dir),
                  gap: 3,
                  marginTop: 8,
                }}
              >
                {Array.from({ length: 10 }, (_, i) => {
                  const filled = i * 10 < creditUsed;
                  const danger = creditUsed >= 90;
                  return (
                    <View
                      key={i}
                      style={{
                        flex: 1,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: filled
                          ? danger
                            ? COLORS.debtOverdue
                            : COLORS.primary
                          : COLORS.border,
                      }}
                    />
                  );
                })}
              </View>
            </View>
          ) : null}
        </Card>

        {/* Actions rapides */}
        <View style={{ flexDirection: flow(dir), gap: SPACE.sm, marginTop: SPACE.md }}>
          {actions.map((a) => (
            <Tap
              key={a.id}
              onPress={a.run}
              accessibilityLabel={a.label}
              style={[
                {
                  flex: 1,
                  backgroundColor: COLORS.cardBg,
                  borderRadius: RADIUS.cardSm,
                  paddingVertical: SPACE.md,
                  paddingHorizontal: SPACE.xs,
                  alignItems: "center",
                  gap: 6,
                  borderWidth: 1,
                  borderColor: tint(COLORS.headerBg, "0D"),
                },
                SHADOW.card,
              ]}
            >
              <IconBubble icon={a.icon} color={a.color} size={38} />
              <Text
                style={{ fontSize: 11, fontWeight: "800", color: COLORS.cardText }}
                numberOfLines={1}
              >
                {a.label}
              </Text>
            </Tap>
          ))}
        </View>

        {h.announcement ? (
          <View
            style={{
              flexDirection: flow(dir),
              gap: SPACE.sm,
              backgroundColor: tint(COLORS.debtOk, "14"),
              borderRadius: RADIUS.cardSm,
              borderWidth: 1,
              borderColor: tint(COLORS.debtOk, "3D"),
              padding: SPACE.md,
              marginTop: SPACE.md,
              alignItems: "flex-start",
            }}
          >
            <IconBubble icon="megaphone" color={COLORS.debtOk} size={32} />
            <Text
              style={{ color: COLORS.announcementText, fontWeight: "700", flex: 1, fontSize: 13 }}
            >
              {h.announcement}
            </Text>
          </View>
        ) : null}

        {/* Bento 2 KPI */}
        <View style={{ flexDirection: flow(dir), gap: SPACE.sm, marginTop: SPACE.md }}>
          <Card style={{ flex: 1, padding: SPACE.md }}>
            <View
              style={{
                flexDirection: flow(dir),
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: COLORS.cardMuted, fontSize: 12 }} numberOfLines={1}>
                {t(l, "totalPurchases")}
              </Text>
              <IconBubble icon="trending-up" color={COLORS.headerBg} size={28} />
            </View>
            <Amount text={amount(h.monthPurchasesMinor)} size={SIZES.amountMd} />
            <Text style={{ color: COLORS.cardMuted, fontSize: 11, marginTop: 2 }}>
              {h.lastSales.length} {t(l, "invoices")}
            </Text>
          </Card>
          <Card style={{ flex: 1, padding: SPACE.md }}>
            <View
              style={{
                flexDirection: flow(dir),
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: COLORS.cardMuted, fontSize: 12 }} numberOfLines={1}>
                {t(l, "payments")}
              </Text>
              <IconBubble icon="arrow-down-circle" color={COLORS.debtOk} size={28} />
            </View>
            <Amount
              text={amount(h.monthPaymentsMinor)}
              size={SIZES.amountMd}
              tone={COLORS.debtOk}
            />
            <Text style={{ color: COLORS.cardMuted, fontSize: 11, marginTop: 2 }}>
              {h.lastPayments.length} {t(l, "payments")}
            </Text>
          </Card>
        </View>

        {/* Fidélité */}
        <LinearGradient
          colors={GRADIENTS.gold}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: RADIUS.card,
            padding: SPACE.lg,
            marginTop: SPACE.md,
            flexDirection: flow(dir),
            alignItems: "center",
            gap: SPACE.md,
            ...SHADOW.gold,
          }}
        >
          <IconBubble
            icon="star"
            color={COLORS.primaryText}
            bg={tint(COLORS.primaryText, "1F")}
            size={42}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "900", color: COLORS.primaryText, fontSize: 14 }}>
              {t(l, "loyaltyInfo")}
            </Text>
            <Text
              style={{ color: tint(COLORS.primaryText, "B3"), fontSize: 11, marginTop: 2 }}
              numberOfLines={2}
            >
              {t(l, "loyaltyHint")}
            </Text>
          </View>
          <Amount
            text={props.hidden ? "•••" : String(h.loyaltyPoints)}
            tone={COLORS.primaryText}
            size={26}
          />
        </LinearGradient>

        {/* Aperçu factures */}
        <Card style={{ marginTop: SPACE.md }}>
          <SectionHead
            title={t(l, "invoices")}
            actionLabel={t(l, "viewAll")}
            onPress={() => props.onOpenTab("invoices")}
            dir={dir}
          />
          {h.lastSales.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title={t(l, "noInvoices")}
              hint={t(l, "emptyHint")}
            />
          ) : (
            h.lastSales.map((s, i) => (
              <Tap
                key={s.id}
                onPress={() => props.onOpenDetail?.(s)}
                accessibilityLabel={`${s.invoice_number}, ${statusText(l, s)}, ${t(l, "remaining")} ${amount(s.remaining_balance_minor)}`}
                style={{
                  flexDirection: flow(dir),
                  alignItems: "center",
                  gap: SPACE.md,
                  paddingVertical: 10,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: COLORS.border,
                }}
              >
                <IconBubble icon={statusIcon(s)} color={sideColor(s)} size={38} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "monospace",
                      fontWeight: "800",
                      color: COLORS.cardText,
                      fontSize: 13,
                    }}
                    numberOfLines={1}
                  >
                    {s.invoice_number}
                  </Text>
                  <Text style={{ color: COLORS.cardMuted, fontSize: 11, marginTop: 2 }}>
                    {formatDateFr(s.created_at)} · {statusText(l, s)}
                  </Text>
                </View>
                <View style={{ alignItems: rtl ? "flex-start" : "flex-end" }}>
                  <Amount
                    text={amount(s.remaining_balance_minor)}
                    tone={sideColor(s)}
                    size={15}
                    align={farEdge(rtl)}
                  />
                  <Text style={{ color: COLORS.cardMuted, fontSize: 10, textAlign: farEdge(rtl) }}>
                    {t(l, "remaining")}
                  </Text>
                </View>
                <Ionicons
                  name={rtl ? "chevron-back" : "chevron-forward"}
                  size={16}
                  color={COLORS.cardMuted}
                />
              </Tap>
            ))
          )}
        </Card>

        {/* Aperçu paiements */}
        <Card style={{ marginTop: SPACE.md }}>
          <SectionHead
            title={t(l, "payments")}
            actionLabel={t(l, "viewAll")}
            onPress={() => props.onOpenTab("payments")}
            dir={dir}
          />
          {h.lastPayments.length === 0 ? (
            <EmptyState icon="wallet-outline" title={t(l, "noPayments")} hint={t(l, "emptyHint")} />
          ) : (
            h.lastPayments.map((p) => (
              <View
                key={p.id}
                style={{
                  flexDirection: flow(dir),
                  alignItems: "center",
                  gap: SPACE.md,
                  paddingVertical: 10,
                  borderTopWidth: 1,
                  borderTopColor: COLORS.border,
                }}
              >
                <IconBubble icon="arrow-down" color={COLORS.debtOk} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.cardText, fontWeight: "700", fontSize: 13 }}>
                    {formatDateFr(p.payment_date)}
                  </Text>
                  <Text style={{ color: COLORS.cardMuted, fontSize: 11, marginTop: 2 }}>
                    {p.sale_id != null ? t(l, "invoicePayment") : t(l, "accountAdvance")}
                  </Text>
                </View>
                <Amount
                  text={`+${amount(p.amount_minor)}`}
                  tone={COLORS.debtOk}
                  size={15}
                  align={farEdge(rtl)}
                />
              </View>
            ))
          )}
        </Card>

        {/* Top produits */}
        {h.topProducts.length > 0 ? (
          <Card style={{ marginTop: SPACE.md }}>
            <SectionHead title={t(l, "topProducts")} dir={dir} />
            <View style={{ flexDirection: flow(dir), flexWrap: "wrap", gap: SPACE.sm }}>
              {h.topProducts.map((p, i) => (
                <View
                  key={`${p.name}#${i}`}
                  style={{
                    flexDirection: flow(dir),
                    alignItems: "center",
                    gap: 6,
                    backgroundColor: COLORS.contentBg,
                    borderRadius: RADIUS.pill,
                    paddingHorizontal: SPACE.md,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: COLORS.cardText, fontWeight: "700", fontSize: 12 }}>
                    {p.name}
                  </Text>
                  <Amount text={`×${p.quantity}`} size={12} tone={COLORS.cardMuted} />
                </View>
              ))}
            </View>
          </Card>
        ) : null}
      </View>
    </ScrollView>
  );
}
