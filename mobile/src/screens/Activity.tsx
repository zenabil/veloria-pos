// Veloria Client — Onglet « النشاط » (ADR-182, tranche D).
//
// Tout ce qui est arrivé au client, en trois segments : FACTURES | PAIEMENTS |
// COMMANDES. Le regroupement libère une place dans la barre (le panier est
// devenu un onglet à part entière) et donne au client une seule porte
// d'entrée sur son historique.
import { ScrollView, View } from "react-native";
import { COLORS, SPACE } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { Chip } from "../ui/kit.tsx";
import { InvoicesScreen } from "./Invoices.tsx";
import { PaymentsScreen } from "./Payments.tsx";
import { OrdersScreen } from "./Orders.tsx";
import type { ClientOrder, HomeInvoice, HomePayment } from "../views.ts";

export type Segment = "invoices" | "payments" | "orders";

export function ActivityScreen(props: {
  lang: Lang;
  invoices: HomeInvoice[];
  payments: HomePayment[];
  orders: ClientOrder[];
  customerName: string;
  shopName: string;
  hidden: boolean;
  onOpenDetail: (row: HomeInvoice) => void;
  onRefresh: () => Promise<void>;
  /** Segment affiché (contrôlé par l'App : l'accueil peut ouvrir « Paiements »). */
  segment: Segment;
  onSegment: (segment: Segment) => void;
}): React.JSX.Element {
  const l = props.lang;
  const dir = direction(l);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.contentBg }}>
      {/* Segments : la seule barre qui sépare les trois vues. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          flexDirection: dir === "rtl" ? "row-reverse" : "row",
          gap: SPACE.sm,
          paddingHorizontal: SPACE.lg,
          paddingVertical: SPACE.md,
        }}
        style={{ flexGrow: 0 }}
      >
        <Chip
          label={t(l, "invoices")}
          count={props.invoices.length}
          active={props.segment === "invoices"}
          onPress={() => props.onSegment("invoices")}
        />
        <Chip
          label={t(l, "payments")}
          count={props.payments.length}
          active={props.segment === "payments"}
          onPress={() => props.onSegment("payments")}
        />
        <Chip
          label={t(l, "orders")}
          count={props.orders.length}
          active={props.segment === "orders"}
          onPress={() => props.onSegment("orders")}
        />
      </ScrollView>

      {props.segment === "invoices" ? (
        <InvoicesScreen
          lang={l}
          rows={props.invoices}
          hidden={props.hidden}
          onOpenDetail={props.onOpenDetail}
          onRefresh={props.onRefresh}
          embedded
        />
      ) : props.segment === "payments" ? (
        <PaymentsScreen
          lang={l}
          rows={props.payments}
          customerName={props.customerName}
          shopName={props.shopName}
          hidden={props.hidden}
          onRefresh={props.onRefresh}
          embedded
        />
      ) : (
        <OrdersScreen
          lang={l}
          orders={props.orders}
          hidden={props.hidden}
          onRefresh={props.onRefresh}
        />
      )}
    </View>
  );
}
