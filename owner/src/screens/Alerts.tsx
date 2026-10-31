// Veloria Owner — Alertes : trois vues courtes (Stock, Créances, Système).
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { COLORS, RADIUS, SIZES, SPACE, TYPE } from "../tokens.ts";
import { formatDateShortFr, formatMinor, formatTime } from "../format.ts";
import type { OwnerSnapshot } from "../store.ts";
import { Amount, Badge, Card, Divider, Group, ReadOnlyNote, Segmented, Tap } from "../ui/kit.tsx";
import { Icon } from "../ui/Icon.tsx";

type AlertsView = "stock" | "debts" | "system";

export function AlertsScreen(props: {
  snapshot: OwnerSnapshot;
  onOpenProduct: (id: string) => void;
  onOpenDebtor: (id: string) => void;
}): React.JSX.Element {
  const [view, setView] = useState<AlertsView>("stock");
  const a = props.snapshot.alerts;
  const stockCritical = a.stock.filter((s) => s.severity === "critical").length;
  const stockWatch = a.stock.length - stockCritical;
  const estimatedLoss = a.stock.reduce((acc, s) => acc + (s.lossPerDayMinor ?? 0), 0);
  const criticalDebts = a.debts.filter((d) => d.lateDays > 60).length;

  return (
    <ScrollView
      contentContainerStyle={{ padding: SPACE.lg, paddingBottom: SIZES.dockInset + SPACE.lg }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          backgroundColor: COLORS.headerBg,
          borderRadius: RADIUS.card,
          padding: SPACE.lg,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Badge
            label="Lecture seule"
            color={COLORS.navyMuted}
            icon="lock-closed-outline"
            dot={false}
            background={COLORS.onNavyChip}
          />
        </View>
        <Text style={{ color: COLORS.headerText, ...TYPE.headline, marginTop: 2 }}>
          {a.anomaliesTitle}
        </Text>
        <Text style={{ color: COLORS.navyMuted, ...TYPE.label }}>{a.anomaliesDetail}</Text>
        <View style={{ flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.md }}>
          {[
            { n: a.critical, label: "Critiques", color: COLORS.statusCritical },
            { n: a.watch, label: "Vigilance", color: COLORS.statusWatch },
            { n: a.ok, label: "Conformes", color: COLORS.statusOk },
          ].map((t) => (
            <View
              key={t.label}
              style={{
                flex: 1,
                backgroundColor: COLORS.navySoft,
                borderRadius: RADIUS.inner,
                borderWidth: 1,
                borderColor: COLORS.navyLine,
                paddingVertical: SPACE.sm,
                alignItems: "center",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.color }} />
                <Text style={{ color: COLORS.headerText, fontWeight: "800", fontSize: 15 }}>
                  {t.n}
                </Text>
              </View>
              <Text style={{ color: COLORS.navyMuted, fontSize: 11 }}>{t.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ marginTop: SPACE.md, marginBottom: SPACE.md }}>
        <Segmented
          options={[
            { value: "stock", label: `Stock (${a.stock.length})` },
            { value: "debts", label: `Créances (${a.debts.length})` },
            { value: "system", label: "Système" },
          ]}
          value={view}
          onChange={setView}
        />
      </View>

      {view === "stock" ? (
        <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: SPACE.sm,
              backgroundColor: COLORS.toneBg,
              borderRadius: RADIUS.control,
              paddingHorizontal: SPACE.md,
              paddingVertical: SPACE.sm,
              marginBottom: SPACE.md,
            }}
          >
            <Text style={{ ...TYPE.label, color: COLORS.cardMuted, flex: 1 }}>
              {stockCritical} rupture{stockCritical > 1 ? "s" : ""} · {stockWatch} sous seuil
            </Text>
            {estimatedLoss > 0 ? (
              <Text style={{ ...TYPE.label, color: COLORS.statusCritical, fontWeight: "700" }}>
                Perte ~{formatMinor(estimatedLoss)}/j
              </Text>
            ) : null}
          </View>
          <Group>
            {a.stock.length === 0 ? (
              <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted, padding: SPACE.lg }}>
                Aucune alerte de stock publiée.
              </Text>
            ) : null}
            {a.stock.map((s, i) => (
              <View key={s.id}>
                {i > 0 ? <Divider inset={SPACE.lg} /> : null}
                <Tap onPress={() => props.onOpenProduct(s.productId)} accessibilityLabel={s.name}>
                  <View style={{ paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor:
                            s.severity === "critical" ? COLORS.statusCritical : COLORS.statusWatch,
                        }}
                      />
                      <Text
                        style={{
                          ...TYPE.bodySm,
                          color: COLORS.cardText,
                          fontWeight: "700",
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        {s.name}
                      </Text>
                      <Badge
                        label={`REF-${s.ref}`}
                        color={COLORS.cardMuted}
                        dot={false}
                        background={COLORS.sunkenBg}
                      />
                      <Icon name="chevron-forward" size={15} color={COLORS.cardMuted} />
                    </View>
                    <Text
                      style={{
                        ...TYPE.bodySm,
                        color:
                          s.severity === "critical" ? COLORS.statusCritical : COLORS.statusWatch,
                        fontWeight: "700",
                      }}
                    >
                      {s.headline}
                    </Text>
                    <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>{s.detail}</Text>
                  </View>
                </Tap>
              </View>
            ))}
          </Group>
        </>
      ) : null}

      {view === "debts" ? (
        <>
          <Card tone={COLORS.criticalTone}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text style={{ ...TYPE.badge, color: COLORS.criticalText, letterSpacing: 0.6 }}>
                ENCOURS CRITIQUE TOTAL
              </Text>
              <Icon name="calendar-outline" size={18} color={COLORS.criticalText} />
            </View>
            <Amount
              text={formatMinor(props.snapshot.money.debts.overdueMinor)}
              size={26}
              tone={COLORS.statusCritical}
              style={{ marginTop: 4 }}
            />
            <Text style={{ ...TYPE.label, color: COLORS.criticalText, marginTop: 4 }}>
              {criticalDebts} dossier{criticalDebts > 1 ? "s" : ""} au-delà de 60 jours
            </Text>
          </Card>
          <Group style={{ marginTop: SPACE.md }}>
            {a.debts.length === 0 ? (
              <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted, padding: SPACE.lg }}>
                Aucune créance en souffrance.
              </Text>
            ) : null}
            {a.debts.map((d, i) => (
              <View key={d.debtorId}>
                {i > 0 ? <Divider inset={SPACE.lg} /> : null}
                <Tap onPress={() => props.onOpenDebtor(d.debtorId)} accessibilityLabel={d.name}>
                  <View style={{ paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: COLORS.statusCritical,
                        }}
                      />
                      <Text
                        style={{
                          ...TYPE.bodySm,
                          color: COLORS.cardText,
                          fontWeight: "700",
                          flex: 1,
                        }}
                      >
                        {d.name}
                      </Text>
                      <Badge
                        label={`#${d.ref}`}
                        color={COLORS.cardMuted}
                        dot={false}
                        background={COLORS.sunkenBg}
                      />
                      <Icon name="chevron-forward" size={15} color={COLORS.cardMuted} />
                    </View>
                    <Text
                      style={{ ...TYPE.label, color: COLORS.statusCritical, fontWeight: "700" }}
                    >
                      Retard de {d.lateDays} jours (
                      {d.lateDays > 60 ? "+60 j critique" : "échéance dépassée"})
                    </Text>
                    <Amount text={formatMinor(d.remainingMinor)} size={15} />
                  </View>
                </Tap>
              </View>
            ))}
          </Group>
        </>
      ) : null}

      {view === "system" ? (
        <>
          <Card padded={false}>
            {a.system.map((s, i) => (
              <View
                key={s.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACE.md,
                  paddingHorizontal: SPACE.lg,
                  paddingVertical: SPACE.md,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: COLORS.divider,
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor:
                      s.state === "ok"
                        ? COLORS.statusOk
                        : s.state === "watch"
                          ? COLORS.statusWatch
                          : COLORS.statusCritical,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "700" }}>
                    {s.label}
                  </Text>
                  <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>{s.detail}</Text>
                  {s.at ? (
                    <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                      Dernier contrôle : {formatTime(s.at)}
                    </Text>
                  ) : null}
                </View>
                <Icon name="checkmark-circle-outline" size={20} color={COLORS.statusOk} />
              </View>
            ))}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: SPACE.md,
                paddingHorizontal: SPACE.lg,
                paddingVertical: SPACE.md,
                borderTopWidth: 1,
                borderTopColor: COLORS.divider,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: COLORS.statusOk,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "700" }}>
                  Dernier inventaire physique
                </Text>
                <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                  {props.snapshot.stock.lastInventoryAt
                    ? formatDateShortFr(props.snapshot.stock.lastInventoryAt)
                    : "—"}
                </Text>
              </View>
              <Icon name="checkmark-circle-outline" size={20} color={COLORS.statusOk} />
            </View>
          </Card>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: COLORS.toneBg,
              borderRadius: RADIUS.control,
              paddingHorizontal: SPACE.lg,
              paddingVertical: SPACE.md,
              marginTop: SPACE.md,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
              <Icon name="shield-outline" size={16} color={COLORS.cardMuted} />
              <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                Journal d'audit Veloria POS
              </Text>
            </View>
            <Badge label="RO" color={COLORS.cardMuted} dot={false} background={COLORS.sunkenBg} />
          </View>
        </>
      ) : null}

      <ReadOnlyNote text="Supervision en lecture seule — aucune action correctrice depuis ce terminal" />
    </ScrollView>
  );
}
