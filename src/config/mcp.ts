import type { LTMcpServerConfig } from '@hotmeshio/long-tail';

import { createImageToolsServer } from '../mcp-servers/image-tools';
import { IMAGE_TOOLS } from '../mcp-servers/tool-manifests-image';
import { createGmailServer, GMAIL_SERVER_CONFIG } from '../mcp-servers/gmail';

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
};
