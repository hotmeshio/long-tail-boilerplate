# Migration: efficient atomic escalations (long-tail 0.5.x / hotmesh 0.22.6)

This runbook upgrades a running deployment to the **efficient atomic-escalation**
pipeline and proves, on a *persistent* database, that:

1. the upgrade is non-destructive — **no `down -v`, no data loss**;
2. the durable workflow schema **hot-swaps** to the version that carries the
   atomic-escalation hook;
3. the new efficient pipeline produces the **same** human-in-the-loop behaviour
   as the legacy one through the **same** dashboard surface, with fewer moving
   parts per station.

> Do not delete the legacy `ortho:pipeline`, the legacy `station`/`printer`
> workflows, or any escalation data. The efficient variant sits **beside** the
> legacy one so the two can be compared on identical work. Legacy rows migrate in
> place; nothing is dropped.

## Versions

| Package | Floor | Why |
|---|---|---|
| `@hotmeshio/hotmesh` | `^0.22.6` | Redeploys the durable schema on upgrade (APP_VERSION 15→16 + version-drift hot-swap). **Required** — older hotmesh keeps the old schema and the atomic path silently writes no rows. |
| `@hotmeshio/long-tail` | `^0.5.4` | `conditionLT(signalId, config)` + the `signal_key` resolve path (dashboard + `resolve-by-signal-key`). |

## The two pipelines

Both walk the same 7 stations and resolve through the identical dashboard
endpoint (`POST /api/escalations/:id/resolve`). The only difference is how each
station creates its escalation.

**Legacy `station` / `printer`** — two steps:
```ts
await createStationEscalation({...});           // proxyActivity: create + enrich (2 writes, signal_routing)
const resolution = await condition(signalId);   // then wait
```

**Efficient `stationEfficient` / `printerEfficient`** — one atomic expression:
```ts
const resolution = await conditionLT(signalId, {
  role, type: 'orthoPipeline', subtype: stationName, priority: 2,
  description: instructions, workflowType: 'stationEfficient',
  metadata: { station: stationName }, envelope: { station: stationName },
});
```
The escalation row is written inside the workflow's **Leg1 checkpoint** — one
commit, crash-safe: no create activity, no enrich. `signal_key` is the resume
key, so the dashboard resolve and webhooks resume the job in place.

Run them side by side (same workload, `EFFICIENT=1` routes to the efficient
children):
```bash
npm run ortho:run            # legacy
npm run ortho:efficient:run  # efficient (EFFICIENT=1)
```

## Upgrade procedure (persistent DB — no wipe)

```bash
# 1. Bump the dependency floors
npm pkg set dependencies.@hotmeshio/hotmesh="^0.22.6"
npm pkg set dependencies.@hotmeshio/long-tail="^0.5.4"
npm install

# 2. Rebuild the app image ONLY — keep the postgres volume
docker compose up -d --build app
```

On boot, the durable worker detects that the deployed schema is older than the
SDK's and **hot-swaps** it. No `down -v`. In-flight jobs on the old version
drain on the old schema; new jobs use the new one.

## Verification (what was actually observed)

**1. Schema hot-swapped on the persistent DB (v15 → v16):**
```
SELECT app_id, version, active FROM hmsh_applications WHERE app_id='durable';
 durable | 16 | t

SELECT version, status FROM hmsh_application_versions WHERE app_id='durable';
 15 | activated      <- old version retained for in-flight jobs
 16 | activated      <- new schema (carries the condition() escalation hook)
```

**2. Efficient escalation written atomically — post-upgrade, no wipe:**
```bash
EFFICIENT=1 npm run ortho:efficient:enqueue
```
```
 workflow_type    | role     | subtype       | status  | has_signal_key | has_routing
 stationEfficient | renderer | render-assets | pending | t              | f
```
`has_signal_key=t, has_routing=f` — atomic Leg1 write, no separate create
activity, no enrich. (Before hotmesh 0.22.6 this row was silently never written
on a carried-over DB.)

**3. Resolved through the identical dashboard endpoint (Path 0) — resumes in place:**
```
POST /api/escalations/:id/resolve  →  { "signaled": true, ... }

 subtype         | role      | status
 render-assets   | renderer  | resolved     <- resolved in place (no re-run)
 validate-assets | validator | pending      <- pipeline advanced; next atomic escalation
```

## Legacy escalation data is preserved

Earlier in the long-tail 0.5.3 migration, the custom `lt_escalations` table was
converted to a **view** over the shared `hmsh_escalations`, migrating every row
(verified: identical id checksum) and renaming the original table to
`lt_escalations_legacy` as a backup — nothing dropped. The schema hot-swap above
is orthogonal and equally non-destructive.

## AWS

The procedure above is the dress rehearsal for `longtail.hotmesh.io`. Because
the durable schema hot-swaps on a persistent database, deploying the upgraded
image onto the existing RDS picks up the atomic-escalation hook with **no wipe
and no drained cutover**. Then `ortho:remote:run` and the efficient variant
(`EFFICIENT=1 ortho:remote:run`) behave exactly as they do locally.
