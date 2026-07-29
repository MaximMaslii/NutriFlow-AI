/**
 * Meal detail modal (route: /meal?id=...)
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";

import { apiFetch } from "@/src/auth";
import { useTheme, RADIUS } from "@/src/theme";
import { Card, ThemedText, SecondaryButton, PrimaryButton } from "@/src/ui";

export default function MealDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, t } = useTheme();
  const insets = useSafeAreaInsets();
  const [meal, setMeal] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgLoading, setImgLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // fetch meals plan via meal_id: reuse /meals/plan search — simplest: get plan by scanning; better dedicated endpoint would be ideal.
      // We'll piggyback by fetching all plans and matching. Cheap.
      const plans = await apiFetch<{ plans: any[] }>("/meals/plans");
      for (const p of plans.plans || []) {
        const d = await apiFetch<{ meals: any[] }>(`/meals/plan/${p.plan_id}`);
        const found = d.meals.find((m) => m.meal_id === id);
        if (found) { setMeal(found); break; }
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load meal");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const genImage = async () => {
    if (!meal) return;
    setImgLoading(true);
    try {
      const r = await apiFetch<{ image_base64: string }>(`/meals/${meal.meal_id}/image`, { method: "POST" });
      setMeal({ ...meal, image_base64: r.image_base64 });
    } catch (e: any) {
      alert("Image generation failed: " + (e?.message || "unknown"));
    } finally {
      setImgLoading(false);
    }
  };

  if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}><ActivityIndicator color={colors.brandPrimary} /></View>;
  if (error || !meal) return (
    <View style={{ flex: 1, backgroundColor: colors.surface, padding: 24, paddingTop: 60 }}>
      <ThemedText>{error || "Not found"}</ThemedText>
      <PrimaryButton title="Back" onPress={() => router.back()} style={{ marginTop: 20 }} />
    </View>
  );

  const src = meal.image_base64 ? { uri: `data:image/png;base64,${meal.image_base64}` } : { uri: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&q=80" };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="meal-detail">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
        <View style={{ height: 320, position: "relative" }}>
          <Image source={src} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          <LinearGradient colors={["rgba(0,0,0,0.4)", "rgba(0,0,0,0)", "rgba(0,0,0,0.6)"]} style={StyleSheet.absoluteFill} />
          <SafeAreaView edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
            <View style={{ padding: 16, flexDirection: "row", justifyContent: "space-between" }}>
              <TouchableOpacity onPress={() => router.back()} testID="meal-back-btn" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="chevron-back" size={22} color="#FFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={genImage} testID="meal-gen-image-btn" disabled={imgLoading} style={{ paddingHorizontal: 14, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}>
                {imgLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="sparkles" size={16} color="#FFF" />}
                <ThemedText size={12} color="#FFF" weight="500">AI Photo</ThemedText>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
          <View style={{ position: "absolute", bottom: 16, left: 16, right: 16 }}>
            <View style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 999, marginBottom: 8 }}>
              <ThemedText size={11} weight="500" color="#11181C" style={{ textTransform: "uppercase" }}>{meal.category}</ThemedText>
            </View>
            <ThemedText weight="500" size={26} color="#FFFFFF">{meal.title}</ThemedText>
            <ThemedText size={13} color="rgba(255,255,255,0.85)" style={{ marginTop: 4 }}>{meal.description}</ThemedText>
          </View>
        </View>

        <View style={{ padding: 20, gap: 16 }}>
          {/* Macros */}
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
              {[
                { label: "kcal", value: meal.calories, color: colors.brandPrimary },
                { label: "Protein", value: meal.protein_g + "g", color: colors.protein },
                { label: "Fat", value: meal.fat_g + "g", color: colors.fat },
                { label: "Carbs", value: meal.carbs_g + "g", color: colors.carbs },
                { label: "Fiber", value: meal.fiber_g + "g", color: colors.fiber },
              ].map((s) => (
                <View key={s.label} style={{ alignItems: "center" }}>
                  <ThemedText size={11} color={colors.onSurfaceTertiary}>{s.label}</ThemedText>
                  <ThemedText weight="500" size={16} color={s.color}>{s.value}</ThemedText>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Ionicons name="time-outline" size={14} color={colors.onSurfaceTertiary} />
                <ThemedText size={13}>{meal.cooking_time_min}m</ThemedText>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Ionicons name="stats-chart-outline" size={14} color={colors.onSurfaceTertiary} />
                <ThemedText size={13} style={{ textTransform: "capitalize" }}>{meal.difficulty}</ThemedText>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Ionicons name="cash-outline" size={14} color={colors.onSurfaceTertiary} />
                <ThemedText size={13}>${meal.estimated_cost_usd?.toFixed(2)}</ThemedText>
              </View>
            </View>
          </Card>

          {/* Ingredients */}
          <Card>
            <ThemedText weight="500" size={17}>Ingredients</ThemedText>
            <View style={{ marginTop: 10, gap: 6 }}>
              {(meal.ingredients || []).map((ing: any, i: number) => (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <ThemedText size={14} color={colors.onSurfaceSecondary}>• {ing.name}</ThemedText>
                  <ThemedText size={14} color={colors.onSurfaceTertiary}>{ing.amount} {ing.unit}</ThemedText>
                </View>
              ))}
            </View>
          </Card>

          {/* Steps */}
          <Card>
            <ThemedText weight="500" size={17}>Steps</ThemedText>
            <View style={{ marginTop: 10, gap: 10 }}>
              {(meal.steps || []).map((s: string, i: number) => (
                <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }}>
                    <ThemedText size={12} weight="500" color={colors.onBrandPrimary}>{i + 1}</ThemedText>
                  </View>
                  <ThemedText size={14} color={colors.onSurfaceSecondary} style={{ flex: 1, lineHeight: 20 }}>{s}</ThemedText>
                </View>
              ))}
            </View>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
