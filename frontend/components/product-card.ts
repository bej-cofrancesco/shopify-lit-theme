import {
  html,
  nothing,
  state,
  ShopifyLitElement,
  shopifyComponent,
  liquidFilter,
} from 'shopify-lit';

export interface ProductCardProps {
  url: string;
  title: string;
  vendor?: string;
  price: string;
  image_url?: string;
  image_alt?: string;
}

@shopifyComponent({
  tag: 'product-card',
  propsSource: 'product',
  liquidContext: {
    url: 'product.url',
    title: 'product.title',
    vendor: 'product.vendor',
    price: 'product.price',
    image_url: 'image_url',
    image_alt: 'image_alt',
  },
  moduleSpecifier: '@components/product-card.ts',
  snippet: 'product-card',
})
export class ProductCard extends ShopifyLitElement<ProductCardProps> {
  @state()
  private added = false;

  onAdd = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if (this.added) return;
    this.added = true;
  };

  render() {
    return html`
      <article
        class="group flex w-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
      >
        <a
          class="relative block aspect-[4/5] overflow-hidden bg-stone-100"
          href=${this.props.url}
        >
          ${this.props.image_url
            ? html`
                <img
                  class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                  src=${this.props.image_url}
                  alt=${this.props.image_alt}
                  width="800"
                  height="1000"
                  loading="lazy"
                  decoding="async"
                />
              `
            : nothing}
        </a>

        <div class="flex flex-1 flex-col gap-2 p-4">
          <p class="text-xs font-medium tracking-wide text-stone-400 uppercase">
            ${this.props.vendor}
          </p>
          <h3 class="text-base font-semibold text-stone-900">
            <a class="hover:underline" href=${this.props.url}>${this.props.title}</a>
          </h3>
          <p class="text-sm text-stone-600">
            ${liquidFilter(this.props.price, 'money')}
          </p>
          <button
            type="button"
            class="mt-auto inline-flex items-center justify-center rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:bg-stone-400"
            ?disabled=${this.added}
            aria-label=${this.added ? 'Added to cart' : 'Add to cart'}
            @click=${this.onAdd}
          >
            ${this.added ? 'Added' : 'Add to cart'}
          </button>
        </div>
      </article>
    `;
  }
}
