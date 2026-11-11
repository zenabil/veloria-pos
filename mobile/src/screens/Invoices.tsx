// Veloria Client — Écran 03 : factures V5 « panneau unique ».
// Bandeau d'encre (titre + compteur + dette restante + recherche), puces de
// filtre, puis UN panneau blanc à filets : une ligne par facture, tactile de
// bout en bout (statut, numéro, date, reste, « détails »). Le détail complet
// vit dans l'écran dédié (totaux, reçu, signalement) — plus d'accordéon dupliqué.
// Logique inchangée : filterInvoices + pagination 20 + refresh.
import { useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import { Icon } from "../ui/Icon.tsx";
import { COLORS, FONTS, HAIRLINE, RADIUS, SPACE, SIZES } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { formatDateFr, formatMinor } from "../format.ts";
import { filterInvoices, type HomeInvoice, type InvoiceFilter } from "../views.ts";
import { Amount, Badge, Chip, Divider, Field, IconBubble, Tap, farEdge, flow } from "../ui/kit.tsx";
import { EmptyState } from "../ui/states.tsx";

const CHIPS: InvoiceFilter[] = ["all", "paid", "partial", "unpaid", "cancelled"];

function sideColor(s: HomeInvoice): string {
  if (s.is_cancelled === 1) return COLORS.cardMuted;
  if (s.payment_status === "paid") return COLORS.debtOk;
  if (s.payment_status === "partial") return COLORS.debtDue;
  return COLORS.debtOverdue;
}

function invoiceStatusLabel(l: Lang, s: HomeInvoice): string {
  if (s.is_cancelled === 1) return t(l, "cancelled");
  if (s.payment_status === "paid") return t(l, "paid");
  if (s.payment_status === "partial") return t(l, "partial");
  return t(l, "unpaid");
}

function statusIcon(s: HomeInvoice): "checkmark-circle" | "time" | "close-circle" | "alert-circle" {
  if (s.is_cancelled === 1) return "close-circle";
  if (s.payment_status === "paid") return "checkmark-circle";
  if (s.payment_status === "partial") return "time";
  return "alert-circle";
}

export function InvoicesScreen(props: {
  lang: Lang;
  rows: HomeInvoice[];
  hidden: boolean;
  onOpenDetail: (row: HomeInvoice) => void;
  onRefresh: () => Promise<void>;
  /** Rendu sous un contrôle segmenté : l'en-tête d'encre est masqué. */
  embedded?: boolean;
}): React.JSX.Element {
  const l = props.lang;
  const dir = direction(l);
  const rtl = dir === "rtl";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [shown, setShown] = useState<number>(SIZES.pageSize);
  const [spinning, setSpinning] = useState(false);
  const rows = filterInvoices(props.rows, query, filter);
  const amount = (v: number): string => (props.hidden ? "•••" : formatMinor(v, l));
  // Dette restante = somme des factures vivantes (même périmètre que l'accueil).
  const liveRemaining = props.rows
    .filter((s) => s.is_cancelled !== 1)
    .reduce((a, s) => a + s.remaining_balance_minor, 0);

  const chipLabel = (f: InvoiceFilter): string =>
    f === "all"
      ? t(l, "all")
      : f === "paid"
        ? t(l, "paid")
        : f === "partial"
          ? t(l, "partial")
          : f === "unpaid"
            ? t(l, "unpaid")
            : t(l, "cancelled");

  const counts = (f: InvoiceFilter): number => filterInvoices(props.rows, query, f).length;

  // RTL : le contenu en `row-reverse` commence à droite alors que le défilement
  // natif repose à gauche → la bande s'afficherait sur la DERNIÈRE puce avec la
  // première hors écran. On recale donc sur la première puce (AR seulement).
  const chipsRef = useRef<ScrollView>(null);
  const alignFirst = (): void => {
    if (rtl) chipsRef.current?.scrollToEnd({ animated: false });
  };
  useEffect(() => {
    if (!rtl) return;
    const id = setTimeout(() => chipsRef.current?.scrollToEnd({ animated: false }), 0);
    return () => clearTimeout(id);
  }, [rtl]);

  const noResult = props.rows.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.contentBg }}>
      {/* En-tête : titre, compteur filtré, dette restante, recherche. */}
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
              {t(l, "invoices")}
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
              <Icon name="documents-outline" size={12} color={COLORS.navyMuted} />
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
          <Text style={{ color: COLORS.navyMuted, fontSize: 11, marginTop: 2 }}>
            {t(l, "debtRemaining")} · {amount(liveRemaining)}
          </Text>
          <View style={{ marginTop: SPACE.sm }}>
            <Field
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                setShown(SIZES.pageSize);
              }}
              placeholder={t(l, "searchInvoice")}
              ariaLabel={t(l, "searchInvoice")}
              lang={l}
              icon="search-outline"
              mono={false}
              returnKeyType="search"
              trailing={
                query !== "" ? (
                  <Tap
                    onPress={() => setQuery("")}
                    accessibilityLabel={t(l, "close")}
                    hitSlop={16}
                    style={{ padding: 12 }}
                  >
                    <Icon name="close-circle" size={20} color={COLORS.cardMuted} />
                  </Tap>
                ) : null
              }
            />
          </View>
        </View>
      )}
      {/* Puces de filtre : 40 dp, marge d'écran conservée aux deux bords. */}
      <ScrollView
        ref={chipsRef}
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
        {CHIPS.map((f) => (
          <Chip
            key={f}
            label={chipLabel(f)}
            count={counts(f)}
            active={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </ScrollView>
      {rows.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", paddingVertical: SPACE.xxl }}>
          <EmptyState
            icon="receipt-outline"
            title={noResult ? t(l, "noResults") : t(l, "noInvoices")}
            hint={noResult ? t(l, "noResultsHint") : t(l, "emptyHint")}
          />
        </View>
      ) : (
        // Un seul panneau à filets : la liste ne fabrique plus une carte par ligne.
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
            data={rows.slice(0, shown)}
            keyExtractor={(s) => String(s.id)}
            initialNumToRender={20}
            onEndReachedThreshold={0.5}
            onEndReached={() => setShown((n) => n + SIZES.pageSize)}
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
            renderItem={({ item: s }) => {
              const tone = sideColor(s);
              const remaining = amount(s.remaining_balance_minor);
              return (
                <Tap
                  onPress={() => props.onOpenDetail(s)}
                  accessibilityLabel={`${s.invoice_number}, ${invoiceStatusLabel(
                    l,
                    s,
                  )}, ${t(l, "remaining")} ${remaining}`}
                  style={{
                    minHeight: 68,
                    flexDirection: flow(dir),
                    alignItems: "center",
                    gap: SPACE.md,
                    paddingHorizontal: SPACE.md,
                    paddingVertical: SPACE.sm,
                    backgroundColor: COLORS.cardBg,
                    opacity: s.is_cancelled === 1 ? 0.72 : 1,
                  }}
                >
                  <IconBubble icon={statusIcon(s)} color={tone} size={34} />
                  <View style={{ flex: 1, gap: 4 }}>
                    {/* Ligne 1 : numéro + reste (toute la largeur utile). */}
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
                        {s.invoice_number}
                      </Text>
                      <View style={{ flexDirection: flow(dir), alignItems: "center", gap: 6 }}>
                        <Text style={{ color: COLORS.cardMuted, fontSize: 10, fontWeight: "700" }}>
                          {t(l, "remaining")}
                        </Text>
                        <Amount text={remaining} size={15} tone={tone} align={farEdge(rtl)} />
                      </View>
                    </View>
                    {/* Ligne 2 : date + statut, puis l'ancre « détails ». */}
                    <View
                      style={{
                        flexDirection: flow(dir),
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: SPACE.sm,
                      }}
                    >
                      <View
                        style={{ flexDirection: flow(dir), alignItems: "center", gap: SPACE.sm }}
                      >
                        <Text style={{ color: COLORS.cardMuted, fontSize: 11 }}>
                          {formatDateFr(s.created_at)}
                        </Text>
                        <Badge label={invoiceStatusLabel(l, s)} color={tone} />
                      </View>
                      <View style={{ flexDirection: flow(dir), alignItems: "center", gap: 2 }}>
                        <Text style={{ color: COLORS.headerBg, fontWeight: "800", fontSize: 11 }}>
                          {t(l, "details")}
                        </Text>
                        <Icon
                          name={rtl ? "chevron-back" : "chevron-forward"}
                          size={13}
                          color={COLORS.headerBg}
                        />
                      </View>
                    </View>
                  </View>
                </Tap>
              );
            }}
          />
        </View>
      )}
    </View>
  );
}
