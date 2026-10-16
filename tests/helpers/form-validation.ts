/**
 * Runs a form schema through long-tail's shared validation pass, the same
 * code the dashboard runs before submit and the server runs for
 * `enforce_schema` roles and the invoke gate.
 */

import { validateResolverPayload, type ResolverValidationContext } from '@hotmeshio/long-tail/build/shared/form-validation';

/** The fields that fail, keyed to their messages. */
export function violationsOf(
  schema: Record<string, unknown>,
  payload: Record<string, unknown>,
  ctx?: ResolverValidationContext,
): Record<string, string> {
  return Object.fromEntries(validateResolverPayload(schema, payload, ctx ?? null).map((v) => [v.field, v.message]));
}

/** A tiny PNG data URL, enough to satisfy a signature field. */
export const SIGNATURE = 'data:image/png;base64,iVBORw0KGgo=';
