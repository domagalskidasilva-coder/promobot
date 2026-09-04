# 🔥 Promobot

Bot de monitoramento de promoções de **eletrônicos e jogos** em
**Mercado Livre, Amazon BR e Shopee**, com camada anti-farsa:

- 📉 **Histórico de preços próprio** — o bot compara com o que *ele mesmo* já viu,
  e não com o "de/por" do anúncio (que os marketplaces inflam).
- 🤖 **Análise com IA (Gemini)** — score 0–100, resumo de 1 linha e flags
  (`desconto_falso`, `preco_irreal`, `recondicionado`…).
- 📊 **Painel web** — feed com filtros, gráfico de histórico, watchlist com
  preço-alvo e botão "buscar agora".
- ✉️ **E-mail** — alerta instantâneo de ofertas quentes + resumo diário às 8h,
  com anti-spam (não repete o mesmo produto em 72 h).
- 🛡️ **Anti-bloqueio** — navegador Playwright com perfil persistente, pausas
  humanizadas e *circuit breaker* por site.

100% gratuito: sem API paga, sem licença — só uma chave grátis do Gemini.

## Como rodar no seu PC

```bash
cd promobot
python3 -m virtualenv .venv 2>/dev/null || true   # já existe .venv neste setup
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium          # baixa o navegador (~150 MB, uma vez)

cp .env.example .env                 # edite: Gemini key, SMTP, palavras-chave
uvicorn app.main:app --reload
```

Abra **http://localhost:8000** — com `PROMOBOT_DISABLE_SCHEDULER=false`, o
primeiro ciclo de coleta começa ~10 s depois e os seguintes respeitam o intervalo
configurado.

## O que você precisa fornecer

| Item | Onde conseguir | Custo |
|---|---|---|
| Chave Gemini | https://aistudio.google.com/apikey | grátis (free tier) |
| SMTP p/ e-mails | Gmail → "senha de app" | grátis |
| Palavras-chave | no painel ou `.env` | — |

> Sem Gemini/SMTP o bot funciona igual (só regras determinísticas + painel) —
> os avisos aparecem no rodapé do painel.

## Arquitetura

```
app/
├── config.py            # tudo via .env (prefixo PROMOBOT_)
├── models.py            # Product, Offer, PriceHistory, Analysis, WatchItem, EventLog
├── pipeline.py          # coleta → dedupe → histórico → regras → IA → notifica
├── scrapers/
│   ├── mercadolivre.py  # página de ofertas (primária) + busca (fallback)
│   ├── amazon.py        # Playwright (busca + /deals), detecta CAPTCHA
│   ├── shopee.py        # Playwright interceptando /api/v4/search_items (JSON)
│   └── browser.py       # 1 contexto persistente por site, stealth básico
├── ai/analyst.py        # Gemini JSON mode + cache por hash da oferta
├── notify/email.py      # instantâneo + digest, anti-spam
├── scheduler.py         # APScheduler: ciclo/30 min, digest 8h, jitter
└── web/                 # FastAPI + Jinja2 (feed, produto, watchlist, status)
```

### Especificidades de cada site (vale saber)

- **Mercado Livre** — a página `www.mercadolivre.com.br/ofertas` funciona sem
  login e é a fonte primária (2 páginas por ciclo). A **busca por
  palavra-chave** do ML está atrás de login-wall anti-bot; para furá-la, o bot
  usa o **ClockBrowser**: o Google Chrome real da sua máquina via CDP (ver
  abaixo). A API pública de busca hoje devolve 403 sem token.
- **Amazon BR** — CAPTCHA detectado ⇒ o coletor aborta a tentativa e o
  *circuit breaker* pausa o site (não insiste, para não agravar o bloqueio).
- **Shopee** — sem API pública; o coletor intercepta o JSON que o próprio site
  carrega (`/api/v4/search_items`). Se a Shopee mudar o endpoint, o evento
  aparece em **Status**.

### ClockBrowser (Chrome real, fallback anti-bloqueio)

Quando o ML bloqueia a busca no navegador headless, o bot conecta ao Chrome
real do seu PC (com fingerprint humano e cookies de verdade) e faz a busca por
lá. Configure no `.env` do coletor:

```bash
PROMOBOT_CDP_URL=http://127.0.0.1:9333
```

O bot **relança o Chrome sozinho** se ele estiver fechado (usando o perfil
`~/.config/promobot-chrome`). Para deixar permanente no desktop (Ubuntu/GNOME),
adicione ao Startup Applications, ou rode uma vez:

```bash
mkdir -p ~/.config/autostart && cat > ~/.config/autostart/promobot-chrome.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Promobot ClockBrowser
Exec=google-chrome --remote-debugging-port=9333 --user-data-dir=%h/.config/promobot-chrome --no-first-run --no-default-browser-check --restore-last-session
X-GNOME-Autostart-enabled=true
EOF
```

