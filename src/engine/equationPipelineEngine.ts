import {
  evaluateLogicStatement,
  extractLambdaParamsAndBody,
  parseLogicExpression,
  translateLambdaCallsToNamedCallbacks,
  type LogicExportTarget,
  type LogicLabelBinding,
} from './logicLambdaEngine.ts';

/* ============================================================================
 * GLOBAL EQUATION PIPELINE CREATOR ENGINE
 * Feeds saved Step 03 equations into each other under referencable call names
 * with full branching, positional/named piping & delegation, recursive nested
 * sub-pipelines, live execution, and runnable CLI superset-script generation.
 * ========================================================================== */

export type PipelineOutputDelegationMode = 'named' | 'positional' | 'both';

export type PipelineInputSourceMode =
  | 'cli_default'
  | 'pipe_named'
  | 'pipe_positional'
  | 'literal';

export type PipelineBranchCondition =
  | 'truthy'
  | 'falsy'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'eq'
  | 'neq';

export interface PipelineInputBinding {
  paramName: string;
  paramKind: 'number' | 'boolean';
  mode: PipelineInputSourceMode;
  sourceNodeId?: string;
  /** 1-based positional slot ($1, $2, ...) or 0 for previous executed node output */
  positionalIndex?: number;
  literalValue?: string;
}

export interface PipelineBranchGuard {
  enabled: boolean;
  sourceNodeId: string;
  condition: PipelineBranchCondition;
  threshold?: string;
  fallbackValue?: string;
}

export interface PipelineEquationNode {
  id: string;
  callName: string;
  description: string;
  statement: string;
  labels: LogicLabelBinding[];
  sourceLanguage: LogicExportTarget;
  exportedSnippet?: string;
  grammarText?: string;
  sampleSingleInput?: string;
  outputDelegationMode: PipelineOutputDelegationMode;
  outputAlias: string;
  inputMappings: PipelineInputBinding[];
  branchGuard: PipelineBranchGuard;
  /** Optional recursive nested sub-pipeline executed when this node is invoked */
  subPipeline?: EquationPipelineSpec;
  createdAt: string;
  updatedAt: string;
}

export interface EquationPipelineSpec {
  id: string;
  name: string;
  description: string;
  nodes: PipelineEquationNode[];
  updatedAt: string;
}

export interface PipelineNodeExecutionRecord {
  nodeId: string;
  callName: string;
  outputAlias: string;
  delegationMode: PipelineOutputDelegationMode;
  positionalSlot: number | null;
  branchStatus: 'always' | 'taken' | 'skipped';
  branchDetail?: string;
  resolvedInputs: Record<string, string>;
  ok: boolean;
  value: number | boolean | string | null;
  displayValue: string;
  error?: string;
  subTrace?: PipelineExecutionResult;
}

export interface PipelineExecutionResult {
  ok: boolean;
  pipelineName: string;
  rootInputs: Record<string, string>;
  namedOutputs: Record<string, number | boolean | string>;
  positionalOutputs: Array<{ slot: number; callName: string; value: number | boolean | string }>;
  finalOutput: number | boolean | string | null;
  finalDisplay: string;
  steps: PipelineNodeExecutionRecord[];
  error?: string;
}

export type SupersetScriptTarget = 'python' | 'javascript' | 'typescript' | 'rust';

export const GLOBAL_PIPELINE_STORAGE_KEY = 'grammar2json_global_equation_pipeline_v1';

export function sanitizePipelineIdentifier(raw: string, fallback = 'eq_step'): string {
  const cleaned = raw
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '');
  if (!cleaned) return fallback;
  return /^[0-9]/.test(cleaned) ? `fn_${cleaned}` : cleaned;
}

export function extractNodeRequiredInputs(
  statement: string,
  labels: LogicLabelBinding[]
): Array<{ name: string; kind: 'number' | 'boolean'; defaultValue: string }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; kind: 'number' | 'boolean'; defaultValue: string }> = [];

  for (const lbl of labels) {
    if (lbl.kind === 'lambda') continue;
    const clean = lbl.name.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push({
      name: clean,
      kind: lbl.kind,
      defaultValue: lbl.value.trim() || (lbl.kind === 'boolean' ? 'false' : '0'),
    });
  }

  const evalRes = evaluateLogicStatement(statement, labels);
  for (const fv of evalRes.freeVariables) {
    if (!fv || seen.has(fv)) continue;
    seen.add(fv);
    out.push({ name: fv, kind: 'number', defaultValue: '0' });
  }
  return out;
}

