from fastapi import APIRouter

from app.api.v1 import auth, categories, events, goals, onboarding, updates

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(categories.router)
api_router.include_router(onboarding.router)
api_router.include_router(goals.router)
api_router.include_router(updates.router)
api_router.include_router(events.router)
