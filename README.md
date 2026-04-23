# Long Tail Boilerplate

Write functions. They checkpoint to Postgres. If the process crashes, they resume where they left off. Every execution carries identity — who started it, whose credentials govern it. A dashboard ships with the package.

## Quick Start

```bash
# 1. Start Postgres + MinIO
docker compose up -d

# 2. Install dependencies
npm install

# 3. Configure
cp .env.example .env

# 4. Seed the admin account
npm run seed

# 5. Run
npm run dev
```

Dashboard: [http://localhost:3030](http://localhost:3030)
API: [http://localhost:3030/api](http://localhost:3030/api)
MinIO Console: [http://localhost:9002](http://localhost:9002)

## First Login

The seed script creates a `superadmin` / `changeme` account. Use it to log into the dashboard or generate a token:

```bash
npx ts-node scripts/token.ts
```

To customize the seed account:

```bash
npx ts-node scripts/seed.ts --user admin --password s3cret
```

## Project Structure

```
src/
  index.ts                    # Entry point — configures and starts Long Tail
  activities/
    image.ts                  # 12 sharp-based image operations
  mcp-servers/
    image-tools.ts            # MCP server wrapping image activities
  workflows/
    hello-world/
      index.ts                # Minimal durable workflow
      activities.ts           # Activity with IAM context
    content-review/
      index.ts                # Workflow with escalation
      activities.ts           # Content analysis activity
scripts/
  seed.ts                     # Creates superadmin account
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

## Custom MCP Servers

Activities can be exposed as MCP tools. See `src/mcp-servers/image-tools.ts` for a full example.

Register your server factory in `src/index.ts`:

```typescript
import { createImageToolsServer } from './mcp-servers/image-tools';

const lt = await start({
  // ...
  mcp: {
    serverFactories: {
      'image-tools': createImageToolsServer,
    },
  },
});
```

### TypeScript and `McpServer.tool()`

The MCP SDK's `.tool()` and `.registerTool()` methods use deeply nested Zod generics that cause the TypeScript compiler to run out of memory. Use `registerMcpTool` from `@hotmeshio/long-tail` instead — it wraps the call to avoid the type explosion while preserving runtime validation:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerMcpTool } from '@hotmeshio/long-tail';

const server = new McpServer({ name: 'my-tools', version: '1.0.0' });

registerMcpTool(server, 'my_tool', 'Description', { input: z.string() }, async (args: any) => ({
  content: [{ type: 'text', text: args.input }],
}));
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

## File Storage (MinIO)

The boilerplate includes MinIO for S3-compatible file storage. Docker Compose starts it on port 9002. Set `LT_STORAGE_BACKEND=s3` in `.env` to enable it (see `.env.example` for all S3 config options).

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

