"""API pública do site (vitrine). Fase 1.

- Leitura (stats/offers/product/coupons/stores/settings) aberta, sem login.
- Escrita pessoal (favorites/alerts/me) exige sessão do site
  (`session["site_user_id"]`, separada da sessão admin `session["user"]`).
- Todo URL de produto sai via `affiliatize()`; CTAs usam `/r/{id}` (302 + SiteClick).
- Config do site reaproveita AppSetting (KV) — sem tabela nova.
"""
from __future__ import annotations

import json
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import func, select

from .. import db
from ..affiliate import affiliatize
from ..config import get_settings
from ..models import (
    Analysis,
    AppSetting,
    Offer,
    PriceHistory,
    Product,
    SiteAlert,
    SiteClick,
    SiteFavorite,
    SiteUser,
    Store,
    utcnow,
)
from .routes import _aff_url, _dashboard_kpis, _filtered_stmt, MARKET_LABEL, SITE_PUBLIC_KEYS

router = APIRouter()

_PUBLIC_CACHE = {"Cache-Control": "public, max-age=60"}


# --------------------------------------------------------------------------
# sessão do site
# --------------------------------------------------------------------------
def _site_user_id(request: Request) -> int | None:
    try:
        uid = request.session.get("site_user_id")
        return int(uid) if uid else None
    except Exception:
        return None


def _require_site_user(request: Request, db_) -> SiteUser:
    uid = _site_user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="login necessário")
    user = db_.get(SiteUser, uid)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="login necessário")
    return user


def _google_enabled() -> bool:
    s = get_settings()
    return bool(getattr(s, "google_client_id", "") and getattr(s, "google_client_secret", ""))


# --------------------------------------------------------------------------
# leitura pública
# --------------------------------------------------------------------------
@router.get("/api/site/settings")
async def site_settings():
    with db.SessionLocal() as db_:
        rows = db_.execute(
            select(AppSetting.key, AppSetting.value).where(AppSetting.key.in_(SITE_PUBLIC_KEYS))
        ).all()
        out = {k: "" for k in SITE_PUBLIC_KEYS}
        for k, v in rows:
            out[k] = v or ""
        return JSONResponse(out, headers=_PUBLIC_CACHE)


@router.get("/api/site/stats")
async def site_stats():
    with db.SessionLocal() as db_:
        kpis = _dashboard_kpis(db_)
        by_market = [
            {"marketplace": k, "n": v}
            for k, v in sorted(kpis.pop("by_market").items(), key=lambda x: -x[1])
        ]
        return JSONResponse({**kpis, "by_market": by_market}, headers=_PUBLIC_CACHE)


