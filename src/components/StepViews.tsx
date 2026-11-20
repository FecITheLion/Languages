import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  CheckCircle2,
  Cloud,
  Code2,
  Cpu,
  Download,
  FileCode2,
  GripVertical,
  HardDrive,
  Lock,
  LogOut,
  Package,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  XCircle,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { DEFAULT_GRAMMAR_SYMBOLS, DIALECT_PRESETS } from '../data/openapiAndDsl';
import {
  executeWasmExport,
  GRAMMAR_SYMBOL_SPECS,
  resolveGrammarSymbols,
  type ResolvedGrammarSymbols,
} from '../engine/bidirectionalEngine';
import type { GlobalCallbackDef } from '../engine/globalCallbacksEngine';
import type { LogicLabelBinding } from '../engine/logicLambdaEngine';
import type { McpWorkspaceContext } from '../engine/mcpServerEngine';
import type { AutocompleteSuggestion, ReferencedModuleExport } from '../engine/moduleAutocompleteEngine';
import type { StudioLintIssue } from '../engine/htmlOutputFormatter';
import { DocTooltip } from './DocTooltip';
import { LogicLambdaWorkbench } from './LogicLambdaWorkbench';
import { McpServersWorkbench, type PipelineMcpUiEffect } from './McpServersWorkbench';
import { RuleDependencyGraph } from './RuleDependencyGraph';
import { RulePropertiesWorkbench } from './RulePropertiesWorkbench';
import { SchemaPredicateWorkbench } from './SchemaPredicateWorkbench';
import type {
  DialectConfig,
  DialectPresetId,
  EvaluationResult,
  GrammarRule,
  LineMutation,
  McpServerId,
  ModalStructure,
  MutationPolicy,
  PrimaryLanguage,
  PythonAstNode,
  RuleDependencyGraphData,
  RuleMergeStrategy,
  RuleOrderConfig,
  RustAstModule,
  SchemaConfig,
  SchemaPresetId,
  TransformTarget,
  VaultRecord,
  WasmCompilationResult,
  WorkflowSlug,
} from '../types/studio';

export interface StepViewsProps {
  onSubmitArtifacts: (owner: string, submissions: import('../engine/virtualFiles').VirtualSubmission[]) => void;
  activePage: WorkflowSlug;
  layoutStructure?: ModalStructure;
  dialect: DialectConfig;
  lastKnownDialectSymbols?: ResolvedGrammarSymbols;
  schemaConfig: SchemaConfig;
  mutationPolicy: MutationPolicy;
  rules: GrammarRule[];
  ruleGraph: RuleDependencyGraphData;
  jsonText: string;
  jsonValid: boolean;
  mutations: Record<string, LineMutation>;
  evalRule: string;
  evalPayload: string;
  evalResult: EvaluationResult;
  pythonSource: string;
  pythonAst: PythonAstNode;
  pythonAstDump: string;
  rustSource: string;
  rustAst: RustAstModule;
  rustAstDump: string;
  watSource: string;
  wasmResult: WasmCompilationResult;
  // Drive & Demo Vault
  driveMode: 'drive' | 'demo';
  driveUser: User | null;
  driveAuthLoading: boolean;
  driveBusy: boolean;
  driveError: string | null;
  vaultNameInput: string;
  vaultFiles: VaultRecord[];
  // Handlers
  onApplyDialectPreset: (preset: DialectPresetId) => void;
  onDialectChange: (patch: Partial<DialectConfig>) => void;
  onLoadEbnfSample: () => void;
  onLoadPythonGrammarSample: () => void;
  onLoadRustGrammarSample: () => void;
  onApplySchemaPreset: (preset: SchemaPresetId) => void;
  onSchemaConfigChange: (patch: Partial<SchemaConfig>) => void;
  onMutationPolicyChange: (patch: Partial<MutationPolicy>) => void;
  onToggleRuleLock: (ruleName: string) => void;
  onAutoInferMutations: () => void;
  onResetMutations: () => void;
  onMutationChange: (ruleName: string, patch: Partial<LineMutation>) => void;
  onEvalRuleChange: (rule: string) => void;
  onEvalPayloadChange: (payload: string) => void;
  onExportWorkspace: () => void;
  onExportJsonLdPackage: (targets: TransformTarget[]) => void;
  onImportJsonLdPackageFile: (file: File) => void;
  onTransformFromJsonLdToTarget: (target: TransformTarget) => void;
  onImportWorkspaceFile: (file: File) => void;
  onExportTextFile: (content: string, filename: string, mime: string) => void;
  onImportGrammarFile: (file: File) => void;
  onImportPythonFile: (file: File) => void;
  onImportRustFile: (file: File) => void;
  onImportWatFile: (file: File) => void;
  onImportWasmFile: (file: File) => void;
  onExportWasmBinary: () => void;
  onLoadEmptyPayload: () => void;
  onRunPythonSample: () => void;
  onRunRustSample: () => void;
  onRunWasmSample: () => void;
  onDownloadProjectZip: () => void;
  onDriveModeChange: (mode: 'drive' | 'demo') => void;
  onGoogleSignIn: () => void;
  onGoogleSignOut: () => void;
  onVaultNameChange: (name: string) => void;
  onRefreshVault: () => void;
  onSaveNewSnapshot: () => void;
  onLoadSnapshot: (record: VaultRecord) => void;
  onRequestOverwriteSnapshot: (record: VaultRecord) => void;
  onRequestDeleteSnapshot: (record: VaultRecord) => void;
  onPythonSourceChange: (src: string) => void;
  onGeneratePythonFromGrammar: () => void;
  onUnparsePythonAst: () => void;
  onSyncPythonToGrammar: () => void;
  onRustSourceChange: (src: string) => void;
  onGenerateRustFromWorkspace: () => void;
  onSyncRustToGrammar: () => void;
  onWatSourceChange: (wat: string) => void;
  onGenerateWatFromWorkspace: () => void;
  onDecompileWasmToWat: () => void;
  onAutoStubMissingRules: (missingNames: string[]) => void;
  onOpenFullGraphView: () => void;
  grammarText: string;
  ruleConfigs: Record<string, RuleOrderConfig>;
  logicStatement: string;
  logicLabels: LogicLabelBinding[];
  globalCallbacks: GlobalCallbackDef[];
  onSaveGlobalCallback: (input: {
    name: string;
    lambdaExpr: string;
    description?: string;
    source?: 'logic_calc' | 'rule_props' | 'manual';
  }) => void;
  onDeleteGlobalCallback: (idOrName: string) => void;
  mcpWorkspaceContext: McpWorkspaceContext;
  selectedMcpServerId?: McpServerId;
  onPipelineMcpEffect?: (effect: PipelineMcpUiEffect) => void;
  onUpdateRule: (
    originalName: string,
    patch: { name?: string; expression?: string; alternatives?: string[] }
  ) => void;
  onAddRule: (name: string, expression: string) => void;
  onDeleteRule: (name: string) => void;
  onUpdateRuleConfig: (ruleName: string, patch: Partial<RuleOrderConfig>) => void;
  onApplyPrecedenceOrder: () => void;
  onLogicStateChange: (statement: string, labels: LogicLabelBinding[]) => void;
  onSyncLogicToGrammar: (statement: string, labels: LogicLabelBinding[]) => void;
  onNotify: (msg: string) => void;
  mergeStrategy: RuleMergeStrategy;
  onMergeStrategyChange: (strategy: RuleMergeStrategy) => void;
  onReorderRules: (sourceName: string, targetName: string, position: 'before' | 'after') => void;
  onMergeRules: (sourceName: string, targetName: string, strategy?: RuleMergeStrategy) => void;
  onSplitRule?: (ruleName: string, splitIndex?: number) => void;
  onOpenEditModal?: (page: WorkflowSlug) => void;
  primaryLanguage?: PrimaryLanguage;
  autocompleteSuggestions?: AutocompleteSuggestion[];
  lintIssues?: StudioLintIssue[];
  onRippleModuleExport?: (exp: ReferencedModuleExport, moduleName?: string) => void;
  onApplyGrammarText?: (grammar: string) => void;
  canUndo: boolean;
  onUndo: () => void;
}

