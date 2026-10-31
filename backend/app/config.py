import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = (BACKEND_DIR.parent / "frontend").resolve()

load_dotenv(BACKEND_DIR / ".env")

PORT = int(os.getenv("PORT", "3001"))

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    sys.exit("❌ JWT_SECRET não definido (.env ou variável de ambiente)")


def _parse_duration(valor: str) -> int:
    """'7d' -> segundos. Aceita s, m, h, d ou número puro (segundos)."""
    m = re.fullmatch(r"(\d+)\s*([smhd]?)", (valor or "7d").strip())
    if not m:
        return 7 * 86400
    n, unidade = int(m.group(1)), m.group(2) or "s"
    return n * {"s": 1, "m": 60, "h": 3600, "d": 86400}[unidade]


JWT_EXPIRES_SECONDS = _parse_duration(os.getenv("JWT_EXPIRES_IN", "7d"))
