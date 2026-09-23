// Hydrate support MUST load before lit so Declarative Shadow DOM is adopted.
import '@lit-labs/ssr-client/lit-element-hydrate-support.js';
import { LitElement, html } from 'lit';
import { property } from 'lit/decorators.js';

/**
 * Qty stepper — keep `render()` in sync with `snippets/qty-stepper-dsd.liquid`.
 *
 * Without Lit SSR markers, lit-html would *append* into an existing DSD tree.
 * We keep stylesheet links from Liquid, clear the rest, then render once into that root.
 */
export class QtyStepper extends LitElement {
  @property({ type: Number, reflect: true })
  value = 1;

  @property({ type: Number, reflect: true })
  min = 1;

  @property({ type: Number, reflect: true })
  max = 9;

  /**
   * Reuse Declarative Shadow DOM from Liquid when present.
   * Preserve CSS links; drop pre-rendered body so Lit doesn't double the UI.
   */
  protected createRenderRoot() {
    if (this.shadowRoot) {
      const keep = [...this.shadowRoot.querySelectorAll(':scope > link[rel="stylesheet"], :scope > style')];
      this.shadowRoot.replaceChildren(...keep);
      return this.shadowRoot;
    }
    return super.createRenderRoot();
  }

  #dec = () => {
    this.value = Math.max(this.min, this.value - 1);
  };

  #inc = () => {
    this.value = Math.min(this.max, this.value + 1);
  };

  render() {
    const atMin = this.value <= this.min;
    const atMax = this.value >= this.max;

    return html`
      <div
        class="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white p-2 shadow-sm"
        role="group"
        aria-label="Quantity"
      >
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-100 text-lg font-medium text-stone-800 hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-40"
          ?disabled=${atMin}
          @click=${this.#dec}
          aria-label="Decrease"
        >
          −
        </button>
        <span
          class="min-w-10 text-center text-base font-semibold tabular-nums text-stone-900"
          data-qty-value
        >
          ${this.value}
        </span>
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-900 text-lg font-medium text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
          ?disabled=${atMax}
          @click=${this.#inc}
          aria-label="Increase"
        >
          +
        </button>
      </div>
    `;
  }
}

if (!customElements.get('qty-stepper')) {
  customElements.define('qty-stepper', QtyStepper);
}

declare global {
  interface HTMLElementTagNameMap {
    'qty-stepper': QtyStepper;
  }
}
