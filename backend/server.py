"""
NUTRIFLOW AI — Premium AI Nutrition Platform Backend
FastAPI + MongoDB + Emergent LLM (GPT-5.2) + Stripe
"""
from fastapi import FastAPI, APIRouter, Header, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse, JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import base64
import logging
import hashlib
import secrets
import jwt as pyjwt
import httpx
import stripe
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any, Literal
import uuid
import json
import re
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent, FileContentWithMimeType, TextDelta, StreamDone
from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# --------------------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "change_me")
APP_URL = os.environ.get("APP_URL", "https://example.com")
LLM_MODEL_PROVIDER = "openai"
LLM_MODEL_NAME = "gpt-5.2"

stripe.api_key = STRIPE_API_KEY

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="NutriFlow AI")
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("nutriflow")


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
    return secrets.compare_digest(check, digest)


def make_jwt(user_id: str) -> str:
    payload = {"sub": user_id, "iat": int(now_utc().timestamp()), "exp": int((now_utc() + timedelta(days=30)).timestamp())}
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_jwt(token: str) -> Optional[str]:
    try:
        data = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return data.get("sub")
    except Exception:
        return None


async def current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()

    # 1) JWT (email/password)
    user_id = decode_jwt(token)
    if user_id:
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
        if user:
            return user

    # 2) Session token (Emergent Google Auth)
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        expires = session.get("expires_at")
        if expires and expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if not expires or expires > now_utc():
            user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0, "password": 0})
            if user:
                return user

    raise HTTPException(status_code=401, detail="Invalid or expired token")


def _strip_json_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


async def llm_json(system: str, user: str, session_id: str = None) -> Any:
    session_id = session_id or new_id("llm")
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=system).with_model(LLM_MODEL_PROVIDER, LLM_MODEL_NAME)
    out_parts: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=user)):
        if isinstance(ev, TextDelta):
            out_parts.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    text = _strip_json_fences("".join(out_parts))
    try:
        return json.loads(text)
    except Exception:
        # attempt to extract JSON block
        m = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", text)
        if m:
            return json.loads(m.group(0))
        raise


# --------------------------------------------------------------------------------------
# Startup — indexes
# --------------------------------------------------------------------------------------
@app.on_event("startup")
async def _startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.profiles.create_index("user_id", unique=True)
    await db.meal_plans.create_index("user_id")
    await db.meals.create_index([("plan_id", 1), ("day", 1)])
    await db.chat_messages.create_index([("user_id", 1), ("created_at", 1)])
    await db.food_scans.create_index([("user_id", 1), ("created_at", -1)])
    await db.blood_tests.create_index([("user_id", 1), ("created_at", -1)])
    await db.habits_log.create_index([("user_id", 1), ("date", -1)])
    await db.subscriptions.create_index("user_id")
    await db.subscriptions.create_index("stripe_subscription_id", unique=True, sparse=True)
    log.info("Indexes ready")


@app.on_event("shutdown")
async def _shutdown():
    client.close()


# --------------------------------------------------------------------------------------
# Auth models
# --------------------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionRequest(BaseModel):
    session_token: str


class AuthResponse(BaseModel):
    token: str
    user: Dict[str, Any]


def _serialize_user(u: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "user_id": u["user_id"],
        "email": u["email"],
        "name": u.get("name"),
        "picture": u.get("picture"),
        "provider": u.get("provider", "email"),
        "created_at": u.get("created_at", now_utc()).isoformat() if isinstance(u.get("created_at"), datetime) else u.get("created_at"),
        "onboarded": u.get("onboarded", False),
    }


@api.post("/auth/register")
async def register(req: RegisterRequest):
    existing = await db.users.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = new_id("user")
    doc = {
        "user_id": user_id,
        "email": req.email.lower(),
        "name": req.name or req.email.split("@")[0],
        "password": hash_password(req.password),
        "provider": "email",
        "onboarded": False,
        "created_at": now_utc(),
    }
    await db.users.insert_one(doc)
    token = make_jwt(user_id)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    return {"token": token, "user": _serialize_user(user)}


