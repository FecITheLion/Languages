import type { GlobalCallbackDef } from './globalCallbacksEngine.ts';
import type { LogicLabelBinding } from './logicLambdaEngine.ts';
import type { DialectConfig, GrammarRule } from '../types/studio.ts';
import { GRAMMAR_SYMBOL_SPECS, resolveGrammarSymbols } from './bidirectionalEngine.ts';

export type AutocompleteItemKind =
  | 'rule'
  | 'lambda'
  | 'label'
  | 'module_rule'
  | 'module_callback'
  | 'module_snippet'
  | 'dag_symbol'
  | 'cauchy'
  | 'keyword';

export interface ReferencedModuleExport {
  name: string;
  kind: 'rule' | 'callback' | 'label' | 'snippet';
  signature: string;
  definition: string;
  description: string;
  rippleGrammarLine?: string;
  rippleCallback?: { name: string; lambdaExpr: string; description: string };
  rippleLabel?: { name: string; kind: 'number' | 'boolean' | 'lambda'; value: string };
}

export interface ReferencedModule {
  id: string;
  name: string;
  version: string;
  category: 'grammar' | 'logic' | 'callbacks' | 'cauchy' | 'dsl' | 'custom';
  description: string;
  exports: ReferencedModuleExport[];
}

export interface AutocompleteSuggestion {
  id: string;
  label: string;
  insertText: string;
  kind: AutocompleteItemKind;
  detail: string;
  documentation: string;
  moduleId?: string;
  moduleName?: string;
  rippleExport?: ReferencedModuleExport;
}

