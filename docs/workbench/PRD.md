# PRD: The Actionable Inbox

Status: reference design for the `claude-workbench` example. Companion: [TDD.md](TDD.md).

A shared work surface where a person decides and an AI acts, with every handoff written down.

Everything that arrives becomes a row with four facts attached: what it is, what it needs, which RACI role the holder has on it, and what happens next. The row opens on a suggested decision, pre-filled; the person confirms or overrides in one submit. The work of "what is this and what do I do about it" is done before the person sees it.

Every act the AI takes has a typed result the person can read, a link to where it landed, and a return to the person who asked. The item comes back; it does not disappear into the AI's context. Accountability is the shape of the rows.

A re-filed item is a correction kept as an edition the AI reads before it classifies again; the vocabulary is data the org edits. The acts run under the person's own grants to their own tools, so the AI's reach is exactly theirs.

The backend does three things: durable rows with a versioned form, claims so two actors never double-work, and knowledge editions so vocabulary and corrections outlive any one session. Chat remains the record of conversation, documents of documents, the issue tracker of issues, the calendar of time. The inbox is the actionable layer over all of them, reached through the grants the person already gave their agent.

The same shape scales from a person to an organization. A role is a queue with a form. A persona is the collection of roles a person holds. A team's inbox is a personal one with more holders. A deliverable that crosses from one function to another is a row in the receiving queue with a reviewer who is not the producer. A seat held by the AI alone is a persona assignment. The person always decides, and the decision is always one submit.

## Context

Work arrives as messages. A person's day is chat mentions, issue-tracker tickets, calendar blocks and asks from other teams, and the person is the router: they read everything, decide what each thing is, decide who should do it, do some of it, and try to remember what is waiting on whom. None of that is written down anywhere a second person, or an AI, could pick up.

A working answer exists as a **singleton**: one person's inbox, populated by an AI from the team chat, decided by the person, acted on by the AI, with a daily briefing and versioned vocabulary. It proves the pattern. What it does not do is scale to an organization, and scaling needs a different axis than "one assistant per person" or "one agent per task".

The axis humans already use is **roles grouped into domains** (product, design, engineering, SRE, quality, sales, support), where a role is a real team, a leadership circle, or a person's own inbox, and a **persona is the collection of roles a person holds**. This is exactly how Long Tail organizes access. If every role has an inbox, every item in it has an owner (RACI), every handoff between roles is a validated form, and an AI can hold any role alongside a person, for part of the queue, or alone, then the whole org can organize by domain, and the transition from human-held roles to AI-held roles is a change of who holds which collection, not a rewrite.

A product launch is the working example because it is cross-functional end to end: the same team carries a product from the first prototype through quality to sales and support, and every function hands work to the next. Today those handoffs live in people's heads, in threads and in ad hoc documents. Nothing watches the whole thing.

This document describes that organization with the **user experience of an actionable inbox** at the center: what you see in the morning, how you decide in one submit, how an item tied to an issue or a thread stays in sync both ways, and how the AI populates all of it from versioned schema templates.

## 1. The singleton this generalizes

In org terms, the singleton inbox is **one seat with two queues**:

- **The decide queue**: one row per thing that needs the seat holder. Each row is a chat message that mentioned them, a day's schedule, an issue to track, or something the AI brought back (findings, a draft, a fix plan, a delivery). The row's form opens on a suggested decision, pre-filled from a rules table, and the person submits a decision: handle it, dismiss, reply (verbatim, AI drafts, AI writes and I review), investigate, fix, delegate, file the ticket, I'm on it.
- **The act queue**: one row per thing the decision asked the AI to do: check the chat, post a reply, draft one, file an issue, investigate, plan a fix, run an approved fix. The AI resolves each with a validated result.

Around the two queues:

