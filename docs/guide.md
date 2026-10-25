# Long Tail Developer Guide

How to build durable workflows, forms, MCP tools, and agents with this boilerplate. Each section stands alone. New here? Start with [first-workflow.md](first-workflow.md), which builds one end to end.

## Table of Contents

- [Setup](#setup)
- [Project Layout](#project-layout)
- [The Start Config](#the-start-config)
- [Creating an Activity](#creating-an-activity)
- [Creating a Workflow](#creating-a-workflow)
- [Registering a Worker](#registering-a-worker)
- [Forms](#forms)
- [Escalation Patterns](#escalation-patterns)
- [Creating an MCP Tool Server](#creating-an-mcp-tool-server)
- [Creating an Agent](#creating-an-agent)
- [IAM and Identity](#iam-and-identity)
- [Testing](#testing)
- [AWS Deployment](#aws-deployment)
- [Working with Claude Code](#working-with-claude-code)
- [Troubleshooting](#troubleshooting)

---

## Setup

```bash
git clone <repo-url> && cd long-tail-boilerplate
cp .env.example .env
npm install
docker compose up -d --build
open http://localhost:3030
```

Login: `superadmin` / `l0ngt@1l`

Docker Compose starts PostgreSQL, MinIO (S3-compatible storage), NATS (event bus), and the app. The app container mounts `src/`, `scripts/`, and `tests/` and restarts when you save.

---

## Project Layout

```
src/
  index.ts                  start(): one call, wired from config/
  config/
    database.ts             Postgres connection from env
    workers.ts              Workflow profiles and the WORKERS list
    hitl-roles.ts           Roles with their forms and list pages (code-owned)
    graph-workflows.ts      YAML (graph) workflows
    agents.ts               Scheduled and event-driven reactions
    topics.ts               Event catalog
    mcp.ts                  MCP tool server registry
    roles.ts                Role name constants
    seed.ts                 First-boot users, farm operators, knowledge lookups
    connection.ts           HotMesh connection descriptor for scripts
    index.ts                Barrel export
  workflows/<name>/         One folder per workflow:
    index.ts                  the workflow
    activities.ts             its side effects
    forms.ts                  its invoke form and role forms
    types.ts                  its contracts
  activities/               Activities shared by several workflows (image, gmail)
  mcp-servers/              MCP tool servers wrapping activities
  lib/form-values.ts        Zod helpers for dashboard-submitted payloads
tests/
  unit/                     Mirrors src/; no Docker
  integration/              End to end through the HTTP API (docker compose)
  throughput/               Load and pressure scripts, local or remote
  helpers/                  Shared test helpers (form validation, remote target)
scripts/                    seed, token, and AWS ops helpers (aws-health, aws-stats)
deploy/                     AWS CDK app and deployment guide
docs/                       This guide and the first-workflow walkthrough
```

---

## The Start Config

`src/index.ts` calls `start()` once. Each key comes from one module in `src/config/`, so to find where something is declared, find its key:

```typescript
const lt = await start({
  database: DB_CONFIG,                                  // config/database.ts
  server: isWorker ? { enabled: false } : { port: 3030 },
  auth: { secret: process.env.JWT_SECRET, oauthServer: { ... } },  // OAuth for MCP clients
  workers: isApi ? READONLY_OBSERVERS : WORKERS,         // config/workers.ts
  graphWorkflows: GRAPH_WORKFLOWS,                       // config/graph-workflows.ts
  roles: HITL_ROLES,                                     // config/hitl-roles.ts
  agents: AGENTS,                                        // config/agents.ts
  topics: TOPICS,                                        // config/topics.ts
  mcp: { serverFactories: MCP_SERVER_FACTORIES },        // config/mcp.ts
  escalation: { strategy: 'mcp' },
  events: { nats: { url, wsProxy, token } },             // live dashboard updates
});
```

`APP_ROLE` splits the same image into two services on AWS: `api` serves the dashboard, REST, and `/mcp`, and runs read-only observers of the workers; `worker` runs the workflows. Unset (local), one process does both.

**Who owns a declaration.** By default each declaration is written once, on first boot, and the database owns it afterward (admins edit it in the dashboard). Add `reset: true` to an entry to make code own it: every boot compares it and applies changes, and a changed role form becomes that role's next version. This repo marks the workflows and roles it actively maintains as `reset: true`, so local and AWS converge on deploy.

---

## Creating an Activity

An activity is an async function that runs as a checkpointed step. If the process crashes after it completes, the recorded result is reused instead of running it again. Anything non-deterministic (network, time, randomness) belongs in an activity.

```typescript
// src/workflows/my-workflow/activities.ts
export async function fetchPrice(input: { symbol: string }) {
  const res = await fetch(`https://api.example.com/price/${input.symbol}`);
  const data = await res.json();
  return { symbol: input.symbol, price: data.price };
}
```

- One operation per function, typed input and output, no global state.
- Shared across workflows: `src/activities/`. Specific to one: the workflow's folder.

---

## Creating a Workflow

A workflow receives an `LTEnvelope` and returns a result. Its code must be deterministic: it replays from the checkpoints, so all side effects go through activities.

```typescript
// src/workflows/my-workflow/index.ts
import { Durable } from '@hotmeshio/hotmesh';
import type { LTEnvelope } from '@hotmeshio/long-tail';
import * as activities from './activities';

const { fetchPrice } = Durable.workflow.proxyActivities<typeof activities>({ activities });

export async function priceWorkflow(envelope: LTEnvelope) {
  const result = await fetchPrice({ symbol: envelope.data.symbol });
  return { type: 'return' as const, data: result };
}
```

- The exported function name is the workflow type you invoke.
- `envelope.data` is the input; identity rides along for activities.
- `Durable.workflow.sleep('5 minutes')` pauses durably; `conditional(...)` waits for a person (see [Escalation Patterns](#escalation-patterns)).

---

## Registering a Worker

Add a profile and a `WORKERS` entry in `src/config/workers.ts`:

```typescript
import * as myWorkflow from '../workflows/my-workflow';
import { MY_INPUT_SCHEMA } from '../workflows/my-workflow/forms';

const myWorkflowConfig: LTWorkerConfig = {
  description: 'Price lookup: fetches the current price for a symbol.',
  invocable: true,                     // dashboard, API, and MCP may start it
  invocationRoles: INVOCATION_ROLES,   // who may start it
  icon: WORKFLOW_ICONS.GAUGE,          // shown on the Invoke Tool page
  envelopeSchema: { data: {}, metadata: DASHBOARD_METADATA },
  inputSchema: MY_INPUT_SCHEMA,        // the invoke form, enforced by the API (422)
  reset: true,                         // code-owned profile
};

export const WORKERS: LTStartConfig['workers'] = [
  // ...existing workers...
  { taskQueue: 'default', workflow: myWorkflow.priceWorkflow, config: myWorkflowConfig },
];
```

Save and the app restarts. The workflow appears on the Invoke Tool page and at `POST /api/workflows/priceWorkflow/invoke`.

---

## Forms

Forms are JSON Schema plus Long Tail's `x-lt-*` keywords, and they are data: the dashboard renders them and the server validates against them with the same code. There are two kinds:

| Form | Lives on | Declared in | Validated by |
|---|---|---|---|
| **Invoke form** | A workflow profile (`inputSchema`) | `config/workers.ts` | The invoke API, MCP `invoke_workflow` |
| **Escalation form** | A role (`form_schema`), versioned | `config/hitl-roles.ts` | Every resolve surface when the role sets `enforce_schema` |

A role can also own a `list_schema` that turns its queue into a custom table (columns, row actions, a look-ahead into other roles).

Write forms in the workflow's `forms.ts`. Habits that make them work well:

- One decision field (`x-lt-options`) gates the rest, and `x-lt-showIf: "resolver.decision=..."` reveals only what that answer needs.
- Facts the person reads but doesn't edit are `readOnly`; `x-lt-section-options` with `display: "dictionary"` lays them out compactly.
- `x-lt-bind` maps flat form fields to the nested payload the workflow consumes; declare that payload once in zod and parse it in an activity (`parseFormPayload` in `src/lib/form-values.ts`).
- The dashboard submits hidden and untouched fields as blanks, so optional fields in the zod contract use `blankAsAbsent`.
- Test forms with `violationsOf` from `tests/helpers/form-validation.ts`: it is the same validator the dashboard and server run.

Working examples: `src/workflows/rich-form/` and `src/workflows/lot-inspection/` (summary in its README). The full keyword reference ships with Long Tail in `node_modules/@hotmeshio/long-tail/docs/hitl-guide.md`.

---

## Escalation Patterns

### `conditional` (the default)

One call writes the escalation and suspends the workflow until it is resolved:

```typescript
import { conditional } from '@hotmeshio/long-tail';

const review = await conditional<FarewellReview>(`goodbye-${ctx.workflowId}`, {
  role: 'farewell-reviewer',                 // whose queue it lands in; the role owns the form
  description: `Goodbye to ${name}`,         // the queue's headline
  metadata: { name },                        // searchable facets
  envelope: { formDefaults: { message } },   // prefills the form
  timeout: '48h',                            // optional SLA
});
if (review === null) { /* cancelled */ }
if (review === false) { /* the timeout fired */ }
```

Options worth knowing: `schemaVersion` pins one edition of the role's form; `lookups` attach versioned knowledge lists the form reads; `batch` and `accumulate` turn one row into a container that fills over time. Some older examples call `conditionLT`, a deprecated alias of `conditional`.

### Return-based (certified workflows)

A workflow whose profile has `certified: true` and `roles` can return `type: 'escalation'`. The platform creates the row, and when someone resolves it, runs the workflow again with `envelope.resolver` set:

```typescript
if (envelope.resolver) return { type: 'return' as const, data: envelope.resolver };
if (analysis.confidence < threshold) {
  return { type: 'escalation' as const, role: 'content-moderator', message: 'Moderate this', data: analysis };
}
```

See `src/workflows/content-review/`.

### Parent and child stations

`src/workflows/assembly-line/` runs stations as child workflows, each waiting on its own escalation:

| Variant | File | Behavior |
|---|---|---|
| **Assembly Line** | `index.ts` | Sequential stations, named roles |
| **Step Iterator** | `iterator.ts` | Same pattern, driven by a `steps[]` array |
| **Reverter** | `reverter.ts` | A station can reject and send work back |

---

## Creating an MCP Tool Server

Any activity can be exposed as an MCP tool, available to agents, the Pipeline Designer, and MCP clients at `/mcp`.

```typescript
// src/mcp-servers/my-tools.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerMcpTool } from '@hotmeshio/long-tail';
import { fetchPrice } from '../workflows/my-workflow/activities';

export function createMyToolsServer(): McpServer {
  const server = new McpServer({ name: 'my-tools', version: '1.0.0' });
  registerMcpTool(server,
    'fetch_price',
    'Fetch the current price for a stock symbol.',
    { symbol: z.string().describe('Stock ticker symbol') },
    async (args: any) => ({
      content: [{ type: 'text', text: JSON.stringify(await fetchPrice(args)) }],
    }),
  );
  return server;
}
```

Use `registerMcpTool` rather than `server.tool()`: the SDK's `.tool()` generics can exhaust the TypeScript compiler.

Register it in `src/config/mcp.ts`. The `config` is shown in the dashboard; a `toolManifest` lists the tools before the server first connects:

```typescript
export const MCP_SERVER_FACTORIES = {
  // ...existing servers...
  'my-tools': {
    factory: createMyToolsServer,
    config: { description: 'Price tools', tags: ['finance'], category: 'Data' },
  },
};
```

---

## Creating an Agent

Agents run workflows on a schedule or in reaction to events. Declare them in `src/config/agents.ts`:

```typescript
export const AGENTS: LTAgentConfig[] = [
  {
    name: 'my-agent',
    description: 'What this agent does',
    goals: 'What it tries to achieve',
    rules: 'Constraints on its behavior',
    status: 'active',
    knowledge_domain: 'my-domain',
    schedules: [
      { cron: '*/15 * * * *', workflow_type: 'priceWorkflow', execute_as: 'superadmin' },
    ],
    subscriptions: [
      {
        topic: 'price.updated',
        reaction_type: 'durable',
        workflow_type: 'priceWorkflow',
        execute_as: 'superadmin',
        input_mapping: { data: { symbol: '{event.data.symbol}' } },
      },
    ],
  },
];
```

`execute_as` must be allowed to invoke the workflow; the check runs each time the agent fires. The boilerplate includes two agents: **health-monitor** (runs `helloWorkflow` every 15 minutes and on failure events) and **event-coordinator** (routes `app.>` and `knowledge.stored` events).

---

## IAM and Identity

Every run carries the identity that started it. Activities can read it:

```typescript
import { getActivityIdentity } from '@hotmeshio/long-tail';

export async function myActivity(input: unknown) {
  const { principal } = getActivityIdentity();
  console.log(principal.id, principal.roles);
}
```

Role names live in `src/config/roles.ts`. A profile's `invocationRoles` controls who may start a workflow; a role's members (and superadmins) claim and resolve its escalations.

---

## Testing

### Unit tests

Fast, mocked, no Docker. They mirror `src/` under `tests/unit/`:

```bash
npm test                                  # all unit tests
npm run test:watch                        # watch mode
npx vitest run tests/unit/workflows/rich-form
```

### Integration tests

End to end through the HTTP API, against the running stack:

```bash
docker compose exec app npm run test:integration    # expect: 34 passed, 7 skipped
docker compose exec app npm run test:nats           # cross-container event delivery
```

After `docker compose down -v`, run `docker compose exec app npm run seed` first.

### Throughput and pressure tests

```bash
docker compose exec app npm run test:factory:1      # YAML engine smoke test
docker compose exec app npm run test:assembly:1     # durable engine smoke test
docker compose exec app npm run test:factory:100    # sustained load
```

Every `*:remote:*` script runs the same test against a deployed app. Put `LT_REMOTE_URL` and `REMOTE_PASSWORD` in your `.env`, then run from your machine:

```bash
npm run test:remote:assembly:10
```

See [tests/throughput/README.md](../tests/throughput/README.md) for the full list.

---

## AWS Deployment

`deploy/cdk/` deploys the app to AWS: VPC, Aurora PostgreSQL Serverless v2, S3, ECS Fargate (api, worker, NATS), and an HTTPS load balancer with AWS WAF. Your domain comes from the environment; nothing in the repo names a deployment.

```bash
export LT_HOSTED_ZONE_DOMAIN=example.com LT_SUBDOMAIN=app
npm run aws:deploy        # rebuild and deploy the Compute stack from your machine
npm run aws:health        # health check (reads the URL from the stack)
npm run aws:services      # ECS service status
npm run aws:logs:api      # tail API logs
npm run aws:stats         # load, database, and service summary
```

With CI set up, release instead: `npm run release:patch` (or `release:minor`) bumps the version and pushes a tag, and GitHub Actions deploys and runs smoke tests. See [deploy/README.md](../deploy/README.md) for the first deploy and the secrets CI needs.

---

## Working with Claude Code

### Connect it to the app

The app is an MCP server with OAuth sign-in:

```bash
claude mcp add --transport http long-tail-local http://localhost:3030/mcp
claude mcp add --transport http long-tail-aws https://app.example.com/mcp
```

Run `/mcp` and sign in. Claude acts as you, under your roles: it can invoke workflows, read and resolve escalations (forms are enforced), and inspect runs. Disconnect it any time from **Connected apps** in the dashboard's user menu.

### The loop

1. **Describe** the workflow: inputs, outputs, business rules, and who decides what.
2. **Author**: Claude writes the activities, the workflow, the forms, and the tests.
3. **Check**: `npm run typecheck` and `npm test`.
4. **Try it** through MCP: invoke it, work its escalations, read the result.

Be explicit about types and name the edge cases; test expectations double as a specification.

---

## Troubleshooting

### A port is already taken

Another project holds 4222, 5416, or similar. Set the host port in `.env` (`NATS_PORT=4224`, `PG_PORT=5426`, `PORT=3040`, ...) and run `docker compose up -d` again.

### The app can't reach the database

Inside Docker the app uses `postgres:5432`; `POSTGRES_HOST`/`POSTGRES_PORT` in `.env` are for processes on your machine. For an external database, set `DOCKER_POSTGRES_HOST` and `DOCKER_POSTGRES_PORT` (see `.env.example`).

### The dashboard says live updates are off

The browser reconnects automatically, and a tab in the background waits until it is visible again. If a visible tab stays disconnected, refresh it; check that the `nats` container is healthy (`docker compose ps`).

### `tsc` runs out of memory

Use `registerMcpTool` instead of `McpServer.tool()`.

### Full reset

```bash
docker compose down -v
docker compose up -d --build
docker compose exec app npm run seed
```
