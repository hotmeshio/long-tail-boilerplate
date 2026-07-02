import type { LTWorkerConfig, LTStartConfig } from '@hotmeshio/long-tail';

import * as helloWorld from '../workflows/hello-world';
import * as contentReview from '../workflows/content-review';
import * as screenshotResearch from '../workflows/screenshot-research';
import { assemblyLine } from '../workflows/assembly-line';
import { workstation } from '../workflows/assembly-line/worker';
import { stepIterator } from '../workflows/assembly-line/iterator';
import { reverter } from '../workflows/assembly-line/reverter';
import { pipeline, station, printstation, printer, stationEfficient, printstationEfficient, printerEfficient } from '../workflows/ortho-pipeline';
import {
  printOrder,
  printer as printRoutingPrinter,
  printBroker,
  farmTechnician,
  farmInspector,
  printShift,
} from '../workflows/print-routing';
import { ALL_PRINT_ROLES, PRINT_ROUTING_QUEUE } from '../workflows/print-routing/types';
import { operatorIds } from '../workflows/print-routing/operators';
import { taskWorkflow, TASK_QUEUE } from '../workflows/task-queue';
import * as richForm from '../workflows/rich-form';

import { CERTIFIED_ROLES, INVOCATION_ROLES, REVIEWER } from './roles';

// ── Workflow configs ──────────────────────────────────────────────────────

const helloWorldConfig: LTWorkerConfig = {
  description: 'Hello world — minimal durable workflow with sleep and IAM context',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  envelopeSchema: {
    data: { name: 'World' },
    metadata: { source: 'dashboard' },
  },
};

const contentReviewConfig: LTWorkerConfig = {
  description: 'Content review — AI-powered moderation with human escalation for low-confidence results',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  defaultRole: REVIEWER,
  roles: CERTIFIED_ROLES,
  envelopeSchema: {
    data: { contentId: 'article-001', content: 'Content to review...', contentType: 'article' },
    metadata: { certified: true, source: 'dashboard' },
  },
  resolverSchema: {
    approved: true,
    analysis: { confidence: 0.95, flags: [], summary: 'Manually reviewed and approved.' },
  },
};

const screenshotConfig: LTWorkerConfig = {
  description: 'Screenshot research — capture and analyze web pages using Playwright and Vision',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  envelopeSchema: {
    data: { url: 'https://example.com', description: 'Capture and analyze this page' },
    metadata: { source: 'dashboard' },
  },
};

const assemblyLineConfig: LTWorkerConfig = {
  description: 'Assembly line — orchestrates sequential stations with parallel child workflows and human escalation',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  defaultRole: REVIEWER,
  roles: CERTIFIED_ROLES,
  envelopeSchema: {
    data: {
      productName: 'Widget A',
      stations: [
        { stationName: 'grinder', role: 'grinder', instructions: 'Grind widget to spec.' },
        { stationName: 'gluer', role: 'gluer', instructions: 'Bond components. Verify bond strength.' },
      ],
    },
    metadata: { certified: true, source: 'dashboard' },
  },
};

const stepIteratorConfig: LTWorkerConfig = {
  description: 'Step iterator — walks stations sequentially, spawning a child workstation for each step',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  defaultRole: REVIEWER,
  roles: CERTIFIED_ROLES,
  envelopeSchema: {
    data: {
      name: 'Widget B',
      steps: [
        { stationName: 'grinder', role: 'grinder', instructions: 'Grind widget to spec.' },
        { stationName: 'gluer', role: 'gluer', instructions: 'Bond components.' },
      ],
    },
    metadata: { certified: true, source: 'dashboard' },
  },
};

const reverterConfig: LTWorkerConfig = {
  description: 'Reverter — like stepIterator but supports revert-on-rejection, stepping backwards',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  defaultRole: REVIEWER,
  roles: CERTIFIED_ROLES,
  envelopeSchema: {
    data: {
      name: 'Widget C',
      steps: [
        { stationName: 'grinder', role: 'grinder', instructions: 'Grind widget to spec.' },
        { stationName: 'gluer', role: 'gluer', instructions: 'Bond components.' },
      ],
    },
    metadata: { certified: true, source: 'dashboard' },
  },
  resolverSchema: { approved: true, revertSteps: 0 },
};

const workstationConfig: LTWorkerConfig = {
  description: 'Workstation — child workflow for a single assembly station. Creates escalation, waits for human, signals parent.',
  invocable: false,
  defaultRole: 'grinder',
  roles: [...CERTIFIED_ROLES, 'grinder', 'gluer'],
  resolverSchema: { approved: true, station: 'grinder' },
};

const richFormConfig: LTWorkerConfig = {
  description: 'Rich form showcase — exercises every HITL form feature: dates, email, file upload, two-column layout, required fields, read-only, ordering',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  defaultRole: REVIEWER,
  envelopeSchema: {
    data: { role: REVIEWER },
    metadata: { source: 'dashboard' },
  },
};

