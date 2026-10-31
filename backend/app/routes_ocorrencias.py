import math

from fastapi import APIRouter, Body, Depends, Query

from .db import fix_row, json_param, tx
from .http import ApiError
from .security import usuario_atual

router = APIRouter(prefix="/ocorrencias")

STATUS = ("Aberta", "Em Análise", "Em Execução", "Resolvida", "Encerrada")
PRIORIDADES = ("Baixa", "Média", "Alta")


def _int(valor, padrao):
    try:
        return int(valor)
    except (TypeError, ValueError):
        return padrao


# ⚠️ /dashboard precisa vir ANTES de /{id}
@router.get("/dashboard")
def dashboard(u: dict = Depends(usuario_atual)):
    # todos os perfis veem as estatísticas gerais da cidade
    filtro, p = "", ()
    with tx() as cur:
        cur.execute(
            f"""SELECT COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE status='Aberta') AS abertas,
                  COUNT(*) FILTER (WHERE status IN ('Em Análise','Em Execução')) AS andamento,
                  COUNT(*) FILTER (WHERE status='Resolvida') AS resolvidas,
                  COUNT(*) FILTER (WHERE prioridade='Alta') AS alta_prioridade
                FROM ocorrencias o {filtro}""", p)
        totais = cur.fetchone()
        cur.execute(
            f"""SELECT c.nome, c.icone, c.cor, COUNT(o.id) AS total
                FROM categorias c LEFT JOIN ocorrencias o ON o.categoria_id = c.id
                GROUP BY c.id ORDER BY total DESC, c.nome""", p)
        por_categoria = cur.fetchall()
        cur.execute(f"SELECT status, COUNT(*) AS total FROM ocorrencias o {filtro} GROUP BY status", p)
        por_status = cur.fetchall()
    return {"totais": totais, "porCategoria": por_categoria, "porStatus": por_status}


@router.get("")
def listar(status: str | None = None, categoria_id: str | None = None, prioridade: str | None = None,
           busca: str | None = None, minhas: str | None = None, page: str = Query("1"), limit: str = Query("10"),
           u: dict = Depends(usuario_atual)):
    page = max(_int(page, 1), 1)
    limit = min(max(_int(limit, 10), 1), 100)
    where, params = [], []
    if minhas in ("1", "true"):  # opcional: só as minhas
        where.append("o.usuario_id = %s"); params.append(u["id"])
    if status:
        where.append("o.status = %s"); params.append(status)
    if categoria_id:
        where.append("o.categoria_id = %s"); params.append(_int(categoria_id, 0))
    if prioridade:
        where.append("o.prioridade = %s"); params.append(prioridade)
    if busca:
        where.append("(o.titulo ILIKE %s OR o.endereco ILIKE %s)"); params += [f"%{busca}%"] * 2
    clausula = ("WHERE " + " AND ".join(where)) if where else ""

    with tx() as cur:
        cur.execute(f"SELECT COUNT(*) AS total FROM ocorrencias o {clausula}", params)
        total = cur.fetchone()["total"]
        cur.execute(
            f"""SELECT o.*, c.nome AS categoria_nome, c.icone AS categoria_icone, u.nome AS usuario_nome
                FROM ocorrencias o
                JOIN categorias c ON c.id = o.categoria_id
                JOIN usuarios u ON u.id = o.usuario_id
                {clausula} ORDER BY o.created_at DESC, o.id DESC LIMIT %s OFFSET %s""",
            [*params, limit, (page - 1) * limit])
        rows = [fix_row(r) for r in cur.fetchall()]
    return {"data": rows, "total": total, "page": page, "totalPages": math.ceil(total / limit)}


@router.get("/{id}")
def buscar(id: int, u: dict = Depends(usuario_atual)):
    with tx() as cur:
        cur.execute(
            """SELECT o.*, c.nome AS categoria_nome, c.icone AS categoria_icone, c.cor AS categoria_cor,
                      u.nome AS usuario_nome
               FROM ocorrencias o
               JOIN categorias c ON c.id = o.categoria_id
               JOIN usuarios u ON u.id = o.usuario_id
               WHERE o.id = %s""", (id,))
        oc = fix_row(cur.fetchone())
        if not oc:
            raise ApiError(404, "Ocorrência não encontrada.")
        cur.execute(
            """SELECT cm.*, u.nome AS usuario_nome FROM comentarios cm
               JOIN usuarios u ON u.id = cm.usuario_id
               WHERE cm.ocorrencia_id = %s ORDER BY cm.created_at ASC, cm.id ASC""", (id,))
        oc["comentarios"] = cur.fetchall()
        cur.execute(
            """SELECT h.*, u.nome AS usuario_nome FROM historico_ocorrencias h
               JOIN usuarios u ON u.id = h.usuario_id
               WHERE h.ocorrencia_id = %s ORDER BY h.created_at ASC, h.id ASC""", (id,))
        oc["historico"] = cur.fetchall()
    return oc


