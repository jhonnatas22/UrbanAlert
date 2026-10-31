#!/usr/bin/env python3
"""
UrbanAlert - Prepara o banco de dados (SQLite local ou PostgreSQL).

O que faz:
  1. Lê a conexão do .env (DB_*) ou da variável DATABASE_URL (Render)
  2. Localmente: cria o banco se não existir (com DATABASE_URL o banco já deve existir)
  3. Executa sql/schema.sql (tabelas, índices, triggers, categorias) - pode rodar várias vezes
  4. Cria o usuário admin com hash bcrypt (ADMIN_EMAIL / ADMIN_PASSWORD, padrão admin123)

Banco: SQLite por padrão (arquivo backend/urbanalert.db, NADA para instalar).
       PostgreSQL se houver DATABASE_URL (Render) ou DB_ENGINE=postgres.

Uso:
  pip install -r requirements.txt
  python setup_db.py            # cria tudo que faltar
  python setup_db.py --demo     # + dados de exemplo
  python setup_db.py --reset    # APAGA as tabelas e recria do zero
"""
import argparse
import os
import re
import sys
from pathlib import Path

import bcrypt

from app import db, dbconfig

BASE = Path(__file__).resolve().parent
SCHEMA = BASE / "sql" / ("schema_sqlite.sql" if db.SQLITE else "schema.sql")

ADMIN_NOME = "Admin"
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@urbanalert.com")
ADMIN_SENHA = os.getenv("ADMIN_PASSWORD", "admin123")

TABELAS = ("notificacoes", "historico_ocorrencias", "comentarios", "ocorrencias", "categorias", "usuarios")

CATEGORIAS = [
    ("Buraco na Via",      "🕳️", "#e17055", "Buracos e irregularidades no pavimento"),
    ("Iluminação Pública", "💡", "#fdcb6e", "Postes apagados ou com defeito"),
    ("Descarte Irregular", "🗑️", "#00b894", "Lixo ou entulho depositado irregularmente"),
    ("Vandalismo",         "🎨", "#e94560", "Pichação, depredação de bens públicos"),
    ("Alagamento",         "🌊", "#74b9ff", "Pontos de alagamento e inundação"),
    ("Árvore/Vegetação",   "🌳", "#55efc4", "Árvores caídas, poda necessária"),
]


def hash_senha(senha: str) -> str:
    # O backend usa bcrypt ($2b$); trunca em 72 bytes como a lib original.
    return bcrypt.hashpw(senha.encode()[:72], bcrypt.gensalt(10)).decode()


def carregar_config() -> dict:
    if db.SQLITE:
        return {"motor": "SQLite", "destino": dbconfig.sqlite_path(), "name": "urbanalert"}
    p = dbconfig.parametros()
    return {"motor": "PostgreSQL", "destino": f"{p.get('user', '?')}@{p.get('host', '?')}:{p.get('port', '5432')}",
            "name": p.get("dbname", "?")}


def criar_banco(nome: str):
    """PostgreSQL local: cria o banco se faltar. Com DATABASE_URL o provedor já criou. SQLite: automático."""
    if db.SQLITE:
        return
    if dbconfig.usa_database_url():
        print(f"ℹ️  Usando o banco existente '{nome}' (DATABASE_URL)")
        return
    if not re.fullmatch(r"[A-Za-z0-9_]+", nome):
        sys.exit(f"Nome de banco inválido: {nome!r}")
    import psycopg
    from psycopg import sql

    with psycopg.connect(dbconfig.conninfo("postgres"), autocommit=True) as conn:
        if conn.execute("SELECT 1 FROM pg_database WHERE datname=%s", (nome,)).fetchone():
            print(f"✅ Banco '{nome}' já existe")
        else:
            conn.execute(sql.SQL("CREATE DATABASE {} ENCODING 'UTF8' TEMPLATE template0").format(sql.Identifier(nome)))
            print(f"✅ Banco '{nome}' criado")


def apagar_tabelas():
    with db.tx() as cur:
        for t in TABELAS:
            cur.execute(f"DROP TABLE IF EXISTS {t}" + ("" if db.SQLITE else " CASCADE"))
    print("🗑️  Tabelas removidas (--reset)")


def aplicar_schema():
    if not db.SQLITE and dbconfig.schema():
        with db.tx() as cur:
            cur.execute(f"CREATE SCHEMA IF NOT EXISTS {dbconfig.schema()}")
        print(f"✅ Schema '{dbconfig.schema()}' pronto")
    db.executar_script(SCHEMA.read_text(encoding="utf-8"))
    with db.tx() as cur:  # categorias padrão (só se a tabela estiver vazia)
        cur.execute("SELECT COUNT(*) AS n FROM categorias")
        if cur.fetchone()["n"] == 0:
            for c in CATEGORIAS:
                cur.execute("INSERT INTO categorias (nome, icone, cor, descricao) VALUES (%s,%s,%s,%s)", c)
    print("✅ Tabelas, índices e categorias padrão aplicados")


