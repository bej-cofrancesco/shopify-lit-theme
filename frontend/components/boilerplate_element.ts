import { LitElement, unsafeCSS, adoptStyles, css } from 'lit';
import { property } from 'lit/decorators.js';
import type { CSSResultOrNative } from 'lit';
import styles from '@entrypoints/theme.css?inline';
import { generateUUIDv4 } from '../utils/uuid';

/**
 * Base Lit element matching skeleton-theme: theme CSS inlined into the shadow root.
 * Host is always `display: contents` so layout comes from inner markup / DSD.
 */
export class BoilerplateElement<Props = {}> extends LitElement {
  static styles = [
    css`
      :host {
        display: contents;
      }
    `,
    unsafeCSS(styles),
  ];

  @property({ type: Object })
  props: Props = {} as Props;

  @property({ attribute: false, type: String })
  public generatedId = generateUUIDv4();

  /**
   * Reuse Declarative Shadow DOM when present.
   * Clear pre-rendered markup so lit-html does not append a duplicate tree,
   * then adopt `static styles` (skipped if we don't call super.createRenderRoot()).
   */
  protected createRenderRoot() {
    if (this.shadowRoot) {
      this.shadowRoot.replaceChildren();
      const elementStyles = (this.constructor as typeof LitElement).elementStyles as
        | CSSResultOrNative[]
        | undefined;
      if (elementStyles?.length) {
        adoptStyles(this.shadowRoot, elementStyles);
      }
      return this.shadowRoot;
    }
    return super.createRenderRoot();
  }
}
