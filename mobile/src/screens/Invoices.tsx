// Veloria Client — Écran 03 : factures V4 « Daylight plat ».
// Bandeau d'encre plat (titre + compteur + recherche), puces de filtre à 40 dp
// jamais rognées aux bords, puis UNE surface : une ligne par facture (icône de
// statut, numéro Mono, date + statut, reste au bord extérieur, « détails » qui
// déplie le récapitulatif). Logique inchangée : filterInvoices + pagination 20
// + report WhatsApp + ancres de texte (script de captures).
import { useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, HAIRLINE, RADIUS, SPACE, SIZES } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { errorReportText, formatDateFr, formatMinor } from "../format.ts";
import { filterInvoices, type HomeInvoice, type InvoiceFilter } from "../views.ts";
import {
  Amount,
  Badge,
  Button,
  Chip,
  Divider,
  Field,
  IconBubble,
  Tap,
  farEdge,
  flow,
} from "../ui/kit.tsx";
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
  customerName: string;
  shopName: string;
  hidden: boolean;
  onOpenDetail: (row: HomeInvoice) => void;
  onReport: (text: string) => void;
  onRefresh: () => Promise<void>;
}): React.JSX.Element {
  const l = props.lang;
  const dir = direction(l);
  const rtl = dir === "rtl";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const [shown, setShown] = useState<number>(SIZES.pageSize);
  const [spinning, setSpinning] = useState(false);
  const rows = filterInvoices(props.rows, query, filter);
  const amount = (v: number): string => (props.hidden ? "•••" : formatMinor(v, l));

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
  // première hors écran. On recale donc sur la première puce (AR seulement,
  // FR inchangé) : au montage, à chaque contenu, et au changement de langue.
  const chipsRef = useRef<ScrollView>(null);
  const alignFirst = (): void => {
    if (rtl) chipsRef.current?.scrollToEnd({ animated: false });
  };
  useEffect(() => {
    if (!rtl) return;
    const id = setTimeout(() => chipsRef.current?.scrollToEnd({ animated: false }), 0);
    return () => clearTimeout(id);
  }, [rtl]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.contentBg }}>
      {/* En-tête plat : titre + compteur + recherche. */}
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
            marginBottom: SPACE.sm,
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
            <Ionicons name="documents-outline" size={12} color={COLORS.navyMuted} />
            <Text
              style={{
                color: COLORS.navyMuted,
                fontWeight: "800",
                fontSize: 12,
                fontFamily: "monospace",
              }}
            >
              {rows.length}
            </Text>
          </View>
        </View>
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
                <Ionicons name="close-circle" size={20} color={COLORS.cardMuted} />
              </Tap>
            ) : null
          }
        />
      </View>

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
        style={{ flexGrow: 0 }}
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
          <EmptyState icon="receipt-outline" title={t(l, "noInvoices")} hint={t(l, "emptyHint")} />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{
            paddingHorizontal: SPACE.lg,
            paddingBottom: SIZES.dockInset,
          }}
          data={rows.slice(0, shown)}
          keyExtractor={(s) => String(s.id)}
          initialNumToRender={20}
          onEndReachedThreshold={0.5}
          onEndReached={() => setShown((n) => n + SIZES.pageSize)}
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
            const open = openId === s.id;
            const tone = sideColor(s);
            return (
              <View
                style={{
                  backgroundColor: COLORS.cardBg,
                  borderRadius: RADIUS.cardSm,
                  marginBottom: SPACE.sm,
                  opacity: s.is_cancelled === 1 ? 0.72 : 1,
                  ...HAIRLINE,
                }}
              >
                <View
                  style={{
                    minHeight: SIZES.rowHeight,
                    flexDirection: flow(dir),
                    alignItems: "center",
                    gap: SPACE.md,
                    padding: SPACE.md,
                  }}
                >
                  <IconBubble icon={statusIcon(s)} color={tone} size={32} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        fontFamily: "monospace",
                        color: COLORS.cardText,
                        fontWeight: "800",
                        fontSize: 13,
                      }}
                      numberOfLines={1}
                    >
                      {t(l, "invoiceNo")} {s.invoice_number}
                    </Text>
                    <View
                      style={{
                        flexDirection: flow(dir),
                        alignItems: "center",
                        gap: SPACE.sm,
                      }}
                    >
                      <Text style={{ color: COLORS.cardMuted, fontSize: 11 }} numberOfLines={1}>
                        {formatDateFr(s.created_at)}
                      </Text>
                      <Badge label={invoiceStatusLabel(l, s)} color={tone} />
                    </View>
                  </View>
                  <View style={{ alignItems: rtl ? "flex-start" : "flex-end" }}>
                    <Amount
                      text={
                        s.is_cancelled === 1 ? t(l, "cancelled") : amount(s.remaining_balance_minor)
                      }
                      size={15}
                      tone={s.remaining_balance_minor > 0 ? tone : COLORS.cardText}
                      align={farEdge(rtl)}
                    />
                  </View>
                  {/* L'ancre « détails » reste textuelle (script de captures). */}
                  <Tap
                    onPress={() => setOpenId(open ? null : s.id)}
                    accessibilityLabel={t(l, "details")}
                    hitSlop={8}
                    style={{
                      flexDirection: flow(dir),
                      alignItems: "center",
                      gap: 2,
                      paddingVertical: 10,
                      paddingHorizontal: SPACE.xs,
                    }}
                  >
                    <Text style={{ color: COLORS.headerBg, fontWeight: "800", fontSize: 12 }}>
                      {t(l, "details")}
                    </Text>
                    <Ionicons
                      name={open ? "chevron-up" : "chevron-down"}
                      size={13}
                      color={COLORS.headerBg}
                    />
                  </Tap>
                </View>

                {open ? (
                  <View style={{ paddingHorizontal: SPACE.md, paddingBottom: SPACE.md }}>
                    <Divider />
                    <View style={{ flexDirection: flow(dir), gap: SPACE.sm, marginTop: SPACE.md }}>
                      {[
                        { k: t(l, "total"), v: amount(s.total_minor), c: COLORS.cardText },
                        { k: t(l, "paidAmount"), v: amount(s.amount_paid_minor), c: COLORS.debtOk },
                        {
                          k: t(l, "remaining"),
                          v: amount(s.remaining_balance_minor),
                          c: COLORS.debtOverdue,
                        },
                      ].map((cell) => (
                        <View
                          key={cell.k}
                          style={{
                            flex: 1,
                            backgroundColor: COLORS.toneBg,
                            borderRadius: RADIUS.inner,
                            padding: SPACE.sm,
                            gap: 2,
                          }}
                        >
                          <Text style={{ color: COLORS.cardMuted, fontSize: 11 }}>{cell.k}</Text>
                          <Amount text={cell.v} size={14} tone={cell.c} />
                        </View>
                      ))}
                    </View>
                    <Text style={{ color: COLORS.cardMuted, fontSize: 11, marginTop: SPACE.sm }}>
                      {t(l, "status")}: {invoiceStatusLabel(l, s)} · {formatDateFr(s.created_at)}
                    </Text>
                    <View
                      style={{
                        flexDirection: flow(dir),
                        gap: SPACE.sm,
                        marginTop: SPACE.md,
                      }}
                    >
                      <Button
                        label={t(l, "receipt")}
                        variant="ink"
                        icon="receipt-outline"
                        style={{ flex: 1.3 }}
                        onPress={() => props.onOpenDetail(s)}
                      />
                      <Button
                        label={t(l, "reportError")}
                        variant="quiet"
                        icon="flag-outline"
                        style={{ flex: 1 }}
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
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
