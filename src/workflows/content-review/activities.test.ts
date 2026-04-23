import { describe, it, expect } from 'vitest';
import { analyzeContent } from './activities';

describe('content-review / analyzeContent', () => {
  it('approves clean content with high confidence', async () => {
    const result = await analyzeContent({ content: 'This is a normal review.' });

    expect(result.confidence).toBe(0.95);
    expect(result.flags).toEqual([]);
    expect(result.summary).toBe('Content passes all checks.');
  });

  it('flags short content', async () => {
    const result = await analyzeContent({ content: 'Hi' });

    expect(result.confidence).toBe(0.4);
    expect(result.flags).toContain('too_short');
  });

  it('flags content containing HTML', async () => {
    const result = await analyzeContent({ content: 'Hello <script>alert("xss")</script>' });

    expect(result.confidence).toBe(0.4);
    expect(result.flags).toContain('contains_html');
  });

  it('flags content exceeding 10k characters', async () => {
    const result = await analyzeContent({ content: 'x'.repeat(10_001) });

    expect(result.confidence).toBe(0.4);
    expect(result.flags).toContain('too_long');
  });

  it('handles empty content', async () => {
    const result = await analyzeContent({ content: '' });

    expect(result.confidence).toBe(0.4);
    expect(result.flags).toContain('too_short');
  });
});
