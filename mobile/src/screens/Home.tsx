// Veloria Client — Écran 02 : accueil V5 « Tableau de bord client ».
// La dette reste le héros ; la dernière facture devient une carte qui chevauche
// le bandeau, le crédit vit DANS le bandeau, le mois se lit en deux colonnes
// tactiles (achats / payés) et un client sans activité voit un accueil dédié.
// Logique inchangée : toHome() + masquage des montants + refresh + données
// périmées ; aucune donnée n'est recalculée ici.
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Icon } from "../ui/Icon.tsx";
import { COLORS, HAIRLINE, RADIUS, SHADOW, SIZES, SPACE, debtColor } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { formatDateFr, formatDateTimeFr, formatMinor, monthLabel } from "../format.ts";
import { toHome, type HomeInvoice } from "../views.ts";
import {
  Amount,
  Badge,
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
import { AnnouncementHero } from "../ui/announcement-hero.tsx";

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
  // D12 : salut selon l'heure (soir après 18h).
  const hour = new Date().getHours();
  const greetKey = hour >= 18 || hour < 5 ? "greetingEvening" : "greeting";
  const amount = (v: number): string => (props.hidden ? "•••" : formatMinor(v, l));
  const creditUsed =
    h.creditLimitMinor > 0
      ? Math.min(100, Math.round((h.debtMinor / h.creditLimitMinor) * 100))
      : null;
  const lastSale = h.lastSales[0] ?? null;
  const hasActivity = h.lastSales.length > 0 || h.lastPayments.length > 0;
  const month = h.monthKey !== "" ? monthLabel(h.monthKey, l) : "";
  const syncLine = props.stale
    ? `${t(l, "staleDataOn")} ${props.syncedAt ? formatDateFr(props.syncedAt) : "—"}`
    : `${t(l, "lastSync")} · ${props.syncedAt ? formatDateTimeFr(props.syncedAt) : "—"}`;

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
      {/* Bandeau d'encre : boutique, dette, crédit, fraîcheur. */}
      <View style={{ backgroundColor: COLORS.headerBg, padding: SPACE.lg, paddingBottom: 40 }}>
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
          {/* L'œil commande les montants : une pastille lisible sur l'encre. */}
          <Tap
            onPress={props.onToggleHidden}
            accessibilityLabel={props.hidden ? t(l, "showAmounts") : t(l, "hideAmounts")}
            hitSlop={8}
            style={{
              flexDirection: flow(dir),
              alignItems: "center",
              gap: 6,
              minHeight: 40,
              paddingHorizontal: SPACE.md,
              borderRadius: RADIUS.pill,
              backgroundColor: COLORS.navySoft,
            }}
          >
            <Icon
              name={props.hidden ? "eye-off-outline" : "eye-outline"}
              size={16}
              color={COLORS.headerText}
            />
            <Text style={{ color: COLORS.headerText, fontSize: 11, fontWeight: "700" }}>
              {props.hidden ? t(l, "showAmounts") : t(l, "hideAmounts")}
            </Text>
          </Tap>
        </View>

        <View style={{ marginTop: SPACE.lg }}>
          <Text style={{ color: COLORS.navyMuted, fontSize: 12, fontWeight: "700" }}>
            {t(l, "debtRemaining")}
          </Text>
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
            {/* Échéance convenue : la prochaine étape quand une dette existe. */}
            {h.debtMinor > 0 && h.settlementDay > 0 ? (
              <Text style={{ color: COLORS.navyMuted, fontSize: 12 }} numberOfLines={1}>
                {t(l, "settlementDay")} · {h.settlementDay}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Utilisation du crédit : DANS le bandeau, elle fait partie du solde. */}
        {creditUsed != null ? (
          <View
            accessible
            accessibilityLabel={
              props.hidden
                ? t(l, "creditUsage")
                : `${t(l, "creditUsage")} ${creditUsed}% ${amount(h.creditLimitMinor)}`
            }
            style={{
              backgroundColor: COLORS.navySoft,
              borderRadius: RADIUS.cardSm,
              padding: SPACE.md,
              marginTop: SPACE.md,
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
              <Text style={{ color: COLORS.navyMuted, fontSize: 11, fontWeight: "700" }}>
                {t(l, "creditUsage")}
              </Text>
              <Text style={{ color: COLORS.headerText, fontSize: 11, fontWeight: "800" }}>
                {props.hidden ? "•••" : `${creditUsed}%`} · {amount(h.creditLimitMinor)}
              </Text>
            </View>
            {/* Barre segmentée (10 crans) : lisible d'un coup d'œil. */}
            <View style={{ flexDirection: flow(dir), gap: 3, marginTop: SPACE.sm }}>
              {Array.from({ length: 10 }, (_, i) => {
                const filled = i * 10 < creditUsed;
                const danger = creditUsed >= 90;
                return (
                  <View
                    key={i}
                    style={{
                      flex: 1,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: filled
                        ? danger
                          ? COLORS.debtOverdue
                          : COLORS.primary
                        : COLORS.navyLine,
                    }}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

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
              <Icon name="refresh-outline" size={14} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 12 }}>
                {t(l, "retry")}
              </Text>
            </Tap>
          ) : null}
        </View>
      </View>

      <View style={{ paddingHorizontal: SPACE.lg, paddingBottom: SPACE.lg }}>
        {/* Dernière facture : la carte chevauche le bandeau (seule élévation). */}
        {lastSale ? (
          <Tap
            onPress={() => props.onOpenDetail?.(lastSale)}
            accessibilityLabel={`${t(l, "lastInvoice")} ${lastSale.invoice_number}, ${formatDateFr(
              lastSale.created_at,
            )}, ${statusText(l, lastSale)}, ${t(l, "remaining")} ${amount(
              lastSale.remaining_balance_minor,
            )}`}
            style={{
              marginTop: -24,
              backgroundColor: COLORS.cardBg,
              borderRadius: RADIUS.cardSm,
              padding: SPACE.md,
              flexDirection: flow(dir),
              alignItems: "center",
              gap: SPACE.md,
              ...HAIRLINE,
              ...SHADOW.card,
            }}
          >
            <IconBubble icon={statusIcon(lastSale)} color={sideColor(lastSale)} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.cardMuted, fontSize: 10, fontWeight: "800" }}>
                {t(l, "lastInvoice")}
              </Text>
              <Text
                style={{
                  color: COLORS.cardText,
                  fontSize: 15,
                  lineHeight: 20,
                  fontWeight: "800",
                  marginTop: 1,
                }}
                numberOfLines={1}
              >
                {lastSale.invoice_number}
              </Text>
              <Text style={{ color: COLORS.cardMuted, fontSize: 11 }} numberOfLines={1}>
                {formatDateFr(lastSale.created_at)} · {statusText(l, lastSale)}
              </Text>
            </View>
            <View style={{ alignItems: rtl ? "flex-start" : "flex-end", gap: 1 }}>
              <Text style={{ color: COLORS.cardMuted, fontSize: 10, fontWeight: "700" }}>
                {t(l, "remaining")}
              </Text>
              <Amount
                text={amount(lastSale.remaining_balance_minor)}
                tone={sideColor(lastSale)}
                size={SIZES.amountMd}
                align={farEdge(rtl)}
              />
            </View>
            <Icon
              name={rtl ? "chevron-back" : "chevron-forward"}
              size={14}
              color={COLORS.cardMuted}
            />
          </Tap>
        ) : null}

        <AnnouncementHero ads={h.announcements} lang={l} />

        {hasActivity ? (
          <>
            {/* Le mois en deux colonnes tactiles : achats / payés. */}
            <SectionHead
              title={t(l, "thisMonth")}
              caption={month !== "" ? month : undefined}
              dir={dir}
            />
            <View
              style={{
                flexDirection: flow(dir),
                backgroundColor: COLORS.cardBg,
                borderRadius: RADIUS.card,
                overflow: "hidden",
                ...HAIRLINE,
              }}
            >
              <Tap
                onPress={() => props.onOpenTab("invoices")}
                accessibilityLabel={`${t(l, "purchasesThisMonth")} ${amount(
                  h.monthPurchasesMinor,
                )}`}
                style={{ flex: 1, padding: SPACE.md, gap: 6, minHeight: 78 }}
              >
                <View style={{ flexDirection: flow(dir), alignItems: "center", gap: 6 }}>
                  <Icon name="receipt-outline" size={14} color={COLORS.cardMuted} />
                  <Text style={{ color: COLORS.cardMuted, fontSize: 11, fontWeight: "700" }}>
                    {t(l, "purchasesThisMonth")}
                  </Text>
                </View>
                <Amount text={amount(h.monthPurchasesMinor)} size={SIZES.amountMd} />
              </Tap>
              <View style={{ width: 1, backgroundColor: COLORS.divider }} />
              <Tap
                onPress={() => props.onOpenTab("payments")}
                accessibilityLabel={`${t(l, "paidThisMonth")} ${amount(h.monthPaymentsMinor)}`}
                style={{ flex: 1, padding: SPACE.md, gap: 6, minHeight: 78 }}
              >
                <View style={{ flexDirection: flow(dir), alignItems: "center", gap: 6 }}>
                  <Icon name="wallet-outline" size={14} color={COLORS.cardMuted} />
                  <Text style={{ color: COLORS.cardMuted, fontSize: 11, fontWeight: "700" }}>
                    {t(l, "paidThisMonth")}
                  </Text>
                </View>
                <Amount
                  text={amount(h.monthPaymentsMinor)}
                  tone={COLORS.debtOk}
                  size={SIZES.amountMd}
                />
              </Tap>
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
              <IconBubble
                icon="star-outline"
                color={COLORS.cardText}
                size={32}
                bg={COLORS.cardBg}
              />
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
              caption={`${t(l, "invoicesTotal")} · ${h.invoiceCount}`}
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
                      caption={`${formatDateFr(s.created_at)} · ${statusText(l, s)}`}
                      value={amount(s.remaining_balance_minor)}
                      valueTone={sideColor(s)}
                      icon={statusIcon(s)}
                      iconTone={sideColor(s)}
                      chevron
                      accessibilityLabel={`${s.invoice_number}, ${statusText(l, s)}, ${t(
                        l,
                        "remaining",
                      )} ${amount(s.remaining_balance_minor)}`}
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
                <EmptyState
                  icon="wallet-outline"
                  title={t(l, "noPayments")}
                  hint={t(l, "emptyHint")}
                />
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
          </>
        ) : (
          // Client sans activité : un accueil dédié, jamais une pile de vides.
          <Group style={{ marginTop: SPACE.lg }}>
            <EmptyState
              icon="storefront-outline"
              title={t(l, "welcomeTitle")}
              hint={t(l, "welcomeHint")}
            />
          </Group>
        )}
      </View>
    </ScrollView>
  );
}
