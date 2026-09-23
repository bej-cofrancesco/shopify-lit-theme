import ts from 'typescript';
import path from 'node:path';

export type CompileResult = {
  tag: string;
  liquidContext?: Record<string, string>;
  moduleSpecifier?: string;
  propsSource?: 'product' | 'props';
  snippet?: string;
  liquidInnerHtml: string;
  sourceFile: string;
  errors: string[];
};

export type CompilerOptions = {
  /** Default bare specifier prefix, e.g. @components */
  modulePrefix?: string;
};

/**
 * Compile a component .ts file: find @shopifyComponent + render() html`...`
 * and emit Liquid inner HTML for the restricted expression subset.
 */
export function compileComponentFile(
  filePath: string,
  sourceText: string,
  options: CompilerOptions = {},
): CompileResult | null {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );

  const errors: string[] = [];
  const found: {
    meta: {
      tag: string;
      liquidContext?: Record<string, string>;
      moduleSpecifier?: string;
      propsSource?: 'product' | 'props';
      snippet?: string;
    } | null;
    renderTemplate: ts.TaggedTemplateExpression | null;
  } = { meta: null, renderTemplate: null };

  const visit = (node: ts.Node) => {
    // Class with @shopifyComponent(...)
    if (ts.isClassDeclaration(node) && node.modifiers) {
      for (const mod of node.modifiers) {
        if (!ts.isDecorator(mod)) continue;
        const call = unwrapDecorator(mod);
        if (!call) continue;
        const name = getCallName(call);
        if (name === 'shopifyComponent') {
          found.meta = parseShopifyComponentOptions(call, errors);
        }
      }

      for (const member of node.members) {
        if (
          ts.isMethodDeclaration(member) &&
          member.name &&
          ts.isIdentifier(member.name) &&
          member.name.text === 'render' &&
          member.body
        ) {
          found.renderTemplate = findHtmlTaggedTemplate(member.body);
          if (!found.renderTemplate) {
            errors.push(
              `${filePath}: render() must return an html\`...\` tagged template (or a single return of one)`,
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (!found.meta) return null;
  if (!found.renderTemplate) {
    return {
      ...found.meta,
      liquidInnerHtml: '',
      sourceFile: filePath,
      errors: errors.length
        ? errors
        : [`${filePath}: no html\`\` template found in render()`],
    };
  }

  const liquidInnerHtml = transformHtmlTemplate(
    found.renderTemplate,
    sourceText,
    found.meta.liquidContext ?? {},
    errors,
  );

  const base = path.basename(filePath, path.extname(filePath));
  const modulePrefix = options.modulePrefix ?? '@components';

  return {
    tag: found.meta.tag,
    liquidContext: found.meta.liquidContext,
    moduleSpecifier: found.meta.moduleSpecifier ?? `${modulePrefix}/${base}.ts`,
    propsSource: found.meta.propsSource,
    snippet: found.meta.snippet ?? base,
    liquidInnerHtml,
    sourceFile: filePath,
    errors,
  };
}

function unwrapDecorator(mod: ts.Decorator): ts.CallExpression | null {
  const expr = mod.expression;
  if (ts.isCallExpression(expr)) return expr;
  return null;
}

function getCallName(call: ts.CallExpression): string | null {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isPropertyAccessExpression(call.expression)) {
    return call.expression.name.text;
  }
  return null;
}

function parseShopifyComponentOptions(
  call: ts.CallExpression,
  errors: string[],
): {
  tag: string;
  liquidContext?: Record<string, string>;
  moduleSpecifier?: string;
  propsSource?: 'product' | 'props';
  snippet?: string;
} {
  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    errors.push('shopifyComponent() requires an object literal argument');
    return { tag: 'unknown-element' };
  }

  let tag = 'unknown-element';
  let liquidContext: Record<string, string> | undefined;
  let moduleSpecifier: string | undefined;
  let propsSource: 'product' | 'props' | undefined;
  let snippet: string | undefined;

  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    const key = prop.name.text;
    if (key === 'tag' && ts.isStringLiteral(prop.initializer)) {
      tag = prop.initializer.text;
    }
    if (key === 'moduleSpecifier' && ts.isStringLiteral(prop.initializer)) {
      moduleSpecifier = prop.initializer.text;
    }
    if (key === 'snippet' && ts.isStringLiteral(prop.initializer)) {
      snippet = prop.initializer.text;
    }
    if (key === 'propsSource' && ts.isStringLiteral(prop.initializer)) {
      if (prop.initializer.text === 'product' || prop.initializer.text === 'props') {
        propsSource = prop.initializer.text;
      }
    }
    if (key === 'liquidContext' && ts.isObjectLiteralExpression(prop.initializer)) {
      liquidContext = {};
      for (const p of prop.initializer.properties) {
        if (
          ts.isPropertyAssignment(p) &&
          ts.isIdentifier(p.name) &&
          ts.isStringLiteral(p.initializer)
        ) {
          liquidContext[p.name.text] = p.initializer.text;
        }
      }
    }
  }

  return { tag, liquidContext, moduleSpecifier, propsSource, snippet };
}

function findHtmlTaggedTemplate(body: ts.Block): ts.TaggedTemplateExpression | null {
  for (const stmt of body.statements) {
    if (ts.isReturnStatement(stmt) && stmt.expression) {
      return asHtmlTemplate(stmt.expression);
    }
  }
  return null;
}

function asHtmlTemplate(expr: ts.Expression): ts.TaggedTemplateExpression | null {
  if (ts.isTaggedTemplateExpression(expr) && isHtmlTag(expr.tag)) {
    return expr;
  }
  // return cond ? html`...` : html`...` — not supported as top-level yet
  if (ts.isParenthesizedExpression(expr)) {
    return asHtmlTemplate(expr.expression);
  }
  return null;
}

function isHtmlTag(tag: ts.Expression): boolean {
  return ts.isIdentifier(tag) && tag.text === 'html';
}

function transformHtmlTemplate(
  node: ts.TaggedTemplateExpression,
  sourceText: string,
  liquidContext: Record<string, string>,
  errors: string[],
): string {
  const template = node.template;
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return cleanStaticHtml(template.text);
  }

  if (!ts.isTemplateExpression(template)) {
    errors.push('Unsupported template form');
    return '';
  }

  let out = cleanStaticHtml(template.head.text);

  for (let i = 0; i < template.templateSpans.length; i++) {
    const span = template.templateSpans[i];
    const eventMatch = out.match(/@([\w-]+)\s*=\s*$/);

    if (eventMatch) {
      const eventName = eventMatch[1];
      const method = methodNameFromHandler(span.expression);
      out = out.replace(/@([\w-]+)\s*=\s*$/, '');
      if (method) {
        out += `data-lit-on-${eventName}="${method}"`;
      }
    } else if (/\.[\w]+\s*=\s*$/.test(out)) {
      // Lit property binding (.value=${...}) — client-only, drop from Liquid
      out = out.replace(/\.[\w]+\s*=\s*$/, '');
    } else if (/\?[\w-]+\s*=\s*$/.test(out)) {
      // Boolean attribute (?disabled=${...}) — client-only, omit from Liquid
      out = out.replace(/\?[\w-]+\s*=\s*$/, '');
    } else {
      const attrMatch = out.match(/([\w-:]+)\s*=\s*$/);
      let exprOut = transformExpression(
        span.expression,
        sourceText,
        liquidContext,
        errors,
      );
      // Lit allows src=${x}; HTML/Liquid needs src="{{ x }}"
      if (attrMatch && exprOut && !exprOut.startsWith(' ') && !exprOut.startsWith('data-')) {
        if (exprOut.startsWith('{{') && exprOut.endsWith('}}')) {
          exprOut = `"${exprOut}"`;
        } else if (!exprOut.startsWith('"') && !exprOut.startsWith("'")) {
          exprOut = `"${exprOut}"`;
        }
      }
      out += exprOut;
    }

    out += cleanStaticHtml(span.literal.text);
  }

  return out.trim();
}

function cleanStaticHtml(text: string): string {
  return text;
}

function methodNameFromHandler(expr: ts.Expression): string | null {
  if (
    ts.isPropertyAccessExpression(expr) &&
    expr.expression.kind === ts.SyntaxKind.ThisKeyword &&
    ts.isIdentifier(expr.name)
  ) {
    return expr.name.text;
  }
  return null;
}

function transformExpression(
  expr: ts.Expression,
  sourceText: string,
  liquidContext: Record<string, string>,
  errors: string[],
): string {
  if (isEventHandlerExpression(expr)) {
    return '';
  }

  // lit directives — client-only (absorb / firstUpdated wire refs)
  if (ts.isCallExpression(expr) && getCallName(expr) === 'ref') {
    return '';
  }

  if (ts.isCallExpression(expr) && getCallName(expr) === 'liquidFilter') {
    return transformLiquidFilter(expr, liquidContext, errors);
  }

  if (ts.isCallExpression(expr) && getCallName(expr) === 'liquidHTML') {
    return transformLiquidHTML(expr, liquidContext, errors);
  }

  if (ts.isCallExpression(expr) && getCallName(expr) === 'clientOnlyBlock') {
    return transformClientOnly(expr, sourceText, liquidContext, errors);
  }

  if (ts.isCallExpression(expr) && getCallName(expr) === 'clientOnly') {
    return transformClientOnly(expr, sourceText, liquidContext, errors);
  }

  // nest('product-card', item) → {% render 'lit-product-card', props: item, skip_script: true %}
  if (ts.isCallExpression(expr) && getCallName(expr) === 'nest') {
    return transformNest(expr, errors);
  }

  // each(collection, (item) => html`...`) → {% for item in collection %}
  if (ts.isCallExpression(expr) && getCallName(expr) === 'each') {
    return transformEach(expr, sourceText, liquidContext, errors);
  }

  if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
    if (expr.expression.name.text === 'map') {
      return transformMap(expr, sourceText, liquidContext, errors);
    }
  }

  if (ts.isConditionalExpression(expr)) {
    // Props truthiness + string branches → real Liquid {% if %}
    if (
      (ts.isStringLiteral(expr.whenTrue) || ts.isNoSubstitutionTemplateLiteral(expr.whenTrue)) &&
      (ts.isStringLiteral(expr.whenFalse) || ts.isNoSubstitutionTemplateLiteral(expr.whenFalse))
    ) {
      if (propsPath(expr.condition, liquidContext)) {
        return transformConditional(expr, sourceText, liquidContext, errors);
      }
      // Client state (e.g. this.added) — SSR the initial / false branch
      const initial = ts.isStringLiteral(expr.whenFalse)
        ? expr.whenFalse.text
        : expr.whenFalse.text;
      return initial;
    }
    return transformConditional(expr, sourceText, liquidContext, errors);
  }

  const path = propsPath(expr, liquidContext);
  if (path) {
    return `{{ ${path} }}`;
  }

  errors.push(
    `Unsupported expression in render(): ${sourceText.slice(expr.getStart(), expr.getEnd())}. ` +
      `Use this.props.*, liquidFilter(), each(), map→html, ternary, or nest().`,
  );
  return `<!-- unsupported: ${escapeHtmlComment(sourceText.slice(expr.getStart(), expr.getEnd()))} -->`;
}

