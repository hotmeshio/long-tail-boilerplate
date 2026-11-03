# claude-workbench: an organization as queues

A shared work surface where a person decides and an AI acts, with every handoff written down.

Everything that arrives becomes a row with four facts attached: what it is, what it needs, which RACI role you hold on it, and what happens next. The row opens on a suggested decision; you confirm or override in one submit. Every act the AI takes has a typed result you can read, a link to where it landed, and a return to you. Re-file an item and the correction is an edition the AI reads before it classifies again. The acts run under your own grants to your own tools, so the AI's reach is exactly yours.

The backend does three things: durable rows with a versioned form, claims so two actors never double-work, and knowledge editions so vocabulary and corrections outlive any one session. Chat, documents, the issue tracker and the calendar stay where they are; the inbox is the actionable layer over them, reached through the MCP grants you already gave your agent.

The same shape scales from a person to an org. Every seat is a Long Tail role with a queue and a versioned form; every handoff between seats is a validated payload; every program is phases of deliverables closed by gates. Humans and AI hold seats the same way, so moving work from one to the other is a persona change, not a rewrite. The person always decides, and the decision is always one submit.

Design: [docs/workbench/PRD.md](../../../docs/workbench/PRD.md) (the actionable inbox, in user-experience terms) and [docs/workbench/TDD.md](../../../docs/workbench/TDD.md) (shapes, ids, forms, tests).

## The pieces

| Piece | Where | What it is |
|---|---|---|
| Roles | `types.ts` `ORG_ROLES`, `roles.ts` | Eleven seats (`product`, `design`, `engineering-execution`, `engineering-lab`, `engineering-platform`, `engineering-leadership`, `sre`, `quality`, `sales`, `support`, `inbox-sam`) grouped into domains, plus `org-programs` for boards. All seats share one form and one list page. |
| Personas | `personas.ts` | A persona is a collection of roles. `member-<role>` writes its queue and reads its domain; `ai-<role>` acts only on rows assigned to it; `sam` shows one person's collection; `org-coordinator` writes boards. |
| Org editions | `org.ts`, `org-guide.ts` | Knowledge under `org/`: roles, RACI, channels, deliverable types (producer, reviewer, AI mode), program templates, and the handoff guide. Seeded once; edited since. Programs pin the editions they started under. |
| The seat form | `forms/seat-form.ts` | One schema, four sections (work, review, decide, gate); the row's `envelope.section` picks which shows. Hidden fields are never required; there is no cancel. |
| Workflows | `deliverable.ts`, `program.ts`, `ask.ts` | A deliverable runs work and review rounds between two roles. A program runs phases of deliverables and per-role gates, with a board row that finished deliverables join. An ask parks one decision in any role. |
| The inbox | `inbox/` | Intake and the item loop. A **sweep** parks a check act for the AI on a schedule; the AI resolves it with the items it found; each becomes an **item** that parks a decide row in the holder's inbox (`inbox-sam`), an act row in the inbox's own agent queue (`inbox-agent-sam`), and back, until it closes. Both queues belong to the holder's persona, and every row opens pre-assigned to the holder's account, so it shows under their own items and needs no claim; an agent working them over MCP acts as the holder. Vocabulary, rules, corrections and the triage guide are `org/inbox-*` editions. |
| Routing | `steps.ts`, `brief.ts`, `facets.ts`, `contracts.ts` | Pure functions: where an answer goes next, what the next brief says, which facets a row carries, how a payload parses. The workflows only park what these name. |

## Try it

