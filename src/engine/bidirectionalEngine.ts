import type {
  DialectConfig,
  EvaluationResult,
  EvaluationTraceStep,
  ExportLanguage,
  GrammarDiagnostic,
  GrammarRule,
  GrammarRuleConstraint,
  GrammarSymbolDefinitions,
  GrammarSymbolStatus,
  JsonLdSchemaPackage,
  LineMutation,
  MutationPolicy,
  PythonAstNode,
  RuleDependencyGraphData,
  RuleGraphEdge,
  RuleGraphNode,
  RuleMergeStrategy,
  RuleOrderConfig,
  RustAstItem,
  RustAstModule,
  SchemaConfig,
  TransformTarget,
  WasmCompilationResult,
  WasmExportEntry,
  WasmParamSpec,
} from '../types/studio.ts';

export const DEFAULT_MUTATION_POLICY: MutationPolicy = {
  allowImportMutation: true,
  allowExportMutation: true,
  allowedTargets: ['jsonld', 'python', 'rust', 'wasm'],
  lockedRules: [],
};

export interface ResolvedGrammarSymbols {
  oneOrMore: string;
  zeroOrMore: string;
  optional: string;
  repeatBraces: string;
  groupParens: string;
  charClassBrackets: string;
  posLookahead: string;
  negLookahead: string;
  posLookbehind: string;
  negLookbehind: string;
  wildcard: string;
  regexDelimiter: string;
}

export const GRAMMAR_SYMBOL_SPECS: Array<{
  key: keyof GrammarSymbolDefinitions;
  label: string;
  defaultValue: string;
  description: string;
}> = [
  { key: 'oneOrMore', label: 'One or More (+)', defaultValue: '+', description: '1..∞ repetition postfix (e.g. digit+)' },
  { key: 'zeroOrMore', label: 'Zero or More (*)', defaultValue: '*', description: '0..∞ repetition postfix (e.g. digit*)' },
  { key: 'optional', label: 'Optional (?)', defaultValue: '?', description: '0..1 optional postfix (e.g. sign?)' },
  { key: 'repeatBraces', label: 'Bounded / EBNF Braces', defaultValue: '{}', description: 'Quantifier {m,n} or EBNF {expr}' },
  { key: 'groupParens', label: 'Group Parens', defaultValue: '()', description: 'Inline grouping & choice (a | b)' },
  { key: 'charClassBrackets', label: 'Char Class / Opt Brackets', defaultValue: '[]', description: 'Char class [0-9] or EBNF [opt]' },
  { key: 'posLookahead', label: 'Pos Lookahead', defaultValue: '&', description: 'Positive lookahead &expr / (?=expr)' },
  { key: 'negLookahead', label: 'Neg Lookahead', defaultValue: '!', description: 'Negative lookahead !expr / (?!expr)' },
  { key: 'posLookbehind', label: 'Pos Lookbehind', defaultValue: '(?<=', description: 'Positive lookbehind (?<=expr)' },
  { key: 'negLookbehind', label: 'Neg Lookbehind', defaultValue: '(?<!', description: 'Negative lookbehind (?<!expr)' },
  { key: 'wildcard', label: 'Wildcard', defaultValue: '.', description: 'Single-character wildcard' },
  { key: 'regexDelimiter', label: 'Inline Regex', defaultValue: '/', description: 'Inline /pattern/ terminal' },
];

/**
 * Resolves Extended DAG symbol definitions.
 * When `dialect.symbols` is supplied, each symbol is enabled iff its trimmed string value is non-empty,
 * and disabled when empty or missing. When `dialect.symbols` is omitted, defaults are enabled.
 */
export function resolveGrammarSymbols(dialect?: DialectConfig): ResolvedGrammarSymbols {
  const hasExplicit = Boolean(dialect && dialect.symbols !== undefined);
  const src = dialect?.symbols;
  const pick = (key: keyof GrammarSymbolDefinitions, fallback: string): string => {
    if (!hasExplicit) return fallback;
    const raw = src?.[key];
    return typeof raw === 'string' ? raw.trim() : '';
  };
  return {
    oneOrMore: pick('oneOrMore', '+'),
    zeroOrMore: pick('zeroOrMore', '*'),
    optional: pick('optional', '?'),
    repeatBraces: pick('repeatBraces', '{}'),
    groupParens: pick('groupParens', '()'),
    charClassBrackets: pick('charClassBrackets', '[]'),
    posLookahead: pick('posLookahead', '&'),
    negLookahead: pick('negLookahead', '!'),
    posLookbehind: pick('posLookbehind', '(?<='),
    negLookbehind: pick('negLookbehind', '(?<!'),
    wildcard: pick('wildcard', '.'),
    regexDelimiter: pick('regexDelimiter', '/'),
  };
}

function stripQuotedSegments(expr: string): string {
  return expr.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g, ' ');
}

function pairDelimiters(pair: string): [string, string] | null {
  const trimmed = pair.trim();
  if (trimmed.length < 2) return null;
  return [trimmed[0], trimmed[trimmed.length - 1]];
}

/* ============================================================================
 * 1. GRAMMAR PARSER (EBNF, BNF, PEG, Python PEG, Rust Macro, WABT S-Expr)
 * ========================================================================== */

function splitOutsideQuotes(input: string, delimiter: string): string[] {
  if (!delimiter) return [input.trim()];
  const result: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (quote) {
      current += ch;
      if (ch === quote && input[i - 1] !== '\\') {
        quote = null;
      }
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      i += 1;
      continue;
    }
    // Skip inline /regex/ when delimiter is not '/'
    if (ch === '/' && delimiter !== '/') {
      let j = i + 1;
      let closed = false;
      while (j < input.length) {
        if (input[j] === '\\') {
          j += 2;
          continue;
        }
        if (input[j] === '/') {
          closed = true;
          j += 1;
          break;
        }
        j += 1;
      }
      if (closed) {
        current += input.slice(i, j);
        i = j;
        continue;
      }
    }
    if (ch === '(') parenDepth += 1;
    else if (ch === ')' && parenDepth > 0) parenDepth -= 1;
    else if (ch === '[') bracketDepth += 1;
    else if (ch === ']' && bracketDepth > 0) bracketDepth -= 1;
    else if (ch === '{') braceDepth += 1;
    else if (ch === '}' && braceDepth > 0) braceDepth -= 1;

    if (
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      input.startsWith(delimiter, i)
    ) {
      result.push(current.trim());
      current = '';
      i += delimiter.length;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current.trim() || result.length === 0) {
    result.push(current.trim());
  }
  return result.filter(Boolean);
}

export function formatGrammarRuleLine(
  name: string,
  expression: string,
  ruleOperator: string
): string {
  const op = (ruleOperator ?? '').trim();
  return op ? `${name} ${op} ${expression}` : `${name} ${expression}`;
}

export function splitGrammarRuleLine(
  codePart: string,
  ruleOperator: string
):
  | { ok: true; name: string; expression: string }
  | { ok: false; reason: 'missing_operator' | 'empty_rhs' } {
  const op = (ruleOperator ?? '').trim();
  if (!op) {
    // Empty rule operator: a single (or more) space separates rule name and value
    const wsIdx = codePart.search(/\s/);
    if (wsIdx <= 0) {
      return { ok: false, reason: 'missing_operator' };
    }
    const rawName = codePart.slice(0, wsIdx).trim();
    const name = rawName.replace(/^<|>$/g, '');
    if (!name || !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name)) {
      return { ok: false, reason: 'missing_operator' };
    }
    const expression = codePart.slice(wsIdx).trim();
    if (!expression) {
      return { ok: false, reason: 'empty_rhs' };
    }
    return { ok: true, name, expression };
  }

  const opIdx = codePart.indexOf(op);
  if (opIdx <= 0) {
    return { ok: false, reason: 'missing_operator' };
  }
  const name = codePart.slice(0, opIdx).trim().replace(/^<|>$/g, '');
  if (!name) {
    return { ok: false, reason: 'missing_operator' };
  }
  const expression = codePart.slice(opIdx + op.length).trim();
  if (!expression) {
    return { ok: false, reason: 'empty_rhs' };
  }
  return { ok: true, name, expression };
}