function isEventHandlerExpression(expr: ts.Expression): boolean {
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return true;
  if (
    ts.isPropertyAccessExpression(expr) &&
    expr.expression.kind === ts.SyntaxKind.ThisKeyword
  ) {
    const n = expr.name.text;
    if (n.startsWith('on') || n.startsWith('handle') || n.startsWith('_on')) {
      return true;
    }
  }
  return false;
}

function transformNest(call: ts.CallExpression, errors: string[]): string {
  const tagArg = call.arguments[0];
  const propsArg = call.arguments[1];
  if (!tagArg || !ts.isStringLiteral(tagArg)) {
    errors.push("nest() requires nest('tag-name', props)");
    return '';
  }
  const tag = tagArg.text;
  const snippet = tag;

  // nest('product-card', item) — pass drop as product / props
  if (propsArg && ts.isIdentifier(propsArg)) {
    return `{% render '${snippet}', product: ${propsArg.text}, skip_script: true %}`;
  }

  // nest('qty-stepper', { value: item.qty })
  if (propsArg && ts.isObjectLiteralExpression(propsArg)) {
    const parts: string[] = [];
    for (const p of propsArg.properties) {
      if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) continue;
      const key = p.name.text;
      if (ts.isIdentifier(p.initializer)) {
        parts.push(`${key}: ${p.initializer.text}`);
      } else if (ts.isPropertyAccessExpression(p.initializer)) {
        const path = sourcePathFromAccess(p.initializer);
        if (path) parts.push(`${key}: ${path}`);
      }
    }
    parts.push('skip_script: true');
    return `{% render '${snippet}', ${parts.join(', ')} %}`;
  }

  errors.push("nest() second arg must be an identifier or object literal");
  return '';
}

