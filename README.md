# dsd-example — shopify-lit islands

Empty Shopify theme with **`shopify-lit`** + **`vulpine-loader`**. Put Lit
components in `src/frontend/components`; Vite compiles them to Liquid under
`dist/` and Shopify CLI pushes `dist/`.

## Layout

```
packages/
  shopify-lit/                         # Lit → Liquid compiler
  vite-plugin-tailwind-content-reload/ # Tailwind content HMR helper
src/                                   # Theme source
  frontend/components/                 # your @shopifyComponent islands
  frontend/entrypoints/                # theme.css, critical.ts
  frontend/lib/vulpine-loader.ts
  snippets/vulpine-loader.liquid
  layout|sections|templates|…
dist/                                  # Built theme (Shopify --path dist)
```

## Commands

```bash
pnpm install
pnpm dev           # shopify theme dev --path dist + vite
pnpm build         # sync src → dist + Vite assets + compiled snippets
pnpm test:compile  # AST → Liquid unit tests
pnpm release       # build + shopify theme push --path dist
```

## How it works

1. Add a `@shopifyComponent` under `src/frontend/components`
2. `shopify-lit` emits `dist/snippets/<name>.liquid`
3. Render via `{% render 'vulpine-loader', entry: '@components/…', html: … %}`
   (or `{% render '<name>' %}` for the generated snippet)
4. `themeSync` mirrors the rest of `src/` → `dist/`
5. Shopify CLI uses `--path dist`

Client-only UI: wrap in `clientOnly({ skeleton: html\`…\` }, live)`.
