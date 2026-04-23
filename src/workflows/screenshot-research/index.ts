import { Durable } from '@hotmeshio/hotmesh';
import type { LTEnvelope } from '@hotmeshio/long-tail';

import * as activities from './activities';

type ActivitiesType = typeof activities;

const {
  captureScreenshot,
  analyzeScreenshot,
  storeAnalysis,
} = Durable.workflow.proxyActivities<ActivitiesType>({ activities });

export async function screenshotResearch(envelope: LTEnvelope): Promise<any> {
  const { url, domain, key, fullPage, prompt } = envelope.data as {
    url: string;
    domain: string;
    key: string;
    fullPage?: boolean;
    prompt?: string;
  };

  const date = new Date().toISOString().slice(0, 10);

  // 1. Capture screenshot and save to file storage
  const screenshot = await captureScreenshot({ url, domain, key, fullPage });

  // 2. Analyze screenshot via vision LLM
  const vision = await analyzeScreenshot({
    file_url: screenshot.file_url,
    prompt,
  });

  // 3. Store analysis in knowledge store
  const stored = await storeAnalysis({
    domain,
    key,
    data: {
      url,
      date,
      file_url: screenshot.file_url,
      size_bytes: screenshot.size_bytes,
      analysis: vision.analysis,
    },
    tags: ['screenshot', key],
  });

  return {
    type: 'return' as const,
    data: {
      url,
      domain,
      key,
      analysis: vision.analysis,
      file_url: screenshot.file_url,
      knowledge_key: stored.key,
    },
  };
}
