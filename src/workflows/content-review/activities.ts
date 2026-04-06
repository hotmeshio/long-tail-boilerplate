/**
 * Content Review activities.
 *
 * Simple content analysis that returns a confidence score.
 * Replace with your own analysis logic (LLM call, classifier, etc.).
 */

export async function analyzeContent(input: { content: string }): Promise<{
  confidence: number;
  flags: string[];
  summary: string;
}> {
  const content = input.content || '';

  // Placeholder analysis — replace with real logic
  const flags: string[] = [];
  if (content.length < 10) flags.push('too_short');
  if (content.length > 10000) flags.push('too_long');
  if (/[<>]/.test(content)) flags.push('contains_html');

  const confidence = flags.length === 0 ? 0.95 : 0.4;

  return {
    confidence,
    flags,
    summary: flags.length === 0
      ? 'Content passes all checks.'
      : `Content flagged: ${flags.join(', ')}.`,
  };
}
