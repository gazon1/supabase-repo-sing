# Singularity — Supabase Self-Hosted Infrastructure

Self-hosted Supabase stack for the Singularity todo app.  
Runs on Coolify via Docker Compose. Edge-runtime replaced with **Bun/Hono** functions server.

## Repository structure

```
.
├── docker-compose.yml          # Main compose file — deploy this in Coolify
├── .env.example                # Copy → .env and fill secrets (never commit .env)
├── entrypoint.sh               # MinIO bucket init script
├── functions-server/           # Bun/Hono functions (replaces Deno edge-runtime)
│   ├── Dockerfile
│   ├── server.ts               # Entry point — add new routes here
│   ├── functions/
│   │   └── sync.ts             # CRDT sync function
│   ├── package.json
│   └── tsconfig.json
└── volumes/
    ├── api/
    │   └── kong.yml            # Kong declarative config (routes + auth)
    ├── db/                     # Postgres init SQL — download from supabase/supabase
    │   ├── _supabase.sql
    │   ├── jwt.sql
    │   ├── logs.sql
    │   ├── pooler.sql
    │   ├── realtime.sql
    │   ├── roles.sql
    │   └── webhooks.sql
    ├── logs/
    │   └── vector.yml          # Vector log routing to Logflare
    ├── pooler/
    │   └── pooler.exs          # Supavisor tenant config (kept for reference)
    ├── snippets/               # Studio SQL snippets (auto-managed, keep empty)
    └── functions/              # Deno stubs (keep empty — Bun server is used)
```

## Quick start (local)

```bash
# 1. Clone and enter
git clone <your-repo> && cd supabase-infra

# 2. Create .env
cp .env.example .env
# Fill in all values marked  ← CHANGE THIS

# 3. Download Supabase DB init files
curl -sL https://github.com/supabase/supabase/archive/refs/heads/master.tar.gz \
  | tar -xz --strip=4 \
    supabase-master/docker/volumes/db \
    -C volumes/db

# 4. Make entrypoint executable
chmod +x entrypoint.sh

# 5. Start
docker compose up -d

# 6. Open Studio
open http://localhost:8000   # login: admin / your DASHBOARD_PASSWORD
```

## Deploying to Coolify

### Step 1 — Create a new Resource

1. Coolify dashboard → **New Resource** → **Docker Compose**
2. Source: **Git repository** → connect your repo
3. **Compose file path**: `docker-compose.yml`
4. **Build pack**: Docker Compose

### Step 2 — Environment variables

In the Coolify resource → **Environment Variables** tab, add every key from `.env.example`.  
Coolify will inject them at deploy time. You can use **Coolify's secret generator** for passwords.

Key variables to set:

| Variable | Notes |
|---|---|
| `SERVICE_PASSWORD_POSTGRES` | 32+ random chars |
| `SERVICE_PASSWORD_JWT` | 32+ random chars |
| `SERVICE_SUPABASEANON_KEY` | JWT signed with JWT secret — anon role |
| `SERVICE_SUPABASESERVICE_KEY` | JWT signed with JWT secret — service_role |
| `SERVICE_URL_SUPABASEKONG` | Your public domain, e.g. `https://api.yourapp.com` |
| `SERVICE_USER_ADMIN` / `SERVICE_PASSWORD_ADMIN` | Studio dashboard login |
| `SERVICE_USER_MINIO` / `SERVICE_PASSWORD_MINIO` | MinIO credentials |
| `SERVICE_PASSWORD_LOGFLARE` | Random string |
| `SECRET_PASSWORD_REALTIME` | 64 hex chars |

**Generate anon/service JWT keys:**  
→ https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys

### Step 3 — Volumes (Postgres init SQL)

The `volumes/db/*.sql` files are standard Supabase init scripts. Download them from the official repo:

```bash
# From inside your cloned repo
./scripts/download-db-init.sh   # see script below, or download manually
```

Or manually from:  
https://github.com/supabase/supabase/tree/master/docker/volumes/db

### Step 4 — Deploy

Coolify → **Deploy**. First deploy takes ~3-5 min (DB init + migrations).

### Step 5 — Add domain

Coolify → resource → **Domains** → add your domain.  
Point DNS `A record` to your Coolify server IP.  
Kong will be the entry point for all Supabase API traffic.

## Adding a new function

1. Create `functions-server/functions/my-function.ts` — export default async handler
2. Register in `functions-server/server.ts`:
   ```ts
   app.post("/my-function", (await import("./functions/my-function")).default);
   ```
3. Call from Flutter client:
   ```dart
   await supabase.functions.invoke('my-function', body: {...});
   ```
4. Commit + push → Coolify auto-deploys

## Services removed vs vanilla Supabase

| Service | Status | Reason |
|---|---|---|
| `supabase-edge-functions` (Deno) | ❌ Removed | Replaced by `functions-server` (Bun/Hono) |
| `supabase-supavisor` | ❌ Removed | Not needed for single-tenant self-hosted |

## Updating images

Edit the `image:` tag in `docker-compose.yml` → commit → Coolify redeploys.  
Watch [supabase/supabase releases](https://github.com/supabase/supabase/releases) for updates.