"""APIs JSON do painel SPA (React) + POST /buscar-agora.

A interface é o SPA em app/web/spa (build Vite). Autenticação por sessão
(cookie) via /api/login; o SPA trata 303/401 mostrando o login.
"""
from __future__ import annotations

import asyncio
import json
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import delete, func, select, text

from .. import db, pipeline
from ..collector import collector
from ..config import get_settings
from ..models import (
    Analysis,
    AppControl,
    EventLog,
    Offer,
    PriceHistory,
    Product,
    SearchProfile,
    WatchItem,
    utcnow,
)

router = APIRouter()

MARKET_LABEL = {"ml": "Mercado Livre", "amazon": "Amazon", "shopee": "Shopee"}


def require_login(request: Request):
    settings = get_settings()
    if settings.auth_enabled and request.session.get("user") != settings.auth_user:
        raise HTTPException(status_code=303, headers={"Location": "/login"})
    return True


# --------------------------------------------------------------------------
# queries compartilhadas
# --------------------------------------------------------------------------
def _filtered_stmt(marketplace: str | None, q: str | None, category: str | None,
                   min_score: float | None, max_price: float | None, hot_only: bool,
                   sort: str):
    from sqlalchemy import case

    score_expr = func.coalesce(Analysis.score, 0)
    discount_expr = func.coalesce(Analysis.real_discount_pct, 0)
    hot_rank = case((score_expr >= discount_expr * 2, score_expr), else_=discount_expr * 2)
    order = {
        "recent": Offer.updated_at.desc(),
        "score": score_expr.desc(),
        "price_asc": Offer.price.asc(),
        "price_desc": Offer.price.desc(),
        "discount": discount_expr.desc(),
        "hot": hot_rank.desc(),
    }.get(sort, Offer.updated_at.desc())

    stmt = (
        select(Offer, Product, Analysis)
        .join(Product, Offer.product_id == Product.id)
        .join(Analysis, Analysis.offer_id == Offer.id)
        .order_by(order, Offer.updated_at.desc())
    )
    if marketplace:
        stmt = stmt.where(Product.marketplace == marketplace)
    if q:
        stmt = stmt.where(Product.title.ilike(f"%{q}%"))
    if category in ("electronics", "games"):
        stmt = stmt.where(Product.category == category)
    if min_score is not None:
        stmt = stmt.where(func.coalesce(Analysis.score, 0) >= min_score)
    if max_price is not None:
        stmt = stmt.where(Offer.price <= max_price)
    if hot_only:
        s = get_settings()
        stmt = stmt.where(
            (Analysis.score >= s.instant_alert_score)
            | Analysis.is_hist_min.is_(True)
            | (Analysis.vs_avg30_pct >= 25)
        )
    return stmt


def _dashboard_kpis(db_) -> dict:
    s = get_settings()
    total = db_.execute(select(func.count(Product.id))).scalar() or 0
    hot = db_.execute(
        select(func.count(Analysis.id))
        .join(Offer, Analysis.offer_id == Offer.id)
        .where(
            (Analysis.score >= s.instant_alert_score)
            | Analysis.is_hist_min.is_(True)
            | (Analysis.vs_avg30_pct >= 25)
        )
    ).scalar() or 0
    hist_min = db_.execute(
        select(func.count(Analysis.id)).where(Analysis.is_hist_min.is_(True))
    ).scalar() or 0
    best = db_.execute(select(func.max(func.coalesce(Analysis.real_discount_pct, 0)))).scalar() or 0
    by_market = dict(
        db_.execute(
            select(Product.marketplace, func.count(Product.id)).group_by(Product.marketplace)
        ).all()
    )
    avg_score = db_.execute(select(func.avg(Analysis.score))).scalar()
    last_collect = db_.execute(
        select(EventLog).where(EventLog.scope == "pipeline", EventLog.level == "info")
        .order_by(EventLog.created_at.desc()).limit(1)
    ).scalar_one_or_none()
    return {
        "total": total,
        "hot": hot,
        "hist_min": hist_min,
        "best_discount": float(best),
        "by_market": by_market,
        "avg_score": round(float(avg_score)) if avg_score else None,
        "last_collect": (
            {"message": last_collect.message, "created_at": last_collect.created_at.isoformat()}
            if last_collect else None
        ),
        "ai_pending": db_.execute(
            select(func.count(Analysis.id)).where(Analysis.content_hash.is_(None))
        ).scalar() or 0,
    }


