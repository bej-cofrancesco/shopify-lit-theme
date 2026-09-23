import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { TemplateResult } from 'lit';

/**
 * Raw HTML from Liquid (or a string prop).
 *
 * SSR compile: `{{ path }}` (unescaped).
 * Client: `unsafeHTML(value)`.
 *
 * Use for track bodies, idle panels, etc. — not for untrusted input.
 */
export function liquidHTML(value: string | null | undefined): TemplateResult {
  return unsafeHTML(value ?? '') as TemplateResult;
}