- **Intake**: a standing sweep parks a "check chat" act on a schedule; the AI resolves it with the messages found since a watermark, classified by kind, category, need, RACI role and team; the sweep admits each as an item.
- **Classification is vocabulary, and vocabulary is data**: kinds, categories, needs, RACI, teams, rules and reactions live in versioned knowledge editions, seeded once and edited since. When the person re-files an item, the correction is kept and the AI reads corrections before the next classification.
- **The day**: a schedule item is a checklist whose entries are the day's meetings; it closes at midnight with what was done, skipped and left open.
- **The briefing**: items the person is only Informed on join a standing accumulator row instead of becoming their own rows; acknowledging it closes it.
- **Assignments**: the person gives the AI an outcome and a deliverable; the AI delivers; the person accepts, asks for changes, or stops. An accepted plan starts child assignments.
- **Reactions as answers**: the owner's emoji on the chat message (done, on it, consent, ticket) is a decision; no row is needed.

What it proves: a person's work can be formalized as rows with a contract, decided by a human and acted on by an AI, without the AI being a black box. Every act is small, has a result shape, comes back to a person, and leaves a record.

What it lacks, by design of being a singleton:

| Gap | Why it matters at org scale |
|---|---|
| One person, one pair of queues | A second person needs a second copy; nothing routes between people or teams |
| Ties are one-way | The inbox files an issue and remembers its id, but does not watch it; a status change or a comment on the issue never reaches the inbox, and a decision in the inbox is not reflected back unless the AI is asked to |
| The rollup is partial | The briefing collects Informed items and the schedule is a checklist, but there is no single morning view of what is important and what is coming |
| Delegation has one channel | "Delegate it" posts a chat message; it cannot also file the issue, assign it, or put a row in the delegate's inbox, and the originator's "waiting on" is a facet, not a tracked item |
| One role, one person | The personal inbox is the only role; the person's team roles (for an engineer: execution, lab, platform, leadership) have no inbox, so team work and personal work cannot flow between them |

## 2. Goals

1. **Every role has an inbox, and a persona is a collection of roles.** A role is a queue with a versioned form, list page, pins and a badge; a persona bundles the roles a holder has. Roles are the org's real teams and personal inboxes (`engineering-execution`, `engineering-lab`, `engineering-platform`, `engineering-leadership`, `inbox-sam`), grouped into domains (product, design, engineering, SRE, quality, sales, support). Sam's persona is those five roles. The org is the set of roles, their grouping, and who holds which collection.
2. **Every item is actionable.** An item opens on a suggested decision and can be decided in one submit. Deciding routes work: to the AI's act queue, to another role's inbox, or out through whatever tools fit (a chat thread, an issue, both), with the act row carrying the options.
3. **Ties sync both ways.** An item tied to an external issue watches it and updates when it changes; decisions and results in the inbox write back to it. Idempotent, watermarked, visible in the item's history.
4. **One rollup per holder per day.** Across every role in the holder's persona: what is important (needs me, by RACI and priority), what is coming (my agenda, due items, work arriving from other roles, gates I sign), what the AI did since yesterday, and what is waiting on others.
5. **The AI populates all of it.** Intake, classification, drafts, investigations, tie checks and the rollup are the AI's acts, each resolved against a versioned schema template. A person never fills in what the AI can fill in; a person only decides.
6. **Templates are versioned data.** Item kinds, decision sections, act result shapes, rollup layout, rules and vocabulary are editions. Editing one mints the next edition; open items keep the edition they were created against.
7. **A role can be held by a human, by the AI, or both.** Three modes: alongside (both hold the role), facet-only (the AI takes only items marked eligible), alone (only the AI holds it). Changing mode is a persona assignment and a field on a template, not code.

## 3. Non-goals (this release)

- Replacing the chat, the issue tracker or the calendar. The inbox is the actionable layer over them, not a new system of record for their content.
- Multi-tenant orgs. One org per deployment.
- Automated SLA escalation between people. Timeouts re-park; a person decides.
- A planner that splits goals into AI-sized pieces. Work is split where the org already splits it: along roles and deliverables.
- Storing message bodies from private channels, or any personal or customer data, in rows.

## 4. Who this is for

