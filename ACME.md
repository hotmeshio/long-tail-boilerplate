# ACME — the takeover

This is the third document of three. [CONVERGENCE.md](CONVERGENCE.md) states the laws.
[PERSUASION.md](PERSUASION.md) makes the case. This one is where both land on a living
production system: the `acme-mono` refactor, staged from
`apps/backend/src/longtail/` in that repository, is the ultimate expression of these
ideals — because it is not a greenfield. It is a takeover of a system that is running
right now, with orders on the floor and associates at stations, and the prime directive
is that **the end users never know the backend changed**. Same outcomes, better
controls. This document is the doctrine for that takeover — and the template for every
takeover after it.

## The system we inherited: choreography by status field

V1 coordinates the entire manufacturing operation through one Prisma field:
`Order.status`. There is no conductor. There are watchers:

```
poller watches Order.status
  → sees the value it was born to react to
  → does its work
  → fires its completion event
  → applies the transition (writes the next status value)
  → runs the bolt-ons (2–6 tasks: audit log, ETA dwell, supplier
    notification, destination resolution, rush notification, ...)
```

This is choreography in its purest form — IFTTT with no historical context. Each worker
knows one thing: the status value that summons it. Nobody holds the order's story. The
"process" is an emergent property of many small reflexes agreeing, by convention, on
the meaning of one string column.

It worked, and then it hit its wall, and the wall has a precise shape:

- **Nothing is checkpointed.** The write → bolt-ons sequence is fire-and-forget. A
  crash between the status write and the supplier notification loses the notification
  *silently* — no error, no retry, no record that it was ever owed. Any crash, anywhere
  in the chain, corrupts the system's account of itself.
- **There is no historical context.** The status field holds one value. How the order
  got here, how many times, what was tried before — unrecoverable. Every reaction is a
  reflex to the present tense.
- **The blast radius blocks the exit.** The obvious fix — replace the pollers with an
  orchestrator — is exactly what years of accretion prevent. Each transition's bolt-ons
  are welded to the legacy write path in `order.service.ts` (a god object by its own
  admission). Rip out the choreography and you rip out every side effect bolted to it,
  most of which are load-bearing and half of which are documented nowhere but the code.

So the naive migration is impossible, and that constraint is the design. You cannot
replace this system. You can only **take it over from above, one segment at a time,
while it keeps running.**

## The move: orchestration that is still choreography underneath

Here is the special part, and the reason this works where a rewrite would not.

The V2 pipeline (`core/workflows/order-pipeline/pipeline.ts`) is a top-down
orchestrator: a durable workflow walks a manifest of steps, spawns a child workflow per
step, calls proxied activities exactly as the textbook prescribes. But look at what
those activities *do*: `setLegacyStatus` writes the same `Order.status` field V1 always
wrote. `writeStatusAuditLog` writes the same station-entry audit rows the legacy
worklists key on. The iPads, the station UIs, the worklist tabs, the shipping
choreography past `NEEDS_SHIPPING` — all of them keep watching the same field and
reacting the same way, and none of them can tell that the hand moving the field is now
a workflow instead of a poller.

**We replace choreography with orchestration, and under the hood it is still
choreography.** The events still fire. The watchers still watch. What changed is that
there is now a *narrator* — one durable process per order that holds the story, decides
what happens next, and writes the status field as a **broadcast, not a mechanism**. The
status field is demoted from the system's coordination medium to a read model that
legacy consumers subscribe to. The pollers never learn they lost authority; the
interceptors (`tryResolveEscalation` checks `hasPipeline` first) quietly return `true`
when the pipeline owns the write and `false` to let legacy proceed when it doesn't.

This is why the migration is safe: the orchestrator's output *is* the legacy system's
input, byte for byte. The invariant is checkable at every step — same statuses, same
audit rows, same UI behavior — and the shadow observer (`orderTracker`,
`ORDER_STATUS_V2_SHADOW`) checks it passively in production before the pipeline ever
owns a single write.

