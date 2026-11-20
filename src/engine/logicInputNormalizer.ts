import type { LogicLabelBinding } from './logicLambdaEngine.ts';
import { parseLogicExpression } from './logicLambdaEngine.ts';

export interface LogicEvaluationInputDefaults {
  statement: string;
  labels: LogicLabelBinding[];
}

export interface NormalizedLogicEvaluationInput {
  statement: string;
  labels: LogicLabelBinding[];
}

export type LogicInputNormalizationResult =
  | { ok: true; input: NormalizedLogicEvaluationInput }
  | { ok: false; error: string };

type Literal = string | number | boolean;
type LabelInput = Literal | { kind: LogicLabelBinding['kind']; value: Literal };

const LABEL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUMBER_LITERAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const BOOLEAN_LITERALS = new Set(['true', 'false', '⊤', '⊥', '1', '0']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isLiteral(value: unknown): value is Literal {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function validLambda(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?:λ|\\)\s*[A-Za-z_][A-Za-z0-9_]*\s*\./.test(value.trim())) {
    return false;
  }
  const parsed = parseLogicExpression(value);
  return parsed.ok && parsed.ast.type === 'Lambda';
}

function normalizeValue(
  name: string,
  raw: unknown,
  requestedKind: LogicLabelBinding['kind'] | undefined,
  existing: LogicLabelBinding | undefined
): { ok: true; binding: LogicLabelBinding } | { ok: false; error: string } {
  if (!LABEL_NAME.test(name)) {
    return { ok: false, error: `Invalid logic label name '${name}'. Use an identifier.` };
  }

  let kind = requestedKind ?? existing?.kind;
  let value: unknown = raw;

  if (isRecord(raw)) {
    const keys = Object.keys(raw);
    if (
      keys.length !== 2 ||
      !Object.hasOwn(raw, 'kind') ||
      !Object.hasOwn(raw, 'value') ||
      (raw.kind !== 'number' && raw.kind !== 'boolean' && raw.kind !== 'lambda')
    ) {
      return {
        ok: false,
        error: `Logic label '${name}' object values must contain exactly a valid "kind" and "value".`,
      };
    }
    kind = raw.kind;
    value = raw.value;
  }

  if (!kind) {
    if (typeof value === 'boolean') {
      kind = 'boolean';
    } else if (typeof value === 'number') {
      kind = 'number';
    } else if (
      typeof value === 'string' &&
      NUMBER_LITERAL.test(value.trim()) &&
      Number.isFinite(Number(value))
    ) {
      kind = 'number';
    } else if (typeof value === 'string' && BOOLEAN_LITERALS.has(value.trim().toLowerCase())) {
      kind = 'boolean';
    } else {
      return {
        ok: false,
        error: `Cannot infer a literal kind for new logic label '${name}'; use a number, boolean, or { "kind": "lambda", "value": "λx. ..." }.`,
      };
    }
  }

  if (kind === 'lambda') {
    if (!validLambda(value)) {
      return {
        ok: false,
        error: `Lambda label '${name}' must have a non-empty λ/\\ abstraction value.`,
      };
    }
  } else if (kind === 'boolean') {
    if (
      typeof value === 'boolean'
    ) {
      value = String(value);
    } else if (typeof value === 'number' && (value === 0 || value === 1)) {
      value = String(value);
    } else if (
      typeof value === 'string' &&
      BOOLEAN_LITERALS.has(value.trim().toLowerCase())
    ) {
      value = value.trim();
    } else {
      return { ok: false, error: `Boolean logic label '${name}' must be true, false, 1, 0, ⊤, or ⊥.` };
    }
  } else {
    if (typeof value === 'number' && Number.isFinite(value)) {
      value = String(value);
    } else if (
      typeof value === 'string' &&
      NUMBER_LITERAL.test(value.trim()) &&
      Number.isFinite(Number(value))
    ) {
      value = value.trim();
    } else {
      return { ok: false, error: `Numeric logic label '${name}' must have a finite numeric literal value.` };
    }
  }

  const stringValue = String(value);
  return {
    ok: true,
    binding: {
      id: existing?.id ?? `input_${name}`,
      name,
      kind,
      value: stringValue,
    },
  };
}