export const BUILTIN_REFERENCED_MODULES: ReferencedModule[] = [
  {
    id: 'std.grammar.core',
    name: '@std/grammar-core',
    version: '1.2.0',
    category: 'grammar',
    description: 'Standard lexical primitives (identifiers, ISO dates, integers, floats, quoted strings).',
    exports: [
      {
        name: 'iso_date',
        kind: 'rule',
        signature: 'iso_date ::= digit{4} "-" digit{2} "-" digit{2}',
        definition: 'digit{4} "-" digit{2} "-" digit{2}',
        description: 'Matches an ISO-8601 calendar date (YYYY-MM-DD). Ripples rule definition into active grammar.',
        rippleGrammarLine: 'iso_date ::= digit{4} "-" digit{2} "-" digit{2}',
      },
      {
        name: 'identifier',
        kind: 'rule',
        signature: 'identifier ::= [A-Za-z_] [A-Za-z0-9_]*',
        definition: '[A-Za-z_] [A-Za-z0-9_]*',
        description: 'Standard programming identifier token. Ripples rule definition into active grammar.',
        rippleGrammarLine: 'identifier ::= [A-Za-z_] [A-Za-z0-9_]*',
      },
      {
        name: 'decimal_num',
        kind: 'rule',
        signature: 'decimal_num ::= digit+ ("." digit+)?',
        definition: 'digit+ ("." digit+)?',
        description: 'Unsigned integer or floating-point decimal literal using the active + and ? operators.',
        rippleGrammarLine: 'decimal_num ::= digit+ ("." digit+)?',
      },
      {
        name: 'uuid_v4',
        kind: 'rule',
        signature: 'uuid_v4 ::= hex{8} "-" hex{4} "-" hex{4} "-" hex{4} "-" hex{12}',
        definition: '[0-9a-fA-F]{8} "-" [0-9a-fA-F]{4} "-" [0-9a-fA-F]{4} "-" [0-9a-fA-F]{4} "-" [0-9a-fA-F]{12}',
        description: 'Canonical 36-character UUID literal rule.',
        rippleGrammarLine:
          'uuid_v4 ::= [0-9a-fA-F]{8} "-" [0-9a-fA-F]{4} "-" [0-9a-fA-F]{4} "-" [0-9a-fA-F]{4} "-" [0-9a-fA-F]{12}',
      },
    ],
  },
  {
    id: 'std.callbacks.finance',
    name: '@std/finance-callbacks',
    version: '1.0.4',
    category: 'callbacks',
    description: 'Reusable λ callbacks for pricing, tax, clamping, and fee calculations across Logic & Rule Properties.',
    exports: [
      {
        name: 'apply_tax',
        kind: 'callback',
        signature: 'apply_tax(amount) => λx. x * 1.0825',
        definition: 'λx. x * 1.0825',
        description: 'Applies an 8.25% sales tax multiplier. Auto-registers in Global Callbacks & Logic Labels.',
        rippleCallback: {
          name: 'apply_tax',
          lambdaExpr: 'λx. x * 1.0825',
          description: 'Applies 8.25% sales tax multiplier',
        },
        rippleLabel: { name: 'apply_tax', kind: 'lambda', value: 'λx. x * 1.0825' },
      },
      {
        name: 'apply_discount',
        kind: 'callback',
        signature: 'apply_discount(amount, pct) => λa. λp. a * (1 - p / 100)',
        definition: 'λa. λp. a * (1 - p / 100)',
        description: 'Curried percentage discount callback. Ripples into Global Callbacks and Logic scope.',
        rippleCallback: {
          name: 'apply_discount',
          lambdaExpr: 'λa. λp. a * (1 - p / 100)',
          description: 'Curried percentage discount callback',
        },
        rippleLabel: { name: 'apply_discount', kind: 'lambda', value: 'λa. λp. a * (1 - p / 100)' },
      },
      {
        name: 'fee_floor',
        kind: 'callback',
        signature: 'fee_floor(v) => λv. v + 2.5',
        definition: 'λv. v + 2.5',
        description: 'Adds a flat $2.50 clearing fee to an order total.',
        rippleCallback: {
          name: 'fee_floor',
          lambdaExpr: 'λv. v + 2.5',
          description: 'Adds a flat 2.5 clearing fee',
        },
        rippleLabel: { name: 'fee_floor', kind: 'lambda', value: 'λv. v + 2.5' },
      },
    ],
  },
  {
    id: 'std.logic.predicates',
    name: '@std/logic-predicates',
    version: '1.1.0',
    category: 'logic',
    description: 'Higher-order propositional combinators and numeric predicates.',
    exports: [
      {
        name: 'is_positive',
        kind: 'callback',
        signature: 'is_positive(x) => λx. x > 0',
        definition: 'λx. x > 0',
        description: 'Boolean predicate returning ⊤ when argument exceeds zero.',
        rippleCallback: {
          name: 'is_positive',
          lambdaExpr: 'λx. x > 0',
          description: 'Checks whether x > 0',
        },
        rippleLabel: { name: 'is_positive', kind: 'lambda', value: 'λx. x > 0' },
      },
      {
        name: 'compose2',
        kind: 'callback',
        signature: 'compose2(f, g, x) => λf. λg. λx. f(g(x))',
        definition: 'λf. λg. λx. f(g(x))',
        description: 'Classic B-combinator function composition for chaining callbacks.',
        rippleCallback: {
          name: 'compose2',
          lambdaExpr: 'λf. λg. λx. f(g(x))',
          description: 'Function composition λf.λg.λx. f(g(x))',
        },
        rippleLabel: { name: 'compose2', kind: 'lambda', value: 'λf. λg. λx. f(g(x))' },
      },
      {
        name: 'threshold_ok',
        kind: 'label',
        signature: 'threshold_ok = 100',
        definition: '100',
        description: 'Standard numeric threshold constant for guard statements.',
        rippleLabel: { name: 'threshold_ok', kind: 'number', value: '100' },
      },
    ],
  },
  {
    id: 'std.cauchy.numerical',
    name: '@std/cauchy-numerical',
    version: '1.0.0',
    category: 'cauchy',
    description: 'Convergent numerical recurrences using positional (_1, _2), directional (left, right), or custom parameter names.',
    exports: [
      {
        name: 'heron_sqrt2',
        kind: 'snippet',
        signature: '(_1 + 2 / _1) / 2',
        definition: '(_1 + 2 / _1) / 2',
        description: 'Babylonian / Heron quadratic Cauchy sequence converging to √2 ≈ 1.41421356.',
      },
      {
        name: 'midpoint_average',
        kind: 'snippet',
        signature: '(left + right) / 2',
        definition: '(left + right) / 2',
        description: 'Directional midpoint averaging Cauchy sequence converging to 2/3 from seeds 0, 1.',
      },
      {
        name: 'golden_ratio_step',
        kind: 'snippet',
        signature: '1 + 1 / _1',
        definition: '1 + 1 / _1',
        description: 'Continued-fraction Cauchy recurrence converging to φ ≈ 1.61803398.',
      },
    ],
  },
  {
    id: 'std.dsl.workflows',
    name: '@std/dsl-workflows',
    version: '1.0.2',
    category: 'dsl',
    description: 'Reusable DSL flow node templates and HATEOAS API interpolation variables.',
    exports: [
      {
        name: 'prev_body_id',
        kind: 'snippet',
        signature: '{{prev.body.id}}',
        definition: '{{prev.body.id}}',
        description: 'Pipes the previous HTTP routine step response body ID into the current request.',
      },
      {
        name: 'artifact_rule_name',
        kind: 'snippet',
        signature: '{{artifacts.step_1.body.rule.name}}',
        definition: '{{artifacts.step_1.body.rule.name}}',
        description: 'References the rule name artifact exported by routine step_1.',
      },
    ],
  },
];