function getLayoutClasses(structure?: ModalStructure): string {
  switch (structure) {
    case 'workbar':
      return 'flex flex-col gap-5';
    case 'calculator':
      return 'grid grid-cols-1 gap-4 lg:grid-cols-12';
    case 'grid':
      return 'grid grid-cols-1 gap-4 md:grid-cols-2';
    case 'split':
    default:
      return 'grid grid-cols-1 gap-5 lg:grid-cols-12';
  }
}

function getPaneSpans(structure?: ModalStructure): { primary: string; secondary: string } {
  switch (structure) {
    case 'workbar':
      return { primary: 'w-full', secondary: 'w-full' };
    case 'calculator':
      return { primary: 'lg:col-span-5', secondary: 'lg:col-span-7' };
    case 'grid':
      return { primary: 'col-span-1', secondary: 'col-span-1' };
    case 'split':
    default:
      return { primary: 'lg:col-span-7', secondary: 'lg:col-span-5' };
  }
}

const ALL_TARGETS: Array<{ id: TransformTarget; label: string }> = [
  { id: 'jsonld', label: 'JSON-LD Schema' },
  { id: 'python', label: 'Python AST' },
  { id: 'rust', label: 'Rust AST' },
  { id: 'wasm', label: 'WASM / WABT' },
];

