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

## How modules load (same as skeleton)

Skeleton does **not** hand-roll bare import maps for islands. It loads each component with:

```liquid
{% render 'vite', entry: '@components/product_tile.ts' %}
```

`vulpine-loader` wraps that: the `vite` tags sit in a `<template>` and are injected when `on` fires (`visible` / `idle` / `interaction`).

```liquid
{% capture host %}
  {% render 'qty-stepper-dsd', value: 1, min: 1, max: 9 %}
{% endcapture %}
{% render 'vulpine-loader',
  entry: '@components/qty-stepper.ts',
  on: 'visible',
  content: host
%}
```

`vite-plugin-shopify-import-maps` (`bareModules: true`) **auto-generates** `snippets/importmap.liquid` on **`pnpm build`** so production entry scripts can resolve each other. During Vite dest the map stays empty; modules still load because `vite.liquid` points at the tunnel URL (same as skeleton).

## Adding a component

1. `frontend/components/my-widget.ts` (+ matching `snippets/my-widget-dsd.liquid`)
2. It’s picked up by `additionalEntrypoints: ['frontend/components/**']`
3. `{% render 'vulpine-loader', entry: '@components/my-widget.ts', ... %}`
