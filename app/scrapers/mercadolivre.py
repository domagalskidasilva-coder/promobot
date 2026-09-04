"""Scraper do Mercado Livre.

Estratégia: API pública de busca como tentativa primária; HTML da listagem
como fallback; página de ofertas para pescar deals gerais.
"""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from urllib.parse import quote_plus, urlparse

import httpx
from bs4 import BeautifulSoup

from ..config import get_settings
from .base import OfferRaw, RateLimiter, make_http_client, parse_brl

log = logging.getLogger("promobot.scraper.ml")

_API = "https://api.mercadolibre.com/sites/MLB/search"
_SEARCH = "https://lista.mercadolivre.com.br/{query}"
_DEALS = "https://www.mercadolivre.com.br/ofertas"
_ID_RE = re.compile(r"(MLB-?\d{6,})", re.IGNORECASE)

# Categorias de interesse (eletrônicos e jogos)
_ELECTRONICS_CATS = {"MLB1000", "MLB1051", "MLB430598", "MLB1693", "MLB1712", "MLB1459"}
_GAMES_CATS = {"MLB1144", "MLB443082", "MLB122286"}


def _extract_id(url: str) -> str | None:
    # ignora links de anúncio patrocinado (mclics): não são produtos diretos
    if "mclics" in url or "click" in urlparse(url).netloc:
        return None
    m = _ID_RE.search(url)
    if not m:
        return None
    return m.group(1).upper().replace("MLB-", "MLB")


def _classify(title: str, category_id: str | None = None) -> str | None:
    t = title.lower()
    game_words = ("jogo ", "game ", "ps5", "playstation", "xbox", "nintendo", "switch", "steam")
    elec_words = ("notebook", "celular", "iphone", "smartphone", "fone", "headphone", "monitor",
                  "rtx", "gtx", "placa de vídeo", "ssd", "memória ram", "notebook gamer",
                  "air fryer", "smart tv", "teclado", "mouse", "echo", "alexa", "macbook", "tablet")
    if category_id:
        if category_id in _GAMES_CATS:
            return "games"
        if category_id in _ELECTRONICS_CATS:
            return "electronics"
    if any(w in t for w in game_words):
        return "games"
    if any(w in t for w in elec_words):
        return "electronics"
    return None


