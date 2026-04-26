# Long Tail Boilerplate

A working example site for [Long Tail](https://github.com/hotmeshio/long-tail) -- durable workflows with IAM, escalations, MCP tools, and a built-in dashboard, all backed by PostgreSQL.

This repo is designed to be cloned and modified. Every workflow demonstrates a different pattern you'll use in production: simple activities, AI-powered escalation, browser automation, and human-in-the-loop assembly lines. The integration tests show how to exercise these workflows end-to-end through the HTTP API.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/hotmeshio/long-tail-boilerplate.git
cd long-tail-boilerplate
cp .env.example .env
npm install

# 2. Start everything (Postgres + MinIO + app with HMR)
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
| MinIO Console | [localhost:9003](http://localhost:9003) | S3-compatible file storage browser |
| PostgreSQL | localhost:5416 | Workflow state, IAM, escalation records |

## Example Workflows

### Hello World (`src/workflows/hello-world/`)

Minimal workflow demonstrating durable timers and proxy activities with IAM context. Good starting point for understanding the basic pattern.

```
envelope.data.name  -->  sleep  -->  greet activity  -->  return result
```

### Content Review (`src/workflows/content-review/`)

Shows confidence-based escalation. An activity analyzes content and returns a confidence score. High confidence returns immediately; low confidence creates an escalation for a human reviewer.

```
content  -->  analyzeContent  -->  confidence >= threshold?
                                    yes --> return approved
                                    no  --> escalate to reviewer
```

### Screenshot Research (`src/workflows/screenshot-research/`)

Multi-step pipeline: captures a screenshot with Playwright, analyzes it with a vision LLM, and stores the analysis in the knowledge store. Demonstrates chaining multiple activities with external service dependencies.

```
url  -->  captureScreenshot  -->  analyzeScreenshot (vision LLM)  -->  storeAnalysis  -->  return
```

### Assembly Line (`src/workflows/assembly-line/`)

Three orchestrators that demonstrate human-in-the-loop (HITL) patterns using escalation APIs and durable signaling. No interceptor, no ceremony -- just raw Durable primitives.

All three reuse the same **workstation** child workflow, which creates an escalation, pauses until a human resolves it, then signals the parent.

#### Assembly Line Orchestrator (`index.ts`)

Sequential parent-child orchestration. A product moves through named workstations. Each station spawns a child workflow that creates an escalation for a specific role (grinder, gluer, etc.), pauses, and signals the parent when the human resolves it.

```
product  -->  [grinder station]  -->  [gluer station]  -->  return results
                   |                       |
                   v                       v
              escalation              escalation
              (pause)                 (pause)
              human resolves          human resolves
              signal parent           signal parent
```

#### Step Iterator (`iterator.ts`)

Generic data-driven loop. Identical behavior to the assembly line, but the orchestrator knows nothing about specific stations -- it just walks a dynamic `steps[]` array. Proves the pattern is entirely data-driven.

#### Reverter (`reverter.ts`)

Loop with revert support. Each human resolution controls flow:

- `{ approved: true }` -- advance to next step
- `{ approved: false, revertSteps: 1 }` -- go back 1 step
- `{ approved: false, revertSteps: 2 }` -- go back 2 steps

Tracks a monotonic attempt counter and full history of advances and reverts. This is the pattern for QA pipelines, multi-stage approvals, and any workflow where humans can reject and send work backwards.

## Running Tests

### Unit Tests

Fast, mocked, no Docker required:

```bash
npm test
```

### Integration Tests

Exercises workflows end-to-end through the HTTP API. Requires Docker Compose running with a seeded database.

```bash
# Make sure the app is running
docker compose up -d --build
docker compose exec app npm run seed

# Run the integration suite
npm run test:integration
```

The assembly line integration test (`tests/integration/assembly-line.test.ts`) walks through the full escalation lifecycle for all three HITL workflows:

1. Registers workflow configs via the API
2. Invokes each workflow with station/step data
3. Polls for pending escalations by role
4. Claims and resolves each escalation with a resolver payload
5. Verifies the workflow completes with the expected results

This is the pattern for testing any workflow that involves human tasks.

### Full Reset

If something gets stuck or you want a clean slate:

```bash
docker compose down -v          # Stop everything, delete volumes
docker compose up -d --build    # Rebuild and start fresh
docker compose exec app npm run seed  # Re-seed users and roles
npm run test:integration        # Verify everything works
```

## Project Structure

```
src/
  index.ts                          # Entry point — registers workers and starts Long Tail
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
scripts/
  seed.ts                           # Creates users, roles, escalation chains
  token.ts                          # Generate a JWT for API testing
tests/
  integration/
    helpers.ts                      # ApiClient, poll utility, logging
    types.ts                        # Shared test types
    vitest.config.ts                # Integration test config (sequential, long timeouts)
    assembly-line.test.ts           # End-to-end HITL workflow tests
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

All options are passed to `start()` in `src/index.ts`. See `.env.example` for environment variables.

| Env Var | Default | Description |
|---------|---------|-------------|
| `POSTGRES_HOST` | `localhost` | Database host |
| `POSTGRES_PORT` | `5416` | Database port (mapped from container 5432) |
| `PORT` | `3030` | Dashboard and API port |
| `JWT_SECRET` | `change-me` | JWT signing secret |
| `LT_STORAGE_BACKEND` | `s3` | File storage backend |
| `LT_S3_ENDPOINT` | `http://localhost:9002` | MinIO/S3 endpoint |
| `ANTHROPIC_API_KEY` | — | Enables vision LLM and MCP tool orchestration |
