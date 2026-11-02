# TDD: claude-workbench

Derived from [PRD.md](PRD.md). Targets Long Tail 0.28.1 and HotMesh 0.31.3. Every claim about the platform below was checked against the installed types and docs (`node_modules/@hotmeshio/long-tail/{build,docs}`).

## 1. Scope

| Phase | This document |
|---|---|
| 1 | Full design: roles and domains, personas as role collections, org editions, facets, `deliverable`, `program` + `programBoard`, `ask`, forms, seeding, tests |
| 2 | Design outline: rollup, ties, delegation with channels (section 10) |
| 3, 4 | Out of scope here (an adopting org; roles held by the AI) |

Everything lives in `src/workflows/claude-workbench/`, registered through `src/config/`.

## 2. Roles, domains, personas

### 2.1 Roles

A code constant drives everything that needs a role at boot (forms must exist before rows do):

```ts
export const ORG_ROLES = [
  { role: 'product',                domain: 'product',     title: 'Product',                 meaning: '...' },
  { role: 'design',                 domain: 'design',      title: 'Design',                  meaning: '...' },
  { role: 'engineering-execution',  domain: 'engineering', title: 'Engineering: Execution',  meaning: '...' },
  { role: 'engineering-lab',        domain: 'engineering', title: 'Engineering: Lab',        meaning: '...' },
  { role: 'engineering-platform',   domain: 'engineering', title: 'Engineering: Platform',   meaning: '...' },
  { role: 'engineering-leadership', domain: 'engineering', title: 'Engineering: Leadership', meaning: '...' },
  { role: 'sre',                    domain: 'sre',         title: 'SRE',                     meaning: '...' },
  { role: 'quality',                domain: 'quality',     title: 'Quality',                 meaning: '...' },
  { role: 'sales',                  domain: 'sales',       title: 'Sales',                   meaning: '...' },
  { role: 'support',                domain: 'support',     title: 'Support',                 meaning: '...' },
  { role: 'inbox-sam',              domain: 'people',      title: 'Inbox: Sam',              meaning: 'A personal inbox' },
] as const;
export const ORG_PROGRAMS_ROLE = 'org-programs';
```

Every role in `ORG_ROLES` gets the same `LTRoleConfig`: `form_schema: SEAT_FORM_SCHEMA`, `list_schema: SEAT_LIST_SCHEMA`, `metadata_schema: SEAT_METADATA_SCHEMA`, `enforce_schema: true`, `reset: true`, and pins:

| Pin | URL |
|---|---|
| Work | `/escalations/available?role=<r>&subtype=work` (badge) |
| Reviews | `…&subtype=review` (badge) |
| Decisions | `…&subtype=decide` (badge) |
| Gates | `…&subtype=gate` (badge) |
| Domain | `/escalations/available?roles=<json of the domain's roles>&view=table` |
| Programs | `/escalations/available?role=org-programs&view=table` |

`org-programs` gets `PROGRAM_FORM_SCHEMA` / `PROGRAM_LIST_SCHEMA`, `enforce_schema: true`, `reset: true`, and one pin (Programs, badge).

`schemaVersion` is never pinned on rows: one form object backs eleven roles with independent version histories.

### 2.2 Personas (collections of roles)

Seeded with `api.personas.seedPersonas` (idempotent, authoritative):

| Persona | Roles | Purpose |
|---|---|---|
| `member-<role>` (one per role) | own role `write-all`; every other role of the same domain `read-all`; `org-programs` `read-all` | A human on that team |
| `ai-<role>` (one per role) | own role `write-self`; same-domain roles `read-all`; `org-programs` `read-all` | An AI that acts only on items assigned to it |
| `sam` (example of a composed persona) | `engineering-execution`, `engineering-lab`, `engineering-platform`, `engineering-leadership`, `inbox-sam` all `write-all`; `org-programs` `read-all` | Shows that a person's persona is their collection of roles |
| `org-coordinator` | `org-programs` `write-all` | The system principal that writes to program boards |

Bots (fixed UUIDs, `lt_users.account_type = 'bot'`, inserted with `ON CONFLICT DO NOTHING`, then `assignPersona`):

