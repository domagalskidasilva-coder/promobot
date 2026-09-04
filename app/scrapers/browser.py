"""Gerenciador do navegador Playwright (Amazon e Shopee).

Um contexto persistente por marketplace (cookies isolados sobrevivem a
reinícios), fingerprint realista pt-BR e patch básico de webdriver.
Cada contexto persistente mantém seu próprio processo de navegador.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from ..config import get_settings

log = logging.getLogger("promobot.browser")

_STEALTH_JS = """
Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
Object.defineProperty(navigator, 'languages', {get: () => ['pt-BR', 'pt', 'en']});
Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
window.chrome = window.chrome || { runtime: {} };
"""

_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


class BrowserManager:
    def __init__(self) -> None:
        self._pw = None
        self._contexts: dict[str, object] = {}
        self._lock = asyncio.Lock()

    async def _get_context(self, marketplace: str):
        if self._pw is None:
            from playwright.async_api import async_playwright

            self._pw = await async_playwright().start()
        if marketplace in self._contexts:
            return self._contexts[marketplace]
        profile_dir = Path("data") / f"profile_{marketplace}"
        profile_dir.mkdir(parents=True, exist_ok=True)
        ctx = await self._pw.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=True,
            locale="pt-BR",
            timezone_id="America/Sao_Paulo",
            user_agent=_UA,
            viewport={"width": 1366, "height": 768},
            args=["--disable-blink-features=AutomationControlled", "--no-first-run"],
        )
        await ctx.add_init_script(_STEALTH_JS)
        self._contexts[marketplace] = ctx
        return ctx

    @asynccontextmanager
    async def page_for(self, marketplace: str):
        """Página no contexto persistente do marketplace (1 por vez)."""
        async with self._lock:
            context = await self._get_context(marketplace)
        page = await context.new_page()
        try:
            yield page
        finally:
            try:
                await page.close()
            except Exception:
                pass

    async def close_all(self) -> None:
        for ctx in self._contexts.values():
            try:
                await ctx.close()
            except Exception:
                pass
        self._contexts.clear()
        if self._pw:
            try:
                await self._pw.stop()
            except Exception:
                pass
            self._pw = None


manager = BrowserManager()
