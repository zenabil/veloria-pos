// Veloria Owner — barrière anti-fermeture brutale (homologue de
// `mobile/src/ui/error-boundary.tsx`, kit propre à l'app propriétaire).
// Une liasse driftée (montant flottant ou absent publié par le POS) fait lever
// le rendu d'un écran. Sans barrière l'appli meurt — et comme la liasse est
// CACHÉE localement, chaque relance meurt au même endroit : le commerçant ne
// peut plus atteindre le compte pour purger. D'où l'action « effacer les
// données synchronisées », qui casse cette boucle.
// Écran de secours volontairement STATIQUE : aucune donnée métier, aucun appel,
// aucun `Icon` (l'écran doit survivre à la panne qui l'affiche).
import { Component, type ReactNode } from "react";
import { StatusBar, Text, View } from "react-native";
import { COLORS, RADIUS, SPACE, TYPE } from "../tokens.ts";
import { Button } from "./kit.tsx";

interface State {
  error: string | null;
  /** Clé du sous-arbre : changer de clé remonte l'appli (état perdu → reboot). */
  epoch: number;
}

export interface OwnerErrorBoundaryProps {
  children: ReactNode;
  /** Purge la liasse cachée avant la remontée (bouton « effacer »). */
  onClearCachedData: () => void;
}

export class OwnerErrorBoundary extends Component<OwnerErrorBoundaryProps, State> {
  state: State = { error: null, epoch: 0 };

  static getDerivedStateFromError(err: unknown): Partial<State> {
    return { error: err instanceof Error ? err.message : "Erreur inconnue" };
  }

  // Règle 6 (AGENTS.md) : l'utilisateur ne voit qu'une phrase française ; le
  // détail technique part au journal, seul endroit où il est lisible.
  componentDidCatch(err: unknown): void {
    console.warn("[owner] exception au rendu", err);
  }

  /** Remonte toute l'appli : le sous-arbre fautif repart d'un état vierge. */
  restart(clearCached: boolean): void {
    if (clearCached) this.props.onClearCachedData();
    this.setState((s) => ({ error: null, epoch: s.epoch + 1 }));
  }

  render(): ReactNode {
    if (this.state.error == null) {
      return (
        <View key={this.state.epoch} style={{ flex: 1 }}>
          {this.props.children}
        </View>
      );
    }
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.headerBg,
          alignItems: "center",
          justifyContent: "center",
          padding: SPACE.xl,
          gap: SPACE.md,
        }}
      >
        <StatusBar barStyle="light-content" />
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: RADIUS.card,
            backgroundColor: COLORS.navySoft,
            borderWidth: 1,
            borderColor: COLORS.navyLine,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 24 }}>V</Text>
        </View>
        <Text style={{ color: COLORS.headerText, ...TYPE.title }}>Affichage impossible</Text>
        <Text
          style={{ color: COLORS.navyMuted, ...TYPE.bodySm, textAlign: "center", maxWidth: 320 }}
        >
          Les données de supervision reçues du magasin n'ont pas pu être affichées. Réessayez ; si
          l'écran revient, effacez la copie locale — elle sera rechargée à la prochaine
          synchronisation.
        </Text>
        <View style={{ width: "100%", gap: SPACE.sm, marginTop: SPACE.sm }}>
          <Button
            label="Réessayer"
            variant="gold"
            size="lg"
            full
            onPress={() => this.restart(false)}
          />
          <Button
            label="Effacer les données synchronisées"
            variant="quiet"
            full
            onPress={() => this.restart(true)}
          />
        </View>
        <Text style={{ color: COLORS.navyMuted, ...TYPE.label, textAlign: "center" }}>
          Aucune donnée du magasin n'est modifiée — lecture seule.
        </Text>
      </View>
    );
  }
}
