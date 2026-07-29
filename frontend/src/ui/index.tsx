/**
 * Shared UI primitives — buttons, cards, macro rings, glass panels.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, TextStyle, TextInput, TextInputProps, Platform, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Svg, { Circle, G } from "react-native-svg";
import { useTheme, SPACING, RADIUS } from "@/src/theme";

export function ThemedView({ style, children, testID }: { style?: ViewStyle | ViewStyle[]; children: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  return <View testID={testID} style={[{ backgroundColor: colors.surface, flex: 1 }, style as any]}>{children}</View>;
}

export function ThemedText({ style, children, weight = "400", size = 16, color, testID }: { style?: TextStyle | TextStyle[]; children: React.ReactNode; weight?: "400" | "500"; size?: number; color?: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Text testID={testID} style={[{ color: color ?? colors.onSurface, fontSize: size, fontWeight: weight as any, letterSpacing: -0.2 }, style as any]}>
      {children}
    </Text>
  );
}

export function Card({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; testID?: string }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: colors.surfaceSecondary,
          borderRadius: RADIUS.lg,
          padding: SPACING.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          shadowColor: scheme === "dark" ? "#000" : "#000",
          shadowOpacity: scheme === "dark" ? 0.4 : 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        },
        style as any,
      ]}
    >
      {children}
    </View>
  );
}

export function GlassCard({ children, style, tint = "regular", testID }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; tint?: "light" | "dark" | "regular"; testID?: string }) {
  const { colors, scheme } = useTheme();
  const blurTint = tint === "regular" ? (scheme === "dark" ? "dark" : "light") : tint;
  return (
    <View testID={testID} style={[{ borderRadius: RADIUS.lg, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, style as any]}>
      {Platform.OS === "web" ? (
        <View style={[{ backgroundColor: scheme === "dark" ? "rgba(26,34,31,0.85)" : "rgba(255,255,255,0.85)", padding: SPACING.lg }]}>{children}</View>
      ) : (
        <BlurView intensity={40} tint={blurTint as any} style={{ padding: SPACING.lg }}>{children}</BlurView>
      )}
    </View>
  );
}

export function PrimaryButton({ title, onPress, disabled, loading, style, testID, icon }: { title: string; onPress: () => void; disabled?: boolean; loading?: boolean; style?: ViewStyle; testID?: string; icon?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[{
        backgroundColor: colors.brandPrimary,
        borderRadius: RADIUS.pill,
        paddingVertical: 16,
        paddingHorizontal: 24,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        opacity: disabled ? 0.5 : 1,
      }, style]}
    >
      {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
        <>
          {icon}
          <Text style={{ color: colors.onBrandPrimary, fontWeight: "500", fontSize: 16 }}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function SecondaryButton({ title, onPress, disabled, style, testID, icon }: { title: string; onPress: () => void; disabled?: boolean; style?: ViewStyle; testID?: string; icon?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[{
        backgroundColor: colors.brandSecondary,
        borderRadius: RADIUS.pill,
        paddingVertical: 14,
        paddingHorizontal: 20,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
      }, style]}
    >
      {icon}
      <Text style={{ color: colors.onBrandSecondary, fontWeight: "500", fontSize: 16 }}>{title}</Text>
    </TouchableOpacity>
  );
}

export function GhostButton({ title, onPress, style, testID }: { title: string; onPress: () => void; style?: ViewStyle; testID?: string }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.7} style={[{ paddingVertical: 12 }, style]}>
      <Text style={{ color: colors.brandPrimary, fontWeight: "500", fontSize: 15 }}>{title}</Text>
    </TouchableOpacity>
  );
}

export function TextField({ style, testID, ...rest }: TextInputProps & { testID?: string }) {
  const { colors } = useTheme();
  return (
    <TextInput
      testID={testID}
      placeholderTextColor={colors.onSurfaceTertiary}
      {...rest}
      style={[{
        backgroundColor: colors.surfaceTertiary,
        borderRadius: RADIUS.md,
        paddingHorizontal: 16,
        paddingVertical: Platform.OS === "ios" ? 14 : 10,
        fontSize: 16,
        color: colors.onSurface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      }, style as any]}
    />
  );
}

// ---- Macro Ring (Apple Fitness style) ----
export function MacroRing({
  size = 100,
  strokeWidth = 10,
  progress,
  color,
  bgColor,
  label,
  value,
  testID,
}: {
  size?: number;
  strokeWidth?: number;
  progress: number; // 0..1
  color: string;
  bgColor?: string;
  label?: string;
  value?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const dashOffset = circumference * (1 - clamped);

  return (
    <View testID={testID} style={{ alignItems: "center", justifyContent: "center", width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={bgColor ?? colors.surfaceTertiary} strokeWidth={strokeWidth} fill="none" />
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" strokeDasharray={`${circumference}, ${circumference}`} strokeDashoffset={dashOffset} strokeLinecap="round" />
        </G>
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        {value ? <Text style={{ color: colors.onSurface, fontSize: 18, fontWeight: "500" }}>{value}</Text> : null}
        {label ? <Text style={{ color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 }}>{label}</Text> : null}
      </View>
    </View>
  );
}

export function HeaderGradient({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { colors, scheme } = useTheme();
  const c1 = scheme === "dark" ? "#1A2C23" : "#EAF2EE";
  const c2 = colors.surface;
  return (
    <LinearGradient colors={[c1, c2]} style={[{ paddingTop: 60, paddingHorizontal: 20, paddingBottom: 24 }, style]}>
      {children}
    </LinearGradient>
  );
}

export function Chip({ label, active, onPress, testID }: { label: string; active?: boolean; onPress?: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        height: 36,
        paddingHorizontal: 14,
        borderRadius: RADIUS.pill,
        backgroundColor: active ? colors.brandPrimary : colors.surfaceSecondary,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? colors.brandPrimary : colors.border,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Text style={{ color: active ? colors.onBrandPrimary : colors.onSurface, fontSize: 13, fontWeight: "500" }}>{label}</Text>
    </TouchableOpacity>
  );
}
