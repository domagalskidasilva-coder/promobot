"""Configuração central do Promobot — lida tudo de variáveis de ambiente / .env.

Toda variável usa o prefixo PROMOBOT_ (ex.: PROMOBOT_GEMINI_API_KEY).
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="PROMOBOT_",
        extra="ignore",
    )

    # --- App / painel -----------------------------------------------------
    app_name: str = "Promobot"
    session_secret: str = "troque-esta-chave-em-producao"
    auth_user: str = ""  # vazio = painel sem login (localhost)
    auth_pass: str = ""

    # --- Banco ------------------------------------------------------------
    database_url: str = "sqlite:///./data/promobot.db"

    # --- IA (Gemini) ------------------------------------------------------
    # Várias chaves separadas por vírgula: quando uma bate a cota (429), a
    # próxima é usada automaticamente no mesmo ciclo.
    gemini_api_key: str = ""  # vazio = desativa a camada de IA (só regras)
    gemini_model: str = "gemini-2.5-flash"
    gemini_max_per_cycle: int = 20  # teto de chamadas por ciclo de coleta
    gemini_delay_s: float = 7.0  # pausa entre chamadas (free tier: ~10/min)
    instant_alert_score: int = 80  # score mínimo p/ alerta instantâneo

    # --- E-mail -----------------------------------------------------------
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    email_from: str = ""  # ex.: "Promobot <voce@gmail.com>"
    email_to: str = ""  # destino dos alertas
    digest_hour: int = Field(default=8, ge=0, le=23)  # hora do resumo diário

    # --- Coleta -----------------------------------------------------------
    crawl_interval_minutes: int = Field(default=30, ge=1)
    min_delay_s: float = 2.0  # pausa mínima entre requisições ao mesmo site
    max_delay_s: float = 5.0
    results_per_keyword: int = 40
    breaker_fail_threshold: int = 3  # falhas seguidas antes de abrir o breaker
    breaker_cooldown_hours: float = 2.0  # pausa do site após abrir o breaker

    # --- Anti-spam de alertas ----------------------------------------------
    alert_rate_limit_minutes: int = 60  # máx. 1 e-mail instantâneo por hora
    repeat_alert_hours: int = 72  # não repetir o mesmo produto em 72 h ...
    repeat_alert_extra_drop_pct: float = 5.0  # ... a menos que caia 5% além

    # --- Palavras-chave iniciais (só na primeira execução) -----------------
    keywords: str = "ps5,rtx 4060,steam deck,notebook gamer"

    # --- Links de afiliado (opcionais; vazio = desligado) ------------------
    # Amazon Associados (associados.amazon.com.br): tag tipo "minhaloja-20"
    affiliate_amazon_tag: str = ""
    # Meli Afiliados (mercadolivre.com.br/afiliados): matt_word aparece nos
    # links gerados no painel deles; matt_tool é opcional
    affiliate_ml_matt_word: str = ""
    affiliate_ml_matt_tool: str = ""
    # Shopee Afiliados: template do link curto com {url} (avançado)
    affiliate_shopee_template: str = ""

    # --- GitHub Actions (dispara coleta pelo botão do painel na Vercel) ----
    github_token: str = ""  # PAT com escopo repo + workflow
    github_repo: str = ""   # ex.: "usuario/promobot"

    # --- WhatsApp (Evolution API na VPS) ------------------------------------
    # Mesma chave do env AUTHENTICATION_API_KEY do container evolution-api;
    # o coletor espelha em app_settings para o painel (Vercel) conferir.
    wa_api_key: str = ""

    # --- Diversos ----------------------------------------------------------
    # false no processo coletor (VPS/Docker); true em testes e no painel Vercel.
    disable_scheduler: bool = False
    # Chrome real do usuário via CDP (fallback anti-bloqueio). Ex.:
    #   PROMOBOT_CDP_URL=http://127.0.0.1:9333
    # Inicie o Chrome com: --remote-debugging-port=9333
    cdp_url: str = ""
    log_level: str = "INFO"

    @property
    def keyword_list(self) -> list[str]:
        return [k.strip() for k in self.keywords.split(",") if k.strip()]

    @property
    def email_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_pass and self.email_to)

    @property
    def ai_enabled(self) -> bool:
        return bool(self.gemini_api_keys)

    @property
    def gemini_api_keys(self) -> list[str]:
        """Chaves do Gemini em rotação (suporta 1 ou várias, separadas por vírgula)."""
        return [k.strip() for k in self.gemini_api_key.split(",") if k.strip()]

    @property
    def auth_enabled(self) -> bool:
        return bool(self.auth_user and self.auth_pass)


@lru_cache
def get_settings() -> Settings:
    return Settings()
