"""Agendador: ciclos de coleta periódicos + digest diário.

- Coleta: a cada `crawl_interval_minutes` com jitter (para não ficar robótico).
- Digest: todo dia às `digest_hour`:05.
- max_instances=1: nunca há dois ciclos em paralelo (protege os sites e o SQLite).
"""
from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from . import db, pipeline
from .collector import collector
from .config import Settings, get_settings
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


def configure_jobs(target: AsyncIOScheduler, *, settings: Settings | None = None) -> None:
    """Registra os jobs no scheduler informado sem iniciá-lo.

    Separar o registro da inicialização permite validar o agendamento sem
    iniciar coleta e impede que uma reinicialização do lifespan duplique jobs.
    """
    settings = settings or get_settings()

    # ``next_run_time=None`` pausa permanentemente um job do APScheduler. O
    # projeto pretendia iniciar o primeiro ciclo após o boot, mas a coroutine
    # que fazia isso não era criada pelo lifespan. Um horário real mantém esse
    # primeiro ciclo e deixa o IntervalTrigger calcular todos os seguintes.
    first_crawl_at = datetime.now(target.timezone) + timedelta(seconds=10)
    target.add_job(
        crawl_job,
        IntervalTrigger(minutes=settings.crawl_interval_minutes, jitter=120),
        id="crawl",
        max_instances=1,
        coalesce=True,
        next_run_time=first_crawl_at,
        replace_existing=True,
    )
    target.add_job(
        digest_job,
        CronTrigger(hour=settings.digest_hour, minute=5),
        id="digest",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )


def setup(start_now: bool = True) -> None:
    if scheduler.running:
        log.warning("Scheduler já está em execução; setup duplicado ignorado.")
        return

    settings = get_settings()
    configure_jobs(scheduler, settings=settings)
    if start_now:
        scheduler.start()
        log.info(
            "Scheduler iniciado: primeira coleta em ~10 s, depois a cada %d min; digest às %d:05",
            settings.crawl_interval_minutes,
            settings.digest_hour,
        )


async def shutdown() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
    await manager.close_all()
