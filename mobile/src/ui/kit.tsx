// Veloria Client — Kit UI V3 « Veloria Fintech ».
// Composants partagés : pression animée + haptics, cartes à ombre douce,
// boutons variantés, puces, badges, montants Mono, en-têtes de section.
// Aucune logique métier ici : purement visuel (voir screens/ pour l'usage).
import { useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { COLORS, FONTS, RADIUS, SHADOW, SIZES, SPACE, TYPE, tint } from "../tokens.ts";
import type { Lang } from "../i18n.ts";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export type Flow = "row" | "row-reverse";

const TAP_MIN = 48;
const CHIP_HEIGHT = SIZES.touchMin;
const AMOUNT_MD = 18;

/** Sens de flux RTL/LTR (un seul endroit pour la bascule). */
export function flow(dir: "rtl" | "ltr"): Flow {
  return dir === "rtl" ? "row-reverse" : "row";
}

/** Alignement vers le bord extérieur de l'écran (gauche en RTL, droite en LTR). */
export function farEdge(rtl: boolean): "left" | "right" {
  return rtl ? "left" : "right";
}

function buzz(): void {
  if (Platform.OS !== "web") {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }
}

/** Cible tactile (scale 0.97) + retour haptique léger.
// NOTE crash APK 2026-10-04 : un Animated.Value dans `transform` arrivait
// natif comme une Map (ReadableNativeMap→double, FATAL au premier rendu).
// Pression en nombres purs : aucun nœud animé ne traverse le pont. */
export function Tap(props: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityLiveRegion?: "none" | "polite" | "assertive";
  disabled?: boolean;
  scaleTo?: number;
  haptic?: boolean;
  hitSlop?: number;
  testID?: string;
}): React.JSX.Element {
  const [pressed, setPressed] = useState(false);
  const to = props.scaleTo ?? 0.97;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityHint={props.accessibilityHint}
      accessibilityLiveRegion={props.accessibilityLiveRegion}
      disabled={props.disabled}
      hitSlop={props.hitSlop}
      testID={props.testID}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        if (props.haptic !== false) buzz();
        props.onPress?.();
      }}
      style={[props.style, { transform: [{ scale: pressed ? to : 1 }] }]}
    >
      {props.children}
    </Pressable>
  );
}

/** Carte blanche : rayon 20, ombre diffuse, filet 1px lisible en plein soleil. */
export function Card(props: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: string;
  raised?: boolean;
}): React.JSX.Element {
  return (
    <View
      style={[
        {
          backgroundColor: COLORS.cardBg,
          borderRadius: RADIUS.card,
          padding: SPACE.lg,
          borderWidth: 1,
          borderColor: tint(COLORS.headerBg, "0D"),
          ...SHADOW.card,
        },
        props.raised ? SHADOW.raised : SHADOW.card,
        props.tone ? { backgroundColor: props.tone } : null,
        props.style,
      ]}
    >
      {props.children}
    </View>
  );
}

export type ButtonVariant = "gold" | "navy" | "outline" | "ghost" | "danger" | "success";

const BUTTON_SKIN: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  gold: { bg: COLORS.primary, fg: COLORS.primaryText },
  navy: { bg: COLORS.headerBg, fg: COLORS.white },
  outline: { bg: COLORS.cardBg, fg: COLORS.cardText, border: COLORS.border },
  ghost: { bg: COLORS.contentBg, fg: COLORS.cardText },
  danger: { bg: COLORS.dangerBg, fg: COLORS.debtOverdue, border: tint(COLORS.debtOverdue, "40") },
  success: { bg: COLORS.debtOk, fg: COLORS.white },
};

