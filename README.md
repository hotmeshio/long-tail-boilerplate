# Long Tail Boilerplate

A starter project for [Long Tail](https://github.com/hotmeshio/long-tail) — durable workflows with IAM, escalations, MCP tools, agents, and a built-in dashboard, all backed by PostgreSQL.

Clone, start Docker, and open the dashboard. Four example workflows show the patterns you'll use in production: simple activities, confidence-based escalation, browser automation, and human-in-the-loop assembly lines.

## Quick Start

```bash
git clone https://github.com/hotmeshio/long-tail-boilerplate.git
cd long-tail-boilerplate
cp .env.example .env
npm install

docker compose up -d --build

open http://localhost:3030
```

Login: `superadmin` / `l0ngt@1l`

## What You Get

| Component | URL |
|-----------|-----|
| Dashboard | [localhost:3030](http://localhost:3030) |
| REST API | [localhost:3030/api](http://localhost:3030/api) |
| MinIO Console | [localhost:9003](http://localhost:9003) |
| PostgreSQL | localhost:5416 |

## Example Workflows

| Workflow | Pattern | Location |
|----------|---------|----------|
| **Hello World** | Timer + activity + IAM context | `src/workflows/hello-world/` |
| **Content Review** | Confidence-based human escalation | `src/workflows/content-review/` |
| **Screenshot Research** | Multi-step pipeline (Playwright + Vision LLM) | `src/workflows/screenshot-research/` |
| **Assembly Line** | Human-in-the-loop with parent-child orchestration | `src/workflows/assembly-line/` |

## Project Structure

```
src/
  index.ts              Entry point — orchestrates startup
  config/               Roles, database, workers, agents, MCP servers
  activities/           Standalone activity functions (image, gmail)
  mcp-servers/          MCP tool servers wrapping activities
  workflows/            One directory per workflow (code + activities)
```

## User Guide

See **[docs/guide.md](docs/guide.md)** for the full walkthrough:

- Creating activities, workflows, and MCP tools
- Defining agents with schedules and subscriptions
- Escalation patterns (return-based and signal-based)
- Testing (unit, integration, throughput)
- AWS deployment
- Working with Claude Code

## Commands

```bash
docker compose up -d --build       # Start everything
docker compose down -v             # Full reset (deletes data)
npm run dev                        # Dev server with HMR
npm test                           # Unit tests
npm run test:integration           # Integration tests (requires docker)
npm run typecheck                  # Type-check only
```

## Configuration

All options live in `.env`. See `.env.example` for the full list with defaults.

Key variables: `PORT`, `POSTGRES_HOST`, `JWT_SECRET`, `NATS_URL`, `ANTHROPIC_API_KEY`.