| Bot | UUID | Persona |
|---|---|---|
| `claude-at-work` | `0d000000-0000-4000-8000-000000000011` | `ai-engineering-platform` |
| `workbench-coordinator` | `0d000000-0000-4000-8000-000000000012` | `org-coordinator` |

### 2.3 AI modes

A field on the deliverable type, applied to **work rows only**:

| `ai` | Row creation | Effect |
|---|---|---|
| `none` | no `assignee` | The bot (write-self) cannot act |
| `eligible` | `assignee: botId, durationMinutes: 240` | Hard claim at creation: the bot has four hours of first right; then the row is available to any holder |
| `only` | `assignee: botId, durationMinutes: 10080` | One week before a person may take it |

"Alongside" is the bot also holding `member-<role>` (write-all); highest allowance wins. Review, decide and gate rows are never AI-assigned, so producer and reviewer stay distinct even when one bot holds two roles.

## 3. Org editions (knowledge domain `org`)

| Key | Payload | Seeding |
|---|---|---|
| `roles` | `{ items: [{ value, label, meaning, domain }] }` from `ORG_ROLES` | code-owned: roles are code-declared, so the edition follows the code (including the env-named inbox holders) |
| `raci` | `{ items: [{ value, label, meaning }] }` | starter |
| `channels` | `{ items: [{ value, label, meaning, needs, resolvesWith }] }`: `inbox`, `slack-thread`, `linear-issue`, `email` | starter (used by Phase 2 delegation; present from Phase 1 so templates are complete) |
| `deliverable-types` | `{ items: [{ value, label, meaning, producer, reviewer, ai }] }` | starter |
| `programs` | `{ items: [{ value, label, meaning, owner, phases: [{ key, label, deliverables, gate }] }] }` | starter |
| `handoff-guide` | `{ markdown }` | code-owned: compare-then-store on every boot |

Starter = write only when `getEntry` answers 404 / `found: false`. After that the edition evolves by edit, never by deploy.

Program templates: `software-launch` (discover → define → design → build → launch), `device-launch` (concept → feasibility → design → pilot → launch), `demo` (one phase, one deliverable, one signer; used by the integration test). See `org.ts` for the deliverable types each phase names and the roles that sign each gate.

Pinning: `pinOrgEditions()` (activity) reads `listEntryVersions` for each key and returns the version numbers; it throws (so the activity retries) if any edition is missing. Every row a program or deliverable parks carries `lookups: orgLookups(pins)`:

```ts
[{ domain: 'org', key: 'roles', version: pins.roles, as: 'roles' },
 { domain: 'org', key: 'raci', version: pins.raci, as: 'raci' },
 { domain: 'org', key: 'deliverable-types', version: pins['deliverable-types'], as: 'types' }]
```

Invoke forms use current refs (no `version`) in `inputLookups`, because seeds run after worker registration. 0.28 labels (`version: 'org-2026-11'`) are available for named org revisions; not used in Phase 1.

## 4. Facets

`program, phase, deliverable, kind, seat, domain, raci, round, ai, template, section`. `present()` drops `undefined` so `metadata @>` never matches a null. `SEAT_METADATA_SCHEMA` declares them as nullable with `additionalProperties: true`. Names avoid the `escalation.type` and `role` columns (`kind`, `seat`).

Priorities: decide and gate 1, work and review 2, board 4.

## 5. Payload contracts (zod in `contracts.ts`, parsed with `parseFormPayload` + `blankAsAbsent`)

```ts
type Handoff  = { handoff: { outcome: 'done'|'partly-done'|'blocked'; summary: string /* min 20 */;
                             blockerQuestion?: string /* required when blocked */;
                             assets?: { label: string; url: string }[];
                             decisions?: string; openQuestions?: string; nextSuggested?: string } };
type Review   = { review:   { verdict: 'accepted'|'changes-requested'; findings?: string /* required on changes */ } };
type Decision = { decision: { outcome: 'go-ahead'|'change-course'|'drop'|'rework'|'skip'|'stop';
                              notes?: string; rework?: string[] /* required when rework */ } };
type Gate     = { gate:     { verdict: 'approve'|'hold'; notes?: string /* required on hold */ } };
type Closing  = { closing:  { outcome: 'launched'|'stopped'|'stalled'|'cancelled'; summary?: string } };
type Item     = { item:     { key: string; kind: string; verdict: DeliverableVerdict; summary: string; round: number } };
type DeliverableVerdict = 'accepted'|'dropped'|'rounds-exhausted'|'stalled'|'cancelled';
```

