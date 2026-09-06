"""Modelos SQLAlchemy 2.0 (async + aiosqlite)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class SearchProfile(Base):
    """Palavra-chave monitorada e em quais sites."""

    __tablename__ = "search_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    keyword: Mapped[str] = mapped_column(String(120), unique=True)
    marketplaces: Mapped[str] = mapped_column(String(120), default="ml,amazon,shopee")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Product(Base):
    """Produto canônico por marketplace. Dedupe por (marketplace, external_id)."""

    __tablename__ = "products"
    __table_args__ = (
        UniqueConstraint("marketplace", "external_id", name="uq_product_mp_ext"),
        Index("ix_products_title", "title"),
        Index("ix_products_marketplace", "marketplace"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    marketplace: Mapped[str] = mapped_column(String(20))  # ml | amazon | shopee
    external_id: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(60), nullable=True)  # electronics | games
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    offers: Mapped[list["Offer"]] = relationship(back_populates="product")


class Offer(Base):
    """Estado atual da oferta de um produto (1:1 com Product)."""

    __tablename__ = "offers"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), unique=True)
    price: Mapped[float] = mapped_column(Float)
    list_price: Mapped[float | None] = mapped_column(Float, nullable=True)  # preço "de" anunciado
    installments: Mapped[str | None] = mapped_column(String(120), nullable=True)
    coupon_text: Mapped[str | None] = mapped_column(String(200), nullable=True)
    seller: Mapped[str | None] = mapped_column(String(120), nullable=True)
    condition: Mapped[str] = mapped_column(String(20), default="new")  # new | used | refurbished
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    product: Mapped[Product] = relationship(back_populates="offers")
    analysis: Mapped["Analysis | None"] = relationship(back_populates="offer", uselist=False)


class PriceHistory(Base):
    """Um ponto por variação de preço observada."""

    __tablename__ = "price_history"
    __table_args__ = (Index("ix_price_history_product_time", "product_id", "captured_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    price: Mapped[float] = mapped_column(Float)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Analysis(Base):
    """Resultado das regras determinísticas + veredito da IA (cacheado)."""

    __tablename__ = "offers_analysis"
    __table_args__ = (UniqueConstraint("offer_id", name="uq_analysis_offer"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    offer_id: Mapped[int] = mapped_column(ForeignKey("offers.id"))

    # Regras determinísticas (sempre recalculadas)
    real_discount_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_hist_min: Mapped[bool] = mapped_column(Boolean, default=False)
    vs_avg30_pct: Mapped[float | None] = mapped_column(Float, nullable=True)

    # IA (cacheada por hash do conteúdo da oferta)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0-100
    flags: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)  # resumo 1 linha pt-BR
    ai_analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Anti-spam
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notified_price: Mapped[float | None] = mapped_column(Float, nullable=True)

    offer: Mapped[Offer] = relationship(back_populates="analysis")


class EventLog(Base):
    """Log consultável de coletas/erros (mostrado no painel de status)."""

    __tablename__ = "event_log"
    __table_args__ = (Index("ix_event_log_time", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    level: Mapped[str] = mapped_column(String(10), default="info")  # info | warn | error
    scope: Mapped[str] = mapped_column(String(40))  # scraper:ml | scraper:amazon | ai | notify | pipeline
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WatchItem(Base):
    """Watchlist: produto + preço-alvo; alerta quando o preço cai até ele."""

    __tablename__ = "watch_items"
    __table_args__ = (UniqueConstraint("product_id", name="uq_watch_product"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), unique=True)
    target_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_alerted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AppControl(Base):
    """Flags de controle compartilhadas entre painel (Vercel) e coletor (local).

    'collect_request' usa `value` como estado:
      vazio/ausente = ocioso · "requested:<iso>" = painel pediu ciclo
      · "running:<iso>" = coletor executando · string vazia = terminou.
    """

    __tablename__ = "app_control"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Store(Base):
    """Loja monitorada: virtual (ML/Amazon/Shopee) ou física (redes sociais)."""

    __tablename__ = "stores"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    marketplace: Mapped[str] = mapped_column(String(20))  # ml | amazon | shopee | fisica
    # ML: nome da loja oficial · Amazon: seller id ou nome · Shopee: shopid
    # Física: redes sociais/@ (instagram, tiktok...)
    query: Mapped[str] = mapped_column(String(200))
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Coupon(Base):
    """Cupom de desconto coletado dos marketplaces (páginas de cupons ou ofertas)."""

    __tablename__ = "coupons"
    __table_args__ = (UniqueConstraint("code", "marketplace", name="uq_coupon_code_mp"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    marketplace: Mapped[str] = mapped_column(String(20))
    code: Mapped[str] = mapped_column(String(64))  # "" = cupom aplicado automaticamente no link
    description: Mapped[str] = mapped_column(Text)  # ex.: "R$100 OFF em eletrônicos acima de R$1000"
    url: Mapped[str | None] = mapped_column(Text, nullable=True)  # link da promo/cupom
    store: Mapped[str | None] = mapped_column(String(160), nullable=True)  # ex.: Samsung, Xbox
    min_purchase: Mapped[str | None] = mapped_column(String(80), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class AppSetting(Base):
    """Configuração editável pelo painel (KV). Ex.: IDs de afiliado."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# --------------------------------------------------------------------------
# Site público (vitrine). WatchItem continua sendo do admin/coletor.
# Config do site (site_title, site_tagline...) reaproveita AppSetting (KV).
# --------------------------------------------------------------------------
class SiteUser(Base):
    """Visitante cadastrado do site público (login Google na Fase 2)."""

    __tablename__ = "site_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), default="")
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider: Mapped[str] = mapped_column(String(20), default="google")
    provider_sub: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    prefs_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SiteFavorite(Base):
    """Produto favoritado por um usuário do site."""

    __tablename__ = "site_favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_sitefav_user_product"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("site_users.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SiteAlert(Base):
    """Alerta de preço por usuário do site (avaliado pelo coletor)."""

    __tablename__ = "site_alerts"
    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_sitealert_user_product"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("site_users.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    target_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SiteClick(Base):
    """Clique no redirect afiliado /r/{product_id} (analytics)."""

    __tablename__ = "site_clicks"
    __table_args__ = (Index("ix_site_clicks_product_time", "product_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("site_users.id"), nullable=True)
    source: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
