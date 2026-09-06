"""Entrada do Promobot: FastAPI + scheduler + banco."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from . import db
from .config import get_settings
from .collector import collector
from .scheduler import (
    scheduler,
    setup as setup_scheduler,
    shutdown as shutdown_scheduler,
    watch_collect_requests,
    watch_wa_commands,
)
from .web.routes import router
from .web.public import router as public_router
from .auth_google import router as google_router

logging.basicConfig(
    level=get_settings().log_level,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)

# Em serverless (Vercel) o scheduler nasce desligado por padrão; o painel
# vira somente-leitura e os pedidos de coleta vão pro coletor via banco.
IS_SERVERLESS = get_settings().disable_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    db.init_db()
    collect_request_watcher: asyncio.Task[None] | None = None
    wa_command_watcher: asyncio.Task[None] | None = None
    if not settings.disable_scheduler:
        # limpa flag de coleta pendente de um processo anterior (estado órfão)
        from .models import AppControl

        with db.SessionLocal() as db_:
            row = db_.get(AppControl, "collect_request")
            if row and row.value:
                row.value = ""
                db_.commit()
        from . import whatsapp

        whatsapp.sync_api_key_from_env()
        collector.start()
        setup_scheduler()
        collect_request_watcher = asyncio.create_task(
            watch_collect_requests(), name="promobot-collect-request-watcher"
        )
        wa_command_watcher = asyncio.create_task(
            watch_wa_commands(), name="promobot-wa-command-watcher"
        )
        log = logging.getLogger("promobot.main")
        log.info("Coletor e scheduler habilitados neste processo.")
    else:
        logging.getLogger("promobot.main").info(
            "Scheduler desabilitado por PROMOBOT_DISABLE_SCHEDULER."
        )
    yield
    if not settings.disable_scheduler:
        for task in (collect_request_watcher, wa_command_watcher):
            if task:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
        await shutdown_scheduler()


app = FastAPI(title="Promobot", lifespan=lifespan)
_session_settings = get_settings()
app.add_middleware(
    SessionMiddleware,
    secret_key=_session_settings.session_secret,
    same_site="lax",
    https_only=bool(_session_settings.https_only),
    max_age=30 * 24 * 3600,  # sessão do site/admin: 30 dias fixos
)
app.include_router(router)
app.include_router(public_router)
app.include_router(google_router)


@app.get("/healthz", include_in_schema=False)
async def healthz():
    """Sinal simples para o healthcheck do container, sem autenticação."""
    settings = get_settings()
    scheduler_state = "disabled" if settings.disable_scheduler else (
        "running" if scheduler.running else "starting"
    )
    return {"status": "ok", "scheduler": scheduler_state}

BASE_DIR = Path(__file__).resolve().parent










# --------------------------------------------------------------------------
# SPA (React/Vite): build em app/web/static/spa.
# 1) /static/* serve CSS/JS reais (mount) · 2) catch-all por ÚLTIMO cobre
#    apenas as rotas HTML do SPA.
# --------------------------------------------------------------------------
SPA_DIR = BASE_DIR / "web" / "static" / "spa"

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "web" / "static")), name="static")


def _public_base(request: Request) -> str:
    site_url = (get_settings().site_url or "").rstrip("/")
    if site_url:
        return site_url
    return str(request.base_url).rstrip("/")


@app.get("/sitemap.xml", include_in_schema=False)
async def sitemap(request: Request):
    """URLs públicas para buscadores (vitrine + detalhe dos produtos)."""
    from sqlalchemy import select

    from .models import Product

    base = _public_base(request)
    urls: list[str] = [f"{base}/", f"{base}/cupons", f"{base}/lojas"]
    try:
        with db.SessionLocal() as db_:
            ids = db_.execute(
                select(Product.id).order_by(Product.last_seen_at.desc()).limit(1000)
            ).scalars().all()
        urls += [f"{base}/produto/{i}" for i in ids]
    except Exception:
        logging.getLogger("promobot.main").exception("Sitemap parcial")
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + "".join(f"<url><loc>{u}</loc></url>" for u in urls)
        + "</urlset>"
    )
    return Response(content=body, media_type="application/xml")


@app.get("/robots.txt", include_in_schema=False)
async def robots(request: Request):
    base = _public_base(request)
    return PlainTextResponse(f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n")


def _og_product_tags(product_id: int) -> dict | None:
    """Título/preço/imagem do produto para preview social (WhatsApp/redes)."""
    import html as _html

    from sqlalchemy import select

    from .models import Offer, Product

    try:
        with db.SessionLocal() as db_:
            product = db_.get(Product, product_id)
            if product is None:
                return None
            offer = db_.execute(
                select(Offer).where(Offer.product_id == product_id)
            ).scalar_one_or_none()
        title = _html.escape(product.title[:120])
        price = f"R$ {offer.price:.2f}" if offer else "oferta"
        desc = _html.escape(f"{price} — {product.title[:160]}")
        img = _html.escape(product.image_url or "")
        return {"title": f"{title} — Promobot", "desc": desc, "img": img}
    except Exception:
        return None


@app.get("/{full_path:path}", include_in_schema=False, response_class=FileResponse)
async def spa_fallback(full_path: str):
    if full_path.startswith(("api/", "static/", "r/", "auth/")):
        raise HTTPException(status_code=404, detail="not found")
    candidate = SPA_DIR / full_path
    if full_path and candidate.is_file():
        # assets com hash no nome são imutáveis
        return FileResponse(candidate, headers={"Cache-Control": "public, max-age=31536000, immutable"})
    index = SPA_DIR / "index.html"
    # Preview social: crawlers não executam JS — injeta OG no HTML do produto
    if full_path.startswith("produto/"):
        try:
            pid = int(full_path.split("/")[1])
        except (ValueError, IndexError):
            pid = 0
        if pid:
            og = _og_product_tags(pid)
            if og:
                try:
                    html = index.read_text(encoding="utf-8")
                    inject = (
                        f"<title>{og['title']}</title>"
                        f'<meta property="og:title" content="{og["title"]}" />'
                        f'<meta property="og:description" content="{og["desc"]}" />'
                        + (f'<meta property="og:image" content="{og["img"]}" />' if og["img"] else "")
                        + '<meta property="og:type" content="product" />'
                        '<meta name="description" content="'
                        + og["desc"]
                        + '" />'
                    )
                    if "<title>" in html:
                        import re as _re

                        html = _re.sub(r"<title>.*?</title>", inject, html, count=1)
                    else:
                        html = html.replace("</head>", inject + "</head>")
                    return HTMLResponse(html, headers={"Cache-Control": "no-cache"})
                except Exception:
                    logging.getLogger("promobot.main").exception("Falha ao injetar OG")
    # index.html NUNCA pode ser cacheado: troca de deploy muda os hashes referenciados
    return FileResponse(index, headers={"Cache-Control": "no-cache"})