Every resolution may also carry `$resolution: { escalationId, resolvedBy, resolvedByEmail? }`.

## 6. Forms

### 6.1 `SEAT_FORM_SCHEMA` (one form, four sections)

Root: `'x-lt-layout': 'two-column'`, `'x-lt-labels': { submit: 'Submit', cancel: false }`, `'x-lt-help'` with `{{envelope.section}}`, `{{metadata.program}}`, `{{metadata.round}}`, `'x-lt-order'` listing every field.

`envelope.section` is set at the envelope root beside `formDefaults`. Conditions on `envelope.*` are static (read from the stored row); `resolver.*` conditions are live and use the flat field name. Hidden fields are not required at submit, so one `required` array can list fields from every section.

| Section | Fields (flat name → bind) | Show when |
|---|---|---|
| always | `brief` (readOnly markdown, bind `brief`) | |
| work | `work_outcome` → `handoff.outcome` (done / partly-done / blocked) | `envelope.section=work` |
| | `work_blocker_question` → `handoff.blockerQuestion` | `[…=work, resolver.work_outcome=blocked]` |
| | `work_summary` → `handoff.summary` (textarea, minLength 20) | `…=work` |
| | `work_assets` → `handoff.assets` (json array of `{label,url}`) | `…=work` |
| | `work_decisions`, `work_open_questions`, `work_next` → `handoff.*` | `…=work` |
| review | `review_verdict` → `review.verdict` (accepted / changes-requested) | `envelope.section=review` |
| | `review_findings` → `review.findings` | `[…=review, resolver.review_verdict=changes-requested]` |
| decide | `decision_outcome` → `decision.outcome`, `'x-lt-options': 'envelope.decision_options'` | `envelope.section=decide` |
| | `decision_rework` → `decision.rework` (`type: array`, `'x-lt-options': 'lookup.types.items'`, chips) | `[…=decide, resolver.decision_outcome=rework]` |
| | `decision_notes` → `decision.notes` | `…=decide` |
| gate | `gate_verdict` → `gate.verdict` (approve / hold) | `envelope.section=gate` |
| | `gate_notes` → `gate.notes` | `[…=gate, resolver.gate_verdict=hold]` |

`required`: `work_outcome, work_blocker_question, work_summary, review_verdict, review_findings, decision_outcome, decision_rework, gate_verdict, gate_notes`.

`envelope.decision_options` lets the same decide section offer `go-ahead | change-course | drop` on a blocked deliverable and `rework | skip | stop` on a gate hold.

`SEAT_LIST_SCHEMA`: facet-table; columns Headline, Program, Phase, Kind, Section, Round, Holder (user), Waiting (age); `'x-lt-row-action': { action: 'claim', label: 'Open', durationMinutes: 240 }`.

### 6.2 `PROGRAM_FORM_SCHEMA` (org-programs)

Accumulator adds are validated against the container role's form, so the form accepts two payloads, switched on `resolver.item_key`:

- Item (from `recordDeliverable`): `item_key, item_kind, item_verdict, item_summary, item_round` → `item.*`, shown when `resolver.item_key`.
- Closing (by hand or by `closeProgram`): `closing_outcome` (launched / stopped / stalled / cancelled), `closing_summary` → `closing.*`, shown when `!resolver.item_key`.
- `brief` readOnly markdown; a roster: `'x-lt-widget': 'roster', 'x-lt-roster': { expected: { list: 'metadata.accumulate_keys' }, in: ['items'] }`.
- `'x-lt-labels': { submit: 'Close program', cancel: false }`.

`PROGRAM_LIST_SCHEMA`: Program, Headline, Template, Deliverables in (`metadata.accumulate_count`), Open for (age); row action `claim 'Open' 60`.

