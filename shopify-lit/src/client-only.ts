import { nothing, type TemplateResult } from 'lit';

type Skeleton = TemplateResult | typeof nothing;

/**
 * Client-only branch in `render()`.
 *
 * SSR / Liquid compile emits `skeleton` only.
 * Runtime returns `value` (the live template) — typically a ternary that keeps
 * matching the skeleton until client state is ready, then swaps:
 *
 *   ${clientOnly(
 *     { skeleton: html`<div class="closed">…</div>` },
 *     this.open ? html`<div class="open">…</div>` : html`<div class="closed">…</div>`,
 *   )}
 */
export function clientOnly<T>(
  _opts: { skeleton?: Skeleton },
  value: T,
): T {
  return value;
}
