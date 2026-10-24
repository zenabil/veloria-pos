// Veloria Client — Écran 03 : factures V3 (en-tête dégradé + recherche pilule,
// puces de filtre, cartes statut, dépliage ticket puis page détail).
// Logique inchangée : filterInvoices + pagination 20 + report WhatsApp.
import { useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, GRADIENTS, RADIUS, SPACE, SIZES, tint } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { errorReportText, formatDateFr, formatMinor } from "../format.ts";
import { filterInvoices, type HomeInvoice, type InvoiceFilter } from "../views.ts";
import { Amount, Badge, Button, Card, Chip, Field, Tap, farEdge, flow } from "../ui/kit.tsx";
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
      {/* En-tête : titre + recherche */}
      <LinearGradient
        colors={GRADIENTS.heroDeep}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: SPACE.md, paddingTop: SPACE.sm, paddingBottom: SPACE.md }}
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
            style={{ color: COLORS.white, fontWeight: "900", fontSize: 22, letterSpacing: 0.3 }}
          >
            {t(l, "invoices")}
          </Text>
          <View
            style={{
              backgroundColor: tint(COLORS.primary, "26"),
              borderRadius: RADIUS.pill,
              paddingHorizontal: 10,
              paddingVertical: 4,
              flexDirection: flow(dir),
              gap: 4,
              alignItems: "center",
            }}
          >
            <Ionicons name="documents-outline" size={12} color={COLORS.primary} />
            <Text
              style={{
                color: COLORS.primary,
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
      </LinearGradient>

      {/* Puces de filtre */}
      <ScrollView
        ref={chipsRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={alignFirst}
        contentContainerStyle={{
          flexDirection: flow(dir),
          gap: SPACE.sm,
          paddingHorizontal: SPACE.md,
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
        <View style={{ flex: 1, justifyContent: "center" }}>
          <EmptyState icon="search-outline" title={t(l, "noInvoices")} hint={t(l, "emptyHint")} />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ paddingHorizontal: SPACE.md, paddingBottom: 110 }}
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
              <Card
                style={{
                  marginBottom: SPACE.sm,
                  padding: SPACE.md,
                  opacity: s.is_cancelled === 1 ? 0.78 : 1,
                }}
                raised={open}
              >
                <View
                  style={{
                    flexDirection: flow(dir),
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: SPACE.sm,
                  }}
                >
                  <View style={{ flexDirection: flow(dir), alignItems: "center", gap: 8 }}>
                    <Ionicons name={statusIcon(s)} size={18} color={tone} />
                    <Text
                      style={{
                        fontFamily: "monospace",
                        color: COLORS.cardText,
                        fontWeight: "800",
                        fontSize: 13,
                      }}
                    >
                      {t(l, "invoiceNo")} {s.invoice_number}
                    </Text>
                  </View>
                  <Badge label={invoiceStatusLabel(l, s)} color={tone} />
                </View>

                <Text style={{ color: COLORS.cardMuted, fontSize: 11, marginTop: 4 }}>
                  {formatDateFr(s.created_at)}
                </Text>

                <View
                  style={{
                    flexDirection: flow(dir),
                    justifyContent: "space-between",
                    marginTop: SPACE.sm,
                    backgroundColor: COLORS.contentBg,
                    borderRadius: RADIUS.inner,
                    padding: SPACE.sm,
                    gap: SPACE.sm,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.cardMuted, fontSize: 11 }}>{t(l, "total")}</Text>
                    <Amount text={amount(s.total_minor)} size={16} />
                  </View>
                  <View style={{ width: 1, backgroundColor: COLORS.border }} />
                  <View style={{ flex: 1, alignItems: rtl ? "flex-start" : "flex-end" }}>
                    <Text
                      style={{
                        color: COLORS.debtOverdue,
                        fontSize: 11,
                        textAlign: farEdge(rtl),
                      }}
                    >
                      {t(l, "remaining")}
                    </Text>
                    <Amount
                      text={
                        s.is_cancelled === 1 ? t(l, "cancelled") : amount(s.remaining_balance_minor)
                      }
                      size={16}
                      tone={COLORS.debtOverdue}
                      align={farEdge(rtl)}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: flow(dir), marginTop: SPACE.sm, gap: SPACE.sm }}>
                  <Button
                    label={t(l, "details")}
                    variant="outline"
                    icon={open ? "chevron-up" : "chevron-down"}
                    onPress={() => setOpenId(open ? null : s.id)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label={t(l, "reportError")}
                    variant="danger"
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
                    style={{ flex: 1.3 }}
                  />
                </View>

                {open ? (
                  <View
                    style={{
                      marginTop: SPACE.sm,
                      paddingTop: SPACE.sm,
                      borderTopWidth: 1,
                      borderTopColor: COLORS.border,
                      gap: SPACE.sm,
                    }}
                  >
                    <View style={{ flexDirection: flow(dir), gap: SPACE.sm }}>
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
                            backgroundColor: COLORS.contentBg,
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
                    <Text style={{ color: COLORS.cardMuted, fontSize: 11 }}>
                      {t(l, "status")}: {invoiceStatusLabel(l, s)} · {formatDateFr(s.created_at)}
                    </Text>
                    <Button
                      label={t(l, "receipt")}
                      variant="navy"
                      icon="receipt-outline"
                      onPress={() => props.onOpenDetail(s)}
                    />
                  </View>
                ) : null}
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}
