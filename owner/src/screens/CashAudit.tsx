// Veloria Owner — audit des caisses : Synthèse (totaux + session) ou Sessions.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { COLORS, RADIUS, SIZES, SPACE, TYPE } from "../tokens.ts";
import { formatDateShortFr, formatMinor, formatPercent, formatTime } from "../format.ts";
import type { CashSession, OwnerSnapshot } from "../store.ts";
import { Amount, Badge, Card, Chip, ReadOnlyNote, Segmented } from "../ui/kit.tsx";
import { Icon } from "../ui/Icon.tsx";
import { PageBar } from "../ui/nav.tsx";

type Filter = "all" | "gap" | "ok";

function varianceColor(v: number | null): string {
  if (v === null || v === 0) return COLORS.statusOk;
  return v < 0 ? COLORS.statusCritical : COLORS.statusWatch;
}

function varianceBadge(v: number | null): { label: string; color: string; bg: string } {
  if (v === null || v === 0)
    return { label: "Conforme", color: COLORS.statusOk, bg: COLORS.okTone };
  if (v < 0) return { label: "Manquant", color: COLORS.statusCritical, bg: COLORS.criticalTone };
  return { label: "Surplus", color: COLORS.statusWatch, bg: COLORS.watchTone };
}

function varianceText(v: number | null): string {
  if (v === null) return "—";
  return v > 0 ? `+${formatMinor(v)}` : formatMinor(v);
}

