from fastapi import APIRouter, Body, Depends

from .db import tx
from .http import ApiError
from .security import exige_role, usuario_atual

router = APIRouter(prefix="/categorias")
admin = Depends(exige_role("admin"))


def _campos(data: dict):
    if not data.get("nome"):
        raise ApiError(400, "Nome é obrigatório.")
    return (data["nome"], data.get("icone") or "", data.get("cor") or "#74b9ff", data.get("descricao") or "")


@router.get("")
def listar(_: dict = Depends(usuario_atual)):
    with tx() as cur:
        cur.execute(
            """SELECT c.*, COUNT(o.id) AS total_ocorrencias
               FROM categorias c LEFT JOIN ocorrencias o ON o.categoria_id = c.id
               WHERE c.ativo GROUP BY c.id ORDER BY c.nome"""
        )
        return cur.fetchall()


@router.get("/{id}")
def buscar(id: int, _: dict = Depends(usuario_atual)):
    with tx() as cur:
        cur.execute("SELECT * FROM categorias WHERE id=%s AND ativo", (id,))
        row = cur.fetchone()
    if not row:
        raise ApiError(404, "Categoria não encontrada.")
    return row


@router.post("", status_code=201, dependencies=[admin])
def criar(data: dict = Body(default={})):
    campos = _campos(data)
    with tx() as cur:
        cur.execute("INSERT INTO categorias (nome, icone, cor, descricao) VALUES (%s,%s,%s,%s) RETURNING *", campos)
        return cur.fetchone()


@router.put("/{id}", dependencies=[admin])
def atualizar(id: int, data: dict = Body(default={})):
    campos = _campos(data)
    with tx() as cur:
        cur.execute("SELECT id FROM categorias WHERE id=%s", (id,))
        if not cur.fetchone():
            raise ApiError(404, "Categoria não encontrada.")
        cur.execute("UPDATE categorias SET nome=%s, icone=%s, cor=%s, descricao=%s WHERE id=%s", (*campos, id))
        cur.execute("SELECT * FROM categorias WHERE id=%s", (id,))
        return cur.fetchone()


@router.delete("/{id}", dependencies=[admin])
def remover(id: int):
    with tx() as cur:  # soft delete
        cur.execute("UPDATE categorias SET ativo=FALSE WHERE id=%s", (id,))
    return {"message": "Categoria removida."}
