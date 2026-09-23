export { ShopifyLitElement } from './shopify-lit-element';
export { reactiveProps, plainProps } from './reactive-props';
export {
  shopifyComponent,
  getShopifyComponentMeta,
  type ShopifyComponentOptions,
  type ShopifyComponentMeta,
} from './shopify-component';
export { liquidFilter, type LiquidFilterName } from './liquid-filter';
export { liquidHTML } from './liquid-html';
export { nest } from './nest';
export { each } from './each';
export { clientOnly } from './client-only';
export { LIT_SSR_ATTR } from './hydrate-support';
export { absorbRender } from './absorb';

export { html, nothing, svg, render } from 'lit';
export type { TemplateResult } from 'lit';

export { createRef, ref } from 'lit/directives/ref.js';
export type { Ref } from 'lit/directives/ref.js';
export { unsafeHTML } from 'lit/directives/unsafe-html.js';

/** All standard Lit decorators — same as `lit/decorators.js`. */
export {
  customElement,
  property,
  state,
  eventOptions,
  query,
  queryAll,
  queryAsync,
  queryAssignedElements,
  queryAssignedNodes,
} from 'lit/decorators.js';
