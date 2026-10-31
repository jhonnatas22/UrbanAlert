"""Acesso ao banco. Mesmo código de rotas para dois motores:
  - SQLite  (padrão local, sem instalar nada)
  - PostgreSQL (Render / produção, via DATABASE_URL)
As consultas usam placeholders %s; para SQLite eles são convertidos para '?'.
"""
import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone

from . import dbconfig

ENGINE = dbconfig.engine()
SQLITE = ENGINE == "sqlite"

_pool = None
_lock = threading.Lock()


# ---------------------------------------------------------------- PostgreSQL
def _get_pool():
    global _pool
    with _lock:
        if _pool is None:
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool

            _pool = ConnectionPool(
                dbconfig.conninfo(),
                min_size=1,
                max_size=int(os.getenv("DB_POOL_MAX", "5")),
                kwargs={"row_factory": dict_row},
                check=ConnectionPool.check_connection,  # descarta conexões mortas (banco gratuito que dormiu)
                open=False,
            )
            _pool.open()
        return _pool


def fechar():
    global _pool
    with _lock:
        if _pool is not None:
            _pool.close()
            _pool = None


# -------------------------------------------------------------------- SQLite
_TS_COLS = ("created_at", "updated_at")


def _ts(valor):
    """'2026-10-31 13:04:05' (UTC, formato do SQLite) -> ISO 8601 com fuso."""
    if isinstance(valor, str) and len(valor) >= 19 and valor[10] == " ":
        return valor.replace(" ", "T", 1)[:19] + "+00:00"
    return valor


class _Json:
    """Marca um valor Python para ser gravado como JSON no SQLite."""

    def __init__(self, obj):
        self.obj = obj


class _LiteCursor:
    """Imita o cursor do psycopg (dict rows, %s) em cima do sqlite3."""

    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn
        self._cur = conn.cursor()

    def execute(self, sql, params=None):
        sql = sql.replace("%s", "?").replace(" ILIKE ", " LIKE ")
        args = tuple(json.dumps(p.obj) if isinstance(p, _Json) else p for p in (params or ()))
        self._cur.execute(sql, args)
        return self

    def _row(self, row):
        if row is None:
            return None
        d = dict(row)
        for k in _TS_COLS:
            if k in d:
                d[k] = _ts(d[k])
        return d

    def fetchone(self):
        return self._row(self._cur.fetchone())

    def fetchall(self):
        return [self._row(r) for r in self._cur.fetchall()]

    @property
    def rowcount(self):
        return self._cur.rowcount


def _lite_connect() -> sqlite3.Connection:
    conn = sqlite3.connect(dbconfig.sqlite_path(), timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


# ------------------------------------------------------------------ interface
def json_param(obj):
    """Valor para uma coluna JSON (JSONB no Postgres, texto no SQLite)."""
    if SQLITE:
        return _Json(obj)
    from psycopg.types.json import Jsonb

    return Jsonb(obj)


@contextmanager
def tx():
    """Cursor dentro de uma transação: commit no fim, rollback se der erro."""
    if SQLITE:
        conn = _lite_connect()
        try:
            yield _LiteCursor(conn)
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()
    else:
        with _get_pool().connection() as conn:
            with conn.cursor() as cur:
                yield cur


def executar_script(texto: str):
    """Executa um arquivo SQL com vários comandos."""
    if SQLITE:
        conn = _lite_connect()
        try:
            conn.executescript(texto)
            conn.commit()
        finally:
            conn.close()
    else:
        with tx() as cur:
            cur.execute(texto)


def fix_row(row):
    """Garante que 'fotos' seja lista (JSONB já vem pronto; no SQLite vem texto)."""
    if row and isinstance(row.get("fotos"), (str, bytes)):
        try:
            row["fotos"] = json.loads(row["fotos"])
        except ValueError:
            row["fotos"] = []
    return row