### 6.3 Invoke schemas

- `PROGRAM_INPUT_SCHEMA`: `program` (slug), `headline` (3..60), `template` (`'x-lt-options': 'lookup.programs.items'`), `brief` (markdown editor), `gateTimeoutHours` (default 168), `maxGateRounds` (default 3).
- `DELIVERABLE_INPUT_SCHEMA`: `key`, `kind` (`lookup.types.items`), `headline`, `brief`, `producer` and `reviewer` (`lookup.roles.items`), `ai` (optional override), `maxRounds` (default 3), `program?`, `phase?`, `programSignal?` (hidden).
- `ASK_INPUT_SCHEMA`: `seat` (`lookup.roles.items`), `headline`, `brief`, `options` (array of strings), `timeoutHours` (default 168), `program?`.
- `WORKBENCH_INPUT_LOOKUPS`: current refs for `roles`, `deliverable-types` (as `types`), `programs`.

## 7. Workflows (queue `claude-workbench`)

All waits have a timeout. Signal ids are scoped to the owning workflowId, which HotMesh keeps unique per invoke and preserves across `continueAsNew`.

```
board row:          `${programWfId}-board`                        (also the programBoard child's workflowId)
deliverable child:  `${programWfId}-p${phaseIndex}-${kind}-g${gateRound}`
work/decide/review: `${deliverableWfId}-r${round}-{work|decide|review}`
gate signer row:    `${programWfId}-p${phaseIndex}-g${gateRound}-${role}`
hold decision row:  `${programWfId}-p${phaseIndex}-g${gateRound}-decide`
ask row:            `${askWfId}-ask`
```

### 7.1 `deliverable`

Input: `{ program?, phase?, programSignal?, key, kind, headline, brief, producer, reviewer, ai, maxRounds, pins }`. Pure router in `steps.ts`; the workflow only parks what the router names.

| Step | Row | Result | Next |
|---|---|---|---|
| work | `producer` role, subtype `work`, raci responsible, AI assignment per `ai`, timeout 7d | `done` / `partly-done` | review |
| | | `blocked` | decide (options go-ahead / change-course / drop) |
| | | `false` (timeout) | the round counts (`expired`); next round |
| | | `null` | return `cancelled` |
| decide | `reviewer` role, subtype `decide`, raci accountable, priority 1, timeout 7d | `drop` | return `dropped` |
| | | `go-ahead` / `change-course` | next round, answer in the brief |
| review | `reviewer` role, subtype `review`, raci accountable, timeout 7d | `accepted` | return `accepted` with the handoff |
| | | `changes-requested` | next round, findings in the brief |

After `maxRounds` → `rounds-exhausted` (or `stalled` when the last round expired). On any return, if `programSignal` is set, `recordDeliverable` adds `{ item }` to the board as the coordinator (409 duplicate counts as done). Each round's brief is the original brief plus every earlier round's handoff, decision and findings (`brief.ts`).

### 7.2 `program` and `programBoard`

Input: `{ program, headline, brief, template, gateTimeoutHours, maxGateRounds }`. Carried state across `continueAsNew`: `{ input, pins, template, types, boardSignal, boardStarted, phaseIndex, gateRound, results }`.

1. First generation only: `pinOrgEditions()`; `readTemplate(pins, template)`; `startChild('programBoard', { workflowId: `${wfId}-board` })` before any other durable await; set `boardStarted`.
2. Phase `i`: `Promise.all(executeChild('deliverable', …))` for each deliverable kind, ids `${wfId}-p${i}-${kind}-g${gateRound}`, each with `programSignal: boardSignal` and producer/reviewer/ai from the pinned type.
3. Gate: one `conditional` per signing role, built in a single synchronous expression and awaited with `Promise.all`. Each: subtype `gate`, raci accountable, priority 1, timeout `gateTimeoutHours`. `false` → `{ verdict: 'hold', timedOut: true }`. Any `null` → `cancelled` after the siblings settle.
4. All approve → `phaseIndex + 1`, `gateRound = 1`, `continueAsNew`. Any hold → decide row at the owner role (options rework / skip / stop, timeout `gateTimeoutHours`): `rework` → re-run the named kinds with `gateRound + 1` and re-gate (cap `maxGateRounds`, then `stalled`); `skip` → next phase; `stop` → `stopped`. A `false` on the decide row → `stalled`.
5. After the last phase: `closeProgram({ signalKey: boardSignal, closing: { outcome: 'launched', summary } })` (coordinator; 404/409 tolerated) and return `{ program, outcome, phases: results }`.

