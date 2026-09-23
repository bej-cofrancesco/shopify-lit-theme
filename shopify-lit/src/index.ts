export { ShopifyLitElement } from './shopify-lit-element';
export { reactiveProps, plainProps } from './reactive-props';
export {
  shopifyComponent,
  getShopifyComponentMeta,
  type ShopifyComponentOptions,
  type ShopifyComponentMeta,
} from './shopify-component';
export { liquidFilter, type LiquidFilterName } from './liquid-filter';
export { nest } from './nest';
export { LIT_SSR_ATTR } from './hydrate-support';
export { absorbRender } from './absorb';

export { html, nothing, svg } from 'lit';
export type { TemplateResult } from 'lit';

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
