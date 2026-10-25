# Long Tail Boilerplate

A starter project for [Long Tail](https://github.com/hotmeshio/long-tail): durable workflows with IAM, human-in-the-loop forms, MCP tools, agents, and a built-in dashboard, all backed by PostgreSQL.

Pick a path:

| I want to... | Go to |
|---|---|
| Run it on my machine and click around | [Try it locally](#try-it-locally) (about 5 minutes) |
| Write my own workflow | [docs/first-workflow.md](docs/first-workflow.md) (a guided `goodbyeWorld`) |
| Understand how the project is organized | [How the project is organized](#how-the-project-is-organized), then [docs/guide.md](docs/guide.md) |
| Run it on AWS | [Deploy to AWS](#deploy-to-aws), then [deploy/README.md](deploy/README.md) |

## Try it locally

**You need:** Docker (with Compose) and Node 22+.

```bash
git clone https://github.com/hotmeshio/long-tail-boilerplate.git
cd long-tail-boilerplate
cp .env.example .env
npm install
docker compose up -d --build
```

Open [localhost:3030](http://localhost:3030) and sign in as `superadmin` / `l0ngt@1l`. The first build takes a few minutes; the app is ready when `curl localhost:3030/health` answers.

| Running | Where |
|---|---|
| Dashboard, REST API, MCP endpoint | [localhost:3030](http://localhost:3030), `/api`, `/mcp` |
| PostgreSQL | `localhost:5416` (user `postgres`, password `password`, db `myapp`) |
| NATS (event bus) | `localhost:4222`, WebSocket `9222` |
| MinIO console (S3-compatible files) | [localhost:9003](http://localhost:9003) (`minioadmin` / `minioadmin`) |

Port already taken by another project? Set `PORT`, `PG_PORT`, `NATS_PORT`, `NATS_WS_PORT`, `MINIO_PORT`, or `MINIO_CONSOLE_PORT` in `.env` (see `.env.example`). If you change `PORT`, set `LT_OAUTH_ISSUER` to the same address.

### Things to try first

1. **Invoke Tool → Hello Workflow → Submit.** The run sleeps, greets you, and shows the identity it ran as.
2. **Invoke Tool → Rich Form → Submit**, then open **Intake Reviewer** under escalations (`/escalations/available?role=intake-reviewer`). Claim it: the form is prefilled from what you submitted, and picking a decision reveals only the fields that decision needs.
3. **Invoke Tool → Lot Inspection** twice with the same part family. Receive one lot at `/escalations/available?role=lot-receiver`; the inspector's queue (`?role=lot-inspector`) shows the other one under **Arriving**.

### Connect Claude Code (optional)

The app is an MCP server with OAuth sign-in, so no keys go in config files:

```bash
claude mcp add --transport http long-tail-local http://localhost:3030/mcp
```

Run `/mcp` in Claude Code and sign in in the browser window it opens. Claude can then list roles, invoke workflows, and work escalations as you.

## Example workflows

| Workflow | Shows | Location |
|---|---|---|
| **Start here** | | |
| `helloWorkflow` | Durable sleep, one activity, IAM identity, an invoke form | `src/workflows/hello-world/` |
| `hello_world` (graph) | The same idea as a HotMesh YAML graph | `src/config/graph-workflows.ts` |
| **Human-in-the-loop forms** | | |
| `richForm` | Role-owned versioned form, invoke form that prefills it, decision-gated fields | `src/workflows/rich-form/` |
| `lotInspection` | Two stations, knowledge lookups, cascading selects, dynamic bounds, signature, list page with look-ahead | `src/workflows/lot-inspection/` |
| `reviewContent` | Confidence-based escalation from a certified workflow | `src/workflows/content-review/` |
| `taskWorkflow` | One durable instance per task with an SLA timer | `src/workflows/task-queue/` |
| **Orchestration** | | |
| `assemblyLine`, `stepIterator`, `reverter` | Parent and child workflows, sequential stations, send work back | `src/workflows/assembly-line/` |
| `screenshotResearch` | Playwright capture, vision LLM, knowledge store | `src/workflows/screenshot-research/` |
| **Simulations and pressure tests** | | |
| `pipeline` (ortho), `printShift`, `bambuPrinter`, `pullDemand`, `proofDirector` | Multi-station factories, fleets, contention, and lifecycle proofs | `src/workflows/{ortho-pipeline,print-routing,bambu-farm,pull-farm,lifecycle-proof}/` |

The HITL forms are summarized in [src/workflows/lot-inspection/README.md](src/workflows/lot-inspection/README.md).

## How the project is organized

`src/index.ts` calls Long Tail's `start()` once. Every key of that start config comes from one module in `src/config/`, so finding where something is declared means finding its key:

| Start config key | Declared in | What it holds |
|---|---|---|
| `database` | `config/database.ts` | Postgres connection from env |
| `workers` | `config/workers.ts` | Each workflow and its profile: invoke form, roles, icon |
| `roles` | `config/hitl-roles.ts` | Roles with their escalation forms and list pages |
| `graphWorkflows` | `config/graph-workflows.ts` | YAML (graph) workflows |
| `agents` | `config/agents.ts` | Scheduled and event-driven reactions |
| `topics` | `config/topics.ts` | The event catalog |
| `mcp.serverFactories` | `config/mcp.ts` | MCP tool servers |
| `auth`, `events`, `escalation` | `src/index.ts` | Sign-in, OAuth for MCP, NATS, escalation strategy |

Each workflow lives in its own folder under `src/workflows/`: `index.ts` (the workflow), `activities.ts` (its side effects), `forms.ts` (its invoke form and any role forms), and `types.ts`. Unit tests mirror `src/` under `tests/unit/`.

```
src/
  index.ts           start(): one call, wired from config/
  config/            one module per start-config key (table above), plus seed.ts and roles.ts
  workflows/         one folder per workflow
  activities/        activities shared by several workflows (image, gmail)
  mcp-servers/       MCP tool servers that wrap activities
  lib/               small shared helpers
tests/
  unit/              mirrors src/, no Docker needed
  integration/       end to end through the HTTP API (needs docker compose)
  throughput/        load and pressure scripts, local or remote
deploy/              AWS CDK app and deployment guide
```

## Commands

```bash
docker compose up -d --build          # start everything (app hot-reloads src/)
docker compose down -v                # full reset: deletes the database and files
npm run typecheck                     # type-check
npm test                              # unit tests
docker compose exec app npm run test:integration   # integration tests
docker compose exec app npm run seed  # reseed users after a reset
```

## Deploy to AWS

`deploy/cdk/` is a CDK app: VPC, Aurora PostgreSQL Serverless v2, S3, ECS Fargate (separate api and worker services, plus NATS), an HTTPS load balancer with AWS WAF, and GitHub Actions deploys through OIDC. Nothing in the repo names a deployment: you supply your domain through environment variables locally and repository secrets in CI.

```bash
export LT_HOSTED_ZONE_DOMAIN=example.com LT_SUBDOMAIN=app   # your Route 53 zone
cd deploy/cdk && npm ci && npx cdk deploy --all
```

Read [deploy/README.md](deploy/README.md) before the first deploy: it covers prerequisites, the API keys to set, the GitHub secrets for CI, and the login throttle.

## Learn more

- [docs/first-workflow.md](docs/first-workflow.md): build `goodbyeWorld`, then put a person in the loop
- [docs/guide.md](docs/guide.md): activities, workflows, forms, MCP tools, agents, testing
- [deploy/README.md](deploy/README.md): local stack details and AWS deployment
- [tests/throughput/README.md](tests/throughput/README.md): load tests, local and remote
- Long Tail's own docs ship with the package under `node_modules/@hotmeshio/long-tail/docs/` (start with `hitl-guide.md`)
