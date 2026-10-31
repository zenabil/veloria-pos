// Veloria Owner — kit UI français (LTR), lecture seule.
// Aucune action d'écriture : boutons, filtres et liens de navigation only.
import { useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { Icon, type IconName } from "./Icon.tsx";
import * as Haptics from "expo-haptics";
import { COLORS, FONTS, HAIRLINE, RADIUS, SIZES, SPACE, TYPE, tint } from "../tokens.ts";

const TAP_MIN = SIZES.touchMin;

export function haptic(kind: "light" | "warning" = "light"): void {
  if (Platform.OS === "web") return;
  const p =
    kind === "warning"
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  void p.catch(() => undefined);
}

/** Cible tactile (échelle de pression en nombres purs, pas de nœud animé). */
export function Tap(props: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  disabled?: boolean;
  scaleTo?: number;
  haptics?: boolean;
  testID?: string;
}): React.JSX.Element {
  const [pressed, setPressed] = useState(false);
  const to = props.scaleTo ?? 0.98;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      disabled={props.disabled}
      testID={props.testID}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        if (props.haptics !== false) haptic("light");
        props.onPress?.();
      }}
      style={[props.style, { transform: [{ scale: pressed ? to : 1 }] }]}
    >
      {props.children}
    </Pressable>
  );
}

export function Card(props: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: string;
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
        props.style,
      ]}
    >
      {props.children}
    </View>
  );
}

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

export type ButtonVariant = "gold" | "ink" | "quiet" | "outline" | "ghost";

const BUTTON_SKIN: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  gold: { bg: COLORS.primary, fg: COLORS.primaryText },
  ink: { bg: COLORS.headerBg, fg: COLORS.white },
  quiet: { bg: COLORS.toneBg, fg: COLORS.cardText },
  outline: { bg: COLORS.cardBg, fg: COLORS.cardText, border: COLORS.border },
  ghost: { bg: "transparent", fg: COLORS.cardMuted },
};

export function Button(props: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  size?: "md" | "lg";
  busy?: boolean;
  disabled?: boolean;
  full?: boolean;
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
          borderRadius: RADIUS.control,
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
          {props.icon ? <Icon name={props.icon} size={17} color={skin.fg} /> : null}
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

export function Chip(props: {
  label: string;
  active?: boolean;
  count?: number;
  onPress?: () => void;
  icon?: IconName;
  tone?: string;
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
        borderRadius: RADIUS.inner,
        minHeight: SIZES.chipHeight,
        paddingHorizontal: SPACE.lg,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 6,
      }}
    >
      {props.icon ? (
        <Icon
          name={props.icon}
          size={13}
          color={active ? COLORS.primary : (props.tone ?? COLORS.cardMuted)}
        />
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

export function StatusDot(props: { color: string; size?: number }): React.JSX.Element {
  const size = props.size ?? 8;
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: props.color }}
    />
  );
}

export function Badge(props: {
  label: string;
  color: string;
  icon?: IconName;
  dot?: boolean;
  background?: string;
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
          backgroundColor: props.background ?? "transparent",
          borderRadius: RADIUS.inner,
          paddingHorizontal: props.background ? 8 : 0,
          paddingVertical: props.background ? 3 : 0,
        },
        props.style,
      ]}
    >
      {props.dot !== false ? <StatusDot color={props.color} size={7} /> : null}
      {props.icon ? <Icon name={props.icon} size={12} color={props.color} /> : null}
      <Text style={{ color: props.color, fontWeight: "700", fontSize: 12 }}>{props.label}</Text>
    </View>
  );
}

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
      <Icon name={props.icon} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

export function SectionHead(props: {
  title: string;
  actionLabel?: string;
  onPress?: () => void;
  caption?: string;
  right?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: SPACE.xl,
        marginBottom: SPACE.sm,
        paddingHorizontal: SPACE.xs,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ ...TYPE.headline, color: COLORS.cardText }}>{props.title}</Text>
        {props.caption ? (
          <Text style={{ ...TYPE.label, color: COLORS.cardMuted, marginTop: 2 }}>
            {props.caption}
          </Text>
        ) : null}
      </View>
      {props.right}
      {props.actionLabel ? (
        <Tap
          onPress={props.onPress}
          accessibilityLabel={props.actionLabel}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 2,
            minHeight: TAP_MIN,
            paddingHorizontal: SPACE.xs,
          }}
        >
          <Text style={{ color: COLORS.headerBg, fontWeight: "800", fontSize: 13 }}>
            {props.actionLabel}
          </Text>
          <Icon name="chevron-forward" size={14} color={COLORS.headerBg} />
        </Tap>
      ) : null}
    </View>
  );
}