function isCompleteBinding(value: unknown): value is LogicLabelBinding {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.kind === 'number' || value.kind === 'boolean' || value.kind === 'lambda') &&
    typeof value.value === 'string'
  );
}

function validExpression(value: string): boolean {
  return parseLogicExpression(value).ok;
}

function mergeNamedLabels(
  rawEntries: Array<[string, unknown]>,
  defaults: LogicLabelBinding[]
): { ok: true; labels: LogicLabelBinding[] } | { ok: false; error: string } {
  const labels = defaults.map((label) => ({ ...label }));
  const seen = new Set<string>();

  for (const [name, rawValue] of rawEntries) {
    if (seen.has(name)) return { ok: false, error: `Duplicate logic label '${name}'.` };
    seen.add(name);
    const index = labels.findIndex((label) => label.name === name);
    const existing = index === -1 ? undefined : labels[index];
    const normalized = normalizeValue(name, rawValue, undefined, existing);
    if (!normalized.ok) return normalized;
    if (index === -1) labels.push(normalized.binding);
    else labels[index] = normalized.binding;
  }
  return { ok: true, labels };
}

function positionalLabels(
  rawValues: unknown[],
  defaults: LogicLabelBinding[]
): { ok: true; labels: LogicLabelBinding[] } | { ok: false; error: string } {
  const positional = defaults.filter((label) => label.kind !== 'lambda');
  if (rawValues.length > positional.length) {
    return {
      ok: false,
      error: `Received ${rawValues.length} positional values for ${positional.length} configured non-lambda labels.`,
    };
  }
  const entries: Array<[string, unknown]> = [];
  for (let index = 0; index < rawValues.length; index += 1) {
    const target = positional[index];
    const value = rawValues[index];
    if (!isLiteral(value)) {
      return { ok: false, error: `Positional value ${index + 1} must be a string, number, or boolean literal.` };
    }
    entries.push([target.name, value]);
  }
  return mergeNamedLabels(entries, defaults);
}

function decodeToken(token: string): string {
  if (token.startsWith('"') && token.endsWith('"')) {
    try {
      return JSON.parse(token) as string;
    } catch {
      return token.slice(1, -1);
    }
  }
  if (token.startsWith("'") && token.endsWith("'")) return token.slice(1, -1);
  return token;
}

function parseLabelText(
  raw: string,
  defaults: LogicLabelBinding[]
): { ok: true; labels: LogicLabelBinding[] } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: true, labels: defaults.map((label) => ({ ...label })) };

  if (text.startsWith('"')) {
    try {
      const decoded = JSON.parse(text) as unknown;
      if (typeof decoded === 'string' && decoded !== text) return parseLabelText(decoded, defaults);
    } catch {
      // Parse as ordinary quoted label text below; malformed JSON-looking objects are rejected separately.
    }
  }

  if (text.startsWith('{') || text.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: '"logic_labels" contains malformed JSON.' };
    }
    return normalizeLabelsValue(parsed, defaults);
  }

  const tokens = text.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;]+/g) || [];
  if (tokens.some((token) => (token.startsWith('"') && !token.endsWith('"')) || (token.startsWith("'") && !token.endsWith("'")))) {
    return { ok: false, error: 'Invalid quoted value in "logic_labels".' };
  }
  const named = tokens.filter((token) => /^[^=]+=.*/.test(token));
  if (named.length && named.length !== tokens.length) {
    return { ok: false, error: 'Do not mix named and positional logic label values.' };
  }
  if (named.length) {
    const entries: Array<[string, unknown]> = [];
    for (const token of tokens) {
      const equals = token.indexOf('=');
      const name = token.slice(0, equals).trim();
      const value = decodeToken(token.slice(equals + 1).trim());
      if (!name || value === '') return { ok: false, error: `Invalid named logic label '${token}'. Use name=value.` };
      entries.push([name, value]);
    }
    return mergeNamedLabels(entries, defaults);
  }
  return positionalLabels(tokens.map(decodeToken), defaults);
}

