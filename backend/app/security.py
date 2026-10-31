from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Header

from .config import JWT_EXPIRES_SECONDS, JWT_SECRET
from .http import ApiError


def _pw(senha: str) -> bytes:
    return str(senha).encode("utf-8")[:72]  # bcrypt só usa 72 bytes (igual ao Node)


def hash_senha(senha: str) -> str:
    return bcrypt.hashpw(_pw(senha), bcrypt.gensalt(10)).decode()


def confere_senha(senha: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_pw(senha), hashed.encode())
    except ValueError:
        return False


def criar_token(user: dict) -> str:
    payload = {
        "id": user["id"], "nome": user["nome"], "email": user["email"], "role": user["role"],
        "exp": datetime.now(timezone.utc) + timedelta(seconds=JWT_EXPIRES_SECONDS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def usuario_atual(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise ApiError(401, "Token não fornecido.")
    try:
        return jwt.decode(authorization.split(" ", 1)[1], JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise ApiError(401, "Token inválido ou expirado.")


def exige_role(*roles: str):
    from fastapi import Depends

    def dep(user: dict = Depends(usuario_atual)) -> dict:
        if user.get("role") not in roles:
            raise ApiError(403, "Acesso não autorizado.")
        return user

    return dep
