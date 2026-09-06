"""Login social (Google) do site público. Fase 2.

Fluxo OAuth 2.0 + OpenID Connect sem dependência nova (só httpx, já instalado):
  /auth/google/start    → gera `state` anti-CSRF na sessão e redireciona ao Google
  /auth/google/callback → valida `state`, troca `code` por tokens, busca o perfil
                          em `userinfo` (resposta direta do Google via TLS, sem
                          precisar verificar JWT localmente) e grava
                          `session["site_user_id"]`.

Sem conta Google configurada (envs vazias) as rotas respondem 503 e o frontend
esconde o botão (via `google_enabled` em `/api/site/me`).

Rate-limit do callback é best-effort em memória (serverless = por instância);
quem protege o fluxo de verdade é o `state`/`nonce` assinado na sessão.
"""
from __future__ import annotations

import logging
import secrets
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse

from . import db
from .config import get_settings
from .models import SiteUser, utcnow

log = logging.getLogger("promobot.auth_google")

router = APIRouter()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

# ip -> [timestamps]; best-effort, só freia abuso casual
_rate: dict[str, list[float]] = {}
_RATE_MAX = 10
_RATE_WINDOW_S = 60.0


def google_enabled() -> bool:
    s = get_settings()
    return bool(s.google_client_id and s.google_client_secret)


def _redirect_uri(request: Request) -> str:
    s = get_settings()
    base = (s.site_url.rstrip("/") if getattr(s, "site_url", "") else str(request.base_url).rstrip("/"))
    return f"{base}/auth/google/callback"


def _rate_limited(ip: str) -> bool:
    now = time.time()
    hits = [t for t in _rate.get(ip, []) if now - t < _RATE_WINDOW_S]
    hits.append(now)
    _rate[ip] = hits[-_RATE_MAX:]
    return len(hits) > _RATE_MAX


@router.get("/auth/google/start")
async def google_start(request: Request, next: str = "/"):
    if not google_enabled():
        return JSONResponse({"detail": "login Google desabilitado"}, status_code=503)
    s = get_settings()
    state = secrets.token_urlsafe(32)
    request.session["google_oauth_state"] = state
    request.session["google_oauth_next"] = next if next.startswith("/") else "/"
    params = {
        "client_id": s.google_client_id,
        "redirect_uri": _redirect_uri(request),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
    }
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}", status_code=302)


@router.get("/auth/google/callback")
async def google_callback(request: Request, code: str = "", state: str = ""):
    if not google_enabled():
        return JSONResponse({"detail": "login Google desabilitado"}, status_code=503)
    ip = request.client.host if request.client else "?"
    if _rate_limited(ip):
        return JSONResponse({"detail": "muitas tentativas, aguarde"}, status_code=429)
    expected = request.session.pop("google_oauth_state", None)
    next_url = request.session.pop("google_oauth_next", "/") or "/"
    if not next_url.startswith("/"):
        next_url = "/"
    if not code or not state or not expected or state != expected:
        log.warning("OAuth callback com state inválido (ip=%s)", ip)
        return RedirectResponse("/entrar?erro=estado", status_code=302)
    s = get_settings()
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            tr = await http.post(GOOGLE_TOKEN_URL, data={
                "client_id": s.google_client_id,
                "client_secret": s.google_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": _redirect_uri(request),
            })
            if tr.status_code != 200:
                log.warning("Troca de code falhou: %s", tr.text[:200])
                return RedirectResponse("/entrar?erro=token", status_code=302)
            access_token = tr.json().get("access_token", "")
            ur = await http.get(GOOGLE_USERINFO_URL,
                                headers={"Authorization": f"Bearer {access_token}"})
            if ur.status_code != 200:
                log.warning("Userinfo falhou: %s", ur.text[:200])
                return RedirectResponse("/entrar?erro=perfil", status_code=302)
            profile = ur.json()
    except Exception:
        log.exception("Erro de rede no OAuth")
        return RedirectResponse("/entrar?erro=rede", status_code=302)

    sub = str(profile.get("sub", ""))
    email = (profile.get("email") or "").strip().lower()
    if not sub or not email:
        return RedirectResponse("/entrar?erro=perfil", status_code=302)
    with db.SessionLocal() as db_:
        from sqlalchemy import select

        user = db_.execute(
            select(SiteUser).where(SiteUser.provider_sub == sub)
        ).scalar_one_or_none()
        if user is None:
            user = db_.execute(
                select(SiteUser).where(SiteUser.email == email)
            ).scalar_one_or_none()
        if user is None:
            user = SiteUser(
                name=str(profile.get("name", ""))[:160],
                email=email,
                avatar_url=str(profile.get("picture", ""))[:500] or None,
                provider="google",
                provider_sub=sub,
            )
            db_.add(user)
        else:
            user.provider = "google"
            user.provider_sub = user.provider_sub or sub
            user.name = str(profile.get("name", ""))[:160] or user.name
            user.avatar_url = str(profile.get("picture", ""))[:500] or user.avatar_url
            user.is_active = True
        user.last_login_at = utcnow()
        db_.commit()
        request.session["site_user_id"] = user.id
    return RedirectResponse(next_url, status_code=302)
