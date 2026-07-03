# Pull Farm — the claim-as-lease contention proof

The testbed experiment behind acme-mono's virtual print farm (and every pull-crew after
it). The farm's machines pull work from a pond; this proves — with measured numbers —
what the membrane guarantees when N pullers race:

## The questions, answered (local run, 24 units × 6 pullers)

| Question | Answer | Evidence |
| --- | --- | --- |
| Is a claim a real lease between distinct principals? | **Yes — 409 on every cross-principal claim of a held row** | 60 lost claim races, all status `[409]` |
| Is anything ever resolved twice under contention? | **No** | `sum(puller.resolved) = 24 = units`; every unit's return names exactly one puller |
| Are late resolves ordinary endings? | **Yes — and with real leases they barely occur** | `lostResolves = 0`: the race window closes at claim time |
| Does work leased to a dead puller recover? | **Yes — the clock returns it** | `PULL_TTL=1`: the dark puller resolved 0; all 24 units still settled, one by a survivor after the ~60s lease expired |
| Is the load shared? | Evenly | distribution `p0:4 p1:4 p2:4 p3:4 p4:4 p5:4` |

The 409 finding is the load-bearing one: acme-mono's virtual farm currently runs all
machines as ONE principal, so claims cannot arbitrate between its own machines (that
produced a live race the doctrine had to absorb at resolve time). With per-machine
principals — proven here — the lease itself arbitrates, and the lost-race surface
shrinks from resolve-time to claim-time.

## The shape

- **`pullDemand`** → N **`pullUnit`** children (the printDispatcher → printJobWorker
  shape): each unit parks one escalation in the `pull-pond`; its return names the
  puller that resolved it. Exactly-once by construction — one workflow, one wait.
- **`puller`** — crew-loop, one per principal (six `0c..` principals seeded at
  startup): scan → claim (its OWN identity) → durable-sleep work → resolve. Lost claims
  recorded with their statuses; late resolves ordinary; `silent` = claim then dark.

## Run it

```bash
docker compose up -d --build   # seeds pull-pond role + 6 puller principals
npm run pull:demo              # contention proof (24 × 6, ~2.5 min)
npm run pull:ttl               # + dark-puller lease recovery (~2 min)
npm run pull:remote:demo       # AWS
```

## Files

| Path | Role |
| --- | --- |
| `types.ts` | Pond role, facets, directives, shapes, defaults |
| `operators.ts` | Six puller principals (stable UUIDs, seeded at startup) |
| `workflows/demand.ts` / `unit.ts` | The demand surface |
| `workflows/puller.ts` | The racing crew-loop |
| `activities/pond.ts` | scan/claim/resolve as the puller's own principal |
| `tests/throughput/14-pull.ts` | The proof harness |
