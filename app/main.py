"""Entrada do Promobot: FastAPI + scheduler + banco."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
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
)
from .web.routes import router

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
    if not settings.disable_scheduler:
        # limpa flag de coleta pendente de um processo anterior (estado órfão)
        from .models import AppControl

        with db.SessionLocal() as db_:
            row = db_.get(AppControl, "collect_request")
            if row and row.value:
                row.value = ""
                db_.commit()
        collector.start()
        setup_scheduler()
        collect_request_watcher = asyncio.create_task(
            watch_collect_requests(), name="promobot-collect-request-watcher"
        )
        log = logging.getLogger("promobot.main")
        log.info("Coletor e scheduler habilitados neste processo.")
    else:
        logging.getLogger("promobot.main").info(
            "Scheduler desabilitado por PROMOBOT_DISABLE_SCHEDULER."
        )
    yield
    if not settings.disable_scheduler:
        if collect_request_watcher:
            collect_request_watcher.cancel()
            with suppress(asyncio.CancelledError):
                await collect_request_watcher
        await shutdown_scheduler()


app = FastAPI(title="Promobot", lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=get_settings().session_secret, same_site="lax")
app.include_router(router)


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


@app.get("/{full_path:path}", include_in_schema=False, response_class=FileResponse)
async def spa_fallback(full_path: str):
    if full_path.startswith(("api/", "static/")):
        raise HTTPException(status_code=404, detail="not found")
    candidate = SPA_DIR / full_path
    if full_path and candidate.is_file():
        # assets com hash no nome são imutáveis
        return FileResponse(candidate, headers={"Cache-Control": "public, max-age=31536000, immutable"})
    # index.html NUNCA pode ser cacheado: troca de deploy muda os hashes referenciados
    return FileResponse(SPA_DIR / "index.html", headers={"Cache-Control": "no-cache"})