function stripGrammarComments(rawLine: string, commentPrefix: string): string {
  let out = '';
  let quote: string | null = null;
  let i = 0;
  while (i < rawLine.length) {
    const ch = rawLine[i];
    if (quote) {
      out += ch;
      if (ch === quote && rawLine[i - 1] !== '\\') quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    // ISO EBNF block comment (* ... *)
    if (rawLine[i] === '(' && rawLine[i + 1] === '*') {
      const end = rawLine.indexOf('*)', i + 2);
      if (end >= 0) {
        out += ' ';
        i = end + 2;
        continue;
      }
      break;
    }
    // C-style block comment /* ... */
    if (rawLine[i] === '/' && rawLine[i + 1] === '*') {
      const end = rawLine.indexOf('*/', i + 2);
      if (end >= 0) {
        out += ' ';
        i = end + 2;
        continue;
      }
      break;
    }
    // Dialect line comment prefix
    if (commentPrefix && rawLine.startsWith(commentPrefix, i)) {
      break;
    }
    out += ch;
    i += 1;
  }
  return out.trim();
}

export function parseCommentConstraints(rawLine: string): GrammarRuleConstraint[] {
  const constraints: GrammarRuleConstraint[] = [];
  let quote: string | null = null;
  let i = 0;
  while (i < rawLine.length) {
    const ch = rawLine[i];
    if (quote) {
      if (ch === quote && rawLine[i - 1] !== '\\') quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i += 1;
      continue;
    }
    if (rawLine[i] === '(' && rawLine[i + 1] === '*') {
      const end = rawLine.indexOf('*)', i + 2);
      if (end < 0) break;
      const body = rawLine.slice(i + 2, end).trim();
      i = end + 2;
      if (!body) continue;

      // Split clauses on top-level commas or semicolons outside /regex/ and quotes
      const clauses: string[] = [];
      let buf = '';
      let inRegex = false;
      let innerQuote: string | null = null;
      for (let j = 0; j < body.length; j += 1) {
        const c = body[j];
        if (innerQuote) {
          buf += c;
          if (c === innerQuote && body[j - 1] !== '\\') innerQuote = null;
        } else if (inRegex) {
          buf += c;
          if (c === '/' && body[j - 1] !== '\\') inRegex = false;
        } else if (c === '"' || c === "'") {
          innerQuote = c;
          buf += c;
        } else if (c === '/') {
          inRegex = true;
          buf += c;
        } else if (c === ',' || c === ';') {
          if (buf.trim()) clauses.push(buf.trim());
          buf = '';
        } else {
          buf += c;
        }
      }
      if (buf.trim()) clauses.push(buf.trim());

      for (const clause of clauses) {
        const regexOnly = clause.match(/^\/(.+)\/$/);
        if (regexOnly) {
          constraints.push({ raw: clause, kind: 'pattern', operator: '~=', value: regexOnly[1] });
          continue;
        }
        const patternKv = clause.match(/^pattern\s*(?:=|:=|~=|:)\s*(?:\/(.+)\/|"([^"]+)"|'([^']+)'|(\S+))$/i);
        if (patternKv) {
          const pat = patternKv[1] ?? patternKv[2] ?? patternKv[3] ?? patternKv[4] ?? '';
          constraints.push({ raw: clause, kind: 'pattern', operator: '~=', value: pat });
          continue;
        }
        const fmtKv = clause.match(/^format\s*(?:=|:=|:)\s*["']?([A-Za-z0-9_-]+)["']?$/i);
        if (fmtKv) {
          constraints.push({ raw: clause, kind: 'format', operator: '==', value: fmtKv[1].toLowerCase() });
          continue;
        }
        const numMatch = clause.match(
          /^(minLength|maxLength|minimum|maximum|exclusiveMinimum|exclusiveMaximum|min|max|multipleOf)\s*(>=|<=|>|<|==|=|:)\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/i
        );
        if (numMatch) {
          const key = numMatch[1].toLowerCase();
          const op = numMatch[2] === '=' || numMatch[2] === ':' ? '==' : (numMatch[2] as GrammarRuleConstraint['operator']);
          const numVal = Number(numMatch[3]);
          if (key === 'minlength') {
            constraints.push({
              raw: clause,
              kind: 'minLength',
              operator: op,
              value: op === '>' ? numVal + 1 : numVal,
            });
          } else if (key === 'maxlength') {
            constraints.push({
              raw: clause,
              kind: 'maxLength',
              operator: op,
              value: op === '<' ? numVal - 1 : numVal,
            });
          } else if (key === 'exclusiveminimum' || ((key === 'min' || key === 'minimum') && op === '>')) {
            constraints.push({ raw: clause, kind: 'exclusiveMin', operator: '>', value: numVal });
          } else if (key === 'exclusivemaximum' || ((key === 'max' || key === 'maximum') && op === '<')) {
            constraints.push({ raw: clause, kind: 'exclusiveMax', operator: '<', value: numVal });
          } else if (key === 'min' || key === 'minimum') {
            constraints.push({ raw: clause, kind: 'min', operator: '>=', value: numVal });
          } else if (key === 'max' || key === 'maximum') {
            constraints.push({ raw: clause, kind: 'max', operator: '<=', value: numVal });
          } else if (key === 'multipleof') {
            constraints.push({ raw: clause, kind: 'multipleOf', operator: '==', value: numVal });
          }
          continue;
        }
        constraints.push({ raw: clause, kind: 'custom', value: clause });
      }
      continue;
    }
    i += 1;
  }
  return constraints;
}

export function validateValueAgainstConstraints(
  rawValue: string,
  constraints: GrammarRuleConstraint[]
): { ok: true } | { ok: false; reason: string } {
  if (!constraints || constraints.length === 0) return { ok: true };
  const trimmed = rawValue.trim();
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
      ? trimmed.slice(1, -1)
      : trimmed;

  for (const c of constraints) {
    switch (c.kind) {
      case 'minLength': {
        const minLen = Number(c.value);
        if (unquoted.length < minLen) {
          return { ok: false, reason: `Constraint (${c.raw}) failed: length ${unquoted.length} < ${minLen}` };
        }
        break;
      }
      case 'maxLength': {
        const maxLen = Number(c.value);
        if (unquoted.length > maxLen) {
          return { ok: false, reason: `Constraint (${c.raw}) failed: length ${unquoted.length} > ${maxLen}` };
        }
        break;
      }
      case 'min': {
        const n = Number(unquoted);
        if (!Number.isFinite(n) || n < Number(c.value)) {
          return { ok: false, reason: `Constraint (${c.raw}) failed: ${unquoted} < ${c.value}` };
        }
        break;
      }
      case 'max': {
        const n = Number(unquoted);
        if (!Number.isFinite(n) || n > Number(c.value)) {
          return { ok: false, reason: `Constraint (${c.raw}) failed: ${unquoted} > ${c.value}` };
        }
        break;
      }
      case 'exclusiveMin': {
        const n = Number(unquoted);
        if (!Number.isFinite(n) || n <= Number(c.value)) {
          return { ok: false, reason: `Constraint (${c.raw}) failed: ${unquoted} <= ${c.value}` };
        }
        break;
      }
      case 'exclusiveMax': {
        const n = Number(unquoted);
        if (!Number.isFinite(n) || n >= Number(c.value)) {
          return { ok: false, reason: `Constraint (${c.raw}) failed: ${unquoted} >= ${c.value}` };
        }
        break;
      }
      case 'multipleOf': {
        const n = Number(unquoted);
        const step = Number(c.value);
        if (!Number.isFinite(n) || !step || Math.abs(n / step - Math.round(n / step)) > 1e-9) {
          return { ok: false, reason: `Constraint (${c.raw}) failed: ${unquoted} is not a multiple of ${step}` };
        }
        break;
      }
      case 'pattern': {
        try {
          const re = new RegExp(String(c.value));
          if (!re.test(unquoted)) {
            return { ok: false, reason: `Constraint (${c.raw}) failed: "${unquoted}" did not match /${c.value}/` };
          }
        } catch {
          // Ignore invalid regex in comment
        }
        break;
      }
      case 'format': {
        const fmt = String(c.value).toLowerCase();
        const formatRegexes: Record<string, RegExp> = {
          email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
          uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          uri: /^[a-z][a-z0-9+.-]*:\/\/\S+$/i,
          date: /^\d{4}-\d{2}-\d{2}$/,
          ipv4: /^(?:\d{1,3}\.){3}\d{1,3}$/,
        };
        const re = formatRegexes[fmt];
        if (re && !re.test(unquoted)) {
          return { ok: false, reason: `Constraint (${c.raw}) failed: "${unquoted}" is not a valid ${fmt}` };
        }
        break;
      }
      default:
        break;
    }
  }
  return { ok: true };
}

export function parseGrammar(text: string, dialect: DialectConfig): GrammarRule[] {
  const op = dialect.ruleOperator ?? '';
  const delim = dialect.choiceDelimiter || '|';
  const comment = dialect.commentPrefix || '//';
  const lines = text.split(/\r?\n/);

  const rawRules: Array<{
    lineNumber: number;
    name: string;
    expression: string;
    rawLine: string;
    constraints: GrammarRuleConstraint[];
  }> = [];

  lines.forEach((rawLine, index) => {
    const cleaned = stripGrammarComments(rawLine.trim(), comment);
    if (!cleaned) return;
    const split = splitGrammarRuleLine(cleaned, op);
    if (!split.ok) return;

    rawRules.push({
      lineNumber: index + 1,
      name: split.name,
      expression: split.expression,
      rawLine: cleaned,
      constraints: parseCommentConstraints(rawLine),
    });
  });

  const definedNames = new Set(rawRules.map((r) => r.name));

  return rawRules.map((r) => {
    const alternatives = splitOutsideQuotes(r.expression, delim);
    const literals: string[] = [];
    const literalRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g;
    let m: RegExpExecArray | null;
    while ((m = literalRegex.exec(r.expression)) !== null) {
      literals.push(m[1] ?? m[2] ?? '');
    }

    // Strip string literals, inline /regex/ terminals (when delim != '/'), and character classes like [a-z0-9]
    let stripped = r.expression.replace(literalRegex, ' ');
    if (delim !== '/') {
      stripped = stripped.replace(/\/(?:\\.|[^/\\])+\//g, ' ');
    }
    stripped = stripped.replace(/\[[^\]]*\]/g, (bracketed) => {
      const inner = bracketed.slice(1, -1).trim();
      // Preserve EBNF optional brackets like [sign] or [digit] when inner references a defined rule
      const innerWords = inner.match(/[A-Za-z_][A-Za-z0-9_-]*/g) || [];
      const hasDefinedRule = innerWords.some((w) => definedNames.has(w));
      return hasDefinedRule ? ` ${inner} ` : ' ';
    });

    const tokens = stripped.match(/[A-Za-z_][A-Za-z0-9_-]*/g) || [];
    const uniqueTokens = Array.from(new Set(tokens));
    const referencedRules = uniqueTokens.filter((t) => definedNames.has(t));
    const undefinedReferences = uniqueTokens.filter((t) => !definedNames.has(t));

    return {
      id: `rule_${r.name}_${r.lineNumber}`,
      lineNumber: r.lineNumber,
      name: r.name,
      expression: r.expression,
      alternatives,
      referencedRules,
      undefinedReferences,
      literals,
      rawLine: r.rawLine,
      ...(r.constraints.length > 0 ? { constraints: r.constraints } : {}),
    };
  });
}

/* ============================================================================
 * 1B. RULE DEPENDENCY GRAPH & GRAMMAR DIAGNOSTIC ANALYZER
 * ========================================================================== */

function hasUnclosedQuote(line: string): boolean {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote && line[i - 1] !== '\\') {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    }
  }
  return quote !== null;
}

export function analyzeRuleDependencies(
  rules: GrammarRule[],
  rawGrammarText: string,
  dialect: DialectConfig,
  lockedRules: string[] = []
): RuleDependencyGraphData {
  const diagnostics: GrammarDiagnostic[] = [];
  const op = dialect.ruleOperator ?? '';
  const opTrimmed = op.trim();
  const comment = dialect.commentPrefix || '//';

  // 1. Line-level syntax diagnostics
  rawGrammarText.split(/\r?\n/).forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    const lineNumber = idx + 1;
    if (!trimmed) return;
    if (comment && trimmed.startsWith(comment)) return;

    // Strip EBNF (* ... *), C /* ... */, and line comments outside quotes
    let codePart = '';
    let q: string | null = null;
    for (let i = 0; i < trimmed.length; ) {
      const ch = trimmed[i];
      if (q) {
        codePart += ch;
        if (ch === q && trimmed[i - 1] !== '\\') q = null;
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        q = ch;
        codePart += ch;
        i += 1;
        continue;
      }
      if (trimmed[i] === '(' && trimmed[i + 1] === '*') {
        const end = trimmed.indexOf('*)', i + 2);
        if (end >= 0) {
          codePart += ' ';
          i = end + 2;
          continue;
        }
        break;
      }
      if (trimmed[i] === '/' && trimmed[i + 1] === '*') {
        const end = trimmed.indexOf('*/', i + 2);
        if (end >= 0) {
          codePart += ' ';
          i = end + 2;
          continue;
        }
        break;
      }
      if (comment && trimmed.startsWith(comment, i)) {
        break;
      }
      codePart += ch;
      i += 1;
    }
    codePart = codePart.trim();
    if (!codePart) return;

    if (hasUnclosedQuote(codePart)) {
      diagnostics.push({
        id: `diag-quote-${lineNumber}`,
        severity: 'error',
        lineNumber,
        code: 'UNCLOSED_QUOTE',
        message: `Line ${lineNumber}: Unclosed string literal in rule expression.`,
      });
    }

    const split = splitGrammarRuleLine(codePart, op);
    if (!split.ok) {
      if (split.reason === 'missing_operator') {
        diagnostics.push({
          id: `diag-op-${lineNumber}`,
          severity: 'error',
          lineNumber,
          code: 'SYNTAX_OPERATOR',
          message: opTrimmed
            ? `Line ${lineNumber}: Missing rule operator "${opTrimmed}" or rule identifier.`
            : `Line ${lineNumber}: Missing space separator between rule name and value.`,
        });
      } else {
        diagnostics.push({
          id: `diag-empty-rhs-${lineNumber}`,
          severity: 'error',
          lineNumber,
          code: 'SYNTAX_OPERATOR',
          message: opTrimmed
            ? `Line ${lineNumber}: Rule expression after "${opTrimmed}" cannot be empty.`
            : `Line ${lineNumber}: Rule value after rule name cannot be empty.`,
        });
      }
    }
  });

  // 2. Duplicate rule detection & deduplicated rule map
  const seenCount = new Map<string, number>();
  const ruleByName = new Map<string, GrammarRule>();
  for (const r of rules) {
    const count = (seenCount.get(r.name) || 0) + 1;
    seenCount.set(r.name, count);
    if (count > 1) {
      diagnostics.push({
        id: `diag-dup-${r.name}-${r.lineNumber}`,
        severity: 'error',
        lineNumber: r.lineNumber,
        ruleName: r.name,
        code: 'DUPLICATE_RULE',
        message: `Line ${r.lineNumber}: Duplicate definition for rule "${r.name}".`,
      });
    } else {
      ruleByName.set(r.name, r);
    }
  }

  // 3. Build adjacency + detect missing references
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const missingSet = new Set<string>();

  for (const r of ruleByName.values()) {
    adj.set(r.name, []);
    inDegree.set(r.name, 0);
  }

  for (const r of ruleByName.values()) {
    for (const ref of r.referencedRules) {
      adj.get(r.name)!.push(ref);
      inDegree.set(ref, (inDegree.get(ref) || 0) + 1);
    }
    for (const undef of r.undefinedReferences) {
      missingSet.add(undef);
      if (!adj.has(undef)) adj.set(undef, []);
      adj.get(r.name)!.push(undef);
      inDegree.set(undef, (inDegree.get(undef) || 0) + 1);
      diagnostics.push({
        id: `diag-undef-${r.name}-${undef}`,
        severity: 'error',
        lineNumber: r.lineNumber,
        ruleName: r.name,
        code: 'UNDEFINED_REF',
        message: `Line ${r.lineNumber}: Rule "${r.name}" references undefined symbol "${undef}".`,
      });
    }
  }

  // 4. DFS 3-color cycle detection
  const color = new Map<string, 0 | 1 | 2>(); // 0=unvisited, 1=visiting, 2=visited
  const stack: string[] = [];
  const cycleEdgeSet = new Set<string>();
  const cycleNodeSet = new Set<string>();
  const cycles: string[][] = [];

  const dfs = (u: string) => {
    color.set(u, 1);
    stack.push(u);
    for (const v of adj.get(u) || []) {
      const state = color.get(v) || 0;
      if (state === 1) {
        cycleEdgeSet.add(`${u}->${v}`);
        const idx = stack.indexOf(v);
        if (idx >= 0) {
          const cyclePath = [...stack.slice(idx), v];
          cycles.push(cyclePath);
          cyclePath.forEach((n) => cycleNodeSet.add(n));
        }
      } else if (state === 0) {
        dfs(v);
      }
    }
    stack.pop();
    color.set(u, 2);
  };

  for (const name of adj.keys()) {
    if ((color.get(name) || 0) === 0) {
      dfs(name);
    }
  }

  cycles.forEach((c, idx) => {
    diagnostics.push({
      id: `diag-cycle-${idx}-${c.join('-')}`,
      severity: 'warning',
      ruleName: c[0],
      code: 'CYCLE',
      message: `Recursive dependency cycle detected: ${c.join(' → ')}.`,
    });
  });

  // 5. Reachability from primary root(s)
  const orderedDefined = Array.from(ruleByName.keys());
  const roots = orderedDefined.filter((name) => (inDegree.get(name) || 0) === 0);
  const startSeeds = roots.length > 0 ? roots : orderedDefined.slice(0, 1);
  const reachable = new Set<string>();
  const bfsQueue: string[] = [...startSeeds];
  startSeeds.forEach((s) => reachable.add(s));
  while (bfsQueue.length > 0) {
    const curr = bfsQueue.shift()!;
    for (const next of adj.get(curr) || []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        bfsQueue.push(next);
      }
    }
  }

  for (const name of orderedDefined) {
    if (startSeeds.length > 0 && !reachable.has(name)) {
      const rule = ruleByName.get(name)!;
      diagnostics.push({
        id: `diag-unreach-${name}`,
        severity: 'warning',
        lineNumber: rule.lineNumber,
        ruleName: name,
        code: 'UNREACHABLE',
        message: `Line ${rule.lineNumber}: Rule "${name}" is unreachable from entry rule "${startSeeds[0]}".`,
      });
    }
  }

  // 6. Layered layout levels (longest DAG distance from roots, skipping cycle edges)
  const levelMap = new Map<string, number>();
  const dagInDeg = new Map<string, number>();
  const allNames = [...orderedDefined, ...Array.from(missingSet)];
  allNames.forEach((n) => {
    levelMap.set(n, 0);
    dagInDeg.set(n, 0);
  });

  for (const u of allNames) {
    for (const v of adj.get(u) || []) {
      if (cycleEdgeSet.has(`${u}->${v}`)) continue;
      dagInDeg.set(v, (dagInDeg.get(v) || 0) + 1);
    }
  }

  const topoQueue: string[] = allNames.filter((n) => (dagInDeg.get(n) || 0) === 0);
  const topologicalOrder: string[] = [];

  while (topoQueue.length > 0) {
    const u = topoQueue.shift()!;
    topologicalOrder.push(u);
    const uLvl = levelMap.get(u) || 0;
    for (const v of adj.get(u) || []) {
      if (cycleEdgeSet.has(`${u}->${v}`)) continue;
      levelMap.set(v, Math.max(levelMap.get(v) || 0, uLvl + 1));
      const nextDeg = (dagInDeg.get(v) || 1) - 1;
      dagInDeg.set(v, nextDeg);
      if (nextDeg === 0) topoQueue.push(v);
    }
  }
  for (const n of allNames) {
    if (!topologicalOrder.includes(n)) topologicalOrder.push(n);
  }

  // Compute per-level index
  const levelBuckets = new Map<number, string[]>();
  for (const name of allNames) {
    const lvl = levelMap.get(name) || 0;
    if (!levelBuckets.has(lvl)) levelBuckets.set(lvl, []);
    levelBuckets.get(lvl)!.push(name);
  }

  const resolvedSymbols = resolveGrammarSymbols(dialect);
  const symbolUsageCounts: Record<keyof GrammarSymbolDefinitions, number> = {
    oneOrMore: 0,
    zeroOrMore: 0,
    optional: 0,
    repeatBraces: 0,
    groupParens: 0,
    charClassBrackets: 0,
    posLookahead: 0,
    negLookahead: 0,
    posLookbehind: 0,
    negLookbehind: 0,
    wildcard: 0,
    regexDelimiter: 0,
  };

  const detectNodeOperators = (rule?: GrammarRule): string[] => {
    if (!rule) return [];
    const stripped = stripQuotedSegments(rule.expression);
    const ops: string[] = [];

    const checkSymbol = (
      key: keyof GrammarSymbolDefinitions,
      fallbackToken: string,
      matcher: (tok: string) => boolean
    ) => {
      const configured = resolvedSymbols[key];
      if (configured) {
        if (matcher(configured)) {
          ops.push(`${key}:${configured}`);
          symbolUsageCounts[key] += 1;
        }
      } else if (fallbackToken && matcher(fallbackToken)) {
        diagnostics.push({
          id: `diag-disabled-sym-${rule.name}-${key}`,
          severity: 'warning',
          lineNumber: rule.lineNumber,
          ruleName: rule.name,
          code: 'DISABLED_SYMBOL',
          message: `Line ${rule.lineNumber}: Rule "${rule.name}" uses "${fallbackToken}", but symbol "${key}" is currently disabled in Dialect Symbol Definitions.`,
        });
      }
    };

    checkSymbol('oneOrMore', '+', (tok) => stripped.includes(tok));
    checkSymbol('zeroOrMore', '*', (tok) => stripped.includes(tok));
    checkSymbol('optional', '?', (tok) => {
      const cleaned = stripped.replace(/\(\?[=!<:]/g, ' ');
      return cleaned.includes(tok);
    });
    checkSymbol('repeatBraces', '{}', (tok) => {
      const pair = pairDelimiters(tok);
      return Boolean(pair && stripped.includes(pair[0]) && stripped.includes(pair[1]));
    });
    checkSymbol('groupParens', '()', (tok) => {
      const pair = pairDelimiters(tok);
      return Boolean(pair && stripped.includes(pair[0]) && stripped.includes(pair[1]));
    });
    checkSymbol('charClassBrackets', '[]', (tok) => {
      const pair = pairDelimiters(tok);
      return Boolean(pair && stripped.includes(pair[0]) && stripped.includes(pair[1]));
    });
    checkSymbol('posLookahead', '&', (tok) => stripped.includes(tok) || stripped.includes('(?='));
    checkSymbol('negLookahead', '!', (tok) => {
      const cleaned = stripped.replace(/\(\?<!/g, ' ');
      return cleaned.includes(tok) || cleaned.includes('(?!');
    });
    checkSymbol('posLookbehind', '(?<=', (tok) => stripped.includes(tok));
    checkSymbol('negLookbehind', '(?<!', (tok) => stripped.includes(tok));
    checkSymbol('wildcard', '.', (tok) => stripped.includes(tok));
    if (dialect.choiceDelimiter !== '/') {
      checkSymbol('regexDelimiter', '/', (tok) => stripped.includes(tok));
    }

    return ops;
  };

  const nodes: RuleGraphNode[] = allNames.map((name) => {
    const rule = ruleByName.get(name);
    const lvl = levelMap.get(name) || 0;
    const orderInLevel = levelBuckets.get(lvl)?.indexOf(name) ?? 0;
    const outList = adj.get(name) || [];
    const inDeg = inDegree.get(name) || 0;
    const usedOperators = detectNodeOperators(rule);

    return {
      id: name,
      name,
      lineNumber: rule ? rule.lineNumber : null,
      level: lvl,
      orderInLevel,
      inDegree: inDeg,
      outDegree: outList.length,
      branchesCount: rule ? rule.alternatives.length : 0,
      literalsCount: rule ? rule.literals.length : 0,
      isRoot: startSeeds.includes(name),
      isLeaf: outList.length === 0,
      isMissing: missingSet.has(name),
      isUnreachable: Boolean(rule && startSeeds.length > 0 && !reachable.has(name)),
      inCycle: cycleNodeSet.has(name),
      isLocked: lockedRules.includes(name),
      expression: rule ? rule.expression : '(undefined reference)',
      usedOperators,
    };
  });

  const symbolRegistry: GrammarSymbolStatus[] = GRAMMAR_SYMBOL_SPECS.map((spec) => {
    const val = resolvedSymbols[spec.key];
    return {
      key: spec.key,
      label: spec.label,
      value: val,
      enabled: val.length > 0,
      usageCount: symbolUsageCounts[spec.key],
    };
  });

  const edges: RuleGraphEdge[] = [];
  for (const u of allNames) {
    for (const v of adj.get(u) || []) {
      edges.push({
        id: `${u}->${v}`,
        from: u,
        to: v,
        isCycleEdge: cycleEdgeSet.has(`${u}->${v}`),
        isMissingTarget: missingSet.has(v),
      });
    }
  }

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  return {
    nodes,
    edges,
    diagnostics,
    topologicalOrder,
    hasCycles: cycles.length > 0,
    cycles,
    missingRules: Array.from(missingSet),
    errorCount,
    warningCount,
    symbolRegistry,
  };
}

/* ============================================================================
 * 1C. QUOTE NORMALIZATION & DRAG-AND-DROP RULE REORDER / MERGE ENGINE
 * ========================================================================== */

export function normalizeExpressionQuotes(expr: string): string {
  // Collapse any stale escaped quotes (e.g., \" or \\\") then prefer single-quoted
  // terminal literals so JSON-LD, Python, and Rust emit zero \" escape sequences.
  const cleaned = expr.replace(/\\+"/g, '"');
  let out = '';
  let i = 0;
  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (ch === "'") {
      let j = i + 1;
      while (j < cleaned.length && cleaned[j] !== "'") {
        if (cleaned[j] === '\\' && j + 1 < cleaned.length) j += 2;
        else j += 1;
      }
      out += cleaned.slice(i, Math.min(j + 1, cleaned.length));
      i = j + 1;
      continue;
    }
    if (ch === '"') {
      let inner = '';
      let j = i + 1;
      let closed = false;
      while (j < cleaned.length) {
        if (cleaned[j] === '\\' && j + 1 < cleaned.length) {
          inner += cleaned[j + 1];
          j += 2;
          continue;
        }
        if (cleaned[j] === '"') {
          closed = true;
          j += 1;
          break;
        }
        inner += cleaned[j];
        j += 1;
      }
      if (closed && !inner.includes("'")) {
        out += `'${inner}'`;
      } else {
        out += cleaned.slice(i, j);
      }
      i = j;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function replaceIdentifierOutsideQuotes(expr: string, fromIdent: string, replacement: string): string {
  let out = '';
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < expr.length && expr[j] !== quote) {
        if (expr[j] === '\\' && j + 1 < expr.length) j += 2;
        else j += 1;
      }
      out += expr.slice(i, Math.min(j + 1, expr.length));
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < expr.length && /[A-Za-z0-9_-]/.test(expr[j])) j += 1;
      const ident = expr.slice(i, j);
      out += ident === fromIdent ? replacement : ident;
      i = j;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function extractLeadingCommentBlock(rawGrammarText: string, dialect: DialectConfig): string[] {
  const comment = dialect.commentPrefix || '//';
  const header: string[] = [];
  for (const line of rawGrammarText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (header.length > 0) break;
      continue;
    }
    if (comment && trimmed.startsWith(comment)) {
      header.push(line);
    } else {
      break;
    }
  }
  return header;
}

function serializeRulesWithHeader(
  rawGrammarText: string,
  orderedRules: Array<{ name: string; expression: string }>,
  dialect: DialectConfig
): string {
  const header = extractLeadingCommentBlock(rawGrammarText, dialect);
  const body = orderedRules.map((r) => formatGrammarRuleLine(r.name, r.expression, dialect.ruleOperator));
  return [...header, ...body].join('\n');
}

export function reorderGrammarRules(
  rawGrammarText: string,
  rules: GrammarRule[],
  sourceRuleName: string,
  targetRuleName: string,
  position: 'before' | 'after',
  dialect: DialectConfig
): { ok: true; grammar: string } | { ok: false; error: string } {
  if (sourceRuleName === targetRuleName) {
    return { ok: false, error: 'Source and target rule are identical.' };
  }
  const srcIdx = rules.findIndex((r) => r.name === sourceRuleName);
  const tgtIdx = rules.findIndex((r) => r.name === targetRuleName);
  if (srcIdx === -1 || tgtIdx === -1) {
    return { ok: false, error: 'Unable to locate source or target rule.' };
  }

  const reordered = rules.map((r) => ({ name: r.name, expression: r.expression }));
  const [moved] = reordered.splice(srcIdx, 1);
  const nextTargetIdx = reordered.findIndex((r) => r.name === targetRuleName);
  const insertIdx = position === 'before' ? nextTargetIdx : nextTargetIdx + 1;
  reordered.splice(insertIdx, 0, moved);

  return {
    ok: true,
    grammar: serializeRulesWithHeader(rawGrammarText, reordered, dialect),
  };
}

export function mergeGrammarRules(
  rawGrammarText: string,
  rules: GrammarRule[],
  sourceRuleName: string,
  targetRuleName: string,
  strategy: RuleMergeStrategy,
  dialect: DialectConfig
): { ok: true; grammar: string; summary: string } | { ok: false; error: string } {
  if (sourceRuleName === targetRuleName) {
    return { ok: false, error: 'Cannot merge a rule into itself.' };
  }
  const sourceRule = rules.find((r) => r.name === sourceRuleName);
  const targetRule = rules.find((r) => r.name === targetRuleName);
  if (!sourceRule || !targetRule) {
    return { ok: false, error: 'Both source and target rules must be defined to merge.' };
  }

  const delim = dialect.choiceDelimiter || '|';
  let mergedTargetExpr = targetRule.expression;
  let summary = '';

  if (strategy === 'inline') {
    const targetCallsSource = targetRule.referencedRules.includes(sourceRuleName);
    if (targetCallsSource) {
      mergedTargetExpr = replaceIdentifierOutsideQuotes(
        targetRule.expression,
        sourceRuleName,
        sourceRule.expression
      );
      summary = `Inlined <${sourceRuleName}> into <${targetRuleName}> and removed <${sourceRuleName}>.`;
    } else {
      const combined = Array.from(new Set([...targetRule.alternatives, ...sourceRule.alternatives]));
      mergedTargetExpr = combined.join(` ${delim} `);
      summary = `Merged <${sourceRuleName}> into <${targetRuleName}> via choice (${delim}) because <${targetRuleName}> did not directly reference <${sourceRuleName}>.`;
    }
  } else if (strategy === 'sequence') {
    const cleanTarget = targetRule.referencedRules.includes(sourceRuleName)
      ? replaceIdentifierOutsideQuotes(targetRule.expression, sourceRuleName, sourceRule.expression)
      : `${targetRule.expression} ${sourceRule.expression}`;
    mergedTargetExpr = cleanTarget;
    summary = `Merged <${sourceRuleName}> into <${targetRuleName}> as sequence and redirected references.`;
  } else {
    // Default: 'choice' — deduplicate alternatives cleanly
    const targetAlts = targetRule.alternatives.map((alt) =>
      targetRule.referencedRules.includes(sourceRuleName)
        ? replaceIdentifierOutsideQuotes(alt, sourceRuleName, sourceRule.expression)
        : alt
    );
    const combined = Array.from(new Set([...targetAlts, ...sourceRule.alternatives]));
    mergedTargetExpr = combined.join(` ${delim} `);
    summary = `Merged <${sourceRuleName}> into <${targetRuleName}> (${combined.length} choice branches) and redirected references.`;
  }

  const updatedRules: Array<{ name: string; expression: string }> = [];
  for (const r of rules) {
    if (r.name === sourceRuleName) continue;
    if (r.name === targetRuleName) {
      updatedRules.push({ name: r.name, expression: mergedTargetExpr });
    } else {
      // Rewrite references to removed sourceRuleName so no dangling UNDEFINED_REF errors appear
      const nextExpr =
        strategy === 'inline'
          ? replaceIdentifierOutsideQuotes(r.expression, sourceRuleName, sourceRule.expression)
          : replaceIdentifierOutsideQuotes(r.expression, sourceRuleName, targetRuleName);
      updatedRules.push({ name: r.name, expression: nextExpr });
    }
  }

  return {
    ok: true,
    grammar: serializeRulesWithHeader(rawGrammarText, updatedRules, dialect),
    summary,
  };
}

/* ============================================================================
 * 1D. RULE PROPERTIES, ORDER OF OPERATIONS & MULTI-LANGUAGE EXPORTER
 * ========================================================================== */

export function inferRuleOrderConfigs(
  rules: GrammarRule[],
  existing: Record<string, RuleOrderConfig> = {}
): Record<string, RuleOrderConfig> {
  const next: Record<string, RuleOrderConfig> = {};
  rules.forEach((rule, idx) => {
    const prev = existing[rule.name];
    next[rule.name] = prev
      ? {
          precedence: prev.precedence,
          associativity: prev.associativity,
          properties: prev.properties,
        }
      : {
          precedence: idx + 1,
          associativity: 'left',
          properties: [],
        };
  });
  return next;
}

export function tokenizeAlternativeTokens(alt: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < alt.length) {
    const ch = alt[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < alt.length && alt[j] !== quote) {
        if (alt[j] === '\\' && j + 1 < alt.length) j += 2;
        else j += 1;
      }
      tokens.push(normalizeExpressionQuotes(alt.slice(i, Math.min(j + 1, alt.length))));
      i = j + 1;
      continue;
    }
    let j = i + 1;
    while (j < alt.length && !/\s|"|'/.test(alt[j])) j += 1;
    tokens.push(alt.slice(i, j));
    i = j;
  }
  return tokens;
}

export function updateGrammarRule(
  rawGrammarText: string,
  rules: GrammarRule[],
  originalName: string,
  patch: { name?: string; expression?: string; alternatives?: string[] },
  dialect: DialectConfig
): { ok: true; grammar: string; nextName: string } | { ok: false; error: string } {
  const idx = rules.findIndex((r) => r.name === originalName);
  if (idx === -1) {
    return { ok: false, error: `Rule "${originalName}" not found.` };
  }

  const nextName = (patch.name ?? originalName).trim();
  if (!nextName || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(nextName)) {
    return {
      ok: false,
      error: 'Rule name must start with a letter or underscore and contain only letters, digits, _ or -.',
    };
  }
  if (nextName !== originalName && rules.some((r) => r.name === nextName)) {
    return { ok: false, error: `A rule named "${nextName}" already exists.` };
  }

  const delim = dialect.choiceDelimiter || '|';
  let nextExpr = rules[idx].expression;
  if (Array.isArray(patch.alternatives)) {
    const cleaned = patch.alternatives.map((a) => normalizeExpressionQuotes(a.trim())).filter(Boolean);
    if (cleaned.length === 0) {
      return { ok: false, error: 'A rule must contain at least one branch expression.' };
    }
    nextExpr = cleaned.join(` ${delim} `);
  } else if (typeof patch.expression === 'string') {
    const cleaned = normalizeExpressionQuotes(patch.expression.trim());
    if (!cleaned) {
      return { ok: false, error: 'Rule value expression cannot be empty.' };
    }
    nextExpr = cleaned;
  }

  const updated = rules.map((r) => {
    if (r.name === originalName) {
      const expr =
        nextName !== originalName ? replaceIdentifierOutsideQuotes(nextExpr, originalName, nextName) : nextExpr;
      return { name: nextName, expression: expr };
    }
    const expr =
      nextName !== originalName
        ? replaceIdentifierOutsideQuotes(r.expression, originalName, nextName)
        : r.expression;
    return { name: r.name, expression: expr };
  });

  return {
    ok: true,
    grammar: serializeRulesWithHeader(rawGrammarText, updated, dialect),
    nextName,
  };
}

export function addGrammarRule(
  rawGrammarText: string,
  rules: GrammarRule[],
  newName: string,
  expression: string,
  dialect: DialectConfig
): { ok: true; grammar: string; name: string } | { ok: false; error: string } {
  const cleanName = newName.trim();
  if (!cleanName || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(cleanName)) {
    return { ok: false, error: 'Provide a valid identifier for the new rule name.' };
  }
  if (rules.some((r) => r.name === cleanName)) {
    return { ok: false, error: `Rule "${cleanName}" already exists.` };
  }
  const cleanExpr = normalizeExpressionQuotes(expression.trim() || `'${cleanName}'`);
  const nextList = [
    ...rules.map((r) => ({ name: r.name, expression: r.expression })),
    { name: cleanName, expression: cleanExpr },
  ];
  return {
    ok: true,
    grammar: serializeRulesWithHeader(rawGrammarText, nextList, dialect),
    name: cleanName,
  };
}

export function deleteGrammarRule(
  rawGrammarText: string,
  rules: GrammarRule[],
  ruleName: string,
  dialect: DialectConfig
): { ok: true; grammar: string } | { ok: false; error: string } {
  const remaining = rules
    .filter((r) => r.name !== ruleName)
    .map((r) => ({ name: r.name, expression: r.expression }));
  if (remaining.length === rules.length) {
    return { ok: false, error: `Rule "${ruleName}" not found.` };
  }
  return {
    ok: true,
    grammar: serializeRulesWithHeader(rawGrammarText, remaining, dialect),
  };
}

export function sortRulesByPrecedence(
  rawGrammarText: string,
  rules: GrammarRule[],
  ruleConfigs: Record<string, RuleOrderConfig>,
  dialect: DialectConfig
): string {
  const sorted = [...rules]
    .sort((a, b) => {
      const pa = ruleConfigs[a.name]?.precedence ?? a.lineNumber;
      const pb = ruleConfigs[b.name]?.precedence ?? b.lineNumber;
      return pa - pb || a.lineNumber - b.lineNumber;
    })
    .map((r) => ({ name: r.name, expression: r.expression }));
  return serializeRulesWithHeader(rawGrammarText, sorted, dialect);
}

/**
 * Replaces unquoted occurrences of `prevDelim` with `nextDelim` inside a grammar expression,
 * preserving single-quoted strings, double-quoted strings, character classes `[...]`, and `/regex/`.
 */
function replaceUnquotedDelimiter(expr: string, prevDelim: string, nextDelim: string): string {
  if (!prevDelim || prevDelim === nextDelim || !nextDelim) return expr;
  let out = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inBracket = false;
  let inRegex = false;

  while (i < expr.length) {
    const ch = expr[i];
    if (inSingle) {
      out += ch;
      if (ch === '\\' && i + 1 < expr.length) {
        out += expr[i + 1];
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i += 1;
      continue;
    }
    if (inDouble) {
      out += ch;
      if (ch === '\\' && i + 1 < expr.length) {
        out += expr[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') inDouble = false;
      i += 1;
      continue;
    }
    if (inBracket) {
      out += ch;
      if (ch === '\\' && i + 1 < expr.length) {
        out += expr[i + 1];
        i += 2;
        continue;
      }
      if (ch === ']') inBracket = false;
      i += 1;
      continue;
    }
    if (inRegex) {
      out += ch;
      if (ch === '\\' && i + 1 < expr.length) {
        out += expr[i + 1];
        i += 2;
        continue;
      }
      if (ch === '/') inRegex = false;
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '[') {
      inBracket = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && prevDelim !== '/') {
      inRegex = true;
      out += ch;
      i += 1;
      continue;
    }

    if (expr.startsWith(prevDelim, i)) {
      out += nextDelim;
      i += prevDelim.length;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Live-rewrites every existing Rule Operator, Choice Delimiter, and Comment Prefix in `rawGrammarText`
 * when the user edits dialect syntax fields in Workbench 01.
 */
export function rewriteGrammarDialectTokens(
  rawGrammarText: string,
  prevDialect: DialectConfig,
  nextDialect: DialectConfig,
  lastKnownSymbols?: Partial<ResolvedGrammarSymbols>,
  lastKnownTokens?: { choiceDelimiter?: string; commentPrefix?: string }
): string {
  const prevOp = prevDialect.ruleOperator.trim();
  const nextOp = nextDialect.ruleOperator.trim();
  const prevChoice = prevDialect.choiceDelimiter.trim() || lastKnownTokens?.choiceDelimiter?.trim() || '';
  const nextChoice = nextDialect.choiceDelimiter.trim();
  const prevComment = prevDialect.commentPrefix.trim() || lastKnownTokens?.commentPrefix?.trim() || '';
  const nextComment = nextDialect.commentPrefix.trim();

  const prevSyms = resolveGrammarSymbols(prevDialect);
  const nextSyms = resolveGrammarSymbols(nextDialect);
  const singleTokenSymKeys: Array<keyof typeof prevSyms> = [
    'oneOrMore',
    'zeroOrMore',
    'optional',
    'posLookahead',
    'negLookahead',
    'posLookbehind',
    'negLookbehind',
    'wildcard',
    'regexDelimiter',
  ];
  const pairSymKeys: Array<keyof typeof prevSyms> = [
    'repeatBraces',
    'groupParens',
    'charClassBrackets',
  ];
  const singleRewrites: Array<[string, string]> = [];
  for (const k of singleTokenSymKeys) {
    const fromSym = prevSyms[k].trim() || lastKnownSymbols?.[k]?.trim() || '';
    const toSym = nextSyms[k].trim();
    if (fromSym && toSym && fromSym !== toSym) {
      singleRewrites.push([fromSym, toSym]);
    }
  }
  const pairRewrites: Array<[string, string]> = [];
  for (const k of pairSymKeys) {
    const fromPair = pairDelimiters(prevSyms[k].trim() || lastKnownSymbols?.[k]?.trim() || '');
    const toPair = pairDelimiters(nextSyms[k].trim());
    if (fromPair && toPair && (fromPair[0] !== toPair[0] || fromPair[1] !== toPair[1])) {
      if (fromPair[0] !== toPair[0]) pairRewrites.push([fromPair[0], toPair[0]]);
      if (fromPair[1] !== toPair[1]) pairRewrites.push([fromPair[1], toPair[1]]);
    }
  }

  if (
    prevOp === nextOp &&
    prevChoice === nextChoice &&
    prevComment === nextComment &&
    singleRewrites.length === 0 &&
    pairRewrites.length === 0
  ) {
    return rawGrammarText;
  }

  const lines = rawGrammarText.split(/\r?\n/);
  const rewritten = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    const indent = line.slice(0, line.indexOf(trimmed));

    // Rewrite leading comment prefix
    if (prevComment && trimmed.startsWith(prevComment)) {
      if (!nextComment) return line;
      const body = trimmed.slice(prevComment.length);
      return `${indent}${nextComment}${body}`;
    }

    // Match rule line using prevDialect's ruleOperator (supports empty space-separated operator)
    let lhs = '';
    let rhs = '';
    if (!prevOp) {
      const m = trimmed.match(/^<?([A-Za-z_][A-Za-z0-9_-]*)>?\s+(.+)$/);
      if (!m) return line;
      lhs = m[1];
      rhs = m[2].trim();
    } else {
      const idx = trimmed.indexOf(prevOp);
      if (idx <= 0) return line;
      const rawLhs = trimmed.slice(0, idx).trim();
      const lhsClean = rawLhs.replace(/^<|>$/g, '').trim();
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(lhsClean)) return line;
      lhs = rawLhs;
      rhs = trimmed.slice(idx + prevOp.length).trim();
    }

    let updatedRhs =
      prevChoice && nextChoice && prevChoice !== nextChoice
        ? replaceUnquotedDelimiter(rhs, prevChoice, nextChoice)
        : rhs;

    for (const [fromSym, toSym] of singleRewrites) {
      updatedRhs = replaceUnquotedDelimiter(updatedRhs, fromSym, toSym);
    }
    for (const [fromDelim, toDelim] of pairRewrites) {
      updatedRhs = replaceUnquotedDelimiter(updatedRhs, fromDelim, toDelim);
    }

    return `${indent}${formatGrammarRuleLine(lhs, updatedRhs, nextDialect.ruleOperator)}`;
  });

  return rewritten.join('\n');
}

/**
 * Biject / Split a grammar rule into two reversible rules (either splitting alternatives at `splitIndex`
 * or bisecting a sequence into left/right halves), rewriting the parent rule to reference both halves.
 */
export function splitGrammarRule(
  rawGrammarText: string,
  rules: GrammarRule[],
  ruleName: string,
  dialect: DialectConfig,
  splitIndex?: number
):
  | { ok: true; grammar: string; leftRule: string; rightRule: string; summary: string }
  | { ok: false; error: string } {
  const target = rules.find((r) => r.name === ruleName);
  if (!target) {
    return { ok: false, error: `Rule "${ruleName}" not found.` };
  }

  const delim = dialect.choiceDelimiter.trim() || '|';
  const usedNames = new Set(rules.map((r) => r.name));
  const pickUnique = (base: string): string => {
    if (!usedNames.has(base)) {
      usedNames.add(base);
      return base;
    }
    let idx = 2;
    while (usedNames.has(`${base}_${idx}`)) idx += 1;
    const candidate = `${base}_${idx}`;
    usedNames.add(candidate);
    return candidate;
  };

  let leftExpr = '';
  let rightExpr = '';
  let parentRecombined = '';
  const leftName = pickUnique(`${ruleName}_left`);
  const rightName = pickUnique(`${ruleName}_right`);

  if (target.alternatives.length >= 2) {
    const cut =
      typeof splitIndex === 'number' && splitIndex > 0 && splitIndex < target.alternatives.length
        ? splitIndex
        : Math.ceil(target.alternatives.length / 2);
    leftExpr = target.alternatives.slice(0, cut).join(` ${delim} `);
    rightExpr = target.alternatives.slice(cut).join(` ${delim} `);
    parentRecombined = `${leftName} ${delim} ${rightName}`;
  } else {
    const tokens = target.expression.trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 2) {
      return {
        ok: false,
        error: `Rule "${ruleName}" is atomic and needs at least 2 alternatives or sequence tokens to split.`,
      };
    }
    const cut =
      typeof splitIndex === 'number' && splitIndex > 0 && splitIndex < tokens.length
        ? splitIndex
        : Math.ceil(tokens.length / 2);
    leftExpr = tokens.slice(0, cut).join(' ');
    rightExpr = tokens.slice(cut).join(' ');
    parentRecombined = `${leftName} ${rightName}`;
  }

  const nextRules: Array<{ name: string; expression: string }> = [];
  for (const r of rules) {
    if (r.name === ruleName) {
      nextRules.push({ name: r.name, expression: parentRecombined });
      nextRules.push({ name: leftName, expression: leftExpr });
      nextRules.push({ name: rightName, expression: rightExpr });
    } else {
      nextRules.push({ name: r.name, expression: r.expression });
    }
  }

  return {
    ok: true,
    grammar: serializeRulesWithHeader(rawGrammarText, nextRules, dialect),
    leftRule: leftName,
    rightRule: rightName,
    summary: `Bijected <${ruleName}> → <${leftName}> + <${rightName}>`,
  };
}

export function exportWorkspaceInLanguage(
  language: ExportLanguage,
  params: {
    rules: GrammarRule[];
    dialect: DialectConfig;
    schemaConfig: SchemaConfig;
    mutations: Record<string, LineMutation>;
    mutationPolicy: MutationPolicy;
    ruleConfigs: Record<string, RuleOrderConfig>;
    grammarText: string;
    jsonText: string;
    watSource: string;
  }
): { content: string; filename: string; mime: string; label: string } {
  const slug = (params.schemaConfig.schemaName || 'grammar_schema').replace(/[^A-Za-z0-9_-]/g, '_');
  const orderedRules = [...params.rules].sort((a, b) => {
    const pa = params.ruleConfigs[a.name]?.precedence ?? a.lineNumber;
    const pb = params.ruleConfigs[b.name]?.precedence ?? b.lineNumber;
    return pa - pb || a.lineNumber - b.lineNumber;
  });

  if (language === 'grammar') {
    const ext =
      params.dialect.preset === 'bnf'
        ? 'bnf'
        : params.dialect.preset === 'peg' || params.dialect.preset === 'python_peg'
          ? 'peg'
          : 'ebnf';
    const c = params.dialect.commentPrefix || '//';
    const lines: string[] = [
      `${c} Exported Grammar (${params.dialect.preset}) — ${slug}`,
      `${c} Ordered by precedence (Order of Operations)`,
    ];
    for (const r of orderedRules) {
      const cfg = params.ruleConfigs[r.name];
      const propsNote =
        cfg && cfg.properties.length > 0
          ? ` | props: ${cfg.properties.map((p) => `${p.name}=${p.value}`).join(', ')}`
          : '';
      lines.push(
        `${c} [op #${cfg?.precedence ?? r.lineNumber} | assoc=${cfg?.associativity ?? 'left'}${propsNote}]`
      );
      lines.push(
        formatGrammarRuleLine(r.name, normalizeExpressionQuotes(r.expression), params.dialect.ruleOperator)
      );
    }
    return {
      content: lines.join('\n') + '\n',
      filename: `${slug}.${ext}`,
      mime: 'text/plain',
      label: `Grammar (${params.dialect.preset.toUpperCase()})`,
    };
  }

  if (language === 'jsonld') {
    return {
      content: grammarToSchemaJson(
        orderedRules,
        params.dialect,
        params.schemaConfig,
        params.mutations,
        params.mutationPolicy,
        params.ruleConfigs
      ),
      filename: `${slug}.schema.jsonld`,
      mime: 'application/ld+json',
      label: 'Schema.org JSON-LD',
    };
  }

  if (language === 'python') {
    const base = generatePythonFromWorkspace(orderedRules, params.schemaConfig);
    const orderLines = orderedRules.map((r, idx) => {
      const cfg = params.ruleConfigs[r.name];
      return `    (${cfg?.precedence ?? idx + 1}, ${formatPythonStringLiteral(r.name)}, ${formatPythonStringLiteral(cfg?.associativity ?? 'left')}),`;
    });
    const propLines = orderedRules.map((r) => {
      const cfg = params.ruleConfigs[r.name];
      const entries = (cfg?.properties || [])
        .filter((p) => p.name.trim())
        .map((p) => `${formatPythonStringLiteral(p.name)}: ${formatPythonStringLiteral(p.value)}`)
        .join(', ');
      return `    ${formatPythonStringLiteral(r.name)}: {${entries}},`;
    });
    const allPropNames = Array.from(
      new Set(
        orderedRules.flatMap((r) =>
          (params.ruleConfigs[r.name]?.properties || [])
            .map((p) => p.name.trim())
            .filter((n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n))
        )
      )
    );
    const cliPropEntries = allPropNames.map((name) => {
      const firstVal =
        orderedRules
          .flatMap((r) => params.ruleConfigs[r.name]?.properties || [])
          .find((p) => p.name.trim() === name)?.value ?? '';
      return `    (${formatPythonStringLiteral(name)}, ${formatPythonStringLiteral(firstVal)}),`;
    });
    const content = `${base}
ORDER_OF_OPERATIONS = [
${orderLines.join('\n')}
]

RULE_PROPERTIES = {
${propLines.join('\n')}
}

CLI_NAMED_PARAMETERS = [
${cliPropEntries.join('\n')}
]

def _coerce_cli_value(raw: str):
    t = raw.strip()
    if t.lower() == 'true':
        return True
    if t.lower() == 'false':
        return False
    try:
        return int(t) if t.lstrip('-').isdigit() else float(t)
    except ValueError:
        return t

def _split_ebnf_alts(expr: str):
    parts, buf, depth, quote, i = [], [], 0, None, 0
    while i < len(expr):
        ch = expr[i]
        if quote:
            buf.append(ch)
            if ch == '\\\\' and i + 1 < len(expr):
                i += 1
                buf.append(expr[i])
            elif ch == quote:
                quote = None
        elif ch in ('"', "'"):
            quote = ch
            buf.append(ch)
        elif ch in ('(', '['):
            depth += 1
            buf.append(ch)
        elif ch in (')', ']') and depth > 0:
            depth -= 1
            buf.append(ch)
        elif ch == '|' and depth == 0:
            seg = ''.join(buf).strip()
            if seg:
                parts.append(seg)
            buf = []
        else:
            buf.append(ch)
        i += 1
    seg = ''.join(buf).strip()
    if seg:
        parts.append(seg)
    return parts

def _strip_ebnf_comments(expr: str) -> str:
    import re
    cleaned = re.sub(r'\\(\\*.*?\\*\\)', '', expr).strip()
    return cleaned[:-1].strip() if cleaned.endswith(';') else cleaned

def _compile_ebnf_expr(expr: str, rules=GRAMMAR_RULES, depth: int = 0, capture_names=None) -> str:
    import re
    alts = _split_ebnf_alts(expr)
    compiled = []
    for alt in alts:
        tokens = re.findall(r"""(?:"[^"]*"|'[^']*'|\\[[^\\]]+\\]|[A-Za-z_][A-Za-z0-9_]*[+*?]?|[()+*?])""", alt)
        seq = []
        for tok in tokens:
            if (tok.startswith('"') and tok.endswith('"')) or (tok.startswith("'") and tok.endswith("'")):
                seq.append(re.escape(tok[1:-1]))
            elif tok.startswith('[') and tok.endswith(']'):
                inner = tok[1:-1].strip()
                if inner in rules or "'" in inner or '"' in inner:
                    seq.append(f'(?:{_compile_ebnf_expr(inner, rules, depth + 1, capture_names)})?')
                else:
                    seq.append(tok)
            elif tok in ('(', ')', '+', '*', '?'):
                seq.append(tok)
            else:
                q = tok[-1] if tok[-1] in '+*?' else ''
                ref = tok[:-1] if q else tok
                if ref in rules:
                    sub = _compile_ebnf_regex(ref, rules, depth + 1, capture_names)
                    if capture_names is not None and ref not in capture_names and depth == 0:
                        capture_names.add(ref)
                        seq.append(f'(?P<{ref}>{sub}){q}')
                    else:
                        seq.append(f'(?:{sub}){q}')
                else:
                    seq.append(re.escape(ref) + q)
        compiled.append(''.join(seq))
    return '(?:' + '|'.join(compiled) + ')' if len(compiled) > 1 else (compiled[0] if compiled else '')

def _compile_ebnf_regex(rule_name: str, rules=GRAMMAR_RULES, depth: int = 0, capture_names=None) -> str:
    if depth > 12:
        return r'[^,}\\s]+'
    raw_expr = rules.get(rule_name)
    if not raw_expr:
        return r'[^,}\\s]+'
    return _compile_ebnf_expr(_strip_ebnf_comments(raw_expr), rules, depth, capture_names)

def _check_rule_constraints(name: str, raw_value: str, raw_expr: str):
    import re
    errors = []
    val = raw_value.strip()
    unquoted = val[1:-1] if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'") else val
    for body in re.findall(r'\\(\\*(.*?)\\*\\)', raw_expr):
        for clause in [c.strip() for c in re.split(r'[,;]', body) if c.strip()]:
            m_re = re.match(r'^/(.+)/$', clause)
            if m_re:
                if not re.search(m_re.group(1), unquoted):
                    errors.append(f"{name}: constraint ({clause}) failed for {raw_value!r}")
                continue
            m_num = re.match(r'^(minLength|maxLength|min|minimum|max|maximum)\\s*(>=|<=|>|<|=)\\s*([+-]?\\d+(?:\\.\\d+)?)$', clause, re.I)
            if m_num:
                key, op, num = m_num.group(1).lower(), m_num.group(2), float(m_num.group(3))
                if key == 'minlength' and len(unquoted) < int(num + (1 if op == '>' else 0)):
                    errors.append(f"{name}: constraint ({clause}) failed: length {len(unquoted)} < {int(num)}")
                elif key == 'maxlength' and len(unquoted) > int(num - (1 if op == '<' else 0)):
                    errors.append(f"{name}: constraint ({clause}) failed: length {len(unquoted)} > {int(num)}")
                elif key in ('min', 'minimum'):
                    n = float(unquoted)
                    if (op == '>' and n <= num) or (op != '>' and n < num):
                        errors.append(f"{name}: constraint ({clause}) failed: {unquoted} < {num:g}")
                elif key in ('max', 'maximum'):
                    n = float(unquoted)
                    if (op == '<' and n >= num) or (op != '<' and n > num):
                        errors.append(f"{name}: constraint ({clause}) failed: {unquoted} > {num:g}")
    return errors

def validate_payload(payload: str, start_rule: str = None, rules=GRAMMAR_RULES):
    """Validates an input payload against the compiled EBNF grammar and (* constraint *) comments."""
    import re
    entry = start_rule or (next(iter(rules)) if rules else '')
    captured_names = set()
    pattern = _compile_ebnf_regex(entry, rules, 0, captured_names)
    m = re.fullmatch(pattern, payload.strip())
    if not m:
        return {"matched": False, "startRule": entry, "captured": {}, "errors": [f"Payload did not match <{entry}>"]}
    captured = {k: v for k, v in m.groupdict().items() if v is not None}
    errors = []
    errors.extend(_check_rule_constraints(entry, payload.strip(), rules.get(entry, '')))
    for k, v in captured.items():
        errors.extend(_check_rule_constraints(k, v, rules.get(k, '')))
    return {"matched": len(errors) == 0, "startRule": entry, "captured": captured, "errors": errors}

def run_workspace_cli(argv=None):
    """Exposes named rule properties as literal CLI options, allows editing strings, or validates --input payloads."""
    import argparse, json, sys
    parser = argparse.ArgumentParser(description=f"Grammar2JSON Workspace CLI ({SCHEMA_NAME})")
    parser.add_argument("payload", nargs="?", default=None, help="Optional payload string to validate against the start rule")
    parser.add_argument("--input", dest="input_payload", default=None, help="Payload string to validate against the grammar")
    parser.add_argument("--start-rule", default=None, help="Start rule name (defaults to first rule)")
    parser.add_argument("--schema-name", default=SCHEMA_NAME, help=f"Edit SCHEMA_NAME string (default: {SCHEMA_NAME})")
    parser.add_argument("--rule", action="append", default=[], help="Override a rule string as name=expression")
    for p_name, p_default in CLI_NAMED_PARAMETERS:
        parser.add_argument(f"--{p_name}", dest=f"param__{p_name}", default=None, help=f"Literal value for '{p_name}' (default: {p_default})")
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])
    resolved_params = {
        p_name: _coerce_cli_value(getattr(args, f"param__{p_name}") if getattr(args, f"param__{p_name}") is not None else p_default)
        for p_name, p_default in CLI_NAMED_PARAMETERS
    }
    edited_rules = dict(GRAMMAR_RULES) if "GRAMMAR_RULES" in globals() else {}
    for override in args.rule:
        if "=" in override:
            k, v = override.split("=", 1)
            edited_rules[k.strip()] = v.strip()
    raw_payload = args.input_payload if args.input_payload is not None else args.payload
    if raw_payload is not None:
        result = validate_payload(raw_payload, args.start_rule, edited_rules)
        print(json.dumps(result, indent=2))
        if not result["matched"]:
            sys.exit(1)
        return
    print(json.dumps({"schemaName": args.schema_name, "parameters": resolved_params, "ruleCount": len(ORDER_OF_OPERATIONS), "rules": edited_rules}, indent=2))

if __name__ == "__main__":
    run_workspace_cli()
`;
    return {
      content,
      filename: `${slug}.py`,
      mime: 'text/x-python',
      label: 'Python (.py)',
    };
  }

  if (language === 'rust') {
    const base = generateRustFromWorkspace(
      orderedRules,
      params.schemaConfig,
      params.mutations,
      params.mutationPolicy
    );
    const orderTuples = orderedRules.map((r, idx) => {
      const cfg = params.ruleConfigs[r.name];
      return `    (${cfg?.precedence ?? idx + 1}, ${formatRustStringLiteral(r.name)}, ${formatRustStringLiteral(cfg?.associativity ?? 'left')}),`;
    });
    const propTuples = orderedRules.flatMap((r) =>
      (params.ruleConfigs[r.name]?.properties || [])
        .filter((p) => p.name.trim())
        .map(
          (p) =>
            `    (${formatRustStringLiteral(r.name)}, ${formatRustStringLiteral(p.name)}, ${formatRustStringLiteral(p.value)}),`
        )
    );
    const content = `${base}
pub const ORDER_OF_OPERATIONS: &[(u32, &str, &str)] = &[
${orderTuples.join('\n')}
];

pub const RULE_PROPERTIES: &[(&str, &str, &str)] = &[
${propTuples.join('\n') || '    // Add custom rule properties in the Rule Properties workbench'}
];
`;
    return {
      content,
      filename: `${slug}.rs`,
      mime: 'text/plain',
      label: 'Rust (.rs)',
    };
  }

  if (language === 'wat') {
    return {
      content: generateWatFromWorkspace(orderedRules, params.schemaConfig.schemaName, params.jsonText),
      filename: `${slug}.wat`,
      mime: 'text/plain',
      label: 'WABT / WAT (.wat)',
    };
  }

  const compiledRules = orderedRules.map((r, idx) => {
    const cfg = params.ruleConfigs[r.name];
    const propsObj: Record<string, string> = {};
    for (const p of cfg?.properties || []) {
      if (p.name.trim()) propsObj[p.name.trim()] = p.value;
    }
    return {
      name: r.name,
      precedence: cfg?.precedence ?? idx + 1,
      associativity: cfg?.associativity ?? 'left',
      expression: normalizeExpressionQuotes(r.expression),
      alternatives: r.alternatives.map(normalizeExpressionQuotes),
      properties: propsObj,
    };
  });

  if (language === 'javascript') {
    const jsContent = `// Auto-generated JavaScript (ESM) Grammar & Order-of-Operations Module (${slug})
// Exposes named parameters (--<name> <literal>), editable strings (--schema-name, --rule name=expr), or defaults.
export const SCHEMA_NAME = ${JSON.stringify(slug)};
export const DIALECT_PRESET = ${JSON.stringify(params.dialect.preset)};

export const GRAMMAR_RULES = ${JSON.stringify(compiledRules, null, 2)};

export function getRuleOrderOfOperations() {
  return [...GRAMMAR_RULES]
    .sort((a, b) => a.precedence - b.precedence)
    .map((rule) => rule.name);
}

export function runWorkspaceCli(argv = typeof process !== 'undefined' ? process.argv.slice(2) : []) {
  let schemaName = SCHEMA_NAME;
  const overrides = {};
  const rules = GRAMMAR_RULES.map((r) => ({ ...r, properties: { ...r.properties } }));
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    const key = eq >= 0 ? body.slice(0, eq) : body;
    const val = eq >= 0 ? body.slice(eq + 1) : argv[++i];
    if (key === 'schema-name' && val !== undefined) schemaName = val;
    else if (key === 'rule' && val && val.includes('=')) {
      const idx = val.indexOf('=');
      const rName = val.slice(0, idx).trim();
      const rExpr = val.slice(idx + 1).trim();
      const hit = rules.find((r) => r.name === rName);
      if (hit) hit.expression = rExpr;
    } else if (val !== undefined) {
      const coerced = val === 'true' ? true : val === 'false' ? false : !Number.isNaN(Number(val)) ? Number(val) : val;
      overrides[key.replace(/-/g, '_')] = coerced;
    }
  }
  const out = { schemaName, dialect: DIALECT_PRESET, overrides, rules };
  console.log(JSON.stringify(out, null, 2));
  return out;
}
`;
    return {
      content: jsContent,
      filename: `${slug}.mjs`,
      mime: 'text/javascript',
      label: 'JavaScript (.mjs)',
    };
  }

  if (language === 'go') {
    const goEntries = compiledRules.map((r) => {
      const propPairs = Object.entries(r.properties)
        .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
        .join(', ');
      return `\t{Name: ${JSON.stringify(r.name)}, Precedence: ${r.precedence}, Associativity: ${JSON.stringify(r.associativity)}, Expression: ${JSON.stringify(r.expression)}, Properties: map[string]string{${propPairs}}},`;
    });
    const goContent = `// Auto-generated Go Grammar & Order-of-Operations Package (${slug})
package grammar

type CompiledGrammarRule struct {
	Name          string
	Precedence    int
	Associativity string
	Expression    string
	Properties    map[string]string
}

const SchemaName = ${JSON.stringify(slug)}
const DialectPreset = ${JSON.stringify(params.dialect.preset)}

var GrammarRules = []CompiledGrammarRule{
${goEntries.join('\n')}
}
`;
    return {
      content: goContent,
      filename: `${slug}.go`,
      mime: 'text/plain',
      label: 'Go (.go)',
    };
  }

  if (language === 'java') {
    const className = slug.replace(/[^A-Za-z0-9]/g, '') || 'GrammarSchema';
    const javaEntries = compiledRules.map((r) => {
      const propPairs = Object.entries(r.properties)
        .map(([k, v]) => `Map.entry(${JSON.stringify(k)}, ${JSON.stringify(v)})`)
        .join(', ');
      return `        new CompiledRule(${JSON.stringify(r.name)}, ${r.precedence}, ${JSON.stringify(r.associativity)}, ${JSON.stringify(r.expression)}, Map.ofEntries(${propPairs}))`;
    });
    const javaContent = `// Auto-generated Java Grammar & Order-of-Operations Class (${slug})
import java.util.List;
import java.util.Map;

public final class ${className}Grammar {
    public record CompiledRule(
        String name,
        int precedence,
        String associativity,
        String expression,
        Map<String, String> properties
    ) {}

    public static final String SCHEMA_NAME = ${JSON.stringify(slug)};
    public static final String DIALECT_PRESET = ${JSON.stringify(params.dialect.preset)};

    public static final List<CompiledRule> GRAMMAR_RULES = List.of(
${javaEntries.join(',\n')}
    );
}
`;
    return {
      content: javaContent,
      filename: `${className}Grammar.java`,
      mime: 'text/plain',
      label: 'Java (.java)',
    };
  }

  if (language === 'cpp') {
    const cppEntries = compiledRules.map((r) => {
      const propPairs = Object.entries(r.properties)
        .map(([k, v]) => `{${JSON.stringify(k)}, ${JSON.stringify(v)}}`)
        .join(', ');
      return `    {${JSON.stringify(r.name)}, ${r.precedence}, ${JSON.stringify(r.associativity)}, ${JSON.stringify(r.expression)}, {${propPairs}}},`;
    });
    const cppContent = `// Auto-generated C++20 Grammar & Order-of-Operations Header (${slug})
#pragma once
#include <string>
#include <unordered_map>
#include <vector>

namespace grammar_studio {

struct CompiledGrammarRule {
    std::string name;
    int precedence;
    std::string associativity;
    std::string expression;
    std::unordered_map<std::string, std::string> properties;
};

inline const std::string SCHEMA_NAME = ${JSON.stringify(slug)};
inline const std::string DIALECT_PRESET = ${JSON.stringify(params.dialect.preset)};

inline const std::vector<CompiledGrammarRule> GRAMMAR_RULES = {
${cppEntries.join('\n')}
};

} // namespace grammar_studio
`;
    return {
      content: cppContent,
      filename: `${slug}.hpp`,
      mime: 'text/plain',
      label: 'C++ (.hpp)',
    };
  }

  if (language === 'csharp') {
    const className = slug.replace(/[^A-Za-z0-9]/g, '') || 'GrammarSchema';
    const csEntries = compiledRules.map((r) => {
      const propPairs = Object.entries(r.properties)
        .map(([k, v]) => `[${JSON.stringify(k)}] = ${JSON.stringify(v)}`)
        .join(', ');
      return `        new(${JSON.stringify(r.name)}, ${r.precedence}, ${JSON.stringify(r.associativity)}, ${JSON.stringify(r.expression)}, new Dictionary<string, string> { ${propPairs} }),`;
    });
    const csContent = `// Auto-generated C# (.NET) Grammar & Order-of-Operations Module (${slug})
using System.Collections.Generic;

namespace GrammarStudio;

public sealed record CompiledGrammarRule(
    string Name,
    int Precedence,
    string Associativity,
    string Expression,
    IReadOnlyDictionary<string, string> Properties
);

public static class ${className}Grammar
{
    public const string SchemaName = ${JSON.stringify(slug)};
    public const string DialectPreset = ${JSON.stringify(params.dialect.preset)};

    public static readonly IReadOnlyList<CompiledGrammarRule> Rules = new List<CompiledGrammarRule>
    {
${csEntries.join('\n')}
    };
}
`;
    return {
      content: csContent,
      filename: `${className}Grammar.cs`,
      mime: 'text/plain',
      label: 'C# (.cs)',
    };
  }

  if (language === 'php') {
    const phpEntries = compiledRules.map((r) => {
      const propPairs = Object.entries(r.properties)
        .map(([k, v]) => `${JSON.stringify(k)} => ${JSON.stringify(v)}`)
        .join(', ');
      return `    [\n        'name' => ${JSON.stringify(r.name)},\n        'precedence' => ${r.precedence},\n        'associativity' => ${JSON.stringify(r.associativity)},\n        'expression' => ${JSON.stringify(r.expression)},\n        'properties' => [${propPairs}],\n    ],`;
    });
    const phpContent = `<?php
// Auto-generated PHP 8 Grammar & Order-of-Operations Registry (${slug})
declare(strict_types=1);

const SCHEMA_NAME = ${JSON.stringify(slug)};
const DIALECT_PRESET = ${JSON.stringify(params.dialect.preset)};

const GRAMMAR_RULES = [
${phpEntries.join('\n')}
];
`;
    return {
      content: phpContent,
      filename: `${slug}.php`,
      mime: 'application/x-httpd-php',
      label: 'PHP (.php)',
    };
  }

  if (language === 'sql') {
    const sqlEsc = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const inserts = compiledRules.map(
      (r) =>
        `INSERT INTO grammar_rules (schema_name, dialect_preset, rule_name, precedence, associativity, expression, properties_json)\nVALUES (${sqlEsc(slug)}, ${sqlEsc(params.dialect.preset)}, ${sqlEsc(r.name)}, ${r.precedence}, ${sqlEsc(r.associativity)}, ${sqlEsc(r.expression)}, ${sqlEsc(JSON.stringify(r.properties))});`
    );
    const sqlContent = `-- Auto-generated SQL Grammar & Order-of-Operations Schema (${slug})
CREATE TABLE IF NOT EXISTS grammar_rules (
  schema_name VARCHAR(128) NOT NULL,
  dialect_preset VARCHAR(64) NOT NULL,
  rule_name VARCHAR(128) NOT NULL,
  precedence INTEGER NOT NULL,
  associativity VARCHAR(16) NOT NULL,
  expression TEXT NOT NULL,
  properties_json JSONB NOT NULL,
  PRIMARY KEY (schema_name, rule_name)
);

${inserts.join('\n\n')}
`;
    return {
      content: sqlContent,
      filename: `${slug}.sql`,
      mime: 'application/sql',
      label: 'SQL (.sql)',
    };
  }

  if (language === 'swift') {
    const entries = compiledRules.map((r) => {
      const props = Object.entries(r.properties)
        .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
        .join(', ');
      return `    CompiledGrammarRule(name: ${JSON.stringify(r.name)}, precedence: ${r.precedence}, associativity: ${JSON.stringify(r.associativity)}, expression: ${JSON.stringify(r.expression)}, properties: [${props || ':'}])`;
    });
    return {
      content: `// Auto-generated Swift 6 Grammar & Order-of-Operations Module (${slug})
import Foundation

public struct CompiledGrammarRule: Sendable, Codable {
    public let name: String
    public let precedence: Int
    public let associativity: String
    public let expression: String
    public let properties: [String: String]
}

public enum ${slug.replace(/[^A-Za-z0-9]/g, '') || 'Grammar'}Schema {
    public static let schemaName = ${JSON.stringify(slug)}
    public static let dialectPreset = ${JSON.stringify(params.dialect.preset)}
    public static let rules: [CompiledGrammarRule] = [
${entries.join(',\n')}
    ]
}
`,
      filename: `${slug}.swift`,
      mime: 'text/plain',
      label: 'Swift (.swift)',
    };
  }

  if (language === 'kotlin') {
    const entries = compiledRules.map((r) => {
      const props = Object.entries(r.properties)
        .map(([k, v]) => `${JSON.stringify(k)} to ${JSON.stringify(v)}`)
        .join(', ');
      return `    CompiledGrammarRule(${JSON.stringify(r.name)}, ${r.precedence}, ${JSON.stringify(r.associativity)}, ${JSON.stringify(r.expression)}, mapOf(${props}))`;
    });
    return {
      content: `// Auto-generated Kotlin Grammar & Order-of-Operations Module (${slug})
package grammar.studio

data class CompiledGrammarRule(
    val name: String,
    val precedence: Int,
    val associativity: String,
    val expression: String,
    val properties: Map<String, String>
)

object ${slug.replace(/[^A-Za-z0-9]/g, '') || 'Grammar'}Schema {
    const val SCHEMA_NAME = ${JSON.stringify(slug)}
    const val DIALECT_PRESET = ${JSON.stringify(params.dialect.preset)}
    val RULES: List<CompiledGrammarRule> = listOf(
${entries.join(',\n')}
    )
}
`,
      filename: `${slug}.kt`,
      mime: 'text/plain',
      label: 'Kotlin (.kt)',
    };
  }

  if (language === 'ruby') {
    const entries = compiledRules.map((r) => {
      const props = Object.entries(r.properties)
        .map(([k, v]) => `${JSON.stringify(k)} => ${JSON.stringify(v)}`)
        .join(', ');
      return `    { name: ${JSON.stringify(r.name)}, precedence: ${r.precedence}, associativity: ${JSON.stringify(r.associativity)}, expression: ${JSON.stringify(r.expression)}, properties: { ${props} } }`;
    });
    return {
      content: `# frozen_string_literal: true
# Auto-generated Ruby 3 Grammar & Order-of-Operations Module (${slug})
module GrammarStudio
  SCHEMA_NAME = ${JSON.stringify(slug)}
  DIALECT_PRESET = ${JSON.stringify(params.dialect.preset)}

  GRAMMAR_RULES = [
${entries.join(',\n')}
  ].freeze
end
`,
      filename: `${slug}.rb`,
      mime: 'text/plain',
      label: 'Ruby (.rb)',
    };
  }

  if (language === 'scala') {
    const entries = compiledRules.map((r) => {
      const props = Object.entries(r.properties)
        .map(([k, v]) => `${JSON.stringify(k)} -> ${JSON.stringify(v)}`)
        .join(', ');
      return `    CompiledGrammarRule(${JSON.stringify(r.name)}, ${r.precedence}, ${JSON.stringify(r.associativity)}, ${JSON.stringify(r.expression)}, Map(${props}))`;
    });
    return {
      content: `// Auto-generated Scala 3 Grammar & Order-of-Operations Module (${slug})
package grammar.studio

final case class CompiledGrammarRule(
  name: String,
  precedence: Int,
  associativity: String,
  expression: String,
  properties: Map[String, String]
)

object ${slug.replace(/[^A-Za-z0-9]/g, '') || 'Grammar'}Schema:
  val schemaName: String = ${JSON.stringify(slug)}
  val dialectPreset: String = ${JSON.stringify(params.dialect.preset)}
  val rules: List[CompiledGrammarRule] = List(
${entries.join(',\n')}
  )
`,
      filename: `${slug}.scala`,
      mime: 'text/plain',
      label: 'Scala (.scala)',
    };
  }

  if (language === 'haskell') {
    const entries = compiledRules.map((r) => {
      const props = Object.entries(r.properties)
        .map(([k, v]) => `(${JSON.stringify(k)}, ${JSON.stringify(v)})`)
        .join(', ');
      return `  CompiledRule ${JSON.stringify(r.name)} ${r.precedence} ${JSON.stringify(r.associativity)} ${JSON.stringify(r.expression)} [${props}]`;
    });
    return {
      content: `-- Auto-generated Haskell Grammar & Order-of-Operations Module (${slug})
module GrammarStudio where

data CompiledRule = CompiledRule
  { ruleName :: String
  , rulePrecedence :: Int
  , ruleAssociativity :: String
  , ruleExpression :: String
  , ruleProperties :: [(String, String)]
  } deriving (Show, Eq)

schemaName :: String
schemaName = ${JSON.stringify(slug)}

dialectPreset :: String
dialectPreset = ${JSON.stringify(params.dialect.preset)}

grammarRules :: [CompiledRule]
grammarRules =
  [
${entries.join('\n  , ')}
  ]
`,
      filename: `${slug}.hs`,
      mime: 'text/plain',
      label: 'Haskell (.hs)',
    };
  }

  if (language === 'elixir') {
    const entries = compiledRules.map((r) => {
      const props = Object.entries(r.properties)
        .map(([k, v]) => `${JSON.stringify(k)} => ${JSON.stringify(v)}`)
        .join(', ');
      return `    %{name: ${JSON.stringify(r.name)}, precedence: ${r.precedence}, associativity: ${JSON.stringify(r.associativity)}, expression: ${JSON.stringify(r.expression)}, properties: %{${props}}}`;
    });
    return {
      content: `# Auto-generated Elixir Grammar & Order-of-Operations Module (${slug})
defmodule GrammarStudio.Schema do
  @schema_name ${JSON.stringify(slug)}
  @dialect_preset ${JSON.stringify(params.dialect.preset)}

  def schema_name, do: @schema_name
  def dialect_preset, do: @dialect_preset

  def grammar_rules do
    [
${entries.join(',\n')}
    ]
  end
end
`,
      filename: `${slug}.ex`,
      mime: 'text/plain',
      label: 'Elixir (.ex)',
    };
  }

  if (language === 'lua') {
    const entries = compiledRules.map((r) => {
      const props = Object.entries(r.properties)
        .map(([k, v]) => `[${JSON.stringify(k)}] = ${JSON.stringify(v)}`)
        .join(', ');
      return `  { name = ${JSON.stringify(r.name)}, precedence = ${r.precedence}, associativity = ${JSON.stringify(r.associativity)}, expression = ${JSON.stringify(r.expression)}, properties = { ${props} } }`;
    });
    return {
      content: `-- Auto-generated Lua 5.4 Grammar & Order-of-Operations Module (${slug})
local M = {}

M.SCHEMA_NAME = ${JSON.stringify(slug)}
M.DIALECT_PRESET = ${JSON.stringify(params.dialect.preset)}
M.GRAMMAR_RULES = {
${entries.join(',\n')}
}

return M
`,
      filename: `${slug}.lua`,
      mime: 'text/plain',
      label: 'Lua (.lua)',
    };
  }

  if (language === 'zig') {
    const entries = compiledRules.map(
      (r) =>
        `    .{ .name = ${JSON.stringify(r.name)}, .precedence = ${r.precedence}, .associativity = ${JSON.stringify(r.associativity)}, .expression = ${JSON.stringify(r.expression)} },`
    );
    return {
      content: `// Auto-generated Zig Grammar & Order-of-Operations Module (${slug})
pub const CompiledGrammarRule = struct {
    name: []const u8,
    precedence: u32,
    associativity: []const u8,
    expression: []const u8,
};

pub const SCHEMA_NAME: []const u8 = ${JSON.stringify(slug)};
pub const DIALECT_PRESET: []const u8 = ${JSON.stringify(params.dialect.preset)};

pub const GRAMMAR_RULES = [_]CompiledGrammarRule{
${entries.join('\n')}
};
`,
      filename: `${slug}.zig`,
      mime: 'text/plain',
      label: 'Zig (.zig)',
    };
  }

  if (language === 'dart') {
    const entries = compiledRules.map((r) => {
      const props = Object.entries(r.properties)
        .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
        .join(', ');
      return `  CompiledGrammarRule(name: ${JSON.stringify(r.name)}, precedence: ${r.precedence}, associativity: ${JSON.stringify(r.associativity)}, expression: ${JSON.stringify(r.expression)}, properties: {${props}}),`;
    });
    return {
      content: `// Auto-generated Dart 3 Grammar & Order-of-Operations Module (${slug})
class CompiledGrammarRule {
  final String name;
  final int precedence;
  final String associativity;
  final String expression;
  final Map<String, String> properties;
  const CompiledGrammarRule({
    required this.name,
    required this.precedence,
    required this.associativity,
    required this.expression,
    required this.properties,
  });
}

const String schemaName = ${JSON.stringify(slug)};
const String dialectPreset = ${JSON.stringify(params.dialect.preset)};

const List<CompiledGrammarRule> grammarRules = [
${entries.join('\n')}
];
`,
      filename: `${slug}.dart`,
      mime: 'text/plain',
      label: 'Dart (.dart)',
    };
  }

  if (language === 'ocaml') {
    const entries = compiledRules.map((r) => {
      const props = Object.entries(r.properties)
        .map(([k, v]) => `(${JSON.stringify(k)}, ${JSON.stringify(v)})`)
        .join('; ');
      return `  { name = ${JSON.stringify(r.name)}; precedence = ${r.precedence}; associativity = ${JSON.stringify(r.associativity)}; expression = ${JSON.stringify(r.expression)}; properties = [${props}] }`;
    });
    return {
      content: `(* Auto-generated OCaml Grammar & Order-of-Operations Module (${slug}) *)
type compiled_rule = {
  name : string;
  precedence : int;
  associativity : string;
  expression : string;
  properties : (string * string) list;
}

let schema_name = ${JSON.stringify(slug)}
let dialect_preset = ${JSON.stringify(params.dialect.preset)}

let grammar_rules : compiled_rule list = [
${entries.join(';\n')}
]
`,
      filename: `${slug}.ml`,
      mime: 'text/plain',
      label: 'OCaml (.ml)',
    };
  }

  const tsContent = `// Auto-generated TypeScript Grammar & Order-of-Operations Module (${slug})
export interface CompiledGrammarRule {
  name: string;
  precedence: number;
  associativity: 'left' | 'right' | 'none';
  expression: string;
  alternatives: string[];
  properties: Record<string, string>;
}

export const SCHEMA_NAME = '${slug}';
export const DIALECT_PRESET = '${params.dialect.preset}';

export const GRAMMAR_RULES: CompiledGrammarRule[] = ${JSON.stringify(compiledRules, null, 2)};

export function getRuleOrderOfOperations(): string[] {
  return [...GRAMMAR_RULES]
    .sort((a, b) => a.precedence - b.precedence)
    .map((rule) => rule.name);
}
`;
  return {
    content: tsContent,
    filename: `${slug}.ts`,
    mime: 'text/typescript',
    label: 'TypeScript (.ts)',
  };
}

/* ============================================================================
 * 2. LINE-BY-LINE MUTATION CALCULATOR
 * ========================================================================== */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractLiteralAlternationFromRegex(pattern: string): string[] | null {
  let raw = pattern.trim();
  if (!raw) return null;
  if (raw.startsWith('/') && raw.lastIndexOf('/') > 0) {
    raw = raw.slice(1, raw.lastIndexOf('/'));
  }
  if (!raw.startsWith('^') || !raw.endsWith('$')) return null;
  let inner = raw.slice(1, -1);
  if (inner.startsWith('(') && inner.endsWith(')')) {
    inner = inner.slice(1, -1);
  }
  if (!inner) return null;

  const branches: string[] = [];
  let current = '';
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === '\\') {
      if (i + 1 >= inner.length) return null;
      const next = inner[i + 1];
      // Reject regex shorthand character classes (\d, \w, \s, \D, \W, \S, \b, \B)
      if (/[dwsDWSbB]/.test(next)) return null;
      current += next;
      i += 1;
      continue;
    }
    if (ch === '|') {
      if (!current) return null;
      branches.push(current);
      current = '';
      continue;
    }
    // Reject unescaped regex metacharacters
    if (/[.*+?()[\]{}^$]/.test(ch)) return null;
    current += ch;
  }
  if (!current) return null;
  branches.push(current);
  return branches.length > 0 ? branches : null;
}

export function inferLineMutations(
  rules: GrammarRule[],
  existing: Record<string, LineMutation> = {},
  prevRules?: GrammarRule[]
): Record<string, LineMutation> {
  const next: Record<string, LineMutation> = {};
  const prevRuleMap = new Map<string, GrammarRule>();
  if (prevRules) {
    for (const pr of prevRules) prevRuleMap.set(pr.name, pr);
  }

  for (const rule of rules) {
    const prev = existing[rule.name];
    const allNumericLiterals =
      rule.literals.length > 0 &&
      rule.referencedRules.length === 0 &&
      rule.literals.every((l) => /^\d+(\.\d+)?$/.test(l));

    const inferredPattern =
      rule.literals.length > 0 && rule.referencedRules.length === 0
        ? `^(${rule.literals.map(escapeRegex).join('|')})$`
        : '';

    if (prev) {
      const prevRule = prevRuleMap.get(rule.name);
      const prevInferredPattern =
        prevRule && prevRule.literals.length > 0 && prevRule.referencedRules.length === 0
          ? `^(${prevRule.literals.map(escapeRegex).join('|')})$`
          : '';
      const expressionChanged = Boolean(prevRule && prevRule.expression !== rule.expression);
      const wasAutoPattern =
        !prev.patternOverride.trim() || prev.patternOverride.trim() === prevInferredPattern;

      next[rule.name] = {
        ...prev,
        ruleName: rule.name,
        patternOverride: expressionChanged && wasAutoPattern ? inferredPattern : prev.patternOverride,
        jsonType: expressionChanged && wasAutoPattern && allNumericLiterals ? 'number' : prev.jsonType,
        description: `Compiled from grammar rule '${rule.name}' (${rule.alternatives.length} branch${rule.alternatives.length === 1 ? '' : 'es'})`,
      };
    } else {
      next[rule.name] = {
        ruleName: rule.name,
        targetProperty: rule.name,
        jsonType: allNumericLiterals ? 'number' : 'string',
        patternOverride: inferredPattern,
        description: `Compiled from grammar rule '${rule.name}' (${rule.alternatives.length} branch${rule.alternatives.length === 1 ? '' : 'es'})`,
        enabled: true,
      };
    }
  }

  return next;
}

/* ============================================================================
 * 3. BIDIRECTIONAL GRAMMAR <-> SCHEMA.ORG JSON-LD + GENERATED SCHEMA
 * ========================================================================== */

export function grammarToSchemaJson(
  rules: GrammarRule[],
  dialect: DialectConfig,
  schemaConfig: SchemaConfig,
  mutations: Record<string, LineMutation>,
  mutationPolicy: MutationPolicy = DEFAULT_MUTATION_POLICY,
  ruleConfigs: Record<string, RuleOrderConfig> = {}
): string {
  const slugName = schemaConfig.schemaName.trim() || 'CustomGrammarSchema';
  const defs: Record<string, Record<string, unknown>> = {};
  const definedTerms: Array<Record<string, unknown>> = [];

  for (let idx = 0; idx < rules.length; idx += 1) {
    const rule = rules[idx];
    const isLocked = mutationPolicy.lockedRules.includes(rule.name);
    const mut = mutations[rule.name];
    const cfg = ruleConfigs[rule.name];
    const applyMut = Boolean(mut?.enabled && !isLocked);
    const propName = applyMut && mut.targetProperty.trim() ? mut.targetProperty.trim() : rule.name;
    const cleanExpr = normalizeExpressionQuotes(rule.expression);
    const cleanAlts = rule.alternatives.map(normalizeExpressionQuotes);
    const precedence = cfg?.precedence ?? idx + 1;
    const associativity = cfg?.associativity ?? 'left';

    const additionalProperties: Array<Record<string, unknown>> = [
      { '@type': 'PropertyValue', name: 'expression', value: cleanExpr },
      { '@type': 'PropertyValue', name: 'alternatives', value: cleanAlts },
      { '@type': 'PropertyValue', name: 'references', value: rule.referencedRules },
      { '@type': 'PropertyValue', name: 'precedence', value: precedence },
      { '@type': 'PropertyValue', name: 'associativity', value: associativity },
      ...(rule.constraints && rule.constraints.length > 0
        ? [{ '@type': 'PropertyValue', name: 'constraints', value: rule.constraints.map((c) => c.raw) }]
        : []),
    ];

    for (const customProp of cfg?.properties || []) {
      if (customProp.name.trim()) {
        additionalProperties.push({
          '@type': 'PropertyValue',
          name: customProp.name.trim(),
          value: customProp.value,
        });
      }
    }

    const termEntry: Record<string, unknown> = {
      '@type': 'DefinedTerm',
      termCode: propName,
      name: rule.name,
      description: mut?.description || `Production rule at line ${rule.lineNumber}`,
      inDefinedTermSet: slugName,
      'x-locked': isLocked,
      'x-order-of-operations': {
        precedence,
        associativity,
      },
      additionalProperty: additionalProperties,
    };

    if (schemaConfig.includePotentialActions && cleanAlts.length > 1) {
      termEntry.potentialAction = {
        '@type': 'ChooseAction',
        name: `Select branch for ${propName}`,
        actionOption: cleanAlts,
      };
    }

    definedTerms.push(termEntry);

    if (schemaConfig.includeJsonSchemaDefs) {
      const defObj: Record<string, unknown> = {
        type: applyMut ? mut.jsonType : 'string',
        description: mut?.description || cleanExpr,
        'x-grammar-rule': rule.name,
        'x-grammar-expression': cleanExpr,
        'x-mutation-locked': isLocked,
        'x-order-of-operations': {
          precedence,
          associativity,
        },
      };
      if (applyMut && mut.patternOverride) {
        defObj.pattern = mut.patternOverride;
      } else if (rule.literals.length > 0 && rule.referencedRules.length === 0) {
        defObj.enum = rule.literals;
      }
      if (rule.constraints && rule.constraints.length > 0) {
        defObj['x-constraints'] = rule.constraints;
        for (const c of rule.constraints) {
          if (c.kind === 'minLength') defObj.minLength = Number(c.value);
          else if (c.kind === 'maxLength') defObj.maxLength = Number(c.value);
          else if (c.kind === 'min') {
            defObj.minimum = Number(c.value);
            if (!applyMut) defObj.type = 'number';
          } else if (c.kind === 'max') {
            defObj.maximum = Number(c.value);
            if (!applyMut) defObj.type = 'number';
          } else if (c.kind === 'exclusiveMin') {
            defObj.exclusiveMinimum = Number(c.value);
            if (!applyMut) defObj.type = 'number';
          } else if (c.kind === 'exclusiveMax') {
            defObj.exclusiveMaximum = Number(c.value);
            if (!applyMut) defObj.type = 'number';
          } else if (c.kind === 'multipleOf') {
            defObj.multipleOf = Number(c.value);
            if (!applyMut) defObj.type = 'number';
          } else if (c.kind === 'pattern' && !defObj.pattern) {
            defObj.pattern = String(c.value);
          } else if (c.kind === 'format') {
            defObj.format = String(c.value);
          }
        }
      }
      defs[propName] = defObj;
    }
  }

  const root: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': schemaConfig.schemaOrgType.trim() || 'DefinedTermSet',
    name: slugName,
    $schema: schemaConfig.schemaStoreDraft.trim() || 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://grammar2json.studio/schemas/${encodeURIComponent(slugName)}.schema.json`,
    'x-dialect': {
      preset: dialect.preset,
      ruleOperator: dialect.ruleOperator,
      choiceDelimiter: dialect.choiceDelimiter,
      commentPrefix: dialect.commentPrefix,
    },
    'x-mutation-policy': {
      allowImportMutation: mutationPolicy.allowImportMutation,
      allowExportMutation: mutationPolicy.allowExportMutation,
      allowedTargets: mutationPolicy.allowedTargets,
      lockedRules: mutationPolicy.lockedRules,
    },
    hasDefinedTerm: definedTerms,
  };

  if (schemaConfig.preset === 'softwareSource') {
    root.programmingLanguage = dialect.preset.toUpperCase();
    root.codeRepository = 'grammar2json-studio';
  }

  if (schemaConfig.includeJsonSchemaDefs) {
    root.$defs = defs;
  }

  return JSON.stringify(root, null, 2);
}

