"""Base dos scrapers: tipos compartilhados, rate limit e HTTP."""

from __future__ import annotations

import asyncio
import random
import re
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from ..config import get_settings

_PRICE_THOUSANDS = re.compile(r"\d{1,3}(\.\d{3})+")


def parse_brl(text: str | None) -> float | None:
    """Converte 'R$ 3.499,90' → 3499.90 | '1.299' → 1299.0 | '89,90' → 89.9."""
    if not text:
        return None
    cleaned = re.sub(r"[^\d,\.]", "", text)
    if not cleaned:
        return None
    if "," in cleaned:  # formato BR completo: milhar '.' e decimal ','
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif _PRICE_THOUSANDS.fullmatch(cleaned):  # '1.299' = milhar sem centavos
        cleaned = cleaned.replace(".", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


@dataclass
class OfferRaw:
    """Oferta crua vinda de um scraper, antes de virar Product/Offer."""

    marketplace: str
    external_id: str
    title: str
    url: str
    price: float
    list_price: float | None = None
    image_url: str | None = None
    installments: str | None = None
    coupon_text: str | None = None
    seller: str | None = None
    condition: str = "new"  # new | used | refurbished
    in_stock: bool = True
    category: str | None = None  # electronics | games
    source: dict[str, Any] = field(default_factory=dict)  # metadados (kw, página...)


class RateLimiter:
    """1 requisição por vez contra o mesmo site, com pausa humanizada."""

    def __init__(self, min_s: float, max_s: float):
        self._min, self._max = min_s, max_s
        self._lock = asyncio.Lock()
        self._last: float = 0.0

    async def wait(self) -> None:
        async with self._lock:
            elapsed = time.monotonic() - self._last
            pause = random.uniform(self._min, self._max)
            if elapsed < pause:
                await asyncio.sleep(pause - elapsed)
            self._last = time.monotonic()


def make_http_client() -> httpx.AsyncClient:
    """Cliente HTTP com headers de navegador real (pt-BR)."""
    settings = get_settings()
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        "Upgrade-Insecure-Requests": "1",
    }
    return httpx.AsyncClient(
        headers=headers,
        follow_redirects=True,
        timeout=httpx.Timeout(20.0, connect=10.0),
    )


class CircuitBreaker:
    """Abre após N falhas seguidas; fica aberto por um tempo de cooldown."""

    def __init__(self, fail_threshold: int, cooldown_s: float):
        self.fail_threshold = fail_threshold
        self.cooldown_s = cooldown_s
        self._fails = 0
        self._opened_at: float | None = None

    @property
    def is_open(self) -> bool:
        if self._opened_at is None:
            return False
        import time as _t

        if _t.monotonic() - self._opened_at >= self.cooldown_s:
            # Meio-aberto: deixa tentar de novo
            self._opened_at = None
            self._fails = self.fail_threshold - 1
            return False
        return True

    def record_success(self) -> None:
        self._fails = 0
        self._opened_at = None

    def record_failure(self) -> None:
        self._fails += 1
        if self._fails >= self.fail_threshold and self._opened_at is None:
            import time as _t

            self._opened_at = _t.monotonic()
