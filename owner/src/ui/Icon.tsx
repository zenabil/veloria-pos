// Veloria Owner — Ionicons via la police native embarquée (même correctif
// que l'APK client : @expo/vector-icons échoue parfois en release Android).
import { Platform, Text } from "react-native";
import type { StyleProp, TextStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const GLYPHS = Ionicons.getRawGlyphMap() as Record<string, number>;

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function Icon(props: {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  if (Platform.OS === "web") {
    return <Ionicons name={props.name} size={props.size} color={props.color} style={props.style} />;
  }
  const code = GLYPHS[props.name as string];
  return (
    <Text
      selectable={false}
      accessible={false}
      allowFontScaling={false}
      style={[
        { fontSize: props.size ?? 12, color: props.color ?? "black" },
        props.style,
        { fontFamily: "Ionicons", fontWeight: "normal", fontStyle: "normal" },
      ]}
    >
      {typeof code === "number" ? String.fromCodePoint(code) : "?"}
    </Text>
  );
}
