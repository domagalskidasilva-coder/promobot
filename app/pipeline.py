"""Pipeline: coleta → normaliza → dedupe → histórico → regras → IA → notifica.

Fluxo por ciclo:
1. Cada scraper ativo coleta as ofertas (RateLimiter + circuit breaker por site).
2. Upsert de Product por (marketplace, external_id); Offer 1:1 com Product.
3. Se o preço mudou, grava ponto em PriceHistory.
4. Regras determinísticas (desconto real, menor histórico, vs média 30d).
5. IA (Gemini) só para ofertas novas/mudadas, com cache por hash e teto por ciclo.
6. Notificação: e-mail instantâneo se score >= limiar; watchlist checa preço-alvo.
"""
from __future__ import annotations

import asyncio

import hashlib
import json
import logging
from datetime import timedelta

from sqlalchemy import select

from . import db
from .config import get_settings
from .models import Analysis, EventLog, Offer, PriceHistory, Product, SearchProfile, WatchItem, utcnow
from .notify.email import maybe_send_instant_alert, send_watch_alert
from .scrapers.base import OfferRaw

log = logging.getLogger("promobot.pipeline")


# --------------------------------------------------------------------------
# Regras determinísticas (sempre rodam, custo zero)
# --------------------------------------------------------------------------
def compute_rules(price: float, list_price: float | None, history: list[float]) -> dict:
    """Calcula desconto real vs histórico. Ignora o 'de/por' do anúncio."""
    out: dict = {"real_discount_pct": None, "is_hist_min": False, "vs_avg30_pct": None}
    if list_price and list_price > price:
        out["real_discount_pct"] = round((1 - price / list_price) * 100, 1)
    if history:
        hist_min = min(history)
        avg30 = sum(history[-30:]) / min(len(history), 30)
        out["is_hist_min"] = price < hist_min
        if avg30 > 0:
            out["vs_avg30_pct"] = round((1 - price / avg30) * 100, 1)
        # Desconto real também pode vir do histórico (vs preço mais alto recente)
        hist_max_30 = max(history[-30:])
        if hist_max_30 > price and out["real_discount_pct"] is None:
            out["real_discount_pct"] = round((1 - price / hist_max_30) * 100, 1)
    return out


def offer_content_hash(marketplace: str, external_id: str, price: float, title: str) -> str:
    payload = f"{marketplace}|{external_id}|{price:.2f}|{title}".lower()
    return hashlib.sha256(payload.encode()).hexdigest()


def price_history_for(db_: object, product_id: int, days: int = 90) -> list[float]:
    since = utcnow() - timedelta(days=days)
    rows = db_.execute(
        select(PriceHistory.price)
        .where(PriceHistory.product_id == product_id, PriceHistory.captured_at >= since)
        .order_by(PriceHistory.captured_at)
    ).scalars().all()
    return list(rows)


# --------------------------------------------------------------------------
# Upserts
# --------------------------------------------------------------------------
def upsert_offers(db_, raw_offers: list[OfferRaw]) -> tuple[int, int, int]:
    """Grava produtos/ofertas. Retorna (novos, atualizados, preco_mudou)."""
    settings = get_settings()
    new = updated = price_changed = 0
    seen_in_batch: set[tuple[str, str]] = set()

    for raw in raw_offers:
        if not raw.title or raw.price <= 0:
            continue
        key = (raw.marketplace, raw.external_id)
        if key in seen_in_batch:
            continue  # mantém a primeira ocorrência (mais relevante)
        seen_in_batch.add(key)

        product = db_.execute(
            select(Product).where(Product.marketplace == raw.marketplace, Product.external_id == raw.external_id)
        ).scalar_one_or_none()

        if product is None:
            product = Product(
                marketplace=raw.marketplace,
                external_id=raw.external_id,
                title=raw.title[:2000],
                url=raw.url,
                image_url=raw.image_url,
                category=raw.category,
            )
            db_.add(product)
            db_.flush()  # obtém product.id
            offer = Offer(
                product_id=product.id,
                price=raw.price,
                list_price=raw.list_price,
                installments=raw.installments,
                coupon_text=raw.coupon_text,
                seller=raw.seller,
                condition=raw.condition,
                in_stock=raw.in_stock,
            )
            db_.add(offer)
            db_.flush()
            db_.add(Analysis(offer_id=offer.id))
            db_.add(PriceHistory(product_id=product.id, price=raw.price))
            new += 1
            price_changed += 1
            continue

        # Produto existente
        offer = db_.execute(select(Offer).where(Offer.product_id == product.id)).scalar_one_or_none()
        if offer is None:  # integridade
            offer = Offer(product_id=product.id, price=raw.price)
            db_.add(offer)
            db_.flush()
            db_.add(Analysis(offer_id=offer.id))

        product.last_seen_at = utcnow()
        if raw.title:
            product.title = raw.title[:2000]
        if raw.image_url:
            product.image_url = raw.image_url
        if raw.category and not product.category:
            product.category = raw.category

        changed = abs(offer.price - raw.price) > 0.01
        if changed:
            offer.price = raw.price
            offer.list_price = raw.list_price
            offer.in_stock = raw.in_stock
            offer.condition = raw.condition
            db_.add(PriceHistory(product_id=product.id, price=raw.price))
            price_changed += 1
        offer.updated_at = utcnow()
        updated += 1

    return new, updated, price_changed


