# DSD Example

Skeleton-theme layout demo: **Declarative Shadow DOM** → **`vulpine-loader` island** → **Lit adopts the same shadow tree**.

Aligned with [`skeleton-theme-develop`](/Users/benjamincofrancesco/Documents/skeleton-theme-develop): Vite, `vite-plugin-shopify`, `vite-plugin-shopify-import-maps`, and loading components via `{% render 'vite', entry: '@components/...' %}`.

## Commands

```bash
pnpm install
pnpm dev -- --store your-store.myshopify.com --live-reload full-page
pnpm build
```

## The 1:1 rule

1. `snippets/qty-stepper-dsd.liquid` — Declarative Shadow DOM markup
2. `frontend/components/qty-stepper.ts` — same markup in `render()`
3. Lit reuses the existing shadow root when the module loads

## CSS in the shadow

Same pattern as skeleton `BoilerplateElement`:

```ts
import styles from '@/entrypoints/theme.css?inline';
static styles = [unsafeCSS(styles)];
```

`QtyStepper` extends `BoilerplateElement`, so Tailwind utilities work inside the shadow after hydrate.

## Intent replay (`on: interaction`)

A click that only loads JS would feel broken on drawers/modals. `vulpine-loader`:

1. Captures the click (capture phase)
2. Injects the Vite entry and waits for custom elements to upgrade
3. **Replays** the click on the original target so the real `@click` / `show()` handler runs

```liquid
{% render 'vulpine-loader',
  entry: '@components/qty-stepper.ts',
  on: 'interaction',
  content: host
%}
```

Opt out: `replay: false`.

## How modules load (same as skeleton)

```liquid
{% capture host %}
  {% render 'qty-stepper-dsd', value: 3, min: 1, max: 9 %}
{% endcapture %}
{% render 'vulpine-loader',
  entry: '@components/qty-stepper.ts',
  on: 'interaction',
  content: host
%}
```

`vite-plugin-shopify-import-maps` auto-generates `snippets/importmap.liquid` on **`pnpm build`**. During Vite dest the map may be empty; modules still load via `vite.liquid` tunnel URLs.

## Adding a component

1. Extend `BoilerplateElement` in `frontend/components/my-widget.ts`
2. Matching `snippets/my-widget-dsd.liquid`
3. `{% render 'vulpine-loader', entry: '@components/my-widget.ts', on: 'interaction', ... %}`
