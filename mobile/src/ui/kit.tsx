// Veloria Client — Kit UI V4 « Daylight plat ».
// Vocabulaire visuel de la refonte (aligné ADR-148 du POS) : on sépare par un
// filet, on n'empile plus les surfaces, un seul accent fort (l'or) pour
// l'action principale. Aucune logique métier ici : purement visuel.
import { useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { COLORS, FONTS, HAIRLINE, RADIUS, SHADOW, SIZES, SPACE, TYPE, tint } from "../tokens.ts";
import type { Lang } from "../i18n.ts";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export type Flow = "row" | "row-reverse";

const TAP_MIN = SIZES.touchMin;
const CHIP_HEIGHT = SIZES.filterChipHeight;
const AMOUNT_MD = SIZES.amountMd;

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

/** Cible tactile (scale 0.98) + retour haptique léger.
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
  const to = props.scaleTo ?? 0.98;
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

/** Surface claire à filet (V4 : la séparation n'est plus une ombre). */
export function Card(props: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: string;
  raised?: boolean;
  padded?: boolean;
}): React.JSX.Element {
  return (
    <View
      style={[
        {
          backgroundColor: props.tone ?? COLORS.cardBg,
          borderRadius: RADIUS.card,
          padding: props.padded === false ? 0 : SPACE.lg,
          ...HAIRLINE,
        },
        props.raised ? SHADOW.raised : null,
        props.style,
      ]}
    >
      {props.children}
    </View>
  );
}

/** Groupe de lignes : une surface, des filets internes (plus de carte par ligne). */
export function Group(props: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <View
      style={[
        {
          backgroundColor: COLORS.cardBg,
          borderRadius: RADIUS.card,
          overflow: "hidden",
          ...HAIRLINE,
        },
        props.style,
      ]}
    >
      {props.children}
    </View>
  );
}

/** Filet interne d'un groupe (jamais deux épaissesurs différentes). */
export function Divider(props: { inset?: number }): React.JSX.Element {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: COLORS.divider,
        marginLeft: props.inset ?? 0,
      }}
    />
  );
}

/** Ligne de liste tactile : 60 dp, titre + détail, valeur au bord extérieur. */
export function Row(props: {
  title: string;
  caption?: string;
  value?: string;
  valueTone?: string;
  badge?: React.ReactNode;
  icon?: IconName;
  iconTone?: string;
  chevron?: boolean;
  dir: "rtl" | "ltr";
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}): React.JSX.Element {
  const rtl = props.dir === "rtl";
  const body = (
    <View
      style={{
        minHeight: SIZES.rowHeight,
        paddingHorizontal: SPACE.lg,
        paddingVertical: SPACE.md,
        flexDirection: flow(props.dir),
        alignItems: "center",
        gap: SPACE.md,
        backgroundColor: COLORS.cardBg,
      }}
    >
      {props.icon ? <IconBubble icon={props.icon} color={props.iconTone} size={34} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            ...TYPE.headline,
            color: COLORS.cardText,
            textAlign: props.dir === "rtl" ? "right" : "left",
          }}
          numberOfLines={1}
        >
          {props.title}
        </Text>
        {props.caption || props.badge ? (
          <View
            style={{
              flexDirection: flow(props.dir),
              alignItems: "center",
              gap: SPACE.sm,
            }}
          >
            {props.caption ? (
              <Text style={{ ...TYPE.caption, color: COLORS.cardMuted }} numberOfLines={1}>
                {props.caption}
              </Text>
            ) : null}
            {props.badge}
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: rtl ? "flex-start" : "flex-end" }}>
        {props.value ? (
          <Amount text={props.value} tone={props.valueTone} align={farEdge(rtl)} />
        ) : null}
      </View>
      {props.chevron ? (
        <Ionicons
          name={props.dir === "rtl" ? "chevron-back" : "chevron-forward"}
          size={16}
          color={COLORS.inkFaint}
        />
      ) : null}
    </View>
  );
  if (!props.onPress) return body;
  return (
    <Tap
      onPress={props.onPress}
      accessibilityLabel={props.accessibilityLabel ?? props.title}
      testID={props.testID}
      style={{ backgroundColor: COLORS.cardBg }}
    >
      {body}
    </Tap>
  );
}

export type ButtonVariant = "gold" | "ink" | "quiet" | "outline" | "ghost" | "danger" | "success";