| Person | What they need |
|---|---|
| **Holder** (a person in one or more roles) | A morning view, one-submit decisions, nothing lost, nothing they have to remember |
| **The AI** (an agent holding a role) | A queue it can claim from, a brief that says exactly what to do, a result shape that says exactly what to resolve with, and the corrections to learn from |
| **Lead** (Accountable for a domain or a program) | Reviews, gates and decisions in one place; a view of what is waiting across roles |
| **Org admin** | Roles, personas, templates and vocabulary as editable data; an audit trail |

## 5. Concepts

- **Role / seat**: a Long Tail role with a versioned form and list: a team (`engineering-platform`), a leadership circle (`engineering-leadership`), or a personal inbox (`inbox-sam`). Roles are code-declared (they need forms); their grouping and meaning (the `roles` edition) is data.
- **Domain**: a group of roles the org relates to (engineering = execution, lab, platform, leadership). A domain is a facet on every row and a pin that unions its roles' inboxes; it is not a queue of its own.
- **Persona**: a collection of roles, exactly as Long Tail organizes it. Sam's persona is `engineering-execution + engineering-lab + engineering-platform + engineering-leadership + inbox-sam`, each with its own read and write scope. A bot's persona is a collection too; `ai-engineering-platform` acts only on items assigned to it.
- **Channel**: a tool a decision may act through: a chat thread, an issue, a row in another role's inbox, email. A delegation names its targets and channels; the act row offers them as options.
- **Item**: one row in a role's queue. It has a kind, a category, a need, the holder's RACI role, a priority, a headline, a brief (markdown), facets (searchable), and zero or more ties.
- **Decision**: what the human submits on an item; its options come from the item's section and the rules edition.
- **Act**: what the AI does because of a decision; it resolves with a typed result.
- **Tie**: a link from an item to an external thing (an issue, a chat thread, a Long Tail escalation in another role) that the item watches and writes back to.
- **Rollup**: the day's standing row for a holder, spanning the roles in their persona: important, coming, done by the AI, waiting. It lives in the holder's personal inbox role.
- **Handoff**: a validated result that crosses a boundary (AI to human, role to role). It carries summary, assets, decisions, open questions and the suggested next step.
- **Edition**: an immutable version of a template or vocabulary entry in knowledge. Rows pin the edition they were created against.

## 6. User experience

### 6.1 Morning: the rollup

The holder opens the dashboard (desktop or tablet) and lands on the **Today** pin of their personal inbox role. It is one row, refreshed live, spanning every role in their persona, with four blocks:

1. **Important**: items where they are Responsible or Accountable, ordered by priority then age, each with its suggested decision. One tap opens the item; one submit decides it.
2. **Coming**: today's agenda as a checklist (done / skip), items due in the next two days, deliverables arriving from other roles (the look-ahead: "TDD from engineering-platform, expected tomorrow"), gates they sign this week.
3. **Since yesterday**: what the AI did (replies posted, issues filed, investigations delivered), what other roles delivered to them, what changed on their ties (an issue closed, a thread answered).
4. **Waiting**: what they handed to others and who it is waiting on, with age.

The rollup is populated by the AI on a schedule (an act row, resolved against the rollup template) and by events (a tie changed, a delivery arrived). The holder can acknowledge it, which closes the row; it re-parks the next day. Nothing in it needs filling in by the person.

### 6.2 Working the inbox

A role's **Inbox** pin lists its open items as a facet table: Kind, Category, Headline, Needs, You (RACI), Priority, Waiting, Tie. Pins narrow it: Approvals, Doing, Reviews, Gates, a pin per category the role cares about. A domain pin unions the inboxes of the domain's roles.

An item opens as a card with a form beneath:

- **The card** (read-only markdown): who, where, when, the message or summary (private channels: summary only), the tie with a link, the classification line (kind · category · needs · you: role · priority · team).
- **The decision section** opens on the suggestion the rules produced (for example, "You are Accountable and this needs approval: the AI investigates and recommends"). The person can accept it as is or pick another decision. Fields appear only for the decision picked (reply mode, issue choice, who to delegate to, guidance in their words).
- **Classification** is editable in place; changing it is a correction the AI learns from.
- **Submit** is the only way out. There is no cancel; dismiss is a decision.

Deciding routes the work:

