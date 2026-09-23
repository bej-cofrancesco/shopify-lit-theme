import {
  html,
  nothing,
  state,
  ShopifyLitElement,
  type TemplateResult,
  createRef,
  ref,
  type Ref,
} from 'shopify-lit';
import {
  focusFirst,
  lockBodyScroll,
  restoreFocus,
  saveFocus,
  trapFocus,
  unlockBodyScroll,
} from '@frontend/lib/focus';

export type DrawerPosition = 'left' | 'right' | 'top' | 'bottom';

export interface DrawerProps {
  overlay?: boolean;
  class?: string;
  title?: string;
  drawerWidthClass?: string;
  drawerHeightClass?: string;
  zIndex?: string;
  position?: DrawerPosition;
  openEvent?: string;
  closeEvent?: string;
}

/**
 * Light-DOM drawer base — Lit owns chrome via `render()`.
 * Config is `this.props`. Subclasses override `_renderContent` / handlers.
 * Not a `@shopifyComponent` (no snippet); concrete drawers decorate themselves.
 */
export class ShopifyDrawer<
  Props extends DrawerProps = DrawerProps,
> extends ShopifyLitElement<Props> {
  protected drawerRef: Ref<HTMLDivElement> = createRef();

  #trapDisposer?: () => void;
  #abort = new AbortController();

  @state()
  protected _open = false;

  connectedCallback(): void {
    super.connectedCallback();
    const { signal } = this.#abort;
    window.addEventListener(this.#openName, this.#onOpen as EventListener, { signal });
    window.addEventListener(this.#closeName, this.#onClose as EventListener, { signal });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#abort.abort();
    this.#abort = new AbortController();
    this.#disposeFocus();
    if (this._open) unlockBodyScroll();
  }

  get #openName(): string {
    return this.props.openEvent || `${this.localName}:open`;
  }

  get #closeName(): string {
    return this.props.closeEvent || `${this.localName}:close`;
  }

  get #overlay(): boolean {
    return this.props.overlay !== false;
  }

  get #title(): string {
    return this.props.title || 'Close drawer';
  }

  get #position(): DrawerPosition {
    return this.props.position || 'right';
  }

  get #drawerWidthClass(): string {
    return this.props.drawerWidthClass || 'w-[90%] sm:w-4/5 md:w-3/5 lg:w-2/6';
  }

  get #drawerHeightClass(): string {
    return this.props.drawerHeightClass || 'h-full';
  }

  get #zIndex(): string {
    return this.props.zIndex || 'z-50';
  }

  get #class(): string {
    return this.props.class || '';
  }

  #onOpen = (): void => {
    this._openDrawer();
  };

  #onClose = (): void => {
    this._closeDrawer();
  };

  /** qty-stepper-style public handler for overlay / close button `@click`. */
  onDismiss = (): void => {
    this._closeDrawer();
  };

  protected _openDrawer(): void {
    if (this._open) return;
    saveFocus();
    this._open = true;
    lockBodyScroll();
    void this.#activateFocus();
  }

  protected _closeDrawer(): void {
    if (!this._open) return;
    this._open = false;
    unlockBodyScroll();
    this.#disposeFocus();
    restoreFocus();
  }

  async #activateFocus(): Promise<void> {
    await this.updateComplete;
    const root = this.drawerRef.value;
    if (!root) return;
    this.#disposeFocus();
    this.#trapDisposer = trapFocus(root);
    this._focusDrawerTarget(root);
  }

  protected _focusDrawerTarget(root: HTMLElement): void {
    focusFirst(root);
  }

  #disposeFocus(): void {
    this.#trapDisposer?.();
    this.#trapDisposer = undefined;
  }

  onKeydown = (event: KeyboardEvent): void => {
    if (!this._open) return;
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this._closeDrawer();
  };

  protected _renderCloseButton(): TemplateResult {
    return html`
      <button
        type="button"
        @click=${this.onDismiss}
        tabindex=${this._open ? '0' : '-1'}
        class="relative flex items-center justify-center"
        aria-label=${this.#title}
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
    `;
  }

  protected _renderHeader(): TemplateResult {
    return html`<div class="flex">${this._renderCloseButton()}</div>`;
  }

  protected _renderContent(): TemplateResult {
    return html`
      <div class="grid grid-rows-[50px_1fr] gap-16 pb-[76px]">
        ${this._renderHeader()}
        <div class="overflow-auto"></div>
      </div>
    `;
  }

  #positionClasses(): string {
    switch (this.#position) {
      case 'left':
        return `-left-full top-0 ${this.#drawerWidthClass} ${this._open ? '!left-0' : ''}`;
      case 'right':
        return `-right-full top-0 ${this.#drawerWidthClass} ${this._open ? '!right-0' : ''}`;
      case 'top':
        return `left-0 right-0 ${this._open ? 'top-0' : '-top-[150%]'}`;
      case 'bottom':
        return `left-0 right-0 w-full ${this._open ? 'bottom-0' : '-bottom-full'}`;
      default:
        return '';
    }
  }

  render(): TemplateResult {
    return html`
      ${
        this.#overlay
          ? html`
              <div
                class="fixed inset-0 bg-black/40 transition-opacity ${this.#zIndex} ${
                  this._open ? 'opacity-100' : 'pointer-events-none opacity-0'
                }"
                @click=${this.onDismiss}
                aria-hidden="true"
              ></div>
            `
          : nothing
      }
      <div
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        ?inert=${!this._open}
        class="${this.#positionClasses()} ${this.#class} ${this.#zIndex} ${this.#drawerHeightClass} fixed bg-white text-black outline-none transition-[top,bottom,left,right] duration-300 ease-out"
        ${ref(this.drawerRef)}
        @keydown=${this.onKeydown}
      >
        ${this._renderContent()}
      </div>
    `;
  }
}
