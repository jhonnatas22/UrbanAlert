import json
from datetime import date, datetime
from decimal import Decimal

from fastapi.responses import JSONResponse


class ApiError(Exception):
    """Erro de negócio -> resposta {"error": "..."} (formato que o frontend espera)."""

    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message


def _default(o):
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    if isinstance(o, Decimal):
        return int(o) if o.as_tuple().exponent >= 0 else float(o)
    if isinstance(o, bytes):
        return o.decode("utf-8", "replace")
    raise TypeError(f"Não serializável: {type(o)}")


class AppResponse(JSONResponse):
    def render(self, content) -> bytes:
        return json.dumps(content, default=_default, ensure_ascii=False).encode("utf-8")
