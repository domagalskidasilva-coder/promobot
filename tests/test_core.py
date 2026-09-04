"""Testes com HTML congelado — não dependem dos sites rodando."""
from __future__ import annotations

import pytest

from app.pipeline import compute_rules, offer_content_hash, upsert_offers
from app.scrapers.base import OfferRaw
from app.scrapers.mercadolivre import _classify, _extract_id, parse_brl


# ---------- helpers de moeda / id ----------
def test_parse_brl_variants():
    assert parse_brl("R$ 3.499,90") == 3499.90
    assert parse_brl("1.299") == 1299.0
    assert parse_brl("89,90") == 89.90
    assert parse_brl("") is None
    assert parse_brl("abc") is None


def test_extract_mlb_id():
    assert _extract_id("https://produto.mercadolivre.com.br/MLB-1234567890-foo-bar") == "MLB1234567890"
    assert _extract_id("https://mercadolivre.com/sec/abc") is None


def test_classify():
    assert _classify("Console PlayStation 5 Slim") == "games"
    assert _classify("Notebook Gamer RTX 4060") == "electronics"
    assert _classify("Cadeira de escritório") is None


# ---------- regras anti-farsa ----------
def test_compute_rules_no_history():
    r = compute_rules(price=100.0, list_price=150.0, history=[])
    assert r["real_discount_pct"] == pytest.approx(33.3, abs=0.1)
    assert r["is_hist_min"] is False
    assert r["vs_avg30_pct"] is None


def test_compute_rules_hist_min():
    r = compute_rules(price=90.0, list_price=None, history=[100, 110, 120])
    assert r["is_hist_min"] is True
    assert r["vs_avg30_pct"] == pytest.approx(18.2, abs=0.2)


def test_compute_rules_no_fake_discount():
    # "de 500 por 400", mas histórico mostra 350 -> vs média fica negativo
    r = compute_rules(price=400.0, list_price=500.0, history=[350, 350, 360])
    assert r["vs_avg30_pct"] < 0
    assert r["real_discount_pct"] == pytest.approx(20.0, abs=0.1)


def test_offer_content_hash_stable():
    a = offer_content_hash("ml", "MLB1", 99.9, "Produto X")
    b = offer_content_hash("ml", "MLB1", 99.9, "produto x")
    assert a == b  # case-insensitive
    c = offer_content_hash("ml", "MLB1", 89.9, "Produto X")
    assert a != c  # preço muda -> hash muda


# ---------- pipeline: dedupe e histórico ----------
def _raw(marketplace="ml", ext="MLB1", price=100.0, title="Produto Teste"):
    return OfferRaw(
        marketplace=marketplace, external_id=ext, title=title, url="http://x", price=price
    )


def test_upsert_dedupe_and_history():
    from sqlalchemy import func, select

    from app import db
    from app.models import PriceHistory, Product

    db.init_db()
    with db.SessionLocal() as db_:
        n, u, p = upsert_offers(db_, [_raw(), _raw()])  # duplicado no lote
        db_.commit()
        assert (n, u, p) == (1, 0, 1)
        assert db_.execute(select(func.count(Product.id))).scalar() == 1

        n, u, p = upsert_offers(db_, [_raw(price=80.0)])
        db_.commit()
        assert (n, u, p) == (0, 1, 1)  # atualizou e mudou preço
        assert db_.execute(select(func.count(PriceHistory.id))).scalar() == 2

        n, u, p = upsert_offers(db_, [_raw(price=80.0)])
        db_.commit()
        assert (n, u, p) == (0, 1, 0)  # mesmo preço -> sem novo ponto de histórico


def test_ai_json_parsing():
    from app.ai.analyst import _parse_ai_json

    assert _parse_ai_json('{"score": 85, "summary": "boa", "flags": []}')["score"] == 85
    assert _parse_ai_json('```json\n{"score": 200, "summary": "x", "flags": null}\n```')["score"] == 100
    assert _parse_ai_json("lixo") is None
    assert _parse_ai_json('{"score": "abc"}') is None