`programBoard`: one `conditionalAccumulator(boardSignal, { role: 'org-programs', subtype: 'program', priority 4, accumulate: { unique: false }, timeout: '365d', lookups, metadata: { program, template }, envelope: { formDefaults: { brief } } })`; returns `{ program, closing, items }`. `unique: false` lets a reworked deliverable replace its item (same `itemKey`). Registered as a non-invocable worker.

### 7.3 `ask`

Input `{ seat, headline, brief, options, timeoutHours, program? }` → one decide row (`envelope.decision_options = options`) → returns `{ outcome: 'answered' | 'expired' | 'cancelled', decision? }`.

## 8. Activities (`activities.ts`)

All use `createClient({ auth: { userId: COORDINATOR_ID } })` and are safe to run twice.

- `pinOrgEditions(): Promise<OrgPins>`: `listEntryVersions` per key; throw if an edition is missing.
- `readTemplate({ pins, template })`: `getEntryVersion('org','programs', pins.programs)` and the pinned `deliverable-types`; return the template and the types, or throw.
- `recordDeliverable({ signalKey, item })`: `accumulateBySignalKey`; `status < 300` or 409 `duplicate-item` → `{ recorded: true }`.
- `closeProgram({ signalKey, closing })`: `resolveBySignalKey`; 404 / 409 → `{ closed: true }`.

## 9. Seeding and wiring

- `src/config/seed.ts`: `seedWorkbenchOrg()` = starter editions (insert-if-absent) + guide (compare-then-store) + `seedPersonas` + bot inserts + `assignPersona`. Non-fatal, logged.
- `src/config/hitl-roles.ts`: `...WORKBENCH_ROLES`.
- `src/config/workers.ts`: `program`, `deliverable`, `ask` (invocable, `invocationRoles: [...INVOCATION_ROLES, ...SEAT_ROLES]` so a bot holding a role can invoke `ask`, `inputLookups: WORKBENCH_INPUT_LOOKUPS`, icons, `reset: true`); `programBoard` (`invocable: false`).

## 10. Phase 2: the inbox layer

### 10.1 Intake and the item loop (implemented)

`src/workflows/claude-workbench/inbox/`. A holder has two roles: their inbox (`inbox-sam`, domain `people`, the decide queue) and their agent queue (`inbox-agent-sam`, domain `agents`, the act queue); one persona holds both, and an agent working the second acts as the holder over their MCP grant. Both share `SEAT_FORM_SCHEMA`, which gains two sections: `triage` (the holder's decision, with the classification editable in place) and `act` (the AI's result, whose fields follow `envelope.act`).

