"""Análise de ofertas com Gemini — score 0-100, flags anti-farsa e resumo.

A IA só roda para ofertas marcadas na fila (content_hash IS NULL) e respeita
um teto de chamadas por ciclo (free tier friendly). Resultado é cacheado na
própria Analysis; se a API falhar, regras determinísticas já deram conta.
"""
from __future__ import annotations

import asyncio
import json
import logging

from sqlalchemy import select

from ..config import get_settings
from ..models import Analysis, Offer, Product, utcnow
from ..pipeline import offer_content_hash
from .. import db

log = logging.getLogger("promobot.ai")

PROMPT = """Você é um analista cético de promoções brasileiras (Mercado Livre, Amazon, Shopee).
Analise a oferta abaixo e responda APENAS com JSON válido no formato:
{{"score": <0-100>, "summary": "<1 linha em pt-BR>", "flags": ["<flag>", ...]}}

Regras de pontuação (score):
- 90-100: promoção excepcional e confiável (histórico forte, produto certo, vendedor ok)
- 70-89: boa oferta, vale o alerta
- 40-69: neutra — preço comum ou sinais mistos
- 1-39: ruim — provável desconto falso, preço inflado antes do "desconto", ou produto errado

IMPORTANTE — ESCOPO: o Promobot é só de ELETRÔNICOS e JOGOS. Roupas, calçados,
alimentos, suplementos, vitaminas e cosméticos NÃO interessam: marque
"fora_do_escopo" e dê score baixo (máx. 10), mesmo que o desconto seja alto.

Flags possíveis (use apenas as que se aplicam):
- "desconto_falso": desconto anunciado parece ancorado em preço inflado
- "titulo_enganoso": título exagerado, marca genérica se passando por marca famosa
- "recondicionado": indícios de usado/recondicionado não claro
- "fora_do_escopo": produto não é eletrônico nem jogo
- "preco_irreal": preço bom demais para o produto (possível golpe/anúncio falso)
- "cupom_confuso": cupom com letra miúda suspeita

Considere: desconto real vs histórico de preço (mais confiável que o "de/por" do anúncio),
marca reconhecida, coerência do preço com o produto, e sinais de golpe.

DADOS DA OFERTA:
- Marketplace: {marketplace}
- Produto: {title}
- Preço atual: R$ {price:.2f}
- Preço "de" anunciado: {list_price}
- Desconto real (calculado vs histórico): {real_discount_pct}%
- vs média 30 dias: {vs_avg30_pct}%
- Menor preço histórico já visto: {is_hist_min}
- Condição: {condition}
"""


def _parse_ai_json(text: str) -> dict | None:
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        # tolera cercas de código ```json ... ```
        if "```" in text:
            block = text.split("```")[1].removeprefix("json").strip()
            try:
                data = json.loads(block)
            except json.JSONDecodeError:
                return None
        else:
            return None
    if not isinstance(data, dict) or "score" not in data:
        return None
    try:
        data["score"] = max(0, min(100, int(data["score"])))
    except (ValueError, TypeError):
        return None
    data["flags"] = [str(f) for f in (data.get("flags") or [])][:6]
    data["summary"] = str(data.get("summary") or "")[:300]
    return data


def _build_prompt(offer: Offer, product: Product, analysis: Analysis) -> str:
    return PROMPT.format(
        marketplace=product.marketplace,
        title=product.title[:300],
        price=offer.price,
        list_price=f"R$ {offer.list_price:.2f}" if offer.list_price else "não informado",
        real_discount_pct=analysis.real_discount_pct if analysis.real_discount_pct is not None else "sem histórico",
        vs_avg30_pct=analysis.vs_avg30_pct if analysis.vs_avg30_pct is not None else "sem histórico",
        is_hist_min="SIM" if analysis.is_hist_min else "não",
        condition=offer.condition,
    )


async def analyze_pending(db_, max_calls: int) -> int:
    """Processa a fila de análises pendentes (content_hash IS NULL).

    Rotação de chaves: cada chamada usa a chave corrente; se bater cota (429),
    marca a chave como esgotada e passa para a próxima na hora. Quando todas
    esgotam, para e deixa o resto para o próximo ciclo (cotas renovam por dia).
    """
    settings = get_settings()
    if not settings.ai_enabled or max_calls <= 0:
        return 0

    from google import genai  # import tardio: só carrega quando IA habilitada
    from google.genai import types

    keys = settings.gemini_api_keys
    key_idx = 0          # chave corrente
    exhausted = set()    # chaves que bateram cota hoje
    client = None

    def _make_client(i: int):
        return genai.Client(api_key=keys[i])

    client = _make_client(key_idx)

    def _all_exhausted() -> bool:
        return len(exhausted) >= len(keys)

    pending = db_.execute(
        select(Analysis).where(Analysis.content_hash.is_(None)).limit(max_calls)
    ).scalars().all()

    ok = 0
    for an in pending:
        offer = db_.get(Offer, an.offer_id)
        product = db_.get(Product, offer.product_id) if offer else None
        if offer is None or product is None:
            db_.delete(an)
            continue
        try:
            cfg = types.GenerateContentConfig(
                temperature=0.2,
                response_mime_type="application/json",
            )
            resp = await client.aio.models.generate_content(
                model=settings.gemini_model,
                contents=_build_prompt(offer, product, an),
                config=cfg,
            )
            data = _parse_ai_json(resp.text)
            if data is None:
                log.warning("IA devolveu JSON inválido para oferta %s", offer.id)
            else:
                an.score = data["score"]
                an.flags = json.dumps(data["flags"], ensure_ascii=False)
                an.summary = data["summary"]
                an.ai_analyzed_at = utcnow()
                an.content_hash = offer_content_hash(
                    product.marketplace, product.external_id, offer.price, product.title
                )
                ok += 1
        except Exception as exc:
            msg = str(exc)
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                exhausted.add(key_idx)
                nxt = next((i for i in range(len(keys)) if i not in exhausted), None)
                if nxt is None:
                    log.warning(
                        "Cota de TODAS as %d chaves do Gemini esgotada — análise pausada até o próximo ciclo.",
                        len(keys),
                    )
                    # marca a oferta como 'error' para não travar a fila
                    if an.content_hash is None:
                        an.content_hash = "error"
                    db_.commit()
                    break
                key_idx = nxt
                client = _make_client(key_idx)
                log.warning("Chave %d bateu a cota — alternando para a chave %d.", key_idx, nxt)
                # não conta esta tentativa; re-tenta esta oferta com a nova chave
                continue
            log.error("Falha na IA para oferta %s: %s", offer.id, msg[:200])
        finally:
            if an.content_hash is None:
                an.content_hash = "error"  # não re-tentar neste ciclo
        db_.commit()
        await asyncio.sleep(settings.gemini_delay_s)  # respeita rate limit do free tier

    if exhausted:
        db.log_event("ai", f"{len(exhausted)}/{len(keys)} chaves do Gemini esgotadas neste ciclo.", level="warn")
    log.info("IA: %d/%d ofertas analisadas (chave ativa: %d)", ok, len(pending), key_idx)
    return ok
