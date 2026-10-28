// Veloria Client (APK) — Barrière anti-fermeture brutale.
// Sans elle, la moindre exception au rendu (donnée miroir inattendue,
// module natif manquant) tue l'appli sans message. Ici : écran bilingue
// statique (aucune donnée, aucun appel) + bouton réessai.
// V4 : fond d'encre plat (plus de dégradé), action reprise par le kit.
import { Component, type ReactNode } from "react";
import { Image, Text, View } from "react-native";
import { COLORS, RADIUS, SPACE, TYPE } from "../tokens.ts";
import { Button } from "../ui/kit.tsx";

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
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: SPACE.xl,
          backgroundColor: COLORS.headerBg,
        }}
      >
        <Image
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require("../../assets/brand/veloria-customer.png")}
          style={{ width: 96, height: 96, borderRadius: RADIUS.card }}
          accessibilityLabel="Veloria"
        />
        <Text style={{ ...TYPE.title, color: COLORS.white, marginTop: SPACE.xs }}>Veloria</Text>
        <Text
          style={{
            ...TYPE.body,
            color: COLORS.navyMuted,
            textAlign: "center",
            marginTop: SPACE.md,
          }}
        >
          حدث خطأ غير متوقع — أعد فتح التطبيق. إذا تكرر، اتصل بالمحل.
        </Text>
        <Text
          style={{
            ...TYPE.body,
            color: COLORS.navyMuted,
            textAlign: "center",
            marginTop: SPACE.xs,
          }}
        >
          Erreur inattendue — rouvrez l&apos;appli. Si ça persiste, appelez le magasin.
        </Text>
        <Button
          label="إعادة المحاولة · Réessayer"
          variant="gold"
          size="lg"
          onPress={() => this.setState({ error: null })}
          style={{ marginTop: SPACE.xl }}
        />
      </View>
    );
  }
}
