# Long Tail Boilerplate

Durable workflows with IAM, a built-in dashboard, and MCP tool orchestration. Add PostgreSQL and go.

## Quick Start

```bash
# 1. Start Postgres
docker compose up -d

# 2. Install dependencies
npm install

# 3. Configure
cp .env.example .env

# 4. Run
npm run dev
```

Dashboard: [http://localhost:3000](http://localhost:3000)
API: [http://localhost:3000/api](http://localhost:3000/api)

## First Login

Generate a token:

```bash
npx ts-node scripts/token.ts
```

Use the token to authenticate API calls or log into the dashboard.

## Project Structure

```
src/
  index.ts                    # Entry point — configures and starts Long Tail
  workflows/
    hello-world/
      index.ts                # Minimal durable workflow
      activities.ts           # Activity with IAM context
    content-review/
      index.ts                # Workflow with escalation
      activities.ts           # Content analysis activity
```

## Adding a Workflow

Create a directory under `src/workflows/` with two files:

**`index.ts`** — the workflow function:

```typescript
import { Durable } from '@hotmeshio/hotmesh';
import type { LTEnvelope } from '@hotmeshio/long-tail';
import * as activities from './activities';

const { myActivity } = Durable.workflow.proxyActivities<typeof activities>({ activities });

export async function myWorkflow(envelope: LTEnvelope) {
  const result = await myActivity(envelope.data);
  return { type: 'return' as const, data: result };
}
```

**`activities.ts`** — side-effect functions:

```typescript
export async function myActivity(input: { query: string }) {
  // Each activity is checkpointed. If the process crashes, it resumes here.
  return { answer: `Processed: ${input.query}` };
}
```

Register it in `src/index.ts`:

```typescript
import * as myWorkflow from './workflows/my-workflow';

const lt = await start({
  // ...
  workers: [
    { taskQueue: 'default', workflow: myWorkflow.myWorkflow },
  ],
});
```

## Escalation

Return `type: 'escalation'` to pause the workflow and create a human task:

```typescript
return {
  type: 'escalation',
  role: 'reviewer',
  message: 'Needs human review',
  data: { context: 'for the reviewer' },
};
```

The dashboard shows the escalation in the reviewer's queue. When resolved, the workflow resumes.

## IAM

Every workflow carries identity context — who invoked it, whose permissions govern it, and what credentials are available.

```typescript
import { getActivityIdentity } from '@hotmeshio/long-tail';

export async function myActivity(input: any) {
  const identity = getActivityIdentity();
  console.log(identity.principal.id);     // who is executing
  console.log(identity.principal.roles);  // their roles

  // Exchange credentials at runtime
  const token = await identity.getCredential('anthropic');
}
```

## Configuration

All options in `src/index.ts` are documented in the [Long Tail docs](https://github.com/hotmeshio/long-tail).

| Option | Default | Description |
|--------|---------|-------------|
| `database` | required | PostgreSQL connection |
| `server.port` | 3000 | Dashboard and API port |
| `auth.secret` | — | JWT signing secret |
| `escalation.strategy` | `'default'` | `'mcp'` for AI-powered triage |
| `examples` | false | Load demo workflows and seed data |

## What You Get

- **Dashboard** — workflow registry, invocation, execution timeline, escalation management
- **Durable execution** — every workflow step is checkpointed to Postgres
- **IAM** — identity propagates from HTTP request to every activity
- **Live events** — real-time event stream via Socket.IO (zero config)
- **MCP tools** — optional AI-powered tool orchestration with compiled pipelines

No Redis. No Kafka. No app server. Just Postgres.
