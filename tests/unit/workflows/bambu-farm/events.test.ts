import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { emitBambuEvent } from '../../../../src/workflows/bambu-farm/activities/events';
import { HMS_WIKI_URL } from '../../../../src/workflows/bambu-farm/types';

const ENV_KEYS = ['BAMBU_WEBHOOK_URL', 'BAMBU_WEBHOOK_SECRET'] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.restoreAllMocks();
});

describe('emitBambuEvent', () => {
  it('builds a PrinterBambuDto-shaped event with a unix timestamp', async () => {
    const event = await emitBambuEvent({ eventType: 'job_start', deviceId: 'VIRT-1', fileName: 'plate_1.gcode.3mf' });
    expect(event.event_type).toBe('job_start');
    expect(event.printer_sn).toBe('VIRT-1');
    expect(event.file_name).toBe('plate_1.gcode.3mf');
    expect(event.timestamp).toBeGreaterThan(1_700_000_000);
    expect(Number.isInteger(event.timestamp)).toBe(true);
  });

  it('is log-only (no fetch) when BAMBU_WEBHOOK_URL is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await emitBambuEvent({ eventType: 'printer_ready', deviceId: 'VIRT-1' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('attaches the hms wiki url to error details', async () => {
    const event = await emitBambuEvent({
      eventType: 'job_failed',
      deviceId: 'VIRT-1',
      errorDetails: { hms_code: '0300-0100-0001-0001', message: 'boom' },
    });
    expect(event.error_details).toEqual({
      hms_wiki_url: HMS_WIKI_URL,
      hms_code: '0300-0100-0001-0001',
      message: 'boom',
    });
  });

  it('POSTs to the webhook with the shared-secret header when configured', async () => {
    process.env.BAMBU_WEBHOOK_URL = 'https://acme.local/webhook/printer/bambu';
    process.env.BAMBU_WEBHOOK_SECRET = 's3cret';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    const event = await emitBambuEvent({ eventType: 'job_finished', deviceId: 'VIRT-2', fileName: 'f.3mf' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://acme.local/webhook/printer/bambu');
    expect((init!.headers as Record<string, string>)['x-printer-webhook-secret']).toBe('s3cret');
    expect(JSON.parse(init!.body as string)).toEqual(event);
  });

  it('retries delivery and throws after exhausting attempts', async () => {
    process.env.BAMBU_WEBHOOK_URL = 'https://acme.local/webhook/printer/bambu';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(emitBambuEvent({ eventType: 'job_start', deviceId: 'VIRT-3' })).rejects.toThrow(/delivery failed/);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  }, 10_000);

  it('recovers when a retry succeeds', async () => {
    process.env.BAMBU_WEBHOOK_URL = 'https://acme.local/webhook/printer/bambu';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    const event = await emitBambuEvent({ eventType: 'printer_ready', deviceId: 'VIRT-4' });
    expect(event.event_type).toBe('printer_ready');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
