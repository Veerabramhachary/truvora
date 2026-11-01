# Deploying Truvora outside Vercel

Emergency kit. The app is a plain Next.js 16 server (`next build` → `next start`); nothing in it requires Vercel. Only three things are Vercel-specific, and all three have drop-in replacements below.

| Vercel feature | Replacement |
| --- | --- |
| `vercel.json` crons | Host crontab + `deploy/trigger-cron.sh` (or any scheduler) |
| `VERCEL_URL` fallback in `lib/site.ts` | Set `NEXT_PUBLIC_APP_URL` explicitly |
| `x-real-ip` injected by Vercel's edge | Your reverse proxy must set it (see [Client IP](#5-client-ip-and-reverse-proxy)) |

Everything else — Neon, Clerk, Stripe, Upstash Redis, Resend — is host-agnostic.

## TL;DR

```bash
# on the server, from a checkout of this repo
cp .env.example .env       # fill in every required value (see §2)
npm run db:migrate         # fresh DBs; for an existing DB use: npm run db:push -- --force
npm run insert-plans       # once, if the plans table is empty
cd deploy && set -a && . ../.env && set +a && docker compose up -d --build
# then: §5 proxy, §6 cron, §7 webhooks, §8 smoke test
```

No Docker? Use the [bare Node path](#bare-node-alternative-no-docker).

## 1. Pick a host

Any of Railway, Render, Fly.io, Hetzner/DigitalOcean VPS, Coolify, AWS ECS — anything that runs a Node 20+ container or VM. Requirements:

- **Outbound WebSocket support.** `db/index.ts` uses `neon-serverless` `Pool`, which connects to Neon over WebSocket. Most hosts allow this; a locked-down egress would require switching to the HTTP `neon()` driver or plain `pg`.
- **A public HTTPS origin** for Clerk/Stripe webhooks.

## 2. Environment

Copy `.env.example` → `.env` and fill every value. The load-bearing ones:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Neon Postgres, `sslmode=require` |
| `ENCRYPTION_PASSPHRASE`, `ENCRYPTION_SALT` | **Copy the production values exactly.** There is no key rotation path — different values make every existing `description`/`note`/`metadata` row permanently unreadable. |
| `NEXT_PUBLIC_APP_URL` | Real production origin, e.g. `https://app.example.com`. Baked into the client bundle at **build** time. |
| `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Same instance as before, or new keys if you move instances |
| `CLERK_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET` | Regenerate when you change webhook URLs (§7) |
| `CRON_SECRET` | Pick any long random string; used by both the app and the cron caller (§6) |
| `UPSTASH_REDIS_REST_URL/TOKEN` | Optional — without it rate limits are bypassed with a logged warning |
| `RESEND_API_KEY`, `RENEWAL_EMAIL_FROM` | Reminder emails (cron `subscriptionsTC`) |

## 3. Database

Migrations run **from a dev machine against production**, not inside the container (the runtime image has no `drizzle-kit`):

```bash
DATABASE_URL="<production url>" npm run db:migrate   # fresh DB
DATABASE_URL="<production url>" npm run db:push -- --force   # existing DB (see drizzle/README.md)
npm run insert-plans    # plans must exist or every feature gate denies access
```

## 4. Build and run

```bash
docker build -t truvora \
  --build-arg NEXT_PUBLIC_APP_URL=https://app.example.com \
  --secret id=database_url,env=DATABASE_URL \
  .
docker run -d --name truvora --env-file .env -p 127.0.0.1:3000:3000 truvora
```

- `NEXT_PUBLIC_APP_URL` is a **build arg** — it must be baked in, setting it only at runtime is too late for client code.
- The `database_url` secret is optional; it lets the build reach the DB if any route prerenders from it. It is a BuildKit secret, so it never lands in image layers.
- `deploy/docker-compose.yml` wraps the same thing for a VPS.

> Image-size note: the runtime stage copies the full `node_modules` (including dev deps) for simplicity. For a smaller image later, add `output: "standalone"` to `next.config.ts` and copy `.next/standalone` instead.

### Bare Node alternative (no Docker)

```bash
npm ci
npm run build
npm start                        # serves on :3000
# or under systemd: ExecStart=/usr/bin/node node_modules/next/dist/bin/next start
```

## 5. Client IP and reverse proxy

`lib/rate-limit.ts:getClientIp` reads `x-real-ip` and deliberately ignores client-supplied `X-Forwarded-For` (spoofable). Vercel set this header at its edge; on your host the **reverse proxy must set it**, or every visitor shares one rate-limit bucket (`"unknown"`).

nginx (the proxy body is passed through untouched, which also keeps Stripe/Clerk raw-body signature verification working):

```nginx
server {
    listen 443 ssl http2;
    server_name app.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;   # required by lib/rate-limit.ts
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
```

Caddy equivalent: it sets these by default (`reverse_proxy 127.0.0.1:3000`).

## 6. Cron (replaces vercel.json)

Two daily jobs at 00:00 UTC, now triggered by any scheduler:

```bash
mkdir -p /etc/truvora
cat > /etc/truvora/cron.env <<EOF
TRUVORA_BASE_URL=https://app.example.com
CRON_SECRET=<same value as on the app host>
EOF
chmod 600 /etc/truvora/cron.env

crontab -e   # paste from deploy/crontab.example
```

Manual test (exit code 0 = both endpoints returned 200):

```bash
TRUVORA_BASE_URL=... CRON_SECRET=... ./deploy/trigger-cron.sh
# Windows: .\deploy\trigger-cron.ps1 -BaseUrl https://app.example.com -CronSecret ...
```

Failures are expected to be loud: `CRON_SECRET` unset → 503, wrong → 401, Resend unconfigured → 503.

## 7. Webhooks

Point both at the new origin (both are already public in `proxy.ts`):

| Provider | URL |
| --- | --- |
| Stripe | `https://app.example.com/api/webhooks/stripe` |
| Clerk | `https://app.example.com/api/webhooks/clerk` |

Both verify signatures on the **raw request body** — do not put anything in the proxy that re-serializes JSON. Copy the new signing secrets into `.env` (`STRIPE_WEBHOOK_SECRET`, `CLERK_WEBHOOK_SECRET`) and restart. In Clerk, also update the instance's allowed origins/JWT template audience to the new domain. In Stripe, update the live/test mode domain settings.

## 8. Smoke test

- [ ] `GET /` and `/pricing` return 200 over HTTPS
- [ ] Sign in, dashboard loads, an expense and a subscription create successfully
- [ ] Stripe test-mode event → `/api/webhooks/stripe` returns 200 in the Stripe dashboard
- [ ] Clerk test event → `/api/webhooks/clerk` returns 200; a new user gets an `app_subscriptions` row
- [ ] `./deploy/trigger-cron.sh` exits 0; check `/var/log/truvora-cron.log`
- [ ] No `[rate-limit] Upstash Redis is not configured` warning (unless intentionally skipped)
- [ ] A renewal reminder email arrives in Resend's log

## 9. Rollback

Keep the previous image tag (`docker tag truvora:previous truvora && docker run ...`). DB migrations are forward-only — take a Neon backup/branch before `db:migrate`/`db:push` on production. Do not change `ENCRYPTION_PASSPHRASE`/`ENCRYPTION_SALT` during any of this.
