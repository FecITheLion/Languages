import type { LogicLabelBinding } from './logicLambdaEngine.ts';
import { readVirtualFiles, VirtualFilesError, type VirtualFiles } from './virtualFiles.ts';
import type {
  DialectConfig,
  LineMutation,
  RuleOrderConfig,
} from '../types/studio.ts';

export type HistologFieldKey =
  | 'grammar'
  | 'mutations'
  | 'jsonld'
  | 'logic'
  | 'evaluator'
  | 'dsl'
  | 'python'
  | 'rust'
  | 'wat'
  | 'virtualFiles';

export const HISTOLOG_FIELD_LABELS: Record<HistologFieldKey, string> = {
  grammar: 'Grammar',
  mutations: 'Mutations',
  jsonld: 'JSON-LD',
  logic: 'Logic / λ',
  evaluator: 'Evaluator',
  dsl: 'DSL Flows',
  python: 'Python AST',
  rust: 'Rust AST',
  wat: 'WABT / WAT',
  virtualFiles: 'Virtual file edits',
};

export const HISTOLOG_FIELD_KEYS: HistologFieldKey[] = [
  'grammar',
  'mutations',
  'jsonld',
  'logic',
  'evaluator',
  'dsl',
  'python',
  'rust',
  'wat',
  'virtualFiles',
];

export interface HistologSnapshotState {
  grammarText: string;
  dialect: DialectConfig;
  jsonText: string;
  mutations: Record<string, LineMutation>;
  ruleConfigs: Record<string, RuleOrderConfig>;
  evalRule: string;
  evalPayload: string;
  logicStatement: string;
  logicLabels: LogicLabelBinding[];
  dslSource: string;
  pythonSource: string;
  rustSource: string;
  watSource: string;
  virtualFiles?: VirtualFiles;
}

export interface HistologDiffLine {
  kind: 'context' | 'added' | 'removed';
  oldLine: number | null;
  newLine: number | null;
  text: string;
}

export interface HistologFieldDiff {
  field: HistologFieldKey;
  label: string;
  changed: boolean;
  added: number;
  removed: number;
  unchanged: number;
  lines: HistologDiffLine[];
}

export interface HistologEntry {
  id: string;
  generation: number;
  parentGeneration: number | null;
  timestamp: string;
  source: string;
  summary: string;
  fingerprint: string;
  changedFields: HistologFieldKey[];
  touchedSymbols: string[];
  additions: number;
  deletions: number;
  snapshot: HistologSnapshotState;
}

export interface HistologIndex {
  byGeneration: Record<number, string>;
  bySymbol: Record<string, number[]>;
  byField: Record<HistologFieldKey, number[]>;
  bySource: Record<string, number[]>;
  totalGenerations: number;
  totalAdditions: number;
  totalDeletions: number;
  uniqueSymbols: string[];
}

export interface HistologArchive {
  format: 'grammar2json-histolog';
  version: '1.0.0';
  exportedAt: string;
  schemaName: string;
  latestGeneration: number;
  index: HistologIndex;
  entries: HistologEntry[];
}

export type HistologExportFormat = 'histolog-json' | 'histolog-ndjson' | 'patch-diff';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * Deterministic 32-bit FNV-1a hex fingerprint for snapshot deduplication and lineage checks.
 */
