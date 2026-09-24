# Welcome — Shopify theme with Lit islands

This is a Shopify theme where you write interactive UI in **Lit** (TypeScript), and
the build tools turn that into **Liquid** so the page looks good before JavaScript
loads.

You edit files under `src/`. Shopify only ever sees the built theme in `dist/`.

---

## What you need installed

1. **Node.js** 20+ ([nodejs.org](https://nodejs.org))
2. **pnpm** — `npm install -g pnpm`
3. **Shopify CLI** — `npm install -g @shopify/cli @shopify/theme`
4. A Shopify **development store** you can log into

---

## First-time setup

```bash
# 1. Install dependencies
pnpm install

# 2. Log in to Shopify (browser opens)
shopify auth login

# 3. Point this folder at your store (creates shopify.theme.toml)
shopify theme dev --path dist
```

Press `Ctrl+C` after it connects once — then use the shortcut below for daily work.

---

## Everyday commands

| Command | What it does |
|--------|----------------|
| `pnpm dev` | Starts Vite **and** Shopify theme preview. Open the URL Shopify prints. |
| `pnpm build` | Builds production JS/CSS into `dist/` (run before a push). |
| `pnpm release` | Builds, then pushes `dist/` to your store. |

While `pnpm dev` is running:

- Change Liquid / sections under `src/` → theme updates
- Change a component under `src/frontend/components/` → snippet regenerates + hot reload
- Change Tailwind classes → CSS updates

> **Tip:** If Cloudflare tunnel fails, Vite keeps running with `http://127.0.0.1:5173`.
> That’s fine when you’re browsing on the same computer.

---

## Folders (only what matters)

```
src/
  frontend/
    components/     ← put your Lit islands here (empty to start)
    entrypoints/    ← theme.css + critical.ts (already wired)
    lib/
      vulpine-loader.ts   ← loads JS only when needed
  layout/           ← theme.liquid (HTML shell)
  sections/         ← page sections (header, main, product, …)
  snippets/         ← hand-written Liquid helpers
  templates/        ← which sections each page uses
  config/           ← theme settings
  locales/          ← translations

dist/               ← built theme Shopify CLI uses (don't edit by hand)
packages/
  shopify-lit/      ← the Lit → Liquid compiler (you rarely touch this)
```

**Rule of thumb:** edit `src/`, never `dist/`.

---

## Your first component (5 minutes)

### 1. Create the file

Create `src/frontend/components/hello-button.ts`:

```ts
import { html, ShopifyLitElement, shopifyComponent } from 'shopify-lit';

@shopifyComponent({
  tag: 'hello-button',
  liquidContext: {
    label: 'label', // this.props.label ↔ Liquid variable `label`
  },
})
export class HelloButton extends ShopifyLitElement<{ label: string }> {
  onClick() {
    alert('Hello from Lit!');
  }

  render() {
    return html`
      <button
        type="button"
        class="rounded bg-stone-900 px-4 py-2 text-white"
        @click=${this.onClick}
      >
        ${this.props.label}
      </button>
    `;
  }
}
```

With `pnpm dev` running, this automatically creates:

`dist/snippets/hello-button.liquid`

### 2. Show it on the homepage

Open `src/sections/main.liquid` and add:

```liquid
{% render 'hello-button', label: 'Click me', on: 'visible' %}
```

Refresh the storefront preview. You should see a button (Liquid HTML first).
When it scrolls into view, the Lit module loads and the click handler works.

### 3. That’s the whole loop

1. Write Lit in `src/frontend/components/`
2. Decorate with `@shopifyComponent`
3. `{% render 'your-snippet-name', … %}` in a section or snippet
4. Save → preview updates

---

## How loading works (vulpine-loader)

You don’t have to wire this yourself for `@shopifyComponent` islands — the generated
snippet wraps them in **vulpine-loader**.

Pass `on:` when you render:

| `on` value | When JavaScript loads |
|------------|------------------------|
| `visible` (default) | When the element scrolls into view |
| `idle` | When the browser is idle |
| `interaction` | On first click / key / touch |
| `event:my:event` | When `window` fires that event |
| `idle visible` | Whichever happens first |

Example:

```liquid
{% render 'hello-button', label: 'Save', on: 'interaction' %}
```

---

## Useful Lit helpers

```ts
import {
  html,
  ShopifyLitElement,
  shopifyComponent,
  liquidFilter, // → Liquid filters like | money
  each,         // → {% for %} loops
  nest,         // → {% render %} another island
  clientOnly,   // skeleton in Liquid, live UI only in the browser
} from 'shopify-lit';
```

**Client-only UI** (open drawers, live search results, etc.):

```ts
render() {
  return clientOnly(
    { skeleton: html`<div class="h-10 animate-pulse bg-stone-200"></div>` },
    html`<div>${/* interactive stuff */}</div>`,
  );
}
```

Liquid paints the skeleton; the browser swaps in the live tree after hydrate.

---

## Mental model

```
You write Lit render()
        ↓
shopify-lit compiles it to Liquid (SSR markup)
        ↓
Shopify sends that HTML to the shopper
        ↓
vulpine-loader loads your .ts when `on` says so
        ↓
ShopifyLitElement “absorbs” the existing DOM and binds events
```

Shoppers with slow JS (or JS off) still see your markup and styles.

---

## Checklist when something looks wrong

1. Is `pnpm dev` running?
2. Did you save under `src/`, not `dist/`?
3. Is the component file in `src/frontend/components/` with `@shopifyComponent`?
4. Are you rendering the **snippet name** that matches the file
   (`hello-button.ts` → `{% render 'hello-button' %}`)?
5. Run `pnpm build` once if `dist/` looks stale.

---

## Optional: push to the live theme

```bash
pnpm release
```

That builds, then runs `shopify theme push` against `dist/`.
