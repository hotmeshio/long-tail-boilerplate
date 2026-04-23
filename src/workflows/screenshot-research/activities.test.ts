import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      isConnected: () => true,
      newPage: vi.fn().mockResolvedValue({
        goto: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock storage backend
const mockWrite = vi.fn().mockResolvedValue({ ref: 'research/google/2026-04-20.png', size: 1024 });
const mockRead = vi.fn().mockResolvedValue({ data: Buffer.from('fake-png'), size: 1024 });
vi.mock('@hotmeshio/long-tail/build/lib/storage', () => ({
  getStorageBackend: () => ({ write: mockWrite, read: mockRead }),
}));

// Mock knowledge
const mockStoreKnowledge = vi.fn().mockResolvedValue({
  id: 'k-123',
  domain: 'research',
  key: 'google/2026-04-20',
  created: true,
  updated_at: '2026-04-20T00:00:00.000Z',
});
vi.mock('@hotmeshio/long-tail/build/system/activities/knowledge', () => ({
  storeKnowledge: (...args: any[]) => mockStoreKnowledge(...args),
}));

// Mock LLM
vi.mock('@hotmeshio/long-tail/build/services/llm', () => ({
  callLLM: vi.fn().mockResolvedValue({ content: 'A search engine homepage with a logo and search bar.' }),
  hasLLMApiKey: vi.fn().mockReturnValue(true),
}));

import { captureScreenshot, analyzeScreenshot, storeAnalysis } from './activities';

describe('screenshot-research activities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('captureScreenshot', () => {
    it('captures and saves to storage at domain/key/date.png', async () => {
      const result = await captureScreenshot({
        url: 'https://google.com',
        domain: 'research',
        key: 'google',
      });

      expect(result.file_url).toMatch(/^research\/google\/\d{4}-\d{2}-\d{2}\.png$/);
      expect(result.size_bytes).toBe(1024);
      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringMatching(/^research\/google\/\d{4}-\d{2}-\d{2}\.png$/),
        expect.any(Buffer),
      );
    });

    it('uses fullPage option', async () => {
      const result = await captureScreenshot({
        url: 'https://example.com',
        domain: 'test',
        key: 'example',
        fullPage: false,
      });

      expect(result.file_url).toMatch(/^test\/example\/\d{4}-\d{2}-\d{2}\.png$/);
    });
  });

  describe('analyzeScreenshot', () => {
    it('reads from storage and returns LLM analysis', async () => {
      const result = await analyzeScreenshot({
        file_url: 'research/google/2026-04-20.png',
      });

      expect(result.analysis).toBe('A search engine homepage with a logo and search bar.');
      expect(mockRead).toHaveBeenCalledWith('research/google/2026-04-20.png');
    });

    it('returns placeholder when no API key configured', async () => {
      const { hasLLMApiKey } = await import('@hotmeshio/long-tail/build/services/llm');
      (hasLLMApiKey as any).mockReturnValueOnce(false);

      const result = await analyzeScreenshot({
        file_url: 'research/google/2026-04-20.png',
      });

      expect(result.analysis).toContain('no LLM API key configured');
    });
  });

  describe('storeAnalysis', () => {
    it('stores to knowledge with domain and key/date', async () => {
      const result = await storeAnalysis({
        domain: 'research',
        key: 'google',
        data: { url: 'https://google.com', analysis: 'Homepage' },
      });

      expect(result.domain).toBe('research');
      expect(mockStoreKnowledge).toHaveBeenCalledWith({
        domain: 'research',
        key: expect.stringMatching(/^google\/\d{4}-\d{2}-\d{2}$/),
        data: { url: 'https://google.com', analysis: 'Homepage' },
        tags: ['screenshot', 'google'],
      });
    });
  });
});