export function StepViews(props: StepViewsProps) {
  const { activePage, layoutStructure } = props;
  const gridClass = getLayoutClasses(layoutStructure);
  const spans = getPaneSpans(layoutStructure);

  const workspaceInputRef = useRef<HTMLInputElement>(null);
  const jsonLdPkgInputRef = useRef<HTMLInputElement>(null);
  const grammarInputRef = useRef<HTMLInputElement>(null);
  const pythonInputRef = useRef<HTMLInputElement>(null);
  const rustInputRef = useRef<HTMLInputElement>(null);
  const watInputRef = useRef<HTMLInputElement>(null);
  const wasmInputRef = useRef<HTMLInputElement>(null);

  const [dialectInspectorTab, setDialectInspectorTab] = useState<'rules' | 'graph'>('graph');
  const [schemaStepTab, setSchemaStepTab] = useState<'jsonld' | 'predicate'>('jsonld');
  const [pyInspectorTab, setPyInspectorTab] = useState<'dump' | 'json'>('dump');
  const [rustInspectorTab, setRustInspectorTab] = useState<'dump' | 'json'>('dump');
  const [wasmInspectorTab, setWasmInspectorTab] = useState<'hex' | 'ast' | 'run'>('hex');

  // Shared HTML5 drag-and-drop state for grammar rule reorder & merge (Step 1 & Step 3)
  const [draggedRuleName, setDraggedRuleName] = useState<string | null>(null);
  const [ruleDropTarget, setRuleDropTarget] = useState<{
    name: string;
    intent: 'before' | 'after' | 'merge';
  } | null>(null);

  const handleRuleDragStart = (e: React.DragEvent, ruleName: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ruleName);
    setDraggedRuleName(ruleName);
  };

  const handleRuleDragOver = (e: React.DragEvent, targetRuleName: string) => {
    e.preventDefault();
    if (!draggedRuleName || draggedRuleName === targetRuleName) {
      if (ruleDropTarget) setRuleDropTarget(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5;
    const intent: 'before' | 'after' | 'merge' =
      ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'merge';
    e.dataTransfer.dropEffect = 'move';
    if (!ruleDropTarget || ruleDropTarget.name !== targetRuleName || ruleDropTarget.intent !== intent) {
      setRuleDropTarget({ name: targetRuleName, intent });
    }
  };

  const handleRuleDrop = (e: React.DragEvent, targetRuleName: string) => {
    e.preventDefault();
    const sourceName = draggedRuleName || e.dataTransfer.getData('text/plain');
    const intent = ruleDropTarget?.name === targetRuleName ? ruleDropTarget.intent : 'merge';
    setDraggedRuleName(null);
    setRuleDropTarget(null);
    if (!sourceName || sourceName === targetRuleName) return;
    if (intent === 'merge') {
      props.onMergeRules(sourceName, targetRuleName, props.mergeStrategy);
    } else {
      props.onReorderRules(sourceName, targetRuleName, intent);
    }
  };

  const handleRuleDragEnd = () => {
    setDraggedRuleName(null);
    setRuleDropTarget(null);
  };

  // Target packaging selection (Step 5)
  const [packageTargets, setPackageTargets] = useState<TransformTarget[]>([
    'jsonld',
    'python',
    'rust',
    'wasm',
  ]);
  const [emitTarget, setEmitTarget] = useState<TransformTarget>('rust');

  // Dynamic WASM Export Selection & Parameter Values
  const callableWasmExports = useMemo(
    () => props.wasmResult.exports.filter((e) => e.kind === 'func'),
    [props.wasmResult.exports]
  );

  const [selectedExportFn, setSelectedExportFn] = useState('rule_count');
  const activeExportEntry = useMemo(
    () => callableWasmExports.find((e) => e.name === selectedExportFn) || callableWasmExports[0] || null,
    [callableWasmExports, selectedExportFn]
  );

  // Sync selectedExportFn when compiled WAT exports change
  useEffect(() => {
    if (callableWasmExports.length > 0 && !callableWasmExports.some((e) => e.name === selectedExportFn)) {
      setSelectedExportFn(callableWasmExports[0].name);
    }
  }, [callableWasmExports, selectedExportFn]);

  // Dynamic per-param input state keyed by parameter name
  const [wasmParamValues, setWasmParamValues] = useState<Record<string, string>>({
    $idx: '1',
    $a: '14',
    $b: '28',
    $p0: '4',
    $p1: '8',
  });
  const [wasmRunOutput, setWasmRunOutput] = useState<string | null>(null);

  // Clear stale run output when switching selected exported function
  useEffect(() => {
    setWasmRunOutput(null);
  }, [activeExportEntry?.name]);

  const schemaEnvelopePreview = useMemo(() => {
    try {
      const parsed = JSON.parse(props.jsonText) as Record<string, unknown>;
      return JSON.stringify(
        {
          '@context': parsed['@context'],
          '@type': parsed['@type'],
          name: parsed.name,
          $schema: parsed.$schema,
          'x-mutation-policy': parsed['x-mutation-policy'],
          definedTerms: Array.isArray(parsed.hasDefinedTerm) ? parsed.hasDefinedTerm.length : 0,
        },
        null,
        2
      );
    } catch {
      return '// Fix JSON syntax in Live Mirror to preview schema envelope';
    }
  }, [props.jsonText]);

  const mutationDiffPreview = useMemo(() => {
    const lines = props.rules.map((r) => {
      const locked = props.mutationPolicy.lockedRules.includes(r.name);
      if (locked) return `${r.name} -> [LOCKED BY DECLARATION]`;
      const m = props.mutations[r.name];
      if (!m || !m.enabled) return `${r.name} -> [passthrough]`;
      const rename = m.targetProperty !== r.name ? `${r.name} -> ${m.targetProperty}` : r.name;
      const pat = m.patternOverride ? ` /${m.patternOverride}/` : '';
      return `${rename} : ${m.jsonType}${pat}`;
    });
    return lines.length > 0 ? lines.join('\n') : 'No grammar rules available to mutate.';
  }, [props.rules, props.mutations, props.mutationPolicy.lockedRules]);

  const handleRunWasm = async () => {
    if (!activeExportEntry) return;
    const args = activeExportEntry.params.map((p) => {
      const raw = wasmParamValues[p.name] ?? '0';
      const num = Number.parseInt(raw, 10);
      return Number.isNaN(num) ? 0 : num;
    });
    const res = await executeWasmExport(props.wasmResult.bytes, activeExportEntry.name, args);
    if (res.ok) {
      setWasmRunOutput(`${activeExportEntry.name}(${args.join(', ')}) => ${res.value}`);
    } else {
      setWasmRunOutput(`Error: ${res.error}`);
    }
  };

  const togglePackageTarget = (target: TransformTarget) => {
    setPackageTargets((prev) =>
      prev.includes(target) ? prev.filter((t) => t !== target) : [...prev, target]
    );
  };

  const toggleAllowedPolicyTarget = (target: TransformTarget) => {
    const current = props.mutationPolicy.allowedTargets;
    const next = current.includes(target)
      ? current.filter((t) => t !== target)
      : [...current, target];
    props.onMutationPolicyChange({ allowedTargets: next });
  };

  /* --------------------------------------------------------------------------
   * STEP 1: SYNTAX DIALECT & GRAMMAR RULES
   * ------------------------------------------------------------------------ */
  if (activePage === 'dialect') {
    return (
      <div className={gridClass}>
        <div className={`${spans.primary} space-y-4`}>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              01. Syntax Dialect &amp; Grammar Rules
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Define which grammar dialect is active (EBNF, BNF, PEG, Python PEG, Rust Macro, or WABT S-Expr) before translating to JSON-LD and AST packages.
            </p>
          </div>

          <div
            data-tour-id="workbench.dialect.symbols"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <div>
              <label htmlFor="dialectPreset" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Dialect Preset
              </label>
              <select
                id="dialectPreset"
                data-tour-id="workbench.dialect.preset"
                value={props.dialect.preset}
                onChange={(e) => props.onApplyDialectPreset(e.target.value as DialectPresetId)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {Object.entries(DIALECT_PRESETS).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-1">
                <label htmlFor="ruleOperator" className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <span>Rule Operator</span>
                  <DocTooltip docKey="ruleOperator" />
                </label>
                {props.dialect.ruleOperator.trim() === '' ? (
                  <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400">
                    space-separated
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => props.onDialectChange({ ruleOperator: '' })}
                    className="text-[10px] font-medium text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                    title="Clear operator to separate rule name and value with a single space"
                  >
                    Use space
                  </button>
                )}
              </div>
              <input
                id="ruleOperator"
                type="text"
                placeholder="(space)"
                value={props.dialect.ruleOperator}
                onChange={(e) => props.onDialectChange({ ruleOperator: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="choiceDelimiter" className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                <span>Choice Delimiter</span>
                <DocTooltip docKey="choiceDelimiter" />
              </label>
              <input
                id="choiceDelimiter"
                type="text"
                value={props.dialect.choiceDelimiter}
                onChange={(e) => props.onDialectChange({ choiceDelimiter: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="commentPrefix" className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                <span>Comment Prefix</span>
                <DocTooltip docKey="commentPrefix" />
              </label>
              <input
                id="commentPrefix"
                type="text"
                value={props.dialect.commentPrefix}
                onChange={(e) => props.onDialectChange({ commentPrefix: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            {/* Dedicated Primary '+' Repetition Operator Input (live-rewrites active grammar) */}
            {(() => {
              const resolved = resolveGrammarSymbols(props.dialect);
              const plusVal = resolved.oneOrMore;
              return (
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <label htmlFor="primaryOneOrMoreOp" className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                      <span>One-or-More Operator (+)</span>
                      <DocTooltip docKey="extendedDagSymbols" />
                    </label>
                    <span
                      className={`font-mono text-[10px] ${
                        plusVal.trim().length > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {plusVal.trim().length > 0 ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <input
                    id="primaryOneOrMoreOp"
                    type="text"
                    placeholder="Disabled (leave blank)"
                    value={plusVal}
                    onChange={(e) =>
                      props.onDialectChange({
                        symbols: {
                          ...resolved,
                          oneOrMore: e.target.value,
                        },
                      })
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              );
            })()}
          </div>

          <div data-tour-id="workbench.dialect.grammar" className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={props.onLoadEbnfSample}
              className="whitespace-nowrap rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700"
            >
              Load EBNF Sample
            </button>
            <button
              type="button"
              onClick={props.onLoadPythonGrammarSample}
              className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Python PEG Sample
            </button>
            <button
              type="button"
              onClick={props.onLoadRustGrammarSample}
              className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Rust Macro Sample
            </button>
          </div>

          {/* Extended DAG Symbol Definitions (Enabled when non-empty, Disabled when empty; live-rewrites grammar) */}
          <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <span>All Enabled Grammar &amp; Extended DAG Operators</span>
                  <DocTooltip docKey="extendedDagSymbols" />
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Configure <code className="font-mono">+</code>, <code className="font-mono">*</code>, <code className="font-mono">?</code>, <code className="font-mono">{'{}'}</code>, <code className="font-mono">()</code>, <code className="font-mono">[]</code>, lookahead/lookbehind, and more. Editing an operator live-rewrites prior occurrences in Active Grammar Rules; clearing or toggling off disables it and remembers its last known symbol for restore or live rewrite when re-enabled.
                </div>
              </div>
              <button
                type="button"
                onClick={() => props.onDialectChange({ symbols: { ...DEFAULT_GRAMMAR_SYMBOLS } })}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                Reset All Operators
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(() => {
                const resolved = resolveGrammarSymbols(props.dialect);
                return GRAMMAR_SYMBOL_SPECS.map((spec) => {
                  const val = resolved[spec.key];
                  const isEnabled = val.length > 0;
                  const savedSym = props.lastKnownDialectSymbols?.[spec.key] || spec.defaultValue;
                  return (
                    <div key={spec.key} className="space-y-1">
                      <div className="flex items-center justify-between gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        <label htmlFor={`sym-${spec.key}`} className="truncate">
                          {spec.label}
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            props.onDialectChange({
                              symbols: {
                                ...resolved,
                                [spec.key]: isEnabled ? '' : savedSym,
                              },
                            })
                          }
                          title={
                            isEnabled
                              ? `Disable ${spec.label} (saves "${val}")`
                              : `Re-enable ${spec.label} using last known symbol "${savedSym}"`
                          }
                          className={`shrink-0 rounded px-1 py-0.5 font-mono text-[10px] transition-colors ${
                            isEnabled
                              ? 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/50'
                              : 'text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/50'
                          }`}
                        >
                          <span className="hidden sm:inline">
                            {isEnabled ? 'Enabled' : `Disabled (${savedSym})`}
                          </span>
                          <span className="sm:hidden">{isEnabled ? 'on' : 'off'}</span>
                        </button>
                      </div>
                      <input
                        id={`sym-${spec.key}`}
                        type="text"
                        value={val}
                        placeholder={`Disabled (saved: ${savedSym})`}
                        onChange={(e) =>
                          props.onDialectChange({
                            symbols: {
                              ...resolved,
                              [spec.key]: e.target.value,
                            },
                          })
                        }
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        <div className={`${spans.secondary} flex flex-col`}>
          <div className="mb-2 flex items-center justify-between gap-2 text-xs">
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => setDialectInspectorTab('graph')}
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                  dialectInspectorTab === 'graph'
                    ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-500'
                }`}
              >
                Dependency Graph
              </button>
              <button
                type="button"
                onClick={() => setDialectInspectorTab('rules')}
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                  dialectInspectorTab === 'rules'
                    ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-500'
                }`}
              >
                Rules ({props.rules.length})
              </button>
            </div>
            <button
              type="button"
              onClick={props.onOpenFullGraphView}
              className="text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Expand Graph
            </button>
          </div>

          {dialectInspectorTab === 'graph' ? (
            <RuleDependencyGraph
              graph={props.ruleGraph}
              compact
              mergeStrategy={props.mergeStrategy}
              onMergeStrategyChange={props.onMergeStrategyChange}
              onReorderRules={props.onReorderRules}
              onMergeRules={props.onMergeRules}
              canUndo={props.canUndo}
              onUndo={props.onUndo}
              onAutoStubMissingRules={props.onAutoStubMissingRules}
            />
          ) : (
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>Drag row edges to reorder · center to merge</span>
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label="Rule merge strategy"
                    value={props.mergeStrategy}
                    onChange={(e) => props.onMergeStrategyChange(e.target.value as RuleMergeStrategy)}
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <option value="choice">Merge: Choice (|)</option>
                    <option value="sequence">Merge: Sequence</option>
                    <option value="inline">Merge: Inline</option>
                  </select>
                  {props.canUndo && (
                    <button
                      type="button"
                      onClick={props.onUndo}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <Undo2 className="h-3 w-3" />
                      Undo
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-72 flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
                {props.rules.length === 0 ? (
                  <div className="p-4 text-xs text-slate-500 dark:text-slate-400">
                    {props.dialect.ruleOperator.trim() ? (
                      <>
                        No valid rules parsed with operator{' '}
                        <code className="font-mono">{props.dialect.ruleOperator}</code>.
                      </>
                    ) : (
                      <>
                        No valid rules parsed with empty operator (space separating{' '}
                        <code className="font-mono">name value</code>).
                      </>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <tr>
                        <th className="w-7 px-2 py-2 font-medium" aria-label="Drag handle" />
                        <th className="px-2 py-2 font-medium">Line</th>
                        <th className="px-2 py-2 font-medium">Rule</th>
                        <th className="px-3 py-2 text-right font-medium">Branches</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                      {props.rules.map((r) => {
                        const isDragging = draggedRuleName === r.name;
                        const dropIntent = ruleDropTarget?.name === r.name ? ruleDropTarget.intent : null;
                        return (
                          <tr
                            key={r.id}
                            draggable
                            onDragStart={(e) => handleRuleDragStart(e, r.name)}
                            onDragOver={(e) => handleRuleDragOver(e, r.name)}
                            onDrop={(e) => handleRuleDrop(e, r.name)}
                            onDragEnd={handleRuleDragEnd}
                            className={`cursor-grab transition-colors active:cursor-grabbing ${
                              isDragging
                                ? 'opacity-40'
                                : dropIntent === 'merge'
                                  ? 'bg-emerald-50 outline-2 -outline-offset-2 outline-emerald-500 dark:bg-emerald-950/50'
                                  : 'hover:bg-slate-100/70 dark:hover:bg-slate-900/70'
                            } ${
                              dropIntent === 'before'
                                ? 'border-t-2 border-t-blue-600'
                                : dropIntent === 'after'
                                  ? 'border-b-2 border-b-blue-600'
                                  : ''
                            }`}
                          >
                            <td className="px-2 py-2 text-slate-400">
                              <GripVertical className="h-3.5 w-3.5" />
                            </td>
                            <td className="px-2 py-2 font-mono tabular-nums text-slate-400">{r.lineNumber}</td>
                            <td className="px-2 py-2 font-mono font-medium text-slate-800 dark:text-slate-200">
                              <div className="flex items-center justify-between gap-2">
                                <span>{r.name}</span>
                                {dropIntent === 'merge' && draggedRuleName && (
                                  <span className="font-sans text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                    Merge {draggedRuleName} → {r.name}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                              {r.alternatives.length}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------------------------
   * STEP 2: RULE PROPERTIES & ORDER OF OPERATIONS WORKBENCH
   * ------------------------------------------------------------------------ */
  if (activePage === 'rule_props') {
    return (
      <RulePropertiesWorkbench
        gridClass={gridClass}
        primarySpan={spans.primary}
        secondarySpan={spans.secondary}
        rules={props.rules}
        dialect={props.dialect}
        schemaConfig={props.schemaConfig}
        mutations={props.mutations}
        mutationPolicy={props.mutationPolicy}
        ruleConfigs={props.ruleConfigs}
        grammarText={props.grammarText}
        jsonText={props.jsonText}
        watSource={props.watSource}
        mergeStrategy={props.mergeStrategy}
        canUndo={props.canUndo}
        onUndo={props.onUndo}
        globalCallbacks={props.globalCallbacks}
        logicLabels={props.logicLabels}
        onSaveGlobalCallback={props.onSaveGlobalCallback}
        onDeleteGlobalCallback={props.onDeleteGlobalCallback}
        onUpdateRule={props.onUpdateRule}
        onAddRule={props.onAddRule}
        onDeleteRule={props.onDeleteRule}
        onUpdateRuleConfig={props.onUpdateRuleConfig}
        onApplyPrecedenceOrder={props.onApplyPrecedenceOrder}
        onReorderRules={props.onReorderRules}
        onMergeRules={props.onMergeRules}
        onToggleRuleLock={props.onToggleRuleLock}
        primaryLanguage={props.primaryLanguage}
        onExportTextFile={props.onExportTextFile}
      />
    );
  }

  /* --------------------------------------------------------------------------
   * STEP 3: SYMBOLIC LOGIC, ARITHMETIC & LAMBDA CALCULUS CALCULATOR
   * ------------------------------------------------------------------------ */
  if (activePage === 'logic_calc') {
    return (
      <LogicLambdaWorkbench
        onSubmitArtifacts={props.onSubmitArtifacts}
        gridClass={gridClass}
        primarySpan={spans.primary}
        secondarySpan={spans.secondary}
        mutationPolicy={props.mutationPolicy}
        primaryLanguage={props.primaryLanguage}
        grammarText={props.grammarText}
        rules={props.rules}
        dialect={props.dialect}
        sampleInput={props.evalPayload}
        initialStatement={props.logicStatement}
        initialLabels={props.logicLabels}
        globalCallbacks={props.globalCallbacks}
        autocompleteSuggestions={props.autocompleteSuggestions}
        lintIssues={props.lintIssues}
        onRippleModuleExport={props.onRippleModuleExport}
        onSaveGlobalCallback={props.onSaveGlobalCallback}
        onDeleteGlobalCallback={props.onDeleteGlobalCallback}
        onLogicStateChange={props.onLogicStateChange}
        onExportTextFile={props.onExportTextFile}
        onSyncLogicToGrammar={props.onSyncLogicToGrammar}
        onNotify={props.onNotify}
      />
    );
  }

  /* --------------------------------------------------------------------------
   * STEP 10: LAZY BUILD-ON-CALL MCP TOOL SERVERS (CACHED PER TARGET)
   * ------------------------------------------------------------------------ */
  if (activePage === 'mcp_servers') {
    return (
      <McpServersWorkbench
        onSubmitArtifacts={props.onSubmitArtifacts}
        gridClass={gridClass}
        primarySpan={spans.primary}
        secondarySpan={spans.secondary}
        workspaceContext={props.mcpWorkspaceContext}
        initialServerId={props.selectedMcpServerId}
        onPipelineMcpEffect={props.onPipelineMcpEffect}
        onExportTextFile={props.onExportTextFile}
        onNotify={props.onNotify}
      />
    );
  }

  /* --------------------------------------------------------------------------
   * STEP 4: SCHEMA.ORG JSON-LD & MUTATION POLICY + EBNF PREDICATE TREE STUDIO
   * ------------------------------------------------------------------------ */
  if (activePage === 'schema') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5 dark:border-slate-800">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Step 4 Mode
          </span>
          <div
            role="group"
            aria-label="Schema workbench mode"
            className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs dark:border-slate-700 dark:bg-slate-950"
          >
            <button
              type="button"
              onClick={() => setSchemaStepTab('jsonld')}
              className={`rounded-md px-2.5 py-1 font-medium ${
                schemaStepTab === 'jsonld'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Schema.org JSON-LD &amp; Policy
            </button>
            <button
              type="button"
              onClick={() => setSchemaStepTab('predicate')}
              className={`rounded-md px-2.5 py-1 font-medium ${
                schemaStepTab === 'predicate'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              JSON Schema EBNF &amp; Predicate Tree Studio
            </button>
          </div>
        </div>

        {schemaStepTab === 'predicate' ? (
          <SchemaPredicateWorkbench
            studioJsonText={props.jsonText}
            onSyncEbnfToGrammar={props.onApplyGrammarText}
            onSubmitArtifacts={props.onSubmitArtifacts}
            onDownloadFile={props.onExportTextFile}
            onNotify={props.onNotify}
          />
        ) : (
      <div className={gridClass}>
        <div className={`${spans.primary} space-y-4`}>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              04. Schema.org JSON-LD &amp; Mutation Policy
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Configure the generated JSON-LD schema envelope and declare import/export mutation permissions embedded in <code className="font-mono text-xs">x-mutation-policy</code>.
            </p>
          </div>

          <div
            data-tour-id="workbench.schema.config"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <div>
              <label htmlFor="schemaPreset" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Vocabulary Profile
              </label>
              <select
                id="schemaPreset"
                value={props.schemaConfig.preset}
                onChange={(e) => props.onApplySchemaPreset(e.target.value as SchemaPresetId)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="hybrid">Hybrid (Schema.org + SchemaStore $defs)</option>
                <option value="definedTermSet">Schema.org DefinedTermSet</option>
                <option value="softwareSource">Schema.org SoftwareSourceCode</option>
              </select>
            </div>

            <div>
              <label htmlFor="schemaOrgType" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Root Schema.org @type
              </label>
              <input
                id="schemaOrgType"
                type="text"
                value={props.schemaConfig.schemaOrgType}
                onChange={(e) => props.onSchemaConfigChange({ schemaOrgType: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="schemaName" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Schema Name / $id
              </label>
              <input
                id="schemaName"
                type="text"
                value={props.schemaConfig.schemaName}
                onChange={(e) => props.onSchemaConfigChange({ schemaName: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="schemaStoreDraft" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                $schema Draft URL
              </label>
              <input
                id="schemaStoreDraft"
                type="text"
                value={props.schemaConfig.schemaStoreDraft}
                onChange={(e) => props.onSchemaConfigChange({ schemaStoreDraft: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 pt-1">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={props.schemaConfig.includeJsonSchemaDefs}
                onChange={(e) => props.onSchemaConfigChange({ includeJsonSchemaDefs: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Emit JSON Schema <code className="font-mono">$defs</code></span>
            </label>

            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={props.schemaConfig.includePotentialActions}
                onChange={(e) => props.onSchemaConfigChange({ includePotentialActions: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Emit <code className="font-mono">ChooseAction</code> branches</span>
            </label>
          </div>

          {/* Declared Import / Export Mutation Policy */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>Declared Import / Export Mutation Policy</span>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={props.mutationPolicy.allowImportMutation}
                  onChange={(e) => props.onMutationPolicyChange({ allowImportMutation: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span>Allow Import Mutation</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={props.mutationPolicy.allowExportMutation}
                  onChange={(e) => props.onMutationPolicyChange({ allowExportMutation: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span>Allow Export Mutation</span>
              </label>
            </div>
            <div className="mt-3 border-t border-slate-200/80 pt-2.5 dark:border-slate-800">
              <div className="mb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Permitted Translation Targets
              </div>
              <div className="flex flex-wrap gap-3">
                {ALL_TARGETS.map((t) => (
                  <label key={t.id} className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={props.mutationPolicy.allowedTargets.includes(t.id)}
                      onChange={() => toggleAllowedPolicyTarget(t.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                    />
                    <span>{t.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={`${spans.secondary} flex flex-col`}>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Schema &amp; Policy Envelope</span>
            <span className={props.jsonValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
              {props.jsonValid ? 'Valid JSON-LD' : 'Invalid JSON'}
            </span>
          </div>
          <pre
            data-tour-id="workbench.schema.output"
            className="max-h-80 flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-200 dark:border-slate-800"
          >
            {schemaEnvelopePreview}
          </pre>
        </div>
      </div>
        )}
      </div>
    );
  }

  /* --------------------------------------------------------------------------
   * STEP 3: LINE-BY-LINE MUTATION CALCULATOR (WITH DECLARATION LOCKS)
   * ------------------------------------------------------------------------ */
  if (activePage === 'mutations') {
    return (
      <div className={gridClass}>
        <div className={`${spans.primary} space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                05. Line-by-Line Schema Mutation Calculator
              </h3>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Mutate schema keys, types, and regex patterns per rule, or lock individual declarations against mutation.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Drag merge strategy"
                value={props.mergeStrategy}
                onChange={(e) => props.onMergeStrategyChange(e.target.value as RuleMergeStrategy)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="choice">Drop Merge: Choice (|)</option>
                <option value="sequence">Drop Merge: Sequence</option>
                <option value="inline">Drop Merge: Inline</option>
              </select>
              {props.canUndo && (
                <button
                  type="button"
                  onClick={props.onUndo}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Undo
                </button>
              )}
              <button
                type="button"
                onClick={props.onAutoInferMutations}
                className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
              >
                Auto-Infer
              </button>
              <button
                type="button"
                onClick={props.onResetMutations}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>
          </div>

          <div data-tour-id="workbench.mutations.rules" className="max-h-80 space-y-2.5 overflow-auto pr-1">
            {props.rules.length === 0 ? (
              <div
                data-tour-id="workbench.mutations.policy"
                className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400"
              >
                Add grammar rules first to configure line-by-line mutations.
              </div>
            ) : (
              props.rules.map((rule) => {
                const isLocked = props.mutationPolicy.lockedRules.includes(rule.name);
                const isDragging = draggedRuleName === rule.name;
                const dropIntent = ruleDropTarget?.name === rule.name ? ruleDropTarget.intent : null;
                const mut = props.mutations[rule.name] || {
                  ruleName: rule.name,
                  targetProperty: rule.name,
                  jsonType: 'string' as const,
                  patternOverride: '',
                  description: '',
                  enabled: true,
                };
                return (
                  <div
                    key={rule.id}
                    data-tour-id={props.rules[0]?.id === rule.id ? 'workbench.mutations.policy' : undefined}
                    draggable
                    onDragStart={(e) => handleRuleDragStart(e, rule.name)}
                    onDragOver={(e) => handleRuleDragOver(e, rule.name)}
                    onDrop={(e) => handleRuleDrop(e, rule.name)}
                    onDragEnd={handleRuleDragEnd}
                    className={`relative rounded-lg border p-3 transition-all ${
                      isDragging
                        ? 'opacity-40'
                        : dropIntent === 'merge'
                          ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-500/40 dark:border-emerald-500 dark:bg-emerald-950/40'
                          : isLocked
                            ? 'border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20'
                            : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/60'
                    } ${
                      dropIntent === 'before'
                        ? 'border-t-2 border-t-blue-600'
                        : dropIntent === 'after'
                          ? 'border-b-2 border-b-blue-600'
                          : ''
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          title="Drag edges to reorder or center to merge"
                          className="cursor-grab text-slate-400 hover:text-slate-600 active:cursor-grabbing dark:hover:text-slate-300"
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                          <input
                            type="checkbox"
                            disabled={isLocked}
                            checked={mut.enabled && !isLocked}
                            onChange={(e) => props.onMutationChange(rule.name, { enabled: e.target.checked })}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 disabled:opacity-50"
                          />
                          <span className="font-mono">{rule.name}</span>
                        </label>
                        {dropIntent === 'merge' && draggedRuleName && (
                          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            Drop to merge {draggedRuleName} → {rule.name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => props.onToggleRuleLock(rule.name)}
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            isLocked
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300'
                              : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                          }`}
                        >
                          {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                          {isLocked ? 'Locked' : 'Lock'}
                        </button>
                        <span className="font-mono text-xs tabular-nums text-slate-400">L{rule.lineNumber}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <input
                        type="text"
                        disabled={isLocked}
                        aria-label={`Target property for ${rule.name}`}
                        value={mut.targetProperty}
                        onChange={(e) => props.onMutationChange(rule.name, { targetProperty: e.target.value })}
                        placeholder="Target key"
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <select
                        disabled={isLocked}
                        aria-label={`JSON type for ${rule.name}`}
                        value={mut.jsonType}
                        onChange={(e) =>
                          props.onMutationChange(rule.name, {
                            jsonType: e.target.value as LineMutation['jsonType'],
                          })
                        }
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="object">object</option>
                        <option value="array">array</option>
                      </select>
                      <input
                        type="text"
                        disabled={isLocked}
                        aria-label={`Regex pattern for ${rule.name}`}
                        value={mut.patternOverride}
                        onChange={(e) => props.onMutationChange(rule.name, { patternOverride: e.target.value })}
                        placeholder="Regex pattern"
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className={`${spans.secondary} flex flex-col`}>
          <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            Before → After Schema Map
          </div>
          <pre
            data-tour-id="workbench.mutations.targets"
            className="max-h-80 flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-200 dark:border-slate-800"
          >
            {mutationDiffPreview}
          </pre>
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------------------------
   * STEP 4: RECURSIVE GRAMMAR EVALUATOR & BACKTRACKING TRACE
   * ------------------------------------------------------------------------ */
  if (activePage === 'evaluator') {
    return (
      <div className={gridClass}>
        <div className={`${spans.primary} space-y-4`}>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              06. Recursive Grammar Evaluator &amp; Trace
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Validates payloads with backtracking longest-match resolution across repetitions, inline choices, lookahead, lookbehind, character classes, and Workbench 5 schema mutations.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 font-mono text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
              <span><strong className="text-slate-800 dark:text-slate-200">Repeat:</strong> + * ? {'{m,n}'} {'{e}'} [e]</span>
              <span><strong className="text-slate-800 dark:text-slate-200">Choice:</strong> (a | b)</span>
              <span><strong className="text-slate-800 dark:text-slate-200">Lookahead:</strong> (?=e) (?!e) &amp;e !e</span>
              <span><strong className="text-slate-800 dark:text-slate-200">Lookbehind:</strong> (?&lt;=e) (?&lt;!e)</span>
              <span><strong className="text-slate-800 dark:text-slate-200">Class/Regex:</strong> [0-9] [^a-z] . /re/ ^ $</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="evalRuleSelect" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Start Rule Select
              </label>
              <select
                id="evalRuleSelect"
                data-tour-id="workbench.evaluator.rule"
                value={props.evalRule}
                onChange={(e) => props.onEvalRuleChange(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {props.rules.length === 0 ? (
                  <option value="">No rules available</option>
                ) : (
                  props.rules.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label htmlFor="evalRuleInput" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Start Rule Name
              </label>
              <input
                id="evalRuleInput"
                type="text"
                value={props.evalRule}
                onChange={(e) => props.onEvalRuleChange(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="evalPayloadInput" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Evaluation Payload
            </label>
            <textarea
              id="evalPayloadInput"
              data-tour-id="workbench.evaluator.payload"
              rows={3}
              value={props.evalPayload}
              onChange={(e) => props.onEvalPayloadChange(e.target.value)}
              placeholder="Enter test string..."
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div
            data-tour-id="workbench.evaluator.result"
            className={`flex items-start gap-3 rounded-lg border p-3.5 ${
              props.evalResult.matched
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
                : 'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
            }`}
          >
            {props.evalResult.matched ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            <div className="min-w-0 text-sm">
              <div className="font-semibold">{props.evalResult.summary}</div>
              <div className="mt-0.5 text-xs opacity-90">{props.evalResult.detail}</div>
            </div>
          </div>
        </div>

        <div className={`${spans.secondary} flex flex-col`}>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Recursive Expansion Trace</span>
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {props.evalResult.trace.length} steps
            </span>
          </div>
          <div className="max-h-80 flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs text-slate-200 dark:border-slate-800">
            {props.evalResult.trace.length === 0 ? (
              <div className="text-slate-400">Enter a payload to inspect recursive descent steps.</div>
            ) : (
              props.evalResult.trace.map((step, idx) => (
                <div key={`${step.rule}-${idx}`} className="py-0.5 leading-relaxed">
                  <span className="text-slate-500">{'  '.repeat(step.depth)}</span>
                  <span className={step.matched ? 'text-emerald-400' : 'text-amber-400'}>
                    {step.matched ? 'MATCH' : 'MISS '}
                  </span>{' '}
                  <span className="text-blue-300">{step.rule}</span>{' '}
                  {step.consumed && <span className="text-slate-300">"{step.consumed}"</span>}{' '}
                  <span className="text-slate-500">— {step.note}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------------------------
   * STEP 5: JSON-LD SCHEMA PACKAGER & TARGET SELECTION I/O
   * ------------------------------------------------------------------------ */
  if (activePage === 'payload_io') {
    return (
      <div className={gridClass}>
        <input
          ref={workspaceInputRef}
          type="file"
          accept=".json,.g2j.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onImportWorkspaceFile(f);
            e.target.value = '';
          }}
        />
        <input
          ref={jsonLdPkgInputRef}
          type="file"
          accept=".json,.jsonld"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onImportJsonLdPackageFile(f);
            e.target.value = '';
          }}
        />
        <input
          ref={grammarInputRef}
          type="file"
          accept=".ebnf,.bnf,.peg,.txt,.grammar"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onImportGrammarFile(f);
            e.target.value = '';
          }}
        />
        <input
          ref={pythonInputRef}
          type="file"
          accept=".py,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onImportPythonFile(f);
            e.target.value = '';
          }}
        />
        <input
          ref={rustInputRef}
          type="file"
          accept=".rs,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onImportRustFile(f);
            e.target.value = '';
          }}
        />
        <input
          ref={watInputRef}
          type="file"
          accept=".wat,.wast,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onImportWatFile(f);
            e.target.value = '';
          }}
        />
        <input
          ref={wasmInputRef}
          type="file"
          accept=".wasm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onImportWasmFile(f);
            e.target.value = '';
          }}
        />

        <div className={`${spans.primary} space-y-4`}>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              11. JSON-LD Schema Package &amp; Target I/O
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Package the active Grammar + JSON-LD Schema + selected AST targets for later parsing, or unpack a JSON-LD schema directly into WASM/WABT, Rust, or Python by selection.
            </p>
          </div>

          {/* Package Builder: Grammar/AST -> JSON-LD + Generated Schema */}
          <div
            data-tour-id="workbench.payload_io.actions"
            className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/60"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span>Bundle JSON-LD + Generated Schema Package</span>
              </div>
              <span className="font-mono text-[11px] text-slate-500">
                Export: {props.mutationPolicy.allowExportMutation ? 'Allowed' : 'Locked'} · Import:{' '}
                {props.mutationPolicy.allowImportMutation ? 'Allowed' : 'Locked'}
              </span>
            </div>

            <div className="mb-3 flex flex-wrap gap-3">
              {ALL_TARGETS.map((t) => {
                const permitted = props.mutationPolicy.allowedTargets.includes(t.id);
                return (
                  <label
                    key={t.id}
                    className={`inline-flex items-center gap-1.5 text-xs ${
                      permitted
                        ? 'cursor-pointer text-slate-700 dark:text-slate-300'
                        : 'cursor-not-allowed text-slate-400 line-through'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={!permitted}
                      checked={permitted && packageTargets.includes(t.id)}
                      onChange={() => togglePackageTarget(t.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                    />
                    <span>{t.label}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => props.onExportJsonLdPackage(packageTargets)}
                data-tour-id="workbench.payload_io.export"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Download className="h-3.5 w-3.5" />
                Export JSON-LD Package (.jsonld)
              </button>
              <button
                type="button"
                onClick={() => jsonLdPkgInputRef.current?.click()}
                data-tour-id="workbench.payload_io.import"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Upload className="h-3.5 w-3.5" />
                Import JSON-LD Package
              </button>
            </div>
          </div>

          {/* JSON-LD Schema -> Target Language By Selection */}
          <div className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <ArrowRightLeft className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>Translate JSON-LD Schema → Selected Target</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Select translation target"
                value={emitTarget}
                onChange={(e) => setEmitTarget(e.target.value as TransformTarget)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="wasm">WASM / WABT (.wat + .wasm)</option>
                <option value="rust">Rust AST (syn / serde .rs)</option>
                <option value="python">Python AST (ast.Module .py)</option>
                <option value="jsonld">Normalize Schema.org JSON-LD</option>
              </select>
              <button
                type="button"
                onClick={() => props.onTransformFromJsonLdToTarget(emitTarget)}
                className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                Translate &amp; Open Target
              </button>
            </div>
          </div>

          {/* Individual File Artifact Import/Export */}
          <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 text-xs dark:divide-slate-800 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5">
              <span className="font-medium text-slate-800 dark:text-slate-200">Workspace (.g2j.json)</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => workspaceInputRef.current?.click()}
                  className="rounded border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Import
                </button>
                <button
                  type="button"
                  onClick={props.onExportWorkspace}
                  className="rounded border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Export
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5">
              <span className="font-medium text-slate-800 dark:text-slate-200">Grammar (.ebnf) / Python (.py) / Rust (.rs)</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => grammarInputRef.current?.click()}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  + .ebnf
                </button>
                <button
                  type="button"
                  onClick={() => pythonInputRef.current?.click()}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  + .py
                </button>
                <button
                  type="button"
                  onClick={() => rustInputRef.current?.click()}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  + .rs
                </button>
                <button
                  type="button"
                  onClick={() => props.onExportTextFile(props.rustSource, 'grammar_schema.rs', 'text/plain')}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-blue-600 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-400"
                >
                  Export .rs
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5">
              <span className="font-medium text-slate-800 dark:text-slate-200">WABT (.wat) &amp; Binary (.wasm)</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => watInputRef.current?.click()}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  + .wat
                </button>
                <button
                  type="button"
                  onClick={() => wasmInputRef.current?.click()}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  + .wasm
                </button>
                <button
                  type="button"
                  onClick={props.onExportWasmBinary}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-blue-600 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-400"
                >
                  Export .wasm
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={`${spans.secondary} space-y-2.5`}>
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Quick Workflow Presets &amp; Archive</div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={props.onLoadEbnfSample}
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-left text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Load Sample EBNF Order Action Grammar
            </button>
            <button
              type="button"
              onClick={props.onRunPythonSample}
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-left text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Run Python PEG &amp; AST Bidirectional Sample
            </button>
            <button
              type="button"
              onClick={props.onRunRustSample}
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-left text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Run Rust syn / serde AST Bidirectional Sample
            </button>
            <button
              type="button"
              onClick={props.onRunWasmSample}
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-left text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Run WASM / WABT Binary Sample
            </button>
            <button
              type="button"
              onClick={props.onLoadEmptyPayload}
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Clear Workspace to Empty Payload
            </button>
            <button
              type="button"
              onClick={props.onDownloadProjectZip}
              className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              <Download className="h-4 w-4" />
              Package Full PHP / OpenAPI / DSL Project (.zip)
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------------------------
   * STEP 6: GOOGLE DRIVE CLOUD SYNC + DEMO VAULT
   * ------------------------------------------------------------------------ */
  if (activePage === 'gdrive') {
    const isDrive = props.driveMode === 'drive';
    return (
      <div className={gridClass}>
        <div className={`${spans.primary} space-y-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                12. Google Drive Cloud Sync &amp; Vault
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Save, load, overwrite, and delete studio snapshots in Google Drive or test offline in the Demo Vault.
              </p>
            </div>

            <div
              data-tour-id="workbench.gdrive.mode"
              className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950"
            >
              <button
                type="button"
                onClick={() => props.onDriveModeChange('drive')}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isDrive
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Cloud className="h-3.5 w-3.5" />
                Google Drive
              </button>
              <button
                type="button"
                onClick={() => props.onDriveModeChange('demo')}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  !isDrive
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <HardDrive className="h-3.5 w-3.5" />
                Demo Vault
              </button>
            </div>
          </div>

          {isDrive && !props.driveUser ? (
            <div
              data-tour-id="workbench.gdrive.snapshots"
              className="rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Connect your Google account
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Sign in with Google to list, create, update, and remove Grammar2JSON Studio files created by this app in your Google Drive. Access tokens are held only in memory.
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={props.onGoogleSignIn}
                  data-tour-id="workbench.gdrive.save"
                  disabled={props.driveAuthLoading}
                  className="gsi-material-button"
                >
                  <svg viewBox="0 0 48 48" className="h-4 w-4 shrink-0" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>{props.driveAuthLoading ? 'Connecting...' : 'Sign in with Google'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {isDrive && props.driveUser && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-950">
                  <div className="min-w-0">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {props.driveUser.displayName || props.driveUser.email}
                    </span>
                    <span className="mx-2 text-slate-400" aria-hidden="true">·</span>
                    <span className="text-emerald-600 dark:text-emerald-400">Connected to Google Drive</span>
                  </div>
                  <button
                    type="button"
                    onClick={props.onGoogleSignOut}
                    className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </div>
              )}

              <div data-tour-id="workbench.gdrive.save" className="flex flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1">
                  <label htmlFor="vaultFileName" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Snapshot File Name
                  </label>
                  <input
                    id="vaultFileName"
                    type="text"
                    value={props.vaultNameInput}
                    onChange={(e) => props.onVaultNameChange(e.target.value)}
                    placeholder="order_schema.g2j.json"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={props.onSaveNewSnapshot}
                  disabled={props.driveBusy}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save Snapshot
                </button>
                <button
                  type="button"
                  onClick={props.onRefreshVault}
                  disabled={props.driveBusy}
                  aria-label="Refresh saved snapshots"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${props.driveBusy ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          )}

          {props.driveError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {props.driveError}
            </div>
          )}
        </div>

        <div className={`${spans.secondary} flex flex-col`}>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {isDrive ? 'Google Drive Snapshots' : 'Offline Demo Vault'}
            </span>
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {props.vaultFiles.length} file{props.vaultFiles.length === 1 ? '' : 's'}
            </span>
          </div>

          <div
            data-tour-id="workbench.gdrive.snapshots"
            className="max-h-72 flex-1 divide-y divide-slate-200 overflow-auto rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800"
          >
            {props.vaultFiles.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 dark:text-slate-400">
                {isDrive && !props.driveUser
                  ? 'Sign in with Google above to browse your saved Drive workspaces.'
                  : 'No snapshots saved yet. Save your current workspace to create one.'}
              </div>
            ) : (
              props.vaultFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between gap-2 p-3 hover:bg-slate-50 dark:hover:bg-slate-950/60">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs font-medium text-slate-900 dark:text-slate-100">
                      {file.name}
                    </div>
                    <div className="mt-0.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                      {new Date(file.updatedAt).toLocaleString()} · {(file.sizeBytes / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => props.onLoadSnapshot(file)}
                      disabled={props.driveBusy}
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onRequestOverwriteSnapshot(file)}
                      disabled={props.driveBusy}
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-950/40"
                    >
                      Overwrite
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onRequestDeleteSnapshot(file)}
                      disabled={props.driveBusy}
                      aria-label={`Delete ${file.name}`}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------------------------
   * STEP 7: PYTHON `ast` BIDIRECTIONAL WORKFLOW
   * ------------------------------------------------------------------------ */
  if (activePage === 'python_ast') {
    return (
      <div className={gridClass}>
        <div className={`${spans.primary} space-y-3`}>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              07. Python ast Bidirectional Workflow
            </h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Parse Python source into <code className="font-mono text-xs">ast.Module</code>, run <code className="font-mono text-xs">ast.unparse()</code>, or push declarations back into Grammar &amp; JSON-LD.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={props.onGeneratePythonFromGrammar}
              data-tour-id="workbench.python_ast.source"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Code2 className="h-3.5 w-3.5" />
              JSON-LD / Grammar → Python
            </button>
            <button
              type="button"
              onClick={props.onUnparsePythonAst}
              className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              ast.unparse()
            </button>
            <button
              type="button"
              onClick={props.onSyncPythonToGrammar}
              data-tour-id="workbench.python_ast.sync"
              className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Python AST → Grammar &amp; JSON-LD
            </button>
          </div>

          <div>
            <label htmlFor="pySourceEditor" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Python Source (.py)
            </label>
            <textarea
              id="pySourceEditor"
              rows={11}
              value={props.pythonSource}
              onChange={(e) => props.onPythonSourceChange(e.target.value)}
              spellCheck={false}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-100 focus:border-blue-500 focus:outline-none dark:border-slate-800"
            />
          </div>
        </div>

        <div className={`${spans.secondary} flex flex-col`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Python AST Inspector</span>
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => setPyInspectorTab('dump')}
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                  pyInspectorTab === 'dump'
                    ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-500'
                }`}
              >
                ast.dump
              </button>
              <button
                type="button"
                onClick={() => setPyInspectorTab('json')}
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                  pyInspectorTab === 'json'
                    ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-500'
                }`}
              >
                AST JSON
              </button>
            </div>
          </div>

          <pre
            data-tour-id="workbench.python_ast.tree"
            className="max-h-[340px] flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-200 dark:border-slate-800"
          >
            {pyInspectorTab === 'dump' ? props.pythonAstDump : JSON.stringify(props.pythonAst, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------------------------
   * STEP 8: RUST AST (`syn` / `serde`) BIDIRECTIONAL WORKFLOW
   * ------------------------------------------------------------------------ */
  if (activePage === 'rust_ast') {
    return (
      <div className={gridClass}>
        <div className={`${spans.primary} space-y-3`}>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              08. Rust AST (syn / serde) Bidirectional Workflow
            </h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Generate strongly typed Rust <code className="font-mono text-xs">serde</code> declarations from JSON-LD schemas or parse Rust <code className="font-mono text-xs">GRAMMAR_RULES</code> back into Grammar &amp; JSON-LD.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={props.onGenerateRustFromWorkspace}
              data-tour-id="workbench.rust_ast.source"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Code2 className="h-3.5 w-3.5" />
              JSON-LD / Grammar → Rust
            </button>
            <button
              type="button"
              onClick={props.onSyncRustToGrammar}
              data-tour-id="workbench.rust_ast.sync"
              className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Rust AST → Grammar &amp; JSON-LD
            </button>
            <button
              type="button"
              onClick={() => props.onExportTextFile(props.rustSource, 'grammar_schema.rs', 'text/plain')}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              Export .rs
            </button>
          </div>

          <div>
            <label htmlFor="rustSourceEditor" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Rust Module Source (.rs)
            </label>
            <textarea
              id="rustSourceEditor"
              rows={11}
              value={props.rustSource}
              onChange={(e) => props.onRustSourceChange(e.target.value)}
              spellCheck={false}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-100 focus:border-blue-500 focus:outline-none dark:border-slate-800"
            />
          </div>
        </div>

        <div className={`${spans.secondary} flex flex-col`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Rust syn::File AST Inspector</span>
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => setRustInspectorTab('dump')}
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                  rustInspectorTab === 'dump'
                    ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-500'
                }`}
              >
                syn Dump
              </button>
              <button
                type="button"
                onClick={() => setRustInspectorTab('json')}
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                  rustInspectorTab === 'json'
                    ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-500'
                }`}
              >
                AST JSON
              </button>
            </div>
          </div>

          <pre
            data-tour-id="workbench.rust_ast.tree"
            className="max-h-[340px] flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-200 dark:border-slate-800"
          >
            {rustInspectorTab === 'dump' ? props.rustAstDump : JSON.stringify(props.rustAst, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------------------------
   * STEP 9: WASM & WABT BIDIRECTIONAL WORKFLOW (DYNAMIC EXPORT PARAMS)
   * ------------------------------------------------------------------------ */
  return (
    <div className={gridClass}>
      <div className={`${spans.primary} space-y-3`}>
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            09. WASM &amp; WABT Bidirectional Workflow
          </h3>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Compile WAT S-expressions into validated WebAssembly binary bytes (<code className="font-mono text-xs">wat2wasm</code>), decompile back (<code className="font-mono text-xs">wasm2wat</code>), and execute exports with signature-matched parameters.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={props.onGenerateWatFromWorkspace}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Cpu className="h-3.5 w-3.5" />
            JSON-LD / Workspace → WAT
          </button>
          <button
            type="button"
            onClick={props.onDecompileWasmToWat}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FileCode2 className="h-3.5 w-3.5" />
            wasm2wat Roundtrip
          </button>
          <button
            type="button"
            onClick={props.onExportWasmBinary}
            data-tour-id="workbench.wasm_wabt.export"
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            Download .wasm
          </button>
        </div>

        <div>
          <div data-tour-id="workbench.wasm_wabt.compile" className="flex items-center justify-between text-xs">
            <label htmlFor="watSourceEditor" className="font-medium text-slate-600 dark:text-slate-400">
              WABT Text Format (.wat)
            </label>
            <span
              className={`font-mono tabular-nums ${
                props.wasmResult.valid
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {props.wasmResult.valid
                ? `Valid WASM · ${props.wasmResult.sizeBytes} bytes`
                : props.wasmResult.error || 'Invalid WASM'}
            </span>
          </div>
          <textarea
            id="watSourceEditor"
            data-tour-id="workbench.wasm_wabt.wat"
            rows={11}
            value={props.watSource}
            onChange={(e) => props.onWatSourceChange(e.target.value)}
            spellCheck={false}
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-100 focus:border-blue-500 focus:outline-none dark:border-slate-800"
          />
        </div>
      </div>

      <div className={`${spans.secondary} flex flex-col`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">WABT Binary &amp; Runtime</span>
          <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setWasmInspectorTab('hex')}
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                wasmInspectorTab === 'hex'
                  ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500'
              }`}
            >
              Hex
            </button>
            <button
              type="button"
              onClick={() => setWasmInspectorTab('ast')}
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                wasmInspectorTab === 'ast'
                  ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500'
              }`}
            >
              WASM AST
            </button>
            <button
              type="button"
              onClick={() => setWasmInspectorTab('run')}
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                wasmInspectorTab === 'run'
                  ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500'
              }`}
            >
              Execute
            </button>
          </div>
        </div>

        {wasmInspectorTab === 'run' ? (
          <div className="flex-1 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
            <div>
              <label htmlFor="wasmExportSelect" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Exported Function
              </label>
              <select
                id="wasmExportSelect"
                value={activeExportEntry?.name || ''}
                onChange={(e) => setSelectedExportFn(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {callableWasmExports.map((exp) => (
                  <option key={exp.name} value={exp.name}>
                    {exp.name}({exp.params.map((p) => `${p.name}: ${p.type}`).join(', ')}) → {exp.result || 'void'}
                  </option>
                ))}
              </select>
            </div>

            {/* Dynamic parameter inputs driven strictly by selected WABT function signature */}
            {activeExportEntry && activeExportEntry.params.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                <span className="font-mono text-slate-700 dark:text-slate-200">{activeExportEntry.name}()</span> accepts no input parameters.
              </div>
            ) : (
              <div
                className={`grid gap-2 ${
                  (activeExportEntry?.params.length ?? 0) === 1 ? 'grid-cols-1' : 'grid-cols-2'
                }`}
              >
                {(activeExportEntry?.params || []).map((param) => (
                  <div key={`${activeExportEntry?.name}-${param.name}`}>
                    <label
                      htmlFor={`wasm-param-${param.name}`}
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Param <span className="font-mono">{param.name}</span> ({param.type})
                    </label>
                    <input
                      id={`wasm-param-${param.name}`}
                      type="number"
                      value={wasmParamValues[param.name] ?? '0'}
                      onChange={(e) =>
                        setWasmParamValues((prev) => ({ ...prev, [param.name]: e.target.value }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={handleRunWasm}
              disabled={!props.wasmResult.valid || !activeExportEntry}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              Instantiate &amp; Execute {activeExportEntry ? `${activeExportEntry.name}()` : 'WASM'}
            </button>
            {wasmRunOutput && (
              <div className="rounded-md border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-emerald-400 dark:border-slate-800">
                {wasmRunOutput}
              </div>
            )}
          </div>
        ) : (
          <pre className="max-h-[340px] flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-200 dark:border-slate-800">
            {wasmInspectorTab === 'hex'
              ? props.wasmResult.hexDump || 'No WASM bytes compiled.'
              : JSON.stringify(props.wasmResult.astJson, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
