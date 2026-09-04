"""Agendador: ciclos de coleta periódicos + digest diário.

- Coleta: a cada `crawl_interval_minutes` com jitter (para não ficar robótico).
- Digest: todo dia às `digest_hour`:05.
- max_instances=1: nunca há dois ciclos em paralelo (protege os sites e o SQLite).
"""
from __future__ import annotations

import asyncio
import logging
import random
from datetime import timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from . import db, pipeline
from .collector import collector
from .config import get_settings
from .models import utcnow
from .notify.email import send_daily_digest
from .scrapers.browser import manager

log = logging.getLogger("promobot.scheduler")

scheduler = AsyncIOScheduler(timezone="America/Sao_Paulo")


async def crawl_job() -> None:
    """Um ciclo de coleta, com atraso aleatório pequeno (jitter)."""
    await asyncio.sleep(random.uniform(0, 90))
    ok = collector.submit(pipeline.run_cycle)
    if not ok:
        log.info("Coletor ocupado — ciclo agendado ignorado.")


async def watch_collect_requests() -> None:
    """Ponte painel→coletor: observa pedidos de 'Buscar agora' feitos no site
    (Vercel) e executa o ciclo localmente (thread do coletor)."""
    from .models import AppControl

    while True:
        try:
            with db.SessionLocal() as db_:
                row = db_.get(AppControl, "collect_request")
                raw = row.value or "" if row else ""
            if raw.startswith("requested:"):
                with db.SessionLocal() as db_:
                    db_.get(AppControl, "collect_request").value = f"running:{utcnow().isoformat()}"
                    db_.commit()
                db.log_event("scheduler", "Ciclo solicitado pelo painel (Vercel) — executando.")
                collector.submit(pipeline.run_cycle)
            elif raw.startswith("running:") and not collector.running:
                # ciclo terminou (bem ou mal) — libera o flag
                with db.SessionLocal() as db_:
                    row = db_.get(AppControl, "collect_request")
                    if row:
                        row.value = ""
                        db_.commit()
        except Exception:
            log.exception("watch_collect_requests falhou")
        await asyncio.sleep(5)


async def digest_job() -> None:
    try:
        with db.SessionLocal() as db_:
            n = await send_daily_digest(db_)
        db.log_event("notify", f"Digest diário enviado ({n} ofertas).")
    except Exception:
        log.exception("Digest diário falhou")


def setup(start_now: bool = True) -> None:
    settings = get_settings()
    scheduler.add_job(
        crawl_job,
        IntervalTrigger(minutes=settings.crawl_interval_minutes, jitter=120),
        id="crawl",
        max_instances=1,
        coalesce=True,
        next_run_time=None,  # primeiro ciclo disparado manualmente pelo startup
    )
    scheduler.add_job(
        digest_job,
        CronTrigger(hour=settings.digest_hour, minute=5),
        id="digest",
        max_instances=1,
        coalesce=True,
    )
    if start_now:
        scheduler.start()
        log.info(
            "Scheduler iniciado: coleta a cada %d min, digest às %d:05",
            settings.crawl_interval_minutes,
            settings.digest_hour,
        )


async def run_first_cycle() -> None:
    """Dispara o primeiro ciclo ~10s após o boot (dá tempo do painel subir)."""
    await asyncio.sleep(10)
    await crawl_job()


async def _watch_flag_release() -> None:
    """Libera o flag 'running:' quando o coletor termina (pooling leve)."""
    while True:
        try:
            with db.SessionLocal() as db_:
                row = db_.get(AppControl, "collect_request")
                if row and row.value and row.value.startswith("running:") and not collector.running:
                    row.value = ""
                    db_.commit()
        except Exception:
            pass
        await asyncio.sleep(5)


async def shutdown() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
    await manager.close_all()