@api.post("/auth/login")
async def login(req: LoginRequest):
    user = await db.users.find_one({"email": req.email.lower()})
    if not user or not user.get("password") or not verify_password(req.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = make_jwt(user["user_id"])
    return {"token": token, "user": _serialize_user(user)}


@api.post("/auth/google/session")
async def google_session(req: GoogleSessionRequest):
    """Exchange Emergent Google session_id for our session_token."""
    async with httpx.AsyncClient(timeout=15) as client_http:
        r = await client_http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": req.session_token},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    email = data.get("email", "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="No email in session")

    user = await db.users.find_one({"email": email})
    if user:
        user_id = user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name") or user.get("name"), "picture": data.get("picture") or user.get("picture")}},
        )
    else:
        user_id = new_id("user")
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "picture": data.get("picture"),
            "provider": "google",
            "onboarded": False,
            "created_at": now_utc(),
        })

    session_token = data.get("session_token") or secrets.token_urlsafe(48)
    expires_at = now_utc() + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {"session_token": session_token, "user_id": user_id, "expires_at": expires_at, "created_at": now_utc()}},
        upsert=True,
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    return {"token": session_token, "user": _serialize_user(user)}


@api.get("/auth/me")
async def me(user=None, authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    return {"user": _serialize_user(user)}


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# --------------------------------------------------------------------------------------
# Profile & Onboarding
# --------------------------------------------------------------------------------------
class ProfileUpsert(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None  # male / female / other
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    target_weight_kg: Optional[float] = None
    goal: Optional[str] = None  # weight_loss / weight_gain / muscle / healthy / pregnancy
    activity_level: Optional[str] = None  # sedentary / light / moderate / active / athlete
    weekly_exercise_hours: Optional[float] = None
    body_fat: Optional[float] = None
    waist_cm: Optional[float] = None
    country: Optional[str] = None
    cuisine: Optional[List[str]] = None
    allergies: Optional[List[str]] = None
    favorite_foods: Optional[List[str]] = None
    avoid_foods: Optional[List[str]] = None
    cooking_skill: Optional[str] = None  # beginner / intermediate / advanced
    kitchen_equipment: Optional[List[str]] = None
    weekly_budget: Optional[float] = None
    meals_per_day: Optional[int] = None
    sleep_hours: Optional[float] = None
    stress_level: Optional[int] = None  # 1-5
    water_intake_l: Optional[float] = None
    supplements: Optional[List[str]] = None
    medical_restrictions: Optional[List[str]] = None
    language: Optional[str] = None  # en / ru


def compute_body_analysis(p: Dict[str, Any]) -> Dict[str, Any]:
    """Deterministic Mifflin–St Jeor + activity multiplier."""
    height = p.get("height_cm") or 170
    weight = p.get("weight_kg") or 70
    age = p.get("age") or 30
    gender = (p.get("gender") or "male").lower()
    goal = (p.get("goal") or "healthy").lower()
    activity = (p.get("activity_level") or "moderate").lower()

    if gender == "female":
        bmr = 10 * weight + 6.25 * height - 5 * age - 161
    else:
        bmr = 10 * weight + 6.25 * height - 5 * age + 5

    activity_mult = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "active": 1.725, "athlete": 1.9}.get(activity, 1.55)
    tdee = bmr * activity_mult

    if goal == "weight_loss":
        calories = tdee - 500
    elif goal == "weight_gain" or goal == "muscle":
        calories = tdee + 400
    elif goal == "pregnancy":
        calories = tdee + 300
    else:
        calories = tdee

    calories = max(1200, round(calories))

    # macros — pro=1.8 g/kg (muscle) / 1.5 default; fat 25%; carbs remainder
    protein_g = round((2.0 if goal == "muscle" else 1.6) * weight)
    fat_g = round((calories * 0.28) / 9)
    carbs_g = max(50, round((calories - (protein_g * 4 + fat_g * 9)) / 4))
    fiber_g = round(calories / 1000 * 14)
    water_l = round(weight * 0.035, 1)

    bmi = weight / ((height / 100) ** 2)

    target = p.get("target_weight_kg") or (weight * 0.9 if goal == "weight_loss" else weight * 1.05 if goal in ("weight_gain", "muscle") else weight)
    # 0.5 kg/week healthy pace
    weeks = max(1, abs(target - weight) / 0.5)
    est_finish = (now_utc() + timedelta(weeks=weeks)).date().isoformat()

    def clamp(v, lo=0, hi=100):
        return max(lo, min(hi, v))

    metabolism = clamp(round(60 + (tdee - 1800) / 30))
    nutrition = clamp(round(70 + (10 if p.get("cuisine") else 0) + (5 if not p.get("avoid_foods") else -5)))
    hydration = clamp(round(50 + (p.get("water_intake_l") or 2) * 10))
    health = clamp(round((metabolism + nutrition + hydration + (100 - min(50, abs(bmi - 22) * 4))) / 4))

    return {
        "bmi": round(bmi, 1),
        "bmi_category": "underweight" if bmi < 18.5 else "normal" if bmi < 25 else "overweight" if bmi < 30 else "obese",
        "calories": calories,
        "protein_g": protein_g,
        "fat_g": fat_g,
        "carbs_g": carbs_g,
        "fiber_g": fiber_g,
        "water_l": water_l,
        "target_weight_kg": round(target, 1),
        "estimated_finish": est_finish,
        "metabolism_score": metabolism,
        "nutrition_score": nutrition,
        "hydration_score": hydration,
        "health_score": health,
        "bmr": round(bmr),
        "tdee": round(tdee),
    }


@api.get("/profile")
async def get_profile(authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    analysis = compute_body_analysis(profile) if profile else None
    return {"profile": profile, "analysis": analysis, "onboarded": user.get("onboarded", False)}


@api.put("/profile")
async def upsert_profile(req: ProfileUpsert, authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    data = {k: v for k, v in req.dict().items() if v is not None}
    data["user_id"] = user["user_id"]
    data["updated_at"] = now_utc()
    await db.profiles.update_one({"user_id": user["user_id"]}, {"$set": data}, upsert=True)
    if data.get("name"):
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"name": data["name"]}})
    # mark onboarded if key fields present
    if all(k in data for k in ("age", "gender", "height_cm", "weight_kg", "goal")):
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"onboarded": True}})
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"profile": profile, "analysis": compute_body_analysis(profile)}