- **Editions** under `org/`: `inbox-kinds`, `inbox-categories`, `inbox-needs`, `inbox-rules` (`{ when: {kind?, category?, need?, raci?}, suggests: {decision, guidance?, replyMode?} }`, first full match wins), `inbox-corrections` (append-capped at 200), and the code-owned `inbox-triage-guide`. Inbox rows carry current refs (`INBOX_LOOKUPS`), so an open row reads today's lists.
- **`inboxSweep`** (`{ holder, source, intervalMinutes, maxItems, watermark }`): per gate, one `check` row in the holder's agent queue, carrying the watermark in its envelope. The AI resolves `{ act: { outcome: 'done', checkedThrough, items } }`; `admit()` reads each item against the vocabulary in force (unknown kind refused, out-of-vocabulary facets dropped, the rules' suggestion attached) and starts one `inboxItem` per item by `startChild` with an id derived from the source (`inbox-<holder>-<source>-<channel>-<thread>`), so a repeat is a no-op. The watermark only moves forward. 24 checks per generation, then `continueAsNew`.
- **`inboxItem`** (an `ItemSpec`, or `{ state }` on continuation): rounds of one row each. A decide row in the holder's inbox (`subtype` = the view: `triage`, `draft`, `findings`, `outcome`, `waiting`; `envelope.decision_options` per view; `formDefaults.triage` pre-filled with the suggestion and the current classification) or an act row in the holder's agent queue (`subtype` = the act: `reply`, `draft`, `investigate`, `file-ticket`, `delegate`). `steps.ts` is the pure router: handle/dismiss close; reply routes by mode (verbatim or AI posts → `reply`, AI drafts → `draft`); investigate → `findings`; on findings, `apply` ("Do it as proposed") → the `apply` act carries the findings out → `outcome`; file-ticket → `ticketed`; delegate → `waiting`; a failed, cancelled or expired act returns as `outcome`. A decide timeout re-parks the same view; a cancel closes `cancelled`. Changing category, need or RACI on submit records a correction (keyed by the row's signal id) and re-files the item. 12 rounds per generation, then `continueAsNew`.
- **Stage facet**: every decide row carries `stage`: `new` (triage, actionable), `fyi` (triage, informed or read-only), `returned` (draft, findings, outcome), `waiting`. The inbox role's pins are Next (`stage=new`), Back to you (`returned`), Waiting on others, FYI, each ordered by priority then age; the agent role's pins are Acts and Checks.
- **Pre-assignment**: every inbox and agent row opens with `assignee` set to the holder's account (looked up once by the holder's email; a durable routing hint with no claim window). The row stays available, appears under the holder's own items, and the holder or their agent resolves it without a claim. Holders without an account yet get unassigned rows.
- **Signal ids**: `${wfId}-g${generation}-r${round}` (items) and `${wfId}-g${generation}-c${gate}` (sweeps).
- **Holders**: `WORKBENCH_INBOX_HOLDERS` (env, default `sam`) lists domains, emails and bare names. A name or an email is a holder whose roles exist from boot: `inbox-<name>` in `people` and `inbox-agent-<name>` in `agents` (the whole email encoded in the role alphabet `[a-z][a-z0-9_-]*`: `ana.ruiz@example.com` is `ana-ruiz-at-example-com`), with one persona `<name>` holding both. A domain is a rule: `src/config/inbox-holders.ts` reads the active accounts at boot and every `WORKBENCH_INBOX_BIND_SECONDS` (default 15), and an account whose email is in the domain, or equals a listed email, and lacks its persona gets its two roles (created through the roles API with the same seat config the code-owned roles use), its persona and the assignment. Pure parts (`holderForEmail`, `unboundHolders`) are unit-tested; the binder re-applies the seat config to the roles it made at each boot, so a form change reaches them like any code-owned role. Invocation: the worker builds its code-owned `inboxSweep` and `inboxItem` configs with every bound holder's roles appended (`workersWithHolders(await boundHolderRoles())`), and each binder pass widens the stored lists for holders bound since (`widenedInvocationRoles`). Inside both workflows `refusalFor(envelope, holder)` reads the principal Long Tail stamps on `envelope.lt` and returns `{ refused }` unless the caller holds the named inbox (or its agent queue) or an admin or superadmin grant; a run without `lt` (a child, a continuation) is trusted. A sweep's first check looks back `lookbackHours` (default 36) when no watermark is given; the watermark is minted in an activity.
- **Personas**: `claude-at-work` holds `ai-engineering-platform` only; the inbox needs no bot identity. The bot row is seeded with `metadata.account_type = 'bot'` as well as the column, which is what the bot-accounts API checks before it issues a key.
- **Tests**: `tests/unit/workflows/claude-workbench/inbox/{steps,admission,forms,brief}.test.ts`; `tests/integration/workbench-inbox.test.ts` (an item decided, acted on in the holder's agent queue, re-filed, closed, and its correction recorded; a sweep whose check is resolved with one good item and one refused, the item parked for the holder and dismissed, the sweep terminated).

### 10.2 Outline: rollup, ties, delegation (next)

- **Rollup**: a `rollup` workflow per personal inbox role, singleton `rollup-<role>`, one generation per day. Each day it parks an act row for the AI (`section: rollup-fill`, result `{ rollup: { important, coming, since, waiting } }` against the rollup template edition) and then a standing accumulator row in the personal inbox role (`subtype today`, roster of blocks) that the holder acknowledges; events (`system.escalation.*.*.resolved` filtered by subtype) add items to it through an agent subscription. `continueAsNew` at midnight in the holder's time zone.
- **Ties**: `ties` is a facet array on items (`{ kind: 'issue'|'thread'|'escalation', ref, url }` folded to `tie:<kind>:<ref>` strings for `metadata @>`). A `tieCheck` sweep (singleton per role) parks a check act with the watermark; the AI resolves `{ changes: [{ tie, what, when }] }`; the activity routes each change to its item (append to the brief, re-open via a new generation when closed). Write-backs are acts with `section: write-back` and `envelope.channels`.
- **Delegation**: a `delegate` decision on any item (targets: roles from `lookup.roles.items`, people, external; channels from `lookup.channels.items`). The act row's form shows one result block per chosen channel (`'x-lt-showIf': 'envelope.channels.<channel>'`); the AI resolves `{ delegation: { results: [{ channel, target, ref, url }] } }`; each result becomes a tie; the `inbox` channel starts a `deliverable` of kind `delegation` in the target role; the originator's item moves to `waiting` and later `delivered` (accept / changes / stop).

## 11. Tests

Unit (`tests/unit/workflows/claude-workbench/`), all pure or via `violationsOf`:

- `seat-form.test.ts`: per section, the right fields fail and the other sections never block; `blocked` requires `work_blocker_question`; `changes-requested` requires `review_findings`; `rework` requires `decision_rework`; `hold` requires `gate_notes`; `cancel: false`.
- `program-form.test.ts`: item payload passes without closing fields; closing requires `closing_outcome`.
- `invoke.test.ts`: slug pattern, headline length, template/kind/seat option membership with a lookup context.
- `contracts.test.ts`: zod parses each section; blanks become absent.
- `steps.test.ts`: every route in 7.1 and the gate/hold logic in 7.2.
- `facets.test.ts`, `brief.test.ts`, `org.test.ts` (every template kind exists; producer ≠ reviewer; every gate signer and owner is a role; every item has `value` and `label`), `personas.test.ts` (ai-* is write-self; member-* reads its domain; the bot holds exactly its persona).

Integration (`tests/integration/workbench.test.ts`, superadmin, helpers from `hitl-helpers.ts` plus `pendingBySubtype`):

1. `ask` → `product` decide row → resolve `{ decision: { outcome: 'go-ahead' } }` → result `answered`.
2. `deliverable` (`demo-note`): malformed handoff → 422 naming `work_blocker_question`, `work_summary`; valid `done` → review row in `product` → `accepted` → result `rounds: 1`.
3. `program` with `demo`: board row pending in `org-programs`; work → review → gate `approve` → result `launched`; board items show `demo-note`; board resolved with `closing.outcome 'launched'`; the gate row's `/lookups` shows `org/deliverable-types` pinned (`current: false`).

## 12. Files

```
src/workflows/claude-workbench/
  README.md  types.ts  org.ts  org-guide.ts  contracts.ts  facets.ts  brief.ts  steps.ts
  roles.ts  personas.ts  activities.ts  deliverable.ts  program.ts  ask.ts  index.ts
  forms/seat-form.ts  forms/program-form.ts  forms/invoke.ts  forms/index.ts
tests/unit/workflows/claude-workbench/*.test.ts
tests/integration/workbench.test.ts
docs/workbench/PRD.md  docs/workbench/TDD.md
```

## 13. Risks

- `write-self` depends on durable `assigned_to`; a human claim flips it and the bot loses the row. Intended, documented in the guide.
- Accumulator adds are validated against `PROGRAM_FORM_SCHEMA`; a schema change that breaks the item payload breaks `recordDeliverable`. Covered by `program-form.test.ts`.
- `pinOrgEditions` runs before the API container's seed on a cold start; the activity retries until the editions exist.
- Eleven roles share one form object; a form change advances eleven versions. Acceptable; it is the point.