// ── Ortho Pipeline configs ──────────────────────────────────────────────────

const ORTHO_ROLES = ['ingester', 'renderer', 'validator', 'printer', 'grinder', 'finisher', 'packager', 'shipper'];

const pipelineConfig: LTWorkerConfig = {
  description: 'Ortho pipeline — sequential manufacturing flow with nested print fleet',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  defaultRole: REVIEWER,
  roles: [...CERTIFIED_ROLES, ...ORTHO_ROLES],
  envelopeSchema: {
    data: {
      name: 'Order-001',
      steps: [
        { stationName: 'render-assets', role: 'renderer', instructions: 'Render 3D foot model.' },
        { stationName: 'print-assets', role: 'printer', instructions: 'Print orthotic.', childWorkflow: 'printstation', printerSets: 3 },
      ],
    },
    metadata: { certified: true, source: 'dashboard' },
  },
};

const orthoStationConfig: LTWorkerConfig = {
  description: 'Ortho station — child workflow for a single pipeline step. Creates escalation, waits for human, returns result.',
  invocable: false,
  defaultRole: 'renderer',
  roles: [...CERTIFIED_ROLES, ...ORTHO_ROLES],
  resolverSchema: { approved: true, station: 'renderer' },
};

const printstationConfig: LTWorkerConfig = {
  description: 'Printstation — orchestrates a fleet of 3D printers (sets × 2 feet).',
  invocable: false,
  defaultRole: 'printer',
  roles: [...CERTIFIED_ROLES, 'printer'],
};

const printerConfig: LTWorkerConfig = {
  description: 'Printer — single 3D printer child. Creates escalation (claim=pickup, resolve=done).',
  invocable: false,
  defaultRole: 'printer',
  roles: [...CERTIFIED_ROLES, 'printer'],
  resolverSchema: { approved: true, station: 'printer' },
};

// ── Efficient (atomic-escalation) variants ──────────────────────────────────
// Same shape as the legacy leaves; each writes its escalation atomically in
// Leg1 via conditionLT(config). Resolved through the identical dashboard path.

const orthoStationEfficientConfig: LTWorkerConfig = {
  description: 'Ortho station (efficient) — atomic-escalation child. Writes the escalation in Leg1, waits, returns.',
  invocable: false,
  defaultRole: 'renderer',
  roles: [...CERTIFIED_ROLES, ...ORTHO_ROLES],
  resolverSchema: { approved: true, station: 'renderer' },
};

const printstationEfficientConfig: LTWorkerConfig = {
  description: 'Printstation (efficient) — orchestrates a fleet of efficient 3D printers (sets × 2 feet).',
  invocable: false,
  defaultRole: 'printer',
  roles: [...CERTIFIED_ROLES, 'printer'],
};

const printerEfficientConfig: LTWorkerConfig = {
  description: 'Printer (efficient) — single 3D printer child, escalation written atomically in Leg1.',
  invocable: false,
  defaultRole: 'printer',
  roles: [...CERTIFIED_ROLES, 'printer'],
  resolverSchema: { approved: true, station: 'printer' },
};

// ── Print Routing configs ───────────────────────────────────────────────────
// An order→printer print farm where printers are first-class durable workflows.
// Two convergent surfaces on one primitive (the escalation queue): orders (demand)
// and printer adverts (supply), matched by an autonomous broker while a technician
// (refills) and inspector (signoff/reprints) close the loops. Runs on its own
// queue and its own `print-farm-*` / `printer-pool-*` roles — fully additive.
// Operators are seeded by `scripts/print-seed.ts` (npm run print:seed).

const PRINT_OPERATORS = operatorIds(false); // standard fleet's stable operator ids

const printShiftConfig: LTWorkerConfig = {
  description: 'Print shift — invocable entry: powers on the fleet + dispatcher, feeds order waves, drains, retires idle machines. Runs the whole print farm end to end.',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  defaultRole: REVIEWER,
  roles: [...CERTIFIED_ROLES, ...ALL_PRINT_ROLES],
  envelopeSchema: {
    data: { diabetic: false, ...PRINT_OPERATORS },
    metadata: { source: 'dashboard' },
  },
};

const printOrderConfig: LTWorkerConfig = {
  description: 'Print order — demand + convergence owner. Enqueues the order’s insoles, parks, and reprints any rejected unit through the same funnel until done.',
  invocable: false,
  defaultRole: REVIEWER,
  roles: [...CERTIFIED_ROLES, ...ALL_PRINT_ROLES],
};

const printRoutingPrinterConfig: LTWorkerConfig = {
  description: 'Printer — supply. One durable workflow per machine: advertises itself, runs the handed-off job, refills, retires.',
  invocable: false,
  defaultRole: REVIEWER,
  roles: [...CERTIFIED_ROLES, ...ALL_PRINT_ROLES],
};