Sem `PROMOBOT_CDP_URL` (ou sem Chrome), o bot funciona igual — apenas a busca
por keyword do ML fica indisponível (as ofertas continuam sendo coletadas).

### Por que desconfiar do "50% OFF"

O painel mostra o **desconto real**: preço atual vs maior preço dos últimos
30 dias que *o próprio bot registrou* e selo **menor preço histórico**.
A IA recebe esses números e penaliza ofertas ancoradas em preço inflado.

## Migração para VPS (24/7)

```bash
# na VPS, com Docker instalado:
scp -r promobot .env usuario@vps:~/
cd ~/promobot && docker compose up -d --build
```

O painel fica em `http://IP-DA-VPS:8000` — **configure `PROMOBOT_AUTH_USER/PASS`**
antes de expor. Banco e perfis de navegador persistem em `./data`.

Antes de subir, no `.env` exclusivo da VPS, configure ao menos:

```dotenv
PROMOBOT_DISABLE_SCHEDULER=false
PROMOBOT_SESSION_SECRET=uma-chave-aleatoria-longa
PROMOBOT_AUTH_USER=um-usuario
PROMOBOT_AUTH_PASS=uma-senha-forte
```

O compose já usa `restart: unless-stopped`, healthcheck em `/healthz`, processo
inicializador para o navegador e um único worker Uvicorn (o scheduler é local ao
processo). Para o reinício sobreviver a reboot da VPS, habilite o Docker uma vez:

```bash
sudo systemctl enable --now docker
```

Depois valide, sem iniciar uma coleta manual: `docker compose ps` deve mostrar
`healthy`; `docker compose logs -f promobot` deve registrar o scheduler habilitado
e a primeira coleta prevista em aproximadamente 10 segundos. Não configure
`PROMOBOT_DISABLE_SCHEDULER=true` nesse container: esse valor é reservado ao
painel serverless e aos testes.

## Painel na Vercel + coletor na sua máquina (arquitetura atual)

O painel que seus colegas acessam roda na Vercel; a coleta roda no seu PC;
os dois falam com o **mesmo PostgreSQL na nuvem** (Neon, free tier):

```
seu PC (coletor + IA + e-mail) ──write──►  Postgres (Neon)  ◄──read──  Vercel (painel)
```

### Passo a passo

1. **Banco grátis no Neon** — crie conta em https://neon.tech, crie um
   projeto e copie a *connection string* (parece
   `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`).
2. **No seu PC**, edite o `.env`:
   ```bash
   PROMOBOT_DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
   PROMOBOT_DISABLE_SCHEDULER=false   # coletor liga o agendador
   PROMOBOT_AUTH_USER=                # login só é preciso se expor o painel local
   ```
   As tabelas são criadas automaticamente no primeiro boot. Rode o coletor:
   ```bash
   uvicorn app.main:app --port 8000   # ou docker compose up -d --build
   ```
3. **Na Vercel**, importe este repositório (ou `vercel --prod` com a CLI) e
   configure as variáveis de ambiente do projeto:
   - `PROMOBOT_DATABASE_URL` = a mesma connection string do Neon
   - `PROMOBOT_DISABLE_SCHEDULER` = `true` (a Vercel só serve o painel)
   - `PROMOBOT_SESSION_SECRET` = uma chave aleatória
   - `PROMOBOT_AUTH_USER` / `PROMOBOT_AUTH_PASS` = login para o pessoal
   - `PROMOBOT_GEMINI_API_KEY`, SMTP etc. (opcional — o painel lê para exibir badges)

   O `vercel.json` já está pronto; o deploy usa `requirements.txt` (sem
   Playwright, que só o coletor precisa).
4. Pronto: o site atualiza sozinho (auto-refresh a cada 90 s) conforme o
   coletor grava no Postgres.

> Limites do free tier do Neon: o coletor local faz poucas escritas por ciclo
> (dezenas), muito abaixo do teto. Se o projeto "dormir" por inatividade, a
> primeira conexão acorda em ~1 s.

## Ajustes úteis (`.env`)

- `PROMOBOT_CRAWL_INTERVAL_MINUTES=30` — frequência da varredura (15–60 recomendado;
  abaixo de 15 aumenta o risco de bloqueio).
- `PROMOBOT_INSTANT_ALERT_SCORE=80` — score mínimo para e-mail imediato.
- `PROMOBOT_RESULTS_PER_KEYWORD=40` — quantos resultados por busca.

## Uso responsável

Este projeto coleta apenas **dados públicos** para uso pessoal, respeitando
pausas entre requisições. Não faz compra automática. Os sites podem mudar o
HTML a qualquer momento — quando um coletor quebra, aparece em **Status** e no
log; ajuste os seletores do scraper correspondente. Consulte os termos de uso
de cada marketplace.
