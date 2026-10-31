// Veloria Owner — Stock : Aperçu (valeur), Produits (catalogue), Mouvements.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { COLORS, RADIUS, SIZES, SPACE, TYPE } from "../tokens.ts";
import {
  formatDateLongFr,
  formatDateShortFr,
  formatMinor,
  formatQuantity,
  formatTime,
} from "../format.ts";
import {
  filterProducts,
  productStatus,
  recentMovements,
  type MovementKind,
  type OwnerSnapshot,
  type ProductFilter,
} from "../store.ts";
import {
  Amount,
  Badge,
  Card,
  Chip,
  Divider,
  Field,
  Group,
  IconBubble,
  ReadOnlyNote,
  Segmented,
  Tap,
} from "../ui/kit.tsx";
import { Icon, type IconName } from "../ui/Icon.tsx";

const STATUS: Record<"ok" | "low" | "out", { label: string; color: string; bg: string }> = {
  ok: { label: "En stock", color: COLORS.statusOk, bg: COLORS.okTone },
  low: { label: "Sous seuil", color: COLORS.statusWatch, bg: COLORS.watchTone },
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

type StockView = "overview" | "products" | "movements";

export function StockScreen(props: {
  snapshot: OwnerSnapshot;
  onOpenProduct: (id: string) => void;
}): React.JSX.Element {
  const [view, setView] = useState<StockView>("overview");
  const [filter, setFilter] = useState<ProductFilter>("all");
  const [query, setQuery] = useState("");
  const stock = props.snapshot.stock;
  const rows = filterProducts(stock.products, filter, query);
  const lowCount = stock.products.filter((p) => p.quantity > 0 && p.quantity <= p.minLevel).length;
  const outCount = stock.products.filter((p) => p.quantity <= 0).length;
  const feed = recentMovements(props.snapshot);

  return (
    <ScrollView
      contentContainerStyle={{ padding: SPACE.lg, paddingBottom: SIZES.dockInset + SPACE.lg }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={{ ...TYPE.label, color: COLORS.cardMuted, marginBottom: SPACE.md }}>
        {formatDateLongFr(props.snapshot.day.date)}
      </Text>

      <Segmented
        options={[
          { value: "overview", label: "Aperçu" },
          { value: "products", label: `Produits (${stock.products.length})` },
          { value: "movements", label: "Mouvements" },
        ]}
        value={view}
        onChange={setView}
      />

      {view === "overview" ? (
        <>
          <Card style={{ marginTop: SPACE.md }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted }}>
                  Valeur totale du stock
                </Text>
                <Amount text={formatMinor(stock.valueMinor)} size={26} style={{ marginTop: 4 }} />
              </View>
              <IconBubble
                icon="layers-outline"
                color={COLORS.primaryText}
                bg={COLORS.primary}
                size={44}
              />
            </View>
            <View
              style={{ height: 1, backgroundColor: COLORS.divider, marginVertical: SPACE.md }}
            />
            <View style={{ flexDirection: "row" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Références</Text>
                <Text style={{ ...TYPE.headline, color: COLORS.cardText, marginTop: 2 }}>
                  {stock.references}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Sous seuil</Text>
                <Text style={{ ...TYPE.headline, color: COLORS.statusWatch, marginTop: 2 }}>
                  {lowCount}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Ruptures</Text>
                <Text style={{ ...TYPE.headline, color: COLORS.statusCritical, marginTop: 2 }}>
                  {outCount}
                </Text>
              </View>
            </View>
          </Card>

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

          <Card style={{ marginTop: SPACE.md }} tone={COLORS.toneBg}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
              <Icon name="time-outline" size={16} color={COLORS.cardMuted} />
              <Text style={{ ...TYPE.label, color: COLORS.cardMuted, flex: 1 }}>
                Dernier inventaire physique
              </Text>
              <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "700" }}>
                {stock.lastInventoryAt ? formatDateShortFr(stock.lastInventoryAt) : "—"}
              </Text>
            </View>
          </Card>
        </>
      ) : null}

      {view === "products" ? (
        <>
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

          <Group style={{ marginTop: SPACE.md }}>
            {rows.map((p, i) => {
              const status = STATUS[productStatus(p)];
              return (
                <View key={p.id}>
                  {i > 0 ? <Divider inset={SPACE.lg} /> : null}
                  <Tap onPress={() => props.onOpenProduct(p.id)} accessibilityLabel={p.name}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: SPACE.md,
                        paddingHorizontal: SPACE.lg,
                        paddingVertical: SPACE.md,
                        minHeight: 60,
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: status.color,
                        }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{ ...TYPE.headlineSm, color: COLORS.cardText }}
                          numberOfLines={1}
                        >
                          {p.name}
                        </Text>
                        <Text style={{ ...TYPE.label, color: COLORS.cardMuted }} numberOfLines={1}>
                          {p.subtitle} · REF-{p.ref}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ ...TYPE.bodySm, color: status.color, fontWeight: "800" }}>
                          {formatQuantity(p.quantity, p.unit.singular, p.unit.plural)}
                        </Text>
                        <Amount
                          text={formatMinor(p.valueMinor)}
                          size={12}
                          tone={COLORS.cardMuted}
                        />
                      </View>
                      <Icon name="chevron-forward" size={16} color={COLORS.cardMuted} />
                    </View>
                  </Tap>
                </View>
              );
            })}
          </Group>
          {rows.length === 0 ? (
            <Card style={{ marginTop: SPACE.md }}>
              <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted, textAlign: "center" }}>
                Aucune référence ne correspond à cette recherche.
              </Text>
            </Card>
          ) : null}
        </>
      ) : null}

      {view === "movements" ? (
        <>
          <Group style={{ marginTop: SPACE.md }}>
            {feed.map((row, i) => (
              <View key={`${row.product.id}-${row.movement.id}`}>
                {i > 0 ? <Divider inset={SPACE.lg} /> : null}
                <Tap
                  onPress={() => props.onOpenProduct(row.product.id)}
                  accessibilityLabel={`${row.product.name} — ${row.movement.ref}`}
                >
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
                    <IconBubble
                      icon={MOVE_ICON[row.movement.kind]}
                      color={MOVE_TONE[row.movement.kind]}
                      size={34}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "700" }}
                        numberOfLines={1}
                      >
                        {row.product.name}
                      </Text>
                      <Text style={{ ...TYPE.label, color: COLORS.cardMuted }} numberOfLines={1}>
                        {row.movement.ref} · {formatDateShortFr(row.movement.at)}{" "}
                        {formatTime(row.movement.at)}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={{
                          fontWeight: "800",
                          fontSize: 14,
                          color: row.movement.qty < 0 ? COLORS.criticalText : COLORS.statusOk,
                        }}
                      >
                        {row.movement.qty > 0 ? "+" : ""}
                        {row.movement.qty} {row.product.unit.singular}
                      </Text>
                      <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                        Solde : {row.movement.balance}
                      </Text>
                    </View>
                    <Icon name="chevron-forward" size={16} color={COLORS.cardMuted} />
                  </View>
                </Tap>
              </View>
            ))}
          </Group>
          {feed.length === 0 ? (
            <Card style={{ marginTop: SPACE.md }}>
              <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted, textAlign: "center" }}>
                Aucun mouvement publié pour l'instant.
              </Text>
            </Card>
          ) : null}
        </>
      ) : null}

      <ReadOnlyNote text="Mode consultation sécurisée — Lecture seule · Audit Veloria POS" />
    </ScrollView>
  );
}