function sourcePathFromAccess(expr: ts.PropertyAccessExpression): string | null {
  const parts: string[] = [];
  let current: ts.Expression = expr;
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }
  if (ts.isIdentifier(current)) {
    return [current.text, ...parts].join('.');
  }
  return null;
}

function transformLiquidFilter(
  call: ts.CallExpression,
  liquidContext: Record<string, string>,
  errors: string[],
): string {
  const valueExpr = call.arguments[0];
  const filterExpr = call.arguments[1];
  if (!valueExpr || !filterExpr || !ts.isStringLiteral(filterExpr)) {
    errors.push('liquidFilter(value, filterString) requires a string filter');
    return '';
  }
  const filter = filterExpr.text;
  if (!isAllowedLiquidFilter(filter)) {
    errors.push(`Unknown liquidFilter "${filter}" — not in allowlist`);
    return '';
  }
  const path = propsPath(valueExpr, liquidContext);
  if (!path) {
    errors.push('liquidFilter first arg must be this.props.* path');
    return '';
  }
  return `{{ ${path} | ${filter} }}`;
}

/** liquidHTML(this.props.html) → {{ html }} (raw, intentional). */
function transformLiquidHTML(
  call: ts.CallExpression,
  liquidContext: Record<string, string>,
  errors: string[],
): string {
  const valueExpr = call.arguments[0];
  if (!valueExpr) {
    errors.push('liquidHTML(value) requires a value');
    return '';
  }
  const path = propsPath(valueExpr, liquidContext);
  if (!path) {
    errors.push('liquidHTML arg must be this.props.* path');
    return '';
  }
  return `{{ ${path} }}`;
}