## The membrane arrives

Orchestration alone would only reorder the same fragility. The step further — the one
this whole repository exists to prove — is that **each step of the manifest is one wait
at the escalation membrane** (see CONVERGENCE.md, "The membrane in one atomic write"):

- `stationWorker` creates an escalation for the step's role and parks on `conditionLT`.
  The escalation *is* the worklist item.
- The associate's existing buttons become resolvers without knowing it: **Start** →
  `bookOnStation` → `claimByMetadata` (the claim). **Mark as Complete** →
  `order.service.update` → `tryResolveEscalation` → `resolveByMetadata` (the ack, which
  wakes the workflow). **Report Issue** → `tryRejectEscalation` (reality pushing back).
- Machines join the same surface: the Bambu printer's `printer_ready` webhook resolves
  a print-job escalation (`onPrinterComplete`) exactly the way a human resolves a
  station — Law 9, *nothing at the membrane is special*, running in production.
- Resolution is by business key (`metadata: { orderId }`), so no caller needs a
  workflow handle — the API layer that existed before the pipeline can resolve
  escalations it doesn't know exist.

The UI did not change. The verbs did not change. The membrane was installed *behind*
the buttons the associates already press.

## The bolt-ons become checkpointed — the corruption cure

The blast-radius problem is solved by absorption, not surgery. Each side effect bolted
to the legacy status write is peeled off and re-homed as its own **proxied activity**
in the pipeline (`configureLifecycleActivities`, `activities-lifecycle.ts`):

```
V1 (one uncheckpointed reflex chain)      V2 (individually durable steps)
────────────────────────────────────      ─────────────────────────────────
status write                              setLegacyStatus        ← checkpointed
  ├─ audit log        (may be lost)       writeStatusAuditLog    ← checkpointed
  ├─ ETA dwell        (may be lost)       recordEtaDwell         ← checkpointed
  ├─ supplier notify  (may be lost)       notifySupplierOnShipping ← checkpointed
  ├─ dest. facility   (may be lost)       resolveOrderDestinationFacility ← checkpointed
  └─ rush notify      (may be lost)       sendRushedNotification ← checkpointed
```

A crash after the status write but before the supplier notification now *replays the
notification*. The failure mode that corrupted V1 — the silent gap between a write and
its consequences — is structurally closed: every consequence is its own durable entry
that must complete or visibly fail. And which bolt-ons run is not hardcoded — each
manifest declares its needs via `ManifestConfig` flags, all defaulting to off. Adding a
lifecycle concern is a flag, an activity, a call site; the pipeline loop contract never
changes.

## The orderPipeline: minted intent, forward-only convergence

The pipeline is the clearest expression of the convergence spiral running against a
real factory. Its mechanics:

**The manifest is minted intent.** `ManifestService.resolveManifest` selects the
process — an ordered list of steps, each carrying its role, its child workflow type,
and its V1 status transition (`v1StatusFrom → v1StatusTo`). The workflow walks it
deterministically: place, wait at the membrane, advance.

**The iterator only moves forward.** There is no backtracking, no "return to step 3."
When reality rejects the work, the manifest service — *the same service that minted the
original steps* — mints the correction, and the pipeline **splices** it into the active
step array. Two semantics:

- **Insert** (a report needs review): the manager-verify step is spliced in ahead,
  carrying the report as context. The order's status does not move — the associate is
  asking for confirmation, not moving the order.
- **Replace** (a designation is made): everything after the review is discarded and
  re-minted as `[manager-move, ...natural forward path from the designated station]`.
  *The side quest becomes the main quest.* Even "stay here" is just a designation whose
  move step writes nothing.

