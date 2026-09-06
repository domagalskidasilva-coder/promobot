"""Fase 1: vitrine pública sem login + /r com clique + guards de sessão."""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import func, select


def _uid(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _seed_offer(tag: str = "site"):
    """Produto+oferta+análise que passa no filtro da vitrine (desconto>=5)."""
    from app import db
    from app.models import Analysis, Offer, Product

    ext = _uid(f"MLB-{tag}")
    with db.SessionLocal() as db_:
        p = Product(
            marketplace="ml",
            external_id=ext,
            title=f"Produto vitrine {ext}",
            url=f"https://produto.mercadolivre.com.br/{ext}-teste",
            image_url=None,
            category="electronics",
        )
        db_.add(p)
        db_.flush()
        o = Offer(
            product_id=p.id, price=80.0, list_price=100.0,
            in_stock=True, coupon_text="R$ 8 OFF com cupom",
        )
        db_.add(o)
        db_.flush()
        db_.add(Analysis(
            offer_id=o.id, real_discount_pct=20.0, is_hist_min=False,
            vs_avg30_pct=5.0, score=75, summary="bom", flags="[]",
        ))
        db_.commit()
        return p.id


def _client() -> TestClient:
    from app.main import app

    return TestClient(app, raise_server_exceptions=False)


def test_site_offers_public_without_login():
    pid = _seed_offer("offers")
    with _client() as c:
        r = c.get("/api/site/offers?limit=24")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] >= 1
        ids = [i["product"]["id"] for i in data["items"]]
        assert pid in ids
        item = next(i for i in data["items"] if i["product"]["id"] == pid)
        assert item["product"]["url"].startswith("http")
        assert "affiliate" in item
        assert item["analysis"]["score"] == 75


def test_site_product_public_without_login():
    pid = _seed_offer("product")
    with _client() as c:
        r = c.get(f"/api/site/product/{pid}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["product"]["id"] == pid
        assert data["offer"]["price"] == 80.0
        assert data["stats"] is None or data["stats"]["n_points"] >= 0


def test_site_stats_coupons_stores_settings_public():
    from app import db
    from app.models import Store

    _seed_offer("misc")
    with db.SessionLocal() as db_:
        db_.add(Store(name=_uid("Loja Ativa"), marketplace="ml",
                      query="samsung", url=None, active=True))
        db_.add(Store(name=_uid("Loja Off"), marketplace="ml",
                      query="x", url=None, active=False))
        db_.commit()
    with _client() as c:
        assert c.get("/api/site/stats").status_code == 200
        rc = c.get("/api/site/coupons")
        assert rc.status_code == 200 and len(rc.json()) >= 1
        rs = c.get("/api/site/stores")
        assert rs.status_code == 200
        names = [s["name"] for s in rs.json()]
        assert any("Loja Ativa" in n for n in names)
        assert not any("Loja Off" in n for n in names)
        rk = c.get("/api/site/settings")
        assert rk.status_code == 200
        for k in ("site_title", "site_tagline", "hero_text",
                  "whatsapp_url", "affiliate_disclosure", "cookie_text"):
            assert k in rk.json()


def test_r_redirects_and_logs_click():
    from app import db
    from app.models import SiteClick

    pid = _seed_offer("redirect")
    with _client() as c:
        r = c.get(f"/r/{pid}?src=home", follow_redirects=False)
        assert r.status_code in (302, 307), r.text
        assert "mercadolivre" in r.headers["location"]
    with db.SessionLocal() as db_:
        n = db_.execute(
            select(func.count(SiteClick.id)).where(SiteClick.product_id == pid)
        ).scalar()
        assert n >= 1
    with _client() as c:
        assert c.get("/r/999999999", follow_redirects=False).status_code == 404


def test_site_personal_requires_login():
    with _client() as c:
        assert c.get("/api/site/me").json()["logged"] is False
        assert c.get("/api/site/favorites").status_code == 401
        assert c.post("/api/site/favorites", json={"product_id": 1}).status_code == 401
        assert c.get("/api/site/alerts").status_code == 401
        assert c.post("/api/site/alerts",
                      json={"product_id": 1, "target_price": 10}).status_code == 401
        assert c.patch("/api/site/me", json={"name": "X"}).status_code == 401


def test_admin_product_requires_login_when_auth_enabled():
    from app.config import get_settings

    pid = _seed_offer("guard")
    s = get_settings()
    old_user, old_pass = s.auth_user, s.auth_pass
    s.auth_user, s.auth_pass = "admin", "secret"
    try:
        with _client() as c:
            r = c.get(f"/api/product/{pid}", follow_redirects=False)
            assert r.status_code == 303, r.text
            # vitrine continua pública mesmo com admin trancado
            assert c.get(f"/api/site/product/{pid}").status_code == 200
    finally:
        s.auth_user, s.auth_pass = old_user, old_pass
