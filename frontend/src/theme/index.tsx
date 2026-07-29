/**
 * Theme + i18n context for NutriFlow AI
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useColorScheme } from "react-native";
import { storage } from "@/src/utils/storage";

const DESIGN = {
  light: {
    surface: "#FAF9F6",
    onSurface: "#11181C",
    surfaceSecondary: "#FFFFFF",
    onSurfaceSecondary: "#3F4E4F",
    surfaceTertiary: "#F1F4F2",
    onSurfaceTertiary: "#687777",
    surfaceInverse: "#1A2121",
    onSurfaceInverse: "#FAF9F6",
    brand: "#4C7D64",
    brandPrimary: "#4C7D64",
    onBrandPrimary: "#FFFFFF",
    brandSecondary: "#D9E8E0",
    onBrandSecondary: "#2C4C3B",
    brandTertiary: "#EAF2EE",
    onBrandTertiary: "#375C48",
    success: "#3E7B62",
    warning: "#B77729",
    error: "#A83C3C",
    info: "#4A6C82",
    border: "#E6E9E9",
    borderStrong: "#CCD3D3",
    divider: "#E6E9E9",
    // charts
    protein: "#4C7D64",
    fat: "#B77729",
    carbs: "#4A6C82",
    water: "#5B9BD5",
    fiber: "#8FA382",
  },
  dark: {
    surface: "#0F1412",
    onSurface: "#ECF2EF",
    surfaceSecondary: "#1A221F",
    onSurfaceSecondary: "#B1C2BB",
    surfaceTertiary: "#25312C",
    onSurfaceTertiary: "#8A9E96",
    surfaceInverse: "#FAF9F6",
    onSurfaceInverse: "#0F1412",
    brand: "#4C7D64",
    brandPrimary: "#63A484",
    onBrandPrimary: "#0F1412",
    brandSecondary: "#254133",
    onBrandSecondary: "#9AD5B7",
    brandTertiary: "#1A2C23",
    onBrandTertiary: "#81C0A0",
    success: "#4F9678",
    warning: "#D4984F",
    error: "#C95A5A",
    info: "#6692AC",
    border: "#2A3631",
    borderStrong: "#3C4D46",
    divider: "#2A3631",
    protein: "#63A484",
    fat: "#D4984F",
    carbs: "#6692AC",
    water: "#7BB7E1",
    fiber: "#95A88A",
  },
};

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const RADIUS = { sm: 8, md: 16, lg: 24, pill: 999 };
export const FONT = { display: "System", text: "System" };

export type ColorTokens = typeof DESIGN.light;
export type Lang = "en" | "ru";

type Ctx = {
  colors: ColorTokens;
  scheme: "light" | "dark";
  setScheme: (s: "light" | "dark" | "system") => void;
  schemePref: "light" | "dark" | "system";
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
};

const ThemeContext = createContext<Ctx | null>(null);

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    "app.name": "NutriFlow AI",
    "app.tagline": "Your Personal AI Nutritionist",
    "app.subtitle": "Create a personalized nutrition plan, recipes, grocery lists and AI health recommendations in under 2 minutes.",
    "cta.start_free": "Start Free",
    "cta.watch_demo": "Watch Demo",
    "cta.continue": "Continue",
    "cta.get_started": "Get Started",
    "cta.sign_in": "Sign in",
    "cta.sign_up": "Create account",
    "cta.google": "Continue with Google",
    "cta.email": "Continue with Email",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.name": "Your name",
    "auth.login": "Sign In",
    "auth.register": "Sign Up",
    "auth.have_account": "Already have an account?",
    "auth.no_account": "New here?",
    "auth.error": "Something went wrong",
    "tabs.home": "Home",
    "tabs.meals": "Meals",
    "tabs.scan": "Scan",
    "tabs.chat": "Chat",
    "tabs.profile": "Profile",
    "dashboard.today": "Today",
    "dashboard.calories": "Calories",
    "dashboard.protein": "Protein",
    "dashboard.fat": "Fat",
    "dashboard.carbs": "Carbs",
    "dashboard.water": "Water",
    "dashboard.fiber": "Fiber",
    "dashboard.bmi": "BMI",
    "dashboard.streak": "day streak",
    "dashboard.scores": "Health Scores",
    "dashboard.metabolism": "Metabolism",
    "dashboard.nutrition": "Nutrition",
    "dashboard.hydration": "Hydration",
    "dashboard.health": "Health",
    "dashboard.target": "Target Weight",
    "dashboard.finish": "Estimated finish",
    "dashboard.habits": "Daily Habits",
    "meals.title": "Meal Plan",
    "meals.generate": "Generate Plan",
    "meals.generating": "Cooking up your plan…",
    "meals.no_plan": "No meal plan yet",
    "meals.days_7": "7 Days",
    "meals.days_14": "14 Days",
    "meals.days_30": "30 Days",
    "meals.shopping": "Shopping List",
    "meals.replace": "Replace",
    "meals.image": "Generate photo",
    "meals.day": "Day",
    "scan.title": "Food Scanner",
    "scan.take_photo": "Take Photo",
    "scan.upload": "Upload Photo",
    "scan.analyzing": "Analyzing…",
    "scan.result_title": "Scan Result",
    "scan.healthier": "Healthier version",
    "chat.title": "AI Nutritionist",
    "chat.placeholder": "Ask anything about nutrition…",
    "chat.blood_test": "Blood Test Analysis",
    "chat.upload_pdf": "Upload PDF / Photo",
    "chat.suggested": "Suggested",
    "profile.title": "Profile",
    "profile.subscription": "Subscription",
    "profile.settings": "Settings",
    "profile.language": "Language",
    "profile.theme": "Theme",
    "profile.logout": "Log out",
    "profile.plan.free": "Free",
    "profile.plan.pro": "Pro",
    "profile.plan.family": "Family",
    "profile.upgrade": "Upgrade",
    "profile.current_plan": "Current plan",
    "sub.title": "Choose your plan",
    "sub.free.title": "Free",
    "sub.pro.title": "Pro",
    "sub.family.title": "Family",
    "sub.checkout": "Subscribe",
    "sub.month": "/month",
    "onboarding.hi": "Hi! I'm your AI nutritionist.",
    "onboarding.begin": "Let's build your personalized plan in under 2 minutes.",
    "onboarding.name": "First, what's your name?",
    "onboarding.age": "How old are you?",
    "onboarding.gender": "Your gender?",
    "onboarding.height": "Your height (cm)?",
    "onboarding.weight": "Current weight (kg)?",
    "onboarding.goal": "What's your goal?",
    "onboarding.activity": "Activity level?",
    "onboarding.cuisine": "Favorite cuisines?",
    "onboarding.allergies": "Any allergies?",
    "onboarding.avoid": "Foods to avoid?",
    "onboarding.meals": "Meals per day?",
    "onboarding.done": "Perfect! Building your plan…",
    "onboarding.skip": "Skip",
    "onboarding.next": "Next",
    "common.loading": "Loading…",
    "common.retry": "Retry",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.close": "Close",
  },
  ru: {
    "app.name": "NutriFlow AI",
    "app.tagline": "Ваш персональный AI-нутрициолог",
    "app.subtitle": "Создайте персональный план питания, рецепты, списки покупок и AI-рекомендации по здоровью менее чем за 2 минуты.",
    "cta.start_free": "Начать бесплатно",
    "cta.watch_demo": "Смотреть демо",
    "cta.continue": "Продолжить",
    "cta.get_started": "Начать",
    "cta.sign_in": "Войти",
    "cta.sign_up": "Регистрация",
    "cta.google": "Войти через Google",
    "cta.email": "Продолжить с Email",
    "auth.email": "Email",
    "auth.password": "Пароль",
    "auth.name": "Ваше имя",
    "auth.login": "Войти",
    "auth.register": "Создать аккаунт",
    "auth.have_account": "Уже есть аккаунт?",
    "auth.no_account": "Новый пользователь?",
    "auth.error": "Что-то пошло не так",
    "tabs.home": "Главная",
    "tabs.meals": "Меню",
    "tabs.scan": "Скан",
    "tabs.chat": "Чат",
    "tabs.profile": "Профиль",
    "dashboard.today": "Сегодня",
    "dashboard.calories": "Калории",
    "dashboard.protein": "Белки",
    "dashboard.fat": "Жиры",
    "dashboard.carbs": "Углеводы",
    "dashboard.water": "Вода",
    "dashboard.fiber": "Клетчатка",
    "dashboard.bmi": "ИМТ",
    "dashboard.streak": "дней подряд",
    "dashboard.scores": "Показатели здоровья",
    "dashboard.metabolism": "Метаболизм",
    "dashboard.nutrition": "Питание",
    "dashboard.hydration": "Гидратация",
    "dashboard.health": "Здоровье",
    "dashboard.target": "Целевой вес",
    "dashboard.finish": "Ориентировочно",
    "dashboard.habits": "Привычки",
    "meals.title": "План питания",
    "meals.generate": "Создать план",
    "meals.generating": "Готовим ваш план…",
    "meals.no_plan": "Плана пока нет",
    "meals.days_7": "7 дней",
    "meals.days_14": "14 дней",
    "meals.days_30": "30 дней",
    "meals.shopping": "Список покупок",
    "meals.replace": "Заменить",
    "meals.image": "Создать фото",
    "meals.day": "День",
    "scan.title": "Сканер еды",
    "scan.take_photo": "Сделать фото",
    "scan.upload": "Загрузить фото",
    "scan.analyzing": "Анализируем…",
    "scan.result_title": "Результат",
    "scan.healthier": "Более полезная альтернатива",
    "chat.title": "AI-нутрициолог",
    "chat.placeholder": "Спросите что-нибудь о питании…",
    "chat.blood_test": "Анализ крови",
    "chat.upload_pdf": "Загрузить PDF или фото",
    "chat.suggested": "Подсказки",
    "profile.title": "Профиль",
    "profile.subscription": "Подписка",
    "profile.settings": "Настройки",
    "profile.language": "Язык",
    "profile.theme": "Тема",
    "profile.logout": "Выйти",
    "profile.plan.free": "Бесплатный",
    "profile.plan.pro": "Pro",
    "profile.plan.family": "Family",
    "profile.upgrade": "Улучшить",
    "profile.current_plan": "Текущий план",
    "sub.title": "Выберите план",
    "sub.free.title": "Free",
    "sub.pro.title": "Pro",
    "sub.family.title": "Family",
    "sub.checkout": "Оформить",
    "sub.month": "/мес",
    "onboarding.hi": "Привет! Я ваш AI-нутрициолог.",
    "onboarding.begin": "Создадим персональный план менее чем за 2 минуты.",
    "onboarding.name": "Как вас зовут?",
    "onboarding.age": "Ваш возраст?",
    "onboarding.gender": "Ваш пол?",
    "onboarding.height": "Ваш рост (см)?",
    "onboarding.weight": "Текущий вес (кг)?",
    "onboarding.goal": "Ваша цель?",
    "onboarding.activity": "Уровень активности?",
    "onboarding.cuisine": "Любимые кухни?",
    "onboarding.allergies": "Есть аллергии?",
    "onboarding.avoid": "Что не едите?",
    "onboarding.meals": "Сколько приёмов пищи в день?",
    "onboarding.done": "Отлично! Собираем ваш план…",
    "onboarding.skip": "Пропустить",
    "onboarding.next": "Далее",
    "common.loading": "Загрузка…",
    "common.retry": "Повторить",
    "common.cancel": "Отмена",
    "common.save": "Сохранить",
    "common.close": "Закрыть",
  },
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [schemePref, setSchemePrefState] = useState<"light" | "dark" | "system">("system");
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    (async () => {
      const s = await storage.getItem("theme.scheme", "system" as string);
      const l = await storage.getItem("theme.lang", "en" as string);
      if (s === "light" || s === "dark" || s === "system") setSchemePrefState(s);
      if (l === "en" || l === "ru") setLangState(l);
    })();
  }, []);

  const scheme: "light" | "dark" = schemePref === "system" ? ((system as any) || "light") : schemePref;
  const colors = DESIGN[scheme];

  const setScheme = useCallback((s: "light" | "dark" | "system") => {
    setSchemePrefState(s);
    storage.setItem("theme.scheme", s);
  }, []);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    storage.setItem("theme.lang", l);
  }, []);

  const t = useCallback((key: string) => STRINGS[lang][key] ?? STRINGS.en[key] ?? key, [lang]);

  return (
    <ThemeContext.Provider value={{ colors, scheme, setScheme, schemePref, lang, setLang, t }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme outside provider");
  return ctx;
}
