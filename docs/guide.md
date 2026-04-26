# Long Tail Developer Guide

This guide walks through the full stack: setup, authoring durable workflows, testing, exposing MCP tools, and working with Claude Code as a collaborator.

## Prerequisites

- Node.js 22.16+ (use `nvm use` — `.nvmrc` is in the repo)
- Docker (for Postgres and MinIO)
- An editor with TypeScript support

## Setup

```bash
# Clone and install
git clone <repo-url> && cd long-tail-boilerplate
nvm use
npm install

# Start infrastructure
docker compose up -d

# Configure
cp .env.example .env

# Seed the admin account
npm run seed

# Start the server
npm run dev
```

Dashboard is at http://localhost:3030. Log in with `superadmin` / `changeme`.

To customize the seed account:

```bash
npm run seed -- --user myname --password mypassword
```

## Project Layout

```
src/
  index.ts                          Entry point — registers workflows and MCP servers
  activities/
    image.ts                        Standalone activity functions (sharp-based)
    image.test.ts                   Tests for image activities
  mcp-servers/
    image-tools.ts                  MCP server wrapping image activities as tools
  workflows/
    hello-world/
      index.ts                      Workflow function
      activities.ts                 Activities with IAM context
      activities.test.ts            Tests
    content-review/
      index.ts                      Workflow with escalation
      activities.ts                 Content analysis activity
      activities.test.ts            Tests
scripts/
  seed.ts                           Create admin account
  token.ts                          Generate JWT token
docs/
  guide.md                          This file
```

## Core Concepts

### Durable Workflows

A workflow is an async function that receives an `LTEnvelope` and returns a result. Every step is checkpointed to Postgres. If the process crashes, the workflow resumes from the last checkpoint — not from the beginning.

```typescript
import { Durable } from '@hotmeshio/hotmesh';
import type { LTEnvelope } from '@hotmeshio/long-tail';
import * as activities from './activities';

const { myActivity } = Durable.workflow.proxyActivities<typeof activities>({
  activities,
});

export async function myWorkflow(envelope: LTEnvelope): Promise<any> {
  const result = await myActivity(envelope.data);
  return { type: 'return' as const, data: result };
}
```

Key points:
- `proxyActivities` wraps your functions so each call is checkpointed
- The envelope carries input data and identity context
- Return `{ type: 'return', data }` for normal completion
- Return `{ type: 'escalation', role, message, data }` to pause and create a human task

### Activities

Activities are standalone async functions. They run as checkpointed steps inside workflows, but they can also be called directly or exposed as MCP tools.

```typescript
import { getActivityIdentity } from '@hotmeshio/long-tail';

export async function processOrder(input: { orderId: string }) {
  const identity = getActivityIdentity();
  // identity.principal.id — who is executing
  // identity.principal.roles — their roles

  return { status: 'processed', orderId: input.orderId };
}
```

Keep activities focused on one operation. They should be testable in isolation.

### Escalation

When a workflow can't proceed without human input, return an escalation:

```typescript
if (analysis.confidence < threshold) {
  return {
    type: 'escalation' as const,
    role: 'reviewer',
    message: `Needs review (confidence: ${analysis.confidence})`,
    data: { ...analysis },
  };
}
```

The workflow pauses. The escalation appears in the dashboard under the assigned role's queue. Once it's resolved, the workflow resumes.

## Authoring a Workflow: Step by Step

This is the workflow you'll follow whether you're writing code yourself or collaborating with Claude Code.

### 1. Create the directory

```bash
mkdir -p src/workflows/my-workflow
```

### 2. Write the activities

Start with `activities.ts`. Define typed inputs and outputs. Keep functions pure where possible — no global state, no side effects beyond the operation itself.

```typescript
// src/workflows/my-workflow/activities.ts

export async function summarize(input: {
  text: string;
  maxLength?: number;
}): Promise<{
  summary: string;
  originalLength: number;
  truncated: boolean;
}> {
  const max = input.maxLength ?? 200;
  const truncated = input.text.length > max;

  return {
    summary: truncated ? input.text.slice(0, max) + '...' : input.text,
    originalLength: input.text.length,
    truncated,
  };
}
```

### 3. Write tests for the activities

Tests go next to the code they test. Activities are pure functions — test them directly.

```typescript
// src/workflows/my-workflow/activities.test.ts

import { describe, it, expect } from 'vitest';
import { summarize } from './activities';

describe('my-workflow / summarize', () => {
  it('returns full text when under max length', async () => {
    const result = await summarize({ text: 'Short text.' });

    expect(result.summary).toBe('Short text.');
    expect(result.truncated).toBe(false);
  });

  it('truncates long text', async () => {
    const result = await summarize({ text: 'x'.repeat(300), maxLength: 100 });

    expect(result.summary.length).toBe(103); // 100 + '...'
    expect(result.truncated).toBe(true);
  });

  it('respects custom maxLength', async () => {
    const result = await summarize({ text: 'Hello, world!', maxLength: 5 });

    expect(result.summary).toBe('Hello...');
  });
});
```

### 4. Run tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file change)
npm run test:watch

# Run a specific test file
npx vitest run src/workflows/my-workflow/activities.test.ts
```

### 5. Write the workflow

```typescript
// src/workflows/my-workflow/index.ts

import { Durable } from '@hotmeshio/hotmesh';
import type { LTEnvelope } from '@hotmeshio/long-tail';
import * as activities from './activities';

const { summarize } = Durable.workflow.proxyActivities<typeof activities>({
  activities,
});

