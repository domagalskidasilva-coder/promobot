"""Coletor em thread dedicada com event loop próprio.

O pipeline de coleta faz milhares de queries síncronas ao Postgres (Neon) e
usa Playwright. Rodando numa thread separada com SEU event loop, o painel
(respostas JSON) nunca trava durante os ciclos. O Playwright do coletor vive
e morre nessa thread — sem conflito de loops.
"""
from __future__ import annotations

import asyncio
import logging
import threading

log = logging.getLogger("promobot.collector")


class Collector:
    def __init__(self) -> None:
        self.loop: asyncio.AbstractEventLoop | None = None
        self.busy = False
        self._ready = threading.Event()

    def start(self) -> None:
        t = threading.Thread(target=self._run, daemon=True, name="promobot-collector")
        t.start()
        self._ready.wait(timeout=15)

    def _run(self) -> None:
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self._ready.set()
        log.info("Coletor em thread dedicada iniciado.")
        self.loop.run_forever()

    def submit(self, fn) -> bool:
        """Agenda `fn` (corrotina, ex.: pipeline.run_cycle) no loop do coletor.

        Retorna False se já houver um ciclo em andamento.
        """
        if self.loop is None or self.busy:
            return False
        self.busy = True

        async def _job():
            try:
                await fn()
            except Exception:
                log.exception("Ciclo do coletor falhou")
            finally:
                self.busy = False

        asyncio.run_coroutine_threadsafe(_job(), self.loop)
        return True

    @property
    def running(self) -> bool:
        return self.busy


collector = Collector()
