from datetime import datetime, timedelta, timezone
from hashlib import sha256

import jwt
from apiflask import HTTPTokenAuth
from flask import current_app
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models.user import User


token_auth = HTTPTokenAuth(scheme="Bearer")


def _jwt_hmac_secret() -> str:
    secret = current_app.config.get("SECRET_KEY", "")

    if secret is None:
        secret = ""

    if not isinstance(secret, str):
        secret = str(secret)

    secret = secret.strip()

    if not secret:
        return "jegymester-jwt-secret-key-2026"

   
    if "-----BEGIN" in secret and "-----END" in secret:
        return sha256(secret.encode("utf-8")).hexdigest()

    
    if len(secret.encode("utf-8")) < 32:
        return sha256(secret.encode("utf-8")).hexdigest()

    return secret


def generate_access_token(user: User) -> tuple[str, int]:
    expires_in = int(current_app.config.get("JWT_ACCESS_TOKEN_EXPIRES", 3600))
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user.id),
        "role": user.role.name if user.role is not None else None,
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
    }

    token = jwt.encode(payload, _jwt_hmac_secret(), algorithm="HS256")
    return token, expires_in


@token_auth.verify_token
def verify_token(token: str):
    try:
        payload = jwt.decode(token, _jwt_hmac_secret(), algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        return None

    return db.session.execute(
        select(User)
        .options(joinedload(User.role))
        .filter(User.id == user_id)
    ).scalar_one_or_none()


@token_auth.get_user_roles
def get_user_roles(user: User):
    if user is None or user.role is None:
        return []
    return [user.role.name]
