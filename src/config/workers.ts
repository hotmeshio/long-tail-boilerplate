import type { LTWorkerConfig, LTStartConfig } from '@hotmeshio/long-tail';

import * as helloWorld from '../workflows/hello-world';
import * as contentReview from '../workflows/content-review';
import * as screenshotResearch from '../workflows/screenshot-research';
import { assemblyLine } from '../workflows/assembly-line';
import { workstation } from '../workflows/assembly-line/worker';
import { stepIterator } from '../workflows/assembly-line/iterator';
import { reverter } from '../workflows/assembly-line/reverter';

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

// ── Worker list ───────────────────────────────────────────────────────────

export const WORKERS: LTStartConfig['workers'] = [
  { taskQueue: 'default', workflow: helloWorld.helloWorkflow, config: helloWorldConfig },
  { taskQueue: 'default', workflow: contentReview.reviewContent, config: contentReviewConfig },
  { taskQueue: 'default', workflow: screenshotResearch.screenshotResearch, config: screenshotConfig },
  { taskQueue: 'assembly-line', workflow: assemblyLine, config: assemblyLineConfig },
  { taskQueue: 'assembly-line', workflow: workstation, config: workstationConfig },
  { taskQueue: 'assembly-line', workflow: stepIterator, config: stepIteratorConfig },
  { taskQueue: 'assembly-line', workflow: reverter, config: reverterConfig },
];

export const READONLY_OBSERVERS: LTStartConfig['workers'] = WORKERS!.map((w) => ({
  ...w,
  connection: { readonly: true } as const,
}));