function normalizeLabelsValue(
  value: unknown,
  defaults: LogicLabelBinding[]
): { ok: true; labels: LogicLabelBinding[] } | { ok: false; error: string } {
  if (typeof value === 'string') return parseLabelText(value, defaults);
  if (Array.isArray(value)) {
    if (value.length === 0) return { ok: true, labels: defaults.map((label) => ({ ...label })) };
    if (value.every(isCompleteBinding)) {
      const bindings = value as LogicLabelBinding[];
      if (bindings.some((label) => !LABEL_NAME.test(label.name))) {
        return { ok: false, error: 'Label binding names must be valid identifiers.' };
      }
      if (bindings.some((label) => !label.id.trim())) {
        return { ok: false, error: 'Label binding IDs must not be empty.' };
      }
      const ids = new Set<string>();
      const names = new Set<string>();
      for (const label of bindings) {
        if (ids.has(label.id) || names.has(label.name)) {
          return { ok: false, error: 'Label binding arrays cannot contain duplicate IDs or names.' };
        }
        ids.add(label.id);
        names.add(label.name);
        if (!validExpression(label.value)) {
          return { ok: false, error: `Label '${label.name}' has an invalid logic expression.` };
        }
        if (label.kind === 'lambda' && !validLambda(label.value)) {
          return { ok: false, error: `Lambda label '${label.name}' must contain a valid λ/\\ abstraction.` };
        }
      }
      return { ok: true, labels: bindings.map((label) => ({ ...label })) };
    }
    return positionalLabels(value, defaults);
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return { ok: true, labels: defaults.map((label) => ({ ...label })) };
    return mergeNamedLabels(entries, defaults);
  }
  return { ok: false, error: 'Logic labels must be text, a literal array, a label object, or a label-binding array.' };
}

function isLiteralArray(value: unknown[]): boolean {
  return value.every(isLiteral);
}

function isLiteralString(value: string): boolean {
  const text = value.trim();
  return (
    (NUMBER_LITERAL.test(text) && Number.isFinite(Number(text))) ||
    BOOLEAN_LITERALS.has(text.toLowerCase())
  );
}

function isKnownNamedLabelText(text: string, labels: LogicLabelBinding[]): boolean {
  const tokens = text.trim().match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;]+/g) || [];
  if (!tokens.length) return false;
  return tokens.every((token) => {
    const equals = token.indexOf('=');
    if (equals <= 0 || !token.slice(equals + 1).trim()) return false;
    return labels.some((label) => label.name === token.slice(0, equals).trim());
  });
}