export function schemaJsonToGrammar(
  jsonText: string,
  fallbackDialect: DialectConfig
):
  | {
      ok: true;
      grammar: string;
      dialect: DialectConfig;
      schemaName?: string;
      schemaType?: string;
      mutationPolicy?: MutationPolicy;
      mutations?: Record<string, LineMutation>;
    }
  | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const sourceDoc =
      parsed['x-package-format'] === 'grammar2json-ld-package/v2' &&
      parsed.schemaDocument &&
      typeof parsed.schemaDocument === 'object'
        ? (parsed.schemaDocument as Record<string, unknown>)
        : parsed;

    const rawDialect = (sourceDoc['x-dialect'] || parsed['x-source-dialect'] || {}) as Partial<DialectConfig>;
    const dialect: DialectConfig = {
      preset: rawDialect.preset || fallbackDialect.preset,
      ruleOperator:
        rawDialect.ruleOperator !== undefined
          ? String(rawDialect.ruleOperator)
          : fallbackDialect.ruleOperator,
      choiceDelimiter: rawDialect.choiceDelimiter || fallbackDialect.choiceDelimiter,
      commentPrefix: rawDialect.commentPrefix || fallbackDialect.commentPrefix,
    };

    const rawPolicy = (sourceDoc['x-mutation-policy'] || parsed['x-mutation-policy']) as
      | Partial<MutationPolicy>
      | undefined;
    const mutationPolicy: MutationPolicy | undefined = rawPolicy
      ? {
          allowImportMutation: rawPolicy.allowImportMutation ?? true,
          allowExportMutation: rawPolicy.allowExportMutation ?? true,
          allowedTargets: Array.isArray(rawPolicy.allowedTargets)
            ? (rawPolicy.allowedTargets as TransformTarget[])
            : ['jsonld', 'python', 'rust', 'wasm'],
          lockedRules: Array.isArray(rawPolicy.lockedRules) ? rawPolicy.lockedRules.map(String) : [],
        }
      : undefined;

    const lines: string[] = [];
    const schemaName = typeof sourceDoc.name === 'string' ? sourceDoc.name : undefined;
    const schemaType = typeof sourceDoc['@type'] === 'string' ? sourceDoc['@type'] : undefined;

    if (schemaName) {
      lines.push(`${dialect.commentPrefix} Synced from Schema.org ${schemaType || 'DefinedTermSet'}: ${schemaName}`);
    }

    const terms = Array.isArray(sourceDoc.hasDefinedTerm) ? sourceDoc.hasDefinedTerm : [];
    if (terms.length > 0) {
      for (const item of terms) {
        if (!item || typeof item !== 'object') continue;
        const term = item as Record<string, unknown>;
        const name = String(term.name || term.termCode || '').trim();
        let expression = '';
        let constraintComment = '';
        if (Array.isArray(term.additionalProperty)) {
          const exprProp = term.additionalProperty.find(
            (p) => p && typeof p === 'object' && (p as Record<string, unknown>).name === 'expression'
          ) as Record<string, unknown> | undefined;
          if (exprProp && typeof exprProp.value === 'string') {
            expression = exprProp.value;
          }
          const constrProp = term.additionalProperty.find(
            (p) => p && typeof p === 'object' && (p as Record<string, unknown>).name === 'constraints'
          ) as Record<string, unknown> | undefined;
          if (constrProp && Array.isArray(constrProp.value) && constrProp.value.length > 0) {
            constraintComment = ` (* ${constrProp.value.map(String).join(', ')} *)`;
          }
        }
        if (!expression && term.potentialAction && typeof term.potentialAction === 'object') {
          const opts = (term.potentialAction as Record<string, unknown>).actionOption;
          if (Array.isArray(opts)) {
            expression = opts.map(String).join(` ${dialect.choiceDelimiter} `);
          }
        }
        if (name && expression) {
          lines.push(`${formatGrammarRuleLine(name, expression, dialect.ruleOperator)}${constraintComment}`);
        }
      }
    } else if (sourceDoc.$defs && typeof sourceDoc.$defs === 'object') {
      for (const [key, val] of Object.entries(sourceDoc.$defs as Record<string, unknown>)) {
        if (!val || typeof val !== 'object') continue;
        const def = val as Record<string, unknown>;
        if (typeof def['x-grammar-expression'] === 'string') {
          lines.push(
            formatGrammarRuleLine(
              key,
              normalizeExpressionQuotes(def['x-grammar-expression']),
              dialect.ruleOperator
            )
          );
        } else if (Array.isArray(def.enum)) {
          const alts = def.enum
            .map((v) => {
              const s = String(v);
              return !s.includes("'") ? `'${s}'` : JSON.stringify(s);
            })
            .join(` ${dialect.choiceDelimiter} `);
          lines.push(formatGrammarRuleLine(key, alts, dialect.ruleOperator));
        }
      }
    }

    // Extract line mutations from JSON Schema $defs if present
    const extractedMutations: Record<string, LineMutation> = {};
    if (sourceDoc.$defs && typeof sourceDoc.$defs === 'object') {
      for (const [key, val] of Object.entries(sourceDoc.$defs as Record<string, unknown>)) {
        if (!val || typeof val !== 'object') continue;
        const def = val as Record<string, unknown>;
        const sourceRuleName =
          typeof def['x-grammar-rule'] === 'string' && def['x-grammar-rule'].trim()
            ? def['x-grammar-rule'].trim()
            : typeof def['x-source-rule'] === 'string' && def['x-source-rule'].trim()
              ? def['x-source-rule'].trim()
              : key;
        const jType =
          def.type === 'number' ||
          def.type === 'boolean' ||
          def.type === 'object' ||
          def.type === 'array' ||
          def.type === 'string'
            ? def.type
            : 'string';
        extractedMutations[sourceRuleName] = {
          ruleName: sourceRuleName,
          targetProperty: key,
          jsonType: jType,
          patternOverride: typeof def.pattern === 'string' ? def.pattern : '',
          description: typeof def.description === 'string' ? def.description : `Rule ${sourceRuleName}`,
          enabled: true,
        };
      }
    }

    return {
      ok: true,
      grammar: lines.join('\n'),
      dialect,
      schemaName,
      schemaType,
      mutationPolicy,
      mutations: Object.keys(extractedMutations).length > 0 ? extractedMutations : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid JSON payload',
    };
  }
}

