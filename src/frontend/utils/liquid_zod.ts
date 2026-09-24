import { z } from 'zod';

/**
 * Coerce detail values that arrived via Liquid → `props` JSON.
 *
 * `| json` may already emit native JSON types (number, boolean, null), but
 * render string literals always arrive as strings — these helpers accept both.
 */
export const liquid = {
  /** No detail. Liquid nil → JSON `null`; also accepts `undefined` / `''`. */
  none: z.preprocess(
    (v) => (v == null || v === '' ? undefined : v),
    z.undefined(),
  ),

  string: z.string(),

  number: z.coerce.number(),

  /** Native bool from `| json`, or `"true"` / `"false"` / `"1"` / `"0"` strings. */
  boolean: z.union([z.boolean(), z.stringbool()]),

  /**
   * Object or array: JSON string from Liquid, or already-parsed value.
   * Pass the Zod shape of the *parsed* value.
   */
  json: <T extends z.ZodType>(schema: T) =>
    z.preprocess((val, ctx) => {
      if (typeof val !== 'string') return val;
      try {
        return JSON.parse(val) as unknown;
      } catch {
        ctx.addIssue('Invalid JSON detail');
        return z.NEVER;
      }
    }, schema),
} as const;
