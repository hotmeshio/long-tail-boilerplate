# HITL schema test set

Workflows whose surfaces are driven entirely by JSON Schema: role-owned escalation forms and list pages, and workflow invoke forms. The same shared validation runs in the dashboard and on the server, so a payload the form accepts is one the API accepts.

| Workflow | Roles | Exercises |
|---|---|---|
| `helloWorkflow` | none | Minimal invoke form with bounds |
| `richForm` | `intake-reviewer` | Invoke form that prefills the escalation (`formDefaults`); decision-gated reveals; multi-select, pattern, email, file upload; optional edition pin (`formVersion`) |
| `lotInspection` | `lot-receiver`, `lot-inspector` | Two stations; dictionary facts; per-row options and bounds from the envelope; knowledge lookups (pinned for the invoke form, current for the checklist and defect cascade); signature; `x-lt-invoke` re-inspection dialog; list page that looks ahead into the dock (`x-lt-related`) |
| `reviewContent` | `content-moderator` | Certified interceptor escalation; help panel reads `{{payload.*}}`; re-run returns the moderator's decision |
| `taskWorkflow`, `screenshotResearch` | caller-chosen | Invoke forms only |

Every role above sets `enforce_schema`, so a resolve from the API or MCP that breaks the form is a 422 naming each field.

## Where things live

- Forms and list pages: `forms.ts` / `forms/` beside each workflow.
- Role declarations: `src/config/hitl-roles.ts`, code-owned (`reset: true`). Boot applies them; a changed form advances the role's schema version.
- Lookups: `lookups.ts`, written at boot by `seedHitlLookups` only when the data changed.
- Resolver contracts: zod in each workflow's types, parsed in activities with `parseFormPayload`. The dashboard submits hidden fields with blank values, so optional fields use `blankAsAbsent` (`src/lib/form-values.ts`).

## Try it locally

```bash
docker compose up -d --build
# Invoke Tool → Lot Inspection (or Rich Form), submit, then work the queues:
#   /escalations/available?role=lot-receiver
#   /escalations/available?role=lot-inspector
npx vitest run tests/unit/workflows                                  # forms through the shared validator
docker compose exec -T app npx vitest run --config tests/integration/vitest.config.ts tests/integration/hitl-*.test.ts
```

Start two lots of the same part family and receive only one: the inspector's queue shows the other under **Arriving**.
