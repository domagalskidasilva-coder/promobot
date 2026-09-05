"""Postador automático de ofertas no WhatsApp via Evolution API.

A configuração vive em app_settings (compartilhado entre VPS e Vercel):
    wa_enabled        "true"/"false"
    wa_evolution_url  ex.: http://evolution-api:8080 (rede interna do Docker)
    wa_evolution_key  AUTHENTICATION_API_KEY do container Evolution
    wa_instance       nome da instância (padrão "promobot")
    wa_group_jid      ex.: 120363...@g.us (grupo de destino)
    wa_send_times     horários de post, ex.: "09:00,19:00" (America/Sao_Paulo)
    wa_max_per_post   quantas ofertas por post (padrão 3)

O envio só acontece onde há scheduler (VPS). O painel na Vercel não alcança a
Evolution (rede interna do Docker), então ações do painel (QR, grupos, teste)
são gravadas como comandos em app_control — o watcher local consome em até 5s
e devolve o resultado em app_control.wa_result (mesmo padrão do Buscar agora).

Anti-spam: produto não repete (app_control.wa_sent_ids, últimos 400), teto
diário de mensagens postadas (EventLog do dia) e ritmo humano entre envios.
"""
from __future__ import annotations

import json
import logging

import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from . import db
from .models import Analysis, AppControl, EventLog, Offer, Product, utcnow

log = logging.getLogger("promobot.whatsapp")

TZ_SAO_PAULO = timezone(timedelta(hours=-3))
MARKET_LABEL = {"ml": "Mercado Livre", "amazon": "Amazon"}

WA_SETTINGS_KEYS = (
    "wa_enabled",
    "wa_evolution_url",
    "wa_evolution_key",
    "wa_instance",
    "wa_group_jid",
    "wa_send_times",
    "wa_max_per_post",
)
WA_SETTINGS_DEFAULTS = {
    "wa_enabled": "false",
    "wa_evolution_url": "http://evolution-api:8080",
    "wa_evolution_key": "",
    "wa_instance": "promobot",
    "wa_group_jid": "",
    "wa_send_times": "09:00,19:00",
    "wa_max_per_post": "3",
}
DAILY_MESSAGE_CAP = 12
SENT_IDS_KEEP = 400


# --------------------------------------------------------------------------
# configuração
# --------------------------------------------------------------------------
def wa_settings() -> dict:
    from .models import AppSetting

    with db.SessionLocal() as db_:
        rows = db_.execute(
            select(AppSetting).where(AppSetting.key.in_(WA_SETTINGS_KEYS))
        ).scalars().all()
        values = {r.key: (r.value or "") for r in rows}
    out = dict(WA_SETTINGS_DEFAULTS)
    out.update({k: v for k, v in values.items() if v != ""})
    return out


def save_wa_settings(values: dict) -> None:
    from .models import AppSetting

    allowed = {k: str(values[k]).strip() for k in WA_SETTINGS_KEYS if k in values}
    with db.SessionLocal() as db_:
        for k, v in allowed.items():
            row = db_.get(AppSetting, k)
            if row is None:
                db_.add(AppSetting(key=k, value=v))
            else:
                row.value = v
        db_.commit()


# --------------------------------------------------------------------------
# cliente Evolution API (sync: roda dentro da thread do coletor)
# --------------------------------------------------------------------------
def _ev_call(s: dict, method: str, path: str, payload: dict | None = None,
             timeout: float = 8.0):
    import httpx

    url = s["wa_evolution_url"].rstrip("/") + path
    headers = {"apikey": s["wa_evolution_key"]}
    with httpx.Client(timeout=timeout) as client:
        r = client.request(method, url, json=payload, headers=headers)
    if r.status_code >= 300:
        raise RuntimeError(f"Evolution {path}: HTTP {r.status_code} — {r.text[:200]}")
    return r.json() if r.content else {}


def _instance(s: dict) -> str:
    return s["wa_instance"] or "promobot"


def connection_state(s: dict | None = None) -> str:
    """'open' | 'close' | 'connecting' | 'unreachable' | 'unknown'."""
    try:
        s = s or wa_settings()
        data = _ev_call(s, "GET", f"/instance/connectionState/{_instance(s)}", timeout=4)
    except RuntimeError as exc:
        if "404" in str(exc):
            return "close"  # instância ainda não criada = desconectado
        return "unreachable"
    except Exception:
        return "unreachable"
    if isinstance(data, dict):
        inst = data.get("instance") or {}
        st = inst.get("state") or data.get("state")
        if st:
            return str(st)
    return "unknown"