export function computeSnapshotFingerprint(state: HistologSnapshotState): string {
  const serialized = stableStringify({
    grammarText: state.grammarText,
    dialect: state.dialect,
    jsonText: state.jsonText,
    mutations: state.mutations,
    ruleConfigs: state.ruleConfigs,
    evalRule: state.evalRule,
    evalPayload: state.evalPayload,
    logicStatement: state.logicStatement,
    logicLabels: state.logicLabels.map((l) => ({
      name: l.name,
      kind: l.kind,
      value: l.value,
    })),
    dslSource: state.dslSource,
    pythonSource: state.pythonSource,
    rustSource: state.rustSource,
    watSource: state.watSource,
    virtualFiles: state.virtualFiles ?? {},
  });

  let hash = 0x811c9dc5;
  for (let i = 0; i < serialized.length; i += 1) {
    hash ^= serialized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function serializeSnapshotFields(
  state: HistologSnapshotState
): Record<HistologFieldKey, string> {
  const mutationLines = Object.keys(state.mutations)
    .sort()
    .map((key) => {
      const m = state.mutations[key];
      const pat = m.patternOverride ? ` /${m.patternOverride}/` : '';
      const target = m.targetProperty ? ` -> ${m.targetProperty}` : '';
      const status = m.enabled ? '' : ' [disabled]';
      return `${key}${target} : ${m.jsonType}${pat}${status}`;
    })
    .join('\n');

  const ruleConfigLines = Object.keys(state.ruleConfigs)
    .sort()
    .map((ruleName) => {
      const cfg = state.ruleConfigs[ruleName];
      const props = (cfg.properties || [])
        .map((p) => `${p.name}=${p.value}`)
        .join(', ');
      return `  ${ruleName}: prec=${cfg.precedence} assoc=${cfg.associativity}${props ? ` {${props}}` : ''}`;
    })
    .join('\n');

  const logicLines = [
    `statement: ${state.logicStatement}`,
    ...state.logicLabels.map((l) => `  ${l.name} (${l.kind}) := ${l.value}`),
  ].join('\n');

  const evalLines = [
    `start_rule: ${state.evalRule}`,
    `payload: ${state.evalPayload}`,
    `dialect: ${state.dialect.preset} (op="${state.dialect.ruleOperator}", choice="${state.dialect.choiceDelimiter}")`,
  ].join('\n');

  return {
    grammar: [
      `# dialect=${state.dialect.preset} op="${state.dialect.ruleOperator}" choice="${state.dialect.choiceDelimiter}"`,
      state.grammarText.trimEnd(),
      ruleConfigLines ? `\n# rule_configs\n${ruleConfigLines}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    mutations: mutationLines || '(no line mutations)',
    jsonld: state.jsonText.trimEnd(),
    logic: logicLines,
    evaluator: evalLines,
    dsl: state.dslSource.trimEnd(),
    python: state.pythonSource.trimEnd(),
    rust: state.rustSource.trimEnd(),
    wat: state.watSource.trimEnd(),
    virtualFiles: JSON.stringify(state.virtualFiles ?? {}, null, 2),
  };
}

/**
 * Computes a clean LCS-based line diff with dual line numbers.
 * Falls back gracefully to prefix/suffix trimming for large artifacts so diffing stays O(n) interactive.
 */
export function computeLineDiff(
  beforeText: string,
  afterText: string
): {
  added: number;
  removed: number;
  unchanged: number;
  lines: HistologDiffLine[];
} {
  const a = beforeText === '' ? [] : beforeText.replace(/\r\n/g, '\n').split('\n');
  const b = afterText === '' ? [] : afterText.replace(/\r\n/g, '\n').split('\n');

  if (a.length === b.length && a.every((line, idx) => line === b[idx])) {
    return {
      added: 0,
      removed: 0,
      unchanged: a.length,
      lines: a.map((text, idx) => ({
        kind: 'context',
        oldLine: idx + 1,
        newLine: idx + 1,
        text,
      })),
    };
  }

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start += 1;
  }

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA -= 1;
    endB -= 1;
  }

  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);

  const lines: HistologDiffLine[] = [];
  for (let i = 0; i < start; i += 1) {
    lines.push({ kind: 'context', oldLine: i + 1, newLine: i + 1, text: a[i] });
  }

  let added = 0;
  let removed = 0;

  if (midA.length * midB.length <= 45000) {
    const m = midA.length;
    const n = midB.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i -= 1) {
      for (let j = n - 1; j >= 0; j -= 1) {
        if (midA[i] === midB[j]) {
          dp[i][j] = dp[i + 1][j + 1] + 1;
        } else {
          dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midA[i] === midB[j]) {
        lines.push({
          kind: 'context',
          oldLine: start + i + 1,
          newLine: start + j + 1,
          text: midA[i],
        });
        i += 1;
        j += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        lines.push({ kind: 'removed', oldLine: start + i + 1, newLine: null, text: midA[i] });
        removed += 1;
        i += 1;
      } else {
        lines.push({ kind: 'added', oldLine: null, newLine: start + j + 1, text: midB[j] });
        added += 1;
        j += 1;
      }
    }
    while (i < m) {
      lines.push({ kind: 'removed', oldLine: start + i + 1, newLine: null, text: midA[i] });
      removed += 1;
      i += 1;
    }
    while (j < n) {
      lines.push({ kind: 'added', oldLine: null, newLine: start + j + 1, text: midB[j] });
      added += 1;
      j += 1;
    }
  } else {
    for (let i = 0; i < midA.length; i += 1) {
      lines.push({ kind: 'removed', oldLine: start + i + 1, newLine: null, text: midA[i] });
      removed += 1;
    }
    for (let j = 0; j < midB.length; j += 1) {
      lines.push({ kind: 'added', oldLine: null, newLine: start + j + 1, text: midB[j] });
      added += 1;
    }
  }

  for (let i = endA + 1, j = endB + 1; i < a.length && j < b.length; i += 1, j += 1) {
    lines.push({ kind: 'context', oldLine: i + 1, newLine: j + 1, text: a[i] });
  }

  const unchanged = lines.filter((l) => l.kind === 'context').length;
  return { added, removed, unchanged, lines };
}

export function diffHistologSnapshots(
  fromState: HistologSnapshotState,
  toState: HistologSnapshotState
): HistologFieldDiff[] {
  const fromFields = serializeSnapshotFields(fromState);
  const toFields = serializeSnapshotFields(toState);

  return HISTOLOG_FIELD_KEYS.map((field) => {
    const diff = computeLineDiff(fromFields[field], toFields[field]);
    return {
      field,
      label: HISTOLOG_FIELD_LABELS[field],
      changed: diff.added > 0 || diff.removed > 0,
      added: diff.added,
      removed: diff.removed,
      unchanged: diff.unchanged,
      lines: diff.lines,
    };
  });
}

function extractGrammarRuleMap(grammarText: string, ruleOperator: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = grammarText.replace(/\r\n/g, '\n').split('\n');
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith(';;')) {
      continue;
    }
    if (ruleOperator.trim()) {
      const idx = trimmed.indexOf(ruleOperator);
      if (idx > 0) {
        const name = trimmed.slice(0, idx).trim().replace(/^<|>$/g, '');
        if (name) map.set(name, trimmed.slice(idx + ruleOperator.length).trim());
      }
    } else {
      const m = trimmed.match(/^([A-Za-z_<>][\w<>-]*)\s+(.+)$/);
      if (m) {
        map.set(m[1].replace(/^<|>$/g, ''), m[2].trim());
      }
    }
  }
  return map;
}

export function extractTouchedSymbols(
  fromState: HistologSnapshotState | null,
  toState: HistologSnapshotState
): string[] {
  const touched = new Set<string>();

  const toRules = extractGrammarRuleMap(toState.grammarText, toState.dialect.ruleOperator);
  const fromRules = fromState
    ? extractGrammarRuleMap(fromState.grammarText, fromState.dialect.ruleOperator)
    : new Map<string, string>();

  if (!fromState) {
    for (const ruleName of toRules.keys()) touched.add(ruleName);
    for (const mutKey of Object.keys(toState.mutations)) touched.add(mutKey);
    for (const lbl of toState.logicLabels) {
      if (lbl.name.trim()) touched.add(lbl.name.trim());
    }
    return Array.from(touched).sort();
  }

  for (const [name, expr] of toRules.entries()) {
    if (fromRules.get(name) !== expr) touched.add(name);
  }
  for (const name of fromRules.keys()) {
    if (!toRules.has(name)) touched.add(name);
  }

  const allMutKeys = new Set([
    ...Object.keys(fromState.mutations),
    ...Object.keys(toState.mutations),
  ]);
  for (const key of allMutKeys) {
    if (stableStringify(fromState.mutations[key]) !== stableStringify(toState.mutations[key])) {
      touched.add(key);
    }
  }

  const allCfgKeys = new Set([
    ...Object.keys(fromState.ruleConfigs),
    ...Object.keys(toState.ruleConfigs),
  ]);
  for (const key of allCfgKeys) {
    if (stableStringify(fromState.ruleConfigs[key]) !== stableStringify(toState.ruleConfigs[key])) {
      touched.add(key);
    }
  }

  const fromLabelMap = new Map(fromState.logicLabels.map((l) => [l.name.trim(), `${l.kind}:${l.value}`]));
  const toLabelMap = new Map(toState.logicLabels.map((l) => [l.name.trim(), `${l.kind}:${l.value}`]));
  for (const [name, sig] of toLabelMap.entries()) {
    if (name && fromLabelMap.get(name) !== sig) touched.add(name);
  }
  for (const name of fromLabelMap.keys()) {
    if (name && !toLabelMap.has(name)) touched.add(name);
  }

  if (fromState.evalRule !== toState.evalRule && toState.evalRule.trim()) {
    touched.add(toState.evalRule.trim());
  }

  return Array.from(touched).sort();
}

export function cloneHistologSnapshot(snapshot: HistologSnapshotState): HistologSnapshotState {
  return JSON.parse(JSON.stringify(snapshot)) as HistologSnapshotState;
}

export function createHistologEntry(params: {
  generation: number;
  parentGeneration: number | null;
  source: string;
  summary: string;
  snapshot: HistologSnapshotState;
  previousSnapshot: HistologSnapshotState | null;
}): HistologEntry {
  const cloned = cloneHistologSnapshot(params.snapshot);
  const fingerprint = computeSnapshotFingerprint(cloned);

  let changedFields: HistologFieldKey[] = [];
  let additions = 0;
  let deletions = 0;

  if (params.previousSnapshot) {
    const diffs = diffHistologSnapshots(params.previousSnapshot, cloned);
    for (const d of diffs) {
      if (d.changed) {
        changedFields.push(d.field);
        additions += d.added;
        deletions += d.removed;
      }
    }
  } else {
    changedFields = ['grammar', 'mutations', 'jsonld', 'logic'];
    const serialized = serializeSnapshotFields(cloned);
    additions = serialized.grammar.split('\n').length + serialized.mutations.split('\n').length;
  }

  const touchedSymbols = extractTouchedSymbols(params.previousSnapshot, cloned);

  return {
    id: `gen-${params.generation}-${fingerprint}`,
    generation: params.generation,
    parentGeneration: params.parentGeneration,
    timestamp: new Date().toISOString(),
    source: params.source,
    summary: params.summary,
    fingerprint,
    changedFields,
    touchedSymbols,
    additions,
    deletions,
    snapshot: cloned,
  };
}

/**
 * Builds an inverted cross-generation Histolog index mapping symbols, artifact fields,
 * and source workbenches to every generation that modified them.
 */
export function buildHistologIndex(entries: HistologEntry[]): HistologIndex {
  const byGeneration: Record<number, string> = {};
  const bySymbol: Record<string, number[]> = {};
  const byField: Record<HistologFieldKey, number[]> = {
    grammar: [],
    mutations: [],
    jsonld: [],
    logic: [],
    evaluator: [],
    dsl: [],
    python: [],
    rust: [],
    wat: [],
    virtualFiles: [],
  };
  const bySource: Record<string, number[]> = {};

  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const entry of entries) {
    byGeneration[entry.generation] = entry.id;
    totalAdditions += entry.additions;
    totalDeletions += entry.deletions;

    for (const sym of entry.touchedSymbols) {
      if (!bySymbol[sym]) bySymbol[sym] = [];
      if (!bySymbol[sym].includes(entry.generation)) {
        bySymbol[sym].push(entry.generation);
      }
    }

    for (const field of entry.changedFields) {
      if (byField[field] && !byField[field].includes(entry.generation)) {
        byField[field].push(entry.generation);
      }
    }

    if (!bySource[entry.source]) bySource[entry.source] = [];
    if (!bySource[entry.source].includes(entry.generation)) {
      bySource[entry.source].push(entry.generation);
    }
  }

  return {
    byGeneration,
    bySymbol,
    byField,
    bySource,
    totalGenerations: entries.length,
    totalAdditions,
    totalDeletions,
    uniqueSymbols: Object.keys(bySymbol).sort(),
  };
}

export function queryHistologIndex(
  entries: HistologEntry[],
  index: HistologIndex,
  filters: {
    text?: string;
    symbol?: string;
    field?: HistologFieldKey | 'all';
    source?: string;
  }
): HistologEntry[] {
  let allowedGens: Set<number> | null = null;

  const intersect = (gens: number[]) => {
    if (!allowedGens) {
      allowedGens = new Set(gens);
    } else {
      const next = new Set<number>();
      for (const g of gens) {
        if (allowedGens.has(g)) next.add(g);
      }
      allowedGens = next;
    }
  };

  if (filters.symbol && filters.symbol !== 'all') {
    intersect(index.bySymbol[filters.symbol] || []);
  }
  if (filters.field && filters.field !== 'all') {
    intersect(index.byField[filters.field] || []);
  }
  if (filters.source && filters.source !== 'all') {
    intersect(index.bySource[filters.source] || []);
  }

  const q = (filters.text || '').trim().toLowerCase();

  return entries.filter((entry) => {
    if (allowedGens && !allowedGens.has(entry.generation)) return false;
    if (!q) return true;
    const haystack = [
      `g${entry.generation}`,
      entry.summary,
      entry.source,
      entry.fingerprint,
      ...entry.touchedSymbols,
      ...entry.changedFields,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function formatUnifiedPatch(
  fromEntry: HistologEntry,
  toEntry: HistologEntry,
  diffs: HistologFieldDiff[]
): string {
  const header = [
    `# Grammar2JSON Studio Histolog Unified Diff`,
    `# Base: G${fromEntry.generation} (${fromEntry.fingerprint}) — ${fromEntry.summary}`,
    `# Target: G${toEntry.generation} (${toEntry.fingerprint}) — ${toEntry.summary}`,
    `# Timestamp: ${new Date().toISOString()}`,
    '',
  ];

  const changedDiffs = diffs.filter((d) => d.changed);
  if (changedDiffs.length === 0) {
    return `${header.join('\n')}# No differences detected between G${fromEntry.generation} and G${toEntry.generation}.\n`;
  }

  const chunks: string[] = [...header];
  for (const diff of changedDiffs) {
    chunks.push(`diff --histolog a/${diff.field} b/${diff.field}`);
    chunks.push(`--- a/${diff.field} (G${fromEntry.generation})`);
    chunks.push(`+++ b/${diff.field} (G${toEntry.generation})`);
    chunks.push(`@@ -1 +1 @@ (+${diff.added} / -${diff.removed})`);
    for (const line of diff.lines) {
      const prefix = line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' ';
      chunks.push(`${prefix}${line.text}`);
    }
    chunks.push('');
  }
  return chunks.join('\n');
}

export function exportHistologCustom(
  entries: HistologEntry[],
  index: HistologIndex,
  schemaName: string,
  format: HistologExportFormat,
  compareFromGen?: number,
  compareToGen?: number
): { content: string; filename: string; mime: string } {
  const slug =
    schemaName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'studio';

  if (format === 'histolog-ndjson') {
    const metaHeader = JSON.stringify({
      recordType: 'histolog_header',
      format: 'grammar2json-histolog-ndjson',
      version: '1.0.0',
      schemaName,
      exportedAt: new Date().toISOString(),
      index,
    });
    const rows = entries.map((entry) =>
      JSON.stringify({ recordType: 'generation', ...entry })
    );
    return {
      content: [metaHeader, ...rows].join('\n'),
      filename: `${slug}.histolog.ndjson`,
      mime: 'application/x-ndjson',
    };
  }

  if (format === 'patch-diff') {
    const fromEntry =
      entries.find((e) => e.generation === compareFromGen) || entries[0];
    const toEntry =
      entries.find((e) => e.generation === compareToGen) || entries[entries.length - 1];
    if (!fromEntry || !toEntry) {
      return {
        content: '# Empty Histolog archive.\n',
        filename: `${slug}.diff.patch`,
        mime: 'text/x-diff',
      };
    }
    const diffs = diffHistologSnapshots(fromEntry.snapshot, toEntry.snapshot);
    return {
      content: formatUnifiedPatch(fromEntry, toEntry, diffs),
      filename: `${slug}.G${fromEntry.generation}-G${toEntry.generation}.diff.patch`,
      mime: 'text/x-diff',
    };
  }

  const archive: HistologArchive = {
    format: 'grammar2json-histolog',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    schemaName,
    latestGeneration: entries.length > 0 ? entries[entries.length - 1].generation : 0,
    index,
    entries,
  };
  return {
    content: JSON.stringify(archive, null, 2),
    filename: `${slug}.histolog.json`,
    mime: 'application/json',
  };
}

function isValidSnapshot(obj: unknown): obj is HistologSnapshotState {
  if (!obj || typeof obj !== 'object') return false;
  const s = obj as Partial<HistologSnapshotState>;
  return (
    typeof s.grammarText === 'string' &&
    typeof s.jsonText === 'string' &&
    Boolean(s.dialect && typeof s.dialect.preset === 'string')
  );
}

function normalizeImportedEntry(raw: unknown, fallbackGen: number): HistologEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<HistologEntry>;
  if (!isValidSnapshot(r.snapshot)) return null;

  const snap: HistologSnapshotState = {
    grammarText: r.snapshot.grammarText,
    dialect: r.snapshot.dialect,
    jsonText: r.snapshot.jsonText,
    mutations: r.snapshot.mutations || {},
    ruleConfigs: r.snapshot.ruleConfigs || {},
    evalRule: typeof r.snapshot.evalRule === 'string' ? r.snapshot.evalRule : '',
    evalPayload: typeof r.snapshot.evalPayload === 'string' ? r.snapshot.evalPayload : '',
    logicStatement: typeof r.snapshot.logicStatement === 'string' ? r.snapshot.logicStatement : '',
    logicLabels: Array.isArray(r.snapshot.logicLabels) ? r.snapshot.logicLabels : [],
    dslSource: typeof r.snapshot.dslSource === 'string' ? r.snapshot.dslSource : '',
    pythonSource: typeof r.snapshot.pythonSource === 'string' ? r.snapshot.pythonSource : '',
    rustSource: typeof r.snapshot.rustSource === 'string' ? r.snapshot.rustSource : '',
    watSource: typeof r.snapshot.watSource === 'string' ? r.snapshot.watSource : '',
    virtualFiles: r.snapshot.virtualFiles === undefined ? undefined : readVirtualFiles(r.snapshot.virtualFiles),
  };

  const gen = typeof r.generation === 'number' && Number.isFinite(r.generation) ? r.generation : fallbackGen;
  const fingerprint =
    typeof r.fingerprint === 'string' && r.fingerprint
      ? r.fingerprint
      : computeSnapshotFingerprint(snap);

  return {
    id: typeof r.id === 'string' && r.id ? r.id : `gen-${gen}-${fingerprint}`,
    generation: gen,
    parentGeneration: typeof r.parentGeneration === 'number' ? r.parentGeneration : gen > 0 ? gen - 1 : null,
    timestamp: typeof r.timestamp === 'string' && r.timestamp ? r.timestamp : new Date().toISOString(),
    source: typeof r.source === 'string' && r.source ? r.source : 'Imported Archive',
    summary: typeof r.summary === 'string' && r.summary ? r.summary : `Imported generation G${gen}`,
    fingerprint,
    changedFields: Array.isArray(r.changedFields)
      ? r.changedFields.filter((f): f is HistologFieldKey => HISTOLOG_FIELD_KEYS.includes(f as HistologFieldKey))
      : ['grammar'],
    touchedSymbols: Array.isArray(r.touchedSymbols)
      ? r.touchedSymbols.filter((s): s is string => typeof s === 'string')
      : [],
    additions: typeof r.additions === 'number' ? r.additions : 0,
    deletions: typeof r.deletions === 'number' ? r.deletions : 0,
    snapshot: snap,
  };
}

/**
 * Custom Histolog importer supporting both `.histolog.json` archives and `.histolog.ndjson`
 * generational streams, with either Replace or Merge & Re-index modes.
 */
export function importHistologCustom(
  rawText: string,
  mode: 'replace' | 'merge',
  existingEntries: HistologEntry[]
):
  | {
      ok: true;
      entries: HistologEntry[];
      index: HistologIndex;
      importedCount: number;
      detectedFormat: 'histolog-json' | 'histolog-ndjson';
    }
  | { ok: false; error: string } {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, error: 'Empty input. Paste or upload a .histolog.json or .histolog.ndjson archive.' };
  }

  let parsedEntries: HistologEntry[] = [];
  let detectedFormat: 'histolog-json' | 'histolog-ndjson' = 'histolog-json';

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      parsedEntries = parsed
        .map((item, idx) => normalizeImportedEntry(item, idx))
        .filter((e): e is HistologEntry => e !== null);
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as HistologArchive).entries)) {
      parsedEntries = (parsed as HistologArchive).entries
        .map((item, idx) => normalizeImportedEntry(item, idx))
        .filter((e): e is HistologEntry => e !== null);
    } else if (parsed && typeof parsed === 'object' && isValidSnapshot((parsed as { snapshot?: unknown }).snapshot)) {
      const single = normalizeImportedEntry(parsed, 0);
      if (single) parsedEntries = [single];
    }
  } catch (error) {
    if (error instanceof VirtualFilesError) return { ok: false, error: `Invalid virtual files in history: ${error.message}` };
    // Attempt NDJSON line-by-line parse
    detectedFormat = 'histolog-ndjson';
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
    for (let i = 0; i < lines.length; i += 1) {
      try {
        const obj = JSON.parse(lines[i]) as { recordType?: string };
        if (obj.recordType === 'histolog_header') continue;
        const normalized = normalizeImportedEntry(obj, parsedEntries.length);
        if (normalized) parsedEntries.push(normalized);
      } catch (error) {
        if (error instanceof VirtualFilesError) return { ok: false, error: `Invalid virtual files in history: ${error.message}` };
        return {
          ok: false,
          error: `Invalid JSON/NDJSON syntax on line ${i + 1}.`,
        };
      }
    }
  }

  if (parsedEntries.length === 0) {
    return {
      ok: false,
      error: 'No valid Histolog generation records found. Expected .histolog.json or .histolog.ndjson.',
    };
  }

  // Recompute sequential generation numbers, diffs, and touched symbols across lineage
  const combinedSource: HistologEntry[] =
    mode === 'replace' ? [...parsedEntries] : [...existingEntries, ...parsedEntries];

  const reindexed: HistologEntry[] = [];
  for (let i = 0; i < combinedSource.length; i += 1) {
    const item = combinedSource[i];
    const prev = reindexed.length > 0 ? reindexed[reindexed.length - 1] : null;
    if (prev && prev.fingerprint === item.fingerprint && mode === 'merge') {
      continue;
    }
    const gen = reindexed.length;
    const entry = createHistologEntry({
      generation: gen,
      parentGeneration: prev ? prev.generation : null,
      source: item.source,
      summary: item.summary,
      snapshot: item.snapshot,
      previousSnapshot: prev ? prev.snapshot : null,
    });
    entry.timestamp = item.timestamp || entry.timestamp;
    reindexed.push(entry);
  }

  return {
    ok: true,
    entries: reindexed,
    index: buildHistologIndex(reindexed),
    importedCount: parsedEntries.length,
    detectedFormat,
  };
}