export function buildJsonLdSchemaPackage(params: {
  dialect: DialectConfig;
  schemaConfig: SchemaConfig;
  mutationPolicy: MutationPolicy;
  grammarText: string;
  jsonText: string;
  selectedTargets: TransformTarget[];
  pythonSource: string;
  pythonAst: PythonAstNode;
  rustSource: string;
  rustAst: RustAstModule;
  watSource: string;
  wasmResult: WasmCompilationResult;
}): JsonLdSchemaPackage {
  let schemaDocument: Record<string, unknown> = {};
  try {
    schemaDocument = JSON.parse(params.jsonText) as Record<string, unknown>;
  } catch {
    schemaDocument = { error: 'Schema JSON was invalid at packaging time' };
  }

  const allowedSet = new Set(
    params.selectedTargets.filter((t) => params.mutationPolicy.allowedTargets.includes(t))
  );

  const artifacts: JsonLdSchemaPackage['artifacts'] = {
    grammar: params.grammarText,
  };
  if (allowedSet.has('python')) {
    artifacts.python = { source: params.pythonSource, ast: params.pythonAst };
  }
  if (allowedSet.has('rust')) {
    artifacts.rust = { source: params.rustSource, ast: params.rustAst };
  }
  if (allowedSet.has('wasm')) {
    artifacts.wasm = {
      wat: params.watSource,
      byteLength: params.wasmResult.sizeBytes,
      valid: params.wasmResult.valid,
      ast: params.wasmResult.astJson,
    };
  }

  const slug = params.schemaConfig.schemaName.trim() || 'CustomGrammarSchema';
  return {
    '@context': 'https://schema.org',
    '@type': params.schemaConfig.schemaOrgType || 'DefinedTermSet',
    name: slug,
    $schema: params.schemaConfig.schemaStoreDraft,
    $id: `https://grammar2json.studio/packages/${encodeURIComponent(slug)}.jsonld`,
    'x-package-format': 'grammar2json-ld-package/v2',
    'x-generated-at': new Date().toISOString(),
    'x-source-dialect': params.dialect,
    'x-mutation-policy': params.mutationPolicy,
    schemaDocument,
    artifacts,
  };
}