function normalizeRawInput(
  rawInput: unknown,
  defaults: LogicEvaluationInputDefaults,
  allowCombinedJson = true
): LogicInputNormalizationResult {
  const useDefaults = (): LogicInputNormalizationResult => {
    if (typeof defaults.statement !== 'string' || !defaults.statement.trim()) {
      return { ok: false, error: 'No configured or supplied logic statement is available.' };
    }
    return {
      ok: true,
      input: { statement: defaults.statement, labels: defaults.labels.map((label) => ({ ...label })) },
    };
  };
  if (rawInput === undefined || rawInput === null) {
    return useDefaults();
  }

  if (typeof rawInput === 'string') {
    const text = rawInput.trim();
    if (!text) {
      return useDefaults();
    }
    if (allowCombinedJson && (text.startsWith('{') || text.startsWith('[') || text.startsWith('"'))) {
      try {
        const combined = JSON.parse(text) as unknown;
        if (
          isRecord(combined) ||
          Array.isArray(combined) ||
          (typeof combined === 'string' && (combined.trim().startsWith('{') || combined.trim().startsWith('[')))
        ) {
          return normalizeRawInput(combined, defaults, typeof combined === 'string');
        }
      } catch {
        return { ok: false, error: 'Input looks like combined JSON but is malformed.' };
      }
    }
    if (isKnownNamedLabelText(text, defaults.labels)) {
      const labels = parseLabelText(text, defaults.labels);
      if (!labels.ok) return labels;
      const base = useDefaults();
      if (!base.ok) return base;
      return { ok: true, input: { statement: base.input.statement, labels: labels.labels } };
    }
    return { ok: true, input: { statement: rawInput, labels: defaults.labels.map((label) => ({ ...label })) } };
  }

  if (Array.isArray(rawInput)) {
    if (rawInput.length === 0) {
      return useDefaults();
    }
    if (
      rawInput.length === 2 &&
      typeof rawInput[0] === 'string' &&
      typeof rawInput[1] === 'string' &&
      !(isLiteralString(rawInput[0]) && isLiteralString(rawInput[1]))
    ) {
      const statement = rawInput[0].trim() ? rawInput[0] : defaults.statement;
      const labels = parseLabelText(rawInput[1], defaults.labels);
      if (!labels.ok) return labels;
      if (!statement.trim()) return { ok: false, error: 'No configured or supplied logic statement is available.' };
      return { ok: true, input: { statement, labels: labels.labels } };
    }
    if (isLiteralArray(rawInput)) {
      if (!defaults.statement.trim()) {
        return { ok: false, error: 'No configured or supplied logic statement is available.' };
      }
      const labels = positionalLabels(rawInput, defaults.labels);
      if (!labels.ok) return labels;
      return { ok: true, input: { statement: defaults.statement, labels: labels.labels } };
    }
    return { ok: false, error: 'Input arrays must be a two-string [statement, labels] pair or an array of literal values.' };
  }

  if (!isRecord(rawInput)) {
    return { ok: false, error: 'Input must be an object, string, statement/labels pair, or literal array.' };
  }

  const supportedFields = new Set(['statement', 'labels', 'logic_statement', 'logic_labels', 'input', 'values']);
  const unknownField = Object.keys(rawInput).find((key) => !supportedFields.has(key));
  if (unknownField) return { ok: false, error: `Unknown logic input field '${unknownField}'.` };

  const hasInput = Object.hasOwn(rawInput, 'input');
  const hasValues = Object.hasOwn(rawInput, 'values');
  const hasNamedStatement = Object.hasOwn(rawInput, 'logic_statement');
  const hasStatement = Object.hasOwn(rawInput, 'statement');
  const hasNamedLabels = Object.hasOwn(rawInput, 'logic_labels');
  const hasLabels = Object.hasOwn(rawInput, 'labels');
  if (hasInput && (hasValues || hasNamedStatement || hasStatement || hasNamedLabels || hasLabels)) {
    return { ok: false, error: 'Ambiguous input: "input" cannot be combined with statement, labels, or values fields.' };
  }
  if (hasValues && (hasNamedStatement || hasStatement || hasNamedLabels || hasLabels)) {
    return { ok: false, error: 'Ambiguous input: "values" cannot be combined with statement or label fields.' };
  }
  if (hasNamedStatement && hasStatement && rawInput.logic_statement !== rawInput.statement) {
    return { ok: false, error: 'Ambiguous statement input: "statement" and "logic_statement" differ.' };
  }
  if (hasNamedLabels && hasLabels) {
    return { ok: false, error: 'Ambiguous label input: use either "labels" or "logic_labels", not both.' };
  }

  if (hasInput) return normalizeRawInput(rawInput.input, defaults);

  const statementValue = hasNamedStatement ? rawInput.logic_statement : rawInput.statement;
  let statement = defaults.statement;
  if (statementValue !== undefined && statementValue !== null) {
    if (typeof statementValue !== 'string') return { ok: false, error: 'The logic statement must be text.' };
    if (statementValue.trim()) statement = statementValue;
  }
  if (!statement.trim()) return { ok: false, error: 'No configured or supplied logic statement is available.' };

  const labelValue = hasNamedLabels ? rawInput.logic_labels : rawInput.labels;
  let labels = defaults.labels.map((label) => ({ ...label }));
  if (hasValues) {
    if (!Array.isArray(rawInput.values) || !isLiteralArray(rawInput.values)) {
      return { ok: false, error: '"values" must be an array of literal values.' };
    }
    if (rawInput.values.length) {
      const normalized = positionalLabels(rawInput.values, labels);
      if (!normalized.ok) return normalized;
      labels = normalized.labels;
    }
  } else if (hasNamedLabels || hasLabels) {
    const normalized = normalizeLabelsValue(labelValue, labels);
    if (!normalized.ok) return normalized;
    labels = normalized.labels;
  }

  return { ok: true, input: { statement, labels } };
}

export function normalizeLogicEvaluationInput(
  rawInput: unknown,
  defaults: LogicEvaluationInputDefaults
): LogicInputNormalizationResult {
  return normalizeRawInput(rawInput, defaults);
}