/** Bouton pilule : variante, icône optionnelle, taille md (48) / lg (56). */
export function Button(props: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  size?: "md" | "lg";
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}): React.JSX.Element {
  const variant = props.variant ?? "gold";
  const skin = BUTTON_SKIN[variant];
  const lg = (props.size ?? "md") === "lg";
  const off = props.disabled === true || props.busy === true;
  return (
    <Tap
      onPress={props.onPress}
      disabled={off}
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      style={[
        {
          backgroundColor: skin.bg,
          borderColor: skin.border ?? "transparent",
          borderWidth: skin.border ? 1 : 0,
          borderRadius: RADIUS.pill,
          minHeight: lg ? 56 : TAP_MIN,
          paddingHorizontal: SPACE.lg,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: SPACE.sm,
          opacity: off ? 0.55 : 1,
        },
        variant === "gold" ? SHADOW.gold : variant === "navy" ? SHADOW.raised : null,
        props.style,
      ]}
    >
      {props.busy ? (
        <Text style={{ color: skin.fg, fontWeight: "800" }}>…</Text>
      ) : (
        <>
          {props.icon ? <Ionicons name={props.icon} size={18} color={skin.fg} /> : null}
          <Text
            style={{
              color: skin.fg,
              fontWeight: "800",
              fontSize: lg ? 16 : 14,
              letterSpacing: 0.2,
            }}
          >
            {props.label}
          </Text>
        </>
      )}
    </Tap>
  );
}

/** Puce de filtre (sélection : navy, repos : blanc filet). */
export function Chip(props: {
  label: string;
  active?: boolean;
  count?: number;
  onPress?: () => void;
  icon?: IconName;
}): React.JSX.Element {
  const active = props.active === true;
  return (
    <Tap
      onPress={props.onPress}
      accessibilityLabel={props.label}
      style={{
        backgroundColor: active ? COLORS.headerBg : COLORS.cardBg,
        borderColor: active ? COLORS.headerBg : COLORS.border,
        borderWidth: 1,
        borderRadius: RADIUS.pill,
        minHeight: CHIP_HEIGHT,
        paddingHorizontal: SPACE.lg,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 6,
        ...(active ? SHADOW.card : null),
      }}
    >
      {props.icon && active ? (
        <Ionicons name={props.icon} size={14} color={COLORS.primary} />
      ) : null}
      <Text
        style={{
          color: active ? COLORS.white : COLORS.cardText,
          fontWeight: "800",
          fontSize: 13,
        }}
      >
        {props.label}
      </Text>
      {typeof props.count === "number" ? (
        <Text
          style={{
            color: active ? COLORS.primary : COLORS.cardMuted,
            fontWeight: "800",
            fontSize: 12,
            fontFamily: FONTS.mono,
          }}
        >
          {props.count}
        </Text>
      ) : null}
    </Tap>
  );
}

/** Pastille d'état teintée (statut, méthode, synchronisation). */
export function Badge(props: {
  label: string;
  color: string;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <View
      style={[
        {
          backgroundColor: tint(props.color, "18"),
          borderRadius: RADIUS.pill,
          paddingHorizontal: 10,
          paddingVertical: 5,
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          alignSelf: "flex-start",
        },
        props.style,
      ]}
    >
      {props.icon ? <Ionicons name={props.icon} size={12} color={props.color} /> : null}
      <Text style={{ color: props.color, fontWeight: "800", fontSize: 11 }}>{props.label}</Text>
    </View>
  );
}

/** Pastille circulaire d'icône (tuiles d'action rapide, timeline). */
export function IconBubble(props: {
  icon: IconName;
  color?: string;
  bg?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const size = props.size ?? 40;
  const color = props.color ?? COLORS.headerBg;
  const bg = props.bg ?? tint(color, "16");
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
          ...SHADOW.card,
        },
        props.style,
      ]}
    >
      <Ionicons name={props.icon} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

/** Titre de section + action « Voir tout ». */
export function SectionHead(props: {
  title: string;
  actionLabel?: string;
  onPress?: () => void;
  caption?: string;
  dir: "rtl" | "ltr";
}): React.JSX.Element {
  return (
    <View
      style={{
        flexDirection: flow(props.dir),
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: SPACE.sm,
        marginTop: SPACE.sm,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ ...TYPE.headline, color: COLORS.cardText, letterSpacing: 0.2 }}>
          {props.title}
        </Text>
        {props.caption ? (
          <Text style={{ ...TYPE.caption, color: COLORS.cardMuted, marginTop: 2 }}>
            {props.caption}
          </Text>
        ) : null}
      </View>
      {props.actionLabel ? (
        <Tap
          onPress={props.onPress}
          accessibilityLabel={props.actionLabel}
          style={{
            flexDirection: flow(props.dir),
            alignItems: "center",
            gap: 2,
            paddingHorizontal: SPACE.xs,
            paddingVertical: SPACE.xs,
          }}
        >
          <Text style={{ color: COLORS.cardMuted, fontWeight: "800", fontSize: 13 }}>
            {props.actionLabel}
          </Text>
          <Ionicons
            name={props.dir === "rtl" ? "chevron-back" : "chevron-forward"}
            size={14}
            color={COLORS.cardMuted}
          />
        </Tap>
      ) : null}
    </View>
  );
}

