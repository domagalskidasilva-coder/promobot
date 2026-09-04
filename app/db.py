"""Banco de dados: engine, sessão e inicialização.

Portátil entre SQLite (dev/testes) e PostgreSQL (produção — Neon/qualquer
provider). O MESMO DATABASE_URL deve ser usado pelo coletor (sua máquina) e
pelo painel na Vercel, para que o site reflita tudo que o bot coleta.
"""
from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings
from .models import Base, SearchProfile

log = logging.getLogger("promobot.db")

settings = get_settings()
IS_SQLITE = settings.database_url.startswith("sqlite")

# Driver Postgres moderno (psycopg 3) — aceita tanto "postgresql://" quanto
# "postgresql+psycopg://" na configuração.
_pg_url = settings.database_url
if _pg_url.startswith("postgresql://"):
    _pg_url = _pg_url.replace("postgresql://", "postgresql+psycopg://", 1)
elif _pg_url.startswith("postgres://"):
    _pg_url = _pg_url.replace("postgres://", "postgresql+psycopg://", 1)

if IS_SQLITE:
    db_path = settings.database_url.replace("sqlite:///", "", 1)
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False, "timeout": 30},
    )
else:
    # Postgres (Neon, Supabase, RDS...): pool pequeno + pre_ping funciona bem
    # tanto no processo local do coletor quanto em serverless (Vercel).
    engine = create_engine(
        _pg_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        connect_args={"sslmode": "require"} if "sslmode" not in _pg_url else {},
    )


if IS_SQLITE:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):  # noqa: ANN001
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")  # leituras concorrentes com escrita
        cur.execute("PRAGMA busy_timeout=30000")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db() -> None:
    from . import models  # noqa: F401  (garante o registro das tabelas)

    Base.metadata.create_all(engine)
    _seed_keywords()
    log.info("Banco inicializado (%s)", "sqlite" if IS_SQLITE else "postgres")


def _seed_keywords() -> None:
    """Só na primeira execução: cria as palavras-chave do .env."""
    with SessionLocal() as db:  # type: Session
        existing = set(db.scalars(select(SearchProfile.keyword)).all())
        to_add = [k for k in settings.keyword_list if k.lower() not in existing]
        for term in to_add:
            db.add(SearchProfile(keyword=term.lower()))
        if to_add:
            db.commit()
            log.info("Palavras-chave iniciais criadas: %s", to_add)


def log_event(scope: str, message: str, level: str = "info") -> None:
    """Grava evento no EventLog (e no log padrão)."""
    from .models import EventLog

    logger = logging.getLogger(f"promobot.{scope}")
    getattr(logger, level if level != "warn" else "warning")(message)
    try:
        with SessionLocal() as db:
            db.add(EventLog(level=level, scope=scope, message=message[:2000]))
            db.commit()
    except Exception:  # nunca derrubar o pipeline por falha de log
        logger.exception("Falha ao gravar EventLog")