def garantir_admin():
    with db.tx() as cur:
        cur.execute("SELECT id FROM usuarios WHERE email=%s", (ADMIN_EMAIL,))
        if cur.fetchone():
            print("ℹ️  Admin já existe (senha mantida)")
            return
        cur.execute("INSERT INTO usuarios (nome, email, senha_hash, role) VALUES (%s,%s,%s,'admin')",
                    (ADMIN_NOME, ADMIN_EMAIL, hash_senha(ADMIN_SENHA)))
    mostra = ADMIN_SENHA if ADMIN_SENHA == "admin123" else "(definida em ADMIN_PASSWORD)"
    print(f"✅ Admin criado: {ADMIN_EMAIL} / {mostra}")


def inserir_demo():
    """Dados de exemplo para testar o sistema (só roda com --demo)."""
    with db.tx() as cur:
        cur.execute("SELECT COUNT(*) AS n FROM ocorrencias")
        if cur.fetchone()["n"] > 0:
            print("ℹ️  Já existem ocorrências; demo ignorada")
            return
        ids = {}
        for nome, email, role in (("Maria Cidadã", "maria@exemplo.com", "cidadao"),
                                  ("João Fiscal", "joao@exemplo.com", "fiscal")):
            cur.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
            row = cur.fetchone()
            if not row:
                cur.execute("INSERT INTO usuarios (nome, email, senha_hash, role) VALUES (%s,%s,%s,%s) RETURNING id",
                            (nome, email, hash_senha("123456"), role))
                row = cur.fetchone()
            ids[role] = row["id"]
        cur.execute("SELECT nome, id FROM categorias")
        cat = {r["nome"]: r["id"] for r in cur.fetchall()}

        ocorrencias = [
            ("Buraco grande na Av. Principal", "Buraco com cerca de 1m de diâmetro causando risco.",
             "Av. Principal, 1200", "Aberta", "Alta", -3.731862, -38.526670, cat["Buraco na Via"]),
            ("Poste apagado há uma semana", "Rua inteira no escuro à noite.",
             "Rua das Flores, 45", "Em Análise", "Média", -3.735000, -38.530000, cat["Iluminação Pública"]),
            ("Entulho na calçada", "Entulho de obra deixado na calçada.",
             "Rua Sete de Setembro, 300", "Resolvida", "Baixa", -3.740000, -38.520000, cat["Descarte Irregular"]),
        ]
        primeira = None
        for tit, desc, end, st, pr, lat, lng, cid in ocorrencias:
            cur.execute(
                """INSERT INTO ocorrencias
                   (titulo, descricao, endereco, status, prioridade, lat, lng, fotos, categoria_id, usuario_id)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (tit, desc, end, st, pr, lat, lng, db.json_param([]), cid, ids["cidadao"]))
            oid = cur.fetchone()["id"]
            primeira = primeira or oid
            cur.execute("INSERT INTO historico_ocorrencias (ocorrencia_id, usuario_id, acao) VALUES (%s,%s,%s)",
                        (oid, ids["cidadao"], "Ocorrência registrada"))
        cur.execute("INSERT INTO comentarios (ocorrencia_id, usuario_id, texto) VALUES (%s,%s,%s)",
                    (primeira, ids["fiscal"], "Equipe técnica será enviada ao local."))
        cur.execute("INSERT INTO notificacoes (usuario_id, titulo, mensagem, tipo, ocorrencia_id) "
                    "VALUES (%s,%s,%s,'comentario',%s)",
                    (ids["cidadao"], "Novo comentário", "Um fiscal comentou na sua ocorrência.", primeira))
    print("✅ Dados de demonstração inseridos (usuários demo: senha 123456)")


def resumo():
    with db.tx() as cur:
        print("\n📊 Resumo:")
        for t in ("usuarios", "categorias", "ocorrencias", "comentarios", "historico_ocorrencias", "notificacoes"):
            cur.execute(f"SELECT COUNT(*) AS n FROM {t}")
            print(f"   {t:<24} {cur.fetchone()['n']} registro(s)")


def preparar():
    """Cria banco/tabelas/admin se faltarem. Seguro para rodar a cada deploy."""
    criar_banco(carregar_config()["name"])
    aplicar_schema()
    garantir_admin()


def main():
    ap = argparse.ArgumentParser(description="Prepara o banco do UrbanAlert")
    ap.add_argument("--reset", action="store_true", help="apaga as tabelas e recria")
    ap.add_argument("--demo", action="store_true", help="insere dados de exemplo")
    args = ap.parse_args()

    cfg = carregar_config()
    print(f"🔌 {cfg['motor']}: {cfg['destino']}  (banco={cfg['name']})")

    if args.reset and input("Isso APAGA todas as tabelas e dados. Digite 'sim' para continuar: ").strip().lower() != "sim":
        sys.exit("Cancelado.")

    try:
        criar_banco(cfg["name"])
        if args.reset:
            apagar_tabelas()
        aplicar_schema()
        garantir_admin()
        if args.demo:
            inserir_demo()
        resumo()
    except Exception as e:  # erros de conexão do PostgreSQL
        if db.SQLITE:
            raise
        msg = str(e).strip()
        if "password authentication failed" in msg:
            sys.exit(f"❌ Usuário/senha incorretos: confira DB_USER/DB_PASSWORD ou DATABASE_URL.\n   {msg}")
        sys.exit(f"❌ Não consegui conectar ao PostgreSQL ({cfg['destino']}). Ele está rodando?\n   {msg}")

    print("\n🚀 Pronto! Agora rode:  python run.py")


if __name__ == "__main__":
    main()
