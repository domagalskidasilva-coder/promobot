"""Transforma links canônicos em links de afiliado.

As configurações ficam no .env (PROMOBOT_AFFILIATE_*); vazio = recurso
desligado e o link original é entregue. O banco nunca guarda o link de
afiliado — a transformação é aplicada na entrega (API), então trocar de
programa de afiliados não exige migração nenhuma.
"""
from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse


def _add_param(url: str, key: str, value: str) -> str:
    parts = urlparse(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query[key] = value
    return urlunparse(parts._replace(query=urlencode(query)))


def affiliatize(marketplace: str, url: str | None, settings) -> tuple[str | None, bool]:
    """Retorna (url_final, é_afiliado). Nunca lança."""
    if not url:
        return url, False
    try:
        if marketplace == "amazon" and settings.affiliate_amazon_tag:
            return _add_param(url, "tag", settings.affiliate_amazon_tag), True
        if marketplace == "ml" and settings.affiliate_ml_matt_word:
            out = _add_param(url, "matt_word", settings.affiliate_ml_matt_word)
            if settings.affiliate_ml_matt_tool:
                out = _add_param(out, "matt_tool", settings.affiliate_ml_matt_tool)
            return out, True
        if marketplace == "shopee" and settings.affiliate_shopee_template:
            return settings.affiliate_shopee_template.format(url=url), True
    except Exception:
        pass
    return url, False
