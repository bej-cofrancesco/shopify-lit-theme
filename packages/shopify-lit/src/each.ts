import type { TemplateResult } from 'lit';
import { nothing } from 'lit';

type EachResult = TemplateResult | typeof nothing | null | undefined | string | number | boolean;

/**
 * Compilable list loop — Liquid `{% for item in collection %}`.
 *
 * Prefer this over `array.map()` so the shopify-lit compiler sees an explicit
 * `each()` call (same runtime result: an array of template values).
 *
 *   ${each(this.props.media, (media) => html`<img …>`)}
 *   ${each(this.props.media.slice(0, 2), (media) => html`…`)}
 */
export function each<T>(
  items: Iterable<T> | ArrayLike<T> | null | undefined,
  renderItem: (item: T, index: number) => EachResult,
): EachResult[] {
  if (items == null) return [];
  const list = Array.isArray(items) ? items : Array.from(items as Iterable<T>);
  const out: EachResult[] = [];
  for (let i = 0; i < list.length; i++) {
    const result = renderItem(list[i] as T, i);
    if (result == null || result === false || result === nothing) continue;
    out.push(result);
  }
  return out;
}