const CUSTOM_MODULES_STORAGE_KEY = 'grammar2json_referenced_modules_v1';

export function loadLoadedModuleIds(): string[] {
  if (typeof window === 'undefined') return ['std.grammar.core', 'std.callbacks.finance'];
  try {
    const raw = window.localStorage.getItem(`${CUSTOM_MODULES_STORAGE_KEY}:active`);
    if (!raw) return ['std.grammar.core', 'std.callbacks.finance'];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : ['std.grammar.core'];
  } catch {
    return ['std.grammar.core', 'std.callbacks.finance'];
  }
}

export function saveLoadedModuleIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${CUSTOM_MODULES_STORAGE_KEY}:active`, JSON.stringify(ids));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadCustomModules(): ReferencedModule[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`${CUSTOM_MODULES_STORAGE_KEY}:custom`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ReferencedModule[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomModules(modules: ReferencedModule[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${CUSTOM_MODULES_STORAGE_KEY}:custom`, JSON.stringify(modules));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Parses a pasted or uploaded JSON / EBNF / Lambda module string into a ReferencedModule
 * so any external module can be loaded into scope autocomplete and live-rippled.
 */
export function parseCustomReferencedModule(
  rawText: string,
  fallbackName = '@custom/module'
): { ok: true; module: ReferencedModule } | { ok: false; error: string } {
  const trimmed = rawText.trim();
  if (!trimmed) return { ok: false, error: 'Paste JSON module manifest or EBNF/λ definitions to load.' };

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Partial<ReferencedModule>;
      const modName = (obj.name || fallbackName).trim();
      const exportsList: ReferencedModuleExport[] = Array.isArray(obj.exports)
        ? obj.exports
            .filter((e) => e && typeof e.name === 'string')
            .map((e) => ({
              name: e.name,
              kind: e.kind || 'snippet',
              signature: e.signature || `${e.name} = ${e.definition || ''}`,
              definition: e.definition || e.name,
              description: e.description || `Imported from ${modName}`,
              rippleGrammarLine: e.rippleGrammarLine,
              rippleCallback: e.rippleCallback,
              rippleLabel: e.rippleLabel,
            }))
        : [];
      if (exportsList.length === 0) {
        return { ok: false, error: 'JSON module must include a non-empty "exports" array.' };
      }
      return {
        ok: true,
        module: {
          id: obj.id || `custom.${Date.now()}`,
          name: modName,
          version: obj.version || '1.0.0',
          category: 'custom',
          description: obj.description || `Custom loaded module (${exportsList.length} exports)`,
          exports: exportsList,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON module.' };
    }
  }

  // Parse raw lines as EBNF rules (`name ::= rhs`) or lambda bindings (`name = λx. ...`)
  const exportsList: ReferencedModuleExport[] = [];
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    const ruleMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:::=|:=|<-|->)\s*(.+)$/);
    if (ruleMatch) {
      exportsList.push({
        name: ruleMatch[1],
        kind: 'rule',
        signature: line,
        definition: ruleMatch[2].trim(),
        description: `Grammar rule imported from ${fallbackName}`,
        rippleGrammarLine: `${ruleMatch[1]} ::= ${ruleMatch[2].trim()}`,
      });
      continue;
    }
    const lambdaMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (lambdaMatch) {
      const val = lambdaMatch[2].trim();
      const isLam = val.includes('λ') || val.startsWith('\\') || val.includes('=>');
      exportsList.push({
        name: lambdaMatch[1],
        kind: isLam ? 'callback' : 'label',
        signature: `${lambdaMatch[1]} = ${val}`,
        definition: val,
        description: `${isLam ? 'Lambda callback' : 'Label'} imported from ${fallbackName}`,
        rippleCallback: isLam
          ? { name: lambdaMatch[1], lambdaExpr: val, description: `Imported from ${fallbackName}` }
          : undefined,
        rippleLabel: {
          name: lambdaMatch[1],
          kind: isLam ? 'lambda' : val === 'true' || val === 'false' ? 'boolean' : 'number',
          value: val,
        },
      });
    }
  }

  if (exportsList.length === 0) {
    return {
      ok: false,
      error: 'Could not detect any `rule ::= expr`, `fn = λx. expr`, or JSON exports.',
    };
  }

  return {
    ok: true,
    module: {
      id: `custom.${Date.now()}`,
      name: fallbackName,
      version: '1.0.0',
      category: 'custom',
      description: `Loaded ${exportsList.length} symbols from ${fallbackName}`,
      exports: exportsList,
    },
  };
}

