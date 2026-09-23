export type ShopifyComponentOptions = {
  /** Custom element tag name, e.g. "product-card" */
  tag: string;
  /**
   * How `this.props` maps to Liquid variables.
   * Example: `{ value: 'value' }` → `this.props.value` → Liquid `value`.
   */
  liquidContext?: Record<string, string>;
  /**
   * Build `{% capture props %}` from a Shopify product drop
   * (`{% render 'x', product: product %}`).
   */
  propsSource?: 'product' | 'props';
  /** Vite entry override (default `@components/<filename>.ts`) */
  moduleSpecifier?: string;
  /** Snippet filename without .liquid (default: filename stem) */
  snippet?: string;
};

const META = Symbol.for('shopify-lit.component');

export type ShopifyComponentMeta = ShopifyComponentOptions;

/**
 * Marks a class for the shopify-lit Vite compiler and registers the CE.
 */
export function shopifyComponent(options: ShopifyComponentOptions) {
  return function <T extends CustomElementConstructor>(ctor: T): T {
    Object.defineProperty(ctor, META, {
      value: { ...options } satisfies ShopifyComponentMeta,
      enumerable: false,
      configurable: true,
    });

    if (typeof customElements !== 'undefined' && !customElements.get(options.tag)) {
      customElements.define(options.tag, ctor);
    }

    return ctor;
  };
}

export function getShopifyComponentMeta(
  ctor: CustomElementConstructor | Function,
): ShopifyComponentMeta | undefined {
  return (ctor as unknown as Record<symbol, ShopifyComponentMeta>)[META];
}