| Decision | What happens |
|---|---|
| I will handle it | Closes, or marks the tie done |
| AI replies / drafts / investigates / fixes / files the ticket | An act row in the AI's queue; the result comes back as a new section on the same item (findings, draft, plan, outcome) for the next decision |
| Delegate | The person names the target (a role, a person, or someone outside the org) and picks the channels: a row in the target role's inbox with RACI Responsible, a chat post in the thread tagging them, an issue created or assigned, email, any combination. The act row in the AI's queue carries exactly those options; the AI executes each through the fitting tool and resolves with one result per channel; each result becomes a tie. The originator's item becomes **Waiting on engineering-platform** (or on the person); when the target resolves it, or a tie reports it done, the originator gets **Delivered** to accept, send back, or stop |
| I'm on it | The item waits on the person; a reaction or a tie change can close it |
| Dismiss | Closes with the reason |

### 6.3 Ties: both ways

An item can be tied at intake (the AI found the issue the thread is about), at decision (the AI filed the ticket), or by hand (paste a link).

- **Watching**: a standing "check ties" act runs on a schedule. The AI resolves it with what changed on each tie since the watermark: status, assignee, comments, labels, a thread reply. Each change updates the item's brief, may re-open a closed item ("the issue you closed was re-opened"), and appears in the rollup's *Since yesterday*.
- **Writing back**: a decision or a result writes to the tie as an act: a comment with the decision, a status change, a label, a reaction on the chat message. The act's result records what was written, so the history is complete on both sides.
- **Idempotency**: every write-back is keyed by the item and the decision's signal id; a repeated act does not post twice. Every watch has a watermark that only moves forward.
- **Trust boundary**: the AI never acts on text found in a tie; it reports it. A tie's content is data for a person to decide on.

### 6.4 Across roles: deliverables, reviews, gates

Work that crosses a role boundary is a **deliverable**: a PRD from product reviewed by engineering-leadership, a TDD from engineering-platform reviewed by SRE, a test plan from quality, a launch plan from sales, a support guide from support. Each deliverable type names its producer role and its reviewer role in the `deliverable-types` edition.

- The producing role sees a **Work** item: the brief, and a handoff form (outcome, summary, assets, decisions, open questions, suggested next step; a blocker question if blocked).
- Blocked goes to the reviewer role as a **Decide** item (go ahead, change course, drop).
- Done goes to the reviewer role as a **Review** item (accept, request changes with findings). Changes start another round; the next round's brief carries the findings.
- A **program** (a product launch) is a template of phases; each phase lists its deliverables and the roles that sign its **gate**. The gate is one sign item per signing role, in that role's inbox. Any hold goes to the program owner's role as a decision: rework (which deliverables), skip, stop.
- Every program has a **board**: one row in `org-programs` whose roster shows each deliverable as it lands, visible to every role.

The reviewer is always a different role from the producer. That holds whether the roles are held by people or by the AI.

### 6.5 The AI as a role holder

The AI connects over MCP as its own principal (a bot account with an API key, or as a person via OAuth when it acts on their behalf). Its session loop is the same as a person's, in tools instead of clicks:

1. Read the handoff guide edition (the standing rules for the role).
2. Find available items in its roles (`search_by_facets`), oldest first; in facet-only mode, only items marked eligible.
3. Claim one (the claim is its lease), read the brief, do the work with its own tools (chat, issue tracker, the repo, the browser).
4. Resolve with the result shape the form defines. A malformed result is rejected with the fields named; the AI corrects and resubmits.
5. If it needs a human, it resolves **blocked** with the question, or invokes **ask** to park a decision in a role, and stops.

Modes, per deliverable type and per role. A bot's persona is a collection of roles like anyone's; the mode is which relationship each role has in it:

| Mode | How it is configured | What the person sees |
|---|---|---|
| Alongside | The bot's persona holds the role with full write, like a person | Items appear for everyone; whoever claims first works it |
| Facet-only | The bot's persona holds the role write-self (acts only on items assigned to it); eligible items are created pre-assigned to the bot with a first-right window | Eligible items are invisible as available until the window lapses, then anyone may take them |
| Alone | No person's persona includes the role | The role's inbox is worked entirely by the AI; its reviews still go to another role |