/* ============================================================================
 * 4. RECURSIVE GRAMMAR EVALUATOR WITH EBNF/PEG REPETITIONS, CHOICES,
 *    LOOKAHEAD, LOOKBEHIND, CHAR CLASSES & BACKTRACKING TRACE
 * ========================================================================== */

type GrammarExprNode =
  | { type: 'Literal'; value: string }
  | { type: 'RuleRef'; name: string }
  | { type: 'Wildcard' }
  | { type: 'Anchor'; kind: 'start' | 'end' }
  | { type: 'CharClass'; raw: string; regex: RegExp }
  | { type: 'RegexTerm'; raw: string; regex: RegExp }
  | { type: 'Sequence'; items: GrammarExprNode[] }
  | { type: 'Choice'; branches: GrammarExprNode[] }
  | { type: 'Repeat'; node: GrammarExprNode; min: number; max: number; lazy: boolean; label: string }
  | { type: 'Lookahead'; node: GrammarExprNode; positive: boolean; raw: string }
  | { type: 'Lookbehind'; node: GrammarExprNode; positive: boolean; raw: string };

interface MatchOutcome {
  endPos: number;
  trace: EvaluationTraceStep[];
}

function unescapeGrammarLiteral(raw: string): string {
  return raw.replace(/\\([nrt\\'"bfv])/g, (_, ch: string) => {
    switch (ch) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case 'v':
        return '\v';
      default:
        return ch;
    }
  });
}

