import assert from 'node:assert/strict';
import { compileComponentFile, emitLiquidSnippet } from '../compile.ts';

function compile(source: string, file = 'widget.ts') {
  return compileComponentFile(`/virtual/${file}`, source, {
    modulePrefix: '@components',
  });
}

function assertIncludes(haystack: string, needle: string, msg?: string) {
  assert.ok(haystack.includes(needle), msg ?? `Expected to include: ${needle}\nGot:\n${haystack}`);
}

{
  const src = `
import { html, ShopifyLitElement, shopifyComponent } from 'shopify-lit';
@shopifyComponent({ tag: 'static-widget', liquidContext: { title: 'title' } })
export class StaticWidget extends ShopifyLitElement<{ title: string }> {
  render() {
    return html\`<h1>\${this.props.title}</h1>\`;
  }
}
`;
  const r = compile(src, 'static-widget.ts');
  assert.ok(r);
  assert.equal(r!.errors.length, 0, r!.errors.join('; '));
  assertIncludes(r!.liquidInnerHtml, '{{ title }}');
}

{
  const src = `
import { html, ShopifyLitElement, shopifyComponent, liquidFilter } from 'shopify-lit';
@shopifyComponent({
  tag: 'money-widget',
  liquidContext: { price: 'product.price' },
})
export class MoneyWidget extends ShopifyLitElement<{ price: number }> {
  render() {
    return html\`<span>\${liquidFilter(this.props.price, 'money')}</span>\`;
  }
}
`;
  const r = compile(src, 'money-widget.ts');
  assert.ok(r);
  assert.equal(r!.errors.length, 0, r!.errors.join('; '));
  assertIncludes(r!.liquidInnerHtml, '{{ product.price | money }}');
}

{
  const src = `
import { html, ShopifyLitElement, shopifyComponent } from 'shopify-lit';
@shopifyComponent({ tag: 'list-widget', liquidContext: { items: 'items' } })
export class ListWidget extends ShopifyLitElement<{ items: { title: string }[] }> {
  render() {
    return html\`
      <ul>
        \${this.props.items.map((item) => html\`<li>\${item.title}</li>\`)}
      </ul>
    \`;
  }
}
`;
  const r = compile(src, 'list-widget.ts');
  assert.ok(r);
  assert.equal(r!.errors.length, 0, r!.errors.join('; '));
  assertIncludes(r!.liquidInnerHtml, '{% for item in items');
  assertIncludes(r!.liquidInnerHtml, '{{ item.title }}');
  assertIncludes(r!.liquidInnerHtml, '{% endfor %}');
}

{
  const src = `
import { html, nothing, ShopifyLitElement, shopifyComponent } from 'shopify-lit';
@shopifyComponent({ tag: 'if-widget', liquidContext: { show: 'show' } })
export class IfWidget extends ShopifyLitElement<{ show: boolean }> {
  render() {
    return html\`
      \${this.props.show ? html\`<p>yes</p>\` : nothing}
    \`;
  }
}
`;
  const r = compile(src, 'if-widget.ts');
  assert.ok(r);
  assert.equal(r!.errors.length, 0, r!.errors.join('; '));
  assertIncludes(r!.liquidInnerHtml, '{% if show %}');
  assertIncludes(r!.liquidInnerHtml, '<p>yes</p>');
  assertIncludes(r!.liquidInnerHtml, '{% endif %}');
}

{
  const src = `
import { html, ShopifyLitElement, shopifyComponent } from 'shopify-lit';
@shopifyComponent({ tag: 'click-widget' })
export class ClickWidget extends ShopifyLitElement {
  onSave = () => {};
  render() {
    return html\`<button @click=\${this.onSave}>Save</button>\`;
  }
}
`;
  const r = compile(src, 'click-widget.ts');
  assert.ok(r);
  assert.equal(r!.errors.length, 0, r!.errors.join('; '));
  assertIncludes(r!.liquidInnerHtml, 'data-lit-on-click="onSave"');
  assert.ok(!r!.liquidInnerHtml.includes('@click'));
}

{
  const src = `
import { html, ShopifyLitElement, shopifyComponent, nest } from 'shopify-lit';
@shopifyComponent({ tag: 'nest-widget', liquidContext: { items: 'items' } })
export class NestWidget extends ShopifyLitElement<{ items: object[] }> {
  render() {
    return html\`
      \${this.props.items.map((item) => html\`\${nest('product-card', item)}\`)}
    \`;
  }
}
`;
  const r = compile(src, 'nest-widget.ts');
  assert.ok(r);
  assert.equal(r!.errors.length, 0, r!.errors.join('; '));
  assertIncludes(r!.liquidInnerHtml, "{% render 'product-card', product: item, skip_script: true %}");
}

{
  const src = `
import { html, ShopifyLitElement, shopifyComponent } from 'shopify-lit';
@shopifyComponent({
  tag: 'qty-stepper',
  liquidContext: { value: 'value', min: 'min', max: 'max' },
  moduleSpecifier: '@components/qty-stepper.ts',
  snippet: 'qty-stepper',
})
export class QtyStepper extends ShopifyLitElement<{ value: number; min: number; max: number }> {
  onInc = () => {};
  render() {
    return html\`
      <button @click=\${this.onInc}>\${this.props.value}</button>
    \`;
  }
}
`;
  const r = compile(src, 'qty-stepper.ts');
  assert.ok(r);
  const { content } = emitLiquidSnippet(r!);
  assertIncludes(content, 'vulpine-loader');
  assertIncludes(content, 'data-lit-ssr');
  assertIncludes(content, "@components/qty-stepper.ts");
}

console.log('shopify-lit compile tests: ok');
