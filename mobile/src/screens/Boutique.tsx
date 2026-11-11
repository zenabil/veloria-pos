// Veloria Client — Écran « Boutique » (ADR-182) : catalogue du magasin.
//
// Le catalogue vient du MIROIR (table `store_catalog`, une copie par
// magasin) : il est donc lisible HORS LIGNE (cache local) et daté — l'écran
// affiche la date de publication pour ne pas faire passer un catalogue
// vieille pour un catalogue actuel.
//
// V1 : pas d'image (le projet n'a aucun stockage d'images), pas de panier
// ici — le panier et l'envoi de commande arrivent avec la tranche suivante.
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import { Icon } from "../ui/Icon.tsx";
import { COLORS, FONTS, HAIRLINE, RADIUS, SPACE, SIZES } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { formatDateFr, formatMinor } from "../format.ts";
import { catalogCategories, filterCatalog, type CatalogProduct } from "../views.ts";
import { Amount, Badge, Chip, Divider, Field, Tap, farEdge, flow } from "../ui/kit.tsx";
import { EmptyState } from "../ui/states.tsx";

export function BoutiqueScreen(props: {
  lang: Lang;
  products: CatalogProduct[];
  /** Date de publication du catalogue (null = jamais publié / inconnu). */
  publishedAt: string | null;
  /** Catalogue servi par le cache local (affichage « copie locale »). */
  offline: boolean;
  /** Nombre d'articles déjà dans le panier (pour la pastille). */
  cartCount: number;
  onAdd: (product: CatalogProduct) => void;
  onRefresh: () => Promise<void>;
}): React.JSX.Element {
  const l = props.lang;
  const dir = direction(l);
  const rtl = dir === "rtl";
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [shown, setShown] = useState<number>(SIZES.pageSize);
  const [spinning, setSpinning] = useState(false);

  const categories = useMemo(() => catalogCategories(props.products), [props.products]);
  const rows = useMemo(
    () => filterCatalog(props.products, query, categoryId),
    [props.products, query, categoryId],
  );

  // RTL : la bande de puces défile nativement vers la droite — on recale sur
  // la PREMIÈRE puce (même correction que l'écran factures).
  const chipsRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (!rtl) return;
    const id = setTimeout(() => chipsRef.current?.scrollToEnd({ animated: false }), 0);
    return () => clearTimeout(id);
  }, [rtl, categories.length]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.contentBg }}>
      {/* En-tête d'encre : titre, compteur, date de publication, recherche. */}
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
            {t(l, "boutique")}
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
            <Icon name="pricetag-outline" size={12} color={COLORS.navyMuted} />
            <Text
              style={{
                color: COLORS.navyMuted,
                fontWeight: "800",
                fontSize: 12,
                fontFamily: FONTS.mono,
              }}
            >
              {props.products.length}
            </Text>
          </View>
        </View>
        {/* Ligne de fraîcheur : le catalogue est daté (projection du miroir). */}
        <View
          style={{
            flexDirection: flow(dir),
            alignItems: "center",
            justifyContent: "space-between",
            gap: SPACE.sm,
            marginTop: 2,
          }}
        >
          <Text style={{ color: COLORS.navyMuted, fontSize: 11 }}>
            {props.publishedAt
              ? `${t(l, "catalogPublished")} ${formatDateFr(props.publishedAt)}`
              : t(l, "noProducts")}
          </Text>
          {props.offline ? <Badge label={t(l, "catalogOffline")} color={COLORS.navyMuted} /> : null}
        </View>
        <View style={{ marginTop: SPACE.sm }}>
          <Field
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setShown(SIZES.pageSize);
            }}
            placeholder={t(l, "searchProduct")}
            ariaLabel={t(l, "searchProduct")}
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

      {/* Puces de catégorie (le magasin peut exclure des catégories). */}
      {categories.length > 0 ? (
        <ScrollView
          ref={chipsRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            flexDirection: flow(dir),
            gap: SPACE.sm,
            paddingHorizontal: SPACE.lg,
            paddingVertical: SPACE.md,
          }}
          style={{ flexGrow: 0 }}
        >
          <Chip
            label={t(l, "all")}
            count={props.products.length}
            active={categoryId === null}
            onPress={() => {
              setCategoryId(null);
              setShown(SIZES.pageSize);
            }}
          />
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={c.name === "" ? `#${c.id}` : c.name}
              count={props.products.filter((p) => p.categoryId === c.id).length}
              active={categoryId === c.id}
              onPress={() => {
                setCategoryId(categoryId === c.id ? null : c.id);
                setShown(SIZES.pageSize);
              }}
            />
          ))}
        </ScrollView>
      ) : null}

      {rows.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", paddingVertical: SPACE.xxl }}>
          <EmptyState
            icon="pricetag-outline"
            title={props.products.length > 0 ? t(l, "noResultsProducts") : t(l, "noProducts")}
            hint={props.products.length > 0 ? t(l, "noResultsHint") : t(l, "noProductsHint")}
          />
        </View>
      ) : (
        // Un seul panneau à filets (ADR-150 « Daylight plat »).
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
            keyExtractor={(p) => String(p.id)}
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
            renderItem={({ item: p }) => (
              <View
                style={{
                  minHeight: 64,
                  flexDirection: flow(dir),
                  alignItems: "center",
                  gap: SPACE.md,
                  paddingHorizontal: SPACE.md,
                  paddingVertical: SPACE.sm,
                  backgroundColor: COLORS.cardBg,
                  opacity: p.available ? 1 : 0.6,
                }}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Text
                    style={{ color: COLORS.cardText, fontWeight: "700", fontSize: 14 }}
                    numberOfLines={2}
                  >
                    {p.name}
                  </Text>
                  <View style={{ flexDirection: flow(dir), alignItems: "center", gap: SPACE.sm }}>
                    {p.categoryName ? (
                      <Text style={{ color: COLORS.cardMuted, fontSize: 11 }} numberOfLines={1}>
                        {p.categoryName}
                      </Text>
                    ) : null}
                    {!p.available ? (
                      <Badge label={t(l, "outOfStock")} color={COLORS.debtOverdue} />
                    ) : null}
                  </View>
                </View>
                {/* Prix en centimes DZD, formatage montant tabulaire. */}
                <View
                  style={{
                    alignItems: farEdge(rtl) === "left" ? "flex-start" : "flex-end",
                    gap: SPACE.xs,
                  }}
                >
                  <Amount
                    text={formatMinor(p.priceMinor, l)}
                    size={15}
                    tone={COLORS.cardText}
                    align={farEdge(rtl)}
                  />
                  {/* Ajout au panier : la seule action de la ligne (48 dp). */}
                  <Tap
                    onPress={() => props.onAdd(p)}
                    disabled={!p.available}
                    accessibilityLabel={`${t(l, "addToCart")} ${p.name}`}
                    style={{
                      minWidth: 40,
                      height: 40,
                      paddingHorizontal: SPACE.sm,
                      borderRadius: RADIUS.button,
                      flexDirection: flow(dir),
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      backgroundColor: p.available ? COLORS.primary : COLORS.toneBg,
                      opacity: p.available ? 1 : 0.5,
                    }}
                  >
                    <Icon
                      name="add"
                      size={16}
                      color={p.available ? COLORS.primaryText : COLORS.cardMuted}
                    />
                  </Tap>
                </View>
              </View>
            )}
          />
        </View>
      )}
    </View>
  );
}
