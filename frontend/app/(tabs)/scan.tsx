/**
 * Photo Food Scanner
 */
import React, { useState } from "react";
import { View, TouchableOpacity, ScrollView, ActivityIndicator, Image, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { apiFetch } from "@/src/auth";
import { useTheme, SPACING, RADIUS } from "@/src/theme";
import { Card, ThemedText, HeaderGradient, PrimaryButton, SecondaryButton, MacroRing } from "@/src/ui";

type ScanResult = {
  scan_id?: string;
  food_name: string;
  calories: number; protein_g: number; fat_g: number; carbs_g: number; fiber_g: number; sugar_g: number;
  health_score: number; portion_estimate: string; healthier_version: string;
};

export default function ScanScreen() {
  const { colors, t } = useTheme();
  const insets = useSafeAreaInsets();
  const [image, setImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (fromCamera: boolean) => {
    setError(null);
    setResult(null);
    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        setError("Camera permission is needed. Please enable in Settings.");
        return;
      }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.7 });
      if (!r.canceled && r.assets?.[0]) {
        setImage(r.assets[0].uri);
        setImageBase64(r.assets[0].base64 || null);
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        setError("Photos permission is needed. Please enable in Settings.");
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.7 });
      if (!r.canceled && r.assets?.[0]) {
        setImage(r.assets[0].uri);
        setImageBase64(r.assets[0].base64 || null);
      }
    }
  };

  const analyze = async () => {
    if (!imageBase64) return;
    setScanning(true);
    setError(null);
    try {
      const r = await apiFetch<ScanResult>("/scan/food", {
        method: "POST",
        body: JSON.stringify({ image_base64: imageBase64 }),
      });
      setResult(r);
    } catch (e: any) {
      setError(e?.message || "Analysis failed");
    } finally {
      setScanning(false);
    }
  };

  const reset = () => { setImage(null); setImageBase64(null); setResult(null); setError(null); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="scan-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}>
        <HeaderGradient>
          <SafeAreaView edges={["top"]}>
            <ThemedText weight="500" size={28}>{t("scan.title")}</ThemedText>
            <ThemedText size={14} color={colors.onSurfaceTertiary} style={{ marginTop: 4 }}>Snap a photo, get instant macros</ThemedText>
          </SafeAreaView>
        </HeaderGradient>

        <View style={{ padding: 20, gap: 16 }}>
          {image ? (
            <View style={{ borderRadius: RADIUS.lg, overflow: "hidden", position: "relative" }}>
              <Image source={{ uri: image }} style={{ width: "100%", height: 260 }} resizeMode="cover" />
              <TouchableOpacity testID="scan-reset-btn" onPress={reset} style={{ position: "absolute", top: 12, right: 12, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 999, width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <Card>
              <View style={{ alignItems: "center", paddingVertical: 32 }}>
                <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="camera" size={38} color={colors.onBrandSecondary} />
                </View>
                <ThemedText weight="500" size={17} style={{ marginTop: 16 }}>Point at your meal</ThemedText>
                <ThemedText size={13} color={colors.onSurfaceTertiary} style={{ marginTop: 4, textAlign: "center" }}>
                  Our AI will detect food and calculate macros instantly
                </ThemedText>
              </View>
            </Card>
          )}

          {!image ? (
            <View style={{ gap: 10 }}>
              <PrimaryButton testID="scan-camera-btn" title={t("scan.take_photo")} onPress={() => pick(true)} icon={<Ionicons name="camera" size={18} color={colors.onBrandPrimary} />} />
              <SecondaryButton testID="scan-upload-btn" title={t("scan.upload")} onPress={() => pick(false)} icon={<Ionicons name="image" size={18} color={colors.onBrandSecondary} />} />
            </View>
          ) : (
            !result && (
              <PrimaryButton testID="scan-analyze-btn" title={scanning ? t("scan.analyzing") : "Analyze"} onPress={analyze} loading={scanning} icon={<Ionicons name="sparkles" size={18} color={colors.onBrandPrimary} />} />
            )
          )}

          {error ? (
            <Card><ThemedText color={colors.error} size={14}>{error}</ThemedText></Card>
          ) : null}

          {result && (
            <Card testID="scan-result">
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <ThemedText size={13} color={colors.onSurfaceTertiary}>{t("scan.result_title")}</ThemedText>
                  <ThemedText weight="500" size={22} style={{ marginTop: 4 }}>{result.food_name}</ThemedText>
                  <ThemedText size={13} color={colors.onSurfaceTertiary} style={{ marginTop: 4 }}>{result.portion_estimate}</ThemedText>
                </View>
                <MacroRing size={80} strokeWidth={8} progress={(result.health_score || 0) / 100} color={colors.success} label="Health" value={`${result.health_score}`} />
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 20 }}>
                {[
                  { label: "kcal", value: result.calories, color: colors.brandPrimary },
                  { label: "P", value: result.protein_g + "g", color: colors.protein },
                  { label: "F", value: result.fat_g + "g", color: colors.fat },
                  { label: "C", value: result.carbs_g + "g", color: colors.carbs },
                  { label: "Sugar", value: (result.sugar_g || 0) + "g", color: colors.warning },
                ].map((s) => (
                  <View key={s.label} style={{ alignItems: "center" }}>
                    <ThemedText size={11} color={colors.onSurfaceTertiary}>{s.label}</ThemedText>
                    <ThemedText weight="500" size={16} color={s.color}>{s.value}</ThemedText>
                  </View>
                ))}
              </View>

              {result.healthier_version ? (
                <View style={{ marginTop: 16, padding: 14, backgroundColor: colors.brandTertiary, borderRadius: RADIUS.md }}>
                  <ThemedText size={12} weight="500" color={colors.onBrandTertiary}>{t("scan.healthier")}</ThemedText>
                  <ThemedText size={13} color={colors.onBrandTertiary} style={{ marginTop: 4 }}>{result.healthier_version}</ThemedText>
                </View>
              ) : null}
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
