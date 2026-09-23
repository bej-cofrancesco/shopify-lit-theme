/**
 * Compile-time helpers mapped 1:1 to Liquid filters.
 * Runtime returns the raw value (Liquid already applied formatting in SSR;
 * client JSON usually carries pre-formatted strings).
 */
export type LiquidFilterName =
  | 'money'
  | 'escape'
  | 'json'
  | 'handleize'
  | 'downcase'
  | 'upcase'
  | `image_url: width: ${number}`
  | (string & {});

export function liquidFilter<T>(value: T, _filter: LiquidFilterName): T {
  return value;
}
