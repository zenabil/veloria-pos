// Veloria Owner — fiche produit : Synthèse (stock, valeur, marge) ou Mouvements.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { COLORS, RADIUS, SIZES, SPACE, TYPE } from "../tokens.ts";
import {
  formatDateShortFr,
  formatMinor,
  formatPercent,
  formatQuantity,
  formatTime,
} from "../format.ts";
import { productStatus, type MovementKind, type Product } from "../store.ts";
import {
  Amount,
  Badge,
  Card,
  Divider,
  Group,
  IconBubble,
  ProgressBar,
  ReadOnlyNote,
  Segmented,
} from "../ui/kit.tsx";
import { Icon, type IconName } from "../ui/Icon.tsx";
import { PageBar } from "../ui/nav.tsx";

const STATUS_TEXT: Record<"ok" | "low" | "out", { label: string; color: string; bg: string }> = {
  ok: { label: "En stock", color: COLORS.statusOk, bg: COLORS.okTone },
  low: { label: "Rupture imminente", color: COLORS.statusWatch, bg: COLORS.watchTone },
  out: { label: "Rupture totale", color: COLORS.statusCritical, bg: COLORS.criticalTone },
};

const MOVE_ICON: Record<MovementKind, IconName> = {
  vente: "arrow-up-outline",
  retour: "refresh-outline",
  inventaire: "swap-horizontal-outline",
  reception: "arrow-down-outline",
};

const MOVE_TONE: Record<MovementKind, string> = {
  vente: COLORS.cardText,
  retour: COLORS.statusOk,
  inventaire: COLORS.statusWatch,
  reception: COLORS.statusOk,
};

