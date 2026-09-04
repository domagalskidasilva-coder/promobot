"""Scraper da Shopee BR via Playwright interceptando as APIs internas.

A Shopee não tem API pública; o site chama `/api/v4/search/search_items` com
JSON limpo — interceptamos essa resposta, que é bem mais estável que o DOM.
Sem API interceptada (anti-bot/login wall) → devolve lista vazia e registra
evento; o circuit breaker decide a pausa.
"""
from __future__ import annotations

import asyncio
import json as jsonlib
import logging
import re
from urllib.parse import quote_plus

from ..config import get_settings
from .base import OfferRaw, RateLimiter
from .browser import manager

log = logging.getLogger("promobot.scraper.shopee")

_SEARCH = "https://shopee.com.br/search?keyword={query}"
_API_PAT = re.compile(r"/api/v4/(?:search/)?search_items")


def _classify(title: str) -> str | None:
    t = title.lower()
    game_words = ("jogo", "game", "ps5", "playstation", "xbox", "nintendo", "switch", "steam")
    elec_words = ("notebook", "celular", "iphone", "smartphone", "fone", "monitor", "rtx", "gtx",
                  "ssd", "memória", "smart tv", "teclado", "mouse", "echo", "alexa", "macbook", "tablet")
    if any(w in t for w in game_words):
        return "games"
    if any(w in t for w in elec_words):
        return "electronics"
    return None


class ShopeeScraper:
    marketplace = "shopee"

    def __init__(self) -> None:
        settings = get_settings()
        self.limiter = RateLimiter(settings.min_delay_s, settings.max_delay_s)

    async def _collect_search(self, keyword: str) -> list[OfferRaw]:
        captured: list[dict] = []

        async def _on_response(response):
            try:
                if _API_PAT.search(response.url):
                    data = await response.json()
                    if isinstance(data, dict):
                        captured.append(data)
            except Exception:
                pass  # resposta não-JSON ou já descartada

        async with manager.page_for(self.marketplace) as page:
            page.on("response", _on_response)
            await self.limiter.wait()
            await page.goto(_SEARCH.format(query=quote_plus(keyword)), wait_until="domcontentloaded")
            # rola para disparar lazy-load e mais requisições da API
            for _ in range(3):
                await page.mouse.wheel(0, 1200)
                await asyncio.sleep(1.2)
            await page.wait_for_timeout(2000)

        offers: list[OfferRaw] = []
        seen: set[int] = set()
        for payload in captured:
            sections = payload.get("items") or []
            if isinstance(payload.get("data"), dict):
                sections = payload["data"].get("items") or sections
            for entry in sections:
                item = entry.get("item_basic") or entry
                itemid = item.get("itemid")
                if itemid is None or itemid in seen:
                    continue
                price = item.get("price")
                if not price:
                    continue
                # price vem em centavos ×1000 (1e5 = R$1,00)
                price_val = price / 100_000
                if price_val <= 0:
                    continue
                price_before = item.get("price_before_discount") or 0
                list_price = price_before / 100_000 if price_before > price else None
                shopid = item.get("shopid")
                seen.add(itemid)
                name = (item.get("name") or "").strip()
                if not name:
                    continue
                rating = (item.get("item_rating") or {}).get("rating_star")
                offers.append(
                    OfferRaw(
                        marketplace=self.marketplace,
                        external_id=str(itemid),
                        title=name[:300],
                        url=f"https://shopee.com.br/product/{shopid}/{itemid}",
                        price=round(price_val, 2),
                        list_price=round(list_price, 2) if list_price else None,
                        image_url=(f"https://cf.shopee.com.br/file/{item['image']}_tn" if item.get("image") else None),
                        seller=(item.get("shop_location") or None),
                        condition="used" if item.get("is_official_shop") is False and item.get("condition") == 2 else "new",
                        rating=round(rating, 2) if rating else None,
                        sold=item.get("historical_sold") or None,
                        category=_classify(name),
                        source={"via": "api_xhr", "kw": keyword},
                    )
                )
        return offers

    async def collect(self, keywords: list[str]) -> list[OfferRaw]:
        offers: list[OfferRaw] = []
        for kw in keywords:
            try:
                batch = await self._collect_search(kw)
                if not batch:
                    log.warning("Shopee: nenhuma oferta via API interna para '%s' (anti-bot?)", kw)
                offers.extend(batch)
            except Exception as exc:
                log.warning("Busca Shopee falhou para '%s': %s", kw, exc)
        log.info("Shopee: %d ofertas coletadas", len(offers))
        return offers
