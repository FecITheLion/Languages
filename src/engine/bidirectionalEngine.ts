import type {
  DialectConfig,
  EvaluationResult,
  EvaluationTraceStep,
  ExportLanguage,
  GrammarDiagnostic,
  GrammarRule,
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
} from '../types/studio';

export const DEFAULT_MUTATION_POLICY: MutationPolicy = {
  allowImportMutation: true,
  allowExportMutation: true,
  allowedTargets: ['jsonld', 'python', 'rust', 'wasm'],
  lockedRules: [],
};

/* ============================================================================
 * 1. GRAMMAR PARSER (EBNF, BNF, PEG, Python PEG, Rust Macro, WABT S-Expr)
 * ========================================================================== */

function splitOutsideQuotes(input: string, delimiter: string): string[] {
  if (!delimiter) return [input.trim()];
  const result: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
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
    if (input.startsWith(delimiter, i)) {
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

export function parseGrammar(text: string, dialect: DialectConfig): GrammarRule[] {
  const op = dialect.ruleOperator || '::=';
  const delim = dialect.choiceDelimiter || '|';
  const comment = dialect.commentPrefix || '//';
  const lines = text.split(/\r?\n/);

  const rawRules: Array<{ lineNumber: number; name: string; expression: string; rawLine: string }> = [];

  lines.forEach((rawLine, index) => {
    let cleaned = rawLine.trim();
    if (!cleaned) return;
    if (comment && cleaned.startsWith(comment)) return;
    if (comment) {
      let quote: string | null = null;
      for (let i = 0; i < cleaned.length; i += 1) {
        const ch = cleaned[i];
        if (quote) {
          if (ch === quote && cleaned[i - 1] !== '\\') quote = null;
        } else if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (cleaned.startsWith(comment, i)) {
          cleaned = cleaned.slice(0, i).trim();
          break;
        }
      }
    }
    const opIdx = cleaned.indexOf(op);
    if (opIdx <= 0) return;

    const name = cleaned.slice(0, opIdx).trim().replace(/^<|>$/g, '');
    const expression = cleaned.slice(opIdx + op.length).trim();
    if (!name || !expression) return;

    rawRules.push({
      lineNumber: index + 1,
      name,
      expression,
      rawLine: cleaned,
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

    const stripped = r.expression.replace(literalRegex, ' ');
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
  const op = dialect.ruleOperator || '::=';
  const comment = dialect.commentPrefix || '//';

  // 1. Line-level syntax diagnostics
  rawGrammarText.split(/\r?\n/).forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    const lineNumber = idx + 1;
    if (!trimmed) return;
    if (comment && trimmed.startsWith(comment)) return;

    // Strip inline comments outside quotes
    let codePart = trimmed;
    if (comment) {
      let q: string | null = null;
      for (let i = 0; i < trimmed.length; i += 1) {
        const ch = trimmed[i];
        if (q) {
          if (ch === q && trimmed[i - 1] !== '\\') q = null;
        } else if (ch === '"' || ch === "'") {
          q = ch;
        } else if (trimmed.startsWith(comment, i)) {
          codePart = trimmed.slice(0, i).trim();
          break;
        }
      }
    }
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

    const opIdx = codePart.indexOf(op);
    if (opIdx <= 0) {
      diagnostics.push({
        id: `diag-op-${lineNumber}`,
        severity: 'error',
        lineNumber,
        code: 'SYNTAX_OPERATOR',
        message: `Line ${lineNumber}: Missing rule operator "${op}" or rule identifier.`,
      });
    } else if (!codePart.slice(opIdx + op.length).trim()) {
      diagnostics.push({
        id: `diag-empty-rhs-${lineNumber}`,
        severity: 'error',
        lineNumber,
        code: 'SYNTAX_OPERATOR',
        message: `Line ${lineNumber}: Rule expression after "${op}" cannot be empty.`,
      });
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

  const nodes: RuleGraphNode[] = allNames.map((name) => {
    const rule = ruleByName.get(name);
    const lvl = levelMap.get(name) || 0;
    const orderInLevel = levelBuckets.get(lvl)?.indexOf(name) ?? 0;
    const outList = adj.get(name) || [];
    const inDeg = inDegree.get(name) || 0;

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
  const op = dialect.ruleOperator || '::=';
  const body = orderedRules.map((r) => `${r.name} ${op} ${r.expression}`);
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
      lines.push(`${r.name} ${params.dialect.ruleOperator} ${normalizeExpressionQuotes(r.expression)}`);
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
    const content = `${base}
ORDER_OF_OPERATIONS = [
${orderLines.join('\n')}
]

RULE_PROPERTIES = {
${propLines.join('\n')}
}
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

  // TypeScript typed grammar & order-of-operations export
  const tsRules = orderedRules.map((r, idx) => {
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

export const GRAMMAR_RULES: CompiledGrammarRule[] = ${JSON.stringify(tsRules, null, 2)};

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

export function inferLineMutations(
  rules: GrammarRule[],
  existing: Record<string, LineMutation> = {}
): Record<string, LineMutation> {
  const next: Record<string, LineMutation> = {};

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

    next[rule.name] = prev
      ? { ...prev, ruleName: rule.name }
      : {
          ruleName: rule.name,
          targetProperty: rule.name,
          jsonType: allNumericLiterals ? 'number' : 'string',
          patternOverride: inferredPattern,
          description: `Compiled from grammar rule '${rule.name}' (${rule.alternatives.length} branch${rule.alternatives.length === 1 ? '' : 'es'})`,
          enabled: true,
        };
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
      ruleOperator: rawDialect.ruleOperator || fallbackDialect.ruleOperator,
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
        if (Array.isArray(term.additionalProperty)) {
          const exprProp = term.additionalProperty.find(
            (p) => p && typeof p === 'object' && (p as Record<string, unknown>).name === 'expression'
          ) as Record<string, unknown> | undefined;
          if (exprProp && typeof exprProp.value === 'string') {
            expression = exprProp.value;
          }
        }
        if (!expression && term.potentialAction && typeof term.potentialAction === 'object') {
          const opts = (term.potentialAction as Record<string, unknown>).actionOption;
          if (Array.isArray(opts)) {
            expression = opts.map(String).join(` ${dialect.choiceDelimiter} `);
          }
        }
        if (name && expression) {
          lines.push(`${name} ${dialect.ruleOperator} ${expression}`);
        }
      }
    } else if (sourceDoc.$defs && typeof sourceDoc.$defs === 'object') {
      for (const [key, val] of Object.entries(sourceDoc.$defs as Record<string, unknown>)) {
        if (!val || typeof val !== 'object') continue;
        const def = val as Record<string, unknown>;
        if (typeof def['x-grammar-expression'] === 'string') {
          lines.push(`${key} ${dialect.ruleOperator} ${normalizeExpressionQuotes(def['x-grammar-expression'])}`);
        } else if (Array.isArray(def.enum)) {
          const alts = def.enum
            .map((v) => {
              const s = String(v);
              return !s.includes("'") ? `'${s}'` : JSON.stringify(s);
            })
            .join(` ${dialect.choiceDelimiter} `);
          lines.push(`${key} ${dialect.ruleOperator} ${alts}`);
        }
      }
    }

    return {
      ok: true,
      grammar: lines.join('\n'),
      dialect,
      schemaName,
      schemaType,
      mutationPolicy,
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
 * 4. RECURSIVE GRAMMAR EVALUATOR WITH FULL BACKTRACKING & LONGEST-MATCH TRACE
 * ========================================================================== */

interface SequenceItem {
  kind: 'literal' | 'rule';
  value: string;
}

interface MatchOutcome {
  endPos: number;
  trace: EvaluationTraceStep[];
}

function tokenizeAlternative(alt: string): SequenceItem[] {
  const items: SequenceItem[] = [];
  let i = 0;
  while (i < alt.length) {
    const ch = alt[i];
    if (/\s|,/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let lit = '';
      i += 1;
      while (i < alt.length && alt[i] !== quote) {
        if (alt[i] === '\\' && i + 1 < alt.length) {
          lit += alt[i + 1];
          i += 2;
        } else {
          lit += alt[i];
          i += 1;
        }
      }
      i += 1;
      items.push({ kind: 'literal', value: lit });
      continue;
    }
    if (ch === '<') {
      const end = alt.indexOf('>', i);
      if (end > i) {
        items.push({ kind: 'rule', value: alt.slice(i + 1, end).trim() });
        i = end + 1;
        continue;
      }
    }
    const idMatch = alt.slice(i).match(/^[A-Za-z_][A-Za-z0-9_-]*/);
    if (idMatch) {
      items.push({ kind: 'rule', value: idMatch[0] });
      i += idMatch[0].length;
      continue;
    }
    i += 1;
  }
  return items;
}

export function evaluateGrammarPayload(
  rules: GrammarRule[],
  startRuleName: string,
  payload: string
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
  for (const r of rules) ruleMap.set(r.name, r);

  const startRule = ruleMap.get(startRuleName) || rules[0];
  const MAX_DEPTH = 24;
  const MAX_OUTCOMES_PER_NODE = 16;
  const activeCalls = new Set<string>();

  function matchSequence(
    seq: SequenceItem[],
    index: number,
    pos: number,
    depth: number
  ): MatchOutcome[] {
    if (index >= seq.length) {
      return [{ endPos: pos, trace: [] }];
    }

    const item = seq[index];
    const results: MatchOutcome[] = [];

    if (item.kind === 'literal') {
      if (payload.startsWith(item.value, pos)) {
        const litStep: EvaluationTraceStep = {
          depth,
          rule: `"${item.value}"`,
          inputSlice: payload.slice(pos, pos + 16),
          matched: true,
          consumed: item.value,
          note: 'Terminal literal matched',
        };
        const rest = matchSequence(seq, index + 1, pos + item.value.length, depth);
        for (const r of rest) {
          results.push({ endPos: r.endPos, trace: [litStep, ...r.trace] });
        }
      }
      return results;
    }

    // Non-terminal reference: explore all valid outcomes (backtracking)
    const subOutcomes = matchRuleAll(item.value, pos, depth);
    for (const sub of subOutcomes) {
      const rest = matchSequence(seq, index + 1, sub.endPos, depth);
      for (const r of rest) {
        results.push({ endPos: r.endPos, trace: [...sub.trace, ...r.trace] });
        if (results.length >= MAX_OUTCOMES_PER_NODE) break;
      }
      if (results.length >= MAX_OUTCOMES_PER_NODE) break;
    }
    return results;
  }

  function matchRuleAll(ruleName: string, pos: number, depth: number): MatchOutcome[] {
    if (depth > MAX_DEPTH) return [];
    const callKey = `${ruleName}@${pos}`;
    if (activeCalls.has(callKey)) return [];
    const rule = ruleMap.get(ruleName);
    if (!rule) return [];

    activeCalls.add(callKey);
    const collected: MatchOutcome[] = [];
    const seenEndPos = new Set<number>();

    try {
      // Explore all alternatives so shorter prefixes (e.g., `digit | digit digit`)
      // do not prematurely shadow longer full matches!
      for (const alt of rule.alternatives) {
        const seq = tokenizeAlternative(alt);
        if (seq.length === 0) continue;

        const seqOutcomes = matchSequence(seq, 0, pos, depth + 1);
        for (const out of seqOutcomes) {
          if (seenEndPos.has(out.endPos)) continue;
          seenEndPos.add(out.endPos);
          const headerStep: EvaluationTraceStep = {
            depth,
            rule: ruleName,
            inputSlice: payload.slice(pos, pos + 20),
            matched: true,
            consumed: payload.slice(pos, out.endPos),
            note: `Matched branch: ${alt}`,
          };
          collected.push({
            endPos: out.endPos,
            trace: [headerStep, ...out.trace],
          });
        }
      }
    } finally {
      activeCalls.delete(callKey);
    }

    // Prefer longest match first so greedy/maximal parses resolve cleanly
    collected.sort((a, b) => b.endPos - a.endPos);
    return collected.slice(0, MAX_OUTCOMES_PER_NODE);
  }

  const outcomes = matchRuleAll(startRule.name, 0, 0);
  const fullOutcome = outcomes.find((o) => o.endPos === payload.length);
  const bestOutcome = fullOutcome || outcomes[0] || null;

  if (fullOutcome) {
    return {
      matched: true,
      consumedLength: fullOutcome.endPos,
      remaining: '',
      summary: `Valid match for <${startRule.name}> (${fullOutcome.endPos}/${payload.length} chars)`,
      detail: `Consumed all ${payload.length} characters across ${fullOutcome.trace.length} expansion steps.`,
      trace: fullOutcome.trace.slice(0, 140),
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
      trace: bestOutcome.trace.slice(0, 140),
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
      },
    ],
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
            lines.push(`${String(k.value)} ${dialect.ruleOperator} ${String(v.value)}`);
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
    lines.push(`${entry.key} ${dialect.ruleOperator} ${entry.value}`);
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
