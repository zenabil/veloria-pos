// Veloria Client — Écran 02 : accueil V4 « Daylight plat ».
// Bandeau d'encre plat (le chiffre de dette EST le héros), récapitulatif et
// aperçus en groupes à filets : plus de carte qui déborde d'un dégradé, plus de
// bento, plus de slab or pour la fidélité. Logique inchangée : toHome() +
// masquage des montants + refresh + données périmées.
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, HAIRLINE, RADIUS, SPACE, SIZES, debtColor } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { formatDateFr, formatMinor } from "../format.ts";
import { toHome, type HomeInvoice } from "../views.ts";
import {
  Amount,
  Badge,
  Button,
  Divider,
  Group,
  IconBubble,
  Row,
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

/** Teinte lisible SUR l'encre : les rouges/ambres de statut y seraient éteints. */
function bandTone(tone: string): string {
  if (tone === COLORS.debtOverdue || tone === COLORS.debtOverLimit) return COLORS.dangerLight;
  if (tone === COLORS.debtDue) return COLORS.primary;
  if (tone === COLORS.debtOk) return COLORS.headerAccent;
  return COLORS.navyMuted;
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
  // phrase utile sous le nom : les impayés s'ils existent, sinon rien.
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
  const syncLine = props.stale
    ? `${t(l, "staleDataOn")} ${props.syncedAt ? formatDateFr(props.syncedAt) : "—"}`
    : `${t(l, "connected")} · ${props.syncedAt ? formatDateFr(props.syncedAt) : "—"}`;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.contentBg }}
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
    >
      {/* Bandeau d'encre plat : boutique, solde, statut, fraîcheur. */}
      <View style={{ backgroundColor: COLORS.headerBg, padding: SPACE.lg }}>
        <View style={{ flexDirection: flow(dir), alignItems: "flex-start", gap: SPACE.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.navyMuted, fontSize: 12, fontWeight: "700" }}>
              {t(l, greetKey)}
            </Text>
            <Text
              style={{
                color: COLORS.white,
                fontSize: 19,
                lineHeight: 25,
                fontWeight: "800",
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {h.shop.name}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: SPACE.lg }}>
          {/* L'œil commande les montants : il vit à côté du solde, pas dans un
              coin perdu du bandeau. */}
          <View
            style={{
              flexDirection: flow(dir),
              alignItems: "center",
              justifyContent: "space-between",
              gap: SPACE.sm,
            }}
          >
            <Text style={{ color: COLORS.navyMuted, fontSize: 12, fontWeight: "700" }}>
              {t(l, "debtRemaining")}
            </Text>
            <Tap
              onPress={props.onToggleHidden}
              accessibilityLabel={props.hidden ? t(l, "showAmounts") : t(l, "hideAmounts")}
              hitSlop={8}
              style={{
                flexDirection: flow(dir),
                alignItems: "center",
                gap: 6,
                minHeight: 36,
                paddingHorizontal: SPACE.sm,
              }}
            >
              <Ionicons
                name={props.hidden ? "eye-off-outline" : "eye-outline"}
                size={16}
                color={COLORS.headerText}
              />
              <Text style={{ color: COLORS.navyMuted, fontSize: 11, fontWeight: "700" }}>
                {props.hidden ? t(l, "showAmounts") : t(l, "hideAmounts")}
              </Text>
            </Tap>
          </View>
          <Amount
            text={amount(h.debtMinor)}
            tone={COLORS.white}
            size={SIZES.heroAmount}
            style={{ marginTop: 4 }}
          />
          <View
            style={{
              flexDirection: flow(dir),
              alignItems: "center",
              gap: SPACE.md,
              marginTop: SPACE.sm,
            }}
          >
            <Badge
              label={invoiceStatusLabel(l, h.debtStatus, h.overLimit)}
              color={bandTone(tone)}
              dot
            />
            {dueCount > 0 ? (
              <Text style={{ color: COLORS.navyMuted, fontSize: 12 }} numberOfLines={1}>
                {dueCount} · {t(l, "dueInvoices")}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Fraîcheur : une ligne, et « réessayer » seulement si périmé. */}
        <View
          style={{
            flexDirection: flow(dir),
            alignItems: "center",
            gap: 6,
            marginTop: SPACE.lg,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: props.stale ? COLORS.primary : COLORS.headerAccent,
            }}
          />
          <Text
            style={{ color: COLORS.navyMuted, fontSize: 11, flex: 1 }}
            numberOfLines={1}
            accessibilityLiveRegion="polite"
          >
            {syncLine}
          </Text>
          {props.stale ? (
            <Tap
              onPress={() => {
                setSpinning(true);
                void props.onRefresh().finally(() => setSpinning(false));
              }}
              accessibilityLabel={t(l, "retry")}
              hitSlop={8}
              style={{
                flexDirection: flow(dir),
                alignItems: "center",
                gap: 4,
                paddingHorizontal: SPACE.sm,
                paddingVertical: 6,
              }}
            >
              <Ionicons name="refresh-outline" size={14} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 12 }}>
                {t(l, "retry")}
              </Text>
            </Tap>
          ) : null}
        </View>
      </View>

      <View style={{ padding: SPACE.lg }}>
        {/* Utilisation du crédit : bloc tonal, la barre segmentée suffit. */}
        {creditUsed != null ? (
          <View
            style={{
              backgroundColor: COLORS.toneBg,
              borderRadius: RADIUS.cardSm,
              padding: SPACE.md,
            }}
          >
            <View
              style={{
                flexDirection: flow(dir),
                justifyContent: "space-between",
                alignItems: "center",
                gap: SPACE.sm,
              }}
            >
              <Text style={{ color: COLORS.cardMuted, fontSize: 12 }}>
                {/* Pourcentage masqué comme les montants (« Masquer » actif). */}
                {props.hidden ? "•••" : `${creditUsed}%`} {t(l, "ofLimit")}
              </Text>
              <Amount text={amount(h.creditLimitMinor)} size={13} />
            </View>
            {/* D13 : barre segmentée (10 crans) — lisible d'un coup d'œil,
                jamais d'anneau décoratif. Danger à 90 %+. */}
            <View style={{ flexDirection: flow(dir), gap: 3, marginTop: SPACE.sm }}>
              {Array.from({ length: 10 }, (_, i) => {
                const filled = i * 10 < creditUsed;
                const danger = creditUsed >= 90;
                return (
                  <View
                    key={i}
                    style={{
                      flex: 1,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: filled
                        ? danger
                          ? COLORS.debtOverdue
                          : COLORS.primary
                        : COLORS.gray200,
                    }}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Raccourcis : deux boutons discrets (les onglets restent la nav). */}
        <View style={{ flexDirection: flow(dir), gap: SPACE.sm, marginTop: SPACE.md }}>
          <Button
            label={t(l, "invoices")}
            icon="receipt-outline"
            variant="quiet"
            style={{ flex: 1 }}
            accessibilityLabel={t(l, "invoices")}
            onPress={() => props.onOpenTab("invoices")}
          />
          <Button
            label={t(l, "payments")}
            icon="wallet-outline"
            variant="quiet"
            style={{ flex: 1 }}
            accessibilityLabel={t(l, "payments")}
            onPress={() => props.onOpenTab("payments")}
          />
        </View>

        {h.announcement ? (
          <View
            style={{
              flexDirection: flow(dir),
              gap: SPACE.sm,
              alignItems: "flex-start",
              backgroundColor: COLORS.cardBg,
              borderRadius: RADIUS.cardSm,
              padding: SPACE.md,
              marginTop: SPACE.md,
              ...HAIRLINE,
            }}
          >
            <Ionicons name="megaphone-outline" size={17} color={COLORS.debtOk} />
            <Text
              style={{ color: COLORS.announcementText, fontWeight: "600", flex: 1, fontSize: 13 }}
            >
              {h.announcement}
            </Text>
          </View>
        ) : null}

        {/* Récapitulatif du mois : un groupe, deux lignes. */}
        <View style={{ marginTop: SPACE.lg }}>
          <Group>
            <Row
              dir={dir}
              title={t(l, "totalPurchases")}
              caption={`${h.lastSales.length} ${t(l, "invoices")}`}
              value={amount(h.monthPurchasesMinor)}
            />
            <Divider />
            <Row
              dir={dir}
              title={t(l, "payments")}
              caption={`${h.lastPayments.length} ${t(l, "payments")}`}
              value={amount(h.monthPaymentsMinor)}
              valueTone={COLORS.debtOk}
            />
          </Group>
        </View>

        {/* Fidélité : ligne tonale discrète (information non actionnable). */}
        <View
          style={{
            flexDirection: flow(dir),
            alignItems: "center",
            gap: SPACE.md,
            backgroundColor: COLORS.toneBg,
            borderRadius: RADIUS.cardSm,
            padding: SPACE.md,
            marginTop: SPACE.md,
          }}
        >
          <IconBubble icon="star-outline" color={COLORS.cardText} size={32} bg={COLORS.cardBg} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.cardText, fontWeight: "700", fontSize: 13 }}>
              {t(l, "loyaltyInfo")}
            </Text>
            <Text
              style={{ color: COLORS.cardMuted, fontSize: 11, marginTop: 2, lineHeight: 15 }}
              numberOfLines={2}
            >
              {t(l, "loyaltyHint")}
            </Text>
          </View>
          <Amount
            text={props.hidden ? "•••" : String(h.loyaltyPoints)}
            tone={COLORS.cardText}
            size={18}
            align={farEdge(rtl)}
          />
        </View>

        {/* Aperçu factures */}
        <SectionHead
          title={t(l, "invoices")}
          actionLabel={t(l, "viewAll")}
          onPress={() => props.onOpenTab("invoices")}
          dir={dir}
        />
        {h.lastSales.length === 0 ? (
          <Group>
            <EmptyState
              icon="receipt-outline"
              title={t(l, "noInvoices")}
              hint={t(l, "emptyHint")}
            />
          </Group>
        ) : (
          <Group>
            {h.lastSales.map((s, i) => (
              <View key={s.id}>
                {i > 0 ? <Divider /> : null}
                <Row
                  dir={dir}
                  title={s.invoice_number}
                  caption={`${formatDateFr(s.created_at)} · ${statusText(l, s)} · ${t(l, "remaining")}`}
                  value={amount(s.remaining_balance_minor)}
                  valueTone={sideColor(s)}
                  icon={statusIcon(s)}
                  iconTone={sideColor(s)}
                  chevron
                  accessibilityLabel={`${s.invoice_number}, ${statusText(l, s)}, ${t(l, "remaining")} ${amount(s.remaining_balance_minor)}`}
                  onPress={() => props.onOpenDetail?.(s)}
                />
              </View>
            ))}
          </Group>
        )}

        {/* Aperçu paiements */}
        <SectionHead
          title={t(l, "payments")}
          actionLabel={t(l, "viewAll")}
          onPress={() => props.onOpenTab("payments")}
          dir={dir}
        />
        {h.lastPayments.length === 0 ? (
          <Group>
            <EmptyState icon="wallet-outline" title={t(l, "noPayments")} hint={t(l, "emptyHint")} />
          </Group>
        ) : (
          <Group>
            {h.lastPayments.map((p, i) => (
              <View key={p.id}>
                {i > 0 ? <Divider inset={SPACE.lg} /> : null}
                <Row
                  dir={dir}
                  title={formatDateFr(p.payment_date)}
                  caption={p.sale_id != null ? t(l, "invoicePayment") : t(l, "accountAdvance")}
                  value={`+${amount(p.amount_minor)}`}
                  valueTone={COLORS.debtOk}
                  icon="arrow-down"
                  iconTone={COLORS.debtOk}
                />
              </View>
            ))}
          </Group>
        )}

        {/* Top produits */}
        {h.topProducts.length > 0 ? (
          <>
            <SectionHead title={t(l, "topProducts")} dir={dir} />
            <Group>
              {h.topProducts.map((p, i) => (
                <View key={`${p.name}#${i}`}>
                  {i > 0 ? <Divider inset={SPACE.lg} /> : null}
                  <Row
                    dir={dir}
                    title={p.name}
                    caption={p.lastPriceMinor > 0 ? amount(p.lastPriceMinor) : undefined}
                    value={`×${p.quantity}`}
                  />
                </View>
              ))}
            </Group>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}
