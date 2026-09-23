# dsd-example — shopify-lit islands

Author Lit components with **`shopify-lit`**. The Vite plugin compiles `render()` to Liquid snippets. On the client, `ShopifyLitElement` absorbs the SSR DOM (bind handlers, no flicker).

## Commands

```bash
pnpm install
pnpm dest          # or: shopify theme dest + vite
pnpm build         # compiles snippets + Vite assets
pnpm test:compile  # AST → Liquid unit tests
```

`dev` / `build` run the `shopify-lit` Vite plugin on start (writes `snippets/*.liquid`).

## How it works

1. Components import from `shopify-lit` and use `@shopifyComponent({ tag, … })`
2. Vite plugin compiles `frontend/components/**/*.ts` → `snippets/<name>.liquid`
3. Snippet wraps host markup in `vulpine-loader`
4. Client island loads → absorb wires lit parts onto Liquid DOM; later `requestUpdate()` / prop changes patch in place via `render()`

Light DOM + global `theme.css` (Tailwind `@source` covers component files).

## New component

1. `frontend/components/my-widget.ts` — extend `ShopifyLitElement`, decorate with `@shopifyComponent`
2. Use `this.props.*`, `liquidFilter()`, `.map` → for, ternary, `@click=${this.method}`, `nest()`
3. Save — plugin writes `snippets/my-widget.liquid`
4. `{% render 'my-widget', … %}`

## Package

In-repo workspace package: `shopify-lit/` (`shopify-lit` + `shopify-lit/vite`).
