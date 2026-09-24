from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


def _normalize_email(value: str) -> str:
    return value.strip().lower()


class UserCreate(BaseModel):
    email: EmailStr
    # bcrypt only uses the first 72 bytes of a password, so cap it there.
    password: str = Field(min_length=8, max_length=72)
    full_name: str | None = None

    _normalize = field_validator("email", mode="before")(_normalize_email)


class UserLogin(BaseModel):
    email: EmailStr
    password: str

    _normalize = field_validator("email", mode="before")(_normalize_email)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