const ALLOWED_FILTER_PREFIXES = [
  'money',
  'escape',
  'json',
  'handleize',
  'downcase',
  'upcase',
  'image_url:',
];

function isAllowedLiquidFilter(filter: string): boolean {
  return ALLOWED_FILTER_PREFIXES.some(
    (p) => filter === p || filter.startsWith(p),
  );
}

function transformClientOnly(
  call: ts.CallExpression,
  sourceText: string,
  liquidContext: Record<string, string>,
  errors: string[],
): string {
  const optionsArg = call.arguments[0];
  if (!optionsArg || !ts.isObjectLiteralExpression(optionsArg)) {
    errors.push('clientOnlyBlock/clientOnly first arg must be { skeleton: html`...` }');
    return '';
  }

  for (const prop of optionsArg.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === 'skeleton'
    ) {
      const sk = asHtmlTemplate(prop.initializer);
      if (sk) {
        return transformHtmlTemplate(sk, sourceText, liquidContext, errors);
      }
      // skeleton: nothing
      if (ts.isIdentifier(prop.initializer) && prop.initializer.text === 'nothing') {
        return '';
      }
    }
  }

  return '';
}

function transformEach(
  call: ts.CallExpression,
  sourceText: string,
  liquidContext: Record<string, string>,
  errors: string[],
): string {
  // each(collection, (item) => html`...`)
  // each(collection.slice(0, 2), (item) => html`...`)
  const collectionArg = call.arguments[0];
  const fn = call.arguments[1];
  if (!collectionArg || !fn || !ts.isArrowFunction(fn)) {
    errors.push('each(collection, (item) => html`...`) requires a collection and arrow callback');
    return '';
  }

  let collectionExpr: ts.Expression = collectionArg;
  let limitClause = '';

  if (
    ts.isCallExpression(collectionExpr) &&
    ts.isPropertyAccessExpression(collectionExpr.expression) &&
    collectionExpr.expression.name.text === 'slice'
  ) {
    const sliceAccess = collectionExpr.expression;
    const startArg = collectionExpr.arguments[0];
    const endArg = collectionExpr.arguments[1];
    if (
      startArg &&
      ts.isNumericLiteral(startArg) &&
      startArg.text === '0' &&
      endArg &&
      ts.isNumericLiteral(endArg)
    ) {
      limitClause = ` limit: ${endArg.text}`;
      collectionExpr = sliceAccess.expression;
    } else {
      errors.push('each() slice() only supports .slice(0, N)');
      return '';
    }
  }

  const collectionPath = propsPath(collectionExpr, liquidContext);
  if (!collectionPath) {
    errors.push('each() collection must be this.props.*');
    return '';
  }

  let itemName = 'item';
  if (fn.parameters[0] && ts.isIdentifier(fn.parameters[0].name)) {
    itemName = fn.parameters[0].name.text;
  }

  let bodyTemplate: ts.TaggedTemplateExpression | null = null;
  if (ts.isTaggedTemplateExpression(fn.body) && isHtmlTag(fn.body.tag)) {
    bodyTemplate = fn.body;
  } else if (ts.isBlock(fn.body)) {
    bodyTemplate = findHtmlTaggedTemplate(fn.body);
  }

  if (!bodyTemplate) {
    errors.push('each() callback must return html`...`');
    return '';
  }

  const inner = transformHtmlTemplateInLoop(
    bodyTemplate,
    sourceText,
    liquidContext,
    itemName,
    errors,
  );

  if (limitClause) {
    return `{% for ${itemName} in ${collectionPath}${limitClause} %}${inner}{% endfor %}`;
  }

  return `{% for ${itemName} in ${collectionPath} %}${inner}{% endfor %}`;
}

