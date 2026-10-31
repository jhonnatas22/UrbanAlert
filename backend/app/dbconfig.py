"""Configuração de conexão com o banco.

Sem nenhuma configuração roda em SQLite (arquivo backend/urbanalert.db, nada para instalar).
Com DATABASE_URL (ou DB_ENGINE=postgres) usa PostgreSQL.

Use DATABASE_URL (é o que o Render fornece: postgresql://usuario:senha@host/banco)
ou as variáveis separadas DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD (uso local).
Opcional: DB_SSLMODE (disable | prefer | require ...). Padrão do libpq: prefer.
"""
import os
import re
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def engine() -> str:
    """'sqlite' (padrão local, nada para instalar) ou 'postgres' (Render / DATABASE_URL)."""
    e = os.getenv("DB_ENGINE", "").strip().lower()
    if e in ("sqlite", "postgres"):
        return e
    return "postgres" if os.getenv("DATABASE_URL") else "sqlite"


def schema() -> str | None:
    """DB_SCHEMA: usa um schema próprio no PostgreSQL (ex.: 'urbanalert'), para dividir o
    mesmo banco com outros projetos sem misturar tabelas."""
    nome = os.getenv("DB_SCHEMA", "").strip()
    if nome and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", nome):
        raise SystemExit(f"DB_SCHEMA inválido: {nome!r}")
    return nome or None


def sqlite_path() -> str:
    p = Path(os.getenv("SQLITE_PATH", "urbanalert.db"))
    return str(p if p.is_absolute() else Path(__file__).resolve().parent.parent / p)


def usa_database_url() -> bool:
    return bool(os.getenv("DATABASE_URL"))


def parametros() -> dict:
    """Parâmetros de conexão como dict (host, port, dbname, user, password...)."""
    from psycopg.conninfo import conninfo_to_dict

    url = os.getenv("DATABASE_URL")
    if url:
        p = conninfo_to_dict(url)
    else:
        p = {
            "host": os.getenv("DB_HOST", "localhost"),
            "port": os.getenv("DB_PORT", "5432"),
            "dbname": os.getenv("DB_NAME", "urbanalert"),
            "user": os.getenv("DB_USER", "postgres"),
            "password": os.getenv("DB_PASSWORD", ""),
        }
    if os.getenv("DB_SSLMODE"):
        p["sslmode"] = os.getenv("DB_SSLMODE")
    if schema():
        p["options"] = f"-c search_path={schema()}"
    return {k: v for k, v in p.items() if v not in (None, "")}


def conninfo(dbname: str | None = None) -> str:
    from psycopg.conninfo import make_conninfo

    p = parametros()
    if dbname:
        p["dbname"] = dbname
    return make_conninfo(**p)
