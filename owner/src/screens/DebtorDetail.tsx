// Veloria Owner — fiche client : deux vues courtes (Encours, Factures).
import { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { COLORS, RADIUS, SIZES, SPACE, TYPE } from "../tokens.ts";
import { formatDateFr, formatDateShortFr, formatMinor } from "../format.ts";
import type { Debtor } from "../store.ts";
import {
  Amount,
  Badge,
  Button,
  Card,
  Group,
  ProgressBar,
  ReadOnlyNote,
  Segmented,
} from "../ui/kit.tsx";
import { Icon } from "../ui/Icon.tsx";
import { PageBar } from "../ui/nav.tsx";

function phoneLabel(raw: string): string {
  const digits = raw.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+213") && digits.length === 13) {
    return `+213 ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)} ${digits.slice(11)}`;
  }
  return digits;
}

export function DebtorDetailScreen(props: {
  debtor: Debtor;
  onBack: () => void;
}): React.JSX.Element {
  const [view, setView] = useState<"outstanding" | "invoices">("outstanding");
  const d = props.debtor;
  const agingTotal = d.aging.d0to30Minor + d.aging.d31to60Minor + d.aging.d60plusMinor;
  const pct = (v: number): number => (agingTotal > 0 ? Math.round((v / agingTotal) * 100) : 0);
  const limitPct =
    d.limitMinor && d.limitMinor > 0 ? Math.round((d.totalMinor / d.limitMinor) * 100) : null;
  const phone = phoneLabel(d.phone);

  return (
    <View style={{ flex: 1 }}>
      <PageBar
        title="Créances"
        onBack={props.onBack}
        badge={
          <Badge
            label={
              d.lateDays > 60 ? `Retard critique (${d.lateDays} j)` : `Retard (${d.lateDays} j)`
            }
            color={COLORS.statusCritical}
            background={COLORS.criticalTone}
          />
        }
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: SPACE.lg,
          paddingBottom: SIZES.dockInset + SPACE.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                {d.code} · {d.segment}
              </Text>
              <Text style={{ ...TYPE.title, color: COLORS.cardText, marginTop: 2 }}>{d.name}</Text>
              {d.manager ? (
                <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted }}>
                  {d.manager} (Gérant)
                </Text>
              ) : null}
              <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, marginTop: 2 }}>{phone}</Text>
            </View>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: RADIUS.control,
                backgroundColor: COLORS.headerBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="storefront-outline" size={22} color={COLORS.primary} />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.md }}>
            <Button
              label="Appeler"
              icon="call-outline"
              style={{ flex: 1 }}
              onPress={() => void Linking.openURL(`tel:${d.phone}`)}
            />
            <Button
              label="WhatsApp"
              variant="quiet"
              icon="chatbubble-ellipses-outline"
              style={{ flex: 1 }}
              onPress={() =>
                void Linking.openURL(`https://wa.me/${d.phone.replace(/[^0-9]/g, "")}`)
              }
            />
          </View>
        </Card>

        <View style={{ marginTop: SPACE.md, marginBottom: SPACE.md }}>
          <Segmented
            options={[
              { value: "outstanding", label: "Encours" },
              { value: "invoices", label: `Factures (${d.invoices.length})` },
            ]}
            value={view}
            onChange={setView}
          />
        </View>

        {view === "outstanding" ? (
          <>
            <Card>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted }}>
                  Encours global exigible
                </Text>
                <Badge
                  label="Exigible"
                  color={COLORS.statusCritical}
                  dot={false}
                  background={COLORS.criticalTone}
                />
              </View>
              <Amount text={formatMinor(d.totalMinor)} size={28} style={{ marginTop: 4 }} />

              {d.limitMinor && limitPct !== null ? (
                <View
                  style={{
                    backgroundColor: COLORS.toneBg,
                    borderRadius: RADIUS.inner,
                    padding: SPACE.md,
                    marginTop: SPACE.md,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ ...TYPE.bodySm, color: COLORS.cardText }}>
                      Plafond : {formatMinor(d.limitMinor)}
                    </Text>
                    <Text
                      style={{ ...TYPE.bodySm, color: COLORS.statusCritical, fontWeight: "700" }}
                    >
                      {limitPct} % consommé
                    </Text>
                  </View>
                  <View style={{ marginTop: SPACE.sm }}>
                    <ProgressBar
                      percent={limitPct}
                      color={COLORS.statusCritical}
                      track={COLORS.cardBg}
                    />
                  </View>
                </View>
              ) : null}

              {d.lastPaymentMinor !== null && d.lastPaymentAt ? (
                <View
                  style={{
                    backgroundColor: COLORS.toneBg,
                    borderRadius: RADIUS.inner,
                    padding: SPACE.md,
                    marginTop: SPACE.sm,
                    flexDirection: "row",
                    gap: SPACE.sm,
                  }}
                >
                  <Icon name="ribbon-outline" size={17} color={COLORS.statusWatch} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...TYPE.badge, color: COLORS.cardMuted, letterSpacing: 0.6 }}>
                      DERNIER ENCAISSEMENT
                    </Text>
                    <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, marginTop: 2 }}>
                      <Text style={{ fontWeight: "800" }}>{formatMinor(d.lastPaymentMinor)}</Text>{" "}
                      reçu le {formatDateShortFr(d.lastPaymentAt)}
                    </Text>
                    {d.lastPaymentNote ? (
                      <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                        {d.lastPaymentNote}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </Card>

            <Card style={{ marginTop: SPACE.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ ...TYPE.headlineSm, color: COLORS.cardText }}>
                  Ancienneté des créances
                </Text>
                <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>3 tranches</Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  height: 8,
                  borderRadius: RADIUS.pill,
                  overflow: "hidden",
                  marginTop: SPACE.md,
                }}
              >
                {[
                  { pct: pct(d.aging.d0to30Minor), color: "#A8C0DE" },
                  { pct: pct(d.aging.d31to60Minor), color: COLORS.primary },
                  { pct: pct(d.aging.d60plusMinor), color: COLORS.statusCritical },
                ].map((seg, i) => (
                  <View key={i} style={{ width: `${seg.pct}%`, backgroundColor: seg.color }} />
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.md }}>
                {[
                  {
                    label: "0–30 j",
                    value: d.aging.d0to30Minor,
                    tone: "#DCE7F5",
                    ink: COLORS.cardText,
                    tag: "Sain",
                  },
                  {
                    label: "31–60 j",
                    value: d.aging.d31to60Minor,
                    tone: COLORS.watchTone,
                    ink: COLORS.statusWatch,
                    tag: "Échu",
                  },
                  {
                    label: "+60 j",
                    value: d.aging.d60plusMinor,
                    tone: COLORS.criticalTone,
                    ink: COLORS.statusCritical,
                    tag: "Contentieux",
                  },
                ].map((t) => (
                  <View
                    key={t.label}
                    style={{
                      flex: 1,
                      backgroundColor: t.tone,
                      borderRadius: RADIUS.inner,
                      padding: SPACE.sm,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <View
                        style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.ink }}
                      />
                      <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>{t.label}</Text>
                    </View>
                    <Amount text={formatMinor(t.value)} size={12} style={{ marginTop: 4 }} />
                    <Text style={{ ...TYPE.label, color: t.ink }}>
                      {pct(t.value)} % · {t.tag}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </>
        ) : (
          <Group>
            {d.invoices.map((inv, i) => (
              <View
                key={inv.ref}
                style={{
                  padding: SPACE.lg,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: COLORS.divider,
                  gap: SPACE.sm,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
                  <Text
                    style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "800", flex: 1 }}
                  >
                    #{inv.ref}
                  </Text>
                  <Badge
                    label={`Retard ${inv.lateDays} j`}
                    color={inv.lateDays > 60 ? COLORS.statusCritical : COLORS.statusWatch}
                    dot={false}
                    background={inv.lateDays > 60 ? COLORS.criticalTone : COLORS.watchTone}
                  />
                </View>
                <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                  Émise le {formatDateFr(inv.issuedAt)} · Échéance {formatDateFr(inv.dueAt)}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: COLORS.toneBg,
                    borderRadius: RADIUS.inner,
                    padding: SPACE.md,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Total</Text>
                    <Amount text={formatMinor(inv.totalMinor)} size={13} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Acompte</Text>
                    <Amount text={formatMinor(inv.depositMinor)} size={13} />
                  </View>
                  <View style={{ flex: 1.2, alignItems: "flex-end" }}>
                    <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Reste dû</Text>
                    <Amount text={formatMinor(inv.remainingMinor)} size={14} />
                  </View>
                </View>
              </View>
            ))}
          </Group>
        )}

        <ReadOnlyNote text="Mode consultation sécurisée — Données certifiées Veloria POS. Aucune modification comptable autorisée sur cette interface mobile." />
      </ScrollView>
    </View>
  );
}
