# Throughput Tests

Load, pressure, and simulation scripts. 01 to 06 build up from a bare echo to a full factory floor with real escalations; 07 to 14 simulate shop floors, print farms, and task queues against the HTTP API.

## Running them

Local, against `docker compose up` (from your machine or inside the app container):

```bash
npm run test:assembly:1
docker compose exec app npx ts-node tests/throughput/01-echo.ts 1000 10
```

Remote, against a deployed app: every `*:remote:*` script sets `REMOTE=1`, which reads the target from your gitignored `.env`:

```bash
# .env
LT_REMOTE_URL=https://app.example.com
REMOTE_PASSWORD=...        # the deployed superadmin password

npm run test:remote:assembly:10
```

`REMOTE=1` without `LT_REMOTE_URL` stops with an error instead of running locally. An explicit `REMOTE_URL=...` (what CI passes) takes precedence.

## Index

| Script | npm scripts | What it exercises |
|---|---|---|
| `01-echo` to `03-chain` | `test:throughput:{echo,signal,chain}` | YAML engine baseline, hook/signal, chained stations (needs the database on `localhost:5416`) |
| `04-factory` | `test:factory:1`, `test:remote:factory:1` | 22-activity YAML factory with real escalations |
| `05-factory-sustained` | `test:factory:{10,100}` and `:remote:` | Sustained YAML factory load |
| `06-assembly-line` | `test:assembly:{1,10,100,250}` and `:remote:` | Durable parent/child assembly line |
| `07-*` | `shop:{enqueue,claim,resolve}` and `:remote:` | Shop floor: steady enqueue, claimers, resolvers |
| `08-*` | `ortho:{run,efficient:run,drain,day1..4}` and `:remote:` | Ortho insole pipeline, a manufacturing day compressed |
| `09-escalation-smoke` | (CI post-deploy) | Legacy and efficient escalation paths set `signal_key` |
| `10-*` | `print:{run,smoke,pressure,assert,reset,drain}` and `:remote:` | Print farm: printers, broker, technician, inspector |
| `11-task` | `task:demo`, `task:remote:demo` | Task queue: idempotent start, resolve by metadata, SLA expiry |
| `12-bambu`, `13-bambu-pressure` | `bambu:{demo,pressure}` and `:remote:` | Virtual Bambu fleet emitting real webhook events |
| `14-pull` | `pull:{demo,ttl}` and `:remote:` | Claim-as-lease contention across distinct principals |

A 10-minute ortho run (30 orders, 180 insoles) that finishes with nothing stalled:

```bash
DAILY_VOLUME=300 BASELINE_HOURS=1 COMPRESSION_HOURS=0.0099 BATCHES=10 PRINTER_SETS=3 \
  HOLD_S=5 POLL_MS=1000 npm run ortho:efficient:run
HOLD_S=0 POLL_MS=1000 npm run ortho:drain     # after an interrupted run
```

## Test Progression

### 01 — Echo (Baseline)

**What:** Single-worker flow. Trigger → echo → done.
**Why:** Establishes raw engine throughput without signals or hooks.
**YAML:** `yaml/01-echo.yaml` (app: yamltest)

```bash
docker compose exec app npx ts-node tests/throughput/01-echo.ts 1000 10
```

**Measured:** ~300/sec sustained, 3.3ms avg on local Docker.

### 02 — Signal (Hook Pattern)

**What:** Trigger → worker → hook(pause) → done. Resume via `hotMesh.signal()`.
**Why:** Proves the hook/signal mechanism works — workflow pauses (status=1), signal resumes it (status=0).
**YAML:** `yaml/02-signal.yaml` (app: yamltest)

```bash
docker compose exec app npx ts-node tests/throughput/02-signal.ts 5
```

### 03 — Chain (Sequential Stations)

**What:** 1 worker + 3 sequential stations (escalate → wait → resolve × 3).
**Why:** Proves chained hooks resume correctly — each signal advances the workflow to the next station.
**YAML:** `yaml/03-chain.yaml` (app: yamltest)

```bash
docker compose exec app npx ts-node tests/throughput/03-chain.ts 10
```

### 04 — Factory Floor (Real Escalations)

**What:** 5 automated steps + 5 human stations + rollup = 22 activities.
Each station calls the real `escalate_and_wait` MCP tool, creating an escalation
in `lt_escalations`. Resolution via the Long Tail API sends a signal that resumes
the workflow. The resolve worker runs transactionally after the hook resumes.
**Why:** Proves the full production pattern end-to-end.
**YAML:** `yaml/04-factory.yaml` (app: longtail)

```bash
# Single workflow — watch each station
docker compose exec app npx ts-node tests/throughput/04-factory.ts 1

# Multiple workflows
docker compose exec app npx ts-node tests/throughput/04-factory.ts 10
```

**Flow per station:**
```
escalate_and_wait (MCP tool)
  → creates lt_escalations row with signal_routing { engine: "yaml", hookTopic, jobId }
  → hook pauses workflow durably

Human resolves escalation (dashboard form or API)
  → POST /api/escalations/:id/resolve
  → API reads signal_routing, detects engine=yaml
  → calls engine.signal(hookTopic, { job_id, ...resolverPayload })
  → hook resumes with human's response data

resolve worker (descendant of hook)
  → runs within workflow's transactional guarantee
  → marks station complete, continues to next station
```

## YAML Files

| File | App | Activities | Purpose |
|------|-----|-----------|---------|
| `yaml/01-echo.yaml` | yamltest | 2 | Baseline throughput |
| `yaml/02-signal.yaml` | yamltest | 4 | Single hook/signal |
| `yaml/03-chain.yaml` | yamltest | 14 | 3-station chain |
| `yaml/04-factory.yaml` | longtail | 22 | Full factory with real escalations |

## Performance Baselines (Local Docker, Mac ARM)

| Test | Rate | Avg | Notes |
|------|------|-----|-------|
| 01-echo (1K) | 303/sec | 3.3ms | Warm, single worker |
| 01-echo (100K) | 303/sec | 3.3ms | Linear scaling |
| 03-chain (10) | 10/10 pass | ~2.5s each | 500ms sleep between signals |
| 04-factory (1) | ~15s | 22 activities | 5 real escalation round-trips |

## Docker Tuning Applied

Key settings in `docker-compose.yml`:

- **Postgres:** shared_buffers=256MB, wal_buffers=16MB, synchronous_commit=off (dev)
- **Node:** --max-old-space-size=3072 --max-semi-space-size=64
