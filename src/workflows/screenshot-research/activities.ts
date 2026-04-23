import { chromium, type Browser, type Page } from 'playwright';
import { getStorageBackend } from '@hotmeshio/long-tail/build/lib/storage';
import * as knowledge from '@hotmeshio/long-tail/build/system/activities/knowledge';

// ── Browser singleton ───────���────────────────────────────────────────────────

let browser: Browser | null = null;

async function ensureBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// ── Activity: captureScreenshot ─────────────��────────────────────────────────

export async function captureScreenshot(input: {
  url: string;
  domain: string;
  key: string;
  fullPage?: boolean;
}): Promise<{ file_url: string; size_bytes: number }> {
  const date = new Date().toISOString().slice(0, 10);
  const storagePath = `${input.domain}/${input.key}/${date}.png`;

  const b = await ensureBrowser();
  const page: Page = await b.newPage();

  try {
    await page.goto(input.url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(2000);

    const screenshotBuffer = await page.screenshot({
      fullPage: input.fullPage ?? true,
    });

    const backend = getStorageBackend();
    const { size } = await backend.write(storagePath, screenshotBuffer);

    return { file_url: storagePath, size_bytes: size };
  } finally {
    await page.close();
  }
}

// ── Activity: analyzeScreenshot ──────────────────���───────────────────────────

export async function analyzeScreenshot(input: {
  file_url: string;
  prompt?: string;
}): Promise<{ analysis: string }> {
  const { callLLM, hasLLMApiKey } = await import(
    '@hotmeshio/long-tail/build/services/llm'
  );

  const model = process.env.LT_LLM_MODEL_SECONDARY || 'claude-sonnet-4-20250514';
  if (!hasLLMApiKey(model)) {
    return { analysis: '[no LLM API key configured — skipping vision analysis]' };
  }

  const backend = getStorageBackend();
  const { data } = await backend.read(input.file_url);
  const base64 = data.toString('base64');
  const dataUri = `data:image/png;base64,${base64}`;

  const systemPrompt = input.prompt ||
    'Analyze this screenshot. Describe what you see: layout, content, notable elements, and any text visible. Be concise but thorough.';

  const response = await callLLM({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: dataUri } } as any] },
    ],
    max_tokens: 1024,
    temperature: 0,
  });

  return { analysis: response.content || '' };
}

// ── Activity: storeAnalysis ───��──────────────────────────────────────────────

export async function storeAnalysis(input: {
  domain: string;
  key: string;
  data: Record<string, any>;
  tags?: string[];
}): Promise<{ id: string; domain: string; key: string; updated_at: string }> {
  const date = new Date().toISOString().slice(0, 10);
  const knowledgeKey = `${input.key}/${date}`;

  return knowledge.storeKnowledge({
    domain: input.domain,
    key: knowledgeKey,
    data: input.data,
    tags: input.tags || ['screenshot', input.key],
  });
}
