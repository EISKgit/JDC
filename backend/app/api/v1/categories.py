from fastapi import APIRouter

from app.models.enums import Category

router = APIRouter(prefix="/categories", tags=["categories"])

# Human-readable labels for the 7 fixed MVP categories (see README "Locked MVP decisions").
CATEGORY_LABELS = {
    Category.health: "Health",
    Category.career: "Career",
    Category.finance: "Finance",
    Category.relationships: "Relationships",
    Category.learning: "Learning",
    Category.personal_growth: "Personal Growth",
    Category.lifestyle: "Lifestyle",
}


@router.get("")
def list_categories() -> list[dict[str, str]]:
    return [{"value": c.value, "label": label} for c, label in CATEGORY_LABELS.items()]
