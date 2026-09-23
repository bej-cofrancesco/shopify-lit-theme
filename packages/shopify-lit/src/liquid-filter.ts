/**
 * Compile-time helpers mapped 1:1 to Liquid filters.
 *
 * SSR: the Vite compiler rewrites to `{{ value | filter }}`.
 * Client: returns a usable value from props JSON (e.g. image drops → `.src`).
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

export function liquidFilter<T>(value: T, filter: LiquidFilterName): T {
  if (typeof filter === 'string' && filter.startsWith('image_url')) {
    if (value && typeof value === 'object' && 'src' in (value as object)) {
      return (value as unknown as { src: T }).src;
    }
  }
  return value;
}
