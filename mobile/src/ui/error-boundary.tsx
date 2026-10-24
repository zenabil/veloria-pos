// Veloria Client (APK) — Barrière anti-fermeture brutale.
// Sans elle, la moindre exception au rendu (donnée miroir inattendue,
// module natif manquant) tue l'appli sans message. Ici : écran bilingue
// statique (aucune donnée, aucun appel) + bouton réessai.
import { Component, type ReactNode } from "react";
import { Image, Pressable, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, GRADIENTS, SPACE } from "../tokens.ts";

interface State {
  error: string | null;
}

export class RootErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(e: unknown): State {
    return { error: e instanceof Error ? e.message : "Erreur inconnue" };
  }

  render(): ReactNode {
    if (this.state.error == null) return this.props.children;
    return (
      <LinearGradient
        colors={GRADIENTS.heroDeep}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: SPACE.xl }}
      >
        <Image
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require("../../assets/brand/veloria-customer.png")}
          style={{ width: 88, height: 88, borderRadius: 26 }}
          accessibilityLabel="Veloria"
        />
        <Text style={{ color: COLORS.white, fontWeight: "900", fontSize: 18, marginTop: 8 }}>
          Veloria
        </Text>
        <Text style={{ color: COLORS.navyMuted, fontSize: 13, textAlign: "center", marginTop: 12 }}>
          حدث خطأ غير متوقع — أعد فتح التطبيق. إذا تكرر، اتصل بالمحل.
        </Text>
        <Text style={{ color: COLORS.navyMuted, fontSize: 13, textAlign: "center", marginTop: 4 }}>
          Erreur inattendue — rouvrez l&apos;appli. Si ça persiste, appelez le magasin.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => this.setState({ error: null })}
          style={{
            backgroundColor: COLORS.primary,
            borderRadius: 9999,
            paddingHorizontal: 28,
            paddingVertical: 14,
            marginTop: 20,
          }}
        >
          <Text style={{ color: COLORS.primaryText, fontWeight: "800" }}>
            إعادة المحاولة · Réessayer
          </Text>
        </Pressable>
      </LinearGradient>
    );
  }
}
