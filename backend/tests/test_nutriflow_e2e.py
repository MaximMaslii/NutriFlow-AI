"""
NutriFlow AI backend e2e tests
Single class = single xdist worker = deterministic ordering
"""
import base64
import io
import os
import time
import uuid

import pytest
import requests

BASE_URL = "http://localhost:8001"


def _b64_pdf():
    """Small PDF with blood-test values."""
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.setFont("Helvetica", 12)
    c.drawString(72, 720, "Blood Test Report - TEST")
    c.drawString(72, 690, "Hemoglobin: 14.2 g/dL (13.5-17.5)")
    c.drawString(72, 670, "Glucose: 95 mg/dL (70-100)")
    c.drawString(72, 650, "Cholesterol: 210 mg/dL (<200)")
    c.drawString(72, 630, "Vitamin D: 22 ng/mL (30-100)")
    c.save()
    return buf.getvalue()


def _real_food_image_b64():
    """Fetch a real food JPEG and return raw base64 (no header)."""
    url = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80"
    r = requests.get(url, timeout=20)
    r.raise_for_status()
    return base64.b64encode(r.content).decode("utf-8")


@pytest.mark.order(1)
class TestNutriflowE2E:

    # ---------- 1. Health ----------
    def test_01_health(self, api):
        r = api.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200, r.text
        assert r.json() == {"status": "healthy"}

    # ---------- 2. Auth ----------
    def test_02_register_new_user(self, api, shared):
        email = f"TEST_reg_{uuid.uuid4().hex[:8]}@nutriflow.ai"
        r = api.post(f"{BASE_URL}/api/auth/register",
                     json={"email": email, "password": "Passw0rd!", "name": "Reg Tester"},
                     timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and data["token"]
        assert data["user"]["email"] == email.lower()
        assert data["user"]["onboarded"] is False
        assert "_id" not in data["user"]
        shared["reg_email"] = email
        shared["reg_token"] = data["token"]

    def test_03_login_demo(self, api, shared):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": "demo@nutriflow.ai", "password": "Demo12345"},
                     timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["token"]
        assert data["user"]["email"] == "demo@nutriflow.ai"
        assert data["user"].get("onboarded") is True
        shared["demo_token"] = data["token"]
        shared["user_id"] = data["user"]["user_id"]

    def test_04_auth_me(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        user = r.json()["user"]
        assert user["email"] == "demo@nutriflow.ai"
        assert "_id" not in user

    def test_05_auth_me_unauthenticated(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 401

    def test_06_logout(self, api, auth_headers):
        r = api.post(f"{BASE_URL}/api/auth/logout", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    # ---------- 3. Profile ----------
    def test_07_get_profile(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/profile", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["profile"]["age"] == 30
        analysis = data["analysis"]
        assert isinstance(analysis["calories"], (int, float)) and analysis["calories"] > 0
        assert isinstance(analysis["protein_g"], (int, float)) and analysis["protein_g"] > 0
        for k in ("metabolism_score", "nutrition_score", "hydration_score", "health_score"):
            assert 0 <= analysis[k] <= 100, k

    def test_08_put_profile(self, api, auth_headers):
        r = api.put(f"{BASE_URL}/api/profile",
                    headers=auth_headers, json={"weight_kg": 76}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["profile"]["weight_kg"] == 76
        assert data["analysis"]["calories"] > 0
        # restore
        api.put(f"{BASE_URL}/api/profile", headers=auth_headers,
                json={"weight_kg": 75}, timeout=15)

    # ---------- 4. Body analysis ----------
    def test_09_analysis_body(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/analysis/body", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        a = r.json()["analysis"]
        for k in ("bmi", "calories", "health_score"):
            assert isinstance(a[k], (int, float)), f"{k} not numeric"

    # ---------- 5. Meal plan generation ----------
    def test_10_meals_generate(self, api, auth_headers, shared):
        r = api.post(f"{BASE_URL}/api/meals/generate",
                     headers=auth_headers, json={"days": 7}, timeout=180)
        assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
        data = r.json()
        assert data["plan_id"].startswith("plan_")
        meals = data["meals"]
        assert len(meals) >= 7, f"got {len(meals)} meals"
        m0 = meals[0]
        for field in ("title", "calories", "protein_g", "fat_g", "carbs_g",
                      "ingredients", "steps"):
            assert field in m0, f"missing {field}"
        assert isinstance(m0["ingredients"], list) and len(m0["ingredients"]) > 0
        assert isinstance(m0["steps"], list) and len(m0["steps"]) > 0
        shared["plan_id"] = data["plan_id"]
        shared["meal_id"] = m0["meal_id"]
        shared["orig_meal_title"] = m0["title"]
        shared["orig_meal_calories"] = m0["calories"]

    def test_11_meals_plans_list(self, api, auth_headers, shared):
        r = api.get(f"{BASE_URL}/api/meals/plans", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        plans = r.json()["plans"]
        assert plans, "no plans returned"
        assert plans[0]["plan_id"] == shared["plan_id"], "newest plan not first"

    def test_12_meals_plan_by_id(self, api, auth_headers, shared):
        pid = shared["plan_id"]
        r = api.get(f"{BASE_URL}/api/meals/plan/{pid}", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["plan"]["plan_id"] == pid
        assert len(data["meals"]) > 0

    # ---------- 6. Meal replace ----------
    def test_13_meal_replace(self, api, auth_headers, shared):
        mid = shared["meal_id"]
        orig_cal = shared["orig_meal_calories"]
        r = api.post(f"{BASE_URL}/api/meals/{mid}/replace",
                     headers=auth_headers, timeout=120)
        assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
        new_meal = r.json()["meal"]
        assert new_meal["meal_id"] == mid
        assert new_meal["title"] != shared["orig_meal_title"], "title unchanged"
        # macros within ±30%
        if orig_cal > 0:
            assert 0.7 * orig_cal <= new_meal["calories"] <= 1.3 * orig_cal, \
                f"calories drift: orig {orig_cal} new {new_meal['calories']}"

    # ---------- 7. Shopping list ----------
    def test_14_shopping_list(self, api, auth_headers, shared):
        pid = shared["plan_id"]
        r = api.get(f"{BASE_URL}/api/meals/plan/{pid}/shopping-list",
                    headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data["categories"], dict) and data["categories"]
        # each category has entries
        total_items = sum(len(v) for v in data["categories"].values())
        assert total_items > 0
        assert data["estimated_total_usd"] > 0

    # ---------- 8. Food scan ----------
    def test_15_scan_food(self, api, auth_headers):
        try:
            b64 = _real_food_image_b64()
        except Exception as e:
            pytest.skip(f"Cannot fetch food image: {e}")
        r = api.post(f"{BASE_URL}/api/scan/food",
                     headers=auth_headers, json={"image_base64": b64}, timeout=120)
        assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
        data = r.json()
        for k in ("food_name", "calories", "protein_g", "health_score", "healthier_version"):
            assert k in data, f"missing {k}"
        assert isinstance(data["calories"], (int, float))

    # ---------- 9. Blood test analyze (PDF) ----------
    def test_16_blood_test_analyze(self, api, auth_headers):
        pdf = _b64_pdf()
        headers = {"Authorization": auth_headers["Authorization"]}
        files = {"file": ("blood.pdf", pdf, "application/pdf")}
        r = requests.post(f"{BASE_URL}/api/blood-test/analyze",
                          headers=headers, files=files, timeout=120)
        assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
        data = r.json()
        for k in ("summary", "markers", "suggested_foods", "important_notice"):
            assert k in data, f"missing {k}"
        assert isinstance(data["markers"], list)

    # ---------- 10. Chat ----------
    def test_17_chat_send_and_context(self, api, auth_headers, shared):
        r = api.post(f"{BASE_URL}/api/chat/send", headers=auth_headers,
                     json={"message": "What should I eat after a workout?"}, timeout=120)
        assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
        data = r.json()
        assert data["reply"] and isinstance(data["reply"], str)
        assert data["session_id"]
        shared["chat_sid"] = data["session_id"]

        # second call w/ same session
        r2 = api.post(f"{BASE_URL}/api/chat/send", headers=auth_headers,
                      json={"message": "And what about drinks?",
                            "session_id": shared["chat_sid"]}, timeout=120)
        assert r2.status_code == 200, r2.text[:500]
        assert r2.json()["session_id"] == shared["chat_sid"]
        assert r2.json()["reply"]

    def test_18_chat_history(self, api, auth_headers, shared):
        r = api.get(f"{BASE_URL}/api/chat/history",
                    headers=auth_headers, params={"session_id": shared["chat_sid"]},
                    timeout=15)
        assert r.status_code == 200, r.text
        msgs = r.json()["messages"]
        assert len(msgs) >= 4  # 2 user + 2 assistant
        roles = [m["role"] for m in msgs]
        assert "user" in roles and "assistant" in roles

    # ---------- 11. Recipes ----------
    def test_19_recipe_generate(self, api, auth_headers):
        r = api.post(f"{BASE_URL}/api/recipes/generate", headers=auth_headers,
                     json={"calories": 500, "time_min": 20, "from_fridge": True,
                           "ingredients": ["chicken breast", "broccoli", "rice"]},
                     timeout=120)
        assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
        data = r.json()
        for k in ("title", "ingredients", "steps"):
            assert k in data, f"missing {k}"
        assert isinstance(data["ingredients"], list) and data["ingredients"]
        assert isinstance(data["steps"], list) and data["steps"]

    # ---------- 12. Habits ----------
    def test_20_habits_log_and_get(self, api, auth_headers):
        r = api.post(f"{BASE_URL}/api/habits/log", headers=auth_headers,
                     json={"water_ml": 500}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["log"]["water_ml"] == 500

        r2 = api.get(f"{BASE_URL}/api/habits", headers=auth_headers, timeout=15)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert isinstance(data["logs"], list) and len(data["logs"]) >= 1
        assert isinstance(data["streak"], int) and data["streak"] >= 1

    # ---------- 13. Stripe ----------
    def test_21_stripe_checkout(self, api, auth_headers):
        r = api.post(f"{BASE_URL}/api/stripe/checkout", headers=auth_headers,
                     json={"plan": "pro"}, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
        data = r.json()
        assert data["checkout_url"].startswith("https://checkout.stripe.com/"), data["checkout_url"]
        assert data["session_id"].startswith("cs_")

    def test_22_subscription_default(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/subscription", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        sub = r.json()["subscription"]
        assert sub["plan"] in ("free", "pro", "family")
        assert sub["status"] == "active"
