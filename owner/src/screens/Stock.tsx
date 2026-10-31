// Veloria Owner — Stock : valeur, alertes seuil, catalogue consultable.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { COLORS, RADIUS, SIZES, SPACE, TYPE } from "../tokens.ts";
import {
  formatDateLongFr,
  formatDateShortFr,
  formatMinor,
  formatQuantity,
  freshnessLabel,
} from "../format.ts";
import { filterProducts, productStatus, type OwnerSnapshot, type ProductFilter } from "../store.ts";
import { Amount, Badge, Card, Chip, Field, IconBubble, ReadOnlyNote, Tap } from "../ui/kit.tsx";
import { Icon } from "../ui/Icon.tsx";

const STATUS: Record<"ok" | "low" | "out", { label: string; color: string; bg: string }> = {
  ok: { label: "En stock", color: COLORS.statusOk, bg: COLORS.okTone },
  low: { label: "Sous seuil", color: COLORS.statusWatch, bg: COLORS.watchTone },
  out: { label: "Rupture totale", color: COLORS.statusCritical, bg: COLORS.criticalTone },
};

export function StockScreen(props: {
  snapshot: OwnerSnapshot;
  onOpenProduct: (id: string) => void;
}): React.JSX.Element {
  const [filter, setFilter] = useState<ProductFilter>("all");
  const [query, setQuery] = useState("");
  const stock = props.snapshot.stock;
  const rows = filterProducts(stock.products, filter, query);
  const lowCount = stock.products.filter((p) => p.quantity > 0 && p.quantity <= p.minLevel).length;
  const outCount = stock.products.filter((p) => p.quantity <= 0).length;

  return (
    <ScrollView
      contentContainerStyle={{ padding: SPACE.lg, paddingBottom: SIZES.dockInset + SPACE.lg }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
          <IconBubble icon="cube-outline" color={COLORS.cardText} size={32} />
          <View style={{ flex: 1 }}>
            <Text style={{ ...TYPE.headline, color: COLORS.cardText }}>Stock & Inventaire</Text>
            <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
              {formatDateLongFr(props.snapshot.day.date)}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.md }}>
          <Badge
            label={freshnessLabel(props.snapshot.generatedAt)}
            color={COLORS.cardMuted}
            dot={false}
            background={COLORS.sunkenBg}
          />
          <Badge
            label="Consultation seule"
            color={COLORS.cardMuted}
            dot={false}
            background={COLORS.sunkenBg}
          />
        </View>
      </Card>

      <Card style={{ marginTop: SPACE.md }}>
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted }}>Valeur totale du stock</Text>
            <Amount text={formatMinor(stock.valueMinor)} size={26} style={{ marginTop: 4 }} />
          </View>
          <IconBubble
            icon="layers-outline"
            color={COLORS.primaryText}
            bg={COLORS.primary}
            size={44}
          />
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: SPACE.md, marginTop: SPACE.md }}>
        <Card style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted }}>Références</Text>
            <Icon name="barcode-outline" size={16} color={COLORS.cardMuted} />
          </View>
          <Text style={{ ...TYPE.hero, color: COLORS.cardText, marginTop: 4 }}>
            {stock.references}
          </Text>
          <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Catalogue actif</Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted }}>Sous seuil</Text>
            <View
              style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.statusWatch }}
            />
          </View>
          <Text style={{ ...TYPE.hero, color: COLORS.statusWatch, marginTop: 4 }}>{lowCount}</Text>
          <Text style={{ ...TYPE.label, color: COLORS.statusWatch }}>
            {lowCount} à réapprovisionner
          </Text>
        </Card>
      </View>

      {outCount > 0 ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: SPACE.md,
            backgroundColor: COLORS.criticalTone,
            borderRadius: RADIUS.control,
            padding: SPACE.md,
            marginTop: SPACE.md,
          }}
        >
          <IconBubble icon="alert-circle-outline" color={COLORS.statusCritical} size={38} />
          <View style={{ flex: 1 }}>
            <Text style={{ ...TYPE.bodySm, color: COLORS.criticalText, fontWeight: "800" }}>
              {outCount} références en rupture
            </Text>
            <Text style={{ ...TYPE.label, color: COLORS.criticalText }}>
              Impact immédiat sur les ventes
            </Text>
          </View>
          <Badge
            label={`${outCount} critiques`}
            color={COLORS.statusCritical}
            dot={false}
            background={COLORS.cardBg}
          />
        </View>
      ) : null}

      <View style={{ marginTop: SPACE.md }}>
        <Field
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher une référence, code-barres…"
          icon="search-outline"
          ariaLabel="Rechercher une référence"
          skin="outlined"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: SPACE.sm }}
      >
        <Chip
          label="Tout"
          count={stock.references}
          active={filter === "all"}
          onPress={() => setFilter("all")}
        />
        <Chip
          label="Sous seuil"
          count={lowCount}
          active={filter === "low"}
          onPress={() => setFilter("low")}
          icon="ellipse"
          tone={COLORS.statusWatch}
        />
        <Chip
          label="Rupture"
          count={outCount}
          active={filter === "out"}
          onPress={() => setFilter("out")}
          icon="ellipse"
          tone={COLORS.statusCritical}
        />
      </ScrollView>

      <View style={{ gap: SPACE.md, marginTop: SPACE.md }}>
        {rows.map((p) => {
          const status = STATUS[productStatus(p)];
          return (
            <Tap key={p.id} onPress={() => props.onOpenProduct(p.id)} accessibilityLabel={p.name}>
              <Card padded={false} style={{ padding: SPACE.lg }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: SPACE.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...TYPE.headlineSm, color: COLORS.cardText }} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text
                      style={{ ...TYPE.label, color: COLORS.cardMuted, marginTop: 2 }}
                      numberOfLines={1}
                    >
                      {p.subtitle} · REF-{p.ref}
                    </Text>
                  </View>
                  <Badge
                    label={status.label}
                    color={status.color}
                    dot={false}
                    background={status.bg}
                  />
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: status.bg,
                    borderRadius: RADIUS.inner,
                    paddingHorizontal: SPACE.md,
                    paddingVertical: SPACE.sm,
                    marginTop: SPACE.md,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                      {p.quantity === 0
                        ? "Niveau de stock"
                        : p.quantity <= p.minLevel
                          ? "Quantité restante"
                          : "Quantité disponible"}
                    </Text>
                    <Text style={{ ...TYPE.bodySm, color: status.color, fontWeight: "800" }}>
                      {formatQuantity(p.quantity, p.unit.singular, p.unit.plural)} (min :{" "}
                      {p.minLevel})
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Valeur stock</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Amount text={formatMinor(p.valueMinor)} size={14} />
                      <Icon name="chevron-forward" size={14} color={COLORS.cardMuted} />
                    </View>
                  </View>
                </View>
              </Card>
            </Tap>
          );
        })}
        {rows.length === 0 ? (
          <Card>
            <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted, textAlign: "center" }}>
              Aucune référence ne correspond à cette recherche.
            </Text>
          </Card>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACE.xl }}>
        <Icon name="time-outline" size={15} color={COLORS.cardMuted} />
        <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
          Dernier inventaire physique :{" "}
          {stock.lastInventoryAt ? formatDateShortFr(stock.lastInventoryAt) : "—"}
        </Text>
      </View>
      <ReadOnlyNote text="Mode consultation sécurisée — Lecture seule · Audit Veloria POS" />
    </ScrollView>
  );
}
