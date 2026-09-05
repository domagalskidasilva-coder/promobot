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


async def coupons_job() -> None:
    """Caça de cupons nas páginas oficiais dos marketplaces (a cada 2h)."""
    from .pipeline import run_coupons_cycle

    ok = collector.submit(run_coupons_cycle)
    if not ok:
        log.info("Coletor ocupado — caça de cupons ignorada.")


async def whatsapp_job() -> None:
    """Post no grupo do WhatsApp quando chega um dos horários configurados.

    Roda a cada 5 min; next_due_slot só devolve slot com a janela (10 min)
    aberta — ou seja, dispara uma vez por horário, e horas perdidas expiram.
    Também espelha o estado da conexão para o painel (Vercel) ler.
    """
    from . import whatsapp

    s = whatsapp.wa_settings()
    try:
        st = whatsapp.connection_state(s)
        with db.SessionLocal() as db_:
            whatsapp._set_control(db_, "wa_state", st)
            db_.commit()
    except Exception:
        log.exception("wa_state update falhou")

    if whatsapp.next_due_slot() is None:
        return
    ok = collector.submit(whatsapp.post_scheduled)
    if not ok:
        log.info("Coletor ocupado — post do WhatsApp adiado.")


async def digest_job() -> None:
    try:
        with db.SessionLocal() as db_:
            n = await send_daily_digest(db_)
        db.log_event("notify", f"Digest diário enviado ({n} ofertas).")
    except Exception:
        log.exception("Digest diário falhou")


async def watch_wa_commands() -> None:
    """Ponte painel(Vercel)→VPS: executa ações da Evolution API (QR, grupos,
    teste) que só são alcançáveis na rede interna da VPS."""
    import json

    from . import whatsapp

    while True:
        try:
            with db.SessionLocal() as db_:
                cmd = whatsapp._get_control(db_, "wa_command")
            if cmd and cmd.startswith(("state:", "qr:", "groups:", "test:")):
                action = cmd.split(":", 1)[0]
                ts = cmd.split(":", 1)[1]
                with db.SessionLocal() as db_:
                    whatsapp._set_control(db_, "wa_command", "busy")
                    db_.commit()
                result = whatsapp.handle_wa_action(action)
                result["ts"] = ts
                with db.SessionLocal() as db_:
                    whatsapp._set_control(db_, "wa_result", json.dumps(result))
                    whatsapp._set_control(db_, "wa_command", "")
                    db_.commit()
        except Exception:
            log.exception("watch_wa_commands falhou")
        await asyncio.sleep(5)


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
    target.add_job(
        coupons_job,
        IntervalTrigger(hours=2, jitter=120),
        id="coupons",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )
    target.add_job(
        whatsapp_job,
        IntervalTrigger(minutes=5),
        id="whatsapp",
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
