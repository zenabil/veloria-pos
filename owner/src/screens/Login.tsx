// Veloria Owner — écran de connexion (français, fond bleu nuit).
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { COLORS, RADIUS, SIZES, SPACE, TYPE } from "../tokens.ts";
import { Button, Field, Tap } from "../ui/kit.tsx";
import { Icon } from "../ui/Icon.tsx";

export function LoginScreen(props: {
  busy: boolean;
  error: string | null;
  demo: boolean;
  initialEmail: string;
  onLogin: (email: string, password: string) => void;
  onForgot: () => void;
}): React.JSX.Element {
  const [email, setEmail] = useState(props.initialEmail);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: COLORS.headerBg }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: SIZES.screenMargin,
          paddingTop: 64,
          paddingBottom: SPACE.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", marginBottom: SPACE.xl }}>
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
              marginBottom: SPACE.md,
            }}
          >
            <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 24 }}>V</Text>
          </View>
          <Text style={{ color: COLORS.navyMuted, ...TYPE.label, letterSpacing: 2 }}>VELORIA</Text>
          <Text style={{ color: COLORS.headerText, ...TYPE.hero, marginTop: SPACE.md }}>
            Espace propriétaire
          </Text>
          <Text style={{ color: COLORS.navyMuted, ...TYPE.body, marginTop: 6 }}>
            Veloria — supervision du magasin
          </Text>
        </View>

        <Field
          label="Adresse e-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="direction@veloria-boutique.dz"
          icon="at-outline"
          keyboardType="email-address"
          autoComplete="email"
          ariaLabel="Adresse e-mail"
          skin="navy"
        />
        <Field
          label="Mot de passe"
          value={password}
          onChangeText={setPassword}
          placeholder="Mot de passe"
          icon="lock-closed-outline"
          secure={!show}
          autoComplete="password"
          ariaLabel="Mot de passe"
          skin="navy"
          onSubmitEditing={() => props.onLogin(email, password)}
          trailing={
            <Tap onPress={() => setShow((v) => !v)} accessibilityLabel="Afficher le mot de passe">
              <Icon
                name={show ? "eye-off-outline" : "eye-outline"}
                size={19}
                color={COLORS.navyMuted}
              />
            </Tap>
          }
        />

        {props.demo ? (
          <View
            style={{
              backgroundColor: COLORS.navySoft,
              borderRadius: RADIUS.control,
              borderWidth: 1,
              borderColor: COLORS.navyLine,
              padding: SPACE.md,
              marginBottom: SPACE.md,
            }}
          >
            <Text style={{ color: COLORS.navyMuted, ...TYPE.label }}>
              Mode démonstration : aucune endpoint n'est configurée. Toute adresse e-mail valide
              ouvre la liasse de démonstration (lecture seule).
            </Text>
          </View>
        ) : null}

        {props.error ? (
          <View
            style={{
              backgroundColor: COLORS.criticalTone,
              borderRadius: RADIUS.control,
              padding: SPACE.md,
              flexDirection: "row",
              alignItems: "center",
              gap: SPACE.sm,
              marginBottom: SPACE.md,
            }}
          >
            <Icon name="alert-circle-outline" size={18} color={COLORS.criticalText} />
            <Text style={{ color: COLORS.criticalText, ...TYPE.bodySm, flex: 1 }}>
              {props.error}
            </Text>
          </View>
        ) : null}

        <Button
          label="Se connecter"
          size="lg"
          full
          busy={props.busy}
          icon={props.busy ? undefined : "arrow-forward"}
          onPress={() => props.onLogin(email, password)}
          style={{ marginTop: SPACE.sm }}
        />

        <Tap
          onPress={props.onForgot}
          accessibilityLabel="Mot de passe oublié"
          style={{ minHeight: SIZES.touchMin, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: COLORS.navyMuted, ...TYPE.bodySm }}>Mot de passe oublié ?</Text>
        </Tap>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: SPACE.sm,
            backgroundColor: COLORS.navySoft,
            borderWidth: 1,
            borderColor: COLORS.navyLine,
            borderRadius: RADIUS.control,
            minHeight: 54,
            paddingHorizontal: SPACE.lg,
            opacity: 0.55,
          }}
        >
          <Icon name="finger-print-outline" size={21} color={COLORS.headerText} />
          <Text style={{ color: COLORS.headerText, ...TYPE.bodySm, fontWeight: "700" }}>
            Déverrouillage biométrique
          </Text>
          <View
            style={{
              backgroundColor: COLORS.onNavyChip,
              borderRadius: RADIUS.inner,
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}
          >
            <Text style={{ color: COLORS.navyMuted, fontSize: 10, fontWeight: "700" }}>
              BIENTÔT
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: SPACE.sm,
            marginTop: SPACE.xl,
          }}
        >
          <Icon name="shield-checkmark-outline" size={16} color={COLORS.navyMuted} />
          <Text style={{ color: COLORS.navyMuted, ...TYPE.label, textAlign: "center", flex: 1 }}>
            Mode consultation sécurisée — Accès réservé à la gestion
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
