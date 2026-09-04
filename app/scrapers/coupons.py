"""Coletor de cupons de desconto dos marketplaces.

Varre as páginas públicas de cupons (ML, Amazon, Shopee) e extrai códigos +
descrição. O Chrome real (CDP) é usado quando a página é bloqueada no
headless — mesmo fluxo das ofertas.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

from ..config import get_settings
from .browser import manager

log = logging.getLogger("promobot.coupons")

PAGES = {
    "ml": "https://www.mercadolivre.com.br/cupons",
    "amazon": "https://www.amazon.com.br/cupons",
    "shopee": "https://shopee.com.br/m/coupons",
}

# padrões de código de cupom (letras/números com hífen, 4+ chars, sem espaços)
CODE_RE = re.compile(r"\b([A-Z0-9][A-Z0-9-]{3,24})\b")


@dataclass
class CouponRaw:
    marketplace: str
    code: str
    description: str
    url: str | None = None
    store: str | None = None


def _clean_code(text: str) -> str | None:
    """Extrai um código plausível de um texto como 'Use o cupom: MELI10'."""
    t = text.strip()
    m = re.search(r"(?:cupom|código|codigo|use|coupon)[\s:]*([A-Z0-9][A-Z0-9-]{3,24})", t, re.I)
    if m:
        return m.group(1).upper()
    m = CODE_RE.search(t)
    if m and any(c.isdigit() for c in m.group(1)):
        return m.group(1).upper()
    return None


def _parse_coupon_page(html: str, marketplace: str) -> list[CouponRaw]:
    """Parser genérico: procura blocos que contenham código + descrição."""
    soup = BeautifulSoup(html, "lxml")
    out: list[CouponRaw] = []
    seen: set[str] = set()

    # candidatos: cards/itens que contenham a palavra cupom
    candidates = soup.select(
        "div[class*='coupon'], section[class*='coupon'], li[class*='coupon'], "
        "[data-testid*='coupon'], .andes-card, article"
    )
    for el in candidates:
        text = el.get_text(" ", strip=True)
        if "cupom" not in text.lower() and "coupon" not in text.lower():
            continue
        code = _clean_code(text)
        # descrição = frase mais informativa do bloco
        lines = [l.strip() for l in text.split("\n") if len(l.strip()) > 12]
        desc = (lines[0] if lines else text)[:200]
        key = (code or "") + "|" + desc[:60]
        if key in seen:
            continue
        seen.add(key)
        out.append(CouponRaw(
            marketplace=marketplace,
            code=code or "",
            description=desc,
        ))
    return out


async def collect_marketplace(marketplace: str) -> list[CouponRaw]:
    """Varre a página de cupons de um marketplace (headless, com fallback CDP)."""
    from .mercadolivre import MercadoLivreScraper

    url = PAGES.get(marketplace)
    if not url:
        return []
    settings = get_settings()
    limiter = type("L", (), {})()
    scraper = MercadoLivreScraper() if marketplace == "ml" else None

    # usa o gerenciador headless genérico (mesmo perfil por marketplace)
    from .browser import manager as headless_manager

    html = ""
    async with headless_manager.page_for(marketplace) as page:
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
            await page.wait_for_timeout(2500)
            html = await page.content()
        except Exception as exc:
            log.warning("Página de cupons %s falhou no headless: %s", marketplace, exc)

    coupons = _parse_coupon_page(html, marketplace) if html else []

    # fallback CDP (Chrome real) quando headless não achou nada
    if not coupons and marketplace == "ml" and scraper is not None:
        try:
            html = await scraper._render_page_cdp(url)
            if html:
                coupons = _parse_coupon_page(html, marketplace)
        except Exception as exc:
            log.warning("Cupons %s via CDP falhou: %s", marketplace, exc)

    log.info("Cupons %s: %d encontrados", marketplace, len(coupons))
    return coupons
