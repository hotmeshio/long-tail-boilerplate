/**
 * NATS Event Delivery — proves cross-server event bus is working.
 *
 * Subscribes directly to NATS, triggers a workflow through the HTTP API,
 * walks the escalation lifecycle, and verifies that each step produces
 * a corresponding event on NATS.
 *
 * This is the test that proves multi-server event delivery works:
 * if events reach a NATS subscriber, they'll reach any API server
 * that subscribes — which is exactly what happens in production
 * when workers publish events that API servers re-broadcast via Socket.IO.
 *
 * Requires: docker compose up -d --build (app + Postgres + NATS)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, StringCodec, type NatsConnection, type Subscription } from 'nats';

import { ApiClient, log } from './helpers';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const NATS_TOKEN = process.env.NATS_TOKEN || 'dev_api_secret';
const TASK_QUEUE = 'assembly-line';

const sc = StringCodec();

interface CapturedEvent {
  subject: string;
  type: string;
  workflowId?: string;
  workflowName?: string;
  source?: string;
  timestamp?: string;
  [key: string]: any;
}

// -- NATS event collector ----------------------------------------------------

let nc: NatsConnection;
let sub: Subscription;
const events: CapturedEvent[] = [];

async function connectNats(): Promise<void> {
  nc = await connect({ servers: NATS_URL, token: NATS_TOKEN });
  sub = nc.subscribe('lt.events.>');
  log('nats', `subscribed to lt.events.> on ${NATS_URL}`);

  // Collect events in the background
  (async () => {
    for await (const msg of sub) {
      try {
        const parsed = JSON.parse(sc.decode(msg.data));
        events.push({ subject: msg.subject, ...parsed });
      } catch { /* ignore malformed */ }
    }
  })();

  // Small delay to ensure subscription is active
  await new Promise((r) => setTimeout(r, 200));
}

async function disconnectNats(): Promise<void> {
  sub.unsubscribe();
  await nc.drain();
  log('nats', 'disconnected');
}

/** Wait for an event matching the predicate, checking buffered events first. */
async function waitForEvent(
  predicate: (e: CapturedEvent) => boolean,
  timeoutMs = 30_000,
): Promise<CapturedEvent> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = events.find(predicate);
    if (match) return match;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`NATS event not received within ${timeoutMs / 1000}s`);
}

// -- Setup -------------------------------------------------------------------

let api: ApiClient;

beforeAll(async () => {
  await connectNats();
  api = new ApiClient();
  await api.login('superadmin', 'l0ngt@1l');
  log('setup', 'authenticated');
}, 120_000);

afterAll(async () => {
  await disconnectNats();
});

// -- Tests -------------------------------------------------------------------

describe('NATS Event Delivery', () => {
  let workflowId: string;
  let escalationId: string;

  it('connects to NATS successfully', () => {
    expect(nc).toBeDefined();
    expect(nc.isClosed()).toBe(false);
    log('nats', 'connection verified');
  });

  it('triggers a workflow and creates a pending escalation', async () => {
    await api.put(`/api/workflows/assemblyLine/config`, {
      invocable: true,
      task_queue: TASK_QUEUE,
      default_role: 'reviewer',
    });

    const { data } = await api.post('/api/workflows/assemblyLine/invoke', {
      data: {
        productName: 'NATS Test Widget',
        stations: [
          { stationName: 'grinder', role: 'grinder', instructions: 'Grind and approve.' },
        ],
      },
    });
    workflowId = data.workflowId;
    expect(workflowId).toBeDefined();
    log('workflow', `invoked: ${workflowId}`);

    // Wait for the escalation to appear via HTTP (proves workflow is running)
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const { escalations } = await api.listEscalations({ role: 'grinder', status: 'pending' });
      const esc = escalations.find((e: any) => e.workflow_id?.includes(workflowId));
      if (esc) {
        escalationId = esc.id;
        break;
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    expect(escalationId).toBeDefined();
    log('workflow', `escalation ready: ${escalationId}`);
  }, 45_000);

  it('receives escalation.claimed event on NATS after claiming', async () => {
    const startCount = events.length;

    await api.claimEscalation(escalationId);
    log('workflow', `claimed escalation ${escalationId}`);

    const event = await waitForEvent(
      (e) => e.type === 'escalation.claimed' && events.indexOf(e) >= startCount,
    );
    expect(event.subject).toBe('lt.events.escalation.claimed');
    expect(event.type).toBe('escalation.claimed');
    expect(event.timestamp).toBeDefined();
    log('nats', `received escalation.claimed on subject ${event.subject}`);
  }, 30_000);

  it('receives escalation.resolved event on NATS after resolving', async () => {
    const startCount = events.length;

    // Re-fetch since claim may have changed state
    const { escalations } = await api.listEscalations({ role: 'grinder', status: 'pending' });
    const esc = escalations.find((e: any) => e.workflow_id?.includes(workflowId));
    expect(esc).toBeDefined();

    await api.resolveEscalation(esc.id, { approved: true, notes: 'NATS verified' });
    log('workflow', `resolved escalation ${esc.id}`);

    const event = await waitForEvent(
      (e) => e.type === 'escalation.resolved' && events.indexOf(e) >= startCount,
    );
    expect(event.subject).toBe('lt.events.escalation.resolved');
    expect(event.type).toBe('escalation.resolved');
    expect(event.timestamp).toBeDefined();
    log('nats', `received escalation.resolved on subject ${event.subject}`);
  }, 30_000);

  it('proves end-to-end: all NATS events have correct structure', async () => {
    // Give a moment for any trailing events
    await new Promise((r) => setTimeout(r, 2_000));

    const types = [...new Set(events.map((e) => e.type).filter(Boolean))];
    log('nats', `total events captured: ${events.length}`);
    log('nats', `event types seen: ${types.join(', ')}`);

    // The escalation lifecycle events prove NATS cross-server delivery
    expect(types).toContain('escalation.claimed');
    expect(types).toContain('escalation.resolved');

    // Every event with a type must follow the subject convention
    const typedEvents = events.filter((e) => e.type);
    for (const e of typedEvents) {
      expect(e.subject).toBe(`lt.events.${e.type}`);
      expect(e.timestamp).toBeDefined();
    }
    log('nats', `all ${typedEvents.length} typed events have correct subject format`);
  }, 15_000);
});
