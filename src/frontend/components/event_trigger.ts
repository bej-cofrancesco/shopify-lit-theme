import { ShopifyLitElement, html, shopifyComponent, liquidHTML } from 'shopify-lit';
import type { TemplateResult } from 'shopify-lit';
import { dispatch, EventType } from '@frontend/lib/event_handler';
import { InvalidEventError } from '@frontend/lib/error';

export interface EventTriggerProps {
  label: string;
  event: EventType;
  content: string;
  type: string;
  aria_label: string;
}

@shopifyComponent({
  tag: 'event-trigger',
  snippet: 'event_trigger',
  liquidContext: {
    label: 'label',
    namespace: 'namespace',
    content: 'content',
    type: 'type',
    aria_label: 'aria_label',
  },
})
export class EventTrigger extends ShopifyLitElement<EventTriggerProps> {
  private _handleClick = (event: Event) => {
    if (this.props.event !== EventType.EVENT_TRIGGER) {
      throw new InvalidEventError();
    }

    dispatch(this.props.event, event);
  };

  protected render(): TemplateResult {
    return html` <button
      type="${this.props.type}"
      aria-label="${this.props.aria_label}"
      @click=${this._handleClick}
      class="size-11 appearance-none border-0 bg-transparent p-0"
    >
      ${liquidHTML(this.props.content)}
    </button>`;
  }
}

if (!customElements.get('event-trigger')) {
  customElements.define('event-trigger', EventTrigger);
}
