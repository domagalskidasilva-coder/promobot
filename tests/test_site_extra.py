"""Fases 2/4/5/6 (backend): OAuth desabilitado, site-settings, alertas, SEO."""
from __future__ import annotations

import asyncio
import uuid

from fastapi.testclient import TestClient
from sqlalchemy import delete, select


def _uid(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _client() -> TestClient:
    from app.main import app

    return TestClient(app, raise_server_exceptions=False)


def _seed_offer(tag: str = "extra"):
    from app import db
    from app.models import Analysis, Offer, Product

    ext = _uid(f"MLB-{tag}")
    with db.SessionLocal() as db_:
        p = Product(marketplace="ml", external_id=ext,
                    title=f"Produto extra {ext}",
                    url=f"https://produto.mercadolivre.com.br/{ext}-x",
                    category="electronics")
        db_.add(p)
        db_.flush()
        o = Offer(product_id=p.id, price=80.0, list_price=100.0, in_stock=True)
        db_.add(o)
        db_.flush()
        db_.add(Analysis(offer_id=o.id, real_discount_pct=20.0, score=70))
        db_.commit()
        return p.id


def test_google_disabled_by_default():
    with _client() as c:
        r = c.get("/auth/google/start", follow_redirects=False)
        assert r.status_code == 503
        me = c.get("/api/site/me").json()
        assert me["logged"] is False
        assert me["google_enabled"] is False
        # callback sem state válido volta ao login do site
        r2 = c.get("/auth/google/callback?code=x&state=y", follow_redirects=False)
        assert r2.status_code in (302, 503)


def test_site_settings_admin_and_public():
    from app.config import get_settings

    s = get_settings()
    old_user, old_pass = s.auth_user, s.auth_pass
    s.auth_user, s.auth_pass = "admin", "secret"
    try:
        with _client() as c:
            assert c.get("/api/site-settings", follow_redirects=False).status_code == 303
            assert c.post("/api/site-settings", json={"site_title": "X"},
                            follow_redirects=False).status_code == 303
            login = c.post("/api/login", json={"username": "admin", "password": "secret"})
            assert login.status_code == 200
            assert c.get("/api/site-settings").status_code == 200
            title = _uid("Minha Vitrine")
            assert c.post("/api/site-settings", json={"site_title": title}).status_code == 200
            pub = c.get("/api/site/settings").json()
            assert pub["site_title"] == title
    finally:
        s.auth_user, s.auth_pass = old_user, old_pass


def test_send_site_alerts_without_smtp_is_noop():
    from app import db
    from app.models import Offer, SiteAlert, SiteUser
    from app.notify.email import send_site_alerts
    from sqlalchemy import select

    pid = _seed_offer("alert")
    with db.SessionLocal() as db_:
        o = db_.execute(select(Offer).where(Offer.product_id == pid)).scalar_one()
        u = SiteUser(name="T", email=_uid("t") + "@ex.com", provider="google",
                     provider_sub=_uid("sub"))
        db_.add(u)
        db_.flush()
        db_.add(SiteAlert(user_id=u.id, product_id=pid, target_price=o.price + 10))
        db_.commit()
        n = asyncio.run(send_site_alerts(db_))
        assert n == 0  # sem SMTP, sem envio e sem crash


def test_send_site_alerts_sends_once_per_user(monkeypatch):
    import app.notify.email as email_mod
    from app import db
    from app.models import Offer, SiteAlert, SiteUser
    from app.config import get_settings
    from sqlalchemy import select

    sent_to: list[str] = []

    async def fake_send(to, subject, html):
        sent_to.append(to)
        return True

    monkeypatch.setattr(email_mod, "_send_email_to", fake_send)
    s = get_settings()
    old = (s.smtp_host, s.smtp_user, s.smtp_pass, s.email_to)
    s.smtp_host, s.smtp_user, s.smtp_pass = "smtp.ex.com", "u", "p"
    s.email_to = "admin@ex.com"
    try:
        pid = _seed_offer("alert2")
        with db.SessionLocal() as db_:
            db_.execute(delete(SiteAlert))  # isola de outros testes
            db_.commit()
            u = SiteUser(name="T2", email=_uid("t2") + "@ex.com", provider="google",
                         provider_sub=_uid("sub2"))
            db_.add(u)
            db_.flush()
            o = db_.execute(select(Offer).where(Offer.product_id == pid)).scalar_one()
            db_.add(SiteAlert(user_id=u.id, product_id=pid, target_price=o.price + 5))
            db_.commit()
            n = asyncio.run(email_mod.send_site_alerts(db_))
            assert n == 1
            assert sent_to == [u.email]
            # segunda chamada no mesmo dia não reenvia
            n2 = asyncio.run(email_mod.send_site_alerts(db_))
            assert n2 == 0
    finally:
        s.smtp_host, s.smtp_user, s.smtp_pass, s.email_to = old


def test_sitemap_robots_og():
    pid = _seed_offer("seo")
    with _client() as c:
        sm = c.get("/sitemap.xml")
        assert sm.status_code == 200
        assert f"/produto/{pid}" in sm.text
        rb = c.get("/robots.txt")
        assert rb.status_code == 200 and "Sitemap:" in rb.text
        og = c.get(f"/produto/{pid}")
        assert og.status_code == 200
        assert "og:title" in og.text
        assert "Produto extra" in og.text
