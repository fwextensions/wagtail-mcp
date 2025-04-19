// Utility to preprocess null/undefined to undefined for Zod schemas
import { ZodTypeAny, preprocess } from "zod";

/**
 * Wraps a Zod schema so that null/undefined input is always treated as undefined.
 * Usage: zNullToUndefined(z.string().optional())
 */
export function zNullToUndefined<T extends ZodTypeAny>(schema: T): T {
  // @ts-expect-error zod preprocess typing is awkward for generic pass-through
  return preprocess((val) => val == null ? undefined : val, schema);
}