const printBrokerConfig: LTWorkerConfig = {
  description: 'Print broker — the market maker. Claims demand by priority, locks supply, hands off, harvests, settles. Carries backlog across continueAsNew.',
  invocable: false,
  defaultRole: REVIEWER,
  roles: [...CERTIFIED_ROLES, ...ALL_PRINT_ROLES],
};

const farmTechnicianConfig: LTWorkerConfig = {
  description: 'Farm technician — resolves needs-filament adverts (refills) so retired-for-maintenance printers come back online.',
  invocable: false,
  defaultRole: REVIEWER,
  roles: [...CERTIFIED_ROLES, ...ALL_PRINT_ROLES],
};

const farmInspectorConfig: LTWorkerConfig = {
  description: 'Farm inspector — the farmer. Signs off finished orders and triggers reprints on defects.',
  invocable: false,
  defaultRole: REVIEWER,
  roles: [...CERTIFIED_ROLES, ...ALL_PRINT_ROLES],
};

// ── Task Queue config ───────────────────────────────────────────────────────
// One durable instance per task (workflowId = `task-<taskId>`): a role-gated wait
// with an SLA deadline, resolved by metadata. The provable core of a host app's
// task-queue runtime — see src/workflows/task-queue/README.md.
//
// REGISTERED, deliberately unCERTIFIED: no `roles`/`consumes`, so the invoke
// layer leaves the envelope unstamped and the interceptor stays a pure
// pass-through. The entire call history is the trigger, one atomic waiter
// (escalation row + SLA timer in the same commit), and the return — the wait
// carries its own role gate, so the workflow needs none of the certification
// weight (task rows, config lookups, extra durable legs).

const taskWorkflowConfig: LTWorkerConfig = {
  description: 'Task queue — one durable instance per task: role-gated wait with an SLA deadline, resolved by metadata (taskId).',
  invocable: true,
  invocationRoles: INVOCATION_ROLES,
  resolverSchema: { approved: true, notes: '' },
  envelopeSchema: {
    data: { taskId: 'task-001', role: REVIEWER, slaSeconds: 3600, title: 'Review this task' },
    metadata: { source: 'dashboard' },
  },
};

// ── Worker list ───────────────────────────────────────────────────────────

export const WORKERS: LTStartConfig['workers'] = [
  { taskQueue: 'default', workflow: helloWorld.helloWorkflow, config: helloWorldConfig },
  { taskQueue: 'default', workflow: contentReview.reviewContent, config: contentReviewConfig },
  { taskQueue: 'default', workflow: screenshotResearch.screenshotResearch, config: screenshotConfig },
  { taskQueue: 'default', workflow: richForm.richForm, config: richFormConfig },
  { taskQueue: 'assembly-line', workflow: assemblyLine, config: assemblyLineConfig },
  { taskQueue: 'assembly-line', workflow: workstation, config: workstationConfig },
  { taskQueue: 'assembly-line', workflow: stepIterator, config: stepIteratorConfig },
  { taskQueue: 'assembly-line', workflow: reverter, config: reverterConfig },
  { taskQueue: 'ortho-pipeline', workflow: pipeline, config: pipelineConfig },
  { taskQueue: 'ortho-pipeline', workflow: station, config: orthoStationConfig },
  { taskQueue: 'ortho-pipeline', workflow: printstation, config: printstationConfig },
  { taskQueue: 'ortho-pipeline', workflow: printer, config: printerConfig },
  { taskQueue: 'ortho-pipeline', workflow: stationEfficient, config: orthoStationEfficientConfig },
  { taskQueue: 'ortho-pipeline', workflow: printstationEfficient, config: printstationEfficientConfig },
  { taskQueue: 'ortho-pipeline', workflow: printerEfficient, config: printerEfficientConfig },
  { taskQueue: PRINT_ROUTING_QUEUE, workflow: printShift, config: printShiftConfig },
  { taskQueue: PRINT_ROUTING_QUEUE, workflow: printOrder, config: printOrderConfig },
  { taskQueue: PRINT_ROUTING_QUEUE, workflow: printRoutingPrinter, config: printRoutingPrinterConfig },
  { taskQueue: PRINT_ROUTING_QUEUE, workflow: printBroker, config: printBrokerConfig },
  { taskQueue: PRINT_ROUTING_QUEUE, workflow: farmTechnician, config: farmTechnicianConfig },
  { taskQueue: PRINT_ROUTING_QUEUE, workflow: farmInspector, config: farmInspectorConfig },
  { taskQueue: TASK_QUEUE, workflow: taskWorkflow, config: taskWorkflowConfig },
];

export const READONLY_OBSERVERS: LTStartConfig['workers'] = WORKERS!.map((w) => ({
  ...w,
  connection: { readonly: true } as const,
}));
