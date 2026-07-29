/**
 * Conversational Onboarding — chat-style questionnaire.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, TextInput, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useTheme, SPACING, RADIUS } from "@/src/theme";
import { useAuth, apiFetch } from "@/src/auth";
import { PrimaryButton, ThemedText, Chip } from "@/src/ui";

type Step = {
  id: string;
  prompt: string;
  type: "text" | "number" | "single" | "multi";
  options?: { value: string; label: string }[];
  placeholder?: string;
  key: string;
  optional?: boolean;
};

function buildSteps(t: (k: string) => string): Step[] {
  return [
    { id: "name", prompt: t("onboarding.name"), type: "text", key: "name", placeholder: "Alex" },
    { id: "age", prompt: t("onboarding.age"), type: "number", key: "age", placeholder: "28" },
    { id: "gender", prompt: t("onboarding.gender"), type: "single", key: "gender", options: [
      { value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" },
    ]},
    { id: "height_cm", prompt: t("onboarding.height"), type: "number", key: "height_cm", placeholder: "175" },
    { id: "weight_kg", prompt: t("onboarding.weight"), type: "number", key: "weight_kg", placeholder: "72" },
    { id: "goal", prompt: t("onboarding.goal"), type: "single", key: "goal", options: [
      { value: "weight_loss", label: "Weight loss" },
      { value: "weight_gain", label: "Weight gain" },
      { value: "muscle", label: "Muscle building" },
      { value: "healthy", label: "Healthy lifestyle" },
      { value: "pregnancy", label: "Pregnancy" },
    ]},
    { id: "activity_level", prompt: t("onboarding.activity"), type: "single", key: "activity_level", options: [
      { value: "sedentary", label: "Sedentary" },
      { value: "light", label: "Light" },
      { value: "moderate", label: "Moderate" },
      { value: "active", label: "Active" },
      { value: "athlete", label: "Athlete" },
    ]},
    { id: "cuisine", prompt: t("onboarding.cuisine"), type: "multi", key: "cuisine", options: [
      { value: "mediterranean", label: "Mediterranean" },
      { value: "asian", label: "Asian" },
      { value: "italian", label: "Italian" },
      { value: "mexican", label: "Mexican" },
      { value: "indian", label: "Indian" },
      { value: "russian", label: "Russian" },
      { value: "american", label: "American" },
      { value: "middle_eastern", label: "Middle Eastern" },
    ], optional: true },
    { id: "allergies", prompt: t("onboarding.allergies"), type: "multi", key: "allergies", options: [
      { value: "peanuts", label: "Peanuts" },
      { value: "gluten", label: "Gluten" },
      { value: "dairy", label: "Dairy" },
      { value: "eggs", label: "Eggs" },
      { value: "shellfish", label: "Shellfish" },
      { value: "soy", label: "Soy" },
      { value: "none", label: "None" },
    ], optional: true },
    { id: "avoid_foods", prompt: t("onboarding.avoid"), type: "multi", key: "avoid_foods", options: [
      { value: "pork", label: "Pork" },
      { value: "beef", label: "Beef" },
      { value: "fish", label: "Fish" },
      { value: "sugar", label: "Sugar" },
      { value: "processed", label: "Processed food" },
    ], optional: true },
    { id: "meals_per_day", prompt: t("onboarding.meals"), type: "single", key: "meals_per_day", options: [
      { value: "3", label: "3" }, { value: "4", label: "4" }, { value: "5", label: "5" },
    ]},
  ];
}

type Bubble = { role: "ai" | "user"; text: string };

export default function OnboardingScreen() {
  const { colors, t, lang } = useTheme();
  const { refresh } = useAuth();
  const insets = useSafeAreaInsets();
  const steps = useMemo(() => buildSteps(t), [t]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [bubbles, setBubbles] = useState<Bubble[]>([
    { role: "ai", text: t("onboarding.hi") },
    { role: "ai", text: t("onboarding.begin") },
    { role: "ai", text: steps[0].prompt },
  ]);
  const [input, setInput] = useState("");
  const [multi, setMulti] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [bubbles]);

  const current = steps[index];

  const advance = async (answer: any, displayText?: string) => {
    const key = current.key;
    const nextAnswers = { ...answers, [key]: answer };
    setAnswers(nextAnswers);
    setInput("");
    setMulti([]);
    const nextBubbles: Bubble[] = [...bubbles, { role: "user", text: displayText ?? String(answer) }];
    if (index < steps.length - 1) {
      const next = steps[index + 1];
      nextBubbles.push({ role: "ai", text: next.prompt });
      setBubbles(nextBubbles);
      setIndex(index + 1);
    } else {
      nextBubbles.push({ role: "ai", text: t("onboarding.done") });
      setBubbles(nextBubbles);
      setSubmitting(true);
      try {
        const payload: any = { ...nextAnswers, language: lang };
        // number coercion
        for (const k of ["age", "height_cm", "weight_kg", "meals_per_day"]) {
          if (payload[k] != null) payload[k] = Number(payload[k]);
        }
        await apiFetch("/profile", { method: "PUT", body: JSON.stringify(payload) });
        await refresh();
        router.replace("/(tabs)");
      } catch (e: any) {
        setBubbles((b) => [...b, { role: "ai", text: "Failed to save. Please retry." }]);
        setSubmitting(false);
      }
    }
  };

  const submitTextOrNumber = () => {
    if (!input.trim()) return;
    if (current.type === "number") {
      const n = Number(input.replace(",", "."));
      if (!Number.isFinite(n)) return;
      advance(n);
    } else {
      advance(input.trim());
    }
  };

  const toggleMulti = (v: string) => {
    setMulti((m) => (m.includes(v) ? m.filter((x) => x !== v) : [...m, v]));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="onboarding-screen">
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="leaf" size={20} color={colors.onBrandPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText weight="500" size={16}>Nutriflow</ThemedText>
            <ThemedText size={12} color={colors.onSurfaceTertiary}>{`${index + 1} / ${steps.length}`}</ThemedText>
          </View>
        </View>
        {/* progress */}
        <View style={{ marginHorizontal: 20, height: 4, backgroundColor: colors.surfaceTertiary, borderRadius: 2, overflow: "hidden" }}>
          <View style={{ width: `${((index + 1) / steps.length) * 100}%`, height: "100%", backgroundColor: colors.brandPrimary }} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={0}>
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 20 }}>
            {bubbles.map((b, i) => (
              <View key={i} style={{ flexDirection: b.role === "ai" ? "row" : "row-reverse", marginTop: 12 }}>
                <View style={{
                  maxWidth: "82%",
                  backgroundColor: b.role === "ai" ? colors.surfaceSecondary : colors.brandPrimary,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 18,
                  borderBottomLeftRadius: b.role === "ai" ? 4 : 18,
                  borderBottomRightRadius: b.role === "ai" ? 18 : 4,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                }}>
                  <ThemedText color={b.role === "ai" ? colors.onSurface : colors.onBrandPrimary} size={15}>{b.text}</ThemedText>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Input area */}
          {!submitting && (
            <View style={{ padding: 16, paddingBottom: 16 + Math.max(0, insets.bottom - 8), backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              {current.type === "text" || current.type === "number" ? (
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <TextInput
                    testID={`onb-input-${current.id}`}
                    value={input}
                    onChangeText={setInput}
                    placeholder={current.placeholder}
                    placeholderTextColor={colors.onSurfaceTertiary}
                    keyboardType={current.type === "number" ? "decimal-pad" : "default"}
                    onSubmitEditing={submitTextOrNumber}
                    returnKeyType="send"
                    style={{
                      flex: 1,
                      backgroundColor: colors.surfaceTertiary,
                      color: colors.onSurface,
                      borderRadius: RADIUS.pill,
                      paddingHorizontal: 18,
                      paddingVertical: Platform.OS === "ios" ? 14 : 10,
                      fontSize: 16,
                    }}
                  />
                  <TouchableOpacity testID={`onb-send-${current.id}`} onPress={submitTextOrNumber} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="arrow-up" size={22} color={colors.onBrandPrimary} />
                  </TouchableOpacity>
                </View>
              ) : current.type === "single" ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {current.options!.map((o) => (
                    <Chip key={o.value} testID={`onb-opt-${current.id}-${o.value}`} label={o.label} onPress={() => advance(o.value, o.label)} />
                  ))}
                </View>
              ) : (
                <View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 12 }}>
                    {current.options!.map((o) => (
                      <Chip key={o.value} testID={`onb-multi-${current.id}-${o.value}`} label={o.label} active={multi.includes(o.value)} onPress={() => toggleMulti(o.value)} />
                    ))}
                  </ScrollView>
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                    {current.optional ? (
                      <TouchableOpacity testID={`onb-skip-${current.id}`} onPress={() => advance([], t("onboarding.skip"))} style={{ flex: 1, paddingVertical: 14, alignItems: "center", justifyContent: "center", borderRadius: RADIUS.pill, backgroundColor: colors.surfaceTertiary }}>
                        <ThemedText size={15}>{t("onboarding.skip")}</ThemedText>
                      </TouchableOpacity>
                    ) : null}
                    <PrimaryButton testID={`onb-next-${current.id}`} title={t("onboarding.next")} onPress={() => advance(multi, multi.length ? multi.join(", ") : t("onboarding.skip"))} style={{ flex: 1 }} disabled={!current.optional && multi.length === 0} />
                  </View>
                </View>
              )}
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
