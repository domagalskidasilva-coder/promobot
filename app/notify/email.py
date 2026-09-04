"""Notificações por e-mail: alerta instantâneo de ofertas quentes + watchlist.

Anti-spam embutido:
- mesmo produto não repete em `repeat_alert_hours` (a menos que caia 5%+ além);
- no máximo 1 e-mail instantâneo por `alert_rate_limit_minutes`;
- e-mail só sai se SMTP estiver configurado (senão, tudo fica no painel).
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import timedelta
from email.message import EmailMessage
from email.utils import formataddr

import aiosmtplib
from sqlalchemy import select

from ..config import get_settings
from ..models import Analysis, Offer, Product, WatchItem, utcnow

log = logging.getLogger("promobot.notify")

_last_instant_sent_at = None  # rate limit simples por processo

FLAG_LABELS = {
    "desconto_falso": "⚠️ Possível desconto falso",
    "titulo_enganoso": "⚠️ Título enganoso",
    "recondicionado": "⚠️ Recondicionado?",
    "fora_do_escopo": "Fora do escopo",
    "preco_irreal": "🚨 Preço irreal (possível golpe)",
    "cupom_confuso": "⚠️ Cupom com letra miúda",
}

MARKET_LABEL = {"ml": "Mercado Livre", "amazon": "Amazon"}


def _verdict_badge(score: int | None) -> str:
    if score is None:
        return "<span style='background:#888;color:#fff;padding:2px 8px;border-radius:4px'>sem IA</span>"
    color = "#16a34a" if score >= 80 else "#ca8a04" if score >= 60 else "#dc2626"
    return f"<span style='background:{color};color:#fff;padding:2px 8px;border-radius:4px'>score {score}</span>"


def _offer_html(p: Product, o: Offer, a: Analysis) -> str:
    flags: list[str] = []
    if a.flags:
        try:
            flags = [FLAG_LABELS.get(f, f) for f in json.loads(a.flags)]
        except Exception:
            flags = []
    flag_html = "<br>".join(f"<small style='color:#b45309'>{f}</small>" for f in flags)
    hist_badge = "🏅 <b>MENOR PREÇO HISTÓRICO</b><br>" if a.is_hist_min else ""
    list_price = (
        f"<span style='text-decoration:line-through;color:#999'>R$ {o.list_price:.2f}</span> "
        if o.list_price and o.list_price > o.price
        else ""
    )
    discount = (
        f"<b style='color:#16a34a'>(−{a.real_discount_pct:.0f}%)</b>" if a.real_discount_pct else ""
    )
    vs_avg = (
        f"<small>· média 30d: −{a.vs_avg30_pct:.0f}%</small>"
        if a.vs_avg30_pct and a.vs_avg30_pct > 0
        else ""
    )
    return f"""
    <div style="border:1px solid #ddd;border-radius:8px;padding:14px;margin-bottom:12px">
      <table><tr>
        <td style="padding-right:12px"><img src="{p.image_url or ''}" width="90" alt=""></td>
        <td>
          <b>{p.title[:150]}</b><br>
          <small>{MARKET_LABEL.get(p.marketplace, p.marketplace)}</small><br>
          {hist_badge}
          <span style="font-size:1.3em"><b>R$ {o.price:.2f}</b></span>
          {list_price} {discount} {vs_avg}
          <br>{_verdict_badge(a.score)}
          {f"<br><i>{a.summary}</i>" if a.summary else ""}
          {f"<br>{flag_html}" if flag_html else ""}
          <br><a href="{p.url}">Ver oferta →</a>
        </td>
      </tr></table>
    </div>"""


async def _send_email(subject: str, html: str) -> bool:
    settings = get_settings()
    if not settings.email_configured:
        log.info("SMTP não configurado — e-mail suprimido: %s", subject)
        return False
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr(("Promobot", settings.smtp_user))
    msg["To"] = settings.email_to
    msg.set_content("Seu leitor não suporta HTML.")
    msg.add_alternative(html, subtype="html")
    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_pass,
            start_tls=settings.smtp_port == 587,
        )
        return True
    except Exception:
        log.exception("Falha ao enviar e-mail: %s", subject)
        return False


def _hot_candidates(db_) -> list[tuple[Product, Offer, Analysis]]:
    """Ofertas quentes que passam no anti-spam."""
    settings = get_settings()
    cutoff = utcnow() - timedelta(hours=settings.repeat_alert_hours)
    extra_drop = settings.repeat_alert_extra_drop_pct / 100
    out = []
    rows = (
        db_.execute(
            select(Analysis, Offer, Product)
            .join(Offer, Analysis.offer_id == Offer.id)
            .join(Product, Offer.product_id == Product.id)
        )
        .all()
    )
    for a, o, p in rows:
        hot = (
            (a.score is not None and a.score >= settings.instant_alert_score)
            or a.is_hist_min
            or (a.vs_avg30_pct is not None and a.vs_avg30_pct >= 25)
        )
        if not hot:
            continue
        if a.notified_at and a.notified_at > cutoff:
            # repetir só se o preço caiu além do extra_drop
            if a.notified_price and o.price > a.notified_price * (1 - extra_drop):
                continue
        out.append((p, o, a))
    out.sort(key=lambda t: t[2].score or 0, reverse=True)
    return out


async def maybe_send_instant_alert(db_) -> int:
    """Chamado no fim do ciclo. Retorna nº de ofertas notificadas."""
    global _last_instant_sent_at
    settings = get_settings()
    entries = _hot_candidates(db_)
    if not entries:
        return 0

    now = utcnow()
    if _last_instant_sent_at and (now - _last_instant_sent_at) < timedelta(
        minutes=settings.alert_rate_limit_minutes
    ):
        log.info("Rate limit de e-mail ativo — %d ofertas esperam o próximo ciclo", len(entries))
        return 0

    n = len(entries)
    sent = await _send_email(f"🔥 Promobot: {n} oferta(s) quente(s) agora", "".join(
        _offer_html(p, o, a) for p, o, a in entries
    ))
    if sent or not settings.email_configured:
        _mark_sent(db_, entries)
    return n if sent else 0


def _mark_sent(db_, entries) -> None:
    global _last_instant_sent_at
    _last_instant_sent_at = utcnow()
    for _p, _o, a in entries:
        a.notified_at = utcnow()
        a.notified_price = _o.price
    db_.commit()


async def send_watch_alert(db_) -> int:
    """Watchlist: preço-alvo atingido (1 alerta/24h por item)."""
    settings = get_settings()
    if not settings.email_configured:
        return 0
    cutoff = utcnow() - timedelta(hours=24)
    rows = (
        db_.execute(
            select(WatchItem, Offer, Product)
            .join(Offer, WatchItem.product_id == Offer.product_id)
            .join(Product, Offer.product_id == Product.id)
        )
        .all()
    )
    hits = [
        (w, o, p)
        for w, o, p in rows
        if w.target_price is not None
        and o.price <= w.target_price
        and not (w.last_alerted_at and w.last_alerted_at > cutoff)
    ]
    if not hits:
        return 0
    body = "".join(
        f"""
        <div style="border:1px solid #ddd;border-radius:8px;padding:14px;margin-bottom:12px">
          <b>🎯 {p.title[:150]}</b><br>
          Preço atual: <b>R$ {o.price:.2f}</b> · seu alvo: R$ {w.target_price:.2f}<br>
          <a href="{p.url}">Ver oferta →</a>
        </div>"""
        for w, o, p in hits
    )
    sent = await _send_email(
        f"🎯 Promobot: {len(hits)} item(ns) da watchlist atingiram o alvo", body
    )
    if sent:
        for w, _o, _p in hits:
            w.last_alerted_at = utcnow()
        db_.commit()
    return len(hits)


def run_async(coro) -> None:  # helper para uso fora do event loop
    asyncio.run(coro)


async def send_daily_digest(db_) -> int:
    """Resumo diário: top 10 ofertas por score (ou desconto real, sem IA)."""
    rows = (
        db_.execute(
            select(Analysis, Offer, Product)
            .join(Offer, Analysis.offer_id == Offer.id)
            .join(Product, Offer.product_id == Product.id)
        )
        .all()
    )
    ranked = sorted(rows, key=lambda t: (t[0].score or 0, t[0].real_discount_pct or 0), reverse=True)[:10]
    if not ranked:
        return 0
    body = "".join(_offer_html(p, o, a) for a, o, p in ranked)
    sent = await _send_email(
        f"📊 Promobot — resumo do dia ({len(ranked)} melhores ofertas)", body
    )
    return len(ranked) if sent else 0
