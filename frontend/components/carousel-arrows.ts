import {
  html,
  nothing,
  liquidHTML,
  each,
  nest,
  ShopifyLitElement,
  shopifyComponent,
  createRef,
  ref,
  type Ref,
  type TemplateResult,
} from 'shopify-lit';
import './product-card';

const EDGE_TOLERANCE = 2;

export interface CarouselArrowsProps {
  title?: string;
  /** Raw track markup (Liquid `{% capture %}` of `<li>` slides, etc.). */
  html?: string;
  /** Or product drops — each becomes a nested product-card. */
  products?: object[];
  loop?: boolean;
}

/**
 * Horizontal scroller. Lit owns markup; `@click` binds like qty-stepper.
 * Track: `props.html` (any slides) and/or `props.products`.
 */
@shopifyComponent({
  tag: 'carousel-arrows',
  liquidContext: {
    title: 'title',
    html: 'html',
    products: 'products',
    loop: 'loop',
  },
  moduleSpecifier: '@components/carousel-arrows.ts',
  snippet: 'carousel-arrows',
})
export class CarouselArrows extends ShopifyLitElement<CarouselArrowsProps> {
  private trackRef: Ref<HTMLElement> = createRef();
  private arrowsRef: Ref<HTMLDivElement> = createRef();
  private prevRef: Ref<HTMLButtonElement> = createRef();
  private nextRef: Ref<HTMLButtonElement> = createRef();

  #resize?: ResizeObserver;
  #frame = 0;

  get #loop(): boolean {
    return Boolean(this.props.loop);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.trackRef.value?.removeEventListener('scroll', this.#queueUpdate);
    this.#resize?.disconnect();
    if (this.#frame) cancelAnimationFrame(this.#frame);
  }

  protected firstUpdated(): void {
    const track = this.trackRef.value;
    if (!track) return;
    track.addEventListener('scroll', this.#queueUpdate, { passive: true });
    this.#resize = new ResizeObserver(this.#queueUpdate);
    this.#resize.observe(track);
    this.#sync();
  }

  onPrev = (): void => {
    this.#scrollPage(-1);
  };

  onNext = (): void => {
    this.#scrollPage(1);
  };

  #step(): number {
    const track = this.trackRef.value;
    if (!track) return 0;
    const item = track.firstElementChild as HTMLElement | null;
    if (!item) return track.clientWidth;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const itemWidth = item.getBoundingClientRect().width + gap;
    if (!itemWidth) return track.clientWidth;
    const perPage = Math.max(1, Math.floor(track.clientWidth / itemWidth));
    return itemWidth * perPage;
  }

  #scrollPage(direction: 1 | -1): void {
    const track = this.trackRef.value;
    if (!track) return;
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    const atStart = track.scrollLeft <= EDGE_TOLERANCE;
    const atEnd = track.scrollLeft >= maxScroll - EDGE_TOLERANCE;

    if (this.#loop) {
      if (direction === 1 && atEnd) {
        track.scrollTo({ left: 0, behavior: 'auto' });
        return;
      }
      if (direction === -1 && atStart) {
        track.scrollTo({ left: maxScroll, behavior: 'auto' });
        return;
      }
    }

    track.scrollBy({ left: this.#step() * direction, behavior: 'smooth' });
  }

  #queueUpdate = (): void => {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#sync();
    });
  };

  #sync(): void {
    const track = this.trackRef.value;
    if (!track) return;
    const maxScroll = track.scrollWidth - track.clientWidth;
    const canScroll = maxScroll > EDGE_TOLERANCE;
    const atStart = track.scrollLeft <= EDGE_TOLERANCE;
    const atEnd = track.scrollLeft >= maxScroll - EDGE_TOLERANCE;

    this.arrowsRef.value?.classList.toggle('!hidden', !canScroll);
    this.arrowsRef.value?.classList.toggle('flex', canScroll);

    if (this.#loop) {
      if (this.prevRef.value) this.prevRef.value.disabled = !canScroll;
      if (this.nextRef.value) this.nextRef.value.disabled = !canScroll;
      return;
    }

    if (this.prevRef.value) this.prevRef.value.disabled = atStart;
    if (this.nextRef.value) this.nextRef.value.disabled = atEnd;
  }

  render(): TemplateResult {
    return html`
      <div class="block">
        <div class="mb-2 flex items-center justify-between gap-4">
          ${
            this.props.title
              ? html`<h3
                  class="text-3xs leading-sm tracking-2 font-bold uppercase text-gray-400"
                >
                  ${this.props.title}
                </h3>`
              : nothing
          }
          <div ${ref(this.arrowsRef)} class="hidden items-center gap-2 md:flex">
            <button
              ${ref(this.prevRef)}
              type="button"
              aria-label="Previous"
              class="flex h-[2em] w-[2em] items-center justify-center opacity-70 transition-opacity hover:opacity-100 disabled:opacity-30"
              @click=${this.onPrev}
            >
              <span class="inline-flex h-4 w-4 -scale-x-100" aria-hidden="true">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  class="h-4 w-4"
                >
                  <path
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </span>
            </button>
            <button
              ${ref(this.nextRef)}
              type="button"
              aria-label="Next"
              class="flex h-[2em] w-[2em] items-center justify-center opacity-70 transition-opacity hover:opacity-100 disabled:opacity-30"
              @click=${this.onNext}
            >
              <span class="inline-flex h-4 w-4" aria-hidden="true">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  class="h-4 w-4"
                >
                  <path
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </span>
            </button>
          </div>
        </div>
        <ul
          ${ref(this.trackRef)}
          class="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 scroll-pl-4 md:mx-0 md:px-0 md:scroll-pl-0"
        >
          ${
            this.props.html
              ? liquidHTML(this.props.html)
              : each(
                  this.props.products,
                  (product) => html`
                    <li
                      class="w-[calc((100%+1rem)/3.35-4px)] shrink-0 snap-start md:w-[calc(100%/3.35-4px)]"
                    >
                      ${nest('product-card', product)}
                    </li>
                  `,
                )
          }
        </ul>
      </div>
    `;
  }
}
