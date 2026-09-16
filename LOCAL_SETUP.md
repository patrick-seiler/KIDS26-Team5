# AnTelOpe — Local Setup Guide

This walks through getting the AnTelOpe backend (Go/Gin) and frontend (Vue 3)
running on your machine, in the order that avoids the failure modes we hit
while setting this up (pgAdmin port clash, backend crash-looping on Nomad).

Two ways to run it — pick one:

- **Path A — Docker Compose (fastest, whole stack in containers)**
- **Path B — Native local dev (backend via `go`/`make`, frontend via Vite w/ hot reload)** — what you want if you're actively coding

Both paths need a **local Nomad agent** running on your host — it is not
optional. The Go backend calls `InitNomad` at startup and **panics** (crashes)
if it can't reach Nomad, whether you run the backend in Docker or natively.

---

## 0. Prerequisites

| Tool | Required version | Check | Install (macOS/Homebrew) |
|---|---|---|---|
| Go | 1.25+ | `go version` | `brew install go` |
| Node.js | `^20.19` or `>=22.12` | `node --version` | `brew install node` |
| pnpm | any recent | `pnpm --version` | `brew install pnpm` |
| Docker + Compose | any recent | `docker --version` | `brew install --cask docker` |
| HashiCorp Nomad | any recent | `nomad --version` | `brew install hashicorp/tap/nomad` |
| git | any | `git --version` | `brew install git` |

Already confirmed installed on this machine: Go 1.27.1, Node v23.10.0, pnpm
12.4.2, Docker 29.8.0 (Compose v5.5.1). **Not installed: `nomad`.** Install it
first — everything else downstream depends on it.

Optional, only needed for the full Go dev loop (linting/swagger docs), not for
just running the app:

```bash
brew install golangci-lint swaggo/tap/swag
```

---

## 1. Start a local Nomad agent

Run this in its own terminal tab and leave it running the whole time you're
developing:

```bash
nomad agent -dev
```

This starts a single-node dev Nomad cluster on `localhost:4646` (API/UI) with
no ACLs. Verify it's up:

```bash
curl -s http://localhost:4646/v1/status/leader
```

