"""Transforma links canônicos em links de afiliado.

Os IDs dos programas ficam na tabela app_settings (editáveis pelo painel),
com fallback para variáveis de ambiente e cache de 30s. O banco nunca guarda
o link de afiliado — a transformação acontece na entrega (API).
"""
from __future__ import annotations

import time
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

AFFILIATE_KEYS = ("affiliate_amazon_tag", "affiliate_ml_matt_word",
                  "affiliate_ml_matt_tool", "affiliate_shopee_template")

_cache: dict = {"ts": 0.0, "ids": {}}
_TTL = 30.0


def affiliate_ids(get_session_factory) -> dict:
    """Lê os IDs do banco (app_settings) com cache de 30s."""
    now = time.time()
    if now - _cache["ts"] < _TTL:
        return _cache["ids"]
    from sqlalchemy import select

    ids: dict[str, str] = {}
    try:
        from .models import AppSetting

        with get_session_factory() as db:
            rows = db.execute(
                select(AppSetting.key, AppSetting.value)
                .where(AppSetting.key.in_(AFFILIATE_KEYS))
            ).all()
            ids = {k: (v or "") for k, v in rows}
    except Exception:
        ids = {}
    _cache["ts"] = now
    _cache["ids"] = ids
    return ids


def invalidate_cache() -> None:
    _cache["ts"] = 0.0


def _add_param(url: str, key: str, value: str) -> str:
    parts = urlparse(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query[key] = value
    return urlunparse(parts._replace(query=urlencode(query)))


def affiliatize(marketplace: str, url: str | None, settings=None) -> tuple[str | None, bool]:
    """Retorna (url_final, é_afiliado). Nunca lança.

    `settings` é aceito por compatibilidade; os IDs vêm do banco.
    """
    if not url:
        return url, False
    try:
        from .config import get_settings

        s = get_settings()
        env_ids = {
            "affiliate_amazon_tag": s.affiliate_amazon_tag,
            "affiliate_ml_matt_word": s.affiliate_ml_matt_word,
            "affiliate_ml_matt_tool": s.affiliate_ml_matt_tool,
            "affiliate_shopee_template": s.affiliate_shopee_template,
        }
        from . import db as db_mod

        db_ids = affiliate_ids(db_mod.SessionLocal)
        ids = {k: db_ids.get(k) or env_ids.get(k, "") for k in AFFILIATE_KEYS}

        if marketplace == "amazon" and ids["affiliate_amazon_tag"]:
            return _add_param(url, "tag", ids["affiliate_amazon_tag"]), True
        if marketplace == "ml" and ids["affiliate_ml_matt_word"]:
            out = _add_param(url, "matt_word", ids["affiliate_ml_matt_word"])
            if ids["affiliate_ml_matt_tool"]:
                out = _add_param(out, "matt_tool", ids["affiliate_ml_matt_tool"])
            return out, True
        if marketplace == "shopee" and ids["affiliate_shopee_template"]:
            return ids["affiliate_shopee_template"].format(url=url), True
    except Exception:
        pass
    return url, False
