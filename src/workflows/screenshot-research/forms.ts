/**
 * The `screenshotResearch` invoke form. The capture is stored at
 * `<domain>/<key>/<date>.png` and the analysis under the same knowledge
 * domain and key, so both are guarded as path-safe slugs.
 */

const SLUG = '^[a-z0-9][a-z0-9-]{1,62}$';
const SLUG_ERROR = 'Use 2 to 63 lowercase letters, digits, and dashes';

export const SCREENSHOT_INPUT_SCHEMA = {
  type: 'object',
  'x-lt-layout': 'two-column',
  'x-lt-help': 'Captures **{{input.url}}** with Playwright, stores the PNG under `{{input.domain}}/{{input.key}}/`, analyzes it with the vision model, and saves the analysis as knowledge `{{input.domain}}/{{input.key}}`. The analysis needs `ANTHROPIC_API_KEY`.',
  'x-lt-order': ['url', 'domain', 'key', 'fullPage', 'prompt'],
  required: ['url', 'domain', 'key'],
  properties: {
    url: {
      type: 'string',
      format: 'uri',
      title: 'Page URL',
      description: 'Enter the page to capture',
      default: 'https://example.com',
      'x-lt-span': 2,
    },
    domain: {
      type: 'string',
      title: 'Knowledge domain',
      description: 'Enter where the analysis is filed',
      default: 'screenshots',
      pattern: SLUG,
      'x-lt-pattern-error': SLUG_ERROR,
    },
    key: {
      type: 'string',
      title: 'Key',
      description: 'Enter a name for this page',
      default: 'example-home',
      pattern: SLUG,
      'x-lt-pattern-error': SLUG_ERROR,
    },
    fullPage: {
      type: 'boolean',
      title: 'Capture',
      description: 'Pick the whole scroll height or the first screen',
      default: true,
      'x-lt-options': [{ value: true, label: 'Full page' }, { value: false, label: 'First screen' }],
    },
    prompt: {
      type: 'string',
      format: 'textarea',
      title: 'Analysis prompt',
      description: 'Optional; what to look for',
      maxLength: 2000,
      'x-lt-span': 2,
    },
  },
};
