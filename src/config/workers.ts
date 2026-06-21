import type { LTWorkerConfig, LTStartConfig } from '@hotmeshio/long-tail';

import * as helloWorld from '../workflows/hello-world';
import * as contentReview from '../workflows/content-review';
import * as screenshotResearch from '../workflows/screenshot-research';
import { assemblyLine } from '../workflows/assembly-line';
import { workstation } from '../workflows/assembly-line/worker';
import { stepIterator } from '../workflows/assembly-line/iterator';
import { reverter } from '../workflows/assembly-line/reverter';
import { pipeline, station, printstation, printer, stationEfficient, printstationEfficient, printerEfficient } from '../workflows/ortho-pipeline';
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
];

export const READONLY_OBSERVERS: LTStartConfig['workers'] = WORKERS!.map((w) => ({
  ...w,
  connection: { readonly: true } as const,
}));
