import {
  evaluateLogicStatement,
  extractLambdaParamsAndBody,
  formatNamedCallbackSignature,
  parseLogicExpression,
  type LogicLabelBinding,
} from './logicLambdaEngine.ts';

export interface GlobalCallbackDef {
  id: string;
  name: string;
  params: string[];
  body: string;
  lambdaExpr: string;
  description?: string;
  savedAt: string;
  source?: 'logic_calc' | 'rule_props' | 'manual';
}

export interface PropertyCallbackResolution {
  rawValue: string;
  hasCallbackCall: boolean;
  usedCallbacks: string[];
  ok: boolean;
  resolvedValue: string;
  valueType: 'string' | 'number' | 'boolean' | 'lambda' | 'error';
  error?: string;
}

export const GLOBAL_CALLBACKS_STORAGE_KEY = 'g2j_global_callbacks_v1';

export const DEFAULT_GLOBAL_CALLBACKS: GlobalCallbackDef[] = [
  {
    id: 'gcb_tax_fn',
    name: 'tax_fn',
    params: ['x'],
    body: 'x * 1.08',
    lambdaExpr: 'λx. x * 1.08',
    description: 'Applies 8% tax multiplier to a numeric amount.',
    savedAt: '2026-01-01T00:00:00.000Z',
    source: 'manual',
  },
  {
    id: 'gcb_apply_discount',
    name: 'apply_discount',
    params: ['cb', 'v'],
    body: 'cb(v) - 10',
    lambdaExpr: 'λcb. λv. cb(v) - 10',
    description: 'Applies a callback transform to a value and subtracts a flat 10 discount.',
    savedAt: '2026-01-01T00:00:00.000Z',
    source: 'manual',
  },
  {
    id: 'gcb_within_limit',
    name: 'within_limit',
    params: ['val', 'max_val'],
    body: 'val ≤ max_val',
    lambdaExpr: 'λval. λmax_val. val ≤ max_val',
    description: 'Checks whether a value stays at or below a threshold.',
    savedAt: '2026-01-01T00:00:00.000Z',
    source: 'manual',
  },
];

export function buildLambdaExprFromParams(params: string[], body: string): string {
  const cleanParams = params
    .map((p) => p.trim())
    .filter((p) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(p));
  const cleanBody = body.trim() || (cleanParams[0] || 'x');
  if (cleanParams.length === 0) return `λx. ${cleanBody}`;
  return `${cleanParams.map((p) => `λ${p}.`).join(' ')} ${cleanBody}`;
}

export function normalizeGlobalCallback(input: {
  id?: string;
  name: string;
  lambdaExpr?: string;
  params?: string[];
  body?: string;
  description?: string;
  source?: 'logic_calc' | 'rule_props' | 'manual';
}): GlobalCallbackDef | null {
  const cleanName = input.name.trim().replace(/[^A-Za-z0-9_]/g, '_');
  if (!cleanName || !/^[A-Za-z_]/.test(cleanName)) return null;

  let params = (input.params || []).map((p) => p.trim()).filter(Boolean);
  let body = (input.body || '').trim();
  let lambdaExpr = (input.lambdaExpr || '').trim();

  if (lambdaExpr) {
    const unwrapped = extractLambdaParamsAndBody(lambdaExpr);
    if (unwrapped) {
      params = unwrapped.params;
      if (!body) {
        // Recover readable body after last lambda dot
        const lastDot = lambdaExpr.lastIndexOf('.');
        body = lastDot >= 0 ? lambdaExpr.slice(lastDot + 1).trim() : lambdaExpr;
      }
    } else if (params.length > 0 && !body) {
      body = lambdaExpr;
      lambdaExpr = buildLambdaExprFromParams(params, body);
    }
  } else {
    if (params.length === 0) params = ['x'];
    if (!body) body = params[0];
    lambdaExpr = buildLambdaExprFromParams(params, body);
  }

  if (params.length === 0) params = ['x'];
  if (!lambdaExpr) lambdaExpr = buildLambdaExprFromParams(params, body || params[0]);

  return {
    id: input.id || `gcb_${cleanName}_${Date.now()}`,
    name: cleanName,
    params,
    body: body || lambdaExpr,
    lambdaExpr,
    description: input.description?.trim() || undefined,
    savedAt: new Date().toISOString(),
    source: input.source || 'manual',
  };
}

export function loadGlobalCallbacks(): GlobalCallbackDef[] {
  if (typeof window === 'undefined') return DEFAULT_GLOBAL_CALLBACKS;
  try {
    const raw = window.localStorage.getItem(GLOBAL_CALLBACKS_STORAGE_KEY);
    if (!raw) return DEFAULT_GLOBAL_CALLBACKS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_GLOBAL_CALLBACKS;
    const valid = parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const c = item as Partial<GlobalCallbackDef>;
        if (!c.name || !c.lambdaExpr) return null;
        return normalizeGlobalCallback({
          id: c.id,
          name: c.name,
          params: Array.isArray(c.params) ? c.params : undefined,
          body: c.body,
          lambdaExpr: c.lambdaExpr,
          description: c.description,
          source: c.source,
        });
      })
      .filter((x): x is GlobalCallbackDef => x !== null);
    return valid.length > 0 ? valid : DEFAULT_GLOBAL_CALLBACKS;
  } catch {
    return DEFAULT_GLOBAL_CALLBACKS;
  }
}

export function saveGlobalCallbacks(callbacks: GlobalCallbackDef[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GLOBAL_CALLBACKS_STORAGE_KEY, JSON.stringify(callbacks));
  } catch {
    // Ignore storage quota errors in sandboxed iframes
  }
}