export function ProductDetailScreen(props: {
  product: Product;
  onBack: () => void;
}): React.JSX.Element {
  const [view, setView] = useState<"summary" | "movements">("summary");
  const p = props.product;
  const status = STATUS_TEXT[productStatus(p)];
  const thresholdPct = p.minLevel > 0 ? Math.round((p.quantity / p.minLevel) * 100) : 0;

  return (
    <View style={{ flex: 1 }}>
      <PageBar
        title="Stock"
        onBack={props.onBack}
        badge={<Badge label={status.label} color={status.color} background={status.bg} />}
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: SPACE.lg,
          paddingBottom: SIZES.dockInset + SPACE.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <View style={{ flexDirection: "row", gap: SPACE.md }}>
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: RADIUS.inner,
                backgroundColor: COLORS.sunkenBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="flask-outline" size={24} color={COLORS.cardMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ ...TYPE.badge, color: COLORS.cardMuted }}>
                REF-{p.ref}
                {p.ean ? ` · EAN ${p.ean}` : ""}
              </Text>
              <Text style={{ ...TYPE.headline, color: COLORS.cardText, marginTop: 2 }}>
                {p.name}
              </Text>
              <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>{p.subtitle}</Text>
            </View>
          </View>
        </Card>

        <View style={{ marginTop: SPACE.md, marginBottom: SPACE.md }}>
          <Segmented
            options={[
              { value: "summary", label: "Synthèse" },
              { value: "movements", label: `Mouvements (${p.movements.length})` },
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
                  backgroundColor: status.bg,
                  borderRadius: RADIUS.inner,
                  padding: SPACE.md,
                  gap: SPACE.sm,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon name="warning-outline" size={15} color={status.color} />
                  <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, flex: 1 }}>
                    Disponibilité magasin{" "}
                    <Text style={{ color: status.color, fontWeight: "800" }}>
                      {formatQuantity(p.quantity, p.unit.singular, p.unit.plural)}
                    </Text>
                  </Text>
                </View>
                <ProgressBar
                  percent={thresholdPct}
                  color={status.color}
                  track={COLORS.cardBg}
                  height={6}
                />
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                    Seuil critique : {p.minLevel} unités
                  </Text>
                  <Text style={{ ...TYPE.label, color: status.color, fontWeight: "700" }}>
                    {thresholdPct} % du seuil
                  </Text>
                </View>
              </View>
            </Card>

            <View style={{ flexDirection: "row", gap: SPACE.md, marginTop: SPACE.md }}>
              <Card style={{ flex: 1 }}>
                <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Valeur marchandise</Text>
                <Amount text={formatMinor(p.valueMinor)} size={19} style={{ marginTop: 4 }} />
                <View
                  style={{ height: 1, backgroundColor: COLORS.divider, marginVertical: SPACE.sm }}
                />
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>PVC unitaire</Text>
                  <Amount text={formatMinor(p.saleUnitMinor)} size={12} />
                </View>
              </Card>
              <Card style={{ flex: 1 }}>
                <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Valeur d'achat</Text>
                <Amount
                  text={formatMinor(p.quantity * p.purchaseUnitMinor)}
                  size={19}
                  style={{ marginTop: 4 }}
                />
                <View
                  style={{ height: 1, backgroundColor: COLORS.divider, marginVertical: SPACE.sm }}
                />
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>PAMP unitaire</Text>
                  <Amount text={formatMinor(p.purchaseUnitMinor)} size={12} />
                </View>
              </Card>
            </View>

            <View
              style={{
                backgroundColor: COLORS.headerBg,
                borderRadius: RADIUS.card,
                padding: SPACE.lg,
                marginTop: SPACE.md,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
                  <Text style={{ color: COLORS.navyMuted, ...TYPE.badge, letterSpacing: 0.6 }}>
                    MARGE PAR UNITÉ
                  </Text>
                  <Badge
                    label={`Taux : ${formatPercent(p.marginPercent)}`}
                    color={COLORS.primaryText}
                    dot={false}
                    background={COLORS.primary}
                  />
                </View>
                <Amount
                  text={`+${formatMinor(p.marginUnitMinor)} / ${p.unit.singular}`}
                  size={20}
                  tone={COLORS.primary}
                  style={{ marginTop: SPACE.sm }}
                />
              </View>
              <IconBubble
                icon="trending-up-outline"
                color={COLORS.primary}
                bg={COLORS.navySoft}
                size={40}
              />
            </View>

            <Card tone={COLORS.toneBg} style={{ marginTop: SPACE.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
                <Icon name="analytics-outline" size={17} color={COLORS.cardText} />
                <Text style={{ ...TYPE.headlineSm, color: COLORS.cardText, flex: 1 }}>
                  Dynamique (30 j)
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.md }}>
                {[
                  { label: "Vendu", value: `${p.sold30} ${p.unit.plural}` },
                  { label: "Cadence", value: `${p.perDay.toFixed(1).replace(".", ",")} /j` },
                  { label: "Autonomie", value: `~${p.autonomyDays} j` },
                ].map((tile) => (
                  <View
                    key={tile.label}
                    style={{
                      flex: 1,
                      backgroundColor: COLORS.cardBg,
                      borderRadius: RADIUS.inner,
                      padding: SPACE.sm,
                    }}
                  >
                    <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>{tile.label}</Text>
                    <Text
                      style={{
                        ...TYPE.bodySm,
                        color: COLORS.cardText,
                        fontWeight: "800",
                        marginTop: 2,
                      }}
                    >
                      {tile.value}
                    </Text>
                  </View>
                ))}
              </View>
              {p.suggestedRestock > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: SPACE.sm,
                    marginTop: SPACE.md,
                    backgroundColor: COLORS.cardBg,
                    borderRadius: RADIUS.inner,
                    padding: SPACE.md,
                  }}
                >
                  <Icon name="calendar-outline" size={15} color={COLORS.statusWatch} />
                  <Text style={{ ...TYPE.label, color: COLORS.cardText, flex: 1 }}>
                    Réapprovisionnement suggéré (30 j)
                  </Text>
                  <Text style={{ color: COLORS.cardText, fontWeight: "800" }}>
                    +{p.suggestedRestock} {p.unit.plural}
                  </Text>
                </View>
              ) : null}
            </Card>

            <ReadOnlyNote text="Fiche produit — lecture seule, aucune écriture de stock possible" />
          </>
        ) : (
          <>
            <Group>
              {p.movements.map((m, i) => (
                <View key={m.id}>
                  {i > 0 ? <Divider inset={SPACE.lg} /> : null}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: SPACE.md,
                      paddingHorizontal: SPACE.lg,
                      paddingVertical: SPACE.md,
                      minHeight: 62,
                    }}
                  >
                    <IconBubble icon={MOVE_ICON[m.kind]} color={MOVE_TONE[m.kind]} size={34} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text
                          style={{
                            ...TYPE.bodySm,
                            color: COLORS.cardText,
                            fontWeight: "700",
                            flexShrink: 1,
                          }}
                          numberOfLines={1}
                        >
                          {m.ref}
                        </Text>
                        {m.badge ? (
                          <Badge
                            label={m.badge}
                            color={COLORS.cardMuted}
                            dot={false}
                            background={COLORS.sunkenBg}
                          />
                        ) : null}
                      </View>
                      <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                        {formatDateShortFr(m.at)} · {formatTime(m.at)}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={{
                          fontWeight: "800",
                          fontSize: 15,
                          color: m.qty < 0 ? COLORS.criticalText : COLORS.statusOk,
                        }}
                      >
                        {m.qty > 0 ? "+" : ""}
                        {m.qty} {p.unit.singular}
                      </Text>
                      <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                        Solde : {m.balance}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </Group>
            <ReadOnlyNote text="Mouvements certifiés par Veloria POS — lecture seule, audit immuable" />
          </>
        )}
      </ScrollView>
    </View>
  );
}
