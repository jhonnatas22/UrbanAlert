"""Inicia o servidor:  python run.py\nSem configurar nada usa SQLite (cria backend/urbanalert.db e o admin sozinho)."""
import uvicorn

from app.config import PORT

if __name__ == "__main__":
    print(f"🚀 UrbanAlert rodando em http://localhost:{PORT}  (docs da API: /api/docs)")
    uvicorn.run("app.main:app", host="0.0.0.0", port=PORT)
