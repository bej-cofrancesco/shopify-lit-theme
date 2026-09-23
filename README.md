# dsd-example — shopify-lit islands

Author Lit components with **`shopify-lit`**. Vite compiles `render()` to Liquid
snippets under `dist/`, syncs theme files from `src/`, and Shopify CLI pushes
`dist/`.

## Layout

```
packages/
  shopify-lit/                         # Lit + Liquid compiler (workspace)
  vite-plugin-tailwind-content-reload/ # Tailwind content HMR helper
src/                                   # Theme source (Liquid + frontend)
  frontend/components/                 # @shopifyComponent islands
  frontend/entrypoints/                # theme.css, critical.ts
  layout|sections|snippets|templates|…
dist/                                  # Built theme (Shopify --path dist)
vite.config.ts
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

1. `@shopifyComponent` components live in `src/frontend/components`
2. `themeSync` mirrors `src/{layout,sections,…}` → `dist/`
3. `shopify-lit` writes compiled islands into `dist/snippets`
4. Vite builds JS/CSS into `dist/assets`
5. Shopify CLI uses `--path dist`

Client-only UI: wrap in `clientOnly({ skeleton: html\`…\` }, live)`.
