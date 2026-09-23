import {
  html,
  nothing,
  state,
  each,
  liquidHTML,
  clientOnly,
  shopifyComponent,
  createRef,
  ref,
  type Ref,
  unsafeHTML,
} from 'shopify-lit';
import { ShopifyDrawer, type DrawerProps } from './shopify-drawer';
import { debounce } from '@frontend/lib/debounce';
import './carousel-arrows';
import './product-card';

export interface SearchDrawerProps extends DrawerProps {
  searchUrl: string;
  /** Trending carousel markup (`{% render 'carousel-arrows', skip_script: true %}`). */
  trendingHtml?: string;
  /** Static aside (trending terms / collections). Recent is client-only. */
  asideHtml?: string;
  /** Aside has static Liquid content. */
  hasAsideStatic?: boolean;
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 120;
const CACHE_LIMIT = 40;
const RECENT_LIMIT = 5;
const RESOURCE_LIMIT = 8;
const RECENT_KEY = 'recentSearches';

function readRecentSearches(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(stored)
      ? stored.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Predictive search drawer — always compiles (`@shopifyComponent` → snippet).
 *
 * Server paints the closed shell + idle grid via `clientOnly({ skeleton })`.
 * Client live branch takes over for open state, results, recent, clear, etc.
 */
@shopifyComponent({
  tag: 'search-drawer',
  liquidContext: {
    searchUrl: 'search_url',
    trendingHtml: 'trending_html',
    asideHtml: 'aside_html',
    hasAsideStatic: 'has_aside_static',
    title: 'title',
    position: 'position',
    drawerHeightClass: 'drawer_height_class',
    class: 'class',
    openEvent: 'open_event',
    closeEvent: 'close_event',
  },
  moduleSpecifier: '@components/search-drawer.ts',
  snippet: 'search-drawer',
})
export class SearchDrawer extends ShopifyDrawer<SearchDrawerProps> {
  inputRef: Ref<HTMLInputElement> = createRef();

  @state()
  private term = '';

  @state()
  private resultsHtml = '';

  /** Eager empty — load after absorb so first live paint matches skeleton. */
  @state()
  private recentSearches: string[] = [];

  private activeQuery = '';
  private cache = new Map<string, string>();
  private controller?: AbortController;

  private _debouncedRequest = debounce(() => {
    this._requestResults(this.inputRef.value?.value ?? '');
  }, DEBOUNCE_MS);

  protected firstUpdated(): void {
    this.recentSearches = readRecentSearches();
  }

  protected override _openDrawer(): void {
    super._openDrawer();
    this._focusInput();
  }

  protected override _closeDrawer(): void {
    this._abort();
    super._closeDrawer();
  }

  protected override _focusDrawerTarget(_root: HTMLElement): void {
    this._focusInput();
  }

  private _focusInput(attempt = 0): void {
    if (!this._open && attempt > 0) return;
    const input = this.inputRef.value;
    if (input) {
      input.focus({ preventScroll: true });
      return;
    }
    if (attempt < 12) {
      requestAnimationFrame(() => this._focusInput(attempt + 1));
    }
  }

  private _endpoint(query: string): string {
    const root =
      (window as unknown as { Shopify?: { routes?: { root?: string } } }).Shopify
        ?.routes?.root ?? '/';
    const params = new URLSearchParams({
      q: query,
      'resources[type]': 'product,collection,query',
      'resources[limit]': String(RESOURCE_LIMIT),
      'resources[limit_scope]': 'each',
      section_id: 'predictive_search',
    });
    return `${root}search/suggest?${params.toString()}`;
  }

  private _abort(): void {
    this.controller?.abort();
    this.controller = undefined;
  }

  private _remember(key: string, markup: string): void {
    this.cache.set(key, markup);
    if (this.cache.size <= CACHE_LIMIT) return;
    const oldest = this.cache.keys().next().value;
    if (oldest !== undefined) this.cache.delete(oldest);
  }

  private _requestResults(raw: string): void {
    const query = raw.trim();

    if (query.length < MIN_QUERY_LENGTH) {
      this._abort();
      this.activeQuery = '';
      this.resultsHtml = '';
      return;
    }

    if (query === this.activeQuery && this.resultsHtml) return;

    this.activeQuery = query;

    const key = query.toLowerCase();
    const cached = this.cache.get(key);

    if (cached !== undefined) {
      this._abort();
      this.resultsHtml = cached;
      return;
    }

    void this._fetchResults(query, key);
  }

  private async _fetchResults(query: string, key: string): Promise<void> {
    this._abort();
    const controller = new AbortController();
    this.controller = controller;

    try {
      const response = await fetch(this._endpoint(query), {
        signal: controller.signal,
      });
      if (!response.ok) return;

      const markup = await response.text();
      this._remember(key, markup);
      if (this.activeQuery !== query) return;
      this.resultsHtml = markup;
    } catch {
      /* aborted / offline */
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }

  onInput = (event: Event): void => {
    this.term = (event.target as HTMLInputElement).value;
    this._debouncedRequest();
  };

  onSubmit = (): void => {
    const query = this.inputRef.value?.value?.trim();
    if (query) this._saveRecentSearch(query);
  };

  onClearInput = (): void => {
    this._abort();
    this.activeQuery = '';
    this.resultsHtml = '';
    this.term = '';
    const input = this.inputRef.value;
    if (!input) return;
    input.value = '';
    input.focus({ preventScroll: true });
  };

  onClearRecent = (): void => {
    this.recentSearches = [];
    localStorage.removeItem(RECENT_KEY);
  };

  onApplyTerm = (event: Event): void => {
    const button = event.currentTarget as HTMLElement;
    const term = button.getAttribute('data-term');
    if (term) this._applyTerm(term);
  };

  onPanelClick = (event: Event): void => {
    const path = event.composedPath();

    const apply = path.find(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && node.hasAttribute('data-search-apply'),
    );
    if (apply) {
      event.preventDefault();
      const term = apply.getAttribute('data-search-apply');
      if (term) this._applyTerm(term);
      return;
    }

    const link = path.find(
      (node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement,
    );
    if (!link) return;
    const term =
      link.closest('[data-search-term]')?.getAttribute('data-search-term') ||
      this.activeQuery;
    if (term) this._saveRecentSearch(term);
  };

  private _applyTerm(term: string): void {
    const input = this.inputRef.value;
    if (input) {
      input.value = term;
      input.focus({ preventScroll: true });
    }
    this.term = term;
    this._requestResults(term);
  }

  private _saveRecentSearch(search: string): void {
    const next = [
      search,
      ...this.recentSearches.filter((item) => item !== search),
    ].slice(0, RECENT_LIMIT);
    this.recentSearches = next;
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  }

  /**
   * Compilable idle grid — Liquid SSR + live idle (no recent).
   * Recent is layered in the client-only live branch.
   */
  render() {
    return html`
      ${clientOnly(
        {
          skeleton: html`
            <div
              role="dialog"
              aria-modal="true"
              tabindex="-1"
              inert
              class="left-0 right-0 -top-[150%] z-50 h-[100dvh] max-h-[100dvh] w-full fixed bg-white text-black outline-none"
            >
              <div class="flex h-full w-full flex-col">
                <div
                  class="flex shrink-0 items-center gap-2 px-4 py-3 md:gap-4 md:px-8 md:py-4"
                >
                  <form
                    action=${this.props.searchUrl}
                    class="flex grow items-center gap-2.5 border border-gray-200 bg-gray-50 px-3 py-2.5 md:px-4"
                  >
                    <button
                      type="submit"
                      aria-label="Search"
                      class="flex h-5 w-5 shrink-0 items-center justify-center text-gray-500"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        class="h-full w-full"
                        aria-hidden="true"
                      >
                        <path
                          stroke="currentColor"
                          stroke-width="1.75"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="m21 21-4.35-4.35M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z"
                        />
                      </svg>
                    </button>
                    <label class="sr-only" for="search-drawer-input"
                      >Search products</label
                    >
                    <input
                      id="search-drawer-input"
                      type="text"
                      name="q"
                      class="h-6 w-full grow appearance-none bg-transparent text-[16px] font-medium leading-none outline-none placeholder:font-normal placeholder:text-gray-400"
                      placeholder="Search for products or collections"
                      autocomplete="off"
                    />
                  </form>
                  <div
                    class="flex h-10 w-10 shrink-0 items-center justify-center"
                  >
                    <button
                      type="button"
                      class="relative flex items-center justify-center"
                      aria-label=${this.props.title}
                      tabindex="-1"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        class="h-5 w-5"
                        aria-hidden="true"
                      >
                        <path
                          stroke="currentColor"
                          stroke-width="1.75"
                          stroke-linecap="round"
                          d="M6 6l12 12M18 6 6 18"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
                <div
                  class="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain border-t border-gray-100 px-4 py-5 md:px-8 md:py-6"
                >
                  <div
                    class="flex flex-col gap-7 md:grid md:grid-cols-[minmax(0,1fr)_240px] md:items-start md:gap-10"
                  >
                    ${
                      this.props.trendingHtml
                        ? html`<div
                            class="${this.props.hasAsideStatic
                              ? 'block'
                              : 'block md:col-span-2'}"
                            data-search-trending-carousel
                          >
                            ${liquidHTML(this.props.trendingHtml)}
                          </div>`
                        : nothing
                    }
                    ${
                      this.props.hasAsideStatic
                        ? html`<div
                            class="${this.props.trendingHtml
                              ? 'border-t border-gray-100 pt-6 '
                              : ''}flex flex-col gap-6 md:border-t-0 md:pt-0"
                            data-search-aside
                          >
                            ${liquidHTML(this.props.asideHtml)}
                          </div>`
                        : nothing
                    }
                  </div>
                </div>
              </div>
            </div>
          `,
        },
        html`
          ${
            this._open
              ? html`<div
                  class="fixed inset-0 z-50 bg-black/40 transition-opacity opacity-100"
                  @click=${this.onDismiss}
                  aria-hidden="true"
                ></div>`
              : nothing
          }
          <div
            role="dialog"
            aria-modal="true"
            tabindex="-1"
            ?inert=${!this._open}
            class="left-0 right-0 z-50 h-[100dvh] max-h-[100dvh] w-full fixed bg-white text-black outline-none transition-[top] duration-300 ease-out ${this
              ._open
              ? 'top-0'
              : '-top-[150%]'}"
            ${ref(this.drawerRef)}
            @keydown=${this.onKeydown}
          >
            <div class="flex h-full w-full flex-col">
              <div
                class="flex shrink-0 items-center gap-2 px-4 py-3 md:gap-4 md:px-8 md:py-4"
              >
                <form
                  action=${this.props.searchUrl}
                  class="flex grow items-center gap-2.5 border border-gray-200 bg-gray-50 px-3 py-2.5 transition-colors focus-within:border-gray-400 focus-within:bg-white md:px-4"
                  @submit=${this.onSubmit}
                >
                  <button
                    type="submit"
                    aria-label="Search"
                    class="flex h-5 w-5 shrink-0 items-center justify-center text-gray-500"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      class="h-full w-full"
                      aria-hidden="true"
                    >
                      <path
                        stroke="currentColor"
                        stroke-width="1.75"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="m21 21-4.35-4.35M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z"
                      />
                    </svg>
                  </button>
                  <label class="sr-only" for="search-drawer-input"
                    >Search products</label
                  >
                  <input
                    ${ref(this.inputRef)}
                    id="search-drawer-input"
                    type="text"
                    name="q"
                    class="h-6 w-full grow appearance-none bg-transparent text-[16px] font-medium leading-none outline-none focus:outline-none focus-visible:!outline-none placeholder:font-normal placeholder:text-gray-400"
                    placeholder="Search for products or collections"
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck="false"
                    enterkeyhint="search"
                    @input=${this.onInput}
                  />
                  ${
                    this.term
                      ? html`<button
                          type="button"
                          class="text-3xs tracking-2 shrink-0 uppercase text-gray-500 transition-colors hover:text-black"
                          @click=${this.onClearInput}
                        >
                          Clear
                        </button>`
                      : nothing
                  }
                </form>
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center transition-colors hover:bg-gray-100"
                >
                  <button
                    type="button"
                    @click=${this.onDismiss}
                    tabindex=${this._open ? '0' : '-1'}
                    class="relative flex items-center justify-center"
                    aria-label=${this.props.title}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      class="h-5 w-5"
                      aria-hidden="true"
                    >
                      <path
                        stroke="currentColor"
                        stroke-width="1.75"
                        stroke-linecap="round"
                        d="M6 6l12 12M18 6 6 18"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div
                class="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain border-t border-gray-100 px-4 py-5 md:px-8 md:py-6"
                @click=${this.onPanelClick}
              >
                ${
                  this.resultsHtml
                    ? unsafeHTML(this.resultsHtml)
                    : html`
                        <div
                          class="flex flex-col gap-7 md:grid md:grid-cols-[minmax(0,1fr)_240px] md:items-start md:gap-10"
                        >
                          ${
                            this.props.trendingHtml
                              ? html`<div
                                  class="${this.props.hasAsideStatic ||
                                  this.recentSearches.length
                                    ? 'block'
                                    : 'block md:col-span-2'}"
                                  data-search-trending-carousel
                                >
                                  ${liquidHTML(this.props.trendingHtml)}
                                </div>`
                              : nothing
                          }
                          ${
                            this.props.hasAsideStatic ||
                            this.recentSearches.length
                              ? html`<div
                                  class="${this.props.trendingHtml
                                    ? 'border-t border-gray-100 pt-6 '
                                    : ''}flex flex-col gap-6 md:border-t-0 md:pt-0"
                                  data-search-aside
                                >
                                  ${
                                    this.recentSearches.length
                                      ? html`
                                          <div class="flex flex-col gap-2">
                                            <div
                                              class="flex items-baseline justify-between gap-4"
                                            >
                                              <h3
                                                class="text-3xs leading-sm tracking-2 font-bold uppercase text-gray-400"
                                              >
                                                Recent searches
                                              </h3>
                                              <button
                                                type="button"
                                                class="text-3xs tracking-2 uppercase text-gray-400 transition-colors hover:text-black"
                                                @click=${this.onClearRecent}
                                              >
                                                Clear
                                              </button>
                                            </div>
                                            <ul class="flex flex-col">
                                              ${each(
                                                this.recentSearches.slice(
                                                  0,
                                                  RECENT_LIMIT,
                                                ),
                                                (term) => html`
                                                  <li>
                                                    <button
                                                      type="button"
                                                      class="group -mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-2 px-2 py-1.5 text-left text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-black"
                                                      data-term=${term}
                                                      @click=${this.onApplyTerm}
                                                    >
                                                      <span>${term}</span>
                                                      <span
                                                        class="text-gray-400 transition-transform group-hover:translate-x-0.5"
                                                        aria-hidden="true"
                                                        >&rsaquo;</span
                                                      >
                                                    </button>
                                                  </li>
                                                `,
                                              )}
                                            </ul>
                                          </div>
                                        `
                                      : nothing
                                  }
                                  ${liquidHTML(this.props.asideHtml)}
                                </div>`
                              : nothing
                          }
                        </div>
                      `
                }
              </div>
            </div>
          </div>
        `,
      )}
    `;
  }
}
