# Long Tail Developer Guide

How to build durable workflows, MCP tools, and agents with this boilerplate. Each section stands alone — jump to what you need.

## Table of Contents

- [Setup](#setup)
- [Project Layout](#project-layout)
- [How index.ts Works](#how-indexts-works)
- [Creating an Activity](#creating-an-activity)
- [Creating a Workflow](#creating-a-workflow)
- [Registering a Worker](#registering-a-worker)
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

Docker Compose starts PostgreSQL, MinIO (S3-compatible storage), NATS (event bus), and the app with hot module reloading.

---

## Project Layout

```
src/
  index.ts                          Entry point — starts Long Tail
  config/
    roles.ts                        Role constants (reviewer, engineer, admin, superadmin)
    database.ts                     PostgreSQL connection config
    workers.ts                      Workflow configs and worker list
    agents.ts                       Agent definitions (schedules, subscriptions)
    mcp.ts                          MCP server factory registry
    seed.ts                         Database seeding logic
    index.ts                        Barrel export
  activities/
    image.ts                        Image processing (12 sharp operations)
    gmail.ts                        Gmail API (search, read, draft)
  mcp-servers/
    image-tools.ts                  MCP server wrapping image activities
    gmail.ts                        MCP server wrapping Gmail activities
  workflows/
    hello-world/                    Minimal: timer + activity
    content-review/                 Confidence-based human escalation
    screenshot-research/            Pipeline: screenshot + vision LLM + knowledge store
    assembly-line/                  Human-in-the-loop orchestration
      index.ts                        Parent orchestrator (sequential stations)
      worker.ts                       Child workflow (single workstation)
      iterator.ts                     Data-driven loop variant
      reverter.ts                     Loop with revert-on-rejection
      types.ts                        Station interfaces
      activities.ts                   Escalation + signal routing
tests/
  integration/                      End-to-end tests (requires docker compose)
  throughput/                       Load and benchmark tests
scripts/
  seed.ts                           Create admin account
  token.ts                          Generate JWT for API testing
docs/
  guide.md                          This file
```

---

## How index.ts Works

The entry point is intentionally short. It imports configuration from `src/config/` and passes it to Long Tail's `start()` function:

```typescript
import { start } from '@hotmeshio/long-tail';
import { DB_CONFIG, WORKERS, AGENTS, MCP_SERVER_FACTORIES } from './config';

const lt = await start({
  database: DB_CONFIG,       // where to store workflow state
  server: { port: 3030 },   // dashboard + REST API
  workers: WORKERS,          // which workflows to run
  agents: AGENTS,            // autonomous agents
  mcp: { serverFactories: MCP_SERVER_FACTORIES },
});
```

All the detail — workflow configs, role definitions, agent subscriptions — lives in `src/config/`. The entry point reads like a recipe: connect to database, start server, register workers, register agents, wire up MCP tools.

---

## Creating an Activity

An activity is an async function. It runs as a checkpointed step inside a workflow — if the process crashes, the activity won't re-run if it already completed.

```typescript
// src/workflows/my-workflow/activities.ts

export async function fetchPrice(input: { symbol: string }) {
  const res = await fetch(`https://api.example.com/price/${input.symbol}`);
  const data = await res.json();
  return { symbol: input.symbol, price: data.price };
}
```

Rules:
- One operation per function
- Typed inputs and outputs
- No global state — everything comes through the input parameter
- Activities that are shared across workflows go in `src/activities/`
- Activities specific to one workflow go in that workflow's directory

---

## Creating a Workflow

A workflow is an async function that receives an `LTEnvelope` and returns a result. Every step is checkpointed to PostgreSQL.

```typescript
// src/workflows/my-workflow/index.ts

import { Durable } from '@hotmeshio/hotmesh';
import type { LTEnvelope } from '@hotmeshio/long-tail';
import * as activities from './activities';

const { fetchPrice } = Durable.workflow.proxyActivities<typeof activities>({
  activities,
});

export async function priceWorkflow(envelope: LTEnvelope) {
  const result = await fetchPrice({ symbol: envelope.data.symbol });
  return { type: 'return' as const, data: result };
}
```

Key points:
- `proxyActivities` wraps functions so each call is checkpointed and durable
- The envelope carries input data (`envelope.data`) and identity context
- Return `{ type: 'return', data }` for normal completion
- Return `{ type: 'escalation', ... }` to pause and create a human task (see [Escalation Patterns](#escalation-patterns))

---

## Registering a Worker

Add your workflow to `src/config/workers.ts`:

```typescript
import * as myWorkflow from '../workflows/my-workflow';

const myWorkflowConfig: LTWorkerConfig = {
  description: 'Price lookup — fetches current stock prices',
  invocable: true,                        // can be triggered from dashboard/API
  invocationRoles: INVOCATION_ROLES,      // who can trigger it
  envelopeSchema: {                       // example input shown in dashboard
    data: { symbol: 'AAPL' },
    metadata: { source: 'dashboard' },
  },
};
```

Then add it to the `WORKERS` array:

```typescript
export const WORKERS: LTStartConfig['workers'] = [
  // ...existing workers...
  { taskQueue: 'default', workflow: myWorkflow.priceWorkflow, config: myWorkflowConfig },
];
```

Rebuild: `docker compose up -d --build`

The workflow now appears in the dashboard and is callable via the REST API.

---

## Escalation Patterns

### Simple (return-based)

Return `type: 'escalation'` to pause the workflow and create a human task. The dashboard shows it in the assigned role's queue. When resolved, the workflow resumes with the resolver's response.

```typescript
if (analysis.confidence < 0.7) {
  return {
    type: 'escalation' as const,
    role: 'reviewer',
    message: `Low confidence (${analysis.confidence}). Needs human review.`,
    data: { contentId, analysis },
  };
}
```

See `src/workflows/content-review/` for a working example.

### Advanced (signal-based)

For multi-step human-in-the-loop flows, use `startChild` + `condition` + `signal`:

```typescript
// Parent: spawn child and wait for its signal
await Durable.workflow.startChild({
  workflowName: 'workstation',
  args: [{ stationName, signalId, role }],
});
const result = await Durable.workflow.condition(signalId);

// Child: create escalation, wait for human, signal parent
await createStationEscalation({ signalId, role, instructions });
const resolution = await Durable.workflow.condition(localSignalId);
await signalParent({ parentWorkflowId, signalId, data: resolution });
```

The assembly line directory has three variants of this pattern:

| Variant | File | Behavior |
|---------|------|----------|
| **Assembly Line** | `index.ts` | Sequential stations, named roles |
| **Step Iterator** | `iterator.ts` | Same pattern, data-driven from `steps[]` array |
| **Reverter** | `reverter.ts` | Humans can reject and send work backwards N steps |

---

## Creating an MCP Tool Server

Any activity can be exposed as an MCP tool, making it discoverable by the Pipeline Designer.

### 1. Create the server

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

Use `registerMcpTool` instead of `server.tool()` — the MCP SDK's `.tool()` method has deeply nested Zod generic types that cause the TypeScript compiler to run out of memory.

### 2. Register the server

Add it to `src/config/mcp.ts`:

```typescript
import { createMyToolsServer } from '../mcp-servers/my-tools';

export const MCP_SERVER_FACTORIES = {
  // ...existing servers...
  'my-tools': { factory: createMyToolsServer, config: MY_TOOLS_CONFIG },
};
```

---

## Creating an Agent

Agents are autonomous actors that react to events and run on schedules. Define them in `src/config/agents.ts`:

```typescript
export const AGENTS: LTAgentConfig[] = [
  {
    name: 'my-agent',
    description: 'What this agent does',
    goals: 'What it tries to achieve',
    rules: 'Constraints on its behavior',
    status: 'active',
    knowledge_domain: 'my-domain',

    // Run a workflow on a cron schedule
    schedules: [
      {
        cron: '*/15 * * * *',               // every 15 minutes
        workflow_type: 'priceWorkflow',      // which workflow to run
        execute_as: 'superadmin',            // identity context
      },
    ],

    // React to events by running workflows
    subscriptions: [
      {
        topic: 'price.updated',             // NATS subject pattern
        reaction_type: 'durable',           // checkpoint the reaction
        workflow_type: 'priceWorkflow',
        execute_as: 'superadmin',
        input_mapping: {                    // map event fields to workflow input
          data: { symbol: '{event.data.symbol}' },
        },
      },
    ],
  },
];
```

The boilerplate includes two example agents:

- **health-monitor** — runs `helloWorkflow` every 15 minutes and reacts to `workflow.failed` and `activity.failed` events
- **event-coordinator** — routes `app.>` wildcard events and `knowledge.stored` events to workflows

---

## IAM and Identity

Every workflow carries identity context. Activities can inspect who invoked the workflow:

```typescript
import { getActivityIdentity } from '@hotmeshio/long-tail';

export async function myActivity(input: any) {
  const identity = getActivityIdentity();
  console.log(identity.principal.id);     // who is executing
  console.log(identity.principal.roles);  // their roles
}
```

Roles are defined in `src/config/roles.ts`. Worker configs specify which roles can invoke a workflow (`invocationRoles`) and which roles participate in escalations (`roles`, `defaultRole`).

---

## Testing

### Unit Tests

Fast, mocked, no Docker required:

```bash
npm test                                  # all unit tests
npm run test:watch                        # watch mode
npx vitest run path/to/test.ts            # single file
```

### Integration Tests

End-to-end through the HTTP API. Requires Docker Compose running:

```bash
docker compose exec app npm run test:integration
```

The integration suite walks through full escalation lifecycles: registers configs, invokes workflows, polls for pending escalations by role, claims and resolves each one, and verifies workflows complete with expected results.

### NATS Event Tests

Verifies cross-container event delivery:

```bash
docker compose exec app npm run test:nats
```

### Throughput Tests

Sustained load tests simulating concurrent traffic:

```bash
# YAML engine (compiled graph)
docker compose exec app npm run test:factory:1        # smoke test
docker compose exec app npm run test:factory:100      # sustained load

# Durable engine (TypeScript parent-child)
docker compose exec app npm run test:assembly:1       # smoke test
docker compose exec app npm run test:assembly:100     # sustained load
```

### Remote Throughput Tests

Same tests targeting production AWS. Run from your Mac (not Docker). Set `REMOTE_PASSWORD` in `.env`:

```bash
npm run test:remote:factory:100
npm run test:remote:assembly:100
```

---

## AWS Deployment

The `deploy/` directory contains full AWS infrastructure as CDK stacks:

- VPC, subnets, security groups
- RDS PostgreSQL + S3
- ECS Fargate (separate API and worker services)
- ALB with HTTPS + Route 53 DNS
- GitHub Actions CI/CD via OIDC

```bash
npm run aws:deploy                        # build and deploy via CDK
npm run aws:health                        # health check
npm run aws:services                      # service status
npm run aws:logs:api                      # tail API logs
npm run aws:logs:worker                   # tail worker logs
```

See [deploy/README.md](../deploy/README.md) for the step-by-step deployment guide.

---

## Working with Claude Code

This project is designed for iterative development with Claude Code.

### The Loop

1. **Describe** — Tell Claude what workflow you need. Be specific about inputs, outputs, and business rules.
2. **Author** — Claude writes the activity functions, the workflow, and the tests.
3. **Type-check** — Claude runs `npm run typecheck`.
4. **Test** — Claude runs `npm test`.
5. **Fix** — If anything fails, Claude fixes it and re-runs.

### Tips

- **Be explicit about types.** "The input has a `url` string and optional `timeout` number" beats "it takes a URL."
- **Name your edge cases.** "What happens when the URL returns a 404?" prompts Claude to handle and test it.
- **Ask for tests first.** Test expectations double as a specification.
- **Run the watch loop.** Use `npm run test:watch` in a terminal — Claude sees the output and self-corrects.

---

## Troubleshooting

### `tsc` runs out of memory

Use `registerMcpTool` from `@hotmeshio/long-tail` instead of `McpServer.tool()`. The MCP SDK's `.tool()` has deeply nested Zod generics that exhaust the compiler.

### Tests fail with "Cannot find module"

Run `npm install` — a dependency may be missing after switching branches.

### Server won't start

Check Docker: `docker compose ps`. PostgreSQL needs to be healthy before the app can connect.

### Full reset

```bash
docker compose down -v
docker compose up -d --build
docker compose exec app npm run seed
```