def get_qr(s: dict) -> dict:
    """QR para parear o WhatsApp do bot (chamado só a partir da VPS)."""
    try:
        return _ev_call(s, "GET", f"/instance/connect/{_instance(s)}", timeout=20)
    except RuntimeError as exc:
        # instância não existe ainda: cria e tenta de novo
        if "404" in str(exc):
            _ev_call(s, "POST", "/instance/create", {
                "instanceName": _instance(s),
                "qrcode": True,
                "integration": "WHATSAPP-BAILEYS",
            }, timeout=30)
            time.sleep(2)
            return _ev_call(s, "GET", f"/instance/connect/{_instance(s)}", timeout=20)
        raise


def fetch_groups(s: dict) -> list:
    data = _ev_call(s, "GET", f"/group/fetchAllGroups/{_instance(s)}?getParticipants=false",
                    timeout=12)
    groups = data if isinstance(data, list) else data.get("groups", [])
    return [{"id": g.get("id"), "subject": g.get("subject")} for g in groups
            if isinstance(g, dict) and g.get("id")]


def send_text(s: dict, jid: str, text: str) -> None:
    _ev_call(s, "POST", f"/message/sendText/{_instance(s)}", {
        "number": jid,
        "text": text,
        "delay": 1200,
        "linkPreview": False,
    }, timeout=20)


# --------------------------------------------------------------------------
# mensagem de divulgação (compartilhada com o botão do painel)
# --------------------------------------------------------------------------
_TRACKING_PARAMS = {
    # ML: parâmetros de sessão/campanha de busca
    "polycard_client", "be_origin", "overlay_label", "search_layout",
    "position", "type", "tracking_id", "sid", "reco_type", "c_id", "wh_qp",
    # Amazon: parâmetros de rastreamento de navegação
    "ref", "crid", "psc", "smid", "sp_csd", "csmc", "th", "pd_rd_w", "pd_rd_r",
    "pd_rd_wg", "pd_rd_i", "keywords", "qid", "sr", "s", "dchild",
    "content-id", "pf_rd_p", "pf_rd_r", "ufe", "isAmazonFulfilled",
}