function SessionCard(props: { s: CashSession }): React.JSX.Element {
  const s = props.s;
  const badge = varianceBadge(s.varianceMinor);
  return (
    <Card padded={false} style={{ padding: SPACE.lg, gap: SPACE.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
        <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "800", flex: 1 }}>
          Session #{s.id}
        </Text>
        <Badge label={badge.label} color={badge.color} background={badge.bg} />
        <Amount
          text={varianceText(s.varianceMinor)}
          size={14}
          tone={varianceColor(s.varianceMinor)}
        />
      </View>
      <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
        {formatDateShortFr(s.openedAt)} · {s.label} · {s.operator} · {formatTime(s.openedAt)} –{" "}
        {s.closedAt ? formatTime(s.closedAt) : "—"}
      </Text>
      <View
        style={{
          backgroundColor: COLORS.toneBg,
          borderRadius: RADIUS.inner,
          padding: SPACE.md,
          flexDirection: "row",
          gap: SPACE.md,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Déclaré</Text>
          <Amount text={s.countedMinor === null ? "—" : formatMinor(s.countedMinor)} size={12} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Attendu</Text>
          <Amount text={s.expectedMinor === null ? "—" : formatMinor(s.expectedMinor)} size={12} />
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Écart</Text>
          <Amount
            text={varianceText(s.varianceMinor)}
            size={12}
            tone={varianceColor(s.varianceMinor)}
          />
        </View>
      </View>
      {s.note ? <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>{s.note}</Text> : null}
    </Card>
  );
}

export function CashAuditScreen(props: {
  snapshot: OwnerSnapshot;
  onBack: () => void;
}): React.JSX.Element {
  const [view, setView] = useState<"summary" | "sessions">("summary");
  const [filter, setFilter] = useState<Filter>("all");
  const money = props.snapshot.money;
  const audit = money.audit;
  const closed = money.sessions;
  const withGap = closed.filter((s) => (s.varianceMinor ?? 0) !== 0);
  const conform = closed.filter((s) => (s.varianceMinor ?? 0) === 0);
  const rows = filter === "gap" ? withGap : filter === "ok" ? conform : closed;
  const session = money.activeSession;

  return (
    <View style={{ flex: 1 }}>
      <PageBar
        title="Argent"
        onBack={props.onBack}
        badge={
          <Badge
            label="100 % Audité"
            color={COLORS.statusOk}
            dot={false}
            background={COLORS.okTone}
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
        <Text style={{ ...TYPE.title, color: COLORS.cardText }}>Audit des Caisses</Text>
        <Text style={{ ...TYPE.label, color: COLORS.cardMuted, marginTop: 2 }}>
          Journal inaltérable des ouvertures, clôtures & écarts
        </Text>

        <View style={{ marginTop: SPACE.md, marginBottom: SPACE.md }}>
          <Segmented
            options={[
              { value: "summary", label: "Synthèse" },
              { value: "sessions", label: `Sessions (${closed.length})` },
            ]}
            value={view}
            onChange={setView}
          />
        </View>

        {view === "summary" ? (
          <>
            <Card>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View>
                  <Text style={{ ...TYPE.badge, color: COLORS.cardMuted, letterSpacing: 0.6 }}>
                    FONDS MANIPULÉS (7 J)
                  </Text>
                  <Amount text={formatMinor(audit.fundsMinor)} size={26} style={{ marginTop: 4 }} />
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
                  <Icon name="business-outline" size={22} color={COLORS.primary} />
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.md }}>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.toneBg,
                    borderRadius: RADIUS.inner,
                    padding: SPACE.sm,
                  }}
                >
                  <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Écart cumulé</Text>
                  <Amount
                    text={varianceText(audit.varianceNetMinor)}
                    size={14}
                    tone={varianceColor(audit.varianceNetMinor)}
                  />
                </View>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.toneBg,
                    borderRadius: RADIUS.inner,
                    padding: SPACE.sm,
                  }}
                >
                  <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Conformité</Text>
                  <Text style={{ ...TYPE.bodySm, color: COLORS.statusOk, fontWeight: "800" }}>
                    {formatPercent(audit.conformityPercent, 2)}
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.toneBg,
                    borderRadius: RADIUS.inner,
                    padding: SPACE.sm,
                  }}
                >
                  <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Caisses actives</Text>
                  <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "800" }}>
                    {audit.activeRegisters}
                  </Text>
                </View>
              </View>
            </Card>

            {session ? (
              <>
                <View
                  style={{
                    backgroundColor: COLORS.headerBg,
                    borderTopLeftRadius: RADIUS.card,
                    borderTopRightRadius: RADIUS.card,
                    paddingHorizontal: SPACE.lg,
                    paddingVertical: SPACE.md,
                    marginTop: SPACE.lg,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: COLORS.primary,
                    }}
                  />
                  <Text
                    style={{
                      color: COLORS.headerText,
                      ...TYPE.bodySm,
                      fontWeight: "700",
                      flex: 1,
                      marginLeft: SPACE.sm,
                    }}
                  >
                    Session active #{session.id}
                  </Text>
                  <Badge
                    label="EN DIRECT"
                    color={COLORS.primary}
                    dot={false}
                    background={COLORS.navySoft}
                  />
                </View>
                <Card
                  padded={false}
                  style={{
                    padding: SPACE.lg,
                    gap: SPACE.sm,
                    borderTopLeftRadius: 0,
                    borderTopRightRadius: 0,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        backgroundColor: COLORS.sunkenBg,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "800", color: COLORS.cardMuted }}>
                        YB
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "700" }}>
                        {session.label} • {session.operator}
                      </Text>
                      <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                        {session.post} • Ouvert {formatTime(session.openedAt)}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: SPACE.sm }}>
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: COLORS.toneBg,
                        borderRadius: RADIUS.inner,
                        padding: SPACE.sm,
                      }}
                    >
                      <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Attendu</Text>
                      <Amount text={formatMinor(session.expectedMinor ?? 0)} size={12} />
                    </View>
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: COLORS.toneBg,
                        borderRadius: RADIUS.inner,
                        padding: SPACE.sm,
                      }}
                    >
                      <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Comptage</Text>
                      <Amount text={formatMinor(session.countedMinor ?? 0)} size={12} />
                    </View>
                  </View>
                  <View
                    style={{
                      backgroundColor: COLORS.watchTone,
                      borderRadius: RADIUS.inner,
                      padding: SPACE.md,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ ...TYPE.label, color: COLORS.statusWatch }}>
                      Écart provisoire
                    </Text>
                    <Amount
                      text={varianceText(session.varianceMinor)}
                      size={12}
                      tone={COLORS.statusWatch}
                    />
                  </View>
                </Card>
              </>
            ) : null}
          </>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: SPACE.sm, marginBottom: SPACE.md }}>
              <Chip
                label="Toutes"
                count={closed.length}
                active={filter === "all"}
                onPress={() => setFilter("all")}
              />
              <Chip
                label="Écart"
                count={withGap.length}
                active={filter === "gap"}
                onPress={() => setFilter("gap")}
                icon="ellipse"
                tone={COLORS.statusCritical}
              />
              <Chip
                label="Conformes"
                count={conform.length}
                active={filter === "ok"}
                onPress={() => setFilter("ok")}
                icon="ellipse"
                tone={COLORS.statusOk}
              />
            </View>
            <View style={{ gap: SPACE.md }}>
              {rows.map((s) => (
                <SessionCard key={s.id} s={s} />
              ))}
              {rows.length === 0 ? (
                <Card>
                  <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted, textAlign: "center" }}>
                    Aucune session ne correspond à ce filtre.
                  </Text>
                </Card>
              ) : null}
            </View>
          </>
        )}

        <ReadOnlyNote text="Journal d'audit Veloria POS — consultation sécurisée, lecture seule" />
      </ScrollView>
    </View>
  );
}
