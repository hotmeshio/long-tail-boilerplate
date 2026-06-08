import type { LTMcpServerConfig } from '@hotmeshio/long-tail';

import { createImageToolsServer } from '../mcp-servers/image-tools';
import { IMAGE_TOOLS } from '../mcp-servers/tool-manifests-image';
import { createGmailServer, GMAIL_SERVER_CONFIG } from '../mcp-servers/gmail';
import { createPlaywrightServer } from '../mcp-servers/playwright';
import { createPlaywrightCliServer } from '../mcp-servers/playwright-cli';
import { PLAYWRIGHT_TOOLS, PLAYWRIGHT_CLI_TOOLS } from '../mcp-servers/tool-manifests-browser';

const IMAGE_TOOLS_CONFIG: LTMcpServerConfig = {
  description: 'Image processing tools — resize, crop, rotate, convert, blur, compress, and more.',
  tags: ['image', 'processing', 'vision'],
  category: 'Media',
  compileHints: 'Image tools accept file paths from storage. Use file_storage tools to upload images first.',
  toolManifest: IMAGE_TOOLS,
};

export const MCP_SERVER_FACTORIES = {
  'image-tools': { factory: createImageToolsServer, config: IMAGE_TOOLS_CONFIG },
  'long-tail-gmail': { factory: createGmailServer, config: GMAIL_SERVER_CONFIG },
  'long-tail-playwright': {
    factory: createPlaywrightServer,
    config: {
      description: 'Low-level browser automation via Playwright. Fine-grained control: navigate, click, fill, wait_for, evaluate, run_script.',
      tags: ['browser-automation', 'testing', 'screenshots'],
      category: 'Automation',
      compileHints: 'Session fields (_handle, page_id) MUST be threaded from the step that created them to EVERY subsequent browser step. run_script accepts a steps array — fixed implementation detail, never a dynamic input.',
      toolManifest: PLAYWRIGHT_TOOLS,
    } as LTMcpServerConfig,
  },
  'long-tail-playwright-cli': {
    factory: createPlaywrightCliServer,
    config: {
      description: 'High-level browser automation. Intent-based tools that handle session management, timing, and error recovery internally.',
      tags: ['browser-automation', 'screenshots', 'scraping', 'forms'],
      category: 'Automation',
      compileHints: 'Session fields (_handle, page_id) MUST be threaded from producing step to ALL subsequent browser steps. capture_page screenshot_path MUST include a file extension (.png).',
      toolManifest: PLAYWRIGHT_CLI_TOOLS,
    } as LTMcpServerConfig,
  },
};
