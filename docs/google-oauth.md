# Login Google do site público (OAuth 2.0)

Sem `PROMOBOT_GOOGLE_CLIENT_ID`/`SECRET` o botão some sozinho
(`google_enabled=false` em `/api/site/me`). Nada quebra.

## 0. Domínio promobot.shop (Hostinger → Vercel)

1. Vercel: projeto → **Settings → Domains → Add** → `promobot.shop` e `www.promobot.shop`.
2. Hostinger: painel do domínio → **DNS / Zona DNS**, edite os registros de
   parking (A/AAAA/CNAME padrão da Hostinger) e deixe:
   - `A` · `@` · `216.198.79.1` (IP recomendado pela Vercel; o legado
     `76.76.21.21` também funciona) · TTL automático
   - `CNAME` · `www` · `cname.vercel-dns.com`
3. Propagação costuma levar minutos a poucas horas; a Vercel emite o SSL
   automaticamente quando o DNS aponta certo (flag "Valid Configuration").
4. Em Vercel, escolha `promobot.shop` como domínio primário e redirecione
   `www` → domínio raiz (opção "Redirect to").

## 1. Criar o client no Google Cloud

1. https://console.cloud.google.com → projeto (novo ou existente) → **APIs e serviços → Credenciais**.
2. **Criar credenciais → ID do cliente OAuth** → tipo **App da Web**.
3. Em **URIs de redirecionamento autorizadas**, cadastre EXATAS (uma por linha):
   - `https://promobot.shop/auth/google/callback` (produção)
   - `http://localhost:8000/auth/google/callback` (dev local)
   - se usar preview da Vercel p/ testar: `https://SEU-PREVIEW.vercel.app/auth/google/callback`
4. Copie **Client ID** e **Client Secret**.

> O `redirect_uri` é montado de `PROMOBOT_SITE_URL` (recomendado fixar em prod,
> ex. `https://promobot.shop`) ou do host da requisição quando vazio.
> Qualquer divergência de um caractere com o cadastrado → Google responde
> `redirect_uri_mismatch`.

## 2. Configurar

Local (`.env`):

```dotenv
PROMOBOT_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
PROMOBOT_GOOGLE_CLIENT_SECRET=xxxx
PROMOBOT_SITE_URL=http://localhost:8000
```

Vercel (mesmos nomes, **sem prefixo extra** — o código já usa `PROMOBOT_`):

- `PROMOBOT_GOOGLE_CLIENT_ID`, `PROMOBOT_GOOGLE_CLIENT_SECRET`
- `PROMOBOT_SITE_URL=https://promobot.shop`
- `PROMOBOT_HTTPS_ONLY=true` (cookie `Secure`)

## 3. Testar

1. Abra `/entrar` → **Entrar com Google** → deve ir a `accounts.google.com`.
2. Autorize → volta logado (avatar/nome no topo).
3. `/api/site/me` → `{"logged": true, ...}`.
4. Erros voltam a `/entrar?erro=estado|token|perfil|rede`.

## Notas

- Escopo mínimo: `openid email profile`. Sem senha armazenada.
- Sessão do site (`site_user_id`) é independente da sessão admin (`user`).
- Rate-limit do callback é best-effort em memória; a proteção real é o
  `state` anti-CSRF guardado na sessão assinada.
