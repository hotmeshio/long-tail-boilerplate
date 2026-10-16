/**
 * Zod helpers for resolver payloads that come from a dashboard form.
 *
 * The form submits every bound field, including ones `x-lt-showIf` hid and
 * ones left untouched, carrying their blank defaults (`""` or `null`). The
 * contract reads those as absent, so a hidden number field never fails a
 * number check.
 */

import { z } from 'zod';
import { parseResolverPayload } from '@hotmeshio/long-tail/build/lib/typed-resolution';

/** An optional field that treats `""` and `null` as absent. */
export function blankAsAbsent<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === '' || value === null ? undefined : value), schema.optional());
}

/**
 * `parseResolverPayload` typed by the schema's output. Its `ZodType<T>`
 * parameter infers T from input and output alike, and a preprocessed field's
 * input is `unknown`; this keeps the parsed type.
 */
export function parseFormPayload<S extends z.ZodTypeAny>(schema: S, payload: unknown): z.output<S> {
  return parseResolverPayload(schema as unknown as z.ZodType<z.output<S>>, payload);
}