class MercadoLivreScraper:
    marketplace = "ml"

    def __init__(self) -> None:
        settings = get_settings()
        self.limiter = RateLimiter(settings.min_delay_s, settings.max_delay_s)
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = make_http_client()
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ---- API pública ------------------------------------------------------
    async def _search_api(self, client: httpx.AsyncClient, keyword: str) -> list[OfferRaw] | None:
        """Retorna None se a API recusar (rate limit etc.) -> usa fallback HTML."""
        try:
            await self.limiter.wait()
            resp = await client.get(_API, params={"q": keyword, "limit": 50})
            if resp.status_code != 200:
                log.info("API ML status %s — caindo para HTML", resp.status_code)
                return None
            data = resp.json()
            out: list[OfferRaw] = []
            for item in data.get("results", []):
                price = item.get("price")
                if not price:
                    continue
                out.append(
                    OfferRaw(
                        marketplace=self.marketplace,
                        external_id=str(item["id"]),
                        title=item.get("title", ""),
                        url=item.get("permalink") or item.get("url", ""),
                        price=float(price),
                        list_price=None,
                        image_url=(item.get("thumbnail") or "").replace("http://", "https://"),
                        condition={"new": "new", "used": "used", "refurbished": "refurbished"}.get(
                            item.get("condition", ""), "new"
                        ),
                        in_stock=item.get("available_quantity", 1) > 0,
                        category=_classify(item.get("title", ""), item.get("category_id")),
                        source={"via": "api", "kw": keyword},
                    )
                )
            return out
        except Exception:
            log.warning("API ML falhou — caindo para HTML", exc_info=True)
            return None

    # ---- HTML (via navegador — o httpx cai no desafio anti-bot do ML) ------
    async def _search_html(self, client: httpx.AsyncClient, keyword: str) -> list[OfferRaw]:
        url = _SEARCH.format(query=quote_plus(keyword.lower().replace(" ", "-")))
        html, blocked = await self._render_page(url)
        offers = self._parse_listing(html, keyword)
        if offers:
            return offers
        # Login-wall/anti-bot? Tenta pelo Chrome real do usuário (ClockBrowser).
        if blocked:
            log.info("ML bloqueou a busca '%s' no navegador headless — tentando via Chrome real (CDP).", keyword)
            html = await self._render_page_cdp(url)
            return self._parse_listing(html, keyword)
        return []

    async def _render_page_cdp(self, url: str) -> str:
        """Renderiza a página no Chrome real do usuário via CDP (ClockBrowser)."""
        from .cdpbrowser import cdp_enabled, manager as cdp_manager

        if not cdp_enabled():
            return ""
        await self.limiter.wait()
        try:
            async with cdp_manager.page_for(self.marketplace) as page:
                await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
                try:
                    await page.wait_for_selector(
                        ".poly-card, li.ui-search-layout__item, div.ui-search-result__wrapper",
                        timeout=15_000,
                    )
                except Exception:
                    pass
                await page.wait_for_timeout(800)
                return await page.content()
        except ConnectionError as exc:
            log.info("CDP fallback indisponível: %s", exc)
            return ""
        except Exception:
            log.warning("Busca via Chrome real falhou para %s", url, exc_info=True)
            return ""

    async def _render_page(self, url: str) -> tuple[str, bool]:
        """Renderiza no headless; retorna (html, caiu_em_login_wall)."""
        from .browser import manager

        await self.limiter.wait()
        async with manager.page_for(self.marketplace) as page:
            await page.goto(url, wait_until="domcontentloaded")
            # o ML carrega resultados via JS; espera o container de itens aparecer
            try:
                await page.wait_for_selector(
                    "li.ui-search-layout__item, div.ui-search-result__wrapper, "
                    ".poly-card, .promotion-item",
                    timeout=15_000,
                )
            except Exception:
                pass  # pode ser página sem resultados; parse vai detectar
            await page.wait_for_timeout(800)
            blocked = "account-verification" in (page.url or "")
            return await page.content(), blocked

    def _parse_listing(self, html: str, keyword: str) -> list[OfferRaw]:
        soup = BeautifulSoup(html, "lxml")
        out: list[OfferRaw] = []
        # .poly-card cobre tanto a listagem nova quanto a página de ofertas
        items = soup.select(".poly-card, li.ui-search-layout__item, div.ui-search-result__wrapper")
        for item in items:
            link_el = item.select_one("a.ui-search-link, a.poly-component__title, h2 a, h3 a")
            if not link_el or not link_el.get("href"):
                continue
            url = link_el["href"]
            ext_id = _extract_id(url)
            if not ext_id:
                continue  # anúncio patrocinado (mclics) ou link sem produto
            title_el = item.select_one(
                "h2.ui-search-item__title, h2.poly-box, .poly-component__title, .ui-search-item__title"
            )
            title = (title_el.get_text(" ", strip=True) if title_el else "") or link_el.get_text(strip=True)
            if not title:
                continue
            # Preço atual: em .poly-price__current (card novo). Na busca antiga,
            # o 1º fraction é o atual. O "de" fica em --previous (nunca usar o
            # seletor genérico: na página de ofertas o "antes" vem antes no DOM).
            current_el = item.select_one(".poly-price__current .andes-money-amount__fraction")
            if current_el is None:
                fractions = item.select(".andes-money-amount__fraction")
                current_el = fractions[0] if fractions else None
            price = parse_brl(current_el.get_text()) if current_el else None
            prev = item.select_one(".andes-money-amount--previous .andes-money-amount__fraction")
            list_price = parse_brl(prev.get_text()) if prev else None
            # cupom aplicável ao produto (ex.: "R$ 8 off com cupom")
            card_text = item.get_text(" ", strip=True)
            coupon_m = re.search(
                r"([R$]\s?[\d.,]+\s*(?:off|% off)|\d+\s*%\s*off)\s*(?:com|con)\s*cupom",
                card_text, re.I,
            )
            coupon_text = (coupon_m.group(0).strip() if coupon_m else None)
            if not price:
                continue
            img = item.select_one("img")
            image_url = img.get("data-src") or img.get("src") if img else None
            if image_url and image_url.startswith("data:"):
                image_url = None
            out.append(
                OfferRaw(
                    marketplace=self.marketplace,
                    external_id=ext_id,
                    title=title,
                    url=url.split("?")[0],
                    price=price,
                    list_price=list_price,
                    coupon_text=coupon_text,
                    image_url=image_url,
                    category=_classify(title),
                    source={"via": "html", "kw": keyword},
                )
            )
        return out

    # ---- Ofertas gerais -----------------------------------------------------
    async def _fetch_deals(self, client: httpx.AsyncClient, url: str = _DEALS) -> list[OfferRaw]:
        html, _blocked = await self._render_page(url)
        return self._parse_listing(html, "deals")

    # ---- Entrada principal ---------------------------------------------------
    async def collect(self, keywords: list[str]) -> list[OfferRaw]:
        client = await self._get_client()
        offers: list[OfferRaw] = []

        # Primária: página de ofertas do domínio principal (funciona sem login).
        # O subdomínio lista.mercadolivre.com.br está atrás de login-wall.
        for page_num in (1, 2):
            url = _DEALS if page_num == 1 else f"{_DEALS}?page={page_num}"
            try:
                offers.extend(await self._fetch_deals(url))
            except Exception as exc:
                log.warning("Página de ofertas ML falhou (pág %d): %s", page_num, exc)

        # Secundária: busca por keyword via lista.* (pode falhar por login-wall).
        for kw in keywords:
            try:
                offers.extend(await self._search_html(client, kw))
            except Exception as exc:
                log.debug("Busca ML falhou para '%s': %s", kw, exc)

        # API pública como terciária (retorna 403 sem token, mas se um dia
        # voltar a aceitar, entra de graça).
        for kw in keywords:
            via_api = await self._search_api(client, kw)
            if via_api:
                offers.extend(via_api)

        log.info("ML: %d ofertas coletadas", len(offers))
        return offers

    # ---- Loja monitorada -----------------------------------------------------
    async def collect_store(self, store) -> list[OfferRaw]:
        """Varre a página da loja (tienda oficial, vendedor ou lista de busca
        salva). Usa o mesmo parser do feed; cai pro Chrome real se bloquear."""
        url = store.url or _SEARCH.format(query=quote_plus(store.query.lower().replace(" ", "-")))
        html, blocked = await self._render_page(url)
        offers = self._parse_listing(html, f"loja:{store.name}")
        if not offers and blocked:
            log.info("ML bloqueou a loja '%s' no headless — tentando via Chrome real (CDP).", store.name)
            html = await self._render_page_cdp(url)
            offers = self._parse_listing(html or "", f"loja:{store.name}")
        log.info("ML loja '%s': %d ofertas", store.name, len(offers))
        return offers