def _clean_url(marketplace: str, url: str) -> str:
    """Link oficial do marketplace sem rastreadores — nada de encurtador de
    terceiros (tinyurl etc. passa impressão de golpe no comprador).

    Preserva o parâmetro de afiliado (matt_word / tag) e o domínio visível
    mercadolivre.com.br / amazon.com.br. No ML, itens longos são reduzidos ao
    id: /MLB-123-titulo-completo-_JM → /MLB-123-_JM (o site resolve pelo id).
    """
    import re
    from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

    try:
        parts = urlparse(url)
        keep = [
            (k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
            if k not in _TRACKING_PARAMS and not k.startswith("utm_")
        ]
        path = parts.path
        if marketplace == "ml" and re.search(r"mercadol?ivre", parts.netloc or ""):
            m = re.match(r"^/MLB-(\d+)", path)
            if m and "/p/" not in path:
                path = f"/MLB-{m.group(1)}-_JM"
        elif marketplace == "amazon":
            # /dp/ASIN/ref=sr_1_3 → /dp/ASIN (ref= é rastreador embutido no path)
            path = re.sub(r"/ref=[^/]*", "", path)
        return urlunparse((parts.scheme, parts.netloc, path, "", urlencode(keep), ""))
    except Exception:
        return url


def _aff_url(marketplace: str, url: str):
    from .affiliate import affiliatize
    from .config import get_settings

    return affiliatize(marketplace, url, get_settings())


def build_share_text(product_id: int) -> tuple[str, str, bool]:
    """(mensagem no modelo do canal, link de divulgação, tem afiliado)."""
    with db.SessionLocal() as db_:
        product = db_.get(Product, product_id)
        if product is None:
            raise ValueError(f"produto {product_id} não encontrado")
        offer = db_.execute(
            select(Offer).where(Offer.product_id == product_id)
        ).scalar_one_or_none()
        analysis = db_.execute(
            select(Analysis).join(Offer, Analysis.offer_id == Offer.id)
            .where(Offer.product_id == product_id)
        ).scalar_one_or_none()

    aff_url, is_aff = _aff_url(product.marketplace, product.url)
    share_url = _clean_url(product.marketplace, aff_url)

    price = offer.price if offer else None
    list_price = offer.list_price if offer else None
    lines = [f"[{MARKET_LABEL.get(product.marketplace, product.marketplace)}] {product.title}"]
    if analysis and analysis.real_discount_pct:
        lines.append(f"⚠️ {analysis.real_discount_pct:.0f}% OFF")
    if price is not None:
        lines.append(f"💰 R$ {price:.2f}".replace(".", ","))
        if list_price and list_price > price:
            inst = price / 10  # 10x sem juros aproxima o 'à vista' do marketplace
            lines.append(f"ou R$ {inst:.2f} em 10x".replace(".", ","))
    lines.append(f"👉 {share_url}")
    if offer and offer.coupon_text:
        lines.append(f"🎟️ {offer.coupon_text}")
    lines.append("🚚 Frete grátis acima de R$ 79" if product.marketplace == "ml"
                 else "🚚 Frete grátis no Amazon Prime")
    lines.append("")
    lines.append("PROMO$ DO FRANÇA 🇫🇷🤑 - GAMER 🎮")
    lines.append("https://tinyurl.com/promosdofranca")
    return "\n".join(lines), share_url, is_aff


# --------------------------------------------------------------------------
# seleção de ofertas + anti-spam
# --------------------------------------------------------------------------
def _get_control(db_, key: str) -> str:
    row = db_.get(AppControl, key)
    return (row.value or "") if row else ""


def _set_control(db_, key: str, value: str) -> None:
    row = db_.get(AppControl, key)
    if row is None:
        db_.add(AppControl(key=key, value=value, updated_at=utcnow()))
    else:
        row.value = value
        row.updated_at = utcnow()


def _sent_ids() -> set[int]:
    with db.SessionLocal() as db_:
        raw = _get_control(db_, "wa_sent_ids")
    return {int(x) for x in raw.split(",") if x.strip().isdigit()}


def _remember_sent(ids: list[int]) -> None:
    current = list(_sent_ids()) + ids
    current = current[-SENT_IDS_KEEP:]
    with db.SessionLocal() as db_:
        _set_control(db_, "wa_sent_ids", ",".join(str(i) for i in current))
        db_.commit()


def _posts_today() -> int:
    since = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    with db.SessionLocal() as db_:
        return db_.execute(
            select(func.count(EventLog.id)).where(
                EventLog.scope == "whatsapp",
                EventLog.created_at >= since,
            )
        ).scalar() or 0


def select_offers(limit: int = 3, ignore_sent: bool = True) -> list[int]:
    """Melhores oportunidades atuais (mesma régua de qualidade do feed),
    excluindo as já postadas."""
    from sqlalchemy import case

    score_expr = func.coalesce(Analysis.score, 0)
    discount_expr = func.coalesce(Analysis.real_discount_pct, 0)
    hot_rank = case((score_expr >= discount_expr * 2, score_expr),
                    else_=discount_expr * 2)
    stmt = (
        select(Offer.product_id)
        .join(Product, Offer.product_id == Product.id)
        .join(Analysis, Analysis.offer_id == Offer.id)
        .where(
            (func.coalesce(Analysis.real_discount_pct, 0) >= 5)
            | Analysis.is_hist_min.is_(True)
            | Offer.coupon_text.is_not(None)
        )
        .order_by(hot_rank.desc(), Offer.updated_at.desc())
        .limit(limit + len(_sent_ids()) if ignore_sent else limit)
    )
    with db.SessionLocal() as db_:
        ids = [pid for (pid,) in db_.execute(stmt).all()]
    if ignore_sent:
        sent = _sent_ids()
        ids = [pid for pid in ids if pid not in sent]
    return ids[:limit]


# --------------------------------------------------------------------------
# ações (painel) — executadas na VPS, direto ou via comando do watcher
# --------------------------------------------------------------------------
def handle_wa_action(action: str, s: dict | None = None) -> dict:
    s = s or wa_settings()
    try:
        if action == "state":
            return {"state": connection_state(s)}
        if action == "qr":
            data = get_qr(s)
            if isinstance(data, dict) and (data.get("base64") or data.get("code")):
                return {"qr": data.get("base64") or data.get("code")}
            return {"state": connection_state(s), "raw": data}
        if action == "groups":
            return {"groups": fetch_groups(s)}
        if action == "test":
            return send_test(s)
        return {"error": f"ação desconhecida: {action}"}
    except Exception as exc:  # devolve erro legível para o painel
        log.warning("ação WhatsApp '%s' falhou: %s", action, exc)
        return {"error": str(exc)[:300]}


def send_test(s: dict) -> dict:
    if not s["wa_group_jid"]:
        return {"error": "defina o grupo de destino antes de testar"}
    ids = select_offers(limit=1, ignore_sent=True) or select_offers(limit=1, ignore_sent=False)
    if not ids:
        return {"error": "sem ofertas qualificadas no momento"}
    text, _, _ = build_share_text(ids[0])
    text = "🧪 *Mensagem de teste do Promobot*\n\n" + text
    send_text(s, s["wa_group_jid"], text)
    db.log_event("whatsapp", "Mensagem de teste enviada pelo painel.", level="info")
    return {"ok": True, "product_id": ids[0]}


# --------------------------------------------------------------------------
# post agendado (job do scheduler, só na VPS)
# --------------------------------------------------------------------------
def _parse_slots(raw: str) -> list[tuple[int, int]]:
    slots = []
    for part in (raw or "").split(","):
        part = part.strip()
        if ":" not in part:
            continue
        try:
            h, m = part.split(":")[:2]
            slots.append((int(h), int(m)))
        except ValueError:
            continue
    return sorted(set(slots))


def post_scheduled(force: bool = False) -> dict:
    """Posta as melhores ofertas novas no grupo. Chamado pelo job do scheduler
    dentro da janela de um dos horários configurados."""
    s = wa_settings()
    if s["wa_enabled"] != "true" and not force:
        return {"skipped": "desabilitado"}
    if not s["wa_group_jid"]:
        return {"skipped": "grupo não configurado"}
    if connection_state(s) != "open":
        db.log_event("whatsapp", "Post pulado: WhatsApp não está conectado.",
                     level="warning")
        return {"skipped": "desconectado"}

    remaining = max(0, DAILY_MESSAGE_CAP - _posts_today())
    if remaining == 0:
        db.log_event("whatsapp", "Post pulado: teto diário de mensagens atingido.",
                     level="warning")
        return {"skipped": "teto diário"}

    limit = min(int(s["wa_max_per_post"] or 3), remaining)
    ids = select_offers(limit=limit, ignore_sent=True)
    if not ids:
        return {"skipped": "sem ofertas novas qualificadas"}

    sent, failed = 0, 0
    for pid in ids:
        try:
            text, _, _ = build_share_text(pid)
            send_text(s, s["wa_group_jid"], text)
            sent += 1
            time.sleep(3)  # ritmo humano entre mensagens
        except Exception:
            failed += 1
            log.exception("falha ao postar produto %s", pid)

    _remember_sent(ids)
    with db.SessionLocal() as db_:
        _set_control(db_, "wa_last_post_at", utcnow().isoformat())
        db_.commit()
    db.log_event("whatsapp", f"Post no WhatsApp: {sent} oferta(s) enviada(s)"
                             + (f", {failed} falha(s)" if failed else "") + ".")
    return {"ok": True, "sent": sent, "failed": failed, "ids": ids}


def next_due_slot(now: datetime | None = None) -> datetime | None:
    """Slot a postar agora: horário ainda não postado hoje cuja janela
    (10 min) está aberta ou que ainda vai chegar. Slot perdido é ignorado."""
    s = wa_settings()
    if s["wa_enabled"] != "true":
        return None
    now = now or datetime.now(TZ_SAO_PAULO)
    with db.SessionLocal() as db_:
        raw = _get_control(db_, "wa_last_post_at")
    try:
        last = datetime.fromisoformat(raw).astimezone(TZ_SAO_PAULO) if raw else None
    except ValueError:
        last = None
    for h, m in _parse_slots(s["wa_send_times"]):
        slot = now.replace(hour=h, minute=m, second=0, microsecond=0)
        if last and slot <= last:
            continue  # este slot já foi postado hoje
        if now < slot or now - slot <= timedelta(minutes=10):
            return slot
        # janela expirou (VPS desligada etc.) — segue para o próximo slot
    return None


def sync_api_key_from_env() -> None:
    """Na VPS, a chave da Evolution vem do env WA_API_KEY (mesma do container;
    aceita também PROMOBOT_WA_API_KEY). Espelha em app_settings para o painel
    (Vercel) conferir; nunca gera na Vercel."""
    import os

    from .config import get_settings

    env_key = (os.environ.get("WA_API_KEY")
               or getattr(get_settings(), "wa_api_key", "") or "").strip()
    if env_key:
        save_wa_settings({"wa_evolution_key": env_key})