function parseGrammarExprAst(
  input: string,
  definedRules: Set<string>,
  symbols: ResolvedGrammarSymbols = resolveGrammarSymbols(),
  choiceDelim = '|'
): GrammarExprNode | null {
  const src = input.trim();
  if (!src) return null;
  let pos = 0;

  const groupPair = pairDelimiters(symbols.groupParens);
  const bracketPair = pairDelimiters(symbols.charClassBrackets);
  const bracePair = pairDelimiters(symbols.repeatBraces);
  const activeChoiceDelim = choiceDelim.trim() || '|';

  const skipWs = () => {
    while (pos < src.length && (/\s/.test(src[pos]) || src[pos] === ',')) {
      pos += 1;
    }
  };

  function isAtChoiceSeparator(): boolean {
    if (pos >= src.length) return false;
    if (activeChoiceDelim !== '/' && src.startsWith(activeChoiceDelim, pos)) {
      return true;
    }
    if (src[pos] === '|') return true;
    // Support PEG `/` choice when separated by whitespace (distinguished from inline `/regex/`)
    if (
      src[pos] === '/' &&
      (pos === 0 || /\s/.test(src[pos - 1])) &&
      (pos + 1 >= src.length || /\s/.test(src[pos + 1]))
    ) {
      return true;
    }
    return false;
  }

  function consumeChoiceSeparator(): boolean {
    if (activeChoiceDelim !== '/' && src.startsWith(activeChoiceDelim, pos)) {
      pos += activeChoiceDelim.length;
      return true;
    }
    if (src[pos] === '|') {
      pos += 1;
      return true;
    }
    if (
      src[pos] === '/' &&
      (pos === 0 || /\s/.test(src[pos - 1])) &&
      (pos + 1 >= src.length || /\s/.test(src[pos + 1]))
    ) {
      pos += 1;
      return true;
    }
    return false;
  }

  function parseChoice(): GrammarExprNode | null {
    const first = parseSequence();
    if (!first) return null;
    const branches: GrammarExprNode[] = [first];
    while (true) {
      skipWs();
      if (isAtChoiceSeparator() && consumeChoiceSeparator()) {
        const next = parseSequence();
        if (next) branches.push(next);
        continue;
      }
      break;
    }
    return branches.length === 1 ? branches[0] : { type: 'Choice', branches };
  }

  function parseSequence(): GrammarExprNode | null {
    const items: GrammarExprNode[] = [];
    while (pos < src.length) {
      skipWs();
      if (pos >= src.length) break;
      const ch = src[pos];
      if (
        (groupPair && ch === groupPair[1]) ||
        (bracketPair && ch === bracketPair[1]) ||
        (bracePair && ch === bracePair[1]) ||
        ch === ')' ||
        isAtChoiceSeparator()
      ) {
        break;
      }
      const item = parsePrefix();
      if (!item) {
        pos += 1;
        continue;
      }
      items.push(item);
    }
    if (items.length === 0) return null;
    return items.length === 1 ? items[0] : { type: 'Sequence', items };
  }

  function parsePrefix(): GrammarExprNode | null {
    skipWs();
    if (pos >= src.length) return null;

    if (symbols.posLookahead && src.startsWith(symbols.posLookahead, pos)) {
      const start = pos;
      pos += symbols.posLookahead.length;
      const operand = parsePostfix();
      if (!operand) return null;
      return { type: 'Lookahead', node: operand, positive: true, raw: src.slice(start, pos).trim() };
    }
    if (symbols.negLookahead && src.startsWith(symbols.negLookahead, pos)) {
      const start = pos;
      pos += symbols.negLookahead.length;
      const operand = parsePostfix();
      if (!operand) return null;
      return { type: 'Lookahead', node: operand, positive: false, raw: src.slice(start, pos).trim() };
    }
    return parsePostfix();
  }

  function parsePostfix(): GrammarExprNode | null {
    let node = parseAtom();
    if (!node) return null;

    while (pos < src.length) {
      // Check configured repetition symbols (longer multi-char tokens first)
      const postfixCandidates: Array<{
        tok: string;
        min: number;
        max: number;
      }> = [];
      if (symbols.oneOrMore) postfixCandidates.push({ tok: symbols.oneOrMore, min: 1, max: Infinity });
      if (symbols.zeroOrMore) postfixCandidates.push({ tok: symbols.zeroOrMore, min: 0, max: Infinity });
      if (symbols.optional) postfixCandidates.push({ tok: symbols.optional, min: 0, max: 1 });
      postfixCandidates.sort((a, b) => b.tok.length - a.tok.length);

      let matchedPostfix = false;
      for (const cand of postfixCandidates) {
        if (src.startsWith(cand.tok, pos)) {
          pos += cand.tok.length;
          let lazy = false;
          if (symbols.optional && src.startsWith(symbols.optional, pos)) {
            lazy = true;
            pos += symbols.optional.length;
          }
          node = {
            type: 'Repeat',
            node,
            min: cand.min,
            max: cand.max,
            lazy,
            label: `${cand.tok}${lazy ? symbols.optional : ''}`,
          };
          matchedPostfix = true;
          break;
        }
      }
      if (matchedPostfix) continue;

      // Bounded quantifier {m}, {m,}, {m,n} (controlled by repeatBraces symbol definition)
      if (bracePair && src[pos] === bracePair[0]) {
        const rest = src.slice(pos);
        const escOpen = bracePair[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escClose = bracePair[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const qMatch = rest.match(new RegExp(`^${escOpen}\\s*(\\d+)(?:\\s*,\\s*(\\d*))?\\s*${escClose}(\\?)?`));
        if (qMatch) {
          pos += qMatch[0].length;
          const min = Number(qMatch[1]);
          const max =
            qMatch[2] === undefined ? min : qMatch[2] === '' ? Infinity : Math.max(min, Number(qMatch[2]));
          const lazy = Boolean(qMatch[3]);
          node = { type: 'Repeat', node, min, max, lazy, label: qMatch[0] };
          continue;
        }
      }
      break;
    }

    return node;
  }

  function parseAtom(): GrammarExprNode | null {
    skipWs();
    if (pos >= src.length) return null;
    const ch = src[pos];

    // String literal '...' or "..."
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let raw = '';
      pos += 1;
      while (pos < src.length && src[pos] !== quote) {
        if (src[pos] === '\\' && pos + 1 < src.length) {
          raw += `\\${src[pos + 1]}`;
          pos += 2;
        } else {
          raw += src[pos];
          pos += 1;
        }
      }
      if (pos < src.length && src[pos] === quote) pos += 1;
      return { type: 'Literal', value: unescapeGrammarLiteral(raw) };
    }

    // Lookbehind openers controlled by posLookbehind / negLookbehind
    if (symbols.posLookbehind && src.startsWith(symbols.posLookbehind, pos)) {
      const start = pos;
      pos += symbols.posLookbehind.length;
      const inner = parseChoice();
      skipWs();
      if (pos < src.length && src[pos] === ')') pos += 1;
      if (!inner) return null;
      return { type: 'Lookbehind', node: inner, positive: true, raw: src.slice(start, pos) };
    }
    if (symbols.negLookbehind && src.startsWith(symbols.negLookbehind, pos)) {
      const start = pos;
      pos += symbols.negLookbehind.length;
      const inner = parseChoice();
      skipWs();
      if (pos < src.length && src[pos] === ')') pos += 1;
      if (!inner) return null;
      return { type: 'Lookbehind', node: inner, positive: false, raw: src.slice(start, pos) };
    }

    // Parenthesized lookahead (?=...) / (?!...) or group (...) controlled by groupParens & lookahead symbols
    if (ch === '(' && (groupPair || symbols.posLookahead || symbols.negLookahead)) {
      if (symbols.posLookahead && src.startsWith('(?=', pos)) {
        const start = pos;
        pos += 3;
        const inner = parseChoice();
        skipWs();
        if (pos < src.length && src[pos] === ')') pos += 1;
        return inner ? { type: 'Lookahead', node: inner, positive: true, raw: src.slice(start, pos) } : null;
      }
      if (symbols.negLookahead && src.startsWith('(?!', pos)) {
        const start = pos;
        pos += 3;
        const inner = parseChoice();
        skipWs();
        if (pos < src.length && src[pos] === ')') pos += 1;
        return inner ? { type: 'Lookahead', node: inner, positive: false, raw: src.slice(start, pos) } : null;
      }
    }

    if (groupPair && ch === groupPair[0]) {
      pos += 1;
      if (src.startsWith('?:', pos)) pos += 2;
      const inner = parseChoice();
      skipWs();
      if (pos < src.length && src[pos] === groupPair[1]) pos += 1;
      return inner;
    }

    // Brackets: distinguish EBNF optional [ expr ] vs Character Class [0-9] / [^a-z]
    if (bracketPair && ch === bracketPair[0]) {
      const closeChar = bracketPair[1];
      const closeIdx = (() => {
        let j = pos + 1;
        let q: '"' | "'" | null = null;
        while (j < src.length) {
          if (q) {
            if (src[j] === '\\') {
              j += 2;
              continue;
            }
            if (src[j] === q) q = null;
          } else {
            if (src[j] === '\\') {
              j += 2;
              continue;
            }
            if (src[j] === '"' || src[j] === "'") q = src[j] as '"' | "'";
            else if (src[j] === closeChar) return j;
          }
          j += 1;
        }
        return -1;
      })();

      if (closeIdx > pos) {
        const innerRaw = src.slice(pos + 1, closeIdx);
        const trimmedInner = innerRaw.trim();
        const looksLikeEbnfOptional =
          /['"]/.test(innerRaw) ||
          definedRules.has(trimmedInner) ||
          (trimmedInner.includes(' ') &&
            (trimmedInner.match(/[A-Za-z_][A-Za-z0-9_-]*/g) || []).some((w) => definedRules.has(w)));

        if (looksLikeEbnfOptional) {
          pos += 1;
          const inner = parseChoice();
          skipWs();
          if (pos < src.length && src[pos] === closeChar) pos += 1;
          return inner ? { type: 'Repeat', node: inner, min: 0, max: 1, lazy: false, label: '[...]' } : null;
        }

        const rawClass = src.slice(pos, closeIdx + 1);
        pos = closeIdx + 1;
        try {
          return { type: 'CharClass', raw: rawClass, regex: new RegExp(`^${rawClass}`) };
        } catch {
          return null;
        }
      }
    }

    // EBNF zero-or-more braces { expr }
    if (bracePair && ch === bracePair[0]) {
      pos += 1;
      const inner = parseChoice();
      skipWs();
      if (pos < src.length && src[pos] === bracePair[1]) pos += 1;
      return inner ? { type: 'Repeat', node: inner, min: 0, max: Infinity, lazy: false, label: '{...}' } : null;
    }

    // Inline regex terminal /pattern/
    if (symbols.regexDelimiter && src.startsWith(symbols.regexDelimiter, pos)) {
      const rDelim = symbols.regexDelimiter;
      let j = pos + rDelim.length;
      while (j < src.length) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src.startsWith(rDelim, j)) break;
        j += 1;
      }
      if (j < src.length && src.startsWith(rDelim, j)) {
        const pattern = src.slice(pos + rDelim.length, j);
        const raw = src.slice(pos, j + rDelim.length);
        pos = j + rDelim.length;
        try {
          const cleanPat = pattern.startsWith('^') ? pattern.slice(1) : pattern;
          return { type: 'RegexTerm', raw, regex: new RegExp(`^(?:${cleanPat})`) };
        } catch {
          return null;
        }
      }
    }

    // Wildcard `.`
    if (symbols.wildcard && src.startsWith(symbols.wildcard, pos)) {
      pos += symbols.wildcard.length;
      return { type: 'Wildcard' };
    }

    // Start / End anchors `^` / `$`
    if (ch === '^') {
      pos += 1;
      return { type: 'Anchor', kind: 'start' };
    }
    if (ch === '$') {
      pos += 1;
      return { type: 'Anchor', kind: 'end' };
    }

    // Angle-bracketed rule ref <rule_name>
    if (ch === '<') {
      const end = src.indexOf('>', pos);
      if (end > pos) {
        const name = src.slice(pos + 1, end).trim();
        pos = end + 1;
        return name ? { type: 'RuleRef', name } : null;
      }
    }

    // Bare non-terminal identifier
    const idMatch = src.slice(pos).match(/^[A-Za-z_][A-Za-z0-9_-]*/);
    if (idMatch) {
      pos += idMatch[0].length;
      return { type: 'RuleRef', name: idMatch[0] };
    }

    return null;
  }

  return parseChoice();
}

function stripRegexDelimiters(pattern: string): string {
  let raw = pattern.trim();
  if (raw.startsWith('/') && raw.lastIndexOf('/') > 0) {
    raw = raw.slice(1, raw.lastIndexOf('/'));
  }
  if (raw.startsWith('^')) raw = raw.slice(1);
  if (raw.endsWith('$') && !raw.endsWith('\\$')) raw = raw.slice(0, -1);
  return raw;
}

function isSingleDigitUnitPattern(inner: string): boolean {
  const clean = inner.trim();
  if (clean === '[0-9]' || clean === '\\d' || clean === '([0-9])' || clean === '(\\d)') {
    return true;
  }
  const stripped = clean.startsWith('(') && clean.endsWith(')') ? clean.slice(1, -1) : clean;
  const parts = stripped.split('|');
  return parts.length >= 2 && parts.every((p) => /^\d$/.test(p.trim()));
}

function matchMutationAtPos(
  mut: LineMutation,
  payload: string,
  pos: number,
  singleUnitOnly = false
): string[] {
  const slice = payload.slice(pos);
  if (!slice) return [];

  const matches: string[] = [];
  const seen = new Set<string>();
  const addMatch = (m: string) => {
    if (m && !seen.has(m)) {
      seen.add(m);
      matches.push(m);
    }
  };

  const rawPattern = (mut.patternOverride || '').trim();
  const inner = rawPattern ? stripRegexDelimiters(rawPattern) : '';

  if (mut.jsonType === 'number') {
    if (inner) {
      if (!singleUnitOnly && isSingleDigitUnitPattern(inner)) {
        // Number rule whose pattern defines allowed digits (e.g. /^(0|1|2|3|4|5|6|7|8|9)$/)
        // matches multi-digit numeric values (e.g. "201") composed of those digits!
        try {
          const multiRe = new RegExp(`^(?:${inner})+`);
          const full = slice.match(multiRe);
          if (full?.[0]) {
            for (let len = full[0].length; len >= 1; len -= 1) {
              addMatch(full[0].slice(0, len));
            }
          }
        } catch {
          // Ignore invalid user regex mid-edit
        }
      }
      try {
        const directRe = new RegExp(`^(?:${inner})`);
        const m = slice.match(directRe);
        if (m?.[0]) addMatch(m[0]);
      } catch {
        // Ignore invalid user regex mid-edit
      }
    } else {
      const numMatch = slice.match(/^-?\d+(?:\.\d+)?/);
      if (numMatch?.[0]) addMatch(numMatch[0]);
    }
  } else if (inner) {
    try {
      const directRe = new RegExp(`^(?:${inner})`);
      const m = slice.match(directRe);
      if (m?.[0]) addMatch(m[0]);
    } catch {
      // Ignore invalid user regex mid-edit
    }
  } else if (mut.jsonType === 'boolean') {
    const bMatch = slice.match(/^(?:true|false)/i);
    if (bMatch?.[0]) addMatch(bMatch[0]);
  }

  // Sort longest match first so greedy parses resolve cleanly while preserving shorter backtrack candidates
  matches.sort((a, b) => b.length - a.length);
  return matches;
}

export function evaluateGrammarPayload(
  rules: GrammarRule[],
  startRuleName: string,
  payload: string,
  mutations?: Record<string, LineMutation>,
  dialect?: DialectConfig
): EvaluationResult {
  if (!rules.length) {
    return {
      matched: false,
      consumedLength: 0,
      remaining: payload,
      summary: 'No grammar rules loaded',
      detail: 'Define at least one rule in Step 1 before evaluating.',
      trace: [],
    };
  }

  const ruleMap = new Map<string, GrammarRule>();
  const definedNames = new Set<string>();
  for (const r of rules) {
    ruleMap.set(r.name, r);
    definedNames.add(r.name);
  }

  const resolvedSymbols = resolveGrammarSymbols(dialect);
  const choiceDelim = dialect?.choiceDelimiter || '|';

  // Pre-parse each alternative into a full GrammarExprNode AST obeying configured Extended DAG symbol definitions
  const parsedAltsCache = new Map<string, Array<{ raw: string; ast: GrammarExprNode }>>();
  for (const r of rules) {
    const parsedList: Array<{ raw: string; ast: GrammarExprNode }> = [];
    for (const alt of r.alternatives) {
      const ast = parseGrammarExprAst(alt, definedNames, resolvedSymbols, choiceDelim);
      if (ast) parsedList.push({ raw: alt, ast });
    }
    parsedAltsCache.set(r.name, parsedList);
  }

  const startRule = ruleMap.get(startRuleName) || rules[0];
  const MAX_DEPTH = 32;
  const MAX_OUTCOMES_PER_NODE = 24;
  const MAX_REPEAT_ITERS = 128;
  const activeCalls = new Set<string>();
  const evalStartMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let backtrackCount = 0;
  const constraintViolations: Array<{
    rule: string;
    reason: string;
    startOffset: number;
    endOffset: number;
    value: string;
    depth: number;
  }> = [];

  function evalExpr(
    node: GrammarExprNode,
    pos: number,
    depth: number,
    inRepeat = false
  ): MatchOutcome[] {
    if (depth > MAX_DEPTH) return [];

    switch (node.type) {
      case 'Literal': {
        if (!payload.startsWith(node.value, pos)) return [];
        return [
          {
            endPos: pos + node.value.length,
            trace: [
              {
                depth,
                rule: `"${node.value}"`,
                inputSlice: payload.slice(pos, pos + 16),
                matched: true,
                consumed: node.value,
                note: 'Terminal literal matched',
                startOffset: pos,
                endOffset: pos + node.value.length,
                kind: 'terminal',
              },
            ],
          },
        ];
      }

      case 'Wildcard': {
        if (pos >= payload.length) return [];
        const ch = payload[pos];
        return [
          {
            endPos: pos + 1,
            trace: [
              {
                depth,
                rule: '.',
                inputSlice: payload.slice(pos, pos + 16),
                matched: true,
                consumed: ch,
                note: 'Wildcard matched single char',
                startOffset: pos,
                endOffset: pos + 1,
                kind: 'terminal',
              },
            ],
          },
        ];
      }

      case 'Anchor': {
        const ok = node.kind === 'start' ? pos === 0 : pos === payload.length;
        if (!ok) return [];
        return [
          {
            endPos: pos,
            trace: [
              {
                depth,
                rule: node.kind === 'start' ? '^' : '$',
                inputSlice: payload.slice(pos, pos + 12),
                matched: true,
                consumed: '',
                note: node.kind === 'start' ? 'Start anchor matched' : 'End anchor matched',
                startOffset: pos,
                endOffset: pos,
                kind: 'terminal',
              },
            ],
          },
        ];
      }

      case 'CharClass': {
        const m = payload.slice(pos).match(node.regex);
        if (!m?.[0]) return [];
        return [
          {
            endPos: pos + m[0].length,
            trace: [
              {
                depth,
                rule: node.raw,
                inputSlice: payload.slice(pos, pos + 16),
                matched: true,
                consumed: m[0],
                note: 'Character class matched',
                startOffset: pos,
                endOffset: pos + m[0].length,
                kind: 'terminal',
              },
            ],
          },
        ];
      }

      case 'RegexTerm': {
        const m = payload.slice(pos).match(node.regex);
        if (!m?.[0]) return [];
        return [
          {
            endPos: pos + m[0].length,
            trace: [
              {
                depth,
                rule: node.raw,
                inputSlice: payload.slice(pos, pos + 16),
                matched: true,
                consumed: m[0],
                note: 'Inline regex matched',
              },
            ],
          },
        ];
      }

      case 'RuleRef':
        return matchRuleAll(node.name, pos, depth, inRepeat);

      case 'Sequence': {
        let states: MatchOutcome[] = [{ endPos: pos, trace: [] }];
        for (const item of node.items) {
          const nextStates: MatchOutcome[] = [];
          for (const st of states) {
            const sub = evalExpr(item, st.endPos, depth, inRepeat);
            for (const o of sub) {
              nextStates.push({
                endPos: o.endPos,
                trace: [...st.trace, ...o.trace],
              });
              if (nextStates.length >= MAX_OUTCOMES_PER_NODE) break;
            }
            if (nextStates.length >= MAX_OUTCOMES_PER_NODE) break;
          }
          states = nextStates;
          if (states.length === 0) break;
        }
        return states;
      }

      case 'Choice': {
        const collected: MatchOutcome[] = [];
        const seen = new Set<number>();
        for (const branch of node.branches) {
          const outs = evalExpr(branch, pos, depth, inRepeat);
          for (const o of outs) {
            if (seen.has(o.endPos)) continue;
            seen.add(o.endPos);
            collected.push(o);
            if (collected.length >= MAX_OUTCOMES_PER_NODE) break;
          }
          if (collected.length >= MAX_OUTCOMES_PER_NODE) break;
        }
        return collected;
      }

      case 'Repeat': {
        const results: MatchOutcome[] = [];
        const seenEndPos = new Set<number>();
        let frontier: Array<{ endPos: number; trace: EvaluationTraceStep[] }> = [{ endPos: pos, trace: [] }];

        if (node.min === 0) {
          seenEndPos.add(pos);
          results.push({ endPos: pos, trace: [] });
        }

        const upperBound = Number.isFinite(node.max) ? Math.min(node.max, MAX_REPEAT_ITERS) : MAX_REPEAT_ITERS;
        for (let count = 1; count <= upperBound; count += 1) {
          const nextFrontier: Array<{ endPos: number; trace: EvaluationTraceStep[] }> = [];
          const frontierEndSet = new Set<number>();

          for (const st of frontier) {
            const stepOuts = evalExpr(node.node, st.endPos, depth, true);
            for (const o of stepOuts) {
              // Guard against zero-width infinite repetition
              if (o.endPos === st.endPos) continue;
              if (frontierEndSet.has(o.endPos)) continue;
              frontierEndSet.add(o.endPos);
              const combined = { endPos: o.endPos, trace: [...st.trace, ...o.trace] };
              nextFrontier.push(combined);
              if (count >= node.min && !seenEndPos.has(o.endPos)) {
                seenEndPos.add(o.endPos);
                results.push(combined);
              }
              if (nextFrontier.length >= MAX_OUTCOMES_PER_NODE) break;
            }
            if (nextFrontier.length >= MAX_OUTCOMES_PER_NODE) break;
          }

          frontier = nextFrontier;
          if (frontier.length === 0) break;
        }

        results.sort((a, b) => (node.lazy ? a.endPos - b.endPos : b.endPos - a.endPos));
        return results.slice(0, MAX_OUTCOMES_PER_NODE);
      }

      case 'Lookahead': {
        const probe = evalExpr(node.node, pos, depth + 1, false);
        const succeeded = node.positive ? probe.length > 0 : probe.length === 0;
        if (!succeeded) return [];
        const preview = probe[0] ? payload.slice(pos, probe[0].endPos) : '';
        return [
          {
            endPos: pos,
            trace: [
              {
                depth,
                rule: node.raw,
                inputSlice: payload.slice(pos, pos + 16),
                matched: true,
                consumed: '',
                note: node.positive
                  ? `Positive lookahead matched "${preview}" (zero-width)`
                  : 'Negative lookahead satisfied (zero-width)',
              },
            ],
          },
        ];
      }

      case 'Lookbehind': {
        const minStart = Math.max(0, pos - 64);
        let matchedSlice: string | null = null;
        for (let start = pos; start >= minStart; start -= 1) {
          const probe = evalExpr(node.node, start, depth + 1, false);
          if (probe.some((o) => o.endPos === pos)) {
            matchedSlice = payload.slice(start, pos);
            break;
          }
        }
        const succeeded = node.positive ? matchedSlice !== null : matchedSlice === null;
        if (!succeeded) return [];
        return [
          {
            endPos: pos,
            trace: [
              {
                depth,
                rule: node.raw,
                inputSlice: payload.slice(Math.max(0, pos - 12), pos + 8),
                matched: true,
                consumed: '',
                note: node.positive
                  ? `Positive lookbehind matched "${matchedSlice}" (zero-width)`
                  : 'Negative lookbehind satisfied (zero-width)',
              },
            ],
          },
        ];
      }
    }
  }

  function matchRuleAll(
    ruleName: string,
    pos: number,
    depth: number,
    inRepeat = false
  ): MatchOutcome[] {
    if (depth > MAX_DEPTH) return [];
    const callKey = `${ruleName}@${pos}@${inRepeat ? 'r' : 'n'}`;
    if (activeCalls.has(callKey)) return [];
    const rule = ruleMap.get(ruleName);
    if (!rule) return [];

    activeCalls.add(callKey);
    const collected: MatchOutcome[] = [];
    const seenEndPos = new Set<number>();

    try {
      const mut = mutations?.[ruleName];
      const hasActiveMutationPattern = Boolean(mut && mut.enabled && (mut.patternOverride || '').trim());
      const isLeafRule = rule.referencedRules.length === 0;

      // Apply Workbench 5 schema mutation constraints (regex patternOverride & numeric multi-digit typing)
      if (
        mut &&
        mut.enabled &&
        (hasActiveMutationPattern || (isLeafRule && (mut.jsonType === 'number' || mut.jsonType === 'boolean')))
      ) {
        const mutMatches = matchMutationAtPos(mut, payload, pos, inRepeat);
        for (const matchedText of mutMatches) {
          const endPos = pos + matchedText.length;
          if (seenEndPos.has(endPos)) continue;
          seenEndPos.add(endPos);
          const termStep: EvaluationTraceStep = {
            depth: depth + 1,
            rule: `"${matchedText}"`,
            inputSlice: payload.slice(pos, pos + 16),
            matched: true,
            consumed: matchedText,
            note: 'Terminal literal matched',
          };
          const headerStep: EvaluationTraceStep = {
            depth,
            rule: ruleName,
            inputSlice: payload.slice(pos, pos + 20),
            matched: true,
            consumed: matchedText,
            note: `Matched branch: '${matchedText}'`,
          };
          collected.push({
            endPos,
            trace: [headerStep, termStep],
          });
        }
      }

      // Explore grammar alternatives (supports repetitions, inline choices, char classes, lookahead, lookbehind)
      const parsedAlts = parsedAltsCache.get(ruleName) || [];
      if (!isLeafRule || !hasActiveMutationPattern) {
        for (const altEntry of parsedAlts) {
          const altOutcomes = evalExpr(altEntry.ast, pos, depth + 1, false);
          for (const out of altOutcomes) {
            if (seenEndPos.has(out.endPos)) continue;
            seenEndPos.add(out.endPos);
            const headerStep: EvaluationTraceStep = {
              depth,
              rule: ruleName,
              inputSlice: payload.slice(pos, pos + 20),
              matched: true,
              consumed: payload.slice(pos, out.endPos),
              note: `Matched branch: ${altEntry.raw}`,
              startOffset: pos,
              endOffset: out.endPos,
              kind: 'nonterminal',
            };
            collected.push({
              endPos: out.endPos,
              trace: [headerStep, ...out.trace],
            });
          }
          if (altOutcomes.length === 0 && parsedAlts.length > 1) {
            backtrackCount += 1;
          }
        }
      }
    } finally {
      activeCalls.delete(callKey);
    }

    // Enforce EBNF comment constraints (* minLength>=3, min>=18, /regex/, etc. *)
    const ruleConstraints = rule.constraints || [];
    const rejectedByConstraint: Array<{
      rule: string;
      reason: string;
      startOffset: number;
      endOffset: number;
      value: string;
      depth: number;
    }> = [];
    const filteredCollected =
      ruleConstraints.length > 0
        ? collected.filter((outcome) => {
            const matchedText = payload.slice(pos, outcome.endPos);
            const check = validateValueAgainstConstraints(matchedText, ruleConstraints);
            if (check.ok) {
              outcome.trace.push({
                depth,
                rule: ruleName,
                inputSlice: matchedText.slice(0, 20),
                matched: true,
                consumed: matchedText,
                note: `Satisfied constraints (* ${ruleConstraints.map((c) => c.raw).join(', ')} *)`,
                startOffset: pos,
                endOffset: outcome.endPos,
                kind: 'constraint',
              });
              return true;
            }
            rejectedByConstraint.push({
              rule: ruleName,
              reason: check.reason,
              startOffset: pos,
              endOffset: outcome.endPos,
              value: matchedText,
              depth,
            });
            return false;
          })
        : collected;

    if (filteredCollected.length === 0 && rejectedByConstraint.length > 0) {
      backtrackCount += 1;
      rejectedByConstraint.sort((a, b) => b.endOffset - a.endOffset);
      constraintViolations.push(rejectedByConstraint[0]);
    }

    // Prefer longest match first so greedy/maximal parses resolve cleanly
    filteredCollected.sort((a, b) => b.endPos - a.endPos);
    return filteredCollected.slice(0, MAX_OUTCOMES_PER_NODE);
  }

  const outcomes = matchRuleAll(startRule.name, 0, 0);
  const fullOutcome = outcomes.find((o) => o.endPos === payload.length);
  const bestOutcome = fullOutcome || outcomes[0] || null;
  const evalEndMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const durationMs = Math.max(0.01, Number((evalEndMs - evalStartMs).toFixed(2)));

  if (fullOutcome) {
    const constraintsPassed = fullOutcome.trace.filter((t) => t.kind === 'constraint' && t.matched).length;
    const constraintLabel =
      constraintsPassed > 0
        ? ` · ${constraintsPassed}/${constraintsPassed} constraint${constraintsPassed === 1 ? '' : 's'} passed`
        : '';
    return {
      matched: true,
      consumedLength: fullOutcome.endPos,
      remaining: '',
      summary: `Valid match for <${startRule.name}> (${fullOutcome.endPos}/${payload.length} chars)${constraintLabel}`,
      detail: `Consumed all ${payload.length} characters across ${fullOutcome.trace.length} expansion steps (${durationMs}ms).`,
      trace: fullOutcome.trace.slice(0, 180),
      durationMs,
      backtracks: backtrackCount,
      constraintsPassed,
      constraintsFailed: 0,
      constraintViolations: [],
    };
  }

  if (constraintViolations.length > 0 && (!bestOutcome || bestOutcome.endPos < payload.length)) {
    const primaryViolation = constraintViolations[0];
    const violationTrace: EvaluationTraceStep[] = [
      ...(bestOutcome ? bestOutcome.trace.slice(0, 120) : []),
      ...constraintViolations.slice(0, 8).map((v) => ({
        depth: v.depth,
        rule: v.rule,
        inputSlice: v.value.slice(0, 20),
        matched: false,
        consumed: v.value,
        note: v.reason,
        startOffset: v.startOffset,
        endOffset: v.endOffset,
        kind: 'constraint' as const,
      })),
    ];
    return {
      matched: false,
      consumedLength: bestOutcome?.endPos ?? primaryViolation.endOffset,
      remaining: payload.slice(bestOutcome?.endPos ?? primaryViolation.endOffset),
      summary: `Syntax matched, but constraint failed on <${primaryViolation.rule}> (0/${constraintViolations.length} failed)`,
      detail: primaryViolation.reason,
      trace: violationTrace,
      durationMs,
      backtracks: backtrackCount,
      constraintsPassed: 0,
      constraintsFailed: constraintViolations.length,
      constraintViolations: constraintViolations.map(({ depth: _d, ...rest }) => rest),
    };
  }

  if (bestOutcome && bestOutcome.endPos > 0) {
    const remaining = payload.slice(bestOutcome.endPos);
    return {
      matched: false,
      consumedLength: bestOutcome.endPos,
      remaining,
      summary: `Partial match (${bestOutcome.endPos}/${payload.length} chars)`,
      detail: `Rule <${startRule.name}> matched prefix "${payload.slice(0, bestOutcome.endPos)}", trailing "${remaining}" unconsumed.`,
      trace: bestOutcome.trace.slice(0, 180),
      durationMs,
      backtracks: backtrackCount,
      constraintsPassed: bestOutcome.trace.filter((t) => t.kind === 'constraint' && t.matched).length,
      constraintsFailed: 0,
      constraintViolations: [],
    };
  }

  return {
    matched: false,
    consumedLength: 0,
    remaining: payload,
    summary: `No match for <${startRule.name}>`,
    detail: `Input "${payload || '(empty)'}" did not satisfy any branch of <${startRule.name}>.`,
    trace: [
      {
        depth: 0,
        rule: startRule.name,
        inputSlice: payload.slice(0, 20),
        matched: false,
        consumed: '',
        note: 'No alternative matched from offset 0',
        startOffset: 0,
        endOffset: 0,
        kind: 'backtrack',
      },
    ],
    durationMs,
    backtracks: backtrackCount,
    constraintsPassed: 0,
    constraintsFailed: 0,
    constraintViolations: [],
  };
}

