import { html, liquidHTML, ShopifyLitElement, shopifyComponent } from 'shopify-lit';

export interface EventTriggerProps {
  event: string;
  detail?: unknown;
  /** Button label / icon markup from Liquid (`{% capture %}`). */
  html?: string;
  /** Accessible name for the button. */
  label?: string;
}

/**
 * Dispatches a named window CustomEvent on click.
 * Lit owns the button — same shape as qty-stepper (`@click` → `data-lit-on-click`).
 *
 *   {% capture label %}<span>Search</span>{% endcapture %}
 *   {% render 'event-trigger', event: 'search:open', html: label, label: 'Search' %}
 */
@shopifyComponent({
  tag: 'event-trigger',
  liquidContext: {
    event: 'event',
    detail: 'detail',
    html: 'html',
    label: 'label',
  },
  moduleSpecifier: '@components/event-trigger.ts',
  snippet: 'event-trigger',
})
export class EventTrigger extends ShopifyLitElement<EventTriggerProps> {
  onActivate = (): void => {
    const name = (this.props.event || '').trim();
    if (!name) {
      console.warn('[event-trigger] missing props.event');
      return;
    }
    window.dispatchEvent(
      new CustomEvent(name, {
        detail: this.props.detail,
        bubbles: true,
        composed: true,
      }),
    );
  };

  render() {
    return html`
      <button
        type="button"
        class="inline-flex appearance-none border-0 bg-transparent p-0"
        aria-label=${this.props.label}
        @click=${this.onActivate}
      >
        ${liquidHTML(this.props.html)}
      </button>
    `;
  }
}
