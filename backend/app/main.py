import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import routes_auth, routes_categorias, routes_ocorrencias, routes_usuarios
from .config import FRONTEND_DIR
from .db import SQLITE
from .http import ApiError, AppResponse

log = logging.getLogger("urbanalert")

@asynccontextmanager
async def lifespan(_: FastAPI):
    # SQLite local: sempre cria tabelas/admin se faltarem. PostgreSQL: com AUTO_SETUP=true (Render).
    if SQLITE or os.getenv("AUTO_SETUP", "false").lower() in ("1", "true", "yes"):
        import setup_db  # fica em backend/, que é o diretório de execução
        setup_db.preparar()
    yield
    from . import db
    db.fechar()


app = FastAPI(title="UrbanAlert API", default_response_class=AppResponse, docs_url="/api/docs",
              redoc_url=None, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # em produção, trocar pelo domínio real
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


# ---- erros sempre no formato {"error": "..."} ----
@app.exception_handler(ApiError)
async def _api_error(_: Request, exc: ApiError):
    return AppResponse({"error": exc.message}, status_code=exc.status)


@app.exception_handler(RequestValidationError)
async def _validation(_: Request, exc: RequestValidationError):
    return AppResponse({"error": "Requisição inválida."}, status_code=400)


@app.exception_handler(StarletteHTTPException)
async def _http(_: Request, exc: StarletteHTTPException):
    msg = "Rota não encontrada." if exc.status_code == 404 else str(exc.detail)
    return AppResponse({"error": msg}, status_code=exc.status_code)


@app.exception_handler(Exception)
async def _unexpected(_: Request, exc: Exception):
    log.exception("Erro inesperado", exc_info=exc)
    return AppResponse({"error": "Erro interno do servidor."}, status_code=500)


# ---- API ----
@app.get("/api/health")
def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


for r in (routes_auth.router, routes_ocorrencias.router, routes_categorias.router, routes_usuarios.router):
    app.include_router(r, prefix="/api")


# ---- frontend estático + fallback para index.html ----
@app.get("/{caminho:path}", include_in_schema=False)
def frontend(caminho: str):
    if caminho.startswith("api/"):
        raise StarletteHTTPException(404)
    alvo = (FRONTEND_DIR / caminho).resolve()
    if caminho and alvo.is_file() and alvo.is_relative_to(FRONTEND_DIR):
        return FileResponse(alvo)
    return FileResponse(FRONTEND_DIR / "index.html")