@router.post("", status_code=201)
def criar(data: dict = Body(default={}), u: dict = Depends(usuario_atual)):
    titulo, descricao, endereco = data.get("titulo"), data.get("descricao"), data.get("endereco")
    categoria_id = _int(data.get("categoria_id"), 0)
    if not titulo or not descricao or not endereco or not categoria_id:
        raise ApiError(400, "Campos obrigatórios não preenchidos.")
    lat, lng = data.get("lat"), data.get("lng")
    if not lat or not lng:
        raise ApiError(400, "Localização no mapa é obrigatória.")
    prioridade = data.get("prioridade") or "Média"
    if prioridade not in PRIORIDADES:
        raise ApiError(400, "Prioridade inválida.")
    fotos = data.get("fotos") or []
    if not isinstance(fotos, list):
        raise ApiError(400, "Fotos deve ser uma lista.")

    with tx() as cur:
        cur.execute("SELECT id FROM categorias WHERE id=%s AND ativo", (categoria_id,))
        if not cur.fetchone():
            raise ApiError(400, "Categoria inválida.")
        cur.execute(
            """INSERT INTO ocorrencias (titulo, descricao, endereco, categoria_id, prioridade, lat, lng, fotos, usuario_id)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            (titulo, descricao, endereco, categoria_id, prioridade, lat, lng, json_param(fotos), u["id"]))
        oid = cur.fetchone()["id"]
        cur.execute("INSERT INTO historico_ocorrencias (ocorrencia_id, usuario_id, acao) VALUES (%s,%s,%s)",
                    (oid, u["id"], "Ocorrência registrada"))
        cur.execute("SELECT * FROM ocorrencias WHERE id=%s", (oid,))
        return fix_row(cur.fetchone())


@router.put("/{id}")
def atualizar(id: int, data: dict = Body(default={}), u: dict = Depends(usuario_atual)):
    status = data.get("status")
    prioridade = data.get("prioridade")
    if status and status not in STATUS:
        raise ApiError(400, "Status inválido.")
    if prioridade and prioridade not in PRIORIDADES:
        raise ApiError(400, "Prioridade inválida.")

    with tx() as cur:
        cur.execute("SELECT * FROM ocorrencias WHERE id=%s", (id,))
        oc = cur.fetchone()
        if not oc:
            raise ApiError(404, "Não encontrada.")
        fiscal = u["role"] != "cidadao"
        if not fiscal and oc["usuario_id"] != u["id"]:
            raise ApiError(403, "Acesso não autorizado.")

        novo_status = status if (fiscal and status) else oc["status"]
        titulo = data.get("titulo")
        cat = _int(data.get("categoria_id"), 0) or oc["categoria_id"]
        cur.execute(
            """UPDATE ocorrencias SET titulo=%s, descricao=%s, endereco=%s, categoria_id=%s,
               prioridade=%s, status=%s WHERE id=%s""",
            (titulo or oc["titulo"], data.get("descricao") or oc["descricao"],
             data.get("endereco") or oc["endereco"], cat, prioridade or oc["prioridade"], novo_status, id))

        acoes = []
        if fiscal and status and status != oc["status"]:
            acoes.append(f'Status alterado para "{status}"')
        if titulo and titulo != oc["titulo"]:
            acoes.append("Título editado")
        for acao in acoes:
            cur.execute("INSERT INTO historico_ocorrencias (ocorrencia_id, usuario_id, acao) VALUES (%s,%s,%s)",
                        (id, u["id"], acao))

        if fiscal and status and status != oc["status"] and oc["usuario_id"] != u["id"]:
            cur.execute(
                """INSERT INTO notificacoes (usuario_id, titulo, mensagem, tipo, ocorrencia_id)
                   VALUES (%s,%s,%s,'status',%s)""",
                (oc["usuario_id"], "Status atualizado",
                 f'Sua ocorrência "{oc["titulo"]}" mudou para {status}.', id))

        cur.execute("SELECT * FROM ocorrencias WHERE id=%s", (id,))
        return fix_row(cur.fetchone())


@router.delete("/{id}")
def remover(id: int, u: dict = Depends(usuario_atual)):
    with tx() as cur:
        cur.execute("SELECT usuario_id FROM ocorrencias WHERE id=%s", (id,))
        oc = cur.fetchone()
        if not oc:
            raise ApiError(404, "Não encontrada.")
        if u["role"] != "admin" and oc["usuario_id"] != u["id"]:
            raise ApiError(403, "Acesso não autorizado.")
        cur.execute("DELETE FROM ocorrencias WHERE id=%s", (id,))
    return {"message": "Ocorrência removida com sucesso."}


@router.post("/{id}/comentarios", status_code=201)
def comentar(id: int, data: dict = Body(default={}), u: dict = Depends(usuario_atual)):
    texto = data.get("texto")
    if not texto:
        raise ApiError(400, "Texto obrigatório.")
    with tx() as cur:
        cur.execute("SELECT * FROM ocorrencias WHERE id=%s", (id,))
        oc = cur.fetchone()
        if not oc:
            raise ApiError(404, "Ocorrência não encontrada.")
        cur.execute("INSERT INTO comentarios (ocorrencia_id, usuario_id, texto) VALUES (%s,%s,%s) RETURNING id",
                    (id, u["id"], texto))
        cid = cur.fetchone()["id"]
        cur.execute("INSERT INTO historico_ocorrencias (ocorrencia_id, usuario_id, acao) VALUES (%s,%s,%s)",
                    (id, u["id"], f'Comentário adicionado por {u["nome"]}'))
        if oc["usuario_id"] != u["id"]:
            cur.execute(
                """INSERT INTO notificacoes (usuario_id, titulo, mensagem, tipo, ocorrencia_id)
                   VALUES (%s,%s,%s,'comentario',%s)""",
                (oc["usuario_id"], "Novo comentário",
                 f'{u["nome"]} comentou na sua ocorrência "{oc["titulo"]}".', id))
        cur.execute("SELECT * FROM comentarios WHERE id=%s", (cid,))
        return cur.fetchone()