/** Montant tabulaire : jamais de gigue entre deux lignes. */
export function Amount(props: {
  text: string;
  tone?: string;
  size?: number;
  align?: TextStyle["textAlign"];
  weight?: TextStyle["fontWeight"];
  style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  return (
    <Text
      style={[
        {
          fontFamily: FONTS.mono,
          fontWeight: props.weight ?? "800",
          fontSize: props.size ?? 16,
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

export function Field(props: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  icon?: IconName;
  keyboardType?: "email-address" | "default";
  secure?: boolean;
  trailing?: React.ReactNode;
  ariaLabel: string;
  autoComplete?: "email" | "password" | "off";
  returnKeyType?: "next" | "done" | "go";
  onSubmitEditing?: () => void;
  skin?: "sunken" | "navy" | "outlined";
}): React.JSX.Element {
  const navy = props.skin === "navy";
  const outlined = props.skin === "outlined";
  const [focused, setFocused] = useState(false);
  const inner = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: navy
          ? COLORS.navySoft
          : focused || outlined
            ? COLORS.cardBg
            : COLORS.sunkenBg,
        borderRadius: RADIUS.control,
        borderWidth: 1,
        borderColor: focused
          ? COLORS.primary
          : navy
            ? COLORS.navyLine
            : outlined
              ? COLORS.border
              : "transparent",
        paddingHorizontal: SPACE.lg,
        minHeight: 52,
        gap: SPACE.sm,
      }}
    >
      {props.icon ? (
        <Icon name={props.icon} size={18} color={navy ? COLORS.navyMuted : COLORS.cardMuted} />
      ) : null}
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={navy ? COLORS.navyMuted : COLORS.cardMuted}
        keyboardType={props.keyboardType ?? "default"}
        secureTextEntry={props.secure}
        aria-label={props.ariaLabel}
        autoComplete={props.autoComplete}
        autoCapitalize="none"
        returnKeyType={props.returnKeyType ?? "done"}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={props.onSubmitEditing}
        style={{
          flex: 1,
          paddingVertical: 12,
          fontSize: 16,
          color: navy ? COLORS.headerText : COLORS.cardText,
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
          ...TYPE.badge,
          color: navy ? COLORS.navyMuted : COLORS.cardMuted,
          letterSpacing: 0.6,
          marginBottom: 6,
          textTransform: "uppercase",
        }}
      >
        {props.label}
      </Text>
      {inner}
    </View>
  );
}

export function Segmented<T extends string>(props: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}): React.JSX.Element {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: COLORS.cardBg,
        borderRadius: RADIUS.control,
        ...HAIRLINE,
        padding: 4,
        gap: 4,
      }}
    >
      {props.options.map((o) => {
        const active = o.value === props.value;
        return (
          <Tap
            key={o.value}
            onPress={() => props.onChange(o.value)}
            accessibilityLabel={o.label}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: RADIUS.inner,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: active ? COLORS.headerBg : "transparent",
            }}
          >
            <Text
              style={{
                fontWeight: "700",
                fontSize: 14,
                color: active ? COLORS.primary : COLORS.cardMuted,
              }}
            >
              {o.label}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

export function ProgressBar(props: {
  percent: number;
  color: string;
  track?: string;
  height?: number;
}): React.JSX.Element {
  const pct = Math.max(0, Math.min(100, props.percent));
  return (
    <View
      style={{
        height: props.height ?? 6,
        borderRadius: RADIUS.pill,
        backgroundColor: props.track ?? COLORS.sunkenBg,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: RADIUS.pill,
          backgroundColor: props.color,
        }}
      />
    </View>
  );
}

/** Barres verticales (7/30 jours) — rendu View, aucune dépendance graphique. */
export function BarChart(props: {
  bars: { label: string; sub: string; valueMinor: number; highlight?: boolean }[];
}): React.JSX.Element {
  const max = Math.max(1, ...props.bars.map((b) => b.valueMinor));
  const height = 150;
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: height + 34 }}>
        {props.bars.map((b) => {
          const h = Math.max(6, Math.round((b.valueMinor / max) * height));
          return (
            <View key={b.label} style={{ flex: 1, alignItems: "center", gap: 6 }}>
              <Text
                style={{
                  ...TYPE.badge,
                  color: COLORS.cardMuted,
                  fontSize: 10,
                }}
                numberOfLines={1}
              >
                {Math.round(b.valueMinor / 100000)}k
              </Text>
              <View
                style={{
                  width: "100%",
                  height: h,
                  borderTopLeftRadius: 6,
                  borderTopRightRadius: 6,
                  backgroundColor: b.highlight ? COLORS.primary : COLORS.headerBg,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
        {props.bars.map((b) => (
          <View key={`${b.label}-labels`} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ ...TYPE.badge, color: COLORS.cardMuted }} numberOfLines={1}>
              {b.label}
            </Text>
            <Text style={{ fontSize: 10, color: COLORS.cardMuted }} numberOfLines={1}>
              {b.sub}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Bandeau de lecture seule (pied d'écran). */
export function ReadOnlyNote(props: { text: string }): React.JSX.Element {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACE.sm,
        backgroundColor: COLORS.toneBg,
        borderRadius: RADIUS.control,
        paddingHorizontal: SPACE.lg,
        paddingVertical: SPACE.md,
        marginTop: SPACE.xl,
      }}
    >
      <Icon name="shield-checkmark-outline" size={17} color={COLORS.cardMuted} />
      <Text style={{ ...TYPE.label, color: COLORS.cardMuted, flex: 1 }}>{props.text}</Text>
    </View>
  );
}