# --------------------------------------------------------------------------
# auth / sessão
# --------------------------------------------------------------------------
@router.get("/api/me")
async def api_me(request: Request):
    settings = get_settings()
    if not settings.auth_enabled:
        return JSONResponse({"logged": True})
    return JSONResponse({"logged": request.session.get("user") == settings.auth_user})


@router.post("/api/login")
async def api_login(request: Request, body: dict):
    settings = get_settings()
    if not settings.auth_enabled:
        return JSONResponse({"ok": True})
    if body.get("username") == settings.auth_user and body.get("password") == settings.auth_pass:
        request.session["user"] = settings.auth_user
        return JSONResponse({"ok": True})
    raise HTTPException(status_code=401, detail="credenciais inválidas")


@router.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/login", status_code=303)


# --------------------------------------------------------------------------
# dashboard / ofertas
# --------------------------------------------------------------------------
@router.get("/api/stats")
async def api_stats(_: bool = Depends(require_login)):
    with db.SessionLocal() as db_:
        kpis = _dashboard_kpis(db_)
        by_market = [
            {"marketplace": k, "n": v}
            for k, v in sorted(kpis.pop("by_market").items(), key=lambda x: -x[1])
        ]
        return JSONResponse({**kpis, "by_market": by_market})


@router.get("/api/offers")
async def api_offers(marketplace: str | None = None, q: str | None = None,
                     category: str | None = None, hot_only: bool = False,
                     min_score: float | None = None, max_price: float | None = None,
                     sort: str = "hot", limit: int = 24, page: int = 1,
                     _: bool = Depends(require_login)):
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
            items.append({
                "product": {"id": p.id, "title": p.title, "marketplace": p.marketplace,
                            "url": p.url, "image_url": p.image_url, "category": p.category},
                "offer": {"price": o.price, "list_price": o.list_price,
                          "updated_at": o.updated_at.isoformat(), "in_stock": o.in_stock},
                "analysis": {"score": a.score, "real_discount_pct": a.real_discount_pct,
                             "vs_avg30_pct": a.vs_avg30_pct, "is_hist_min": a.is_hist_min,
                             "summary": a.summary, "flags": flags},
                "market_label": MARKET_LABEL.get(p.marketplace, p.marketplace),
            })
        return JSONResponse({
            "items": items, "total": total,
            "page": max(1, page), "pages": max(1, -(-total // limit)),
        })


@router.get("/api/product/{product_id}")
async def api_product(product_id: int, period: str = "all"):
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
        watched = db_.execute(select(WatchItem).where(WatchItem.product_id == product_id)).scalar_one_or_none()
        flags = []
        if analysis and analysis.flags:
            try:
                flags = json.loads(analysis.flags)
            except Exception:
                flags = []
        prices = [h.price for h in history]
        return JSONResponse({
            "product": {"id": product.id, "title": product.title, "marketplace": product.marketplace,
                        "url": product.url, "image_url": product.image_url, "category": product.category},
            "offer": {"price": offer.price if offer else None,
                      "list_price": offer.list_price if offer else None,
                      "in_stock": offer.in_stock if offer else True,
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
            "watched": ({"target_price": watched.target_price} if watched else None),
            "market_label": MARKET_LABEL.get(product.marketplace, product.marketplace),
        })


# --------------------------------------------------------------------------
# keywords
# --------------------------------------------------------------------------
@router.get("/api/keywords")
async def api_keywords(_: bool = Depends(require_login)):
    with db.SessionLocal() as db_:
        rows = db_.execute(select(SearchProfile).order_by(SearchProfile.keyword)).scalars().all()
        return JSONResponse([
            {"id": k.id, "keyword": k.keyword, "active": k.active,
             "created_at": k.created_at.isoformat()}
            for k in rows
        ])


@router.post("/api/keywords")
async def api_add_keyword(body: dict, _: bool = Depends(require_login)):
    term = (body.get("keyword") or "").strip().lower()
    if not term:
        raise HTTPException(status_code=422, detail="keyword vazia")
    with db.SessionLocal() as db_:
        exists = db_.execute(select(SearchProfile).where(SearchProfile.keyword == term)).scalar_one_or_none()
        if not exists:
            db_.add(SearchProfile(keyword=term))
            db_.commit()
    return JSONResponse({"ok": True})


@router.post("/api/keywords/{kw_id}/toggle")
async def api_toggle_keyword(kw_id: int, _: bool = Depends(require_login)):
    with db.SessionLocal() as db_:
        kw = db_.get(SearchProfile, kw_id)
        if kw is None:
            raise HTTPException(status_code=404, detail="não encontrado")
        kw.active = not kw.active
        db_.commit()
        return JSONResponse({"ok": True, "active": kw.active})


@router.post("/api/keywords/{kw_id}/delete")
async def api_delete_keyword(kw_id: int, _: bool = Depends(require_login)):
    with db.SessionLocal() as db_:
        kw = db_.get(SearchProfile, kw_id)
        if kw:
            db_.delete(kw)
            db_.commit()
    return JSONResponse({"ok": True})


# --------------------------------------------------------------------------
# watchlist
# --------------------------------------------------------------------------
@router.get("/api/watchlist")
async def api_watchlist(_: bool = Depends(require_login)):
    with db.SessionLocal() as db_:
        rows = db_.execute(
            select(WatchItem, Offer, Product)
            .join(Offer, WatchItem.product_id == Offer.product_id)
            .join(Product, Offer.product_id == Product.id)
            .order_by(WatchItem.created_at.desc())
        ).all()
        return JSONResponse([
            {
                "watch": {"id": w.id, "target_price": w.target_price},
                "offer": {"price": o.price, "updated_at": o.updated_at.isoformat()},
                "product": {"id": p.id, "title": p.title, "marketplace": p.marketplace,
                            "image_url": p.image_url},
                "hit": w.target_price is not None and o.price <= w.target_price,
                "market_label": MARKET_LABEL.get(p.marketplace, p.marketplace),
            }
            for w, o, p in rows
        ])


@router.post("/api/watchlist")
async def api_add_watch(body: dict, _: bool = Depends(require_login)):
    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=422, detail="product_id obrigatório")
    with db.SessionLocal() as db_:
        existing = db_.execute(select(WatchItem).where(WatchItem.product_id == product_id)).scalar_one_or_none()
        if existing is None:
            db_.add(WatchItem(product_id=product_id, target_price=body.get("target_price")))
        else:
            existing.target_price = body.get("target_price")
        db_.commit()
    return JSONResponse({"ok": True})


@router.post("/api/watchlist/{watch_id}/delete")
async def api_delete_watch(watch_id: int, _: bool = Depends(require_login)):
    with db.SessionLocal() as db_:
        db_.execute(delete(WatchItem).where(WatchItem.id == watch_id))
        db_.commit()
    return JSONResponse({"ok": True})


# --------------------------------------------------------------------------
# status
# --------------------------------------------------------------------------
@router.get("/api/status")
async def api_status(_: bool = Depends(require_login)):
    settings = get_settings()
    with db.SessionLocal() as db_:
        sources = {}
        for scope, mp in (("scraper:ml", "ml"), ("scraper:amazon", "amazon"), ("scraper:shopee", "shopee")):
            ok = db_.execute(
                select(EventLog).where(EventLog.scope == scope, EventLog.level == "info")
                .order_by(EventLog.created_at.desc()).limit(1)
            ).scalar_one_or_none()
            errors_24h = db_.execute(
                select(func.count(EventLog.id)).where(
                    EventLog.scope == scope, EventLog.level == "error",
                    EventLog.created_at >= utcnow() - timedelta(hours=24),
                )
            ).scalar() or 0
            sources[mp] = {
                "last_ok": ok.created_at.isoformat() if ok else None,
                "errors_24h": errors_24h,
            }
        events = db_.execute(select(EventLog).order_by(EventLog.created_at.desc()).limit(50)).scalars().all()
        kpis = {
            "total": db_.execute(select(func.count(Product.id))).scalar() or 0,
            "watch": db_.execute(select(func.count(WatchItem.id))).scalar() or 0,
            "ai_ok": db_.execute(select(func.count(Analysis.id)).where(Analysis.score.is_not(None))).scalar() or 0,
            "ai_enabled": settings.ai_enabled,
            "email_configured": settings.email_configured,
        }
        return JSONResponse({
            "kpis": kpis,
            "sources": sources,
            "events": [{"id": e.id, "level": e.level, "scope": e.scope,
                        "message": e.message, "created_at": e.created_at.isoformat()}
                       for e in events],
        })


# --------------------------------------------------------------------------
# coleta sob demanda (painel → coletor)
# --------------------------------------------------------------------------
def _get_control(db_, key: str) -> str | None:
    row = db_.get(AppControl, key)
    return row.value if row else None


def _set_control(db_, key: str, value: str) -> None:
    row = db_.get(AppControl, key)
    if row is None:
        db_.add(AppControl(key=key, value=value))
    else:
        row.value = value
    db_.commit()


@router.post("/buscar-agora")
async def buscar_agora(request: Request, _: bool = Depends(require_login)):
    """No coletor local: executa o ciclo direto. Na Vercel: grava o pedido no
    banco; o coletor na sua máquina pega em segundos (watcher)."""
    from ..main import IS_SERVERLESS

    global _cycle_running
    if IS_SERVERLESS:
        with db.SessionLocal() as db_:
            current = _get_control(db_, "collect_request") or ""
            if current == "" or current.startswith("running:"):
                _set_control(db_, "collect_request", f"requested:{utcnow().isoformat()}")
        return JSONResponse({"ok": True})

    collector.submit(pipeline.run_cycle)
    return JSONResponse({"ok": True})


@router.get("/api/cycle-status")
async def cycle_status(_: bool = Depends(require_login)):
    from ..main import IS_SERVERLESS

    if IS_SERVERLESS:
        with db.SessionLocal() as db_:
            raw = _get_control(db_, "collect_request") or ""
        state = "idle" if raw == "" else raw.split(":")[0]
        return JSONResponse({"running": state in ("requested", "running"), "state": state})
    return JSONResponse({"running": collector.running, "state": "running" if collector.running else "idle"})


@router.get("/healthz")
async def healthz():
    """Health-check público (pingador de uptime não tem sessão)."""
    from ..main import IS_SERVERLESS

    return JSONResponse({
        "ok": True,
        "serverless": IS_SERVERLESS,
        "collector_running": collector.running,
        "ts": utcnow().isoformat(),
    })


# --------------------------------------------------------------------------
# insights (página de analytics) + sparklines
# --------------------------------------------------------------------------
@router.get("/api/insights")
async def api_insights(_: bool = Depends(require_login)):
    import re

    with db.SessionLocal() as db_:
        by_market = [
            {"label": MARKET_LABEL.get(k, k), "value": v}
            for k, v in db_.execute(
                select(Product.marketplace, func.count()).group_by(Product.marketplace)
            ).all()
        ]
        by_category = [
            {"label": ({"games": "Jogos", "electronics": "Eletrônicos"}.get(k) or "Outros"), "value": v}
            for k, v in db_.execute(
                select(Product.category, func.count()).group_by(Product.category)
            ).all()
        ]
        avg_price_cat = [
            {"label": ({"games": "Jogos", "electronics": "Eletrônicos"}.get(k) or "Outros"),
             "avg": round(float(a or 0), 2)}
            for k, a in db_.execute(
                select(Product.category, func.avg(Offer.price))
                .join(Offer, Offer.product_id == Product.id)
                .group_by(Product.category)
            ).all()
        ]
        novos_7d = [
            {"d": str(d), "n": n}
            for d, n in db_.execute(text(
                "SELECT date(first_seen_at) AS d, count(*) FROM products "
                "WHERE first_seen_at >= now() - interval '7 days' GROUP BY 1 ORDER BY 1"
            )).all()
        ]
        score_hist = [
            {"bucket": int(b), "n": n}
            for b, n in db_.execute(text(
                "SELECT floor(score/10)*10 AS b, count(*) FROM offers_analysis "
                "WHERE score IS NOT NULL GROUP BY 1 ORDER BY 1"
            )).all()
        ]

        stmt = _filtered_stmt(None, None, None, None, None, False, "discount").limit(10)
        top_discounts = []
        for o, p, a in db_.execute(stmt).all():
            top_discounts.append({
                "product": {"id": p.id, "title": p.title[:80], "marketplace": p.marketplace},
                "price": o.price, "list_price": o.list_price,
                "real_discount_pct": a.real_discount_pct,
                "market_label": MARKET_LABEL.get(p.marketplace, p.marketplace),
            })

        drops_rows = db_.execute(text(
            """
            WITH recent AS (
                SELECT product_id, price,
                       row_number() OVER (PARTITION BY product_id ORDER BY captured_at DESC) AS rn,
                       max(price) OVER (PARTITION BY product_id) AS max_recent
                FROM price_history
                WHERE captured_at >= now() - interval '48 hours'
            )
            SELECT r.product_id, p.title, p.marketplace, r.price, r.max_recent
            FROM recent r
            JOIN products p ON p.id = r.product_id
            WHERE r.rn = 1 AND r.max_recent > r.price * 1.05
            ORDER BY (r.max_recent - r.price) / r.max_recent DESC
            LIMIT 10
            """
        )).all()
        drops = [
            {"id": pid, "title": title[:80], "marketplace": mp,
             "price": price, "was": was,
             "drop_pct": round((1 - price / was) * 100, 1),
             "market_label": MARKET_LABEL.get(mp, mp)}
            for pid, title, mp, price, was in drops_rows
        ]

        cycles = []
        evs = db_.execute(
            select(EventLog).where(EventLog.scope == "pipeline")
            .order_by(EventLog.created_at.desc()).limit(24)
        ).scalars().all()
        for e in reversed(evs):
            m = re.search(r"'collected': (\d+), 'new': (\d+)", e.message)
            if m:
                cycles.append({"ts": e.created_at.isoformat(),
                               "collected": int(m.group(1)), "new": int(m.group(2))})

        return JSONResponse({
            "by_market": by_market, "by_category": by_category,
            "avg_price_cat": avg_price_cat, "novos_7d": novos_7d,
            "score_hist": score_hist, "top_discounts": top_discounts,
            "drops_48h": drops, "cycles": cycles,
        })


@router.get("/api/sparklines")
async def api_sparklines(ids: str, _: bool = Depends(require_login)):
    """Últimos pontos de preço para mini-gráficos dos cards. ids=1,2,3..."""
    id_list = [int(i) for i in ids.split(",") if i.strip().isdigit()][:48]
    if not id_list:
        return JSONResponse({})
    with db.SessionLocal() as db_:
        rows = db_.execute(
            select(PriceHistory.product_id, PriceHistory.price, PriceHistory.captured_at)
            .where(PriceHistory.product_id.in_(id_list))
            .order_by(PriceHistory.product_id, PriceHistory.captured_at)
        ).all()
    out: dict[str, list[float]] = {}
    for pid, price, _ts in rows:
        out.setdefault(str(pid), []).append(price)
    return JSONResponse({k: v[-24:] for k, v in out.items()})
