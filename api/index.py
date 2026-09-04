"""Entrada serverless do painel na Vercel.

Importa o mesmo app FastAPI do bot; na Vercel, configure
PROMOBOT_DISABLE_SCHEDULER=true (padrão do deploy) para que este processo
SÓ sirva o painel, lendo o mesmo banco Postgres que o coletor escreve.
"""
import os

# Segurança de processo serverless: nunca coletar da Vercel.
os.environ.setdefault("PROMOBOT_DISABLE_SCHEDULER", "true")

from app.main import app  # noqa: E402

handler = app
