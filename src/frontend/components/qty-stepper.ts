import { html, ShopifyLitElement, shopifyComponent } from 'shopify-lit';

export interface QtyStepperProps {
  value: number;
  min: number;
  max: number;
}

@shopifyComponent({
  tag: 'qty-stepper',
  liquidContext: {
    value: 'value',
    min: 'min',
    max: 'max',
  },
  moduleSpecifier: '@components/qty-stepper.ts',
  snippet: 'qty-stepper',
})
export class QtyStepper extends ShopifyLitElement<QtyStepperProps> {
  private bump(delta: number) {
    const { min, max, value } = this.props;
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    this.props.value = next;
  }

  onDec = () => this.bump(-1);
  onInc = () => this.bump(1);

  render() {
    return html`
      <div
        class="inline-flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-sm"
        role="group"
        aria-label="Quantity"
      >
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Decrease quantity"
          @click=${this.onDec}
        >
          −
        </button>
        <span
          class="min-w-[2ch] text-center text-base font-semibold tabular-nums text-stone-900"
          aria-live="polite"
        >${this.props.value}</span>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Increase quantity"
          @click=${this.onInc}
        >
          +
        </button>
      </div>
    `;
  }
}
