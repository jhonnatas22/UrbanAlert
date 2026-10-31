"""Teste de ponta a ponta da API (precisa do banco criado com setup_db.py).
Rode:  python tests/test_api.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

c = TestClient(app)
falhas = 0


def check(nome, cond, extra=""):
    global falhas
    print(("✅" if cond else "❌"), nome, "" if cond else extra)
    falhas += 0 if cond else 1


def H(tok): return {"Authorization": f"Bearer {tok}"}


r = c.get("/api/health"); check("health", r.status_code == 200 and r.json()["status"] == "ok")
check("sem token -> 401", c.get("/api/ocorrencias").status_code == 401)
r = c.post("/api/auth/login", json={"email": "admin@urbanalert.com", "senha": "errada"})
check("login errado -> 401 {error}", r.status_code == 401 and "error" in r.json())
r = c.post("/api/auth/login", json={"email": "admin@urbanalert.com", "senha": "admin123"})
check("login admin", r.status_code == 200 and r.json()["user"]["role"] == "admin" and "senha_hash" not in r.json()["user"], r.text)
adm = r.json()["token"]

import time
email = f"teste{int(time.time())}@x.com"
r = c.post("/api/auth/register", json={"nome": "Teste", "email": email, "senha": "abc123", "role": "admin"})
check("register 201 (role admin é ignorado)", r.status_code == 201 and r.json()["user"]["role"] == "cidadao", r.text)
cid = r.json()["token"]
check("register duplicado -> 409", c.post("/api/auth/register", json={"nome": "T", "email": email, "senha": "abc123"}).status_code == 409)
check("senha curta -> 400", c.post("/api/auth/register", json={"nome": "T", "email": "a@b.c", "senha": "123"}).status_code == 400)
check("/auth/me", c.get("/api/auth/me", headers=H(cid)).json()["email"] == email)
check("PUT /auth/me", c.put("/api/auth/me", headers=H(cid), json={"nome": "Teste2", "email": email, "bio": "oi"}).json()["bio"] == "oi")
check("troca senha errada -> 401", c.put("/api/auth/me/senha", headers=H(cid), json={"senhaAtual": "x", "novaSenha": "novasenha"}).status_code == 401)
check("troca senha ok", c.put("/api/auth/me/senha", headers=H(cid), json={"senhaAtual": "abc123", "novaSenha": "novasenha"}).status_code == 200)
check("login com senha nova", c.post("/api/auth/login", json={"email": email, "senha": "novasenha"}).status_code == 200)

cats = c.get("/api/categorias", headers=H(cid)).json()
check(">= 6 categorias", len(cats) >= 6)
check("cidadão não cria categoria -> 403", c.post("/api/categorias", headers=H(cid), json={"nome": "X"}).status_code == 403)
r = c.post("/api/categorias", headers=H(adm), json={"nome": "Nova", "icone": "🆕"})
check("admin cria categoria", r.status_code == 201 and r.json()["cor"] == "#74b9ff", r.text)
nid = r.json()["id"]
check("admin edita categoria", c.put(f"/api/categorias/{nid}", headers=H(adm), json={"nome": "Nova2"}).json()["nome"] == "Nova2")
check("admin remove categoria", c.delete(f"/api/categorias/{nid}", headers=H(adm)).status_code == 200)
check("categoria removida some", all(x["id"] != nid for x in c.get("/api/categorias", headers=H(adm)).json()))

body = {"titulo": "Buraco teste", "descricao": "d", "endereco": "Rua A", "categoria_id": cats[0]["id"],
        "prioridade": "Alta", "lat": -3.7, "lng": -38.5, "fotos": ["data:image/png;base64,AAAA"] }
check("criar sem lat -> 400", c.post("/api/ocorrencias", headers=H(cid), json={**body, "lat": None}).status_code == 400)
r = c.post("/api/ocorrencias", headers=H(cid), json=body)
check("criar ocorrência", r.status_code == 201 and r.json()["fotos"] == body["fotos"], r.text)
oid = r.json()["id"]
d = c.get(f"/api/ocorrencias/{oid}", headers=H(cid)).json()
check("detalhe: lat float, fotos lista, historico", isinstance(d["lat"], float) and d["fotos"] and len(d["historico"]) == 1 and d["categoria_cor"], str(d))
check("created_at ISO", "T" in d["created_at"])
l = c.get("/api/ocorrencias?limit=2&page=1", headers=H(cid)).json()
check("cidadão vê ocorrências de todos", l["total"] >= 4 and l["totalPages"] >= 2 and l["data"][0]["categoria_nome"], str(l))
check("filtro minhas=1", c.get("/api/ocorrencias?minhas=1", headers=H(cid)).json()["total"] == 1)
check("busca", c.get("/api/ocorrencias?busca=Buraco", headers=H(adm)).json()["total"] >= 1)
check("filtro status", all(o["status"] == "Aberta" for o in c.get("/api/ocorrencias?status=Aberta", headers=H(adm)).json()["data"]))
check("admin vê todas (>=4)", c.get("/api/ocorrencias", headers=H(adm)).json()["total"] >= 4)

r = c.put(f"/api/ocorrencias/{oid}", headers=H(cid), json={"status": "Resolvida"})
check("cidadão não muda status", r.status_code == 200 and r.json()["status"] == "Aberta", r.text)
check("status inválido -> 400", c.put(f"/api/ocorrencias/{oid}", headers=H(adm), json={"status": "Foo"}).status_code == 400)
r = c.put(f"/api/ocorrencias/{oid}", headers=H(adm), json={"status": "Em Execução"})
check("admin muda status", r.json()["status"] == "Em Execução", r.text)
n = c.get("/api/notificacoes", headers=H(cid)).json()
check("notificação de status gerada", n["naoLidas"] == 1 and n["data"][0]["tipo"] == "status", str(n))
check("ler uma", c.put(f"/api/notificacoes/{n['data'][0]['id']}/ler", headers=H(cid)).status_code == 200)
check("naoLidas = 0", c.get("/api/notificacoes", headers=H(cid)).json()["naoLidas"] == 0)

r = c.post(f"/api/ocorrencias/{oid}/comentarios", headers=H(adm), json={"texto": "Em andamento"})
check("comentário 201", r.status_code == 201 and r.json()["texto"] == "Em andamento", r.text)
check("comentário gera notificação", c.get("/api/notificacoes", headers=H(cid)).json()["naoLidas"] == 1)
check("ler todas", c.put("/api/notificacoes/ler-todas", headers=H(cid)).status_code == 200)
d = c.get(f"/api/ocorrencias/{oid}", headers=H(cid)).json()
check("detalhe tem 1 comentário e histórico >= 3", len(d["comentarios"]) == 1 and len(d["historico"]) >= 3)
check("cidadão vê detalhe de ocorrência alheia", c.get("/api/ocorrencias/1", headers=H(cid)).status_code == 200)
check("cidadão não edita alheia -> 403", c.put("/api/ocorrencias/1", headers=H(cid), json={"titulo": "x"}).status_code == 403)
check("cidadão comenta em alheia", c.post("/api/ocorrencias/1/comentarios", headers=H(cid), json={"texto": "também ocorre aqui"}).status_code == 201)
check("ocorrência inexistente -> 404", c.get("/api/ocorrencias/999999", headers=H(adm)).status_code == 404)

dash = c.get("/api/ocorrencias/dashboard", headers=H(adm)).json()
check("dashboard admin", dash["totais"]["total"] >= 4 and isinstance(dash["totais"]["abertas"], int) and dash["porCategoria"], str(dash))
dc = c.get("/api/ocorrencias/dashboard", headers=H(cid)).json()
check("dashboard do cidadão = geral", dc["totais"]["total"] == dash["totais"]["total"] and dc["porCategoria"], str(dc))

check("cidadão não lista usuários -> 403", c.get("/api/usuarios", headers=H(cid)).status_code == 403)
us = c.get("/api/usuarios", headers=H(adm)).json()
check("admin lista usuários", len(us) >= 4 and "total_ocorrencias" in us[0] and "senha_hash" not in us[0])
check("admin não se remove", c.delete("/api/usuarios/1", headers=H(adm)).status_code == 400)
novo = [u for u in us if u["email"] == email][0]["id"]
check("admin exclui usuário", c.delete(f"/api/usuarios/{novo}", headers=H(adm)).status_code == 200)
check("excluído some da lista", all(x["id"] != novo for x in c.get("/api/usuarios", headers=H(adm)).json()))
check("excluído não loga", c.post("/api/auth/login", json={"email": email, "senha": "novasenha"}).status_code == 401)
check("excluir inexistente -> 404", c.delete(f"/api/usuarios/{novo}", headers=H(adm)).status_code == 404)

check("cidadão não apaga alheia -> 403", c.delete("/api/ocorrencias/1", headers=H(cid)).status_code in (403,))
check("ocorrências do usuário excluído foram apagadas (cascade)", c.get(f"/api/ocorrencias/{oid}", headers=H(adm)).status_code == 404)

check("frontend index", c.get("/").status_code == 200 and "html" in c.get("/").headers["content-type"])
check("frontend js", c.get("/js/api.js").status_code == 200)
check("fallback SPA", c.get("/qualquer/coisa").status_code == 200)
check("path traversal bloqueado", "root:" not in c.get("/..%2f..%2f..%2fetc/passwd").text)
check("rota api inexistente -> 404 json", c.get("/api/xyz", headers=H(adm)).status_code == 404 and "error" in c.get("/api/xyz").json())
print("\nFALHAS:", falhas); sys.exit(1 if falhas else 0)