export function createPipelineNodeFromEquation(input: {
  callName: string;
  description?: string;
  statement: string;
  labels: LogicLabelBinding[];
  sourceLanguage: LogicExportTarget;
  exportedSnippet?: string;
  grammarText?: string;
  sampleSingleInput?: string;
  existingNodes?: PipelineEquationNode[];
}): PipelineEquationNode {
  const existingNames = new Set((input.existingNodes || []).map((n) => n.callName));
  const baseName = sanitizePipelineIdentifier(input.callName, `eq_${(input.existingNodes?.length || 0) + 1}`);
  let finalName = baseName;
  let counter = 2;
  while (existingNames.has(finalName)) {
    finalName = `${baseName}_${counter}`;
    counter += 1;
  }

  const reqs = extractNodeRequiredInputs(input.statement, input.labels);
  const prevNode =
    input.existingNodes && input.existingNodes.length > 0
      ? input.existingNodes[input.existingNodes.length - 1]
      : null;

  const inputMappings: PipelineInputBinding[] = reqs.map((req, idx) => {
    // Auto-pipe if an upstream node has a matching outputAlias or callName!
    const matchingUpstream = (input.existingNodes || []).find(
      (n) => n.outputAlias === req.name || n.callName === req.name
    );
    if (matchingUpstream) {
      return {
        paramName: req.name,
        paramKind: req.kind,
        mode: 'pipe_named',
        sourceNodeId: matchingUpstream.id,
        literalValue: req.defaultValue,
      };
    }
    // Otherwise default to CLI / Default (user can switch any param to Positional or Named pipe in 1 click)
    return {
      paramName: req.name,
      paramKind: req.kind,
      mode: 'cli_default',
      sourceNodeId: idx === 0 && prevNode ? prevNode.id : undefined,
      positionalIndex: 0,
      literalValue: req.defaultValue,
    };
  });

  const now = new Date().toISOString();
  return {
    id: `pnode_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    callName: finalName,
    description: input.description?.trim() || `Saved equation: ${input.statement.trim().slice(0, 64)}`,
    statement: input.statement.trim(),
    labels: input.labels.map((l) => ({ ...l })),
    sourceLanguage: input.sourceLanguage,
    exportedSnippet: input.exportedSnippet,
    grammarText: input.grammarText,
    sampleSingleInput: input.sampleSingleInput,
    outputDelegationMode: 'both',
    outputAlias: `${finalName}_out`,
    inputMappings,
    branchGuard: {
      enabled: false,
      sourceNodeId: prevNode?.id || '',
      condition: 'truthy',
      threshold: '0',
      fallbackValue: '0',
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultGlobalPipeline(): EquationPipelineSpec {
  const now = new Date().toISOString();
  const n1: PipelineEquationNode = {
    id: 'pnode_subtotal',
    callName: 'calc_subtotal',
    description: 'Computes gross subtotal from price and quantity',
    statement: 'price * qty',
    labels: [
      { id: 'pl_price', name: 'price', kind: 'number', value: '50' },
      { id: 'pl_qty', name: 'qty', kind: 'number', value: '3' },
    ],
    sourceLanguage: 'python',
    outputDelegationMode: 'both',
    outputAlias: 'subtotal',
    inputMappings: [
      { paramName: 'price', paramKind: 'number', mode: 'cli_default', literalValue: '50' },
      { paramName: 'qty', paramKind: 'number', mode: 'cli_default', literalValue: '3' },
    ],
    branchGuard: { enabled: false, sourceNodeId: '', condition: 'truthy', threshold: '0', fallbackValue: '0' },
    createdAt: now,
    updatedAt: now,
  };

  const n2: PipelineEquationNode = {
    id: 'pnode_discount',
    callName: 'apply_bulk_discount',
    description: 'Branch: applies 15% discount only when subtotal > 100',
    statement: 'amount * 0.85',
    labels: [{ id: 'pl_amount', name: 'amount', kind: 'number', value: '150' }],
    sourceLanguage: 'python',
    outputDelegationMode: 'both',
    outputAlias: 'discounted_total',
    inputMappings: [
      {
        paramName: 'amount',
        paramKind: 'number',
        mode: 'pipe_named',
        sourceNodeId: 'pnode_subtotal',
        literalValue: '150',
      },
    ],
    branchGuard: {
      enabled: true,
      sourceNodeId: 'pnode_subtotal',
      condition: 'gt',
      threshold: '100',
      fallbackValue: '100',
    },
    createdAt: now,
    updatedAt: now,
  };

  const n3: PipelineEquationNode = {
    id: 'pnode_final',
    callName: 'add_tax_total',
    description: 'Pipes positional $2 (or discounted_total) and adds tax_rate',
    statement: 'net + (net * tax_rate)',
    labels: [
      { id: 'pl_net', name: 'net', kind: 'number', value: '127.5' },
      { id: 'pl_tax', name: 'tax_rate', kind: 'number', value: '0.08' },
    ],
    sourceLanguage: 'python',
    outputDelegationMode: 'both',
    outputAlias: 'final_total',
    inputMappings: [
      {
        paramName: 'net',
        paramKind: 'number',
        mode: 'pipe_positional',
        positionalIndex: 0, // 0 = previous step output
        literalValue: '127.5',
      },
      { paramName: 'tax_rate', paramKind: 'number', mode: 'cli_default', literalValue: '0.08' },
    ],
    branchGuard: { enabled: false, sourceNodeId: '', condition: 'truthy', threshold: '0', fallbackValue: '0' },
    createdAt: now,
    updatedAt: now,
  };

  return {
    id: 'global_pipeline_root',
    name: 'order_pricing_pipeline',
    description: 'Global composable pipeline feeding saved equations via named & positional delegation with conditional branching.',
    nodes: [n1, n2, n3],
    updatedAt: now,
  };
}

export function loadGlobalEquationPipeline(): EquationPipelineSpec {
  if (typeof window === 'undefined') return createDefaultGlobalPipeline();
  try {
    const raw = window.localStorage.getItem(GLOBAL_PIPELINE_STORAGE_KEY);
    if (!raw) return createDefaultGlobalPipeline();
    const parsed = JSON.parse(raw) as EquationPipelineSpec;
    if (parsed && typeof parsed.name === 'string' && Array.isArray(parsed.nodes)) {
      return parsed;
    }
    return createDefaultGlobalPipeline();
  } catch {
    return createDefaultGlobalPipeline();
  }
}

export function saveGlobalEquationPipeline(pipeline: EquationPipelineSpec): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GLOBAL_PIPELINE_STORAGE_KEY, JSON.stringify(pipeline));
  } catch {
    // Ignore storage quota restrictions
  }
}

/**
 * Recursively collects all unbound CLI root input variables required by a pipeline
 * (including any nested sub-pipelines).
 */
export function collectPipelineRootInputs(
  pipeline: EquationPipelineSpec,
  depth = 0
): Array<{ name: string; kind: 'number' | 'boolean'; defaultValue: string; usedBy: string[] }> {
  if (depth > 8) return [];
  const map = new Map<
    string,
    { name: string; kind: 'number' | 'boolean'; defaultValue: string; usedBy: string[] }
  >();

  for (const node of pipeline.nodes) {
    if (node.subPipeline && node.subPipeline.nodes.length > 0) {
      const subReqs = collectPipelineRootInputs(node.subPipeline, depth + 1);
      for (const req of subReqs) {
        const mapped = node.inputMappings.find((m) => m.paramName === req.name);
        if (mapped && mapped.mode !== 'cli_default') continue;
        const existing = map.get(req.name);
        if (existing) {
          if (!existing.usedBy.includes(node.callName)) existing.usedBy.push(node.callName);
        } else {
          map.set(req.name, { ...req, usedBy: [node.callName] });
        }
      }
      continue;
    }

    const reqs = extractNodeRequiredInputs(node.statement, node.labels);
    for (const req of reqs) {
      const binding = node.inputMappings.find((m) => m.paramName === req.name);
      if (binding && binding.mode !== 'cli_default') continue;
      const existing = map.get(req.name);
      if (existing) {
        if (!existing.usedBy.includes(node.callName)) existing.usedBy.push(node.callName);
      } else {
        map.set(req.name, {
          name: req.name,
          kind: req.kind,
          defaultValue: binding?.literalValue || req.defaultValue,
          usedBy: [node.callName],
        });
      }
    }
  }
  return Array.from(map.values());
}

/**
 * Recursively locates a pipeline at a path of node IDs (empty path = root pipeline).
 */
export function getPipelineAtPath(
  root: EquationPipelineSpec,
  pathNodeIds: string[]
): EquationPipelineSpec {
  let curr = root;
  for (const nid of pathNodeIds) {
    const found = curr.nodes.find((n) => n.id === nid);
    if (!found) return curr;
    if (!found.subPipeline) {
      return {
        id: `sub_${found.id}`,
        name: `${found.callName}_subpipeline`,
        description: `Recursive sub-pipeline inside ${found.callName}`,
        nodes: [],
        updatedAt: found.updatedAt,
      };
    }
    curr = found.subPipeline;
  }
  return curr;
}

/**
 * Immutably updates a nested sub-pipeline at any recursion depth.
 */
export function updatePipelineAtPath(
  root: EquationPipelineSpec,
  pathNodeIds: string[],
  updater: (target: EquationPipelineSpec) => EquationPipelineSpec
): EquationPipelineSpec {
  if (pathNodeIds.length === 0) {
    return { ...updater(root), updatedAt: new Date().toISOString() };
  }
  const [head, ...rest] = pathNodeIds;
  return {
    ...root,
    updatedAt: new Date().toISOString(),
    nodes: root.nodes.map((node) => {
      if (node.id !== head) return node;
      const existingSub: EquationPipelineSpec = node.subPipeline ?? {
        id: `sub_${node.id}`,
        name: `${node.callName}_subpipeline`,
        description: `Recursive sub-pipeline inside ${node.callName}`,
        nodes: [],
        updatedAt: new Date().toISOString(),
      };
      const nextSub = updatePipelineAtPath(existingSub, rest, updater);
      return {
        ...node,
        subPipeline: nextSub,
        updatedAt: new Date().toISOString(),
      };
    }),
  };
}

function parseScalarValue(raw: string): number | boolean | string {
  const t = raw.trim();
  const low = t.toLowerCase();
  if (low === 'true' || t === '⊤') return true;
  if (low === 'false' || t === '⊥') return false;
  if (t !== '' && !Number.isNaN(Number(t))) return Number(t);
  return t;
}

function evaluateBranchCondition(
  val: number | boolean | string | undefined,
  guard: PipelineBranchGuard
): { passed: boolean; detail: string } {
  if (val === undefined) {
    return { passed: false, detail: 'Upstream source not yet evaluated' };
  }
  const numVal = typeof val === 'number' ? val : typeof val === 'boolean' ? (val ? 1 : 0) : Number(val);
  const thr = Number(guard.threshold ?? '0');
  const boolVal = typeof val === 'boolean' ? val : typeof val === 'number' ? val !== 0 : Boolean(val) && val !== 'false' && val !== '0';

  switch (guard.condition) {
    case 'truthy':
      return { passed: boolVal, detail: `${String(val)} is ${boolVal ? 'truthy' : 'falsy'}` };
    case 'falsy':
      return { passed: !boolVal, detail: `${String(val)} is ${!boolVal ? 'falsy' : 'truthy'}` };
    case 'gt':
      return { passed: numVal > thr, detail: `${numVal} > ${thr}` };
    case 'gte':
      return { passed: numVal >= thr, detail: `${numVal} >= ${thr}` };
    case 'lt':
      return { passed: numVal < thr, detail: `${numVal} < ${thr}` };
    case 'lte':
      return { passed: numVal <= thr, detail: `${numVal} <= ${thr}` };
    case 'eq':
      return {
        passed: !Number.isNaN(numVal) && !Number.isNaN(thr) ? numVal === thr : String(val) === String(guard.threshold ?? ''),
        detail: `${String(val)} == ${guard.threshold ?? '0'}`,
      };
    case 'neq':
      return {
        passed: !Number.isNaN(numVal) && !Number.isNaN(thr) ? numVal !== thr : String(val) !== String(guard.threshold ?? ''),
        detail: `${String(val)} != ${guard.threshold ?? '0'}`,
      };
  }
}

/**
 * Live in-browser evaluator for the Global Equation Pipeline Creator.
 * Supports named + positional output delegation, conditional branching with fallbacks,
 * upstream callName references, and recursive nested sub-pipelines.
 */
export function evaluateEquationPipeline(
  pipeline: EquationPipelineSpec,
  cliOverrides: Record<string, string> = {},
  depth = 0
): PipelineExecutionResult {
  if (depth > 8) {
    return {
      ok: false,
      pipelineName: pipeline.name,
      rootInputs: cliOverrides,
      namedOutputs: {},
      positionalOutputs: [],
      finalOutput: null,
      finalDisplay: 'Error',
      steps: [],
      error: 'Maximum recursive pipeline nesting depth (8) exceeded.',
    };
  }

  const rootReqs = collectPipelineRootInputs(pipeline, depth);
  const rootInputs: Record<string, string> = {};
  for (const r of rootReqs) {
    rootInputs[r.name] = cliOverrides[r.name] !== undefined && cliOverrides[r.name] !== ''
      ? cliOverrides[r.name]
      : r.defaultValue;
  }
  for (const [k, v] of Object.entries(cliOverrides)) {
    if (v !== '') rootInputs[k] = v;
  }

  const namedOutputs: Record<string, number | boolean | string> = {};
  const nodeOutputsById: Record<string, number | boolean | string> = {};
  const positionalOutputs: Array<{ slot: number; callName: string; value: number | boolean | string }> = [];
  const steps: PipelineNodeExecutionRecord[] = [];
  let lastOutput: number | boolean | string | null = null;
  let allOk = true;

  for (const node of pipeline.nodes) {
    // 1. Check conditional branch guard
    let branchStatus: 'always' | 'taken' | 'skipped' = 'always';
    let branchDetail: string | undefined;

    if (node.branchGuard?.enabled && node.branchGuard.sourceNodeId) {
      const srcVal = nodeOutputsById[node.branchGuard.sourceNodeId];
      const check = evaluateBranchCondition(srcVal, node.branchGuard);
      branchDetail = check.detail;
      if (!check.passed) {
        branchStatus = 'skipped';
        const fallbackRaw = node.branchGuard.fallbackValue?.trim();
        const fallbackVal = fallbackRaw
          ? parseScalarValue(fallbackRaw)
          : srcVal !== undefined
            ? srcVal
            : 0;
        nodeOutputsById[node.id] = fallbackVal;
        if (node.outputDelegationMode === 'named' || node.outputDelegationMode === 'both') {
          namedOutputs[node.outputAlias || node.callName] = fallbackVal;
          namedOutputs[node.callName] = fallbackVal;
        }
        let slot: number | null = null;
        if (node.outputDelegationMode === 'positional' || node.outputDelegationMode === 'both') {
          slot = positionalOutputs.length + 1;
          positionalOutputs.push({ slot, callName: node.callName, value: fallbackVal });
        }
        lastOutput = fallbackVal;
        steps.push({
          nodeId: node.id,
          callName: node.callName,
          outputAlias: node.outputAlias || node.callName,
          delegationMode: node.outputDelegationMode,
          positionalSlot: slot,
          branchStatus,
          branchDetail: `Skipped (${check.detail}) → fallback ${String(fallbackVal)}`,
          resolvedInputs: {},
          ok: true,
          value: fallbackVal,
          displayValue: String(fallbackVal),
        });
        continue;
      }
      branchStatus = 'taken';
    }

    // 2. Resolve inputs from CLI / Named pipe / Positional pipe / Literal
    const resolvedInputs: Record<string, string> = {};
    const nodeReqs =
      node.subPipeline && node.subPipeline.nodes.length > 0
        ? collectPipelineRootInputs(node.subPipeline, depth + 1)
        : extractNodeRequiredInputs(node.statement, node.labels);

    for (const req of nodeReqs) {
      const binding = node.inputMappings.find((m) => m.paramName === req.name);
      const mode = binding?.mode ?? 'cli_default';
      if (mode === 'literal') {
        resolvedInputs[req.name] = binding?.literalValue ?? req.defaultValue;
      } else if (mode === 'pipe_named') {
        const upstreamVal = binding?.sourceNodeId ? nodeOutputsById[binding.sourceNodeId] : undefined;
        resolvedInputs[req.name] =
          upstreamVal !== undefined ? String(upstreamVal) : (binding?.literalValue ?? req.defaultValue);
      } else if (mode === 'pipe_positional') {
        const idx = binding?.positionalIndex ?? 0;
        const posItem =
          idx === 0
            ? positionalOutputs[positionalOutputs.length - 1]
            : positionalOutputs.find((p) => p.slot === idx);
        resolvedInputs[req.name] =
          posItem !== undefined ? String(posItem.value) : (binding?.literalValue ?? req.defaultValue);
      } else {
        // cli_default: check per-node override first (`callName__param`), then shared root CLI var, then default
        const scopedKey = `${node.callName}__${req.name}`;
        resolvedInputs[req.name] =
          cliOverrides[scopedKey] ??
          rootInputs[req.name] ??
          binding?.literalValue ??
          req.defaultValue;
      }
    }

    // 3. Execute either nested recursive subPipeline or leaf Logic/Arithmetic/Lambda equation
    if (node.subPipeline && node.subPipeline.nodes.length > 0) {
      const subRes = evaluateEquationPipeline(
        node.subPipeline,
        { ...rootInputs, ...resolvedInputs },
        depth + 1
      );
      const outVal = subRes.finalOutput ?? 0;
      if (!subRes.ok) allOk = false;
      nodeOutputsById[node.id] = outVal;
      if (node.outputDelegationMode === 'named' || node.outputDelegationMode === 'both') {
        namedOutputs[node.outputAlias || node.callName] = outVal;
        namedOutputs[node.callName] = outVal;
      }
      let slot: number | null = null;
      if (node.outputDelegationMode === 'positional' || node.outputDelegationMode === 'both') {
        slot = positionalOutputs.length + 1;
        positionalOutputs.push({ slot, callName: node.callName, value: outVal });
      }
      lastOutput = outVal;
      steps.push({
        nodeId: node.id,
        callName: node.callName,
        outputAlias: node.outputAlias || node.callName,
        delegationMode: node.outputDelegationMode,
        positionalSlot: slot,
        branchStatus,
        branchDetail,
        resolvedInputs,
        ok: subRes.ok,
        value: outVal,
        displayValue: subRes.finalDisplay,
        error: subRes.error,
        subTrace: subRes,
      });
      continue;
    }

    // Build effective label list injecting resolved inputs + all upstream named outputs
    const effectiveLabels: LogicLabelBinding[] = [];
    const pushedNames = new Set<string>();

    // First inject upstream named outputs so equations can directly reference upstream callNames / outputAliases!
    for (const [k, v] of Object.entries(namedOutputs)) {
      if (pushedNames.has(k)) continue;
      pushedNames.add(k);
      effectiveLabels.push({
        id: `up_${k}`,
        name: k,
        kind: typeof v === 'boolean' ? 'boolean' : 'number',
        value: String(v),
      });
    }

    // Then inject node's own labels (with resolved piped/CLI overrides)
    for (const lbl of node.labels) {
      const clean = lbl.name.trim();
      if (!clean) continue;
      const overrideVal = lbl.kind !== 'lambda' && resolvedInputs[clean] !== undefined
        ? resolvedInputs[clean]
        : lbl.value;
      const existingIdx = effectiveLabels.findIndex((e) => e.name === clean);
      const item: LogicLabelBinding = { ...lbl, name: clean, value: overrideVal };
      if (existingIdx >= 0) effectiveLabels[existingIdx] = item;
      else effectiveLabels.push(item);
      pushedNames.add(clean);
    }

    // Ensure any free variables resolved via inputMappings are also bound
    for (const [k, v] of Object.entries(resolvedInputs)) {
      if (pushedNames.has(k)) continue;
      const parsedVal = parseScalarValue(v);
      effectiveLabels.push({
        id: `in_${k}`,
        name: k,
        kind: typeof parsedVal === 'boolean' ? 'boolean' : 'number',
        value: String(v),
      });
      pushedNames.add(k);
    }

    const evalRes = evaluateLogicStatement(node.statement, effectiveLabels);
    if (!evalRes.ok) {
      allOk = false;
      steps.push({
        nodeId: node.id,
        callName: node.callName,
        outputAlias: node.outputAlias || node.callName,
        delegationMode: node.outputDelegationMode,
        positionalSlot: null,
        branchStatus,
        branchDetail,
        resolvedInputs,
        ok: false,
        value: null,
        displayValue: evalRes.displayValue,
        error: evalRes.error,
      });
      continue;
    }

    const rawVal: number | boolean | string =
      evalRes.value?.kind === 'number'
        ? evalRes.value.value
        : evalRes.value?.kind === 'boolean'
          ? evalRes.value.value
          : evalRes.displayValue;

    nodeOutputsById[node.id] = rawVal;
    if (node.outputDelegationMode === 'named' || node.outputDelegationMode === 'both') {
      namedOutputs[node.outputAlias || node.callName] = rawVal;
      namedOutputs[node.callName] = rawVal;
    }
    let slot: number | null = null;
    if (node.outputDelegationMode === 'positional' || node.outputDelegationMode === 'both') {
      slot = positionalOutputs.length + 1;
      positionalOutputs.push({ slot, callName: node.callName, value: rawVal });
    }
    lastOutput = rawVal;

    steps.push({
      nodeId: node.id,
      callName: node.callName,
      outputAlias: node.outputAlias || node.callName,
      delegationMode: node.outputDelegationMode,
      positionalSlot: slot,
      branchStatus,
      branchDetail,
      resolvedInputs,
      ok: true,
      value: rawVal,
      displayValue: evalRes.displayValue,
    });
  }

  return {
    ok: allOk,
    pipelineName: pipeline.name,
    rootInputs,
    namedOutputs,
    positionalOutputs,
    finalOutput: lastOutput,
    finalDisplay: lastOutput === null ? '—' : String(lastOutput),
    steps,
  };
}

/* ============================================================================
 * SUPERSET-SCRIPT CODE GENERATOR (PYTHON / JAVASCRIPT / TYPESCRIPT / RUST)
 * Emits a self-contained runnable orchestrator exposing every root literal
 * parameter to the CLI, invoking every child equation under its callName,
 * routing branches, and delegating named & positional outputs recursively.
 * ========================================================================== */

function pyLiteral(val: string, kind: 'number' | 'boolean'): string {
  if (kind === 'boolean') {
    const low = val.trim().toLowerCase();
    return low === 'true' || val.trim() === '⊤' || low === '1' ? 'True' : 'False';
  }
  const n = Number(val.trim());
  return val.trim() !== '' && !Number.isNaN(n) ? val.trim() : '0';
}

function jsLiteral(val: string, kind: 'number' | 'boolean'): string {
  if (kind === 'boolean') {
    const low = val.trim().toLowerCase();
    return low === 'true' || val.trim() === '⊤' || low === '1' ? 'true' : 'false';
  }
  const n = Number(val.trim());
  return val.trim() !== '' && !Number.isNaN(n) ? val.trim() : '0';
}

function renderPythonBranchExpr(srcVar: string, guard: PipelineBranchGuard): string {
  const thr = Number(guard.threshold ?? '0');
  const thrExpr = Number.isNaN(thr) ? JSON.stringify(guard.threshold ?? '') : String(thr);
  switch (guard.condition) {
    case 'truthy':
      return `bool(${srcVar})`;
    case 'falsy':
      return `(not bool(${srcVar}))`;
    case 'gt':
      return `(float(${srcVar}) > ${thrExpr})`;
    case 'gte':
      return `(float(${srcVar}) >= ${thrExpr})`;
    case 'lt':
      return `(float(${srcVar}) < ${thrExpr})`;
    case 'lte':
      return `(float(${srcVar}) <= ${thrExpr})`;
    case 'eq':
      return `(${srcVar} == ${thrExpr})`;
    case 'neq':
      return `(${srcVar} != ${thrExpr})`;
  }
}

function renderJsBranchExpr(srcVar: string, guard: PipelineBranchGuard): string {
  const thr = Number(guard.threshold ?? '0');
  const thrExpr = Number.isNaN(thr) ? JSON.stringify(guard.threshold ?? '') : String(thr);
  switch (guard.condition) {
    case 'truthy':
      return `Boolean(${srcVar})`;
    case 'falsy':
      return `(!Boolean(${srcVar}))`;
    case 'gt':
      return `(Number(${srcVar}) > ${thrExpr})`;
    case 'gte':
      return `(Number(${srcVar}) >= ${thrExpr})`;
    case 'lt':
      return `(Number(${srcVar}) < ${thrExpr})`;
    case 'lte':
      return `(Number(${srcVar}) <= ${thrExpr})`;
    case 'eq':
      return `(${srcVar} == ${thrExpr})`;
    case 'neq':
      return `(${srcVar} != ${thrExpr})`;
  }
}

export function generateSupersetScript(
  pipeline: EquationPipelineSpec,
  target: SupersetScriptTarget
): { content: string; filename: string; mime: string } {
  const slug = sanitizePipelineIdentifier(pipeline.name, 'equation_pipeline');
  const rootInputs = collectPipelineRootInputs(pipeline);
  const sampleKv = rootInputs.map((r) => `${r.name}=${r.defaultValue}`).join(' ');

  if (target === 'python') {
    const fnBlocks: string[] = [];
    const emitPythonPipelineFns = (spec: EquationPipelineSpec, fnName: string) => {
      const nodeIdToCallName = new Map(spec.nodes.map((n) => [n.id, n.callName]));

      for (const node of spec.nodes) {
        if (node.subPipeline && node.subPipeline.nodes.length > 0) {
          emitPythonPipelineFns(node.subPipeline, `sub_${sanitizePipelineIdentifier(node.callName)}`);
          continue;
        }
        const translation = translateLambdaCallsToNamedCallbacks(node.statement, node.labels);
        const reqs = extractNodeRequiredInputs(node.statement, node.labels);
        const paramSig = reqs
          .map((r) => `${r.name}=${pyLiteral(r.defaultValue, r.kind)}`)
          .join(', ');
        const lambdaLines = node.labels
          .filter((l) => l.kind === 'lambda')
          .map((l) => {
            const unwrapped = extractLambdaParamsAndBody(l.value);
            return unwrapped
              ? `    ("lambda", ${JSON.stringify(l.name)}, ${JSON.stringify(l.value)}),`
              : `    ("lambda", ${JSON.stringify(l.name)}, ${JSON.stringify(l.value)}),`;
          });
        const labelTupleLines = reqs.map(
          (r) => `        (${JSON.stringify(r.name)}, ${JSON.stringify(r.kind)}, str(${r.name})),`
        );
        const extraLambdas = node.labels
          .filter((l) => l.kind === 'lambda')
          .map((l) => `        (${JSON.stringify(l.name)}, "lambda", ${JSON.stringify(l.value)}),`);

        fnBlocks.push(`def ${node.callName}(${paramSig}${paramSig ? ', ' : ''}extra_context=None):
    """${node.description.replace(/"/g, "'")}
    Statement: ${translation.translatedStatement}
    Output alias: ${node.outputAlias || node.callName} (delegation=${node.outputDelegationMode})
    """
    labels = [
${[...labelTupleLines, ...extraLambdas].join('\n')}
    ]
    if extra_context:
        for _k, _v in extra_context.items():
            if not any(n == _k for n, _, _ in labels):
                _kind = "boolean" if isinstance(_v, bool) else "number"
                labels.append((_k, _kind, str(_v)))
    return _eval_equation(${JSON.stringify(translation.translatedStatement)}, labels)
`);
        void lambdaLines;
      }

      // Orchestrator function for this pipeline level
      const stepLines: string[] = [];
      for (const node of spec.nodes) {
        const alias = node.outputAlias || node.callName;
        const reqs =
          node.subPipeline && node.subPipeline.nodes.length > 0
            ? collectPipelineRootInputs(node.subPipeline)
            : extractNodeRequiredInputs(node.statement, node.labels);

        const argExprs = reqs.map((r) => {
          const binding = node.inputMappings.find((m) => m.paramName === r.name);
          const mode = binding?.mode ?? 'cli_default';
          if (mode === 'literal') {
            return `${r.name}=${pyLiteral(binding?.literalValue ?? r.defaultValue, r.kind)}`;
          }
          if (mode === 'pipe_named') {
            const srcName = binding?.sourceNodeId
              ? nodeIdToCallName.get(binding.sourceNodeId) || alias
              : alias;
            return `${r.name}=named_outputs.get(${JSON.stringify(srcName)}, ${pyLiteral(r.defaultValue, r.kind)})`;
          }
          if (mode === 'pipe_positional') {
            const posIdx = binding?.positionalIndex ?? 0;
            const lookup =
              posIdx === 0
                ? `(positional_outputs[-1] if positional_outputs else ${pyLiteral(r.defaultValue, r.kind)})`
                : `(positional_outputs[${posIdx - 1}] if len(positional_outputs) >= ${posIdx} else ${pyLiteral(r.defaultValue, r.kind)})`;
            return `${r.name}=${lookup}`;
          }
          return `${r.name}=resolved_inputs.get(${JSON.stringify(`${node.callName}__${r.name}`)}, resolved_inputs.get(${JSON.stringify(r.name)}, ${pyLiteral(binding?.literalValue ?? r.defaultValue, r.kind)}))`;
        });

        const callInvoke =
          node.subPipeline && node.subPipeline.nodes.length > 0
            ? `sub_${sanitizePipelineIdentifier(node.callName)}({**resolved_inputs, ${argExprs.map((a) => {
                const [k, v] = a.split('=');
                return `${JSON.stringify(k)}: ${v}`;
              }).join(', ')}})["final_output"]`
            : `${node.callName}(${argExprs.join(', ')}${argExprs.length ? ', ' : ''}extra_context=named_outputs)`;

        const delegateLines: string[] = [];
        if (node.outputDelegationMode === 'named' || node.outputDelegationMode === 'both') {
          delegateLines.push(`    named_outputs[${JSON.stringify(alias)}] = _val`);
          delegateLines.push(`    named_outputs[${JSON.stringify(node.callName)}] = _val`);
        }
        if (node.outputDelegationMode === 'positional' || node.outputDelegationMode === 'both') {
          delegateLines.push(`    positional_outputs.append(_val)`);
        }

        if (node.branchGuard?.enabled && node.branchGuard.sourceNodeId) {
          const srcCall = nodeIdToCallName.get(node.branchGuard.sourceNodeId) || '';
          const condExpr = renderPythonBranchExpr(`named_outputs.get(${JSON.stringify(srcCall)}, 0)`, node.branchGuard);
          const fbRaw = node.branchGuard.fallbackValue?.trim();
          const fbExpr = fbRaw
            ? !Number.isNaN(Number(fbRaw))
              ? fbRaw
              : fbRaw.toLowerCase() === 'true'
                ? 'True'
                : fbRaw.toLowerCase() === 'false'
                  ? 'False'
                  : JSON.stringify(fbRaw)
            : `named_outputs.get(${JSON.stringify(srcCall)}, 0)`;
          stepLines.push(`    # Stage: ${node.callName} (branched on ${srcCall})
    if ${condExpr}:
        _val = ${callInvoke}
        _status = "taken"
    else:
        _val = ${fbExpr}
        _status = "skipped"
${delegateLines.map((l) => l).join('\n')}
    trace.append({"call": ${JSON.stringify(node.callName)}, "alias": ${JSON.stringify(alias)}, "branch": _status, "delegation": ${JSON.stringify(node.outputDelegationMode)}, "value": _val})
    final_output = _val
`);
        } else {
          stepLines.push(`    # Stage: ${node.callName}
    _val = ${callInvoke}
${delegateLines.map((l) => l).join('\n')}
    trace.append({"call": ${JSON.stringify(node.callName)}, "alias": ${JSON.stringify(alias)}, "branch": "always", "delegation": ${JSON.stringify(node.outputDelegationMode)}, "value": _val})
    final_output = _val
`);
        }
      }

      fnBlocks.push(`def ${fnName}(inputs=None):
    resolved_inputs = dict(DEFAULT_INPUTS)
    if inputs:
        resolved_inputs.update(inputs)
    named_outputs = {}
    positional_outputs = []
    trace = []
    final_output = None
${stepLines.join('\n') || '    pass\n'}
    return {
        "pipeline": ${JSON.stringify(spec.name)},
        "inputs": resolved_inputs,
        "named_outputs": named_outputs,
        "positional_outputs": positional_outputs,
        "final_output": final_output,
        "trace": trace,
    }
`);
    };

    emitPythonPipelineFns(pipeline, `run_${slug}`);

    const defaultInputLines = rootInputs.map(
      (r) => `    ${JSON.stringify(r.name)}: ${pyLiteral(r.defaultValue, r.kind)},`
    );
    const cliFlagLines = rootInputs.map(
      (r) =>
        `    parser.add_argument("--${r.name}", dest=${JSON.stringify(r.name)}, type=${r.kind === 'boolean' ? '_parse_bool_lit' : '_parse_num_lit'}, default=None, help="Named literal parameter '${r.name}' (default: ${r.defaultValue})")`
    );

    const content = `#!/usr/bin/env python3
"""
Auto-generated Superset-Script Pipeline: ${pipeline.name}
${pipeline.description}
Supports:
  - Named CLI literal parameters (--<var> <literal>)
  - Editable single-string input (--input "k=v ...") or positional string
  - Conditional branching, positional & named output delegation, and nested sub-pipelines
"""
import argparse
import ast
import json
import re
import sys

PIPELINE_NAME = ${JSON.stringify(pipeline.name)}
SAMPLE_SINGLE_INPUT = ${JSON.stringify(sampleKv)}

DEFAULT_INPUTS = {
${defaultInputLines.join('\n')}
}

def _parse_bool_lit(raw: str) -> bool:
    low = str(raw).strip().lower()
    if low in ("true", "1", "yes", "⊤"):
        return True
    if low in ("false", "0", "no", "⊥"):
        return False
    raise argparse.ArgumentTypeError(f"Expected boolean literal, got: {raw!r}")

def _parse_num_lit(raw: str):
    t = str(raw).strip()
    try:
        return int(t) if re.fullmatch(r"-?\\d+", t) else float(t)
    except ValueError:
        raise argparse.ArgumentTypeError(f"Expected numeric literal, got: {raw!r}")

def _normalize_expr(source: str) -> str:
    expr = source.strip()
    def _collapse_lambdas(match):
        params = re.findall(r"[λ\\\\]\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\.", match.group(0))
        return f"lambda {', '.join(params)}: "
    expr = re.sub(r"(?:[λ\\\\]\\s*[A-Za-z_][A-Za-z0-9_]*\\s*\\.\\s*)+", _collapse_lambdas, expr)
    expr = expr.replace("⊤", "True").replace("⊥", "False")
    expr = expr.replace("¬", " not ").replace("∧", " and ").replace("∨", " or ")
    expr = expr.replace("≤", "<=").replace("≥", ">=").replace("≠", "!=")
    expr = expr.replace("⊕", " ^ ").replace("↔", " == ").replace("≡", " == ")
    return expr

def _eval_equation(statement: str, labels):
    env = {"True": True, "False": False, "bool": bool, "int": int, "float": float}
    for name, kind, raw_val in labels:
        val_str = str(raw_val).strip()
        if kind == "boolean":
            env[name] = val_str.lower() in ("true", "⊤", "1")
        elif kind == "number":
            try:
                env[name] = int(val_str) if re.fullmatch(r"-?\\d+", val_str) else float(val_str)
            except ValueError:
                env[name] = eval(compile(ast.parse(_normalize_expr(val_str), mode="eval"), "<label>", "eval"), {"__builtins__": {}}, env)
        else:
            env[name] = eval(compile(ast.parse(_normalize_expr(val_str), mode="eval"), "<lambda>", "eval"), {"__builtins__": {}}, env)
    return eval(compile(ast.parse(_normalize_expr(statement), mode="eval"), "<equation>", "eval"), {"__builtins__": {}}, env)

def parse_single_string_inputs(raw_input: str):
    parsed = dict(DEFAULT_INPUTS)
    text = str(raw_input or "").strip()
    if not text:
        return parsed
    pos_vals = []
    for tok in re.split(r"[\\s,;]+", text):
        if not tok:
            continue
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)[:=](.+)$", tok)
        if m:
            k, v = m.group(1), m.group(2)
            if k in parsed and isinstance(parsed[k], bool):
                parsed[k] = _parse_bool_lit(v)
            else:
                try:
                    parsed[k] = _parse_num_lit(v)
                except Exception:
                    parsed[k] = v
        else:
            pos_vals.append(tok)
    keys = list(DEFAULT_INPUTS.keys())
    p_idx = 0
    for k in keys:
        if p_idx < len(pos_vals) and f"{k}=" not in text and f"{k}:" not in text:
            raw_tok = pos_vals[p_idx]
            p_idx += 1
            parsed[k] = _parse_bool_lit(raw_tok) if isinstance(DEFAULT_INPUTS[k], bool) else _parse_num_lit(raw_tok)
    return parsed

${fnBlocks.join('\n')}
def cli_main(argv=None):
    parser = argparse.ArgumentParser(description=f"Superset-Script Pipeline: {PIPELINE_NAME}")
    parser.add_argument("raw_input", nargs="?", default=None, help=f"Optional single string input (default: {SAMPLE_SINGLE_INPUT!r})")
    parser.add_argument("--input", dest="input_string", default=None, help="Edit the single grammar-parsed input string")
    parser.add_argument("--json", action="store_true", help="Output full pipeline result as JSON")
${cliFlagLines.join('\n')}
    args = parser.parse_args(argv)

    base_str = args.input_string if args.input_string is not None else (args.raw_input if args.raw_input is not None else SAMPLE_SINGLE_INPUT)
    inputs = parse_single_string_inputs(base_str)
    for key in list(DEFAULT_INPUTS.keys()):
        override_val = getattr(args, key, None)
        if override_val is not None:
            inputs[key] = override_val

    outcome = run_${slug}(inputs)
    if args.json:
        print(json.dumps(outcome, indent=2))
    else:
        print(f"Pipeline: {outcome['pipeline']}")
        print(f"Inputs:   {outcome['inputs']}")
        for step in outcome["trace"]:
            print(f"  [{step['branch']:7s}] {step['call']} -> {step['alias']} = {step['value']} ({step['delegation']})")
        print(f"Final Output: {outcome['final_output']}")
    return outcome

if __name__ == "__main__":
    cli_main()
`;
    return { content, filename: `${slug}_superset.py`, mime: 'text/x-python' };
  }

  if (target === 'javascript' || target === 'typescript') {
    const isTs = target === 'typescript';
    const fnBlocks: string[] = [];

    const emitJsPipelineFns = (spec: EquationPipelineSpec, fnName: string) => {
      const nodeIdToCallName = new Map(spec.nodes.map((n) => [n.id, n.callName]));

      for (const node of spec.nodes) {
        if (node.subPipeline && node.subPipeline.nodes.length > 0) {
          emitJsPipelineFns(node.subPipeline, `sub_${sanitizePipelineIdentifier(node.callName)}`);
          continue;
        }
        const translation = translateLambdaCallsToNamedCallbacks(node.statement, node.labels);
        const reqs = extractNodeRequiredInputs(node.statement, node.labels);
        const parsed = parseLogicExpression(translation.translatedStatement);
        const bodyJs = parsed.ok ? astToJsExprInline(parsed.ast) : '0';
        const lambdaDecls = node.labels
          .filter((l) => l.kind === 'lambda')
          .map((l) => {
            const unwrapped = extractLambdaParamsAndBody(l.value);
            if (unwrapped) {
              return `  const ${l.name} = (${unwrapped.params.map((p) => (isTs ? `${p}: any` : p)).join(', ')}) => (${astToJsExprInline(unwrapped.body)});`;
            }
            return `  const ${l.name} = (x${isTs ? ': any' : ''}) => x;`;
          });
        const destructuredParams = reqs
          .map((r) => `  const ${r.name} = params.${r.name} ?? ${jsLiteral(r.defaultValue, r.kind)};`)
          .join('\n');

        fnBlocks.push(`export function ${node.callName}(params${isTs ? ': Record<string, any>' : ''} = {}, namedContext${isTs ? ': Record<string, any>' : ''} = {}) {
${destructuredParams}
${lambdaDecls.join('\n')}
  void namedContext;
  return (${bodyJs});
}`);
      }

      const stepBlocks: string[] = [];
      for (const node of spec.nodes) {
        const alias = node.outputAlias || node.callName;
        const reqs =
          node.subPipeline && node.subPipeline.nodes.length > 0
            ? collectPipelineRootInputs(node.subPipeline)
            : extractNodeRequiredInputs(node.statement, node.labels);

        const paramEntries = reqs.map((r) => {
          const binding = node.inputMappings.find((m) => m.paramName === r.name);
          const mode = binding?.mode ?? 'cli_default';
          if (mode === 'literal') {
            return `${r.name}: ${jsLiteral(binding?.literalValue ?? r.defaultValue, r.kind)}`;
          }
          if (mode === 'pipe_named') {
            const srcName = binding?.sourceNodeId ? nodeIdToCallName.get(binding.sourceNodeId) || alias : alias;
            return `${r.name}: namedOutputs[${JSON.stringify(srcName)}] ?? ${jsLiteral(r.defaultValue, r.kind)}`;
          }
          if (mode === 'pipe_positional') {
            const posIdx = binding?.positionalIndex ?? 0;
            const lookup =
              posIdx === 0
                ? `(positionalOutputs.length ? positionalOutputs[positionalOutputs.length - 1] : ${jsLiteral(r.defaultValue, r.kind)})`
                : `(positionalOutputs[${posIdx - 1}] ?? ${jsLiteral(r.defaultValue, r.kind)})`;
            return `${r.name}: ${lookup}`;
          }
          return `${r.name}: resolvedInputs[${JSON.stringify(`${node.callName}__${r.name}`)}] ?? resolvedInputs[${JSON.stringify(r.name)}] ?? ${jsLiteral(binding?.literalValue ?? r.defaultValue, r.kind)}`;
        });

        const invokeExpr =
          node.subPipeline && node.subPipeline.nodes.length > 0
            ? `sub_${sanitizePipelineIdentifier(node.callName)}({ ...resolvedInputs, ${paramEntries.join(', ')} }).finalOutput`
            : `${node.callName}({ ${paramEntries.join(', ')} }, namedOutputs)`;

        const delegateStmts: string[] = [];
        if (node.outputDelegationMode === 'named' || node.outputDelegationMode === 'both') {
          delegateStmts.push(`    namedOutputs[${JSON.stringify(alias)}] = val;`);
          delegateStmts.push(`    namedOutputs[${JSON.stringify(node.callName)}] = val;`);
        }
        if (node.outputDelegationMode === 'positional' || node.outputDelegationMode === 'both') {
          delegateStmts.push(`    positionalOutputs.push(val);`);
        }

        if (node.branchGuard?.enabled && node.branchGuard.sourceNodeId) {
          const srcCall = nodeIdToCallName.get(node.branchGuard.sourceNodeId) || '';
          const cond = renderJsBranchExpr(`namedOutputs[${JSON.stringify(srcCall)}]`, node.branchGuard);
          const fbRaw = node.branchGuard.fallbackValue?.trim();
          const fbExpr = fbRaw
            ? !Number.isNaN(Number(fbRaw))
              ? fbRaw
              : fbRaw.toLowerCase() === 'true'
                ? 'true'
                : fbRaw.toLowerCase() === 'false'
                  ? 'false'
                  : JSON.stringify(fbRaw)
            : `namedOutputs[${JSON.stringify(srcCall)}] ?? 0`;
          stepBlocks.push(`  {
    let val${isTs ? ': any' : ''};
    let branch = 'taken';
    if (${cond}) {
      val = ${invokeExpr};
    } else {
      val = ${fbExpr};
      branch = 'skipped';
    }
${delegateStmts.join('\n')}
    trace.push({ call: ${JSON.stringify(node.callName)}, alias: ${JSON.stringify(alias)}, branch, delegation: ${JSON.stringify(node.outputDelegationMode)}, value: val });
    finalOutput = val;
  }`);
        } else {
          stepBlocks.push(`  {
    const val = ${invokeExpr};
${delegateStmts.join('\n')}
    trace.push({ call: ${JSON.stringify(node.callName)}, alias: ${JSON.stringify(alias)}, branch: 'always', delegation: ${JSON.stringify(node.outputDelegationMode)}, value: val });
    finalOutput = val;
  }`);
        }
      }

      fnBlocks.push(`export function ${fnName}(inputs${isTs ? ': Record<string, any>' : ''} = {}) {
  const resolvedInputs${isTs ? ': Record<string, any>' : ''} = { ...DEFAULT_INPUTS, ...inputs };
  const namedOutputs${isTs ? ': Record<string, any>' : ''} = {};
  const positionalOutputs${isTs ? ': any[]' : ''} = [];
  const trace${isTs ? ': Array<{ call: string; alias: string; branch: string; delegation: string; value: any }>' : ''} = [];
  let finalOutput${isTs ? ': any' : ''} = null;
${stepBlocks.join('\n')}
  return { pipeline: ${JSON.stringify(spec.name)}, inputs: resolvedInputs, namedOutputs, positionalOutputs, finalOutput, trace };
}`);
    };

    emitJsPipelineFns(pipeline, `run_${slug}`);

    const defaultInputEntries = rootInputs.map(
      (r) => `  ${JSON.stringify(r.name)}: ${jsLiteral(r.defaultValue, r.kind)},`
    );

    const content = `// Auto-generated ${isTs ? 'TypeScript' : 'JavaScript (ESM)'} Superset-Script Pipeline: ${pipeline.name}
// Exposes all root literal parameters as named CLI flags (--<name> <literal>), plus --input "<str>" & defaults.
export const PIPELINE_NAME = ${JSON.stringify(pipeline.name)};
export const SAMPLE_SINGLE_INPUT = ${JSON.stringify(sampleKv)};

export const DEFAULT_INPUTS${isTs ? ': Record<string, number | boolean | string>' : ''} = {
${defaultInputEntries.join('\n')}
};

function parseLiteral(raw${isTs ? ': string' : ''}, sampleVal${isTs ? ': unknown' : ''})${isTs ? ': number | boolean | string' : ''} {
  const t = String(raw).trim();
  const low = t.toLowerCase();
  if (typeof sampleVal === 'boolean' || low === 'true' || low === 'false' || t === '⊤' || t === '⊥') {
    return low === 'true' || low === '1' || t === '⊤';
  }
  if (t !== '' && !Number.isNaN(Number(t))) return Number(t);
  return t;
}

export function parseSingleStringInputs(rawInput${isTs ? ': string' : ''} = SAMPLE_SINGLE_INPUT)${isTs ? ': Record<string, number | boolean | string>' : ''} {
  const out${isTs ? ': Record<string, number | boolean | string>' : ''} = { ...DEFAULT_INPUTS };
  const text = String(rawInput ?? '').trim();
  if (!text) return out;
  const positional${isTs ? ': string[]' : ''} = [];
  for (const tok of text.split(/[\\s,;]+/).filter(Boolean)) {
    const m = tok.match(/^([A-Za-z_][A-Za-z0-9_]*)[:=](.+)$/);
    if (m) {
      out[m[1]] = parseLiteral(m[2], out[m[1]]);
    } else {
      positional.push(tok);
    }
  }
  const keys = Object.keys(DEFAULT_INPUTS);
  let pIdx = 0;
  for (const k of keys) {
    if (pIdx < positional.length && !new RegExp(\`\\\\b\${k}\\\\s*[:=]\`).test(text)) {
      out[k] = parseLiteral(positional[pIdx++], DEFAULT_INPUTS[k]);
    }
  }
  return out;
}

${fnBlocks.join('\n\n')}

export function parseCliArgs(argv${isTs ? ': string[]' : ''} = []) {
  let inputStr = SAMPLE_SINGLE_INPUT;
  let asJson = false;
  const overrides${isTs ? ': Record<string, number | boolean | string>' : ''} = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') { asJson = true; continue; }
    if (arg === '--input' && argv[i + 1] !== undefined) { inputStr = argv[++i]; continue; }
    if (arg.startsWith('--input=')) { inputStr = arg.slice(8); continue; }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > 2) {
        const k = arg.slice(2, eq);
        overrides[k] = parseLiteral(arg.slice(eq + 1), DEFAULT_INPUTS[k]);
      } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) {
        const k = arg.slice(2);
        overrides[k] = parseLiteral(argv[++i], DEFAULT_INPUTS[k]);
      }
    } else if (!arg.startsWith('-')) {
      inputStr = arg;
    }
  }
  return { inputs: { ...parseSingleStringInputs(inputStr), ...overrides }, asJson };
}

if (typeof process !== 'undefined' && Array.isArray(process.argv) && process.argv[1]?.includes(${JSON.stringify(`${slug}_superset`)})) {
  const { inputs, asJson } = parseCliArgs(process.argv.slice(2));
  const result = run_${slug}(inputs);
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('Pipeline:', result.pipeline);
    console.log('Inputs:', result.inputs);
    for (const s of result.trace) {
      console.log(\`  [\${s.branch}] \${s.call} -> \${s.alias} = \${s.value} (\${s.delegation})\`);
    }
    console.log('Final Output:', result.finalOutput);
  }
}
`;
    return {
      content,
      filename: `${slug}_superset.${isTs ? 'ts' : 'mjs'}`,
      mime: isTs ? 'text/typescript' : 'text/javascript',
    };
  }

  // Rust Superset-Script
  const nodeConsts = pipeline.nodes.map(
    (n) =>
      `    (${JSON.stringify(n.callName)}, ${JSON.stringify(n.outputAlias || n.callName)}, ${JSON.stringify(n.outputDelegationMode)}, r#"${n.statement}"#),`
  );
  const defaultRows = rootInputs.map(
    (r) => `    (${JSON.stringify(r.name)}, ${JSON.stringify(r.kind)}, ${JSON.stringify(r.defaultValue)}),`
  );
  const rustContent = `// Auto-generated Rust Superset-Script Pipeline: ${pipeline.name}
// Supports CLI named literal flags (--<var> <literal>), --input "<str>", and default fallbacks.
use std::collections::HashMap;
use std::env;

pub const PIPELINE_NAME: &str = ${JSON.stringify(pipeline.name)};
pub const SAMPLE_SINGLE_INPUT: &str = ${JSON.stringify(sampleKv)};

pub const DEFAULT_INPUTS: &[(&str, &str, &str)] = &[
${defaultRows.join('\n')}
];

pub const PIPELINE_STAGES: &[(&str, &str, &str, &str)] = &[
${nodeConsts.join('\n')}
];

pub fn parse_cli_inputs(args: &[String]) -> HashMap<String, String> {
    let mut map: HashMap<String, String> = DEFAULT_INPUTS
        .iter()
        .map(|(k, _, v)| ((*k).to_string(), (*v).to_string()))
        .collect();
    let mut i = 0usize;
    while i < args.len() {
        let a = &args[i];
        if a == "--input" && i + 1 < args.len() {
            for tok in args[i + 1].split(|c: char| c.is_whitespace() || c == ',' || c == ';') {
                if let Some((k, v)) = tok.split_once('=').or_else(|| tok.split_once(':')) {
                    map.insert(k.trim().to_string(), v.trim().to_string());
                }
            }
            i += 2;
            continue;
        }
        if let Some(rest) = a.strip_prefix("--") {
            if let Some((k, v)) = rest.split_once('=') {
                map.insert(k.to_string(), v.to_string());
                i += 1;
                continue;
            } else if i + 1 < args.len() {
                map.insert(rest.to_string(), args[i + 1].clone());
                i += 2;
                continue;
            }
        }
        i += 1;
    }
    map
}

pub fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let inputs = parse_cli_inputs(&args);
    println!("Pipeline: {}", PIPELINE_NAME);
    println!("Resolved CLI Inputs: {:?}", inputs);
    for (idx, (call_name, alias, delegation, stmt)) in PIPELINE_STAGES.iter().enumerate() {
        println!("  Stage #{}: {} -> {} ({}) :: {}", idx + 1, call_name, alias, delegation, stmt);
    }
}
`;
  return { content: rustContent, filename: `${slug}_superset.rs`, mime: 'text/plain' };
}

function astToJsExprInline(node: ReturnType<typeof parseLogicExpression> extends { ok: true; ast: infer A } ? A : never): string {
  switch (node.type) {
    case 'NumberLit':
      return String(node.value);
    case 'BoolLit':
      return node.value ? 'true' : 'false';
    case 'Identifier':
      return node.name;
    case 'UnaryOp':
      return node.op === '¬'
        ? `(!(${astToJsExprInline(node.operand)}))`
        : `(-(${astToJsExprInline(node.operand)}))`;
    case 'BinaryOp': {
      const l = astToJsExprInline(node.left);
      const r = astToJsExprInline(node.right);
      switch (node.op) {
        case '∧': return `(${l} && ${r})`;
        case '∨': return `(${l} || ${r})`;
        case '⊕': return `(Boolean(${l}) !== Boolean(${r}))`;
        case '→': return `((!${l}) || ${r})`;
        case '↔':
        case '≡': return `(Boolean(${l}) === Boolean(${r}))`;
        case '=': return `(${l} === ${r})`;
        case '≠': return `(${l} !== ${r})`;
        case '<': return `(${l} < ${r})`;
        case '≤': return `(${l} <= ${r})`;
        case '>': return `(${l} > ${r})`;
        case '≥': return `(${l} >= ${r})`;
        case '^': return `Math.pow(${l}, ${r})`;
        default: return `(${l} ${node.op} ${r})`;
      }
    }
    case 'Quantifier': {
      const method = node.quantifier === '∀' ? 'every' : 'some';
      return `[false, true].${method}((${node.variable}) => (${astToJsExprInline(node.body)}))`;
    }
    case 'Lambda':
      return `((${node.param}) => (${astToJsExprInline(node.body)}))`;
    case 'Call':
      return `${astToJsExprInline(node.callee)}(${astToJsExprInline(node.arg)})`;
  }
}
