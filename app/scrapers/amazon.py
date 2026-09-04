"""Scraper da Amazon BR via Playwright (busca + página de ofertas).

Amazon tem anti-bot forte: usamos contexto persistente (cookies), delays
humanizados e leitura do DOM renderizado. Sem CAPTCHA resolver — se aparecer,
o ciclo falha, o circuit breaker abre e tentamos de novo mais tarde.
"""
from __future__ import annotations

import asyncio
import logging
import random
import re
from urllib.parse import quote_plus

from ..config import get_settings
from .base import OfferRaw, RateLimiter, parse_brl
from .browser import manager

log = logging.getLogger("promobot.scraper.amazon")

_SEARCH = "https://www.amazon.com.br/s?k={query}"
_DEALS = "https://www.amazon.com.br/deals"

# ASIN em links de produto
_ASIN_RE = re.compile(r"/(?:dp|gp/product)/([A-Z0-9]{10})")


def _parse_brl(text: str | None) -> float | None:
    return parse_brl(text)


class AmazonScraper:
    marketplace = "amazon"

    def __init__(self) -> None:
        settings = get_settings()
        self.limiter = RateLimiter(settings.min_delay_s, settings.max_delay_s)

    async def _human_pause(self) -> None:
        await asyncio.sleep(random.uniform(0.8, 2.0))

    async def _collect_search(self, keyword: str) -> list[OfferRaw]:
        offers: list[OfferRaw] = []
        async with manager.page_for(self.marketplace) as page:
            await self.limiter.wait()
            await page.goto(_SEARCH.format(query=quote_plus(keyword)), wait_until="domcontentloaded")
            await self._human_pause()
            if "captcha" in (page.url or "").lower():
                log.warning("Amazon: CAPTCHA na busca por '%s'", keyword)
                return []
            cards = page.locator("div[data-component-type='s-search-result']")
            count = min(await cards.count(), get_settings().results_per_keyword)
            for i in range(count):
                card = cards.nth(i)
                try:
                    asin = await card.get_attribute("data-asin")
                    if not asin:
                        continue
                    title_el = card.locator("h2 a span, h2 span").first
                    title = (await title_el.text_content()) if await title_el.count() else ""
                    if not title:
                        continue
                    price_el = card.locator("span.a-price span.a-offscreen").first
                    price_txt = await price_el.text_content() if await price_el.count() else None
                    if not price_txt:
                        continue
                    price = _parse_brl(price_txt)
                    if not price:
                        continue
                    list_el = card.locator("span.a-price.a-text-price span.a-offscreen").first
                    list_price = _parse_brl(await list_el.text_content()) if await list_el.count() else None
                    img_el = card.locator("img.s-image").first
                    img = await img_el.get_attribute("src") if await img_el.count() else None
                    offers.append(
                        OfferRaw(
                            marketplace=self.marketplace,
                            external_id=asin,
                            title=title.strip(),
                            url=f"https://www.amazon.com.br/dp/{asin}",
                            price=price,
                            list_price=list_price,
                            image_url=img,
                            category=_classify(title),
                            source={"via": "search", "kw": keyword},
                        )
                    )
                except Exception as exc:
                    log.debug("Card Amazon pulado: %s", exc)
        return offers

    async def _collect_deals(self) -> list[OfferRaw]:
        offers: list[OfferRaw] = []
        async with manager.page_for(self.marketplace) as page:
            await self.limiter.wait()
            await page.goto(_DEALS, wait_until="domcontentloaded")
            await self._human_pause()
            if "captcha" in (page.url or "").lower():
                log.warning("Amazon: CAPTCHA na página de ofertas")
                return []
            cards = page.locator("[data-test-id='DealCard'], div[class*='DealCard']")
            count = min(await cards.count(), 60)
            for i in range(count):
                card = cards.nth(i)
                try:
                    link = card.locator("a").first
                    href = await link.get_attribute("href") if await link.count() else None
                    if not href:
                        continue
                    m = _ASIN_RE.search(href)
                    if not m:
                        continue
                    asin = m.group(1)
                    title_el = card.locator("[data-test-id='CardTitle'], h2, span[class*='title']").first
                    title = await title_el.text_content() if await title_el.count() else ""
                    if not title or not title.strip():
                        continue
                    price_el = card.locator("span.a-offscreen").first
                    price_txt = await price_el.text_content() if await price_el.count() else None
                    if not price_txt:
                        continue
                    price = _parse_brl(price_txt)
                    if not price:
                        continue
                    offers.append(
                        OfferRaw(
                            marketplace=self.marketplace,
                            external_id=asin,
                            title=title.strip()[:300],
                            url=f"https://www.amazon.com.br/dp/{asin}",
                            price=price,
                            category=_classify(title),
                            source={"via": "deals"},
                        )
                    )
                except Exception as exc:
                    log.debug("Card de oferta Amazon pulado: %s", exc)
        return offers

    async def collect(self, keywords: list[str]) -> list[OfferRaw]:
        offers: list[OfferRaw] = []
        for kw in keywords:
            try:
                offers.extend(await self._collect_search(kw))
            except Exception as exc:
                log.warning("Busca Amazon falhou para '%s': %s", kw, exc)
        try:
            offers.extend(await self._collect_deals())
        except Exception as exc:
            log.warning("Ofertas Amazon falhou: %s", exc)
        log.info("Amazon: %d ofertas coletadas", len(offers))
        return offers


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
