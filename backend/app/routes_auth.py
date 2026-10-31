from fastapi import APIRouter, Body, Depends

from .db import tx
from .http import ApiError
from .security import confere_senha, criar_token, hash_senha, usuario_atual

router = APIRouter(prefix="/auth")


@router.post("/register", status_code=201)
def register(data: dict = Body(default={})):
    nome, email, senha = data.get("nome"), data.get("email"), data.get("senha")
    if not nome or not email or not senha:
        raise ApiError(400, "Nome, e-mail e senha são obrigatórios.")
    if len(str(senha)) < 6:
        raise ApiError(400, "Senha deve ter ao menos 6 caracteres.")
    role = data.get("role") if data.get("role") in ("cidadao", "fiscal") else "cidadao"

    with tx() as cur:
        cur.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
        if cur.fetchone():
            raise ApiError(409, "E-mail já cadastrado.")
        cur.execute(
            """INSERT INTO usuarios (nome, email, senha_hash, role) VALUES (%s,%s,%s,%s)
               RETURNING id, nome, email, role, created_at""",
            (nome, email, hash_senha(senha), role),
        )
        user = cur.fetchone()
    return {"token": criar_token(user), "user": user}


@router.post("/login")
def login(data: dict = Body(default={})):
    email, senha = data.get("email"), data.get("senha")
    if not email or not senha:
        raise ApiError(400, "E-mail e senha são obrigatórios.")
    with tx() as cur:
        cur.execute("SELECT * FROM usuarios WHERE email=%s AND ativo", (email,))
        user = cur.fetchone()
    if not user or not confere_senha(senha, user["senha_hash"]):
        raise ApiError(401, "E-mail ou senha inválidos.")
    user.pop("senha_hash")
    return {"token": criar_token(user), "user": user}


@router.get("/me")
def me(u: dict = Depends(usuario_atual)):
    with tx() as cur:
        cur.execute("SELECT id, nome, email, role, bio, created_at FROM usuarios WHERE id=%s", (u["id"],))
        row = cur.fetchone()
    if not row:
        raise ApiError(404, "Usuário não encontrado.")
    return row


@router.put("/me")
def update_me(data: dict = Body(default={}), u: dict = Depends(usuario_atual)):
    nome, email = data.get("nome"), data.get("email")
    if not nome or not email:
        raise ApiError(400, "Nome e e-mail são obrigatórios.")
    with tx() as cur:
        cur.execute("SELECT id FROM usuarios WHERE email=%s AND id<>%s", (email, u["id"]))
        if cur.fetchone():
            raise ApiError(409, "E-mail já em uso.")
        cur.execute("""UPDATE usuarios SET nome=%s, email=%s, bio=%s WHERE id=%s
                       RETURNING id, nome, email, role, bio""",
                    (nome, email, data.get("bio") or "", u["id"]))
        return cur.fetchone()


@router.put("/me/senha")
def update_senha(data: dict = Body(default={}), u: dict = Depends(usuario_atual)):
    atual, nova = data.get("senhaAtual"), data.get("novaSenha")
    if not atual or not nova:
        raise ApiError(400, "Campos obrigatórios.")
    if len(str(nova)) < 6:
        raise ApiError(400, "Nova senha mínimo 6 caracteres.")
    with tx() as cur:
        cur.execute("SELECT senha_hash FROM usuarios WHERE id=%s", (u["id"],))
        row = cur.fetchone()
        if not row or not confere_senha(atual, row["senha_hash"]):
            raise ApiError(401, "Senha atual incorreta.")
        cur.execute("UPDATE usuarios SET senha_hash=%s WHERE id=%s", (hash_senha(nova), u["id"]))
    return {"message": "Senha alterada com sucesso."}