function transformMap(
  call: ts.CallExpression,
  sourceText: string,
  liquidContext: Record<string, string>,
  errors: string[],
): string {
  // this.props.items.map((item) => html`...`)
  // this.props.items.slice(0, 2).map((item) => html`...`)
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) return '';

  let collectionExpr: ts.Expression = callee.expression;
  let limitClause = '';

  // Optional .slice(0, N) before .map → Liquid `limit: N`
  if (
    ts.isCallExpression(collectionExpr) &&
    ts.isPropertyAccessExpression(collectionExpr.expression) &&
    collectionExpr.expression.name.text === 'slice'
  ) {
    const sliceAccess = collectionExpr.expression;
    const startArg = collectionExpr.arguments[0];
    const endArg = collectionExpr.arguments[1];
    if (
      startArg &&
      ts.isNumericLiteral(startArg) &&
      startArg.text === '0' &&
      endArg &&
      ts.isNumericLiteral(endArg)
    ) {
      limitClause = ` limit: ${endArg.text}`;
      collectionExpr = sliceAccess.expression;
    } else {
      errors.push('map slice() only supports .slice(0, N)');
      return '';
    }
  }

  const collectionPath = propsPath(collectionExpr, liquidContext);
  if (!collectionPath) {
    errors.push('map() must be called on this.props.* array');
    return '';
  }

  const fn = call.arguments[0];
  if (!fn || !ts.isArrowFunction(fn)) {
    errors.push('map callback must be an arrow function');
    return '';
  }

  let itemName = 'item';
  if (fn.parameters[0] && ts.isIdentifier(fn.parameters[0].name)) {
    itemName = fn.parameters[0].name.text;
  }

  let bodyTemplate: ts.TaggedTemplateExpression | null = null;
  if (ts.isTaggedTemplateExpression(fn.body) && isHtmlTag(fn.body.tag)) {
    bodyTemplate = fn.body;
  } else if (ts.isBlock(fn.body)) {
    bodyTemplate = findHtmlTaggedTemplate(fn.body);
  }

  if (!bodyTemplate) {
    errors.push('map callback must return html`...`');
    return '';
  }

  const inner = transformHtmlTemplateInLoop(
    bodyTemplate,
    sourceText,
    liquidContext,
    itemName,
    errors,
  );

  if (limitClause) {
    return `{% for ${itemName} in ${collectionPath}${limitClause} %}${inner}{% endfor %}`;
  }

  return `{% for ${itemName} in ${collectionPath} %}${inner}{% endfor %}`;
}