**People say what is wrong. They do not guide.** This is the load-bearing philosophical
choice, and it deserves its full weight. The legacy "Send back to" picker had the human
prescribing the route — and humans have limits to their expression: they know *this
part is bad*, not *therefore the process is grind → glue → finish → QC from here*. In
V2, the rejection payload describes WHAT IS WRONG — reason, quantities, photos,
reporter. The strategy registry (`remediation-strategies.ts`: step registry, sequence
catalog, rejection rules with `*` fallbacks, station forward paths) decides WHAT TO DO,
declaratively. The human's target-station guess still travels in the payload — as
advisory context, not as instruction.

**The rules are the provenance of the digital, and reality is the provenance of the
real.** Reality owns the verdict: rejected, two units, here are the photos. The digital
owns the consequence: which steps, in what order, converging where. Neither trespasses.
The manager's review captures two *independent* facts — the designation (routing) and
the KT fact (was the associate's assessment accurate — an education trail) — because
conflating judgment-of-work with routing-of-work is exactly the kind of category error
the membrane exists to prevent. And when a genuine exception needs a hand-built path,
that exists too — as the `manual` strategy, a *declared, validated* exception, not an
ambient capability of every modal.

**The order is never nowhere and never actionable in two places.** Each escalation
closure immediately mints the next escalation somewhere. The physical review rack has a
digital twin — a faceted substate that hides the order from station worklists exactly
as long as the item sits on the rack, released by Confirm Moved at the moment the item
physically arrives. One order, one path, one pending escalation.

## The migration doctrine — safe is a property, not a hope

Every mechanism in the `longtail/` directory obeys the same five rules. They are the
doctrine for taking over any live system, and they compound:

1. **Additive only.** No legacy code path is modified — it is *intercepted*, and every
   intercept is gated (`isPipelineMode` + `hasPipeline`) so that orders outside
   orchestration flow through the untouched legacy path. The production change for the
   entire harvest intercept is one fire-and-forget call. If `OPERATIONAL_DB_URL` is
   unset, the whole module is a no-op.
2. **The legacy path is the permanent fallback, not the transitional one.** `false`
   from an interceptor means "legacy proceeds," and that answer must stay correct
   forever — it is what makes the flag safe to flip in either direction.
3. **Shadow before steering.** `orderTracker` rode along in production recording
   V1/V2 agreement before the pipeline owned anything. You earn the write by proving
   the read.
4. **Enter and exit at named boundaries — the tugboat pattern.** The pipeline joins
   the legacy flow at a precise ingress (`handleBatchCollected`, the last
   `printer_ready` webhook — the harvest), steers the order through a bounded segment
   (`POST_PRINT_QA → NEEDS_SHIPPING`), writes the final status, and **gets out of the
   way** — legacy shipping choreography takes over exactly as it always has. A tugboat
   does not become the ship.
5. **One switch, per company, reversible.** After all plumbing is deployed dark, the
   only production act is a feature flag (`ORDER_STATUS_V2_PIPELINE`) for one
   `companyId`. The confidence ladder — local, staging harness (same code paths,
   production mode), production shadow, production steering — is a single test story,
   not three test suites.

## The rub — canary requires parity

Canary was the right instinct: flip the flag for one champion customer, watch, widen.
And the doctrine above made the flip itself safe — additive, gated, reversible,
shadow-proven. But a canary only proves what the earlier rungs of the ladder could
rehearse, and the ladder had a missing rung. Staging has no concept of *printing*. No
printers, no stubs, no mocks — no digital representation of the farm at all. So the
remediation path — a print fails and is sent back — was never exercised anywhere before
it was exercised at the champion's site. The pipeline went live with edges that no
amount of flag discipline could have caught, because the first time reality pushed back
through that path, it was *real* reality, in production.

The lesson, stated as doctrine: **never let production be the first place reality
pushes back.** A canary detects divergence between two versions of the digital. It
cannot substitute for an environment where the unhappy path can be *caused on purpose*.

The fix was latent in the architecture all along. The system above the membrane never
touches a printer — it raises escalations and receives resolutions. That means parity
does not require replicating the factory. It requires **staffing the membrane in every
environment**: for every escalation the system can raise, something in that environment
must be able to pull it, resolve it, reject it, or let it expire. Everything below the
membrane is swappable per environment, and the system above it structurally cannot tell
the difference — that is not a testing trick, it is the same fact that lets a human, a
webhook, and a robot resolve the same row in production.

This repository's golden rule already says it for infrastructure: same code,
`STORAGE_BACKEND=minio` locally, `gcs` in production — adapters selected by config,
never by code branches. The membrane extends that rule to its logical conclusion.
**Reality is the last unmocked dependency, and the escalation surface is its
interface.**

## The three environments

**1. Local — reality simulated.** On an airplane, no internet: it just works. Below the
membrane runs a cast of simulated pullers that the system cannot distinguish from the
real ones — because they aren't stubs or mocked functions, they are *actors*: durable
workflows and looping singletons that pull the same rows, through the same RBAC-gated
API, with the same verbs and the same timing classes. The boilerplate already ships
this cast: the `print-routing` printers advertise and print, the `farmTechnician`
refills, the `farmInspector` signs off — automated so the world self-drains. And
failure is *data*, not chaos: the `failUnits` facet on a signoff escalation makes the
inspector reject exactly the units the test names. The edges the champion found in
production become deterministic local test cases — the unhappy path runs on a laptop,
on demand, in seconds, forever.

**2. Staging — reality miniaturized.** Real Bambu printers in the home office, driven
by the Bambu farm manager. A controlled fleet — ours, small, and expendable — with the
main factory never touched. This rung exists because there are things no simulator can
promise: the exact shape and timing of the `printer_ready` webhook, firmware quirks, a
genuine filament jam, the physical latency between "job finished" and "human collected
it." At the surface it is all escalations, identical to local and production — the same
adverts, claims, and resolutions — but what resolves them is real hardware. Staging is
where we learn what *real* means, at one-hundredth the stakes. The failing-print
remediation path gets rehearsed here by failing a real print, on purpose, before any
customer ever meets it.

**3. Production — reality itself.** Orchestration, not choreography, all the way down.
And `print-routing/` in this repository is exactly the starting point for how the farm
itself is approached: printers as durable workflows with lifecycles, advertising
availability as escalations; orders advertising demand; a broker matching the two
ponds by capability and priority; technicians and inspectors — human or automated —
resolving the same rows the robots resolved locally and the office fleet resolved in
staging. Production is not a different system. It is the same membrane, staffed by the
real world.

The rule that falls out, and the one every future segment is held to:

> **A workflow may reach production only when every escalation it can raise — and every
> settlement it can receive (payload, `false`, `null`, rejection) — has a puller in all
> three environments.**

Coverage is measured at the membrane, not in the code. The audit is a table, and an
empty cell is a blocked promotion:

| Below the membrane | Local | Staging | Production |
|---|---|---|---|
| Print job runs | simulated printer workflow | home-office Bambu fleet | factory farm |
| Print fails | injected facet (`failUnits`) | real print failed on purpose | happens on its own |
| Filament / maintenance | robot technician | office staff at the bench | floor technician |
| Inspection / signoff | robot inspector | dashboard operator | QA associate |
| Station work | robot resolver | associate at a real station | the floor |
| Timeout / silence | shortened SLA in test data | let the clock run | the SLA |

Read the table bottom-up and it says something worth noticing: the *system* column
never changes. Only the staffing does.

## The takeover sequence

Methodical means the segments are taken in order of confidence, not convenience, no
segment is taken until its membrane is staffed in all three environments, and each
newly owned segment brings its bolt-ons onto the ledger as it falls:

1. **Shadow** *(done)* — passive V1/V2 audit in production.
2. **The tugboat segment** *(done)* — harvest → shipping, the post-print half of
   manufacturing, behind the per-company flag.
3. **Widen the boundaries** — pre-print manifests already exist
   (`insole-phase-pre-print`, addon, grinding variants); the ingress moves earlier
   (order approval, eventually intake) and the egress moves later (shipping
   choreography — consolidated, Hanger, Anodyne — absorbed as manifest steps with
   `ManifestConfig` flags).
4. **Convert bolt-ons as segments fall** — each transition the pipeline takes over
   converts that transition's fire-and-forget reflexes into checkpointed activities.
   The god object shrinks by attrition, not by rewrite.
5. **Events become authoritative** — the interim direction already named in the
   `longtail` docs: every transition publishes a domain event; consumers (ETA, audit,
   notifications) become pure subscribers; the explicit lifecycle activities dissolve
   into event infrastructure. Choreography again — but *published by the narrator*,
   checkpointed at the source, with the story on the record.
6. **The status field becomes a pure projection** — still written, still watched by
   whatever legacy remains, but derived entirely from pipeline state. At that point
   V1 is not decommissioned; it has been hollowed out and inhabited.

The end state runs the full arc named in CONVERGENCE.md: fax → intake → video → renders
→ gcode → print farm → harvest → grind, glue, finish → QA → ship — every arrow a
station, every station one wait at the membrane, every deficit spiraling back through
the same funnel.

## The laws, as they landed

| CONVERGENCE law | Where it lives in acme-mono |
|---|---|
| 1 — pressure, never commands | Stations, managers, and printers all *pull*: worklists, Review Rejections, webhooks — nothing is pushed at reality |
| 2 — one wait, one atomic write | `stationWorker`'s escalation carries `signal_id` at creation; `resolveByMetadata` signals the workflow, never a bare DB resolve |
| 3 — handle all settlements | `approved !== false` branches the loop; cancellation via `onCancelled`; rejection is just another resolution shape |
| 4 — handled ≠ resolved | Rejection closes the station escalation and splices review — an ending that is also a beginning |
| 5 — a claim is a lease | Start = claim (`bookOnStation` → `claimByMetadata`); JIT provisioning (`provisionIfAbsent`) keeps identity continuous |
| 6 — hard wall / soft fit / pluggable priority | Station-role mapper is the wall; the strategy registry is the pluggable policy; SSO maps Acme roles to LT roles |
| 7 — the row is the record | Escalation trail + `history[]` on the pipeline result; the QCRejection dual-write stays as the legacy audit view of the same facts |
| 8 — convergence, not correctness | Forward-only iterator, splice semantics, re-run steps; the clean order is the degenerate case |
| 9 — nothing at the membrane is special | An associate's tap and a Bambu webhook resolve the same kind of row |
| 10 — reality wins; plan the balance | Reports over prescriptions; the review rack's faceted substate; replace semantics that never argue with the verdict |

And the boilerplate patterns it inherits directly: the ortho-pipeline's
parent/child station walk, the task-queue's resolve-by-business-key and atomic
settlement, print-routing's machines-as-actors (the print fan-out and the printer
webhook are the farm's marketplace, arriving in production).

## Definition of done

The takeover is complete when three sentences are simultaneously true:

1. **No end user ever noticed.** Same screens, same buttons, same statuses, same
   outcomes — the invariant held through every segment.
2. **Nothing can be silently lost.** Every transition and every consequence of every
   transition is a checkpointed entry that completes, retries, or fails on the record —
   the ledger of unfinished work, balanced daily (PERSUASION.md's claim, made literal).
3. **The process is legible in one place.** The manifest says what should happen; the
   escalation trail says what did; the strategy registry says what happens when those
   disagree. Reading those three artifacts *is* reading the operation.

That is the same outcome with better controls — and it is the proof the other two
documents promise. The boilerplate demonstrated the patterns in a clean room.
Acme-mono demonstrates them where it counts: against a live system, without waking
anyone up.
