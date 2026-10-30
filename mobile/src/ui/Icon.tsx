// Veloria Client — Icône Ionicons rendue par la police NATIVE embarquée.
// @expo/vector-icons charge sa police à l'exécution via expo-asset ; ce chemin
// échoue silencieusement sur certains Android (toutes les icônes vides dans
// l'APK release). La police vit dans android/app/src/main/assets/fonts/
// Ionicons.ttf (source assets/fonts/Ionicons.ttf) : ReactFontManager la
// résout au démarrage, on dessine donc le glyphe directement, sans
// Font.loadAsync ni téléchargement d'asset.
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
  // Web : le composant d'origine est fiable (police injectée par expo-font).
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