function transformHtmlTemplateInLoop(
  node: ts.TaggedTemplateExpression,
  sourceText: string,
  liquidContext: Record<string, string>,
  itemName: string,
  errors: string[],
): string {
  const template = node.template;
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return template.text;
  }
  if (!ts.isTemplateExpression(template)) return '';

  let out = template.head.text;
  for (const span of template.templateSpans) {
    const eventMatch = out.match(/@([\w-]+)\s*=\s*$/);
    if (eventMatch) {
      const eventName = eventMatch[1];
      const method = methodNameFromHandler(span.expression);
      out = out.replace(/@([\w-]+)\s*=\s*$/, '');
      if (method) {
        out += `data-lit-on-${eventName}="${method}"`;
      }
      out += span.literal.text;
      continue;
    }

    if (/\.[\w]+\s*=\s*$/.test(out)) {
      out = out.replace(/\.[\w]+\s*=\s*$/, '');
      out += span.literal.text;
      continue;
    }

    if (/\?[\w-]+\s*=\s*$/.test(out)) {
      out = out.replace(/\?[\w-]+\s*=\s*$/, '');
      out += span.literal.text;
      continue;
    }

    const attrMatch = out.match(/([\w-:]+)\s*=\s*$/);
    let exprOut = transformLoopExpression(
      span.expression,
      sourceText,
      liquidContext,
      itemName,
      errors,
    );
    if (attrMatch && exprOut && !exprOut.startsWith(' ') && !exprOut.startsWith('data-')) {
      if (exprOut.startsWith('{{') && exprOut.endsWith('}}')) {
        exprOut = `"${exprOut}"`;
      } else if (!exprOut.startsWith('"') && !exprOut.startsWith("'")) {
        exprOut = `"${exprOut}"`;
      }
    }
    out += exprOut;
    out += span.literal.text;
  }
  return out;
}

function transformLoopExpression(
  expr: ts.Expression,
  sourceText: string,
  liquidContext: Record<string, string>,
  itemName: string,
  errors: string[],
): string {
  if (ts.isCallExpression(expr) && getCallName(expr) === 'liquidFilter') {
    return transformLiquidFilterInLoop(expr, liquidContext, itemName, errors);
  }

  if (ts.isCallExpression(expr) && getCallName(expr) === 'liquidHTML') {
    const valueExpr = expr.arguments[0];
    if (!valueExpr) {
      errors.push('liquidHTML(value) requires a value');
      return '';
    }
    const itemPath = identifierPath(valueExpr, itemName);
    const path = itemPath ?? propsPath(valueExpr, liquidContext);
    if (!path) {
      errors.push('liquidHTML value must be item.* or this.props.*');
      return '';
    }
    return `{{ ${path} }}`;
  }

  if (ts.isCallExpression(expr) && getCallName(expr) === 'nest') {
    return transformNest(expr, errors);
  }

  // item.title or item.product.title
  const itemPath = identifierPath(expr, itemName);
  if (itemPath) {
    return `{{ ${itemPath} }}`;
  }

  const path = propsPath(expr, liquidContext);
  if (path) {
    return `{{ ${path} }}`;
  }

  if (isEventHandlerExpression(expr)) return '';

  errors.push(
    `Unsupported loop expression: ${sourceText.slice(expr.getStart(), expr.getEnd())}`,
  );
  return '';
}

