from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import UTCDateTime
from app.schemas.goal import GoalOut
from app.schemas.onboarding import LifeProfileOut
from app.schemas.update import UpdateOut

# bcrypt only uses the first 72 bytes of a password, so cap it there.
NewPassword = Field(min_length=8, max_length=72)


def _normalize_email(value: str) -> str:
    return value.strip().lower()


class UserCreate(BaseModel):
    email: EmailStr
    password: str = NewPassword
    full_name: str | None = Field(default=None, max_length=255)

    _normalize = field_validator("email", mode="before")(_normalize_email)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(max_length=256)

    _normalize = field_validator("email", mode="before")(_normalize_email)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None
    created_at: UTCDateTime
    has_password: bool = False

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ChangePassword(BaseModel):
    current_password: str | None = None  # not needed for Google-only accounts setting a first password
    new_password: str = NewPassword


class ForgotPassword(BaseModel):
    email: EmailStr

    _normalize = field_validator("email", mode="before")(_normalize_email)


class ResetPassword(BaseModel):
    token: str
    new_password: str = NewPassword


class DeleteAccount(BaseModel):
    password: str | None = None  # required when the account has a password
    confirm: str  # must be the exact text "DELETE"


class AccountExport(BaseModel):
    exported_at: UTCDateTime
    user: UserOut
    life_profile: LifeProfileOut | None
    goals: list[GoalOut]
    updates: list[UpdateOut]