# --------------------------------------------------------------------------
# Regras + IA + notificação sobre a Analysis
# --------------------------------------------------------------------------
def apply_rules_and_queue_ai(db_, max_ai_calls: int) -> int:
    """Recalcula regras de todas as análises; marca quais precisam de IA.

    Retorna quantas ofertas ficaram na fila de IA.
    """
    settings = get_settings()
    now = utcnow()
    analyses = db_.execute(select(Analysis)).scalars().all()
    ai_queue: list[Analysis] = []

    for an in analyses:
        offer = db_.get(Offer, an.offer_id)
        if offer is None:
            continue
        product = db_.get(Product, offer.product_id)
        history = price_history_for(db_, offer.product_id)
        rules = compute_rules(offer.price, offer.list_price, history)
        an.real_discount_pct = rules["real_discount_pct"]
        an.is_hist_min = rules["is_hist_min"]
        an.vs_avg30_pct = rules["vs_avg30_pct"]

        h = offer_content_hash(product.marketplace, product.external_id, offer.price, product.title)
        needs_ai = (
            settings.ai_enabled
            and an.content_hash != h  # oferta nova ou preço/título mudou
        )
        if needs_ai:
            an.content_hash = None  # invalida cache até a IA processar
            ai_queue.append(an)

    db_.commit()
    # Ordena por potencial de desconto real (IA analisa o mais promissor primeiro)
    ai_queue.sort(key=lambda a: (a.real_discount_pct or 0), reverse=True)
    for an in ai_queue[max_ai_calls:]:
        an.content_hash = "skipped"  # marca como "não vale chamada de IA neste ciclo"
    db_.commit()
    return min(len(ai_queue), max_ai_calls)


# --------------------------------------------------------------------------
# Ciclo completo
# --------------------------------------------------------------------------
async def run_cycle(scraper_names: list[str] | None = None) -> dict:
    """Um ciclo completo de coleta+processamento. Retorna estatísticas."""
    from .ai.analyst import analyze_pending
    from .scrapers.amazon import AmazonScraper
    from .scrapers.mercadolivre import MercadoLivreScraper
    from .scrapers.shopee import ShopeeScraper
    from .models import Store

    settings = get_settings()
    stats = {"collected": 0, "new": 0, "updated": 0, "price_changed": 0, "ai_analyzed": 0, "alerts": 0}

    scrapers: dict[str, object] = {
        "ml": MercadoLivreScraper(),
        "amazon": AmazonScraper(),
        "shopee": ShopeeScraper(),
    }
    if scraper_names:
        scrapers = {k: v for k, v in scrapers.items() if k in scraper_names}

    # lojas ativas por marketplace (monitoramento de lojas)
    with db.SessionLocal() as db_:
        store_rows = db_.execute(
            select(Store).where(Store.active.is_(True))
        ).scalars().all()
    stores_by_mp: dict[str, list] = {}
    for st_ in store_rows:
        stores_by_mp.setdefault(st_.marketplace, []).append(st_)

    for name, scraper in scrapers.items():
        breaker = _breakers.setdefault(name, _make_breaker())
        if breaker.is_open:
            db.log_event(f"scraper:{name}", "Circuit breaker aberto — site em pausa.", level="warn")
            continue
        try:
            keywords = _active_keywords()
            raw = await scraper.collect(keywords)
            # monitoramento de lojas deste marketplace
            for store in stores_by_mp.get(name, []):
                try:
                    raw.extend(await scraper.collect_store(store))
                except Exception as exc:
                    db.log_event(f"scraper:{name}", f"Loja '{store.name}' falhou: {exc}", level="warn")
            breaker.record_success()
            stats["collected"] += len(raw)
            with db.SessionLocal() as db_:
                n, u, p = upsert_offers(db_, raw)
                db_.commit()
                stats["new"] += n
                stats["updated"] += u
                stats["price_changed"] += p
            db.log_event(f"scraper:{name}", f"Coleta OK: {len(raw)} ofertas ({n} novos, {p} mudaram de preço).")
        except Exception as exc:
            breaker.record_failure()
            db.log_event(f"scraper:{name}", f"Falha na coleta: {exc}", level="error")

    # Regras + fila de IA
    with db.SessionLocal() as db_:
        queued = apply_rules_and_queue_ai(db_, settings.gemini_max_per_cycle)
        stats["ai_analyzed"] = await analyze_pending(db_, queued)

    # Notificações
    with db.SessionLocal() as db_:
        stats["alerts"] += await maybe_send_instant_alert(db_)
        stats["alerts"] += await send_watch_alert(db_)

    db.log_event("pipeline", f"Ciclo concluído: {stats}")
    return stats


_breakers: dict[str, object] = {}


def _make_breaker():
    settings = get_settings()
    from .scrapers.base import CircuitBreaker

    return CircuitBreaker(settings.breaker_fail_threshold, settings.breaker_cooldown_hours * 3600)


def _active_keywords() -> list[str]:
    with db.SessionLocal() as db_:
        kws = db_.execute(
            select(SearchProfile.keyword).where(SearchProfile.active.is_(True))
        ).scalars().all()
    return list(kws) or get_settings().keyword_list


def run_cycle_sync(scraper_names: list[str] | None = None) -> dict:
    """Versão síncrona do run_cycle — para rodar em thread separada."""
    return asyncio.run(run_cycle(scraper_names))
