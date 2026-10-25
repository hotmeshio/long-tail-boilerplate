# Your First Workflow: `goodbyeWorld`

This walkthrough builds a workflow from an empty folder to a running, tested tool with a form in the dashboard. Part 2 adds a person to the loop: the workflow pauses until a reviewer approves the message in a form that the platform validates.

Every step below was run against the local stack. Total time: about 20 minutes.

**Before you start:** the local stack is running (`docker compose up -d --build`) and you can sign in at [localhost:3030](http://localhost:3030). The app container watches `src/` and restarts on save, so there is no rebuild step.

## How the pieces fit

`src/index.ts` passes one start config to Long Tail. You will touch two of its keys:

- `workers` (from `src/config/workers.ts`): registers the workflow function and its profile: who may start it, and its invoke form.
- `roles` (from `src/config/hitl-roles.ts`, Part 2): declares the reviewer role and the form it owns.

The workflow itself lives in one folder, `src/workflows/goodbye-world/`:

| File | Holds |
|---|---|
| `activities.ts` | Side effects. Each export runs as one checkpointed step. |
| `index.ts` | The workflow: deterministic code that calls activities and waits. |
| `forms.ts` | The invoke form (and in Part 2, the reviewer's form). |

## Part 1: a workflow with a form

### 1. The activity

An activity is a plain async function. Anything that touches the outside world (a network call, a clock, a random number) belongs in one, because the workflow replays and the activity's recorded result is reused instead of running again.

```typescript
// src/workflows/goodbye-world/activities.ts
import { getActivityIdentity } from '@hotmeshio/long-tail';

export async function sayGoodbye(input: { name: string; tone: 'warm' | 'brief' }): Promise<{
  message: string;
  saidBy: string;
}> {
  let saidBy = 'system';
  try {
    saidBy = getActivityIdentity().principal.id;
  } catch {
    // No IAM context (e.g., a cron-started run)
  }
  const message = input.tone === 'warm'
    ? `Goodbye, ${input.name}. It was good to work with you.`
    : `Bye, ${input.name}.`;
  return { message, saidBy };
}
```

`getActivityIdentity()` tells you who started the run, so an activity can act, or refuse to act, as that person.

### 2. The workflow

```typescript
// src/workflows/goodbye-world/index.ts
import { Durable } from '@hotmeshio/hotmesh';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import * as activities from './activities';

const { sayGoodbye } = Durable.workflow.proxyActivities<typeof activities>({ activities });

export async function goodbyeWorld(envelope: LTEnvelope) {
  const { name = 'World', tone = 'warm', delaySeconds = 1 } = envelope.data;

  // 1. Pause durably: the run survives a restart mid-sleep
  await Durable.workflow.sleep(`${delaySeconds} seconds`);

  // 2. Run the activity: checkpointed, so a replay does not repeat it
  const result = await sayGoodbye({ name, tone });

  return { type: 'return' as const, data: result };
}
```

The exported function name is the workflow type: `goodbyeWorld` is what you invoke. `envelope.data` is the input; return `{ type: 'return', data }` to finish.

### 3. The invoke form

The form is JSON Schema plus Long Tail's `x-lt-*` keywords. The dashboard renders it on the Invoke Tool page, and the invoke API validates every request against the same schema, so the dashboard, `curl`, and MCP all get the same rules.

```typescript
// src/workflows/goodbye-world/forms.ts
export const GOODBYE_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-help': 'Says goodbye to **{{input.name}}** after a short durable sleep.',
  'x-lt-order': ['name', 'tone', 'delaySeconds'],
  required: ['name', 'tone'],
  properties: {
    name: {
      type: 'string',
      title: 'Name',
      description: 'Enter who to say goodbye to',
      default: 'World',
      minLength: 1,
      maxLength: 80,
    },
    tone: {
      type: 'string',
      title: 'Tone',
      description: 'Pick how to say it',
      default: 'warm',
      'x-lt-options': [
        { value: 'warm', label: 'Warm' },
        { value: 'brief', label: 'Brief' },
      ],
    },
    delaySeconds: {
      type: 'integer',
      title: 'Sleep (seconds)',
      description: 'Enter a pause before the goodbye, 0 to 30',
      default: 1,
      minimum: 0,
      maximum: 30,
    },
  },
};
```

`x-lt-help` renders as markdown in the side panel and reads the live values through `{{input.*}}`. `x-lt-options` makes a labeled select, and only listed values are accepted.

### 4. Register it

In `src/config/workers.ts`, import the workflow and its form beside the others:

```typescript
import * as goodbyeWorld from '../workflows/goodbye-world';
import { GOODBYE_INPUT_SCHEMA } from '../workflows/goodbye-world/forms';
```

Add a profile next to `helloWorldConfig`:

```typescript
const goodbyeWorldConfig: LTWorkerConfig = {
  description: 'Goodbye world: a durable sleep, then a goodbye.',
  invocable: true,                          // can be started from the dashboard, API, and MCP
  invocationRoles: INVOCATION_ROLES,        // who may start it
  icon: WORKFLOW_ICONS.SPARKLES,            // shown on the Invoke Tool page
  envelopeSchema: { data: {}, metadata: DASHBOARD_METADATA },
  inputSchema: GOODBYE_INPUT_SCHEMA,        // the form, enforced by the invoke API
  reset: true,                              // code owns this profile (see below)
};
```

And add one line to the `WORKERS` list:

```typescript
{ taskQueue: 'default', workflow: goodbyeWorld.goodbyeWorld, config: goodbyeWorldConfig },
```

`reset: true` makes the profile code-owned: every boot compares it with the database and applies changes. Without it the first boot writes the profile once and later edits to code are ignored. That is useful when admins tune a profile in the dashboard, and surprising when they don't.

Save. The app restarts in a few seconds (`docker compose logs -f app` shows it).

### 5. Run it

**From the dashboard:** Invoke Tool → Goodbye World. Pick a tone and Submit; the result appears beside the button.

**From the API:**

```bash
TOKEN=$(curl -s -X POST localhost:3030/api/auth/login -H 'content-type: application/json' \
  -d '{"username":"superadmin","password":"l0ngt@1l"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# A value outside the form's options is refused before anything starts
curl -s -X POST localhost:3030/api/workflows/goodbyeWorld/invoke -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"data":{"name":"Ada","tone":"sad"}}'
# {"error":"data failed input schema validation (1 violation)","code":"schema_validation",
#  "violations":[{"field":"tone","message":"Must be one of: warm, brief"}], ...}

# A valid request starts a run (HTTP 202)
curl -s -X POST localhost:3030/api/workflows/goodbyeWorld/invoke -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"data":{"name":"Ada","tone":"warm"}}'
# {"workflowId":"goodbyeWorld-H...","message":"Workflow started"}

curl -s localhost:3030/api/workflows/<workflowId>/result -H "Authorization: Bearer $TOKEN"
# {"state":"completed","result":{"type":"return","data":{"message":"Goodbye, Ada. It was good to work with you.","saidBy":"superadmin"}}}
```

**From Claude Code** (after [connecting it](../README.md#connect-claude-code-optional)): ask it to "invoke goodbyeWorld for Ada, brief". It calls the `invoke_workflow` tool, which runs the same form check.

### 6. Test it

Unit tests mirror `src/` under `tests/unit/`. Test the activity directly:

```typescript
// tests/unit/workflows/goodbye-world/activities.test.ts
import { describe, it, expect } from 'vitest';

import { sayGoodbye } from '../../../../src/workflows/goodbye-world/activities';

describe('sayGoodbye', () => {
  it('says a warm goodbye', async () => {
    const out = await sayGoodbye({ name: 'Ada', tone: 'warm' });
    expect(out.message).toBe('Goodbye, Ada. It was good to work with you.');
  });

  it('says a brief goodbye', async () => {
    expect((await sayGoodbye({ name: 'Ada', tone: 'brief' })).message).toBe('Bye, Ada.');
  });

  it('runs without IAM context', async () => {
    expect((await sayGoodbye({ name: 'Ada', tone: 'brief' })).saidBy).toBe('system');
  });
});
```

Test the form with the same validator the dashboard and the API use (`tests/helpers/form-validation.ts`):

```typescript
// tests/unit/workflows/goodbye-world/forms.test.ts
import { describe, it, expect } from 'vitest';

import { violationsOf } from '../../../helpers/form-validation';
import { GOODBYE_INPUT_SCHEMA } from '../../../../src/workflows/goodbye-world/forms';

describe('GOODBYE_INPUT_SCHEMA', () => {
  it('accepts a valid payload', () => {
    expect(violationsOf(GOODBYE_INPUT_SCHEMA, { name: 'Ada', tone: 'warm', delaySeconds: 2 })).toEqual({});
  });

  it('rejects an unknown tone and a long sleep', () => {
    const v = violationsOf(GOODBYE_INPUT_SCHEMA, { name: 'Ada', tone: 'sad', delaySeconds: 99 });
    expect(Object.keys(v).sort()).toEqual(['delaySeconds', 'tone']);
  });
});
```

```bash
npm run typecheck
npx vitest run tests/unit/workflows/goodbye-world
```

## Part 2: put a person in the loop

Now the workflow drafts the goodbye and waits for a reviewer to edit and approve it. The reviewer's form belongs to a role, not to the workflow: the role versions it, the dashboard renders it, and with `enforce_schema` the server rejects a resolve that breaks it, from any surface.

### 7. The reviewer's form

Append to `forms.ts`:

```typescript
/** The role that reviews a goodbye before it goes out. */
export const FAREWELL_ROLE = 'farewell-reviewer';

/** What the reviewer's resolution delivers to the workflow. */
export interface FarewellReview {
  decision: 'send' | 'hold';
  message: string;
}

/** The reviewer's form, owned and versioned by the role. */
export const FAREWELL_FORM_SCHEMA = {
  title: 'Review Goodbye',
  description: 'Edit the message if needed, then decide.',
  'x-lt-labels': { submit: 'Record decision' },
  'x-lt-order': ['message', 'decision'],
  required: ['message', 'decision'],
  properties: {
    message: {
      type: 'string',
      format: 'textarea',
      title: 'Message',
      description: 'Edit the goodbye that will be sent',
      maxLength: 280,
    },
    decision: {
      type: 'string',
      title: 'Decision',
      description: 'Pick Send to deliver it',
      'x-lt-options': [
        { value: 'send', label: 'Send' },
        { value: 'hold', label: 'Hold' },
      ],
    },
  },
};
```

### 8. Declare the role

Roles go in the `roles` key of the start config, through `src/config/hitl-roles.ts`. Import the form and add an entry to `HITL_ROLES`:

```typescript
import { FAREWELL_ROLE, FAREWELL_FORM_SCHEMA } from '../workflows/goodbye-world/forms';

// in HITL_ROLES:
{
  role: FAREWELL_ROLE,
  title: 'Farewell Reviewer',
  form_schema: FAREWELL_FORM_SCHEMA,
  enforce_schema: true,   // the server validates every resolve against the form
  reset: true,            // code-owned: a changed form becomes the role's next version
},
```

### 9. Wait for the reviewer

Replace `index.ts`:

```typescript
// src/workflows/goodbye-world/index.ts
import { Durable } from '@hotmeshio/hotmesh';
import { conditional } from '@hotmeshio/long-tail';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import * as activities from './activities';
import { FAREWELL_ROLE, type FarewellReview } from './forms';

const { sayGoodbye } = Durable.workflow.proxyActivities<typeof activities>({ activities });

export async function goodbyeWorld(envelope: LTEnvelope) {
  const { name = 'World', tone = 'warm', delaySeconds = 1 } = envelope.data;
  const ctx = Durable.workflow.workflowInfo();

  // 1. Pause durably: the run survives a restart mid-sleep
  await Durable.workflow.sleep(`${delaySeconds} seconds`);

  // 2. Run the activity: checkpointed, so a replay does not repeat it
  const draft = await sayGoodbye({ name, tone });

  // 3. Ask a person: writes the escalation and suspends until it is resolved
  const review = await conditional<FarewellReview>(`goodbye-${ctx.workflowId}`, {
    role: FAREWELL_ROLE,
    description: `Goodbye to ${name}`,
    metadata: { name },
    envelope: { formDefaults: { message: draft.message } },
  });

  if (!review) return { type: 'return' as const, data: { name, sent: false, reason: 'cancelled' } };
  return {
    type: 'return' as const,
    data: { name, sent: review.decision === 'send', message: review.message },
  };
}
```

`conditional` writes the escalation and suspends in one durable step. The run uses no resources while it waits, for seconds or for weeks, and resumes with the reviewer's payload. It returns `null` when the escalation is cancelled (and `false` when an optional `timeout` expires first).

- `metadata` holds searchable facts about the row (`name` here): queues filter on them.
- `envelope.formDefaults` prefills the reviewer's form.

### 10. Try it

Invoke Goodbye World again, then open `/escalations/available?role=farewell-reviewer`. Claim the row: the message is prefilled. Pick a decision and click **Record decision**, and the run completes with `sent: true` and the message the reviewer kept.

The server applies the form to every resolve, not only the dashboard's:

```bash
curl -s -X POST localhost:3030/api/escalations/<escalationId>/claim -H "Authorization: Bearer $TOKEN"
curl -s -X POST localhost:3030/api/escalations/<escalationId>/resolve -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"resolverPayload":{"decision":"later","message":"Bye, Grace."}}'
# {"error":"resolverPayload failed schema validation (1 violation)","code":"schema_validation",
#  "violations":[{"field":"decision","message":"Must be one of: send, hold"}],"role":"farewell-reviewer", ...}
```

The same check guards MCP's `resolve_escalation` and `claim_and_resolve`, so an agent can't submit what a person couldn't.

## Where to go next

- **Richer forms:** sections, two-column layouts, fields revealed by an earlier answer, file uploads, signatures, checklists, and selects backed by versioned knowledge lookups. `src/workflows/rich-form/` and `src/workflows/lot-inspection/` use most of them.
- **List pages:** give a role a `list_schema` and its queue becomes a table with your columns and a look-ahead into upstream roles (`lot-inspector` does this).
- **Version pins:** pass `schemaVersion` to `conditional` to render one exact edition of a role's form.
- **Orchestration:** child workflows and multi-station flows in `src/workflows/assembly-line/`.
- **Reference:** Long Tail's docs ship with the package, in `node_modules/@hotmeshio/long-tail/docs/` (start with `hitl-guide.md`).
- **Ship it:** [deploy/README.md](../deploy/README.md).