You should get back a non-empty leader address. Nomad's UI is at
[http://localhost:4646](http://localhost:4646).

> If you previously tried `docker compose up` and saw the `antelope`
> container crash-loop with `panic: nomad: connectivity check failed ...
> connection refused` — this is why. The container reaches your host via
> `host.docker.internal:4646`, and nothing was listening there until Nomad is
> running.

---

## 2. Clone and configure

```bash
git clone <this-repo-url> KIDS26-Team5
cd KIDS26-Team5/src
```

Both run paths read from `config.yaml` (non-secret structural defaults) and
`ANTELOPE_*` env vars (secrets/hosts, override the file). Create your local
copies from the committed templates — both are git-ignored so your edits stay
local:

```bash
cp config.yaml.example config.yaml
```

You generally don't need to edit `config.yaml` for local dev — defaults are
fine. The one thing worth knowing: `system.mode: debug` (the default) only
*warns* about placeholder secrets instead of refusing to start; only switch to
`release` for a real deployment.

---

## Path A — Docker Compose (whole stack in containers)

Use this if you just want the app running, not actively editing Go/Vue code.

```bash
cd src/docker
cp .env.example .env      # defaults are fine for local dev; edit if you want
```

Check `.env` (or the defaults baked into `docker-compose.yaml`) for the
**pgAdmin port** — it defaults to `5050`. If you already have something on
`5050` (we did — a stray process from a previous session), either stop that
process or remap it before starting:

```bash
# find what's using it, if curious
lsof -nP -iTCP:5050 -sTCP:LISTEN

# OR just remap pgAdmin's host port in docker/.env
echo "PGADMIN_PORT=5051" >> .env
```

With Nomad already running from step 1, bring the stack up:

```bash
docker compose up -d --build
```

This builds the single `antelope` image (Go binary with the Vue frontend
embedded via `//go:embed`) plus Postgres, Redis, maildev (SMTP catcher), and
pgAdmin.

Check it came up clean:

```bash
docker compose ps
docker compose logs -f antelope   # Ctrl-C to stop tailing
```

Services once healthy:

| Service | URL | Notes |
|---|---|---|
| AnTelOpe app (API + UI) | http://localhost:8086 | super-user: `admin@antelope.dev` / `password` (from config defaults) |
| Maildev (captured email) | http://localhost:1080 | |
| pgAdmin | http://localhost:5050 (or your remapped port) | login `admin@antelope.dev` / `pgadmin`; Postgres server pre-registered |
| Nomad UI | http://localhost:4646 | from step 1, not part of this stack |

Common commands:

```bash
docker compose logs -f antelope        # tail server logs
docker compose up -d --build antelope  # rebuild & restart just the app
docker compose down                    # stop (keeps volumes/data)
docker compose down -v                 # stop AND delete all data
```

---

## Path B — Native local dev (hot reload, for active coding)

Needs two terminals plus the Nomad agent from step 1 (three total).

### 2b. Start Postgres + Redis (skip pgAdmin/full app — just the two datastores)

Easiest to still borrow Docker Compose for just the datastores:

```bash
cd src/docker
cp .env.example .env   # if you haven't already
docker compose up -d postgres redis maildev
```

### 2c. Point the backend at them and run it

The backend defaults (`config.yaml.example`) already assume
`localhost:5432`/`localhost:6379`/`localhost:4646`, which matches this setup.
Set the DB/Redis credentials to match the compose defaults (`antelope`/`antelope`)
via env, then run:

```bash
cd src
export ANTELOPE_POSTGRESQL_USERNAME=antelope
export ANTELOPE_POSTGRESQL_PASSWORD=antelope
export ANTELOPE_POSTGRESQL_DB=antelope
just dev
# equivalent: make dev  →  go run . web
```

This runs the API server in debug mode on `:8086`, **without** the embedded
frontend — you serve that separately with Vite (next step). Watch the startup
log: it prints a redacted config summary and should show `connected to
PostgreSQL successfully`, `connected to Redis successfully`, and no Nomad
panic (because Nomad is already running from step 1).

### 2d. Start the frontend with hot-module reload

In a second terminal:

```bash
cd src/web_src
pnpm install
pnpm run dev
```

Vite serves the UI on **http://localhost:9999** with HMR, and proxies API
calls through to the backend on `:8086`. Open that URL in your browser — this
is what you'll actually develop against.

---

## 3. First login

Either path seeds one super-user on first boot, from `config.yaml`'s
`system.super-user` (default `admin@antelope.dev`) and
`ANTELOPE_SYSTEM_SUPER_USER_PASSWORD` (default `password`).

---

## 4. Useful commands (from `src/`)

```bash
just lint        # golangci-lint run ./...
just test        # go test -race -cover ./...
just fmt          # gofmt + goimports
just swagger      # regenerate Swagger docs (needs `swag`)
just build-embed  # frontend + embedded server + CLI → bin/
```

---

## Optional / advanced — skip for basic setup

- **Agent skill bundle** (~700 bioinformatics skills the AI agent can use):
  generated from git submodules, not committed. Not needed to boot the app —
  it just runs without built-in skills and logs a warning.
  ```bash
  just skills-submodules
  just skills-bundle
  ```
- **Daytona sandbox** (`scripts/daytona/`): where the AI agent actually
  executes skills/pipelines. Needed for the AI-agent chat feature to run code,
  not for the core platform (auth, pipeline registration, job dispatch UI) to
  work.
- **Nix flake** (`flake.nix`): an alternative, fully pinned dev shell
  (`nix develop`) providing Go, Node, pnpm, golangci-lint, swag, etc. in one
  shot — an alternative to the Homebrew installs in step 0, not required.
- **External CAB service** (`cab.base-url` in config): points at St. Jude's
  internal `nightingale-dev` service. Only relevant on the St. Jude network;
  irrelevant to local dev otherwise.

---

## Troubleshooting

**`antelope` container restarts in a loop / logs show
`panic: nomad: connectivity check failed ... connection refused`**
Nomad isn't running on your host. Start it: `nomad agent -dev` (step 1), then
`docker compose restart antelope`.

**`docker compose up` fails with `ports are not available: ... 127.0.0.1:5050 ... bind: address already in use`**
Something else already has port 5050 (pgAdmin's default host port). Either
stop whatever's using it, or set `PGADMIN_PORT` to something else in
`src/docker/.env` before bringing the stack up.

**Backend (`just dev` / `go run . web`) panics on startup**
Almost always one of Postgres/Redis/Nomad isn't reachable yet. Confirm all
three are up (`docker compose ps`, `curl localhost:4646/v1/status/leader`)
before starting the backend.

**Frontend shows API errors / can't reach backend**
Confirm the backend is actually running on `:8086` (Path B) — Vite's dev
server proxies to it but doesn't start it for you.