function transformLiquidFilterInLoop(
  call: ts.CallExpression,
  liquidContext: Record<string, string>,
  itemName: string,
  errors: string[],
): string {
  const valueExpr = call.arguments[0];
  const filterExpr = call.arguments[1];
  if (!valueExpr || !filterExpr || !ts.isStringLiteral(filterExpr)) {
    errors.push('liquidFilter requires (value, string)');
    return '';
  }
  if (!isAllowedLiquidFilter(filterExpr.text)) {
    errors.push(`Unknown liquidFilter "${filterExpr.text}" — not in allowlist`);
    return '';
  }
  const itemPath = identifierPath(valueExpr, itemName);
  const path = itemPath ?? propsPath(valueExpr, liquidContext);
  if (!path) {
    errors.push('liquidFilter value must be item.* or this.props.*');
    return '';
  }
  return `{{ ${path} | ${filterExpr.text} }}`;
}

function transformConditional(
  expr: ts.ConditionalExpression,
  sourceText: string,
  liquidContext: Record<string, string>,
  errors: string[],
): string {
  const cond = conditionToLiquid(expr.condition, liquidContext, errors);
  const whenTrue = branchToLiquid(expr.whenTrue, sourceText, liquidContext, errors);
  const whenFalse = branchToLiquid(expr.whenFalse, sourceText, liquidContext, errors);

  if (whenFalse === '') {
    return `{% if ${cond} %}${whenTrue}{% endif %}`;
  }
  return `{% if ${cond} %}${whenTrue}{% else %}${whenFalse}{% endif %}`;
}

function branchToLiquid(
  expr: ts.Expression,
  sourceText: string,
  liquidContext: Record<string, string>,
  errors: string[],
): string {
  if (ts.isIdentifier(expr) && expr.text === 'nothing') return '';
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.text;
  }
  const tmpl = asHtmlTemplate(expr);
  if (tmpl) return transformHtmlTemplate(tmpl, sourceText, liquidContext, errors);
  // Reuse top-level expression transform (liquidHTML, each, nest, …)
  if (
    ts.isCallExpression(expr) &&
    (getCallName(expr) === 'liquidHTML' ||
      getCallName(expr) === 'each' ||
      getCallName(expr) === 'nest' ||
      getCallName(expr) === 'liquidFilter' ||
      getCallName(expr) === 'ref' ||
      getCallName(expr) === 'clientOnly' ||
      getCallName(expr) === 'clientOnlyBlock')
  ) {
    return transformExpression(expr, sourceText, liquidContext, errors);
  }
  const path = propsPath(expr, liquidContext);
  if (path) return `{{ ${path} }}`;
  errors.push(`Unsupported ternary branch: ${sourceText.slice(expr.getStart(), expr.getEnd())}`);
  return '';
}

function conditionToLiquid(
  expr: ts.Expression,
  liquidContext: Record<string, string>,
  errors: string[],
): string {
  // this.props.x
  const path = propsPath(expr, liquidContext);
  if (path) return path;

  // !this.props.x
  if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.ExclamationToken) {
    const inner = propsPath(expr.operand, liquidContext);
    if (inner) return inner; // Liquid: {% if path %} is truthy; for ! we use unless
    // Use unless pattern — return special? For simplicity emit `path == false` isn't right.
    // We'll emit the path and warn to use positive conditions; handle ! as:
    errors.push('Prefer positive conditions; `!this.props.x` compiled as unless');
    return inner ? inner : 'false';
  }

  errors.push('Unsupported condition — use this.props.* truthiness');
  return 'false';
}

/**
 * Resolve this.props.foo.bar → props.foo.bar (with liquidContext remaps)
 */
function propsPath(
  expr: ts.Expression,
  liquidContext: Record<string, string>,
): string | null {
  const parts: string[] = [];
  let current: ts.Expression = expr;

  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }

  // this.props...
  if (
    ts.isPropertyAccessExpression(expr) ||
    parts.length > 0
  ) {
    // Walk failed to this — check structure this.props.X
    const chain = getThisPropsChain(expr);
    if (!chain) return null;

    // chain[0] is first property after props
    if (chain.length === 0) return 'props';

    const root = chain[0];
    const mappedRoot = liquidContext[root] ?? `props.${root}`;
    // If liquidContext maps product → product, use product.rest
    // If no map, use props.product.rest
    if (liquidContext[root]) {
      return [liquidContext[root], ...chain.slice(1)].join('.');
    }
    return ['props', ...chain].join('.');
  }

  return null;
}

