"""Testes do agendamento sem executar um ciclo de coleta real."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import Settings
from app.scheduler import configure_jobs


@pytest.mark.asyncio
async def test_crawl_job_is_active_and_has_first_run_after_boot():
    target = AsyncIOScheduler(timezone="America/Sao_Paulo")
    settings = Settings(_env_file=None, crawl_interval_minutes=30, digest_hour=8)

    configure_jobs(target, settings=settings)
    target.start(paused=True)
    try:
        crawl = target.get_job("crawl")
        digest = target.get_job("digest")

        assert crawl is not None
        assert digest is not None
        assert crawl.next_run_time is not None
        assert crawl.max_instances == 1
        assert crawl.coalesce is True
        assert timedelta(minutes=30) == crawl.trigger.interval

        now = datetime.now(target.timezone)
        assert now + timedelta(seconds=5) <= crawl.next_run_time <= now + timedelta(seconds=15)
    finally:
        target.shutdown(wait=False)


def test_scheduler_settings_validate_interval_and_digest_hour():
    with pytest.raises(ValueError):
        Settings(_env_file=None, crawl_interval_minutes=0)
    with pytest.raises(ValueError):
        Settings(_env_file=None, digest_hour=24)