/* ============================================================================
 * 5. PYTHON `ast` BIDIRECTIONAL COMPILER
 * ========================================================================== */

function formatPythonStringLiteral(value: string): string {
  if (!value.includes('\n')) {
    if (value.includes('"') && !value.includes("'")) {
      return `'${value}'`;
    }
    if (!value.includes('"')) {
      return `"${value}"`;
    }
  }
  return JSON.stringify(value);
}

export function generatePythonFromWorkspace(
  rules: GrammarRule[],
  schemaConfig: SchemaConfig
): string {
  const safeName = (schemaConfig.schemaName || 'CustomGrammarSchema').replace(/[^A-Za-z0-9_]/g, '_');
  const ruleEntries = rules
    .map(
      (r) =>
        `    ${formatPythonStringLiteral(r.name)}: ${formatPythonStringLiteral(normalizeExpressionQuotes(r.expression))},`
    )
    .join('\n');

  return `# Auto-generated Python AST module for ${safeName}
SCHEMA_NAME = ${formatPythonStringLiteral(safeName)}
SCHEMA_TYPE = ${formatPythonStringLiteral(schemaConfig.schemaOrgType || 'DefinedTermSet')}
RULE_COUNT = ${rules.length}

GRAMMAR_RULES = {
${ruleEntries || `    "start": "'ok'",`}
}

def get_rule_count():
    return RULE_COUNT

def validate_rule(rule_name):
    return rule_name in GRAMMAR_RULES
`;
}

function parsePythonExpr(expr: string): PythonAstNode {
  const trimmed = expr.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    try {
      return { _type: 'Constant', value: JSON.parse(trimmed) };
    } catch {
      return { _type: 'Constant', value: trimmed.slice(1, -1).replace(/\\"/g, '"') };
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return { _type: 'Constant', value: trimmed.slice(1, -1).replace(/\\'/g, "'") };
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { _type: 'Constant', value: Number(trimmed) };
  }
  if (trimmed === 'True' || trimmed === 'False') {
    return { _type: 'Constant', value: trimmed === 'True' };
  }
  if (trimmed === 'None') {
    return { _type: 'Constant', value: null };
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    const elts = inner ? splitOutsideQuotes(inner, ',').map(parsePythonExpr) : [];
    return { _type: 'List', elts };
  }
  const inMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([A-Za-z_][A-Za-z0-9_]*)$/);
  if (inMatch) {
    return {
      _type: 'Compare',
      op: 'In',
      left: { _type: 'Name', id: inMatch[1] },
      right: { _type: 'Name', id: inMatch[2] },
    };
  }
  const binMatch = trimmed.match(/^(.+?)\s*(\+|-|\*|\/)\s*(.+)$/);
  if (binMatch) {
    return {
      _type: 'BinOp',
      op: binMatch[2],
      left: parsePythonExpr(binMatch[1]),
      right: parsePythonExpr(binMatch[3]),
    };
  }
  const callMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_.]*)\((.*)\)$/);
  if (callMatch) {
    const rawArgs = callMatch[2].trim();
    return {
      _type: 'Call',
      func: callMatch[1],
      callArgs: rawArgs ? splitOutsideQuotes(rawArgs, ',').map(parsePythonExpr) : [],
    };
  }
  return { _type: 'Name', id: trimmed };
}

export function parsePythonToAst(source: string): { ast: PythonAstNode; symbols: string[] } {
  const lines = source.split(/\r?\n/);
  const body: PythonAstNode[] = [];
  const symbols: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const lineno = i + 1;

    if (!trimmed || trimmed.startsWith('#')) {
      i += 1;
      continue;
    }

    const defMatch = trimmed.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\):$/);
    if (defMatch) {
      const fnName = defMatch[1];
      const args = defMatch[2]
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      symbols.push(`def ${fnName}(${args.join(', ')})`);
      const fnBody: PythonAstNode[] = [];
      i += 1;
      while (i < lines.length && (lines[i].startsWith('    ') || lines[i].startsWith('\t') || !lines[i].trim())) {
        const sub = lines[i].trim();
        if (sub && !sub.startsWith('#')) {
          if (sub.startsWith('return ')) {
            fnBody.push({
              _type: 'Return',
              lineno: i + 1,
              value: parsePythonExpr(sub.slice(7)),
            });
          } else {
            const subAssign = sub.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
            if (subAssign) {
              fnBody.push({
                _type: 'Assign',
                lineno: i + 1,
                targets: [{ _type: 'Name', id: subAssign[1] }],
                value: parsePythonExpr(subAssign[2]),
              });
            }
          }
        }
        i += 1;
      }
      body.push({ _type: 'FunctionDef', lineno, name: fnName, args, body: fnBody });
      continue;
    }

    const dictStart = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{$/);
    if (dictStart) {
      const varName = dictStart[1];
      symbols.push(varName);
      const keys: PythonAstNode[] = [];
      const values: PythonAstNode[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('}')) {
        const entry = lines[i].trim().replace(/,$/, '');
        const colonIdx = entry.indexOf(':');
        if (colonIdx > 0) {
          keys.push(parsePythonExpr(entry.slice(0, colonIdx)));
          values.push(parsePythonExpr(entry.slice(colonIdx + 1)));
        }
        i += 1;
      }
      i += 1;
      body.push({
        _type: 'Assign',
        lineno,
        targets: [{ _type: 'Name', id: varName }],
        value: { _type: 'Dict', keys, values },
      });
      continue;
    }

    const assignMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (assignMatch) {
      const varName = assignMatch[1];
      symbols.push(varName);
      body.push({
        _type: 'Assign',
        lineno,
        targets: [{ _type: 'Name', id: varName }],
        value: parsePythonExpr(assignMatch[2]),
      });
      i += 1;
      continue;
    }

    i += 1;
  }

  return {
    ast: { _type: 'Module', body },
    symbols,
  };
}

export function formatPythonAstDump(node: PythonAstNode, indent = 0): string {
  const pad = '  '.repeat(indent);
  const nextPad = '  '.repeat(indent + 1);

  switch (node._type) {
    case 'Module': {
      const items = (node.body || []).map((n) => formatPythonAstDump(n, indent + 2)).join(',\n');
      return `Module(\n${nextPad}body=[\n${items}\n${nextPad}]\n)`;
    }
    case 'Assign': {
      const targetStr = (node.targets || []).map((t) => formatPythonAstDump(t, 0)).join(', ');
      const valStr = node.value ? formatPythonAstDump(node.value as PythonAstNode, indent + 1) : 'Constant(value=None)';
      return `${pad}Assign(targets=[${targetStr}], value=${valStr.trimStart()})`;
    }
    case 'FunctionDef': {
      const argsStr = (node.args || []).map((a) => `arg(arg='${a}')`).join(', ');
      const bodyStr = (node.body || []).map((b) => formatPythonAstDump(b, indent + 2)).join(',\n');
      return `${pad}FunctionDef(\n${nextPad}name='${node.name}',\n${nextPad}args=arguments(args=[${argsStr}]),\n${nextPad}body=[\n${bodyStr}\n${nextPad}]\n${pad})`;
    }
    case 'Return':
      return `${pad}Return(value=${node.value ? formatPythonAstDump(node.value as PythonAstNode, 0) : 'None'})`;
    case 'Dict': {
      const ks = (node.keys || []).map((k) => formatPythonAstDump(k, 0)).join(', ');
      const vs = (node.values || []).map((v) => formatPythonAstDump(v, 0)).join(', ');
      return `${pad}Dict(keys=[${ks}], values=[${vs}])`;
    }
    case 'List': {
      const es = (node.elts || []).map((e) => formatPythonAstDump(e, 0)).join(', ');
      return `${pad}List(elts=[${es}])`;
    }
    case 'Compare':
      return `Compare(left=${formatPythonAstDump(node.left!, 0)}, ops=[${node.op}()], comparators=[${formatPythonAstDump(node.right!, 0)}])`;
    case 'BinOp':
      return `BinOp(left=${formatPythonAstDump(node.left!, 0)}, op=${node.op}, right=${formatPythonAstDump(node.right!, 0)})`;
    case 'Call':
      return `Call(func=Name(id='${node.func}'), args=[${(node.callArgs || []).map((a) => formatPythonAstDump(a, 0)).join(', ')}])`;
    case 'Name':
      return `Name(id='${node.id}')`;
    case 'Constant':
      return `Constant(value=${typeof node.value === 'string' ? formatPythonStringLiteral(node.value) : JSON.stringify(node.value)})`;
    default:
      return `${pad}${node._type}()`;
  }
}

function unparseExpr(node: PythonAstNode): string {
  switch (node._type) {
    case 'Constant':
      if (node.value === true) return 'True';
      if (node.value === false) return 'False';
      if (node.value === null) return 'None';
      if (typeof node.value === 'string') return formatPythonStringLiteral(node.value);
      return JSON.stringify(node.value);
    case 'Name':
      return node.id || 'x';
    case 'List':
      return `[${(node.elts || []).map(unparseExpr).join(', ')}]`;
    case 'Dict': {
      const pairs = (node.keys || []).map((k, idx) => {
        const v = (node.values || [])[idx];
        return `    ${unparseExpr(k)}: ${v ? unparseExpr(v) : 'None'},`;
      });
      return `{\n${pairs.join('\n')}\n}`;
    }
    case 'Compare':
      return `${unparseExpr(node.left!)} in ${unparseExpr(node.right!)}`;
    case 'BinOp':
      return `${unparseExpr(node.left!)} ${node.op || '+'} ${unparseExpr(node.right!)}`;
    case 'Call':
      return `${node.func}(${(node.callArgs || []).map(unparseExpr).join(', ')})`;
    default:
      return 'None';
  }
}

export function unparsePythonAst(ast: PythonAstNode): string {
  const out: string[] = [];
  for (const stmt of ast.body || []) {
    if (stmt._type === 'Assign' && stmt.targets?.[0]?.id && stmt.value) {
      out.push(`${stmt.targets[0].id} = ${unparseExpr(stmt.value as PythonAstNode)}`);
    } else if (stmt._type === 'FunctionDef') {
      out.push(`\ndef ${stmt.name}(${(stmt.args || []).join(', ')}):`);
      const fnBody = stmt.body || [];
      if (fnBody.length === 0) {
        out.push('    pass');
      } else {
        for (const inner of fnBody) {
          if (inner._type === 'Return' && inner.value) {
            out.push(`    return ${unparseExpr(inner.value as PythonAstNode)}`);
          } else if (inner._type === 'Assign' && inner.targets?.[0]?.id && inner.value) {
            out.push(`    ${inner.targets[0].id} = ${unparseExpr(inner.value as PythonAstNode)}`);
          }
        }
      }
    }
  }
  return out.join('\n').trim() + '\n';
}

export function extractRulesFromPythonAst(ast: PythonAstNode, dialect: DialectConfig): string | null {
  for (const stmt of ast.body || []) {
    if (stmt._type === 'Assign' && stmt.targets?.[0]?.id === 'GRAMMAR_RULES') {
      const dict = stmt.value as PythonAstNode | undefined;
      if (dict && dict._type === 'Dict' && dict.keys && dict.values) {
        const lines: string[] = [`${dialect.commentPrefix} Synced bidirectionally from Python ast.Module`];
        dict.keys.forEach((k, idx) => {
          const v = dict.values?.[idx];
          if (k._type === 'Constant' && v?._type === 'Constant') {
            lines.push(formatGrammarRuleLine(String(k.value), String(v.value), dialect.ruleOperator));
          }
        });
        return lines.join('\n');
      }
    }
  }
  return null;
}

/* ============================================================================
 * 6. RUST `syn` / `serde` AST BIDIRECTIONAL COMPILER
 * ========================================================================== */

function toPascalCase(str: string): string {
  return (
    str
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('') || 'GrammarSchema'
  );
}

function toSnakeCase(str: string): string {
  return (
    str
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .toLowerCase()
      .replace(/^_+|_+$/g, '') || 'field'
  );
}

function formatRustStringLiteral(value: string): string {
  if (value.includes('"') || value.includes('\\')) {
    if (!value.includes('"#')) {
      return `r#"${value}"#`;
    }
    if (!value.includes('"##')) {
      return `r##"${value}"##`;
    }
  }
  return `"${value}"`;
}

export function generateRustFromWorkspace(
  rules: GrammarRule[],
  schemaConfig: SchemaConfig,
  mutations: Record<string, LineMutation>,
  mutationPolicy: MutationPolicy = DEFAULT_MUTATION_POLICY
): string {
  const structName = toPascalCase(schemaConfig.schemaName || 'OrderActionGrammar');
  const fields = rules.map((r) => {
    const mut = mutations[r.name];
    const prop = mut?.enabled && mut.targetProperty ? toSnakeCase(mut.targetProperty) : toSnakeCase(r.name);
    const rustType =
      mut?.jsonType === 'number'
        ? 'i64'
        : mut?.jsonType === 'boolean'
          ? 'bool'
          : mut?.jsonType === 'array'
            ? 'Vec<String>'
            : 'String';
    return `    pub ${prop}: ${rustType},`;
  });

  const ruleTuples = rules.map(
    (r) =>
      `    (${formatRustStringLiteral(r.name)}, ${formatRustStringLiteral(normalizeExpressionQuotes(r.expression))}),`
  );

  return `// Auto-generated Rust AST & Serde Schema Declaration
use serde::{Deserialize, Serialize};

pub const SCHEMA_NAME: &str = ${formatRustStringLiteral(schemaConfig.schemaName || structName)};
pub const SCHEMA_TYPE: &str = ${formatRustStringLiteral(schemaConfig.schemaOrgType || 'DefinedTermSet')};
pub const ALLOW_IMPORT_MUTATION: bool = ${mutationPolicy.allowImportMutation};
pub const ALLOW_EXPORT_MUTATION: bool = ${mutationPolicy.allowExportMutation};

pub const GRAMMAR_RULES: &[(&str, &str)] = &[
${ruleTuples.join('\n') || `    ("start", "'ok'"),`}
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ${structName} {
${fields.join('\n') || '    pub start: String,'}
}

pub fn rule_count() -> usize {
    GRAMMAR_RULES.len()
}

pub fn has_rule(name: &str) -> bool {
    GRAMMAR_RULES.iter().any(|(k, _)| *k == name)
}
`;
}

