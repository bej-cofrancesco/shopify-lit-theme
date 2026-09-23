import { html as staticHtml, unsafeStatic } from 'lit/static-html.js';
import type { TemplateResult } from 'lit';

/**
 * Nest another shopify-lit component.
 *
 * Runtime: dynamic tag with `.props=${props}`.
 * Compile: `{% render 'tag-name', … %}`.
 */
export function nest<T extends object>(tag: string, props: T): TemplateResult {
  const el = unsafeStatic(tag);
  return staticHtml`<${el} .props=${props}></${el}>`;
}
