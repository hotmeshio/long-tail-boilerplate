# Bambu Farm — a virtual fleet that speaks fluent Bambu

The testbed for acme-mono's three-environment parity work (see [ACME.md](../../../ACME.md),
"The three environments"). Each `bambuPrinter` is a durable workflow that is
**indistinguishable, at the membrane, from real hardware**: it consumes Acme's IoT
dispatch payload verbatim and emits `PrinterBambuDto`-shaped webhook events, with its
lifecycle mirroring the Farm Manager's `gcode_state` machine
(`docs/bambu_farm_manager_api_2.6.pdf`).

## The state machine is the advert loop

| Farm Manager reality | Virtual machine |
| --- | --- |
| `gcode_state: IDLE` (plate clear) | a pending `ready` advert (`conditionLT`) |
| `PUT /device/{sn}/print` dispatch | resolving the advert with `BambuJobPayload` |
| `PREPARE → RUNNING` | `job_start` emitted |
| the print | a durable sleep (`printSeconds`) |
| `FINISH` (part on the plate) | `job_finished` emitted |
| associate collects, `bed_clean` | collect gap, then `printer_ready` |
| dispatch errors 1051/1053 | `job_rejected` with `bambu_error_code` |
| print failure + hms code | `job_failed` with `hms_code` |
| machine falls off the network | `silent`: `job_start`, then nothing, ever |

Advert facets are namespaced (`bambuMachine`) and carry **no `orderId`** — order-keyed
resolvers can never cross-talk with a machine advert (the Acme port's exact rule).

## Failure is data

A `SimulateDirective` rides the dispatch payload and the machine plays it back:

```jsonc
// resolve the ready advert with:
{
  "command": { "deviceId": "VIRT-0001", "fileName": "plate_1.gcode.3mf",
               "folderName": "virtual-a1", "presignedUrl": "https://…" },
  "simulate": { "mode": "job_failed", "hmsCode": "0500-0100-0003-0002" }
}
// modes: ok | job_failed | job_rejected | silent — plus printSeconds / collectSeconds
```

In acme-mono this is what the `virtual` dispatch adapter delivers via
`resolveByMetadata`, and what the inject endpoint arms.

## Events go where reality's do

`emitBambuEvent` POSTs each event to `BAMBU_WEBHOOK_URL` (with the
`x-printer-webhook-secret` header when `BAMBU_WEBHOOK_SECRET` is set) — in Acme that is
the real `POST /webhook/printer/bambu` route. Unset, it is log-only: the machine's
returned run history carries every event sequence, so the proof needs no sink.

## Run the proof

```bash
docker compose up -d --build      # bambu-pool role + dispatcher operator seed at startup
npm run bambu:demo                # local — four machines, four fates
npm run bambu:remote:demo         # AWS
```

The demo proves, on one small fleet:

1. **Happy plate** — `job_start → job_finished → printer_ready`, one run consumed.
2. **Fail + recover** — `job_failed` with the injected hms code; the machine
   re-advertises with `lastOutcome='failed'` and runs the next job clean.
3. **Rejected at the door** — `job_rejected` (1053), no plate consumed, re-advertises.
4. **Gone dark** — `job_start` then silence: no finish, no ready, no further adverts —
   the watchdog case (`wentDark: true` on the workflow result).

## Pressure — the farm at scale, failures on

`13-bambu-pressure.ts` drives FLEET_SIZE machines × ROUNDS dispatch rounds with a
**deterministic** failure plan (20% `job_failed` + hms, 5% `job_rejected` + 1053 — no
randomness, so assertions are exact). Every machine's returned history is verified
against the plan, outcome by outcome: nothing lost, nothing double-run.

| Run | Fleet | Runs verified | Outcomes (success / failed / rejected) | Time | Result |
| --- | --- | --- | --- | --- | --- |
| Local (docker) | 10 | 30 | 21 / 6 / 3 | 35s | PASS (2026-07-03) |
| AWS (v0.7.1) | 40 | 120 | 90 / 24 / 6 | 76s, 1.58 dispatch/s | PASS (2026-07-03) |

```bash
npm run bambu:pressure                 # local: 10 × 3
npm run bambu:remote:pressure          # AWS: 40 × 3
FLEET_SIZE=100 ROUNDS=5 npm run bambu:pressure   # your own shape
```

## Files

| Path | Role |
| --- | --- |
| `types.ts` | Event/dispatch shapes (Acme-mirror), facets, directives, defaults |
| `workflows/printer.ts` | `bambuPrinter` — the advert loop / state machine |
| `activities/events.ts` | `emitBambuEvent` — webhook POST or log-only |
| `operators.ts` | Dispatcher principal (stable UUID, seeded at startup) |
| `tests/throughput/12-bambu.ts` | The four-fates proof harness |
| `tests/throughput/13-bambu-pressure.ts` | Scale pressure with deterministic failure injection |

Next (per the parity plan): the brokering refinement (one printer per insole, atomic
per-order claims) runs against this fleet, then the design ports to acme-mono as
`virtualPrinter` + `VirtualPrintFarmAdapter`.
