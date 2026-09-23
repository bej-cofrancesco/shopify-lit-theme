import {
  LitElement,
  type PropertyValues,
  type TemplateResult,
  nothing,
} from 'lit';
import { LIT_SSR_ATTR } from './hydrate-support';
import { absorbRender } from './absorb';
import { plainProps, reactiveProps } from './reactive-props';

/**
 * Light-DOM LitElement that absorbs Liquid SSR markup on first paint.
 *
 * `props` is reactive end-to-end: `this.props.value = n` triggers an update
 * (nested Proxy), same as replacing the whole object.
 */
export class ShopifyLitElement<
  Props extends object = Record<string, unknown>,
> extends LitElement {
  static properties = {
    props: {
      type: Object,
      attribute: 'props',
      converter: {
        fromAttribute(value: string | null): object {
          if (!value) return {};
          try {
            return JSON.parse(value) as object;
          } catch {
            console.warn('[shopify-lit] Failed to parse props JSON');
            return {};
          }
        },
        toAttribute(value: object): string {
          return JSON.stringify(plainProps(value ?? {}));
        },
      },
      // Always go through our setter so values become reactive proxies
      noAccessor: true,
    },
  };

  #props: Props = reactiveProps(this, {} as Props);

  get props(): Props {
    return this.#props;
  }

  set props(value: Props) {
    const plain = plainProps(value ?? ({} as Props));
    const old = this.#props;
    this.#props = reactiveProps(this, plain);
    this.requestUpdate('props', old);
  }

  protected _needsAdoption = false;

  createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (this.hasAttribute(LIT_SSR_ATTR) || this.hasAttribute('data-lit-ssr')) {
      this._needsAdoption = true;
    }
  }

  protected update(changedProperties: PropertyValues): void {
    const opts = this.renderOptions as {
      host?: unknown;
      isConnected?: boolean;
      renderBefore?: ChildNode | null;
    };
    delete opts.renderBefore;
    opts.host = this;
    opts.isConnected = this.isConnected;

    if (this._needsAdoption) {
      this._needsAdoption = false;
      this.removeAttribute(LIT_SSR_ATTR);
      this.removeAttribute('data-lit-ssr');

      const reactiveProto = Object.getPrototypeOf(LitElement.prototype) as {
        update: (this: LitElement, changed: PropertyValues) => void;
      };
      reactiveProto.update.call(this, changedProperties);

      const result = absorbRender(this.renderRoot as HTMLElement, this.render(), {
        host: this,
        isConnected: this.isConnected,
      });

      if (result) {
        (this as unknown as { __childPart?: unknown }).__childPart =
          result.rootPart;
      }
      return;
    }

    super.update(changedProperties);
  }

  render(): TemplateResult | typeof nothing {
    return nothing;
  }
}