@router.get("/api/site/offers")
async def site_offers(
    marketplace: str | None = None,
    q: str | None = None,
    category: str | None = None,
    hot_only: bool = False,
    min_score: float | None = None,
    max_price: float | None = None,
    sort: str = "hot",
    limit: int = 24,
    page: int = 1,
):
    with db.SessionLocal() as db_:
        stmt = _filtered_stmt(marketplace, q, category, min_score, max_price, hot_only, sort)
        total = db_.execute(select(func.count()).select_from(stmt.subquery())).scalar() or 0
        limit = min(max(1, limit), 96)
        rows = db_.execute(stmt.limit(limit).offset((max(1, page) - 1) * limit)).all()
        items = []
        for o, p, a in rows:
            flags = []
            if a.flags:
                try:
                    flags = json.loads(a.flags)
                except Exception:
                    flags = []
            url, is_aff = _aff_url(p.marketplace, p.url)
            items.append({
                "product": {"id": p.id, "title": p.title, "marketplace": p.marketplace,
                            "url": url, "image_url": p.image_url, "category": p.category},
                "offer": {"price": o.price, "list_price": o.list_price,
                          "updated_at": o.updated_at.isoformat(), "in_stock": o.in_stock,
                          "coupon_text": o.coupon_text},
                "affiliate": is_aff,
                "analysis": {"score": a.score, "real_discount_pct": a.real_discount_pct,
                             "vs_avg30_pct": a.vs_avg30_pct, "is_hist_min": a.is_hist_min,
                             "summary": a.summary, "flags": flags},
                "market_label": MARKET_LABEL.get(p.marketplace, p.marketplace),
            })
        return JSONResponse({
            "items": items, "total": total,
            "page": max(1, page), "pages": max(1, -(-total // limit)),
        }, headers=_PUBLIC_CACHE)


@router.get("/api/site/product/{product_id}")
async def site_product(product_id: int, period: str = "all"):
    days = {"7": 7, "30": 30, "90": 90}.get(period)
    with db.SessionLocal() as db_:
        product = db_.get(Product, product_id)
        if product is None:
            raise HTTPException(status_code=404, detail="produto não encontrado")
        offer = db_.execute(select(Offer).where(Offer.product_id == product_id)).scalar_one_or_none()
        analysis = db_.execute(
            select(Analysis).join(Offer, Analysis.offer_id == Offer.id).where(Offer.product_id == product_id)
        ).scalar_one_or_none()
        hstmt = select(PriceHistory).where(PriceHistory.product_id == product_id).order_by(PriceHistory.captured_at)
        if days:
            hstmt = hstmt.where(PriceHistory.captured_at >= utcnow() - timedelta(days=days))
        history = db_.execute(hstmt).scalars().all()
        flags = []
        if analysis and analysis.flags:
            try:
                flags = json.loads(analysis.flags)
            except Exception:
                flags = []
        prices = [h.price for h in history]
        url, is_aff = _aff_url(product.marketplace, product.url)
        return JSONResponse({
            "product": {"id": product.id, "title": product.title, "marketplace": product.marketplace,
                        "url": url, "image_url": product.image_url, "category": product.category,
                        "affiliate": is_aff},
            "offer": {"price": offer.price if offer else None,
                      "list_price": offer.list_price if offer else None,
                      "in_stock": offer.in_stock if offer else True,
                      "coupon_text": offer.coupon_text if offer else None,
                      "updated_at": offer.updated_at.isoformat() if offer else None},
            "analysis": ({"score": analysis.score, "real_discount_pct": analysis.real_discount_pct,
                          "vs_avg30_pct": analysis.vs_avg30_pct, "is_hist_min": analysis.is_hist_min,
                          "summary": analysis.summary, "flags": flags,
                          "ai_analyzed_at": analysis.ai_analyzed_at.isoformat() if analysis.ai_analyzed_at else None}
                         if analysis else None),
            "history": [{"t": h.captured_at.isoformat(), "p": h.price} for h in history],
            "stats": ({"min": min(prices), "max": max(prices),
                       "avg": round(sum(prices) / len(prices), 2), "n_points": len(prices)}
                      if prices else None),
            "watched": None,
            "market_label": MARKET_LABEL.get(product.marketplace, product.marketplace),
        }, headers=_PUBLIC_CACHE)


@router.get("/api/site/coupons")
async def site_coupons(marketplace: str | None = None):
    with db.SessionLocal() as db_:
        rows = db_.execute(
            select(Offer, Product)
            .join(Product, Offer.product_id == Product.id)
            .where(Offer.coupon_text.is_not(None))
            .order_by(Offer.updated_at.desc())
            .limit(100)
        ).all()
        if marketplace:
            rows = [r for r in rows if r[1].marketplace == marketplace]
        return JSONResponse([
            {"id": o.id, "marketplace": p.marketplace,
             "market_label": MARKET_LABEL.get(p.marketplace, p.marketplace),
             "code": "", "description": o.coupon_text,
             "url": _aff_url(p.marketplace, p.url)[0], "title": p.title[:80],
             "product_id": p.id, "image_url": p.image_url,
             "price": o.price,
             "last_seen": o.updated_at.isoformat()}
            for o, p in rows
        ], headers=_PUBLIC_CACHE)


@router.get("/api/site/stores")
async def site_stores():
    with db.SessionLocal() as db_:
        rows = db_.execute(
            select(Store).where(Store.active.is_(True)).order_by(Store.created_at.desc())
        ).scalars().all()
        return JSONResponse([
            {"id": s.id, "name": s.name, "marketplace": s.marketplace,
             "query": s.query, "url": s.url,
             "created_at": s.created_at.isoformat()}
            for s in rows
        ], headers=_PUBLIC_CACHE)


# --------------------------------------------------------------------------
# redirect afiliado com analytics
# --------------------------------------------------------------------------
@router.get("/r/{product_id}")
async def site_redirect(product_id: int, request: Request, src: str | None = None):
    with db.SessionLocal() as db_:
        product = db_.get(Product, product_id)
        if product is None:
            raise HTTPException(status_code=404, detail="produto não encontrado")
        s = get_settings()
        url, _ = affiliatize(product.marketplace, product.url, s)
        if not url:
            raise HTTPException(status_code=404, detail="oferta sem URL")
        try:
            db_.add(SiteClick(
                product_id=product.id,
                user_id=_site_user_id(request),
                source=(src or "")[:40] or None,
            ))
            db_.commit()
        except Exception:
            db_.rollback()
        return RedirectResponse(url, status_code=302)


# --------------------------------------------------------------------------
# conta do site (exige sessão; login Google chega na Fase 2)
# --------------------------------------------------------------------------
@router.get("/api/site/me")
async def site_me(request: Request):
    uid = _site_user_id(request)
    if not uid:
        return JSONResponse({"logged": False, "google_enabled": _google_enabled()})
    with db.SessionLocal() as db_:
        user = db_.get(SiteUser, uid)
        if user is None or not user.is_active:
            return JSONResponse({"logged": False, "google_enabled": _google_enabled()})
        return JSONResponse({
            "logged": True,
            "google_enabled": _google_enabled(),
            "user": {"id": user.id, "name": user.name, "email": user.email,
                     "avatar_url": user.avatar_url},
        })


@router.post("/api/site/logout")
async def site_logout(request: Request):
    request.session.pop("site_user_id", None)
    return JSONResponse({"ok": True})


@router.get("/api/site/favorites")
async def site_fav_list(request: Request):
    with db.SessionLocal() as db_:
        user = _require_site_user(request, db_)
        rows = db_.execute(
            select(SiteFavorite, Offer, Product)
            .join(Product, SiteFavorite.product_id == Product.id)
            .join(Offer, Offer.product_id == Product.id)
            .where(SiteFavorite.user_id == user.id)
            .order_by(SiteFavorite.created_at.desc())
        ).all()
        return JSONResponse([
            {"product": {"id": p.id, "title": p.title, "marketplace": p.marketplace,
                         "image_url": p.image_url,
                         "url": _aff_url(p.marketplace, p.url)[0]},
             "offer": {"price": o.price, "updated_at": o.updated_at.isoformat()},
             "market_label": MARKET_LABEL.get(p.marketplace, p.marketplace)}
            for f, o, p in rows
        ])


@router.post("/api/site/favorites")
async def site_fav_add(request: Request, body: dict):
    product_id = (body or {}).get("product_id")
    if not product_id:
        raise HTTPException(status_code=422, detail="product_id obrigatório")
    with db.SessionLocal() as db_:
        user = _require_site_user(request, db_)
        if db_.get(Product, int(product_id)) is None:
            raise HTTPException(status_code=404, detail="produto não encontrado")
        exists = db_.execute(
            select(SiteFavorite).where(
                SiteFavorite.user_id == user.id, SiteFavorite.product_id == int(product_id))
        ).scalar_one_or_none()
        if exists is None:
            db_.add(SiteFavorite(user_id=user.id, product_id=int(product_id)))
            db_.commit()
    return JSONResponse({"ok": True})


@router.delete("/api/site/favorites/{product_id}")
async def site_fav_del(product_id: int, request: Request):
    with db.SessionLocal() as db_:
        user = _require_site_user(request, db_)
        row = db_.execute(
            select(SiteFavorite).where(
                SiteFavorite.user_id == user.id, SiteFavorite.product_id == product_id)
        ).scalar_one_or_none()
        if row:
            db_.delete(row)
            db_.commit()
    return JSONResponse({"ok": True})


@router.get("/api/site/alerts")
async def site_alert_list(request: Request):
    with db.SessionLocal() as db_:
        user = _require_site_user(request, db_)
        rows = db_.execute(
            select(SiteAlert, Offer, Product)
            .join(Product, SiteAlert.product_id == Product.id)
            .join(Offer, Offer.product_id == Product.id)
            .where(SiteAlert.user_id == user.id)
            .order_by(SiteAlert.created_at.desc())
        ).all()
        return JSONResponse([
            {"product": {"id": p.id, "title": p.title, "marketplace": p.marketplace,
                         "image_url": p.image_url},
             "offer": {"price": o.price},
             "target_price": a.target_price}
            for a, o, p in rows
        ])


@router.post("/api/site/alerts")
async def site_alert_save(request: Request, body: dict):
    product_id = (body or {}).get("product_id")
    raw_target = (body or {}).get("target_price")
    if not product_id:
        raise HTTPException(status_code=422, detail="product_id obrigatório")
    try:
        target = float(str(raw_target).replace(",", ".")) if raw_target is not None else None
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="target_price inválido")
    if target is not None and not target > 0:
        raise HTTPException(status_code=422, detail="target_price deve ser maior que zero")
    with db.SessionLocal() as db_:
        user = _require_site_user(request, db_)
        if db_.get(Product, int(product_id)) is None:
            raise HTTPException(status_code=404, detail="produto não encontrado")
        row = db_.execute(
            select(SiteAlert).where(
                SiteAlert.user_id == user.id, SiteAlert.product_id == int(product_id))
        ).scalar_one_or_none()
        if row is None:
            db_.add(SiteAlert(user_id=user.id, product_id=int(product_id), target_price=target))
        else:
            row.target_price = target
        db_.commit()
    return JSONResponse({"ok": True})


@router.delete("/api/site/alerts/{product_id}")
async def site_alert_del(product_id: int, request: Request):
    with db.SessionLocal() as db_:
        user = _require_site_user(request, db_)
        row = db_.execute(
            select(SiteAlert).where(
                SiteAlert.user_id == user.id, SiteAlert.product_id == product_id)
        ).scalar_one_or_none()
        if row:
            db_.delete(row)
            db_.commit()
    return JSONResponse({"ok": True})


@router.patch("/api/site/me")
async def site_me_update(request: Request, body: dict):
    with db.SessionLocal() as db_:
        user = _require_site_user(request, db_)
        name = (body or {}).get("name")
        if name is not None:
            user.name = str(name).strip()[:160]
        db_.commit()
        return JSONResponse({"ok": True, "user": {"id": user.id, "name": user.name}})


@router.post("/api/site/me/delete")
async def site_me_delete(request: Request):
    with db.SessionLocal() as db_:
        user = _require_site_user(request, db_)
        user.is_active = False
        db_.commit()
    request.session.pop("site_user_id", None)
    return JSONResponse({"ok": True})
