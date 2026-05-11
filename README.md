# Long Tail Boilerplate

A working example site for [Long Tail](https://github.com/hotmeshio/long-tail) -- durable workflows with IAM, escalations, MCP tools, and a built-in dashboard, all backed by PostgreSQL.

Clone this repo and start building. Every workflow demonstrates a pattern you'll use in production: simple activities, confidence-based escalation, browser automation, human-in-the-loop assembly lines, and YAML-compiled execution graphs. The throughput tests prove these patterns at scale, and the CDK stacks deploy everything to AWS.

## Table of Contents

- [Quick Start](#quick-start)
- [What's Included](#whats-included)
- [Example Workflows](#example-workflows)
  - [Hello World](#hello-world)
  - [Content Review](#content-review)
  - [Screenshot Research](#screenshot-research)
  - [Assembly Line](#assembly-line)
- [Testing](#testing)
  - [Unit Tests](#unit-tests)
  - [Integration Tests](#integration-tests)
  - [Throughput Tests (Local)](#throughput-tests-local)
  - [Throughput Tests (Remote)](#throughput-tests-remote)
- [AWS Operations](#aws-operations)
- [AWS Deployment](#aws-deployment)
- [Project Structure](#project-structure)
- [Adding Your Own Workflow](#adding-your-own-workflow)
- [Escalation Patterns](#escalation-patterns)
- [IAM](#iam)
- [Custom MCP Servers](#custom-mcp-servers)
- [Configuration](#configuration)
- [Full Reset](#full-reset)

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/hotmeshio/long-tail-boilerplate.git
cd long-tail-boilerplate
cp .env.example .env
npm install

# 2. Start everything (Postgres + MinIO + NATS + app with HMR)
docker compose up -d --build

# 3. Seed users and roles
docker compose exec app npm run seed

# 4. Open the dashboard
open http://localhost:3030
```

Login: `superadmin` / `l0ngt@1l`

## What's Included

| Component | URL | Description |
|-----------|-----|-------------|
| Dashboard | [localhost:3030](http://localhost:3030) | Workflow registry, execution timeline, escalation queues |
| REST API | [localhost:3030/api](http://localhost:3030/api) | Invoke workflows, manage escalations, query results |
| Health | [localhost:3030/health](http://localhost:3030/health) | Health check endpoint |
| NATS | localhost:4222 (client), localhost:9222 (WebSocket) | Real-time event bus for cross-container event delivery |
| MinIO Console | [localhost:9003](http://localhost:9003) | S3-compatible file storage browser (minioadmin / minioadmin) |
| PostgreSQL | localhost:5416 | Workflow state, IAM, escalation records |

## Example Workflows

### Hello World

`src/workflows/hello-world/`

Minimal workflow demonstrating durable timers and proxy activities with IAM context. Good starting point for understanding the basic pattern.

```
envelope.data.name  -->  sleep  -->  greet activity  -->  return result
```

### Content Review

`src/workflows/content-review/`

Confidence-based escalation. An activity analyzes content and returns a confidence score. High confidence returns immediately; low confidence creates an escalation for a human reviewer.

```
content  -->  analyzeContent  -->  confidence >= threshold?
                                    yes --> return approved
                                    no  --> escalate to reviewer
```

### Screenshot Research

`src/workflows/screenshot-research/`

Multi-step pipeline: captures a screenshot with Playwright, analyzes it with a vision LLM, and stores the analysis in the knowledge store. Demonstrates chaining multiple activities with external service dependencies.

```
url  -->  captureScreenshot  -->  analyzeScreenshot (vision LLM)  -->  storeAnalysis  -->  return
```

### Assembly Line

`src/workflows/assembly-line/`

Three orchestrators that demonstrate human-in-the-loop (HITL) patterns using escalation APIs and durable signaling. No interceptor, no ceremony -- just raw Durable primitives.

All three reuse the same **workstation** child workflow, which creates an escalation, pauses until a human resolves it, then signals the parent.

**Assembly Line Orchestrator** (`index.ts`) -- Sequential parent-child orchestration. A product moves through named workstations. Each station spawns a child workflow that creates an escalation for a specific role (grinder, gluer, etc.), pauses, and signals the parent when the human resolves it.

```
product  -->  [grinder station]  -->  [gluer station]  -->  return results
                   |                       |
                   v                       v
              escalation              escalation
              (pause)                 (pause)
              human resolves          human resolves
              signal parent           signal parent
```

**Step Iterator** (`iterator.ts`) -- Generic data-driven loop. Identical behavior to the assembly line, but the orchestrator knows nothing about specific stations -- it just walks a dynamic `steps[]` array. Proves the pattern is entirely data-driven.

**Reverter** (`reverter.ts`) -- Loop with revert support. Each human resolution controls flow:

- `{ approved: true }` -- advance to next step
- `{ approved: false, revertSteps: 1 }` -- go back 1 step
- `{ approved: false, revertSteps: 2 }` -- go back 2 steps

Tracks a monotonic attempt counter and full history of advances and reverts. This is the pattern for QA pipelines, multi-stage approvals, and any workflow where humans can reject and send work backwards.

## Testing

### Unit Tests

Fast, mocked, no Docker required:

```bash
npm test
```

### Integration Tests

Exercises workflows end-to-end through the HTTP API. Requires Docker Compose running with a seeded database.

```bash
docker compose exec app npm run test:integration
```

The assembly line integration test walks through the full escalation lifecycle for all three HITL workflows: registers configs, invokes workflows, polls for pending escalations by role, claims and resolves each one, and verifies the workflow completes with expected results.

The NATS event delivery test subscribes directly to NATS, triggers a workflow, walks the escalation lifecycle, and verifies that each step produces a corresponding event on the NATS event bus. This proves that events flow cross-container in production (worker publishes, API/dashboard receives).

### Throughput Tests (Local)

Sustained load tests that simulate concurrent factory floor traffic. Run inside Docker against the local app:

```bash
# YAML engine (compiled graph, inline escalations)
docker compose exec app npm run test:factory:1       # 1 workflow, smoke test
docker compose exec app npm run test:factory:10      # 10 sustained
docker compose exec app npm run test:factory:100     # 100 sustained

# Durable engine (TypeScript, parent-child orchestration)
docker compose exec app npm run test:assembly:1      # 1 workflow, smoke test
docker compose exec app npm run test:assembly:10     # 10 sustained
docker compose exec app npm run test:assembly:100    # 100 sustained
```

The YAML factory test (`04-factory.ts`, `05-factory-sustained.ts`) deploys a YAML workflow definition with 5 automated steps and 5 human stations, then runs N orders through it with concurrent claim and resolve loops.

The durable assembly test (`06-assembly-line.ts`) invokes the TypeScript `stepIterator` workflow with the same concurrent claim/resolve pattern.

### Throughput Tests (Remote)

Same tests targeting the production AWS deployment. Run from your Mac (not inside Docker). Requires `REMOTE_PASSWORD` set in `.env`:

```bash
# YAML engine on AWS
npm run test:remote:factory:1
npm run test:remote:factory:10
npm run test:remote:factory:100

# Durable engine on AWS
npm run test:remote:assembly:1
npm run test:remote:assembly:10
npm run test:remote:assembly:100
```

### Raw Throughput Tests

Lower-level HotMesh engine benchmarks (no Long Tail API, no escalations):

```bash
docker compose exec app npm run test:throughput:echo      # Baseline: minimal pub/complete
docker compose exec app npm run test:throughput:signal     # Hook + signal round-trip
docker compose exec app npm run test:throughput:chain      # 3-station signal chain
```

## AWS Operations

Run from your Mac (requires AWS CLI configured):

```bash
# Health and status
npm run aws:health              # Health check
npm run aws:services            # Service status table

# CloudWatch metrics
npm run aws:stats               # CPU, memory, connections — last 5 min
npm run aws:stats:15m           # Last 15 min
npm run aws:stats:30m           # Last 30 min
npm run aws:stats:1h            # Last hour
npm run aws:stats:1d            # Last 24 hours

# Live logs
npm run aws:logs:api            # Tail API logs (Ctrl+C to stop)
npm run aws:logs:worker         # Tail worker logs

# Deploy
npm run aws:deploy              # Build and deploy via CDK
```

## AWS Deployment

The `deploy/` directory contains the full AWS infrastructure as CDK stacks: VPC, RDS PostgreSQL, S3, ECS Fargate (separate API and worker services), ALB with HTTPS, Route 53 DNS, and GitHub Actions CI/CD.

See [deploy/README.md](deploy/README.md) for the complete deployment guide, including:

- Step-by-step first deploy with verification at each stage
- Secrets Manager configuration (LLM keys, OAuth, JWT)
- Two-service architecture (API + worker)
- Network layout and security groups
- Day-to-day operations (secret rotation, log tailing, service restarts)
- GitHub Actions OIDC setup for automated deploys

## Project Structure

```
src/
  index.ts                          # Entry point — registers workers, starts Long Tail
  activities/
    image.ts                        # 12 sharp-based image processing operations
  mcp-servers/
    image-tools.ts                  # MCP server exposing image activities as tools
  workflows/
    hello-world/                    # Minimal: timer + activity + IAM context
    content-review/                 # Escalation: confidence-based human review
    screenshot-research/            # Pipeline: screenshot + vision LLM + knowledge store
    assembly-line/                  # HITL: parent-child orchestration with escalations
      types.ts                      #   Station config and result interfaces
      activities.ts                 #   Create escalation + signal parent
      index.ts                      #   Assembly Line orchestrator
      worker.ts                     #   Workstation child workflow
      iterator.ts                   #   Step Iterator (data-driven loop)
      reverter.ts                   #   Reverter (loop with revert support)
deploy/
  nats.conf                         # NATS server config (auth, WebSocket, monitoring)
  cdk/                              # AWS CDK infrastructure stacks
scripts/
  seed.ts                           # Creates users, roles, escalation chains
  token.ts                          # Generate a JWT for API testing
  aws-stats.sh                      # CloudWatch metrics dashboard
tests/
  integration/
    assembly-line.test.ts           # End-to-end HITL workflow tests
    nats-events.test.ts             # NATS event delivery across containers
    self-test.test.ts               # Health and self-test validation
    helpers.ts                      # ApiClient, poll utility, logging
  throughput/
    01-echo.ts                      # HotMesh baseline: pub + execute + complete
    02-signal.ts                    # Hook + signal round-trip
    03-chain.ts                     # 3-station signal chain
    04-factory.ts                   # YAML factory: 1 workflow, 5 stations
    05-factory-sustained.ts         # YAML factory: N sustained with claim/resolve loops
    06-assembly-line.ts             # Durable assembly: N sustained with claim/resolve loops
    yaml/
      04-factory.yaml               # YAML workflow: 5 auto steps + 5 human stations
deploy/
  README.md                         # Complete deployment guide
  cdk/
    bin/app.ts                      # Stack instantiation
    lib/
      network-stack.ts              # VPC, subnets, security groups
      data-stack.ts                 # RDS, S3, Secrets Manager
      dns-stack.ts                  # ACM certificate, Route 53
      compute-stack.ts              # ECS Fargate, ALB, DNS record
      github-oidc-stack.ts          # IAM role for GitHub Actions
```

## Adding Your Own Workflow

1. Create a directory under `src/workflows/`:

```typescript
// src/workflows/my-workflow/activities.ts
export async function doWork(input: { query: string }) {
  return { answer: `Processed: ${input.query}` };
}
```

```typescript
// src/workflows/my-workflow/index.ts
import { Durable } from '@hotmeshio/hotmesh';
import type { LTEnvelope } from '@hotmeshio/long-tail';
import * as activities from './activities';

const { doWork } = Durable.workflow.proxyActivities<typeof activities>({ activities });

export async function myWorkflow(envelope: LTEnvelope) {
  const result = await doWork(envelope.data);
  return { type: 'return' as const, data: result };
}
```

2. Register the worker in `src/index.ts`:

```typescript
import * as myWorkflow from './workflows/my-workflow';

workers: [
  { taskQueue: 'default', workflow: myWorkflow.myWorkflow },
],
```

3. Rebuild: `docker compose up -d --build`

The workflow is now invocable through the dashboard or the REST API.

## Escalation Patterns

### Simple (return-based)

Return `type: 'escalation'` to pause the workflow and create a human task. The dashboard shows it in the assigned role's queue. When resolved, the workflow resumes.

```typescript
return {
  type: 'escalation',
  role: 'reviewer',
  message: 'Needs human review',
  data: { context: 'for the reviewer' },
};
```

### Advanced (signal-based)

For multi-step HITL flows like the assembly line, use `startChild` + `condition` + `signal`:

```typescript
// Parent: spawn child and wait for signal
await Durable.workflow.startChild({ workflowName: 'workstation', ... });
const result = await Durable.workflow.condition(signalId);

// Child: create escalation, pause, then signal parent when human resolves
await createStationEscalation({ signalId, role, ... });
const resolution = await Durable.workflow.condition(localSignalId);
await signalParent({ parentWorkflowId, signalId, data: resolution });
```

See `src/workflows/assembly-line/` for the complete implementation.

## IAM

Every workflow carries identity context. Activities can inspect who invoked the workflow and what permissions they have:

```typescript
import { getActivityIdentity } from '@hotmeshio/long-tail';

export async function myActivity(input: any) {
  const identity = getActivityIdentity();
  console.log(identity.principal.id);     // who is executing
  console.log(identity.principal.roles);  // their roles
}
```

## Custom MCP Servers

Expose activities as MCP tools for AI orchestration. See `src/mcp-servers/image-tools.ts` for a full example.

```typescript
import { registerMcpTool } from '@hotmeshio/long-tail';

registerMcpTool(server, 'my_tool', 'Description', { input: z.string() }, async (args) => ({
  content: [{ type: 'text', text: args.input }],
}));
```

Register the server factory in `src/index.ts`:

```typescript
mcp: {
  serverFactories: {
    'my-tools': createMyToolsServer,
  },
},
```

## Configuration

All options are passed to `start()` in `src/index.ts`. See `.env.example` for the full list.

| Env Var | Default | Description |
|---------|---------|-------------|
| `POSTGRES_HOST` | `localhost` | Database host |
| `POSTGRES_PORT` | `5416` | Database port (mapped from container 5432) |
| `PORT` | `3030` | Dashboard and API port |
| `JWT_SECRET` | `change-me` | JWT signing secret |
| `LT_STORAGE_BACKEND` | `s3` | File storage backend |
| `LT_S3_ENDPOINT` | `http://localhost:9002` | MinIO/S3 endpoint |
| `NATS_URL` | `nats://nats:4222` | Internal NATS connection for event publishing |
| `NATS_TOKEN` | `dev_api_secret` | NATS auth token (Secrets Manager in production) |
| `NATS_WS_URL` | `ws://localhost:9222` | NATS WebSocket URL for browser dashboard |
| `ANTHROPIC_API_KEY` | -- | Enables vision LLM and MCP tool orchestration |
| `OPENAI_API_KEY` | -- | OpenAI API access |
| `REMOTE_URL` | -- | Target URL for remote throughput tests |
| `REMOTE_PASSWORD` | -- | Superadmin password for remote tests |

## Full Reset

```bash
docker compose down -v                    # Stop everything, delete volumes
docker compose up -d --build              # Rebuild and start fresh
docker compose exec app npm run seed      # Re-seed users and roles
docker compose exec app npm run test:integration  # Verify everything works
```
