import { ShopifyLitElement, html, shopifyComponent, liquidHTML } from 'shopify-lit';
import type { TemplateResult } from 'shopify-lit';
import {
  dispatch,
  type EventDetailMap,
  type EventType,
} from '@frontend/lib/event_handler';

export type EventTriggerProps = {
  label: string;
  content: string;
  type: string;
  aria_label: string;
  event: EventType;
  detail?: EventDetailMap[EventType];
};

@shopifyComponent({
  tag: 'event-trigger',
  snippet: 'event_trigger',
  liquidContext: {
    label: 'label',
    event: 'event',
    detail: 'detail',
    content: 'content',
    type: 'type',
    aria_label: 'aria_label',
  },
})
export class EventTrigger extends ShopifyLitElement<EventTriggerProps> {
  private _handleClick = () => {
    const { event, detail } = this.props;
    if (!event) return;
    dispatch(event, detail);
  };

  protected render(): TemplateResult {
    return html`
      <button
        type=${this.props.type}
        aria-label=${this.props.aria_label}
        @click=${this._handleClick}
        class="size-11 appearance-none border-0 bg-transparent p-0"
      >
        ${liquidHTML(this.props.content)}
      </button>
    `;
  }
}