1. Start the stack and sign in as `superadmin`. The seats appear under roles with pins for Work, Reviews, Decisions, Gates, the domain, and Programs.
2. **Invoke Tool → Ask.** Pick `product`, write a question. A decide row appears in `product`; claim it, pick an option, submit. The workflow result holds the decision and who made it.
3. **Invoke Tool → Deliverable.** Key `tdd-sync`, kind `tdd`. A work row appears in `engineering-platform` (the type's producer), pre-assigned to the example bot for four hours because the type is `ai: eligible`. Claim it as superadmin anyway, hand off `done` with a summary and an asset. A review row appears in `sre` (the reviewer). Request changes with findings: a second work row appears, its brief carrying your findings. Accept the next one: the deliverable returns `accepted`.
4. **Invoke Tool → Program.** Slug `demo-1`, template `demo`. The board appears in `org-programs`; the one deliverable appears in `engineering-platform`; its review in `product`; then the gate in `product`. Approve it: the program returns `launched` and the board closes with the deliverable on its roster.
5. **Invoke Tool → Inbox Item.** Inbox `inbox-sam`, kind `request`, need `approve`, role `accountable`. A triage row appears in `inbox-sam`, opened on the decision the rules suggest, with the classification editable in place. Pick *Investigate and report back*: an act row appears in `inbox-agent-sam`. Resolve it (as the holder, or as superadmin) with findings: the item comes back to `inbox-sam` as a Findings row. Pick *I will handle it* and the item closes. Changing the category, need or role on the way records a correction in `org/inbox-corrections`.
6. **Invoke Tool → Inbox Sweep.** Inbox `inbox-sam`, source `slack`, every 15 minutes. A `check` row appears in `inbox-agent-sam` with the watermark; the AI resolves it with what it found (`act.items`), each item becomes a triage row in `inbox-sam`, and the sweep rests until the next check. Stop it with **Terminate** on the run.
7. **Invoke Tool → Inbox Preferences.** Inbox `inbox-sam`. A "Your reactions" row appears in `inbox-sam`, pre-filled with the org defaults: one paste box per meaning (Done, Approved, On it, Read, Not mine, Ticket), what a Read emoji closes, what a reply means, and which of your roles a reaction may close. Submit: it is saved as `org/inbox-reactions-sam`, one edition per save. From then on the AI reads it at the start of every pass and closes, parks or files open items from the holder's own emoji on the source message (`inbox/reactions.ts` is the rule; the guide's "Before anything" section is the agent's copy). A new holder bound from a domain rule gets this row first, so the first thing they see is what their inbox can do.
8. Try `software-launch` with the same steps. Five phases, two deliverables each, gates signed by two or three roles. Hold a gate to see the owner's rework decision.

## Claude as a role holder

The example bot `claude-at-work` holds `ai-engineering-platform` (write-self). To let it work:

1. As superadmin, `create_bot_api_key { id: "0d000000-0000-4000-8000-000000000011", name: "claude", scopes: ["mcp:read", "mcp:full"] }` over MCP, or `POST /api/bot-accounts/:id/api-keys`.
2. Give Claude Code the key: `claude mcp add --transport http workbench-bot http://localhost:3030/mcp --header "Authorization: Bearer lt_bot_..."`.
3. Claude follows the handoff guide for deliverables and the triage guide (`get_knowledge { domain: "org", key: "inbox-triage-guide" }`) for inbox acts: it finds the rows in the holder's agent queue (`inbox-agent-<holder>`), claims one, reads the brief, does the work with its own tools (chat, issue tracker, calendar), and resolves `{ act: {...} }`. For the inbox it needs no identity of its own: it acts as the holder through their MCP grant.
4. Claude follows the handoff guide (`get_knowledge { domain: "org", key: "handoff-guide" }`): find its rows, claim, work, resolve `{ handoff: {...} }`. Rows it may not act on are not available to it; a malformed handoff comes back as a 422 naming the fields.

Three modes, all data:

| Mode | How |
|---|---|
| Alongside | Also assign the bot `member-engineering-platform`; it competes with people for any row |
| Facet-only | Leave it on `ai-engineering-platform`; it gets the rows whose deliverable type says `ai: eligible` or `only`, for the type's first-right window |
| Alone | Assign no person `member-engineering-platform` |

## What's next: the inbox pins

An inbox's sidebar is organized by actionability, not by mechanics. Every row carries a `stage` facet and the pins filter on it, soonest first (priority, then age):

| Pin | Shows |
|---|---|
| **Next** | Items that need your first decision (`stage=new`): mentions, requests, questions, tickets, from every source |
| **Back to you** | What your agent brought back: a draft to post, findings to act on, an outcome to close |
| **Waiting on others** | What you handed off or are watching |
| **FYI** | Filed as informed or read-only; nothing to do |

The agent queue has **Acts** (what your agent should do next) and **Checks** (the scheduled source checks).

## The front door

`src/config/domain-dictionary.ts` is registered as the deployment's domain dictionary. `get_domain_context` (the first call an MCP client makes) returns the terms (seat, holder, item, program, the facets and their values), each workflow's id convention and kill road, and the runbooks: *work the inbox*, *what is in an inbox*, *work a seat*, *start a sweep for a holder*, *stop one item*. Each runbook's first step names the knowledge edition with the standing rules. Role verb semantics (what cancel and expiry mean per role) ride the roles themselves.

## Your own inbox

Who gets a personal inbox is `WORKBENCH_INBOX_HOLDERS` in `.env` (comma-separated; default `sam`). Three kinds of entry:

| Entry | What it does |
|---|---|
| `example.com` | A rule. Every account that signs in with an email in that domain is bound to an inbox of its own the first time the binder sees it (at boot, then every 15 seconds in the api process; `WORKBENCH_INBOX_BIND_SECONDS`). Pair it with `OAUTH_AUTO_PROVISION=true` so people in the domain sign in with Google, GitHub or Microsoft and arrive bound, with no admin step. |
| `ana.ruiz@example.com` | One person. The roles exist from boot; the account that carries that email is bound when it appears. |
| `sam` | A name with no account; the public code keeps this fictional one. |

A sign-in email becomes the seat `inbox-ana-ruiz-at-example-com` and its agent queue `inbox-agent-ana-ruiz-at-example-com` (the whole email in the role alphabet `[a-z0-9_-]`, so holders from different domains never collide and the names are URL-safe), and the persona `ana-ruiz-at-example-com` holding both. Accounts outside the list get nothing: no roles, no persona, no inbox. `src/config/inbox-holders.ts` is the binder; the roles it makes carry the same seat form and pins as the code-declared ones and are refreshed from code at every boot. The binder also opens `inboxSweep` and `inboxItem` to every bound holder's roles, so a holder (or their agent acting as them) starts their own sweep and adds their own notes; both workflows refuse a caller who names an inbox they do not hold, unless the caller is an admin or superadmin.

## What changes without a deploy

Edit an edition and the next row uses it: a new deliverable type, a new program template, a type's producer or AI mode, the handoff guide. Running programs keep the editions they pinned. Adding a seat is one entry in `ORG_ROLES` (it needs a form, so it is code).

## Tests

- `tests/unit/workflows/claude-workbench/`: every section of the seat form through Long Tail's own validator, the pure routers, the facets and ids, the editions' consistency (every template kind exists, producer and reviewer differ, every signer is a role), the personas.
- `tests/integration/workbench.test.ts`: ask, a deliverable through work and review, a malformed handoff refused with its fields, and the `demo` program from invoke to `launched` with its board.