export function parseRustToAst(source: string): { ast: RustAstModule; symbols: string[] } {
  const lines = source.split(/\r?\n/);
  const items: RustAstItem[] = [];
  const symbols: string[] = [];
  const derives: string[] = [];
  let crateName = 'grammar_schema';

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    const lineno = i + 1;

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('use ')) {
      i += 1;
      continue;
    }

    const deriveMatch = trimmed.match(/^#\[derive\(([^)]+)\)\]$/);
    if (deriveMatch) {
      deriveMatch[1]
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean)
        .forEach((d) => {
          if (!derives.includes(d)) derives.push(d);
        });
      i += 1;
      continue;
    }

    // Const array GRAMMAR_RULES
    const rulesConst = trimmed.match(/^(pub\s+)?const\s+([A-Z0-9_]+)\s*:\s*&\[\(&str,\s*&str\)\]\s*=\s*&\[$/);
    if (rulesConst) {
      const name = rulesConst[2];
      const entries: Array<{ key: string; value: string }> = [];
      symbols.push(`const ${name}`);
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('];')) {
        const lineTrim = lines[i].trim();
        const rawTup = lineTrim.match(/^\(\s*"([^"]+)"\s*,\s*r#+"([\s\S]*?)"#+\s*\),?$/);
        if (rawTup) {
          entries.push({ key: rawTup[1], value: rawTup[2] });
        } else {
          const tup = lineTrim.match(/^\(\s*"([^"]+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\),?$/);
          if (tup) {
            let unescaped = tup[2].replace(/\\"/g, '"');
            try {
              unescaped = JSON.parse(`"${tup[2]}"`);
            } catch {
              // keep fallback unescaped string
            }
            entries.push({ key: tup[1], value: unescaped });
          }
        }
        i += 1;
      }
      i += 1;
      items.push({
        kind: 'Const',
        lineno,
        name,
        visibility: rulesConst[1] ? 'pub' : 'private',
        entries,
      });
      continue;
    }

    // Simple const
    const simpleConst = trimmed.match(/^(pub\s+)?const\s+([A-Z0-9_]+)\s*:\s*([^=]+)=\s*(.+);$/);
    if (simpleConst) {
      const name = simpleConst[2];
      symbols.push(`const ${name}`);
      if (name === 'SCHEMA_NAME') {
        crateName = simpleConst[4].replace(/^"|"$/g, '');
      }
      items.push({
        kind: 'Const',
        lineno,
        name,
        visibility: simpleConst[1] ? 'pub' : 'private',
        signature: `${simpleConst[3].trim()} = ${simpleConst[4].trim()}`,
      });
      i += 1;
      continue;
    }

    // Struct block
    const structMatch = trimmed.match(/^(pub\s+)?struct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{$/);
    if (structMatch) {
      const name = structMatch[2];
      const fields: Array<{ name: string; rustType: string }> = [];
      symbols.push(`struct ${name}`);
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('}')) {
        const fld = lines[i].trim().match(/^(?:pub\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^,]+),?$/);
        if (fld) {
          fields.push({ name: fld[1], rustType: fld[2].trim() });
        }
        i += 1;
      }
      i += 1;
      items.push({
        kind: 'Struct',
        lineno,
        name,
        visibility: structMatch[1] ? 'pub' : 'private',
        fields,
      });
      continue;
    }

    // Enum block
    const enumMatch = trimmed.match(/^(pub\s+)?enum\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{$/);
    if (enumMatch) {
      const name = enumMatch[2];
      const variants: string[] = [];
      symbols.push(`enum ${name}`);
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('}')) {
        const v = lines[i].trim().replace(/,$/, '');
        if (v && !v.startsWith('//')) variants.push(v);
        i += 1;
      }
      i += 1;
      items.push({
        kind: 'Enum',
        lineno,
        name,
        visibility: enumMatch[1] ? 'pub' : 'private',
        variants,
      });
      continue;
    }

    // Function signature
    const fnMatch = trimmed.match(/^(pub\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)(?:\s*->\s*([^{]+))?\s*\{?$/);
    if (fnMatch) {
      const name = fnMatch[2];
      symbols.push(`fn ${name}(${fnMatch[3].trim()})`);
      items.push({
        kind: 'Fn',
        lineno,
        name,
        visibility: fnMatch[1] ? 'pub' : 'private',
        signature: `(${fnMatch[3].trim()})`,
        returnType: fnMatch[4]?.trim() || '()',
      });
      i += 1;
      continue;
    }

    i += 1;
  }

  return {
    ast: {
      kind: 'File',
      crateName,
      derives,
      items,
    },
    symbols,
  };
}

export function formatRustAstDump(mod: RustAstModule): string {
  const lines: string[] = [
    `syn::File {`,
    `  crate_name: ${JSON.stringify(mod.crateName)},`,
    `  derives: [${mod.derives.map((d) => JSON.stringify(d)).join(', ')}],`,
    `  items: [`,
  ];

  for (const item of mod.items) {
    if (item.kind === 'Struct') {
      const flds = (item.fields || []).map((f) => `${f.name}: ${f.rustType}`).join(', ');
      lines.push(`    Item::Struct(${item.visibility} ${item.name} { ${flds} }),`);
    } else if (item.kind === 'Enum') {
      lines.push(`    Item::Enum(${item.visibility} ${item.name} { ${(item.variants || []).join(', ')} }),`);
    } else if (item.kind === 'Const' && item.entries) {
      lines.push(`    Item::Const(${item.visibility} ${item.name} [${item.entries.length} grammar rules]),`);
    } else if (item.kind === 'Const') {
      lines.push(`    Item::Const(${item.visibility} ${item.name}: ${item.signature}),`);
    } else if (item.kind === 'Fn') {
      lines.push(`    Item::Fn(${item.visibility} fn ${item.name}${item.signature} -> ${item.returnType}),`);
    }
  }

  lines.push('  ]', '}');
  return lines.join('\n');
}

export function extractRulesFromRustAst(mod: RustAstModule, dialect: DialectConfig): string | null {
  const constItem = mod.items.find((it) => it.kind === 'Const' && it.name === 'GRAMMAR_RULES' && it.entries);
  if (!constItem || !constItem.entries || constItem.entries.length === 0) return null;

  const lines: string[] = [`${dialect.commentPrefix} Synced bidirectionally from Rust syn::File AST`];
  for (const entry of constItem.entries) {
    lines.push(formatGrammarRuleLine(entry.key, entry.value, dialect.ruleOperator));
  }
  return lines.join('\n');
}

/* ============================================================================
 * 7. WASM & WABT BIDIRECTIONAL ENGINE (WAT <-> REAL WASM BINARY <-> AST)
 * ========================================================================== */

function encodeULEB128(value: number): number[] {
  const out: number[] = [];
  let v = value >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    out.push(byte);
  } while (v !== 0);
  return out;
}

function encodeSLEB128(value: number): number[] {
  const out: number[] = [];
  let v = value | 0;
  let more = true;
  while (more) {
    let byte = v & 0x7f;
    v >>= 7;
    const signBit = (byte & 0x40) !== 0;
    if ((v === 0 && !signBit) || (v === -1 && signBit)) {
      more = false;
    } else {
      byte |= 0x80;
    }
    out.push(byte);
  }
  return out;
}

function decodeULEB128(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < bytes.length) {
    const byte = bytes[pos++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result >>> 0, next: pos };
}

function decodeSLEB128(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let pos = offset;
  let byte = 0;
  while (pos < bytes.length) {
    byte = bytes[pos++];
    result |= (byte & 0x7f) << shift;
    shift += 7;
    if ((byte & 0x80) === 0) break;
  }
  if (shift < 32 && (byte & 0x40) !== 0) {
    result |= ~0 << shift;
  }
  return { value: result, next: pos };
}

function encodeStringBytes(str: string): number[] {
  const encoded = new TextEncoder().encode(str);
  return [...encodeULEB128(encoded.length), ...Array.from(encoded)];
}

function wrapSection(sectionId: number, payload: number[]): number[] {
  return [sectionId, ...encodeULEB128(payload.length), ...payload];
}

export function generateWatFromWorkspace(
  rules: GrammarRule[],
  schemaName: string,
  _jsonText: string
): string {
  const safeSchema = (schemaName || 'GrammarSchema').replace(/["\\]/g, '');
  const ruleNames = rules
    .map((r) => r.name.replace(/["\\]/g, ''))
    .slice(0, 8)
    .join(',');
  const cleanPayload = `schema=${safeSchema};rules=${rules.length};names=${ruleNames}`;
  const ruleCount = rules.length;
  const totalBranches = rules.reduce((acc, r) => acc + r.alternatives.length, 0);

  return `(module
  ;; Grammar2JSON Studio — WABT S-Expression Module (${safeSchema})
  (memory (export "memory") 1)
  (data (i32.const 0) "${cleanPayload}")

  ;; Returns total parsed grammar rules (0 params)
  (func (export "rule_count") (result i32)
    (i32.const ${ruleCount})
  )

  ;; Returns total choice branches across rules (0 params)
  (func (export "branch_count") (result i32)
    (i32.const ${totalBranches})
  )

  ;; Checks whether rule index is within bounds (1 param)
  (func (export "is_valid_rule_idx") (param $idx i32) (result i32)
    (local.get $idx)
    (i32.const ${ruleCount})
    (i32.lt_u)
  )

  ;; Computes checksum step ($a + $b) (2 params)
  (func (export "add_score") (param $a i32) (param $b i32) (result i32)
    (local.get $a)
    (local.get $b)
    (i32.add)
  )
)`;
}

interface ParsedWatFunc {
  exportName: string;
  params: WasmParamSpec[];
  hasResult: boolean;
  bodyOps: number[];
  summary: string;
}

function extractBalancedFuncBlocks(watSource: string): { ok: true; blocks: string[] } | { ok: false; error: string } {
  // Strip line comments (;; ...) outside strings and check balanced parens
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < watSource.length; i += 1) {
    const ch = watSource[i];
    if (inStr) {
      if (ch === '"' && watSource[i - 1] !== '\\') inStr = false;
      continue;
    }
    if (ch === ';' && watSource[i + 1] === ';') {
      const nl = watSource.indexOf('\n', i);
      if (nl === -1) break;
      i = nl;
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth < 0) return { ok: false, error: 'Unmatched closing parenthesis ")" in WAT source.' };
    }
  }
  if (inStr) return { ok: false, error: 'Unclosed string literal in WAT source.' };
  if (depth !== 0) return { ok: false, error: `Unbalanced parentheses in WAT source (${depth} unclosed).` };

  const blocks: string[] = [];
  let cursor = 0;
  while (cursor < watSource.length) {
    const matchIdx = watSource.indexOf('(func', cursor);
    if (matchIdx === -1) break;
    let d = 0;
    let str = false;
    let endIdx = matchIdx;
    for (let i = matchIdx; i < watSource.length; i += 1) {
      const ch = watSource[i];
      if (str) {
        if (ch === '"' && watSource[i - 1] !== '\\') str = false;
        continue;
      }
      if (ch === ';' && watSource[i + 1] === ';') {
        const nl = watSource.indexOf('\n', i);
        if (nl === -1) {
          endIdx = watSource.length;
          break;
        }
        i = nl;
        continue;
      }
      if (ch === '"') str = true;
      else if (ch === '(') d += 1;
      else if (ch === ')') {
        d -= 1;
        if (d === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }
    blocks.push(watSource.slice(matchIdx, endIdx));
    cursor = Math.max(endIdx, matchIdx + 5);
  }
  return { ok: true, blocks };
}

function wasmValTypeCode(type: WasmParamSpec['type']): number {
  switch (type) {
    case 'i64':
      return 0x7e;
    case 'f32':
      return 0x7d;
    case 'f64':
      return 0x7c;
    case 'i32':
    default:
      return 0x7f;
  }
}

export function compileWatToWasm(watSource: string): WasmCompilationResult {
  try {
    const extracted = extractBalancedFuncBlocks(watSource);
    if (!extracted.ok) {
      return {
        valid: false,
        bytes: new Uint8Array(),
        hexDump: '',
        sizeBytes: 0,
        exports: [],
        dataPayload: '',
        astJson: { error: extracted.error },
        error: extracted.error,
      };
    }

    const dataMatch = watSource.match(/\(data\s+\(i32\.const\s+(\d+)\)\s+"((?:[^"\\]|\\.)*)"\)/);
    const dataOffset = dataMatch ? Number.parseInt(dataMatch[1], 10) : 0;
    const dataPayload = dataMatch ? dataMatch[2].replace(/\\"/g, '"') : '';

    const funcs: ParsedWatFunc[] = [];
    for (const block of extracted.blocks) {
      const expMatch = block.match(/\(export\s+"([^"]+)"\)/);
      if (!expMatch) continue;
      const exportName = expMatch[1];
      const paramMatches = Array.from(block.matchAll(/\(param(?:\s+(\$[A-Za-z0-9_]+))?\s+(i32|i64|f32|f64)\)/g));
      const params: WasmParamSpec[] = paramMatches.map((pm, idx) => ({
        name: pm[1] || `$p${idx}`,
        type: (pm[2] as WasmParamSpec['type']) || 'i32',
      }));
      const hasResult = /\(result\s+i32\)/.test(block);

      const ops: number[] = [];
      const constMatch = block.match(/\(i32\.const\s+(-?\d+)\)/);
      const hasAdd = /\(i32\.add\)|i32\.add/.test(block);
      const hasSub = /\(i32\.sub\)|i32\.sub/.test(block);
      const hasMul = /\(i32\.mul\)|i32\.mul/.test(block);
      const hasLtU = /\(i32\.lt_u\)|i32\.lt_u/.test(block);
      const hasEq = /\(i32\.eq\)|i32\.eq/.test(block);

      if (params.length >= 2 && (hasAdd || hasSub || hasMul || hasEq)) {
        ops.push(0x20, 0x00);
        ops.push(0x20, 0x01);
        ops.push(hasSub ? 0x6b : hasMul ? 0x6c : hasEq ? 0x46 : 0x6a);
      } else if (params.length === 1 && (hasLtU || hasAdd || hasSub || hasMul || hasEq)) {
        ops.push(0x20, 0x00);
        ops.push(0x41, ...encodeSLEB128(constMatch ? Number.parseInt(constMatch[1], 10) : 0));
        ops.push(hasLtU ? 0x49 : hasSub ? 0x6b : hasMul ? 0x6c : hasEq ? 0x46 : 0x6a);
      } else if (params.length === 1) {
        ops.push(0x20, 0x00);
      } else if (constMatch) {
        ops.push(0x41, ...encodeSLEB128(Number.parseInt(constMatch[1], 10)));
      } else {
        ops.push(0x41, 0x00);
      }
      ops.push(0x0b);

      funcs.push({
        exportName,
        params,
        hasResult,
        bodyOps: ops,
        summary: `(${params.map((p) => `${p.name}: ${p.type}`).join(', ')}) -> ${hasResult ? 'i32' : 'void'}`,
      });
    }

    if (funcs.length === 0) {
      funcs.push({
        exportName: 'rule_count',
        params: [],
        hasResult: true,
        bodyOps: [0x41, 0x00, 0x0b],
        summary: '() -> i32',
      });
    }

    const typePayload: number[] = [...encodeULEB128(funcs.length)];
    for (const fn of funcs) {
      typePayload.push(0x60);
      typePayload.push(...encodeULEB128(fn.params.length));
      for (const param of fn.params) {
        typePayload.push(wasmValTypeCode(param.type));
      }
      typePayload.push(fn.hasResult ? 0x01 : 0x00);
      if (fn.hasResult) typePayload.push(0x7f);
    }

    const funcSectionPayload: number[] = [...encodeULEB128(funcs.length)];
    funcs.forEach((_, idx) => funcSectionPayload.push(...encodeULEB128(idx)));

    const memPayload: number[] = [0x01, 0x00, 0x01];

    const exportPayload: number[] = [...encodeULEB128(funcs.length + 1)];
    exportPayload.push(...encodeStringBytes('memory'), 0x02, 0x00);
    funcs.forEach((fn, idx) => {
      exportPayload.push(...encodeStringBytes(fn.exportName), 0x00, ...encodeULEB128(idx));
    });

    const codePayload: number[] = [...encodeULEB128(funcs.length)];
    for (const fn of funcs) {
      const bodyWithLocals = [0x00, ...fn.bodyOps];
      codePayload.push(...encodeULEB128(bodyWithLocals.length), ...bodyWithLocals);
    }

    const dataBytes = Array.from(new TextEncoder().encode(dataPayload));
    const dataSectionPayload: number[] = [
      0x01,
      0x00,
      0x41,
      ...encodeSLEB128(dataOffset),
      0x0b,
      ...encodeULEB128(dataBytes.length),
      ...dataBytes,
    ];

    const binaryArray = [
      0x00, 0x61, 0x73, 0x6d,
      0x01, 0x00, 0x00, 0x00,
      ...wrapSection(0x01, typePayload),
      ...wrapSection(0x03, funcSectionPayload),
      ...wrapSection(0x05, memPayload),
      ...wrapSection(0x07, exportPayload),
      ...wrapSection(0x0a, codePayload),
      ...(dataBytes.length > 0 ? wrapSection(0x0b, dataSectionPayload) : []),
    ];

    const bytes = new Uint8Array(binaryArray);
    const valid = typeof WebAssembly !== 'undefined' ? WebAssembly.validate(bytes) : true;
    const hexDump = formatHexDump(bytes);

    const exports: WasmExportEntry[] = [
      { name: 'memory', kind: 'memory', index: 0, params: [], result: null },
      ...funcs.map((f, idx) => ({
        name: f.exportName,
        kind: 'func' as const,
        index: idx,
        params: f.params,
        result: f.hasResult ? 'i32' : null,
      })),
    ];

    const astJson = {
      type: 'WasmModule',
      magic: '0x0061736d',
      version: 1,
      validatedByBrowserEngine: valid,
      byteLength: bytes.length,
      memory: { export: 'memory', initialPages: 1 },
      dataSegment: { offset: dataOffset, byteLength: dataBytes.length, preview: dataPayload },
      functions: funcs.map((f, idx) => ({
        index: idx,
        export: f.exportName,
        params: f.params,
        signature: f.summary,
        opcodeBytes: f.bodyOps.map((b) => `0x${b.toString(16).padStart(2, '0')}`),
      })),
    };

    return {
      valid,
      bytes,
      hexDump,
      sizeBytes: bytes.length,
      exports,
      dataPayload,
      astJson,
    };
  } catch (err) {
    return {
      valid: false,
      bytes: new Uint8Array(),
      hexDump: '',
      sizeBytes: 0,
      exports: [],
      dataPayload: '',
      astJson: { error: err instanceof Error ? err.message : 'WASM encode error' },
      error: err instanceof Error ? err.message : 'WASM encode error',
    };
  }
}

export function decompileWasmToWat(bytes: Uint8Array): { ok: true; wat: string } | { ok: false; error: string } {
  if (bytes.length < 8 || bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
    return { ok: false, error: 'Invalid WASM binary header (expected \\0asm magic bytes).' };
  }

  let pos = 8;
  const funcTypes: Array<{ params: number; results: number }> = [];
  const funcTypeIndices: number[] = [];
  const exportNames = new Map<number, string>();
  const funcBodies: Array<string[]> = [];
  let dataStr = '';
  let dataOffset = 0;

  while (pos < bytes.length) {
    const secId = bytes[pos++];
    const secSize = decodeULEB128(bytes, pos);
    pos = secSize.next;
    const secEnd = pos + secSize.value;

    if (secId === 0x01) {
      const count = decodeULEB128(bytes, pos);
      let cur = count.next;
      for (let i = 0; i < count.value; i += 1) {
        cur += 1;
        const pCount = decodeULEB128(bytes, cur);
        cur = pCount.next + pCount.value;
        const rCount = decodeULEB128(bytes, cur);
        cur = rCount.next + rCount.value;
        funcTypes.push({ params: pCount.value, results: rCount.value });
      }
    } else if (secId === 0x03) {
      const count = decodeULEB128(bytes, pos);
      let cur = count.next;
      for (let i = 0; i < count.value; i += 1) {
        const ti = decodeULEB128(bytes, cur);
        funcTypeIndices.push(ti.value);
        cur = ti.next;
      }
    } else if (secId === 0x07) {
      const count = decodeULEB128(bytes, pos);
      let cur = count.next;
      for (let i = 0; i < count.value; i += 1) {
        const nameLen = decodeULEB128(bytes, cur);
        cur = nameLen.next;
        const name = new TextDecoder().decode(bytes.slice(cur, cur + nameLen.value));
        cur += nameLen.value;
        const kind = bytes[cur++];
        const idx = decodeULEB128(bytes, cur);
        cur = idx.next;
        if (kind === 0x00) exportNames.set(idx.value, name);
      }
    } else if (secId === 0x0a) {
      const count = decodeULEB128(bytes, pos);
      let cur = count.next;
      for (let i = 0; i < count.value; i += 1) {
        const bodySize = decodeULEB128(bytes, cur);
        cur = bodySize.next;
        const bodyEnd = cur + bodySize.value;
        const localDecls = decodeULEB128(bytes, cur);
        let opPos = localDecls.next;
        const ops: string[] = [];
        while (opPos < bodyEnd) {
          const opcode = bytes[opPos++];
          if (opcode === 0x41) {
            const val = decodeSLEB128(bytes, opPos);
            ops.push(`    (i32.const ${val.value})`);
            opPos = val.next;
          } else if (opcode === 0x20) {
            const idx = decodeULEB128(bytes, opPos);
            ops.push(`    (local.get $p${idx.value})`);
            opPos = idx.next;
          } else if (opcode === 0x46) {
            ops.push('    (i32.eq)');
          } else if (opcode === 0x49) {
            ops.push('    (i32.lt_u)');
          } else if (opcode === 0x6a) {
            ops.push('    (i32.add)');
          } else if (opcode === 0x6b) {
            ops.push('    (i32.sub)');
          } else if (opcode === 0x6c) {
            ops.push('    (i32.mul)');
          } else if (opcode === 0x0b) {
            break;
          }
        }
        funcBodies.push(ops);
        cur = bodyEnd;
      }
    } else if (secId === 0x0b) {
      const count = decodeULEB128(bytes, pos);
      let cur = count.next;
      if (count.value > 0) {
        cur += 1;
        if (bytes[cur] === 0x41) {
          const off = decodeSLEB128(bytes, cur + 1);
          dataOffset = off.value;
          cur = off.next + 1;
        }
        const dLen = decodeULEB128(bytes, cur);
        cur = dLen.next;
        dataStr = new TextDecoder().decode(bytes.slice(cur, cur + dLen.value));
      }
    }

    pos = secEnd;
  }

  const lines: string[] = ['(module', '  ;; Decompiled via wasm2wat binary decoder', '  (memory (export "memory") 1)'];
  if (dataStr) {
    lines.push(`  (data (i32.const ${dataOffset}) "${dataStr.replace(/"/g, '\\"')}")`);
  }
  lines.push('');

  funcBodies.forEach((ops, idx) => {
    const expName = exportNames.get(idx) || `fn_${idx}`;
    const sig = funcTypes[funcTypeIndices[idx] ?? idx] || { params: 0, results: 1 };
    const paramStr = Array.from({ length: sig.params }, (_, p) => `(param $p${p} i32)`).join(' ');
    const resStr = sig.results > 0 ? '(result i32)' : '';
    const header = [`(export "${expName}")`, paramStr, resStr].filter(Boolean).join(' ');
    lines.push(`  (func ${header}`);
    lines.push(...ops);
    lines.push('  )');
    lines.push('');
  });

  lines.push(')');
  return { ok: true, wat: lines.join('\n') };
}

export function formatHexDump(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.slice(i, i + 16);
    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ')
      .padEnd(47, ' ');
    const ascii = Array.from(slice)
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
      .join('');
    lines.push(`${i.toString(16).padStart(4, '0')}  ${hex}  |${ascii}|`);
  }
  return lines.join('\n');
}

export async function executeWasmExport(
  bytes: Uint8Array,
  exportName: string,
  args: number[]
): Promise<{ ok: true; value: number } | { ok: false; error: string }> {
  try {
    const bufferCopy = new Uint8Array(bytes).buffer;
    const { instance } = await WebAssembly.instantiate(bufferCopy);
    const fn = instance.exports[exportName];
    if (typeof fn !== 'function') {
      return { ok: false, error: `Export '${exportName}' is not a callable function.` };
    }
    const result = (fn as (...callArgs: number[]) => number)(...args);
    return { ok: true, value: result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'WASM execution error' };
  }
}
