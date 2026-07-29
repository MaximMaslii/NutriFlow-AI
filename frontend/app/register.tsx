import React, { useState } from "react";
import { View, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as ExpoLinking from "expo-linking";

import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme";
import { PrimaryButton, SecondaryButton, TextField, ThemedText, GhostButton } from "@/src/ui";

export default function RegisterScreen() {
  const { signUpEmail, signInGoogleSession } = useAuth();
  const { colors, t } = useTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await signUpEmail(email.trim(), password, name.trim() || undefined);
      router.replace("/");
    } catch (e: any) {
      setError(e?.message || t("auth.error"));
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setError(null);
    setLoading(true);
    try {
      const redirectUrl =
        Platform.OS === "web"
          ? (typeof window !== "undefined" ? window.location.origin + "/" : "")
          : ExpoLinking.createURL("");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.location.href = authUrl;
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type !== "success" || !result.url) { setLoading(false); return; }
      const url = result.url;
      const hash = url.split("#")[1] || "";
      const query = url.split("?")[1] || "";
      const params = new URLSearchParams(hash || query);
      const sessionId = params.get("session_id");
      if (!sessionId) throw new Error("No session_id");
      await signInGoogleSession(sessionId);
      router.replace("/");
    } catch (e: any) {
      setError(e?.message || t("auth.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 8 }}>
            <TouchableOpacity onPress={() => router.back()} testID="register-back-btn" style={{ padding: 8, marginLeft: -8 }}>
              <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
            </TouchableOpacity>

            <ThemedText weight="500" size={32} style={{ marginTop: 24 }}>{t("cta.sign_up")}</ThemedText>
            <ThemedText color={colors.onSurfaceTertiary} size={15} style={{ marginTop: 8 }}>{t("app.name")}</ThemedText>

            <View style={{ marginTop: 40, gap: 12 }}>
              <TextField testID="register-name-input" placeholder={t("auth.name")} value={name} onChangeText={setName} />
              <TextField testID="register-email-input" placeholder={t("auth.email")} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
              <TextField testID="register-password-input" placeholder={t("auth.password")} secureTextEntry value={password} onChangeText={setPassword} />
              {error ? <ThemedText color={colors.error} size={13}>{error}</ThemedText> : null}
              <PrimaryButton testID="register-submit-btn" title={t("auth.register")} onPress={submit} loading={loading} />
              <SecondaryButton testID="register-google-btn" title={t("cta.google")} onPress={google} icon={<Ionicons name="logo-google" size={18} color={colors.onBrandSecondary} />} />
              <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 8, gap: 6 }}>
                <ThemedText color={colors.onSurfaceTertiary} size={14}>{t("auth.have_account")}</ThemedText>
                <GhostButton title={t("auth.login")} onPress={() => router.replace("/login")} testID="register-goto-login-btn" />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