export interface LiveScopeContext {
  rules: GrammarRule[];
  dialect: DialectConfig;
  logicLabels: LogicLabelBinding[];
  globalCallbacks: GlobalCallbackDef[];
  loadedModules: ReferencedModule[];
  cauchyParams?: string[];
}

export function buildLiveScopeSuggestions(
  ctx: LiveScopeContext,
  surface: 'grammar' | 'logic' | 'jsonld' | 'code' | 'dsl' | 'api' | 'property'
): AutocompleteSuggestion[] {
  const items: AutocompleteSuggestion[] = [];
  const seen = new Set<string>();

  const pushUnique = (item: AutocompleteSuggestion) => {
    const key = `${item.kind}:${item.label}:${item.insertText}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  // 1. Active Grammar Rules
  for (const r of ctx.rules) {
    pushUnique({
      id: `rule:${r.name}`,
      label: r.name,
      insertText: r.name,
      kind: 'rule',
      detail: `Rule L${r.lineNumber} · ${r.alternatives.length} branch${r.alternatives.length === 1 ? '' : 'es'}`,
      documentation: `${r.name} ${ctx.dialect.ruleOperator || ' '} ${r.expression}`,
    });
  }

  // 2. Active Logic Labels
  for (const lbl of ctx.logicLabels) {
    if (!lbl.name.trim()) continue;
    const isLam = lbl.kind === 'lambda';
    pushUnique({
      id: `label:${lbl.name}`,
      label: lbl.name,
      insertText: isLam && (surface === 'logic' || surface === 'property') ? `${lbl.name}(` : lbl.name,
      kind: isLam ? 'lambda' : 'label',
      detail: `${lbl.kind} = ${lbl.value}`,
      documentation: `Active Logic Workbench binding: ${lbl.name} (${lbl.kind}) = ${lbl.value}`,
    });
  }

  // 3. Saved Local Global Callbacks
  for (const cb of ctx.globalCallbacks) {
    const callInsert =
      surface === 'logic' || surface === 'property' || surface === 'code'
        ? `${cb.name}(${cb.params.join(', ')})`
        : cb.name;
    pushUnique({
      id: `global_cb:${cb.name}`,
      label: `${cb.name}(${cb.params.join(', ')})`,
      insertText: callInsert,
      kind: 'lambda',
      detail: `Global λ · ${cb.lambdaExpr}`,
      documentation: cb.description || `Persisted global callback ${cb.name}: ${cb.lambdaExpr}`,
    });
  }

  // 4. Enabled Extended DAG Operators (for grammar/code surfaces)
  if (surface === 'grammar' || surface === 'code' || surface === 'dsl') {
    const resolvedSyms = resolveGrammarSymbols(ctx.dialect);
    for (const spec of GRAMMAR_SYMBOL_SPECS) {
      const symVal = resolvedSyms[spec.key];
      if (!symVal) continue;
      pushUnique({
        id: `dag:${spec.key}`,
        label: `${symVal}  (${spec.label})`,
        insertText: symVal,
        kind: 'dag_symbol',
        detail: `Enabled DAG operator (${spec.key})`,
        documentation: `Active syntax operator "${symVal}" from 01. Syntax Dialect & Grammar Rules.`,
      });
    }
  }

  // 5. Cauchy Sequence Parameters
  for (const p of ctx.cauchyParams || ['_1', '_2', 'left', 'right', 'cauchy_limit']) {
    pushUnique({
      id: `cauchy:${p}`,
      label: p,
      insertText: p,
      kind: 'cauchy',
      detail: 'Cauchy sequence parameter',
      documentation: `Live Cauchy recurrence / limit binding "${p}" available across logic and property expressions.`,
    });
  }

  // 6. Loaded Referenced Modules (Selecting ripples definition into active scope!)
  for (const mod of ctx.loadedModules) {
    for (const exp of mod.exports) {
      const insertText =
        exp.kind === 'callback' && (surface === 'logic' || surface === 'property')
          ? `${exp.name}(`
          : exp.kind === 'snippet'
            ? exp.definition
            : exp.name;
      pushUnique({
        id: `mod:${mod.id}:${exp.name}`,
        label: `${exp.name}`,
        insertText,
        kind:
          exp.kind === 'rule'
            ? 'module_rule'
            : exp.kind === 'callback'
              ? 'module_callback'
              : 'module_snippet',
        detail: `${mod.name} · ${exp.signature}`,
        documentation: `${exp.description} (Selecting auto-ripples into all workspace inputs & outputs.)`,
        moduleId: mod.id,
        moduleName: mod.name,
        rippleExport: exp,
      });
    }
  }

  return items;
}

export function filterSuggestions(
  all: AutocompleteSuggestion[],
  token: string,
  limit = 10
): AutocompleteSuggestion[] {
  const q = token.trim().toLowerCase().replace(/^@/, '');
  if (!q) return all.slice(0, limit);
  const scored = all
    .map((item) => {
      const lbl = item.label.toLowerCase();
      const mod = (item.moduleName || '').toLowerCase();
      const det = item.detail.toLowerCase();
      let score = 0;
      if (lbl === q) score = 100;
      else if (lbl.startsWith(q)) score = 80;
      else if (lbl.includes(q)) score = 55;
      else if (mod.includes(q)) score = 40;
      else if (det.includes(q)) score = 25;
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label));
  return scored.slice(0, limit).map((s) => s.item);
}
