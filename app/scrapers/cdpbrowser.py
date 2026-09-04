"""Integração com o "ClockBrowser": o Google Chrome REAL do usuário via CDP.

Quando o Mercado Livre bloqueia a busca (login-wall anti-bot), conectamos ao
Chrome já aberto do usuário (que tem o login salvo e fingerprint humano) pela
porta de debug e fazemos a busca por lá.

Requisitos (uma vez, no PC do coletor):
  google-chrome --remote-debugging-port=9333 \
    --user-data-dir="$HOME/.config/promobot-chrome"

Se o Chrome estiver fechado, o Promobot o relança automaticamente.

Configuração (.env):
  PROMOBOT_CDP_URL=http://127.0.0.1:9333   (vazio = recurso desligado)
"""
from __future__ import annotations

import asyncio
import logging
import shutil
import subprocess
from contextlib import asynccontextmanager
from pathlib import Path

import httpx

from ..config import get_settings

log = logging.getLogger("promobot.cdpbrowser")


def cdp_enabled() -> bool:
    return bool(get_settings().cdp_url)


def _alive(url: str) -> bool:
    try:
        r = httpx.get(f"{url}/json/version", timeout=2.0)
        return r.status_code == 200
    except Exception:
        return False


def launch_chrome() -> bool:
    """Relança o Chrome real com a porta de debug (só em desktop com display)."""
    import os

    if not os.environ.get("DISPLAY") and not shutil.which("xvfb-run"):
        return False
    chrome = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
    if not chrome:
        return False
    profile = str(Path.home() / ".config" / "promobot-chrome")
    Path(profile).mkdir(parents=True, exist_ok=True)
    cmd = [
        chrome,
        "--remote-debugging-port=9333",
        f"--user-data-dir={profile}",
        "--no-first-run",
        "--no-default-browser-check",
        "--restore-last-session",
        "--no-sandbox",              # necessário dentro de container (root)
        "--disable-dev-shm-usage",   # /dev/shm pequeno em container
        "--disable-gpu",
        "about:blank",
    ]
    if shutil.which("xvfb-run") and not os.environ.get("DISPLAY"):
        cmd = ["xvfb-run", "--server-args=-screen 0 1280x800x24"] + cmd
    try:
        subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        log.info("Chrome real (ClockBrowser) relançado com CDP na porta 9333.")
        return True
    except Exception:
        log.warning("Falha ao relançar o Chrome real.", exc_info=True)
        return False


class CDPBrowser:
    """Cliente CDP leve sobre Playwright: conecta ao Chrome do usuário."""

    def __init__(self) -> None:
        self._pw = None
        self._browser = None
        self._lock = asyncio.Lock()

    async def _connect(self):
        if self._browser and self._browser.is_connected():
            return self._browser
        if self._pw is None:
            from playwright.async_api import async_playwright

            self._pw = await async_playwright().start()
        url = get_settings().cdp_url
        try:
            self._browser = await self._pw.chromium.connect_over_cdp(url, timeout=10_000)
        except Exception:
            # Chrome fechado/crashou? relança e tenta de novo uma vez
            log.info("ClockBrowser não respondeu — tentando relançar o Chrome real.")
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, launch_chrome)
            for _ in range(10):  # espera até 15s o Chrome subir
                await asyncio.sleep(1.5)
                if _alive(url):
                    break
            else:
                self._browser = None
                raise ConnectionError(f"ClockBrowser não subiu em {url}")
            try:
                self._browser = await self._pw.chromium.connect_over_cdp(url, timeout=15_000)
            except Exception as exc:
                self._browser = None
                raise ConnectionError(f"ClockBrowser indisponível em {url}: {exc}") from exc
        return self._browser

    @asynccontextmanager
    async def page_for(self, marketplace: str):
        """Página no contexto (perfil) existente do Chrome real.

        Usa o contexto padrão — com os cookies/logins do usuário. Fecha apenas
        a página ao final; o navegador do usuário permanece intacto.
        """
        async with self._lock:
            browser = await self._connect()
            contexts = browser.contexts
            if not contexts:
                raise ConnectionError("ClockBrowser sem contextos abertos")
            context = contexts[0]
        page = await context.new_page()
        try:
            yield page
        finally:
            try:
                await page.close()
            except Exception:
                pass

manager = CDPBrowser()
