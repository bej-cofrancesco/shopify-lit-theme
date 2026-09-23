import {
  html,
  state,
  each,
  liquidFilter,
  ShopifyLitElement,
  shopifyComponent,
} from 'shopify-lit';

/** Shopify media drop (from `product.media | json`). */
export interface ProductMedia {
  alt?: string;
  preview_image: { src: string };
}

export interface ProductCardProps {
  url: string;
  title: string;
  vendor?: string;
  price: number | string;
  media: ProductMedia[];
  size?: string;
}

@shopifyComponent({
  tag: 'product-card',
  propsSource: 'product',
  liquidContext: {
    url: 'product.url',
    title: 'product.title',
    vendor: 'product.vendor',
    price: 'product.price',
    media: 'product.media',
    size: "size | default: 'sm'",
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
      <article class="group flex w-full flex-col">
        <a
          class="relative block w-full overflow-hidden bg-gray-100 pt-[125%]"
          href=${this.props.url}
        >
          ${each(this.props.media.slice(0, 2), (media) => html`
            <img
              class="absolute inset-0 h-full w-full object-cover opacity-0 first:opacity-100 group-has-[img:nth-child(2)]:group-hover:first:opacity-0 [&:nth-child(n+2)]:group-hover:opacity-100"
              src=${liquidFilter(media.preview_image, 'image_url: width: 800')}
              alt=${media.alt}
              width="400"
              height="500"
              loading="lazy"
              decoding="async"
            />
          `)}
        </a>
        <div class="mt-2 flex flex-col gap-0.5">
          <h3 class="truncate text-sm font-medium text-gray-900">
            <a class="hover:underline" href=${this.props.url}>${this.props.title}</a>
          </h3>
          <p class="text-sm text-gray-600">${liquidFilter(this.props.price, 'money')}</p>
          <button
            type="button"
            class="mt-1 self-start text-3xs tracking-2 uppercase text-gray-500 transition-colors hover:text-black disabled:opacity-40"
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