const BUTTON_SKIN: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  gold: { bg: COLORS.primary, fg: COLORS.primaryText },
  ink: { bg: COLORS.headerBg, fg: COLORS.white },
  quiet: { bg: COLORS.toneBg, fg: COLORS.cardText },
  outline: { bg: COLORS.cardBg, fg: COLORS.cardText, border: COLORS.border },
  ghost: { bg: "transparent", fg: COLORS.cardMuted },
  danger: { bg: COLORS.dangerTone, fg: COLORS.debtOverdue, border: tint(COLORS.debtOverdue, "33") },
  success: { bg: COLORS.debtOk, fg: COLORS.white },
};

/** Bouton arrondi-rectangle (V4 : plus de pilule + halo pour les actions). */
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
  full?: boolean;
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
          borderRadius: RADIUS.button,
          minHeight: lg ? 54 : TAP_MIN,
          paddingHorizontal: SPACE.lg,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: SPACE.sm,
          opacity: off ? 0.5 : 1,
        },
        props.full ? { alignSelf: "stretch" } : null,
        props.style,
      ]}
    >
      {props.busy ? (
        <Text style={{ color: skin.fg, fontWeight: "800" }}>…</Text>
      ) : (
        <>
          {props.icon ? <Ionicons name={props.icon} size={17} color={skin.fg} /> : null}
          <Text
            style={{
              color: skin.fg,
              fontWeight: "800",
              fontSize: lg ? 15 : 14,
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

/** Puce de filtre (sélection : encre, repos : blanc à filet). */
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
      }}
    >
      {props.icon && active ? (
        <Ionicons name={props.icon} size={13} color={COLORS.primary} />
      ) : null}
      <Text
        style={{ color: active ? COLORS.white : COLORS.cardText, fontWeight: "700", fontSize: 13 }}
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

/** Pastille d'état : point + texte teinté (V4), plus de gros fonds colorés. */
export function Badge(props: {
  label: string;
  color: string;
  icon?: IconName;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          alignSelf: "flex-start",
        },
        props.style,
      ]}
    >
      {props.dot !== false ? (
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: props.color,
          }}
        />
      ) : null}
      {props.icon ? <Ionicons name={props.icon} size={12} color={props.color} /> : null}
      <Text style={{ color: props.color, fontWeight: "700", fontSize: 12 }}>{props.label}</Text>
    </View>
  );
}

/** Pastille circulaire d'icône (groupes, timeline, états vides). */
export function IconBubble(props: {
  icon: IconName;
  color?: string;
  bg?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const size = props.size ?? 34;
  const color = props.color ?? COLORS.cardText;
  const bg = props.bg ?? tint(color, "12");
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
        marginTop: SPACE.xl,
        marginBottom: SPACE.sm,
        paddingHorizontal: SPACE.xs,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            ...TYPE.label,
            color: COLORS.cardMuted,
            letterSpacing: 0.6,
            textAlign: props.dir === "rtl" ? "right" : "left",
          }}
        >
          {props.title}
        </Text>
        {props.caption ? (
          <Text style={{ ...TYPE.caption, color: COLORS.inkFaint, marginTop: 2 }}>
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
            minHeight: TAP_MIN,
          }}
        >
          <Text style={{ color: COLORS.headerBg, fontWeight: "800", fontSize: 13 }}>
            {props.actionLabel}
          </Text>
          <Ionicons
            name={props.dir === "rtl" ? "chevron-back" : "chevron-forward"}
            size={14}
            color={COLORS.headerBg}
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

/** Champ libellé (téléphone, recherche) : surface en creux, focus au filet. */
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
        backgroundColor: focused ? COLORS.cardBg : COLORS.sunkenBg,
        borderRadius: RADIUS.field,
        borderWidth: 1.5,
        borderColor: focused ? COLORS.primary : "transparent",
        paddingHorizontal: SPACE.md,
        minHeight: 52,
        gap: SPACE.sm,
      }}
    >
      {props.icon ? <Ionicons name={props.icon} size={18} color={COLORS.cardMuted} /> : null}
      {props.prefix ? (
        <Text style={{ fontWeight: "800", color: COLORS.cardMuted, fontSize: 14 }}>
          {props.prefix}
        </Text>
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
          color: COLORS.cardMuted,
          letterSpacing: 0.4,
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
        {
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          borderStyle: "dashed",
          height: 1,
          opacity: 0.7,
        },
        props.style,
      ]}
    />
  );
}