@api.get("/analysis/body")
async def get_body_analysis(authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    return {"analysis": compute_body_analysis(profile)}


# --------------------------------------------------------------------------------------
# Meal Plans
# --------------------------------------------------------------------------------------
class GeneratePlanRequest(BaseModel):
    days: int = 7  # 7 / 14 / 30
    with_images: bool = False


async def _generate_meal_photo(prompt: str) -> Optional[str]:
    """Return base64 PNG string, or None on failure."""
    try:
        gen = OpenAIImageGeneration(api_key=EMERGENT_LLM_KEY)
        images = await gen.generate_images(
            prompt=f"Professional food photography, top-down view, natural light, minimalist white plate, garnished: {prompt}. Ultra realistic, magazine quality, no text.",
            model="gpt-image-1",
            number_of_images=1,
        )
        if images:
            return base64.b64encode(images[0]).decode("utf-8")
    except Exception as e:
        log.warning(f"image gen failed: {e}")
    return None


@api.post("/meals/generate")
async def generate_meal_plan(req: GeneratePlanRequest, authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    analysis = compute_body_analysis(profile)
    days = max(1, min(30, req.days))
    meals_per_day = int(profile.get("meals_per_day") or 3)

    system = (
        "You are a world-class clinical nutritionist. You output only valid JSON. "
        "You design realistic, delicious, culturally appropriate meal plans with precise macros. "
        "Every meal must include: title (short), description (1 sentence), category (breakfast/lunch/dinner/snack), "
        "calories (int), protein_g (int), fat_g (int), carbs_g (int), fiber_g (int), cooking_time_min (int), "
        "difficulty (easy/medium/hard), estimated_cost_usd (float), ingredients (list of {name, amount, unit}), "
        "steps (list of short strings, 3-6 items), image_prompt (short vivid English prompt for a food photo)."
    )
    user_prompt = f"""Create a {days}-day meal plan with {meals_per_day} meals per day for this user:

Age: {profile.get('age')} | Gender: {profile.get('gender')} | Height: {profile.get('height_cm')}cm | Weight: {profile.get('weight_kg')}kg
Goal: {profile.get('goal')} | Activity: {profile.get('activity_level')} | Country: {profile.get('country')}
Cuisines: {profile.get('cuisine')} | Allergies: {profile.get('allergies')} | Dislikes: {profile.get('avoid_foods')}
Favorites: {profile.get('favorite_foods')} | Budget/week USD: {profile.get('weekly_budget')}
Cooking skill: {profile.get('cooking_skill')} | Language: {profile.get('language', 'en')}

Daily targets: {analysis['calories']} kcal, {analysis['protein_g']}g protein, {analysis['fat_g']}g fat, {analysis['carbs_g']}g carbs, {analysis['fiber_g']}g fiber.

Return JSON: {{"days": [{{"day": 1, "meals": [ ... ]}}, ...]}}. Vary meals, avoid repetition, respect cuisine.
Respond in {profile.get('language', 'en')} language (if 'ru' translate titles/descriptions/steps to Russian; keep JSON keys English)."""

    try:
        plan_json = await llm_json(system, user_prompt, session_id=f"plan_{user['user_id']}")
    except Exception as e:
        log.exception("meal plan gen failed")
        raise HTTPException(status_code=502, detail=f"AI meal plan generation failed: {e}")

    plan_id = new_id("plan")
    plan_doc = {
        "plan_id": plan_id,
        "user_id": user["user_id"],
        "days": days,
        "created_at": now_utc(),
        "targets": analysis,
    }
    await db.meal_plans.insert_one(plan_doc.copy())

    meal_docs = []
    for day_obj in plan_json.get("days", []):
        day_num = day_obj.get("day")
        for meal in day_obj.get("meals", []):
            meal_id = new_id("meal")
            doc = {
                "meal_id": meal_id,
                "plan_id": plan_id,
                "user_id": user["user_id"],
                "day": day_num,
                "category": meal.get("category", "meal"),
                "title": meal.get("title", "Meal"),
                "description": meal.get("description", ""),
                "calories": int(meal.get("calories") or 0),
                "protein_g": int(meal.get("protein_g") or 0),
                "fat_g": int(meal.get("fat_g") or 0),
                "carbs_g": int(meal.get("carbs_g") or 0),
                "fiber_g": int(meal.get("fiber_g") or 0),
                "cooking_time_min": int(meal.get("cooking_time_min") or 15),
                "difficulty": meal.get("difficulty", "easy"),
                "estimated_cost_usd": float(meal.get("estimated_cost_usd") or 5),
                "ingredients": meal.get("ingredients", []),
                "steps": meal.get("steps", []),
                "image_prompt": meal.get("image_prompt", meal.get("title", "healthy meal")),
                "image_base64": None,
                "created_at": now_utc(),
            }
            meal_docs.append(doc)
    if meal_docs:
        await db.meals.insert_many([d.copy() for d in meal_docs])

    return {"plan_id": plan_id, "days": days, "meals": [_serialize_meal(m) for m in meal_docs], "targets": analysis}


def _serialize_meal(m: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in m.items() if k != "_id"}


@api.get("/meals/plans")
async def list_plans(authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    plans = await db.meal_plans.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(20)
    for p in plans:
        if isinstance(p.get("created_at"), datetime):
            p["created_at"] = p["created_at"].isoformat()
    return {"plans": plans}


@api.get("/meals/plan/{plan_id}")
async def get_plan(plan_id: str, authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    plan = await db.meal_plans.find_one({"plan_id": plan_id, "user_id": user["user_id"]}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Plan not found")
    meals = await db.meals.find({"plan_id": plan_id, "user_id": user["user_id"]}, {"_id": 0}).sort([("day", 1)]).to_list(1000)
    if isinstance(plan.get("created_at"), datetime):
        plan["created_at"] = plan["created_at"].isoformat()
    for m in meals:
        if isinstance(m.get("created_at"), datetime):
            m["created_at"] = m["created_at"].isoformat()
    return {"plan": plan, "meals": meals}


@api.post("/meals/{meal_id}/image")
async def generate_meal_image(meal_id: str, authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    meal = await db.meals.find_one({"meal_id": meal_id, "user_id": user["user_id"]}, {"_id": 0})
    if not meal:
        raise HTTPException(404, "Meal not found")
    if meal.get("image_base64"):
        return {"image_base64": meal["image_base64"]}
    b64 = await _generate_meal_photo(meal.get("image_prompt") or meal["title"])
    if not b64:
        raise HTTPException(502, "Image generation failed")
    await db.meals.update_one({"meal_id": meal_id}, {"$set": {"image_base64": b64}})
    return {"image_base64": b64}


@api.post("/meals/{meal_id}/replace")
async def replace_meal(meal_id: str, authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    meal = await db.meals.find_one({"meal_id": meal_id, "user_id": user["user_id"]}, {"_id": 0})
    if not meal:
        raise HTTPException(404, "Meal not found")

    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    system = "You are a nutritionist. Output only valid JSON for a single meal replacement."
    prompt = f"""Replace this meal with a different one, keeping calories±10%, protein±15%, fat±15%, carbs±15% similar.
Original meal: {meal['title']} — {meal['calories']}kcal P{meal['protein_g']} F{meal['fat_g']} C{meal['carbs_g']}
Category: {meal['category']}. Language: {profile.get('language', 'en')}.
User dislikes: {profile.get('avoid_foods')}, allergies: {profile.get('allergies')}, cuisines: {profile.get('cuisine')}.

Return JSON with same schema: {{"title","description","category","calories","protein_g","fat_g","carbs_g","fiber_g","cooking_time_min","difficulty","estimated_cost_usd","ingredients","steps","image_prompt"}}."""

    try:
        new_meal = await llm_json(system, prompt, session_id=f"repl_{meal_id}")
    except Exception as e:
        raise HTTPException(502, f"AI replacement failed: {e}")

    update = {
        "title": new_meal.get("title"),
        "description": new_meal.get("description"),
        "category": new_meal.get("category", meal["category"]),
        "calories": int(new_meal.get("calories") or meal["calories"]),
        "protein_g": int(new_meal.get("protein_g") or meal["protein_g"]),
        "fat_g": int(new_meal.get("fat_g") or meal["fat_g"]),
        "carbs_g": int(new_meal.get("carbs_g") or meal["carbs_g"]),
        "fiber_g": int(new_meal.get("fiber_g") or meal["fiber_g"]),
        "cooking_time_min": int(new_meal.get("cooking_time_min") or 15),
        "difficulty": new_meal.get("difficulty", "easy"),
        "estimated_cost_usd": float(new_meal.get("estimated_cost_usd") or 5),
        "ingredients": new_meal.get("ingredients", []),
        "steps": new_meal.get("steps", []),
        "image_prompt": new_meal.get("image_prompt"),
        "image_base64": None,
        "updated_at": now_utc(),
    }
    await db.meals.update_one({"meal_id": meal_id}, {"$set": update})
    updated = await db.meals.find_one({"meal_id": meal_id}, {"_id": 0})
    return {"meal": updated}


# --------------------------------------------------------------------------------------
# Shopping List
# --------------------------------------------------------------------------------------
CATEGORY_KEYWORDS = {
    "vegetables": ["tomato","lettuce","spinach","kale","onion","garlic","carrot","broccoli","cucumber","pepper","zucchini","cabbage","celery","potato","sweet potato","mushroom","corn","peas","beans","asparagus","eggplant"],
    "fruit": ["apple","banana","berry","strawberry","blueberry","raspberry","orange","lemon","lime","pear","peach","mango","pineapple","grape","kiwi","avocado","watermelon","melon"],
    "meat": ["chicken","beef","pork","turkey","lamb","bacon","sausage","steak","ground"],
    "fish": ["salmon","tuna","cod","tilapia","shrimp","prawn","mackerel","sardine","trout","seafood"],
    "dairy": ["milk","yogurt","cheese","butter","cream","kefir","cottage","greek yogurt","egg","eggs"],
    "grains": ["rice","oat","quinoa","pasta","bread","flour","cereal","couscous","barley","tortilla","noodle","bulgur","buckwheat"],
    "frozen": ["frozen"],
    "drinks": ["water","juice","tea","coffee","milk alternative","almond milk","soy milk","oat milk"],
    "spices": ["salt","pepper","cumin","paprika","cinnamon","oregano","basil","thyme","rosemary","turmeric","chili","curry","ginger","vanilla"],
    "cleaning": ["soap","detergent"],
}


def _categorize(name: str) -> str:
    n = name.lower()
    for cat, keys in CATEGORY_KEYWORDS.items():
        for k in keys:
            if k in n:
                return cat
    return "other"


@api.get("/meals/plan/{plan_id}/shopping-list")
async def shopping_list(plan_id: str, authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    meals = await db.meals.find({"plan_id": plan_id, "user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    if not meals:
        raise HTTPException(404, "Plan meals not found")
    aggregated: Dict[str, Dict[str, Any]] = {}
    for m in meals:
        for ing in m.get("ingredients", []) or []:
            name = str(ing.get("name") or "").strip()
            if not name:
                continue
            key = name.lower()
            unit = ing.get("unit") or "pcs"
            try:
                amount = float(str(ing.get("amount") or 1).split()[0].replace(",", "."))
            except Exception:
                amount = 1.0
            if key in aggregated and aggregated[key]["unit"] == unit:
                aggregated[key]["amount"] += amount
            else:
                aggregated[key] = {"name": name, "amount": amount, "unit": unit, "category": _categorize(name)}

    # group by category
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    total_cost = 0.0
    for item in aggregated.values():
        cat = item["category"]
        # rough cost estimate
        item["est_cost"] = round(item["amount"] * (1.2 if cat in ("meat","fish") else 0.4 if cat == "dairy" else 0.3), 2)
        total_cost += item["est_cost"]
        grouped.setdefault(cat, []).append(item)
    for cat in grouped:
        grouped[cat].sort(key=lambda x: x["name"])
    return {"plan_id": plan_id, "categories": grouped, "estimated_total_usd": round(total_cost, 2)}


# --------------------------------------------------------------------------------------
# Photo Food Scanner
# --------------------------------------------------------------------------------------
class FoodScanRequest(BaseModel):
    image_base64: str


@api.post("/scan/food")
async def scan_food(req: FoodScanRequest, authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    lang = profile.get("language", "en")

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=new_id("scan"),
        system_message="You are a computer-vision nutrition expert. Output only valid JSON.",
    ).with_model(LLM_MODEL_PROVIDER, LLM_MODEL_NAME)

    prompt = f"""Analyze the food in this photo. Return JSON:
{{"food_name": "...", "calories": int, "protein_g": int, "fat_g": int, "carbs_g": int, "fiber_g": int, "sugar_g": int, "health_score": int (0-100), "portion_estimate": "...", "healthier_version": "1 sentence suggestion"}}
Respond in {lang}. If multiple items, list the main dish."""

    # Strip base64 header if present
    b64 = req.image_base64
    if "," in b64:
        b64 = b64.split(",", 1)[1]

    out_parts: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=prompt, file_contents=[ImageContent(image_base64=b64)])):
        if isinstance(ev, TextDelta):
            out_parts.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    text = _strip_json_fences("".join(out_parts))
    try:
        result = json.loads(text)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", text)
        if not m:
            raise HTTPException(502, "Could not parse AI response")
        result = json.loads(m.group(0))

    scan_id = new_id("scan")
    doc = {"scan_id": scan_id, "user_id": user["user_id"], "created_at": now_utc(), **result}
    await db.food_scans.insert_one(doc.copy())
    return {"scan_id": scan_id, **result}


@api.get("/scan/history")
async def scan_history(authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    scans = await db.food_scans.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for s in scans:
        if isinstance(s.get("created_at"), datetime):
            s["created_at"] = s["created_at"].isoformat()
    return {"scans": scans}


# --------------------------------------------------------------------------------------
# Blood Test Analysis
# --------------------------------------------------------------------------------------
@api.post("/blood-test/analyze")
async def blood_test_analyze(
    authorization: Optional[str] = Header(None),
    file: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None),
):
    user = await current_user(authorization)
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    lang = profile.get("language", "en")

    extracted_text = text or ""
    image_b64: Optional[str] = None
    filename = None

    if file is not None:
        content = await file.read()
        filename = file.filename
        if file.content_type == "application/pdf" or (filename and filename.lower().endswith(".pdf")):
            try:
                from pypdf import PdfReader
                reader = PdfReader(io.BytesIO(content))
                extracted_text = "\n".join(page.extract_text() or "" for page in reader.pages)
            except Exception as e:
                raise HTTPException(400, f"Cannot read PDF: {e}")
        elif file.content_type and file.content_type.startswith("image/"):
            image_b64 = base64.b64encode(content).decode("utf-8")

    if not extracted_text and not image_b64:
        raise HTTPException(400, "Provide a PDF, image, or text")

    system = (
        "You are a clinical nutritionist reading a blood test. "
        "You NEVER provide medical diagnosis, only educational nutrition guidance. "
        "Output only valid JSON."
    )
    user_txt = f"""Analyze this blood test. Return JSON:
{{"summary":"...", "markers":[{{"name":"...","value":"...","reference":"...","status":"normal|low|high","explanation":"..."}}], "suggested_foods":["...","..."], "suggested_habits":["..."], "recommended_nutrients":["..."], "important_notice":"This tool is informational and not a substitute for professional medical advice."}}
Respond in {lang}.

{'Blood test text:' + chr(10) + extracted_text if extracted_text else 'The image contains blood test results.'}"""

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=new_id("blood"),
        system_message=system,
    ).with_model(LLM_MODEL_PROVIDER, LLM_MODEL_NAME)
    msg = UserMessage(text=user_txt, file_contents=[ImageContent(image_base64=image_b64)] if image_b64 else None)
    out_parts: list[str] = []
    async for ev in chat.stream_message(msg):
        if isinstance(ev, TextDelta):
            out_parts.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    txt = _strip_json_fences("".join(out_parts))
    try:
        result = json.loads(txt)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", txt)
        if not m:
            raise HTTPException(502, "Could not parse AI response")
        result = json.loads(m.group(0))

    report_id = new_id("blood")
    await db.blood_tests.insert_one({
        "report_id": report_id,
        "user_id": user["user_id"],
        "filename": filename,
        "created_at": now_utc(),
        **result,
    })
    return {"report_id": report_id, **result}


@api.get("/blood-test/history")
async def blood_test_history(authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    reports = await db.blood_tests.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(20)
    for r in reports:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return {"reports": reports}


# --------------------------------------------------------------------------------------
# AI Chat (streaming SSE)
# --------------------------------------------------------------------------------------
class ChatSendRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    image_base64: Optional[str] = None


def _build_system_for_user(profile: Dict[str, Any]) -> str:
    return (
        "You are Nutriflow — a warm, precise, evidence-based AI nutritionist. "
        "Be concise, actionable, and encouraging. Use bullet points when helpful. "
        "Never provide medical diagnosis; provide educational nutrition guidance. "
        f"User: age {profile.get('age')}, gender {profile.get('gender')}, weight {profile.get('weight_kg')}kg, "
        f"goal {profile.get('goal')}, allergies {profile.get('allergies')}, cuisines {profile.get('cuisine')}, "
        f"preferred language {profile.get('language','en')}. Reply in that language."
    )


@api.post("/chat/send")
async def chat_send(req: ChatSendRequest, authorization: Optional[str] = Header(None)):
    """Non-streaming reply, saved to history. Streaming endpoint is /chat/stream."""
    user = await current_user(authorization)
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    session_id = req.session_id or new_id("chat")

    await db.chat_messages.insert_one({
        "user_id": user["user_id"], "session_id": session_id, "role": "user",
        "content": req.message, "created_at": now_utc(),
    })

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY, session_id=session_id,
        system_message=_build_system_for_user(profile),
    ).with_model(LLM_MODEL_PROVIDER, LLM_MODEL_NAME)

    # rebuild history (last 20)
    history = await db.chat_messages.find(
        {"user_id": user["user_id"], "session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(20)

    file_contents = None
    if req.image_base64:
        b64 = req.image_base64.split(",", 1)[1] if "," in req.image_base64 else req.image_base64
        file_contents = [ImageContent(image_base64=b64)]

    # simple send-message approach for non-streaming — accumulate stream
    out_parts: list[str] = []
    async for ev in chat.stream_message(UserMessage(text=req.message, file_contents=file_contents)):
        if isinstance(ev, TextDelta):
            out_parts.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    reply = "".join(out_parts).strip()

    await db.chat_messages.insert_one({
        "user_id": user["user_id"], "session_id": session_id, "role": "assistant",
        "content": reply, "created_at": now_utc(),
    })
    return {"session_id": session_id, "reply": reply}


@api.get("/chat/history")
async def chat_history(session_id: Optional[str] = None, authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    q = {"user_id": user["user_id"]}
    if session_id:
        q["session_id"] = session_id
    msgs = await db.chat_messages.find(q, {"_id": 0}).sort("created_at", 1).to_list(500)
    for m in msgs:
        if isinstance(m.get("created_at"), datetime):
            m["created_at"] = m["created_at"].isoformat()
    return {"messages": msgs}


@api.delete("/chat/session/{session_id}")
async def chat_clear(session_id: str, authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    await db.chat_messages.delete_many({"user_id": user["user_id"], "session_id": session_id})
    return {"ok": True}


# --------------------------------------------------------------------------------------
# Recipes
# --------------------------------------------------------------------------------------
class RecipeGenRequest(BaseModel):
    calories: Optional[int] = None
    ingredients: Optional[List[str]] = None
    budget: Optional[float] = None
    time_min: Optional[int] = None
    goal: Optional[str] = None
    diet: Optional[str] = None
    from_fridge: bool = False


@api.post("/recipes/generate")
async def recipe_generate(req: RecipeGenRequest, authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    profile = await db.profiles.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    lang = profile.get("language", "en")
    prompt = f"""Generate a single healthy recipe.
Constraints: calories≈{req.calories or 'any'}, budget≈{req.budget or 'any'}$, time≤{req.time_min or 30}min,
goal={req.goal or profile.get('goal')}, diet={req.diet or 'none'}, language={lang}.
{'Use ONLY these ingredients (fridge mode): ' + ', '.join(req.ingredients) if req.from_fridge and req.ingredients else 'Available preferred ingredients: ' + str(req.ingredients or [])}
Return JSON: {{"title","description","category","calories","protein_g","fat_g","carbs_g","fiber_g","cooking_time_min","difficulty","estimated_cost_usd","ingredients":[{{"name","amount","unit"}}],"steps":["..."],"image_prompt":"..."}}"""
    result = await llm_json("You are a top chef and nutritionist. Output only JSON.", prompt, session_id=new_id("recipe"))
    recipe_id = new_id("recipe")
    doc = {"recipe_id": recipe_id, "user_id": user["user_id"], "created_at": now_utc(), **result}
    await db.recipes.insert_one(doc.copy())
    return {"recipe_id": recipe_id, **result}


@api.get("/recipes")
async def list_recipes(authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    recipes = await db.recipes.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for r in recipes:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return {"recipes": recipes}


# --------------------------------------------------------------------------------------
# Habits
# --------------------------------------------------------------------------------------
class HabitLogRequest(BaseModel):
    date: Optional[str] = None  # YYYY-MM-DD
    water_ml: Optional[int] = None
    steps: Optional[int] = None
    sleep_hours: Optional[float] = None
    exercise_min: Optional[int] = None
    vegetables_servings: Optional[int] = None
    protein_g: Optional[int] = None


@api.post("/habits/log")
async def habits_log(req: HabitLogRequest, authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    date = req.date or now_utc().date().isoformat()
    data = {k: v for k, v in req.dict().items() if v is not None and k != "date"}
    await db.habits_log.update_one(
        {"user_id": user["user_id"], "date": date},
        {"$set": {"user_id": user["user_id"], "date": date, **data, "updated_at": now_utc()}},
        upsert=True,
    )
    log_doc = await db.habits_log.find_one({"user_id": user["user_id"], "date": date}, {"_id": 0})
    return {"log": log_doc}


@api.get("/habits")
async def habits_get(authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    logs = await db.habits_log.find({"user_id": user["user_id"]}, {"_id": 0}).sort("date", -1).to_list(30)
    # streak calculation
    today = now_utc().date()
    streak = 0
    dates = {l["date"] for l in logs}
    d = today
    while d.isoformat() in dates:
        streak += 1
        d = d - timedelta(days=1)
    return {"logs": logs, "streak": streak}


# --------------------------------------------------------------------------------------
# Stripe subscriptions
# --------------------------------------------------------------------------------------
PLAN_PRICES = {
    "pro": {"amount": 999, "currency": "usd", "name": "NutriFlow Pro"},
    "family": {"amount": 1999, "currency": "usd", "name": "NutriFlow Family"},
}


class CheckoutRequest(BaseModel):
    plan: Literal["pro", "family"]
    origin_url: Optional[str] = None


@api.post("/stripe/checkout")
async def stripe_checkout(req: CheckoutRequest, authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    plan_info = PLAN_PRICES.get(req.plan)
    if not plan_info:
        raise HTTPException(400, "Invalid plan")

    origin = req.origin_url or APP_URL
    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": plan_info["currency"],
                    "product_data": {"name": plan_info["name"]},
                    "recurring": {"interval": "month"},
                    "unit_amount": plan_info["amount"],
                },
                "quantity": 1,
            }],
            client_reference_id=user["user_id"],
            customer_email=user["email"],
            success_url=f"{origin}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{origin}/billing/cancel",
            metadata={"user_id": user["user_id"], "plan": req.plan},
        )
    except Exception as e:
        raise HTTPException(502, f"Stripe error: {e}")

    await db.checkout_sessions.insert_one({
        "session_id": session.id,
        "user_id": user["user_id"],
        "plan": req.plan,
        "status": "open",
        "created_at": now_utc(),
    })
    return {"checkout_url": session.url, "session_id": session.id}


@api.get("/stripe/session/{session_id}")
async def stripe_session_status(session_id: str, authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except Exception as e:
        raise HTTPException(404, f"Session not found: {e}")

    status = session.get("payment_status")  # paid / unpaid / no_payment_required
    plan = None
    if session.get("metadata"):
        plan = session["metadata"].get("plan")

    if status == "paid" and plan:
        await db.subscriptions.update_one(
            {"user_id": user["user_id"]},
            {"$set": {
                "user_id": user["user_id"],
                "plan": plan,
                "status": "active",
                "stripe_subscription_id": session.get("subscription"),
                "updated_at": now_utc(),
            }},
            upsert=True,
        )
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"subscription_plan": plan}})

    return {"status": status, "plan": plan}


@api.get("/subscription")
async def get_subscription(authorization: Optional[str] = Header(None)):
    user = await current_user(authorization)
    sub = await db.subscriptions.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if sub and isinstance(sub.get("updated_at"), datetime):
        sub["updated_at"] = sub["updated_at"].isoformat()
    return {"subscription": sub or {"plan": "free", "status": "active"}}


# --------------------------------------------------------------------------------------
# Health / root
# --------------------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"app": "NutriFlow AI", "status": "ok", "time": now_utc().isoformat()}


@api.get("/health")
async def health():
    return {"status": "healthy"}


app.include_router(api)
