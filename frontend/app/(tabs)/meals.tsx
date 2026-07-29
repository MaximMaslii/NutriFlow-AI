/**
 * Meal Plan tab — generate + view + replace.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, TouchableOpacity, Image, ActivityIndicator, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import { apiFetch } from "@/src/auth";
import { useTheme, SPACING, RADIUS } from "@/src/theme";
import { Card, ThemedText, PrimaryButton, HeaderGradient, Chip } from "@/src/ui";

type Meal = {
  meal_id: string; plan_id: string; day: number; category: string;
  title: string; description: string;
  calories: number; protein_g: number; fat_g: number; carbs_g: number; fiber_g: number;
  cooking_time_min: number; difficulty: string; estimated_cost_usd: number;
  ingredients: any[]; steps: string[]; image_base64?: string | null;
};

const FALLBACK_IMGS = [
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
  "https://images.unsplash.com/photo-1603046891726-36bfd957e0bf?w=800&q=80",
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
  "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&q=80",
];

export default function MealPlanScreen() {
  const { colors, t } = useTheme();
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<7 | 14 | 30>(7);
  const [plan, setPlan] = useState<{ plan_id: string; days: number } | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch<{ plans: any[] }>("/meals/plans");
      if (r.plans?.length) {
        const p = r.plans[0];
        setPlan({ plan_id: p.plan_id, days: p.days });
        const detail = await apiFetch<{ meals: Meal[] }>(`/meals/plan/${p.plan_id}`);
        setMeals(detail.meals || []);
        setSelectedDay(1);
      }
    } catch (e) { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLatest(); }, [loadLatest]);

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await apiFetch<{ plan_id: string; days: number; meals: Meal[] }>("/meals/generate", {
        method: "POST", body: JSON.stringify({ days }),
      });
      setPlan({ plan_id: r.plan_id, days: r.days });
      setMeals(r.meals || []);
      setSelectedDay(1);
    } catch (e: any) {
      alert("Generation failed: " + (e?.message || "unknown"));
    } finally {
      setGenerating(false);
    }
  };

  const replaceMeal = async (meal_id: string) => {
    setReplacing(meal_id);
    try {
      const r = await apiFetch<{ meal: Meal }>(`/meals/${meal_id}/replace`, { method: "POST" });
      setMeals((prev) => prev.map((m) => (m.meal_id === meal_id ? r.meal : m)));
    } catch (e: any) {
      alert("Replace failed: " + (e?.message || "unknown"));
    } finally {
      setReplacing(null);
    }
  };

  const dayMeals = meals.filter((m) => m.day === selectedDay);
  const dayList = plan ? Array.from({ length: plan.days }, (_, i) => i + 1) : [];

  const dayTotals = dayMeals.reduce(
    (acc, m) => ({ calories: acc.calories + m.calories, protein: acc.protein + m.protein_g, fat: acc.fat + m.fat_g, carbs: acc.carbs + m.carbs_g }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="meals-screen">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadLatest(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}
      >
        <HeaderGradient>
          <SafeAreaView edges={["top"]}>
            <ThemedText weight="500" size={28}>{t("meals.title")}</ThemedText>
            <ThemedText size={14} color={colors.onSurfaceTertiary} style={{ marginTop: 4 }}>AI-crafted for your goals</ThemedText>
          </SafeAreaView>
        </HeaderGradient>

        <View style={{ padding: 20, gap: 16 }}>
          {/* Duration selector */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            {[7, 14, 30].map((d) => (
              <Chip key={d} testID={`meals-days-${d}`} label={t(`meals.days_${d}`)} active={days === d} onPress={() => setDays(d as any)} />
            ))}
            <View style={{ flex: 1 }} />
          </View>

          <PrimaryButton
            testID="meals-generate-btn"
            title={plan ? "Regenerate" : t("meals.generate")}
            onPress={generate}
            loading={generating}
            icon={<Ionicons name="sparkles" size={18} color={colors.onBrandPrimary} />}
          />

          {plan && (
            <TouchableOpacity
              testID="meals-shopping-btn"
              onPress={() => router.push(`/shopping-list?plan_id=${plan.plan_id}`)}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="cart" size={20} color={colors.onBrandSecondary} />
                </View>
                <View>
                  <ThemedText weight="500" size={15}>{t("meals.shopping")}</ThemedText>
                  <ThemedText size={12} color={colors.onSurfaceTertiary}>Grouped by aisle</ThemedText>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
            </TouchableOpacity>
          )}

          {loading && <ActivityIndicator color={colors.brandPrimary} />}

          {plan && dayList.length > 0 && (
            <>
              {/* Day chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
                {dayList.map((d) => (
                  <Chip key={d} testID={`meals-day-${d}`} label={`${t("meals.day")} ${d}`} active={d === selectedDay} onPress={() => setSelectedDay(d)} />
                ))}
              </ScrollView>

              {/* Day totals */}
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  {[
                    { label: "kcal", value: dayTotals.calories, color: colors.brandPrimary },
                    { label: "P", value: dayTotals.protein + "g", color: colors.protein },
                    { label: "F", value: dayTotals.fat + "g", color: colors.fat },
                    { label: "C", value: dayTotals.carbs + "g", color: colors.carbs },
                  ].map((s) => (
                    <View key={s.label} style={{ alignItems: "center" }}>
                      <ThemedText size={12} color={colors.onSurfaceTertiary}>{s.label}</ThemedText>
                      <ThemedText weight="500" size={18} color={s.color}>{s.value}</ThemedText>
                    </View>
                  ))}
                </View>
              </Card>

              {/* Meals for the day */}
              {dayMeals.map((meal, idx) => (
                <MealCard
                  key={meal.meal_id}
                  meal={meal}
                  fallback={FALLBACK_IMGS[idx % FALLBACK_IMGS.length]}
                  onReplace={() => replaceMeal(meal.meal_id)}
                  replacing={replacing === meal.meal_id}
                />
              ))}
            </>
          )}

          {!plan && !loading && (
            <View style={{ alignItems: "center", padding: 40, gap: 12 }}>
              <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="restaurant-outline" size={32} color={colors.brandPrimary} />
              </View>
              <ThemedText weight="500" size={17}>{t("meals.no_plan")}</ThemedText>
              <ThemedText color={colors.onSurfaceTertiary} size={14} style={{ textAlign: "center" }}>
                Generate a personalized plan tailored to your goals
              </ThemedText>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function MealCard({ meal, fallback, onReplace, replacing }: { meal: Meal; fallback: string; onReplace: () => void; replacing: boolean }) {
  const { colors } = useTheme();
  const src = meal.image_base64 ? { uri: `data:image/png;base64,${meal.image_base64}` } : { uri: fallback };

  return (
    <TouchableOpacity
      testID={`meal-card-${meal.meal_id}`}
      onPress={() => router.push(`/meal?id=${meal.meal_id}`)}
      style={{
        borderRadius: RADIUS.lg,
        overflow: "hidden",
        backgroundColor: colors.surfaceSecondary,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      }}
    >
      <View style={{ position: "relative", height: 180 }}>
        <Image source={src} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.65)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ position: "absolute", top: 12, left: 12, backgroundColor: "rgba(255,255,255,0.9)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
          <ThemedText size={11} weight="500" color="#11181C" style={{ textTransform: "uppercase" }}>{meal.category}</ThemedText>
        </View>
        <View style={{ position: "absolute", bottom: 12, left: 12, right: 12 }}>
          <ThemedText weight="500" size={19} color="#FFFFFF">{meal.title}</ThemedText>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
            <ThemedText size={12} color="#FFFFFF">{meal.calories} kcal</ThemedText>
            <ThemedText size={12} color="#FFFFFF">•</ThemedText>
            <ThemedText size={12} color="#FFFFFF">{meal.cooking_time_min}m</ThemedText>
            <ThemedText size={12} color="#FFFFFF">•</ThemedText>
            <ThemedText size={12} color="#FFFFFF">${meal.estimated_cost_usd.toFixed(2)}</ThemedText>
          </View>
        </View>
      </View>
      <View style={{ padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flexDirection: "row", gap: 14 }}>
          <MacroBadge label="P" value={meal.protein_g} color={colors.protein} />
          <MacroBadge label="F" value={meal.fat_g} color={colors.fat} />
          <MacroBadge label="C" value={meal.carbs_g} color={colors.carbs} />
        </View>
        <TouchableOpacity
          testID={`meal-replace-${meal.meal_id}`}
          onPress={onReplace}
          disabled={replacing}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, backgroundColor: colors.brandSecondary }}
        >
          {replacing ? <ActivityIndicator size="small" color={colors.onBrandSecondary} /> : <Ionicons name="swap-horizontal" size={14} color={colors.onBrandSecondary} />}
          <ThemedText size={12} weight="500" color={colors.onBrandSecondary}>Replace</ThemedText>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function MacroBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
      <ThemedText weight="500" size={14} color={color}>{value}g</ThemedText>
      <ThemedText size={11} color={color}>{label}</ThemedText>
    </View>
  );
}