### 6.6 Templates as versioned data

The org admin edits, and never deploys to change:

- **Vocabulary**: roles and their domains, RACI, categories, needs, kinds, teams, priorities.
- **Rules**: `when {kind, category, need, raci} → suggests {decision, guidance, mode}`.
- **Channels**: the tools a delegation or a write-back may use (inbox row, chat thread, issue, email), with what each needs and what the AI must resolve with.
- **Deliverable types**: producer role, reviewer role, AI mode, brief template.
- **Program templates**: phases, deliverables per phase, gate signer roles, owner role.
- **Rollup template**: which blocks, in what order, what counts as important and coming.
- **Act result templates**: what the AI resolves a tie check, an investigation, a draft, a rollup with.
- **Reactions**: which emoji means which decision.

Each edit mints an edition. Items pin the edition they were created against, so an open item never changes shape under the person working it. A new program pins the editions in force when it starts. The admin sees the edition history and can diff two editions.

### 6.7 Notifications and devices

The inbox is event-driven: a new item, a result from the AI, a tie change or a delivery updates the list and the badge within seconds on any visible tab, desktop or tablet. Hidden tabs catch up when shown. There is no email digest in this release; the rollup is the digest.

## 7. Functional requirements

**Roles, domains and personas**
- FR-1 Each team, leadership circle and personal inbox is a role with a versioned form, list schema, metadata schema, pins and badge; every role belongs to one domain, and the domain is a facet on its rows and a pin that unions its roles.
- FR-2 A persona is a named collection of roles with a relationship per role (write-all, write-self, read-all). Seeded personas: one per role for humans (write own, read its domain), one per role for AI (write-self own, read its domain), a coordinator for `org-programs`; the admin composes further personas (Sam's five roles) in the dashboard or by seed.
- FR-3 A person or bot can hold several personas; the highest allowance per role wins.

**Items**
- FR-4 An item has kind, category, need, RACI, priority, headline, brief, facets, ties; all vocabulary values come from the edition in force at creation and are validated at admission.
- FR-5 An item's form opens on the rule-suggested decision; fields show only for the decision picked; hidden fields do not block submit; cancel is disabled.
- FR-6 Changing classification on submit records a correction the AI reads before classifying again.

**Intake and acts**
- FR-7 A standing sweep per source (chat; issues; calendar) parks a check act on a schedule; the AI resolves it with items found since a watermark that only moves forward.
- FR-8 Every act has a typed result shape in the role's form; results return to the originating item as a new section.
- FR-9 Reactions by the item's owner on the source message count as decisions.

**Ties**
- FR-10 An item may hold any number of ties (issue, chat thread, escalation); ties are facets so items can be found by them.
- FR-11 A standing tie-check act reports changes per tie since its watermark; changes update the item, may re-open it, and appear in the rollup.
- FR-12 Decisions and results write back to ties through acts keyed by item and signal id; a repeated act is a no-op.

**Routing across roles and tools**
- FR-13 Delegate names targets (role, person, external) and channels from the `channels` edition; the act row offers exactly those options; the AI resolves with one result per channel, each becoming a tie; the originator keeps a Waiting item that turns into Delivered (accept, changes, stop) when the target resolves or a tie reports done.
- FR-14 Deliverables run work → (blocked → decide) | review rounds between a producer role and a reviewer role, with a round cap; producer and reviewer are different roles.
- FR-15 Programs run phases of deliverables with per-role gate signs, a hold decision (rework, skip, stop), a board row, and pinned editions.

**Rollup**
- FR-16 One standing rollup row per holder per day, in their personal inbox role, spanning every role in their persona, with Important, Coming, Since yesterday, Waiting; populated by a scheduled act and by events; acknowledged by the holder; re-parks daily.
- FR-17 Coming includes look-ahead: deliverables in other roles whose reviewer is one of the holder's roles, gates the holder's roles sign, items due within two days.

**Templates**
- FR-18 Vocabulary, rules, channels, deliverable types, program templates, rollup template, act result templates and reactions are knowledge editions; seeded once; edited in place; every row pins its edition.
- FR-19 The admin can list editions and view the edition any row was created against.

**AI role holding**
- FR-20 A bot principal can hold personas and authenticate over REST and MCP; its resolves are attributed to it.
- FR-21 Facet-only mode pre-assigns eligible items to the bot with a first-right window; after the window the item is available to any holder.

**Audit**
- FR-22 Every row records who created, claimed and resolved it, with what, against which edition; the item's history is readable from the row.

## 8. Non-functional requirements

- **Durable**: every item is a durable workflow; a crash, a sleep or a redeploy loses nothing; every wait has a timeout and a defined outcome.
- **Idempotent**: ids derive from the source (thread, issue, date); a second admission of the same thing appends, never duplicates; write-backs are keyed.
- **Bounded**: long-lived loops (sweeps, rollups, items) continue as a new generation after N rounds so replay stays small.
- **Private**: message text is stored only for public channels; private channels and anything resembling personal or customer data are summary only; ties never carry credentials.
- **Live**: list and badge updates within 5 seconds on a visible tab; reconnect after a hidden tab is shown.
- **Validated at the boundary**: every resolve is checked against the versioned form; a 422 names the fields.
- **Readable by both**: every brief is markdown a person can read and a model can follow; every result is a shape both can produce.

## 9. Success criteria

1. **The org is organized by domain**: every team and personal inbox is a role with holders, grouped into the seven domains; a person's persona is their collection of roles; at least one item per week crosses a role boundary as a deliverable, review or delegation.
2. **The singleton still works**, as one role in its holder's persona beside their team roles, with its intake, decisions, acts, briefing and schedule intact.
3. **The rollup is read daily**: the holder's first action each day is the Today row; its Coming block correctly predicts at least one arrival from another role per week.
4. **Ties sync both ways**: a change on a tied issue reaches the item and the rollup within one tie-check interval; a decision in the inbox is visible on the issue within one act.
5. **The AI populates**: fewer than one in ten items need a field typed by a person before deciding (measured by edits to AI-filled fields).
6. **Mental load drops**: the holder reports that nothing is tracked outside the inbox (survey, weekly, yes/no per category).
7. **A role changes hands without code**: moving one deliverable type from human-held to facet-only AI is a persona assignment and an edition edit, done live, with the next item created in the new mode.

## 10. Rollout

| Phase | Scope | Proof |
|---|---|---|
| 0 (exists) | The singleton: one seat, chat intake, acts, briefing, schedule, assignments | Working today |
| 1 | This repo: an example org of roles grouped in seven domains (engineering split into execution, lab, platform, leadership), personas as role collections, editions, deliverable/program/ask, program board, one example bot in engineering-platform | Integration tests; demonstrable locally in the dashboard and over MCP |
| 2 | This repo: the rollup (Today row per holder), ties (tie-check act, write-back acts), delegation with channel options and Waiting/Delivered | Rollup populated by the AI from local data; tie sync simulated end to end |
| 3 | An adopting org: add its team roles beside the existing personal inbox, compose personas from them; keep the chat sweep; add the rollup, ties and channel delegation | The personal inbox unchanged for its holder; team roles and the org's other domains appear beside it |
| 4 | Roles held by the AI: move routine deliverable types to facet-only, then alone, one type at a time | Success criterion 7, repeatedly |

## 11. Open questions

1. Rollup for a team role with several holders (engineering-platform): does the team also get a shared Today row, or is the holder's personal rollup enough? Proposed: personal only in Phase 2; a team rollup if a team asks for one.
2. Delegation to a role held only by the AI: should the originator be told the item will be worked by AI? Proposed: yes, the Waiting item names the mode.
3. Who may edit editions: org admin only, or any Accountable role for its own domain's deliverable types? Proposed: admin for vocabulary and rules; Accountable roles for their own deliverable types.
4. Tie write-back voice: comments posted as the person (OAuth delegation) or as the AI (bot)? Proposed: as the AI, naming the deciding person.