function getThisPropsChain(expr: ts.Expression): string[] | null {
  const parts: string[] = [];
  let current: ts.Expression = expr;

  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }

  if (current.kind !== ts.SyntaxKind.ThisKeyword) return null;
  if (parts[0] !== 'props') return null;
  return parts.slice(1);
}

function identifierPath(expr: ts.Expression, rootName: string): string | null {
  const parts: string[] = [];
  let current: ts.Expression = expr;

  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }

  if (ts.isIdentifier(current) && current.text === rootName) {
    return [rootName, ...parts].join('.');
  }
  return null;
}

function escapeHtmlComment(s: string): string {
  return s.replace(/--/g, '—').slice(0, 80);
}

/**
 * Build props capture from `liquidContext` only — every prop is listed by the
 * component. Values may include Liquid filters (e.g. `product.price | money`).
 */
function emitPropsCapture(result: CompileResult): {
  preamble: string;
  attributeValue: string;
} {
  if (result.liquidContext && Object.keys(result.liquidContext).length > 0) {
    const parts: string[] = [];
    for (const [propKey, liquidVar] of Object.entries(result.liquidContext)) {
      parts.push(`"${propKey}": {{ ${liquidVar} | json }}`);
    }
    return {
      preamble: `{% capture props %}
  {
    ${parts.join(',\n    ')}
  }
{% endcapture %}
`,
      attributeValue: `{{ props | escape }}`,
    };
  }

  return {
    preamble: '',
    attributeValue: `{{ props | escape }}`,
  };
}

/**
 * Build the full Liquid snippet (vulpine-loader + absorbed host markup).
 */
export function emitLiquidSnippet(
  result: CompileResult,
  opts: {
    liquidPrefix?: string;
    /** Vite entry for the island module */
    viteEntry?: string;
  } = {},
): { filename: string; content: string } {
  const base = path.basename(result.sourceFile, path.extname(result.sourceFile));
  const snippetName = result.snippet ?? `${opts.liquidPrefix ?? ''}${base}`;
  const filename = `${snippetName}.liquid`;
  const viteEntry =
    opts.viteEntry ?? result.moduleSpecifier ?? `@components/${base}.ts`;

  const { preamble, attributeValue } = emitPropsCapture(result);

  const limitPreamble = result.liquidInnerHtml.includes('limit: limit')
    ? `{% if limit == blank %}{% assign limit = 50 %}{% endif %}\n`
    : '';

  const onDefault = `{% assign on = on | default: 'visible' %}\n`;

  // qty defaults when liquidContext includes value/min/max
  let qtyDefaults = '';
  if (result.liquidContext?.value) {
    qtyDefaults = `{% liquid
  assign value = value | default: 1
  assign min = min | default: 1
  assign max = max | default: 9
%}
`;
  }

  const hostInner = result.liquidInnerHtml;
  const hostOpen = `<${result.tag} data-lit-ssr props="${attributeValue}">`;
  const hostClose = `</${result.tag}>`;
  const hostBlock = `${hostOpen}
${hostInner}
${hostClose}`;

  const loaderBlock = `{% capture island_html %}
${hostBlock}
{% endcapture %}
{% render 'vulpine-loader',
  entry: '${viteEntry}',
  on: on,
  replay: replay,
  html: island_html
%}`;

  // Nested islands (nest() / parent already loads the module): bare host, no loader.
  const withSkip = `{% if skip_script %}
${hostBlock}
{% else %}
${loaderBlock}
{% endif %}
`;

  const content = `{% comment %}
  AUTO-GENERATED from ${path.basename(result.sourceFile)} by shopify-lit
  Do not edit by hand.
{% endcomment %}
${limitPreamble}${onDefault}${qtyDefaults}${
    result.propsSource === 'product'
      ? `{% if product != blank %}
${preamble}${withSkip}{% endif %}
`
      : `${preamble}${withSkip}`
  }`;

  return { filename, content };
}