/** Montant Mono tabulaire : jamais de jitter entre deux lignes. */
export function Amount(props: {
  text: string;
  tone?: string;
  size?: number;
  align?: TextStyle["textAlign"];
  style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  return (
    <Text
      style={[
        {
          fontFamily: FONTS.mono,
          fontWeight: "800",
          fontSize: props.size ?? AMOUNT_MD,
          color: props.tone ?? COLORS.cardText,
          textAlign: props.align,
          letterSpacing: 0.2,
        },
        props.style,
      ]}
      numberOfLines={1}
      adjustsFontSizeToFit
    >
      {props.text}
    </Text>
  );
}

/** Champ libellé (téléphone, recherche) : pilule blanche + préfixe éventuel. */
export function Field(props: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  lang: Lang;
  prefix?: string;
  icon?: IconName;
  keyboardType?: "phone-pad" | "number-pad" | "default" | "decimal-pad";
  secure?: boolean;
  maxLength?: number;
  inputRef?: React.RefObject<TextInput>;
  returnKeyType?: "next" | "done" | "search";
  onSubmitEditing?: () => void;
  ariaLabel: string;
  mono?: boolean;
  trailing?: React.ReactNode;
}): React.JSX.Element {
  const rtl = props.lang === "ar";
  const [focused, setFocused] = useState(false);
  const inner = (
    <View
      style={{
        flexDirection: flow(rtl ? "rtl" : "ltr"),
        alignItems: "center",
        backgroundColor: COLORS.cardBg,
        borderRadius: RADIUS.pill,
        borderWidth: 1.5,
        borderColor: focused ? COLORS.primary : COLORS.border,
        paddingHorizontal: SPACE.md,
        minHeight: 52,
        gap: SPACE.sm,
      }}
    >
      {props.icon ? <Ionicons name={props.icon} size={18} color={COLORS.cardMuted} /> : null}
      {props.prefix ? (
        <View
          style={{
            backgroundColor: COLORS.contentBg,
            borderRadius: RADIUS.pill,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Text style={{ fontWeight: "800", color: COLORS.cardText, fontSize: 14 }}>
            {props.prefix}
          </Text>
        </View>
      ) : null}
      <TextInput
        ref={props.inputRef}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={COLORS.cardMuted}
        keyboardType={props.keyboardType ?? "default"}
        secureTextEntry={props.secure}
        maxLength={props.maxLength}
        aria-label={props.ariaLabel}
        autoCapitalize="none"
        returnKeyType={props.returnKeyType ?? "done"}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={props.onSubmitEditing}
        style={{
          flex: 1,
          paddingVertical: 12,
          fontSize: 16,
          fontFamily: props.mono === false ? undefined : FONTS.mono,
          color: COLORS.cardText,
          textAlign: rtl ? "right" : "left",
        }}
      />
      {props.trailing}
    </View>
  );
  if (!props.label) return inner;
  return (
    <View style={{ marginBottom: SPACE.md }}>
      <Text
        style={{
          ...TYPE.label,
          color: COLORS.cardText,
          marginBottom: 6,
          textAlign: rtl ? "right" : "left",
        }}
      >
        {props.label}
      </Text>
      {inner}
    </View>
  );
}

/** Ligne de séparation pointillée (ticket 80 mm). */
export function Dashed(props: { style?: StyleProp<ViewStyle> }): React.JSX.Element {
  return (
    <View
      style={[
        { borderTopWidth: 1, borderTopColor: COLORS.border, borderStyle: "dashed", height: 1 },
        props.style,
      ]}
    />
  );
}
