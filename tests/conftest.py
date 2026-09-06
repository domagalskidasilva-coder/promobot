"""Configura o ambiente ANTES de qualquer import do app."""
import os
from pathlib import Path

# banco de teste isolado
os.environ["PROMOBOT_DATABASE_URL"] = f"sqlite:///{Path(__file__).parent / 'data' / 'test.db'}"
os.environ["PROMOBOT_DISABLE_SCHEDULER"] = "true"
os.environ["PROMOBOT_GEMINI_API_KEY"] = ""  # testes não chamam IA
# herméticos: sem SMTP real, sem login admin (cada teste habilita se precisar)
os.environ["PROMOBOT_SMTP_HOST"] = ""
os.environ["PROMOBOT_EMAIL_TO"] = ""
os.environ["PROMOBOT_AUTH_USER"] = ""
os.environ["PROMOBOT_AUTH_PASS"] = ""
os.environ.setdefault("PROMOBOT_SESSION_SECRET", "test-secret")

import sys  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Zera o banco de teste a cada execução (rodando depois dos imports do app)
from app import db as _db  # noqa: E402

_db.init_db()
with _db.engine.connect() as conn:
    for table in reversed(_db.Base.metadata.sorted_tables):
        conn.execute(table.delete())
    conn.commit()