export async function summarizeWorkflow(envelope: LTEnvelope): Promise<any> {
  const { text, maxLength } = envelope.data;
  const result = await summarize({ text, maxLength });

  return { type: 'return' as const, data: result };
}
```

### 6. Register the workflow

Add it to `src/index.ts`:

```typescript
import * as myWorkflow from './workflows/my-workflow';

const lt = await start({
  // ...existing config...
  workers: [
    // ...existing workers...
    { taskQueue: 'default', workflow: myWorkflow.summarizeWorkflow },
  ],
});
```

### 7. Type-check

```bash
npm run typecheck
```

### 8. Run all tests one more time

```bash
npm test
```

Green? Ship it.

## Exposing Activities as MCP Tools

Any activity can be wrapped as an MCP tool, making it discoverable and callable by the Pipeline Designer.

### 1. Create the MCP server

```typescript
// src/mcp-servers/my-tools.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerMcpTool } from '@hotmeshio/long-tail';
import { summarize } from '../workflows/my-workflow/activities';

export function createMyToolsServer(): McpServer {
  const server = new McpServer({ name: 'my-tools', version: '1.0.0' });

  registerMcpTool(server,
    'summarize_text',
    'Summarize text to a given max length.',
    {
      text: z.string().describe('The text to summarize'),
      maxLength: z.number().optional().describe('Max characters (default: 200)'),
    },
    async (args: any) => ({
      content: [{
        type: 'text',
        text: JSON.stringify(await summarize(args)),
      }],
    }),
  );

  return server;
}
```

**Why `registerMcpTool` instead of `server.tool()`?** The MCP SDK's `.tool()` method has deeply nested Zod generic types that cause the TypeScript compiler to run out of memory. `registerMcpTool` wraps the call to bypass the type explosion. Runtime validation is unaffected.

### 2. Register the server factory

```typescript
// src/index.ts
import { createMyToolsServer } from './mcp-servers/my-tools';

const lt = await start({
  // ...
  mcp: {
    serverFactories: {
      'image-tools': createImageToolsServer,
      'my-tools': createMyToolsServer,
    },
  },
});
```

## Working with Claude Code

This project is designed for iterative development with Claude Code. Here's how the collaboration loop works.

### The Loop

1. **Describe** — Tell Claude what workflow you need. Be specific about inputs, outputs, and business rules.
2. **Author** — Claude writes the activity functions, the workflow, and the tests.
3. **Type-check** — Claude runs `npm run typecheck` to catch type errors.
4. **Test** — Claude runs `npm test` (or targets a specific file) to verify correctness.
5. **Fix** — If anything fails, Claude fixes it and re-runs. No "try it now" — it verifies before reporting done.

### Example Conversation

> **You:** I need a workflow that takes a URL, fetches the page, extracts the title and word count, and returns them. If the fetch fails, escalate to an operator.
>
> **Claude:** Creates `src/workflows/page-analyzer/activities.ts` with `fetchPage` and `analyzePage` activities, `activities.test.ts` with tests covering success, failure, and edge cases, and `index.ts` with the workflow. Runs `npm run typecheck`, then `npm test`. Reports results.
>
> **You:** Add a timeout parameter, default 5 seconds.
>
> **Claude:** Updates the activity signature, adds a test for custom timeout, re-runs `npm run typecheck` and `npm test`. Reports results.

### Tips for Effective Collaboration

- **Be explicit about types.** "The input has a `url` string and optional `timeout` number" is better than "it takes a URL."
- **Name your edge cases.** "What happens when the URL returns a 404?" prompts Claude to handle it and test it.
- **Ask for tests first.** If you say "write tests for this activity," Claude will write the test expectations, which doubles as a specification for the implementation.
- **Run the watch loop.** Use `npm run test:watch` in a terminal. Claude sees the output and self-corrects.

### Scripts Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start server with hot reload |
| `npm run build` | Type-check and compile to `build/` |
| `npm run typecheck` | Type-check only (no emit) |
| `npm test` | Run all Vitest tests once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run seed` | Create admin account |
| `npm run token` | Generate a JWT |

## File Conventions

- **Activities** are standalone. They go in the workflow directory (`workflows/x/activities.ts`) or in `activities/` if shared across workflows.
- **Tests** are co-located. `activities.test.ts` sits next to `activities.ts`.
- **SQL** goes in `sql.ts`. Never inline queries.
- **Prompts** go in `prompts.ts`. Never inline prompt strings.
- **Routes** are thin transport adapters. Business logic lives in services or activities.
- **Modules under 300 lines.** When a file exceeds this, break it into a directory with semantic file names and an `index.ts` barrel.

## Infrastructure

### Postgres

Runs on port 5416 (mapped from container port 5432). Stores all workflow state, checkpoints, escalations, and IAM data.

### MinIO

S3-compatible object storage on port 9002. Console on port 9003. Used for file storage when `LT_STORAGE_BACKEND=s3` is set in `.env`.

### Docker Compose

```bash
docker compose up -d      # Start Postgres + MinIO
docker compose down        # Stop
docker compose down -v     # Stop and delete volumes (reset all data)
```

## Troubleshooting

### `tsc` runs out of memory

This happens if you call `McpServer.tool()` or `.registerTool()` directly with Zod schemas. Use `registerMcpTool` from `@hotmeshio/long-tail` instead. See [Custom MCP Servers](#exposing-activities-as-mcp-tools).

### Tests fail with "Cannot find module"

Run `npm install` — a dependency might be missing after switching branches.

### Server won't start

Check that Docker containers are running: `docker compose ps`. Postgres needs to be healthy before the server can connect.

### `nvm use` reports wrong version

The repo includes `.nvmrc` pinned to 22.16.0. Run `nvm install 22.16.0` if you don't have it.