export function upsertGlobalCallback(
  list: GlobalCallbackDef[],
  input: Parameters<typeof normalizeGlobalCallback>[0]
): { list: GlobalCallbackDef[]; saved: GlobalCallbackDef | null; updated: boolean } {
  const normalized = normalizeGlobalCallback(input);
  if (!normalized) return { list, saved: null, updated: false };

  const existingIdx = list.findIndex((c) => c.name === normalized.name);
  if (existingIdx >= 0) {
    const updatedItem: GlobalCallbackDef = {
      ...normalized,
      id: list[existingIdx].id,
    };
    const next = [...list];
    next[existingIdx] = updatedItem;
    return { list: next, saved: updatedItem, updated: true };
  }
  return { list: [...list, normalized], saved: normalized, updated: false };
}

export function removeGlobalCallback(
  list: GlobalCallbackDef[],
  idOrName: string
): GlobalCallbackDef[] {
  return list.filter((c) => c.id !== idOrName && c.name !== idOrName);
}

/**
 * Merges saved local global callbacks with workbench-local labels.
 * Local labels with the same name take precedence while global callbacks remain callable everywhere.
 */
export function mergeGlobalCallbacksWithLabels(
  globalCallbacks: GlobalCallbackDef[],
  localLabels: LogicLabelBinding[]
): LogicLabelBinding[] {
  const localNames = new Set(localLabels.map((l) => l.name.trim()).filter(Boolean));
  const globalBindings: LogicLabelBinding[] = globalCallbacks
    .filter((cb) => !localNames.has(cb.name))
    .map((cb) => ({
      id: `global_${cb.id}`,
      name: cb.name,
      kind: 'lambda',
      value: cb.lambdaExpr,
    }));
  return [...globalBindings, ...localLabels];
}

export function formatGlobalCallbackCallTemplate(cb: GlobalCallbackDef): string {
  return formatNamedCallbackSignature(cb.name, cb.params);
}

function findReferencedCallbacks(expr: string, callbackNames: Set<string>): string[] {
  const found = new Set<string>();
  const re = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(expr)) !== null) {
    if (callbackNames.has(match[1])) {
      found.add(match[1]);
    }
  }
  return Array.from(found);
}

/**
 * Evaluates a property value that may call any saved global callback (or local lambda label),
 * either directly (`tax_fn (100)`, `=apply_discount (200, 10)`) or embedded via `{{...}}` / `${...}`.
 */
export function evaluatePropertyValueWithCallbacks(
  rawValue: string,
  globalCallbacks: GlobalCallbackDef[],
  localLabels: LogicLabelBinding[]
): PropertyCallbackResolution {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return {
      rawValue,
      hasCallbackCall: false,
      usedCallbacks: [],
      ok: true,
      resolvedValue: rawValue,
      valueType: 'string',
    };
  }

  const mergedLabels = mergeGlobalCallbacksWithLabels(globalCallbacks, localLabels);
  const callableNames = new Set<string>(
    mergedLabels.filter((l) => l.kind === 'lambda').map((l) => l.name.trim())
  );

  // 1. Check for embedded template interpolations: {{expr}} or ${expr}
  const templateRegex = /(?:\{\{([^}]+)\}\}|\$\{([^}]+)\})/g;
  if (templateRegex.test(trimmed)) {
    templateRegex.lastIndex = 0;
    const used = new Set<string>();
    let failedError: string | undefined;
    const replaced = rawValue.replace(templateRegex, (_full, g1: string | undefined, g2: string | undefined) => {
      const expr = (g1 ?? g2 ?? '').trim();
      for (const name of findReferencedCallbacks(expr, callableNames)) {
        used.add(name);
      }
      const res = evaluateLogicStatement(expr, mergedLabels);
      if (!res.ok) {
        failedError = res.error || `Failed to evaluate "${expr}"`;
        return _full;
      }
      return res.displayValue;
    });

    return {
      rawValue,
      hasCallbackCall: true,
      usedCallbacks: Array.from(used),
      ok: !failedError,
      resolvedValue: failedError ? rawValue : replaced,
      valueType: failedError ? 'error' : 'string',
      error: failedError,
    };
  }

  // 2. Check for explicit formula prefix `=...` OR direct callback call referencing a saved callback
  const explicitFormula = trimmed.startsWith('=');
  const candidateExpr = explicitFormula ? trimmed.slice(1).trim() : trimmed;
  const usedCallbacks = findReferencedCallbacks(candidateExpr, callableNames);

  if (!explicitFormula && usedCallbacks.length === 0) {
    return {
      rawValue,
      hasCallbackCall: false,
      usedCallbacks: [],
      ok: true,
      resolvedValue: rawValue,
      valueType: 'string',
    };
  }

  // Verify expression parses before evaluating
  const parsed = parseLogicExpression(candidateExpr);
  if (!parsed.ok) {
    return {
      rawValue,
      hasCallbackCall: true,
      usedCallbacks,
      ok: false,
      resolvedValue: rawValue,
      valueType: 'error',
      error: parsed.error,
    };
  }

  const evalRes = evaluateLogicStatement(candidateExpr, mergedLabels);
  if (!evalRes.ok) {
    return {
      rawValue,
      hasCallbackCall: true,
      usedCallbacks,
      ok: false,
      resolvedValue: rawValue,
      valueType: 'error',
      error: evalRes.error || 'Callback evaluation failed.',
    };
  }

  return {
    rawValue,
    hasCallbackCall: true,
    usedCallbacks,
    ok: true,
    resolvedValue: evalRes.displayValue,
    valueType: evalRes.valueType,
  };
}
