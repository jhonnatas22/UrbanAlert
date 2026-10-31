from fastapi import APIRouter, Depends

from .db import tx
from .http import ApiError
from .security import exige_role, usuario_atual

router = APIRouter()
admin = Depends(exige_role("admin"))


# ---- NOTIFICAÇÕES ----
@router.get("/notificacoes")
def listar_notificacoes(u: dict = Depends(usuario_atual)):
    with tx() as cur:
        cur.execute("SELECT * FROM notificacoes WHERE usuario_id=%s ORDER BY created_at DESC, id DESC LIMIT 50", (u["id"],))
        rows = cur.fetchall()
    return {"data": rows, "naoLidas": sum(1 for n in rows if not n["lida"])}


# (rota fixa antes da rota com {id})
@router.put("/notificacoes/ler-todas")
def ler_todas(u: dict = Depends(usuario_atual)):
    with tx() as cur:
        cur.execute("UPDATE notificacoes SET lida=TRUE WHERE usuario_id=%s", (u["id"],))
    return {"message": "Todas marcadas como lidas."}


@router.put("/notificacoes/{id}/ler")
def ler_uma(id: int, u: dict = Depends(usuario_atual)):
    with tx() as cur:
        cur.execute("UPDATE notificacoes SET lida=TRUE WHERE id=%s AND usuario_id=%s", (id, u["id"]))
    return {"message": "Marcada como lida."}


# ---- USUÁRIOS (admin) ----
@router.get("/usuarios", dependencies=[admin])
def listar_usuarios():
    with tx() as cur:
        cur.execute(
            """SELECT u.id, u.nome, u.email, u.role, u.ativo, u.created_at, COUNT(o.id) AS total_ocorrencias
               FROM usuarios u LEFT JOIN ocorrencias o ON o.usuario_id = u.id
               GROUP BY u.id ORDER BY u.created_at DESC, u.id DESC"""
        )
        return cur.fetchall()


@router.delete("/usuarios/{id}")
def remover_usuario(id: int, u: dict = Depends(exige_role("admin"))):
    """Exclui o usuário de verdade. Por causa do ON DELETE CASCADE do schema,
    as ocorrências, comentários, histórico e notificações dele também são apagados."""
    if id == u["id"]:
        raise ApiError(400, "Você não pode remover a si mesmo.")
    with tx() as cur:
        cur.execute("SELECT role FROM usuarios WHERE id=%s", (id,))
        alvo = cur.fetchone()
        if not alvo:
            raise ApiError(404, "Usuário não encontrado.")
        if alvo["role"] == "admin":
            cur.execute("SELECT COUNT(*) AS n FROM usuarios WHERE role='admin' AND id<>%s", (id,))
            if cur.fetchone()["n"] == 0:
                raise ApiError(400, "Não é possível remover o único administrador.")
        cur.execute("DELETE FROM usuarios WHERE id=%s", (id,))
    return {"message": "Usuário excluído."}
