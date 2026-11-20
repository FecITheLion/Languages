import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type SetStateAction } from 'react';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Code2,
  Download,
  Eraser,
  FileCode2,
  FileDiff,
  GitBranch,
  History,
  Layers,
  Link2,
  Moon,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Server,
  Share2,
  Sun,
  Terminal,
  Undo2,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  DEFAULT_DSL_SOURCE,
  DIALECT_PRESETS,
  OPENAPI_SPEC,
  parseDslFlows,
  reorderDslFlows,
  searchStudio,
} from './data/openapiAndDsl';
import {
  addGrammarRule,
  analyzeRuleDependencies,
  buildJsonLdSchemaPackage,
  compileWatToWasm,
  decompileWasmToWat,
  DEFAULT_MUTATION_POLICY,
  deleteGrammarRule,
  evaluateGrammarPayload,
  exportWorkspaceInLanguage,
  extractLiteralAlternationFromRegex,
  extractRulesFromPythonAst,
  extractRulesFromRustAst,
  formatGrammarRuleLine,
  formatPythonAstDump,
  formatRustAstDump,
  generatePythonFromWorkspace,
  generateRustFromWorkspace,
  generateWatFromWorkspace,
  grammarToSchemaJson,
  inferLineMutations,
  inferRuleOrderConfigs,
  mergeGrammarRules,
  parseGrammar,
  parsePythonToAst,
  parseRustToAst,
  reorderGrammarRules,
  rewriteGrammarDialectTokens,
  schemaJsonToGrammar,
  sortRulesByPrecedence,
  splitGrammarRule,
  unparsePythonAst,
  updateGrammarRule,
} from './engine/bidirectionalEngine';
import {
  loadGlobalCallbacks,
  removeGlobalCallback,
  saveGlobalCallbacks,
  upsertGlobalCallback,
  type GlobalCallbackDef,
} from './engine/globalCallbacksEngine';
import {
  HISTOLOG_FIELD_KEYS,
  HISTOLOG_FIELD_LABELS,
  buildHistologIndex,
  createHistologEntry,
  importHistologCustom,
  type HistologEntry,
  type HistologFieldKey,
  type HistologSnapshotState,
} from './engine/histologEngine';
import { buildDeepLinkUrl, parseDeepLinkFromLocation } from './engine/deepLinkEngine';
import { analyzeStudioLint } from './engine/htmlOutputFormatter';
import { LOGIC_CALCULATOR_PRESETS, type LogicLabelBinding } from './engine/logicLambdaEngine';
import type { McpWorkspaceContext } from './engine/mcpServerEngine';
import {
  BUILTIN_REFERENCED_MODULES,
  buildLiveScopeSuggestions,
  loadCustomModules,
  loadLoadedModuleIds,
  saveCustomModules,
  saveLoadedModuleIds,
  type ReferencedModule,
  type ReferencedModuleExport,
} from './engine/moduleAutocompleteEngine';
import { buildPipelineBreadcrumbs } from './engine/pipelineBreadcrumbs';
import { downloadPhpProjectZip } from './engine/phpZipPackager';
import {
  createDriveWorkspace,
  deleteDriveWorkspace,
  getCachedDriveToken,
  initDriveAuth,
  listDriveWorkspaces,
  loadDriveWorkspace,
  signInWithGoogleDrive,
  signOutGoogleDrive,
  updateDriveWorkspace,
} from './services/googleDriveAuth';
import { ApiStudioWorkbench } from './components/ApiStudioWorkbench';
import { AutocompleteField } from './components/AutocompleteField';
import { ConfirmDialog } from './components/ConfirmDialog';
import { DocTooltip } from './components/DocTooltip';
import { ElevatorPitch } from './components/ElevatorPitch';
import { GuidedHelp } from './components/GuidedHelp';
import { HistologWorkbench } from './components/HistologWorkbench';
import { HtmlCodeOutput } from './components/HtmlCodeOutput';
import { SpecsBundleView } from './components/InspectorViews';
import type { PipelineMcpUiEffect } from './components/McpServersWorkbench';
import { PipelineBreadcrumbs } from './components/PipelineBreadcrumbs';
import { PipelineGrid } from './components/PipelineGrid';
import { RuleDependencyGraph } from './components/RuleDependencyGraph';
import { StepViews } from './components/StepViews';
import { UniversalWorkbenchModal } from './components/UniversalWorkbenchModal';
import { VirtualFilesWorkbench } from './components/VirtualFilesWorkbench';
import { mergeVirtualFiles, parseVirtualFiles, readVirtualFiles, restoreAutoSavedVirtualEdits, restoreVirtualEdits, serializeVaultListing, submitVirtualFiles, VirtualFilesError, virtualEditAllowed, virtualEdits, type VirtualFiles, type VirtualSubmission } from './engine/virtualFiles';
import {
  getWorkbenchPitch,
  STANDALONE_PITCHES,
  STUDIO_HOME_PITCH,
} from './data/workflowPitch';
import {
  SUPPORTED_LANGUAGES,
  type DialectConfig,
  type DialectPresetId,
  type EngineSectionKey,
  type ExportLanguage,
  type JsonLdSchemaPackage,
  type LineMutation,
  type McpServerId,
  type ModalStructure,
  type MutationPolicy,
  type OpenApiSpec,
  type PipelineGridMode,
  type PipelineStage,
  type PrimaryLanguage,
  type RuleMergeStrategy,
  type RuleOrderConfig,
  type SchemaConfig,
  type SchemaPresetId,
  type TopView,
  type TransformTarget,
  type VaultRecord,
  type ViewportPreset,
  type WorkflowSlug,
  type WorkspaceSnapshot,
} from './types/studio';

const DEMO_VAULT_STORAGE_KEY = 'grammar2json_demo_vault_v2';
const AUTOSAVE_STORAGE_KEY = 'grammar2json_autosave_v1';

interface VirtualState {
  files: VirtualFiles;
  submissionIssues: Record<string, string[]>;
  rejectedSubmissions: Record<string, VirtualSubmission[]>;
}
type VirtualAction =
  | { type: 'update'; value: SetStateAction<VirtualFiles> }
  | { type: 'submit'; owner: string; submissions: VirtualSubmission[] }
  | { type: 'retry'; owner: string };
function virtualReducer(state: VirtualState, action: VirtualAction): VirtualState {
  if (action.type === 'update') {
    const files = typeof action.value === 'function' ? action.value(state.files) : action.value;
    return files === state.files ? state : { ...state, files };
  }
  if (action.type === 'retry') {
    const submissions = Object.hasOwn(state.rejectedSubmissions, action.owner) ? state.rejectedSubmissions[action.owner] : undefined;
    return submissions ? virtualReducer(state, { type: 'submit', owner: action.owner, submissions }) : state;
  }
  try {
    const files = submitVirtualFiles(state.files, action.owner, action.submissions);
    if (!Object.hasOwn(state.submissionIssues, action.owner)) return files === state.files ? state : { ...state, files };
    const submissionIssues = { ...state.submissionIssues };
    delete submissionIssues[action.owner];
    const rejectedSubmissions = { ...state.rejectedSubmissions };
    delete rejectedSubmissions[action.owner];
    return { files, submissionIssues, rejectedSubmissions };
  } catch (error) {
    if (!(error instanceof VirtualFilesError)) throw error;
    if (JSON.stringify(state.submissionIssues[action.owner]) === JSON.stringify(error.issues) &&
      JSON.stringify(state.rejectedSubmissions[action.owner]) === JSON.stringify(action.submissions)) return state;
    return { ...state, submissionIssues: { ...state.submissionIssues, [action.owner]: error.issues },
      rejectedSubmissions: { ...state.rejectedSubmissions, [action.owner]: action.submissions } };
  }
}

interface AutoSavedState {
  savedAt: string;
  grammarText: string;
  dialect: DialectConfig;
  schemaConfig: SchemaConfig;
  mutationPolicy: MutationPolicy;
  mutations: Record<string, LineMutation>;
  ruleConfigs: Record<string, RuleOrderConfig>;
  logicStatement: string;
  logicLabels: LogicLabelBinding[];
  dslSource: string;
  evalRule: string;
  evalPayload: string;
  primaryLanguage: PrimaryLanguage;
  verifiedSteps: WorkflowSlug[];
  virtualFiles?: VirtualFiles;
}

function loadAutoSavedState(): AutoSavedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AutoSavedState;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.grammarText !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveAutoSavedState(state: AutoSavedState): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function loadDemoVaultFromStorage(): VaultRecord[] {
  try {
    const raw = localStorage.getItem(DEMO_VAULT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as VaultRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDemoVaultToStorage(records: VaultRecord[]): boolean {
  try {
    localStorage.setItem(DEMO_VAULT_STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

const INITIAL_SCHEMA_CONFIG: SchemaConfig = {
  preset: 'hybrid',
  schemaOrgType: 'DefinedTermSet',
  schemaName: 'OrderActionGrammar',
  schemaStoreDraft: 'https://json-schema.org/draft/2020-12/schema',
  includeJsonSchemaDefs: true,
  includePotentialActions: true,
};

export default function App() {
  // Theme state (synced to documentElement.classList)
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Auto-save & Deep-Link Hydration
  const initialDeepLink = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const parsed = parseDeepLinkFromLocation(window.location.search, window.location.hash);
    return parsed.hasDirectLink ? parsed.state : null;
  }, []);
  const initialAutoSave = useMemo(() => {
    if (initialDeepLink?.grammarText) return null;
    return loadAutoSavedState();
  }, [initialDeepLink]);
  const savedVirtualFiles = useMemo(() => parseVirtualFiles(initialAutoSave?.virtualFiles), [initialAutoSave]);
  const [virtualState, dispatchVirtual] = useReducer(virtualReducer, savedVirtualFiles.files, files => ({
    files: restoreAutoSavedVirtualEdits(files),
    submissionIssues: {},
    rejectedSubmissions: {},
  }));
  const virtualFiles = virtualState.files;
  const setVirtualFiles = useCallback((value: SetStateAction<VirtualFiles>) => dispatchVirtual({ type: 'update', value }), []);
  const [recoveryPending, setRecoveryPending] = useState(savedVirtualFiles.issues.length > 0);
  const [showVirtualFiles, setShowVirtualFiles] = useState(false);
  const [submissionRevision, setSubmissionRevision] = useState(0);
  const submitArtifacts = useCallback((owner: string, submissions: VirtualSubmission[]) => {
    void submissionRevision;
    dispatchVirtual({ type: 'submit', owner, submissions });
  }, [submissionRevision]);
  const submitModalArtifacts = useCallback((owner: string, submissions: VirtualSubmission[]) => {
    submitArtifacts(`modal-${owner}`, submissions.map(file => ({ ...file, path: `modal/${file.path}` })));
  }, [submitArtifacts]);
  const virtualEditsJson = JSON.stringify(virtualEdits(virtualFiles));
  const historyVirtualEdits = useMemo(() => readVirtualFiles(JSON.parse(virtualEditsJson)), [virtualEditsJson]);

  // Top-level navigation & workflow step state
  const [topView, setTopView] = useState<TopView>(initialDeepLink?.topView ?? 'workbench');
  const [specsSubTab, setSpecsSubTab] = useState<'openapi' | 'dsl' | 'bundle'>(() =>
    initialDeepLink?.topView === 'dsl'
      ? 'dsl'
      : initialDeepLink?.topView === 'bundle'
        ? 'bundle'
        : 'openapi'
  );
  const [dslSource, setDslSource] = useState(
    initialDeepLink?.dslSource ?? initialAutoSave?.dslSource ?? DEFAULT_DSL_SOURCE
  );
  const parsedDsl = useMemo(() => parseDslFlows(dslSource), [dslSource]);

  const [activePage, setActivePage] = useState<WorkflowSlug>(initialDeepLink?.activePage ?? 'dialect');
  const [primaryLanguage, setPrimaryLanguage] = useState<PrimaryLanguage>(
    initialDeepLink?.primaryLanguage ?? initialAutoSave?.primaryLanguage ?? 'json'
  );
  const [verifiedSteps, setVerifiedSteps] = useState<WorkflowSlug[]>(
    initialAutoSave?.verifiedSteps ?? []
  );

  // Mobile Workbench/Mirror pane toggle & Mirror output display modes
  const [mobileWorkbenchPane, setMobileWorkbenchPane] = useState<'workbench' | 'mirror'>('workbench');
  const [grammarMirrorMode, setGrammarMirrorMode] = useState<'edit' | 'html'>('edit');
  const [jsonMirrorMode, setJsonMirrorMode] = useState<'edit' | 'html'>('html');
  const [compiledMirrorMode, setCompiledMirrorMode] = useState<'html' | 'edit'>('html');
  const [clearMenuOpen, setClearMenuOpen] = useState(false);

  // Auto-Save state
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(!recoveryPending);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(initialAutoSave?.savedAt ?? null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(Boolean(initialDeepLink?.modalOpen));
  useEffect(() => {
    if (!modalOpen) {
      submitArtifacts('modal-logic', []);
      submitArtifacts('modal-mcp', []);
    }
  }, [modalOpen, submitArtifacts]);
  const [modalStructure, setModalStructure] = useState<ModalStructure>(
    initialDeepLink?.modalStructure ?? 'split'
  );
  const [modalViewport, setModalViewport] = useState<ViewportPreset>(
    initialDeepLink?.viewportPreset ?? 'responsive'
  );

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  // Toast feedback
  const [notice, setNotice] = useState<string | null>(null);
  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
  }, []);

  // Drag-and-drop reorder / merge strategy
  const [mergeStrategy, setMergeStrategy] = useState<RuleMergeStrategy>('choice');

  // Local Global Callbacks (persisted in localStorage)
  const [globalCallbacks, setGlobalCallbacks] = useState<GlobalCallbackDef[]>(() => loadGlobalCallbacks());

  // Referenced Modules for Autocomplete & Live Ripple
  const [loadedModuleIds, setLoadedModuleIds] = useState<string[]>(() => loadLoadedModuleIds());
  const [customModules, setCustomModules] = useState<ReferencedModule[]>(() => loadCustomModules());
  const allAvailableModules = useMemo(
    () => [...BUILTIN_REFERENCED_MODULES, ...customModules],
    [customModules]
  );
  const loadedModules = useMemo(
    () => allAvailableModules.filter((m) => loadedModuleIds.includes(m.id)),
    [allAvailableModules, loadedModuleIds]
  );

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4600);
    return () => window.clearTimeout(t);
  }, [notice]);

  // Core bidirectional workspace state
  const initialPreset = DIALECT_PRESETS.ebnf;
  const [dialect, setDialect] = useState<DialectConfig>(
    initialDeepLink?.dialect ?? initialAutoSave?.dialect ?? initialPreset.config
  );
  const [schemaConfig, setSchemaConfig] = useState<SchemaConfig>(
    initialDeepLink?.schemaConfig ?? initialAutoSave?.schemaConfig ?? INITIAL_SCHEMA_CONFIG
  );
  const [mutationPolicy, setMutationPolicy] = useState<MutationPolicy>(
    initialAutoSave?.mutationPolicy ?? DEFAULT_MUTATION_POLICY
  );
  const canRestoreVirtualEdits = useCallback((saved: VirtualFiles) =>
    mutationPolicy.lockedRules.length === 0 &&
    [...Object.values(saved), ...Object.values(virtualEdits(virtualFiles))]
      .every(file => virtualEditAllowed(file, mutationPolicy)),
  [mutationPolicy, virtualFiles]);
  const canExportVirtualState = mutationPolicy.allowExportMutation &&
    (Object.keys(historyVirtualEdits).length === 0 || canRestoreVirtualEdits(historyVirtualEdits));

  const [grammarText, setGrammarText] = useState<string>(
    initialDeepLink?.grammarText ?? initialAutoSave?.grammarText ?? initialPreset.sampleGrammar
  );
  const rules = useMemo(() => parseGrammar(grammarText, dialect), [grammarText, dialect]);
  const ruleGraph = useMemo(
    () => analyzeRuleDependencies(rules, grammarText, dialect, mutationPolicy.lockedRules),
    [rules, grammarText, dialect, mutationPolicy.lockedRules]
  );

  const [stageFilter, setStageFilter] = useState<'all' | PipelineStage>(
    initialDeepLink?.stageFilter ?? 'all'
  );
  const [pipelineLayoutMode, setPipelineLayoutMode] = useState<PipelineGridMode>(
    initialDeepLink?.pipelineLayoutMode ?? 'compact'
  );
  const [selectedMcpServerId, setSelectedMcpServerId] = useState<McpServerId>(
    initialDeepLink?.selectedMcpServerId ?? 'pipeline'
  );
  const [mutations, setMutations] = useState<Record<string, LineMutation>>(
    () =>
      initialAutoSave?.mutations ??
      inferLineMutations(parseGrammar(initialPreset.sampleGrammar, initialPreset.config))
  );
  const [ruleConfigs, setRuleConfigs] = useState<Record<string, RuleOrderConfig>>(
    () =>
      initialAutoSave?.ruleConfigs ??
      inferRuleOrderConfigs(parseGrammar(initialPreset.sampleGrammar, initialPreset.config))
  );
  const [logicStatement, setLogicStatement] = useState<string>(
    initialDeepLink?.logicStatement ??
      initialAutoSave?.logicStatement ??
      LOGIC_CALCULATOR_PRESETS[0].statement
  );
  const [logicLabels, setLogicLabels] = useState<LogicLabelBinding[]>(
    () =>
      initialDeepLink?.logicLabels ??
      initialAutoSave?.logicLabels ??
      LOGIC_CALCULATOR_PRESETS[0].labels.map((l) => ({ ...l }))
  );

  const [jsonText, setJsonText] = useState<string>(() => {
    const startGrammar =
      initialDeepLink?.grammarText ?? initialAutoSave?.grammarText ?? initialPreset.sampleGrammar;
    const startDialect =
      initialDeepLink?.dialect ?? initialAutoSave?.dialect ?? initialPreset.config;
    const startSchema =
      initialDeepLink?.schemaConfig ?? initialAutoSave?.schemaConfig ?? INITIAL_SCHEMA_CONFIG;
    const startPolicy = initialAutoSave?.mutationPolicy ?? DEFAULT_MUTATION_POLICY;
    const initialRules = parseGrammar(startGrammar, startDialect);
    const initialMuts = initialAutoSave?.mutations ?? inferLineMutations(initialRules);
    const initialCfg = initialAutoSave?.ruleConfigs ?? inferRuleOrderConfigs(initialRules);
    return grammarToSchemaJson(
      initialRules,
      startDialect,
      startSchema,
      initialMuts,
      startPolicy,
      initialCfg
    );
  });
  const [jsonValid, setJsonValid] = useState(true);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [syncDirection, setSyncDirection] = useState('Grammar → JSON-LD → Python / Rust / WASM / MCP');

  const [evalRule, setEvalRule] = useState(
    initialDeepLink?.evalRule ?? initialAutoSave?.evalRule ?? initialPreset.sampleRule
  );
  const [evalPayload, setEvalPayload] = useState(
    initialDeepLink?.evalPayload ?? initialAutoSave?.evalPayload ?? initialPreset.samplePayload
  );
  const evalResult = useMemo(
    () => evaluateGrammarPayload(rules, evalRule, evalPayload, mutations, dialect),
    [rules, evalRule, evalPayload, mutations, dialect]
  );

  // Python AST state
  const [pythonSource, setPythonSource] = useState<string>(() => {
    const startGrammar =
      initialDeepLink?.grammarText ?? initialAutoSave?.grammarText ?? initialPreset.sampleGrammar;
    const startDialect =
      initialDeepLink?.dialect ?? initialAutoSave?.dialect ?? initialPreset.config;
    const startSchema =
      initialDeepLink?.schemaConfig ?? initialAutoSave?.schemaConfig ?? INITIAL_SCHEMA_CONFIG;
    return generatePythonFromWorkspace(parseGrammar(startGrammar, startDialect), startSchema);
  });
  const { ast: pythonAst, symbols: pythonSymbols } = useMemo(
    () => parsePythonToAst(pythonSource),
    [pythonSource]
  );
  const pythonAstDump = useMemo(() => formatPythonAstDump(pythonAst), [pythonAst]);

  // Rust AST state
  const [rustSource, setRustSource] = useState<string>(() => {
    const startGrammar =
      initialDeepLink?.grammarText ?? initialAutoSave?.grammarText ?? initialPreset.sampleGrammar;
    const startDialect =
      initialDeepLink?.dialect ?? initialAutoSave?.dialect ?? initialPreset.config;
    const startSchema =
      initialDeepLink?.schemaConfig ?? initialAutoSave?.schemaConfig ?? INITIAL_SCHEMA_CONFIG;
    const startPolicy = initialAutoSave?.mutationPolicy ?? DEFAULT_MUTATION_POLICY;
    const initialRules = parseGrammar(startGrammar, startDialect);
    const initialMuts = initialAutoSave?.mutations ?? inferLineMutations(initialRules);
    return generateRustFromWorkspace(initialRules, startSchema, initialMuts, startPolicy);
  });
  const { ast: rustAst, symbols: rustSymbols } = useMemo(
    () => parseRustToAst(rustSource),
    [rustSource]
  );
  const rustAstDump = useMemo(() => formatRustAstDump(rustAst), [rustAst]);

  // WASM / WABT state
  const [watSource, setWatSource] = useState<string>(() => {
    const startGrammar =
      initialDeepLink?.grammarText ?? initialAutoSave?.grammarText ?? initialPreset.sampleGrammar;
    const startDialect =
      initialDeepLink?.dialect ?? initialAutoSave?.dialect ?? initialPreset.config;
    const startSchema =
      initialDeepLink?.schemaConfig ?? initialAutoSave?.schemaConfig ?? INITIAL_SCHEMA_CONFIG;
    const startPolicy = initialAutoSave?.mutationPolicy ?? DEFAULT_MUTATION_POLICY;
    const initialRules = parseGrammar(startGrammar, startDialect);
    const initialMuts = initialAutoSave?.mutations ?? inferLineMutations(initialRules);
    const initJson = grammarToSchemaJson(
      initialRules,
      startDialect,
      startSchema,
      initialMuts,
      startPolicy
    );
    return generateWatFromWorkspace(initialRules, startSchema.schemaName, initJson);
  });
  const wasmResult = useMemo(() => compileWatToWasm(watSource), [watSource]);

  // Live Studio Lint Analysis (unused rules, unused callbacks/labels, unused lambda params, undefined refs, disabled symbols)
  const studioLintIssues = useMemo(
    () =>
      analyzeStudioLint({
        rules,
        graph: ruleGraph,
        evalRule,
        logicStatement,
        logicLabels,
        globalCallbacks,
        ruleConfigs,
        jsonValid,
        jsonError,
      }),
    [rules, ruleGraph, evalRule, logicStatement, logicLabels, globalCallbacks, ruleConfigs, jsonValid, jsonError]
  );

  // Live Scope Autocomplete Suggestions (Grammar rules + Lambdas + Labels + DAG ops + Loaded Referenced Modules)
  const autocompleteSuggestions = useMemo(
    () =>
      buildLiveScopeSuggestions(
        {
          rules,
          dialect,
          logicLabels,
          globalCallbacks,
          loadedModules,
        },
        'grammar'
      ),
    [rules, dialect, logicLabels, globalCallbacks, loadedModules]
  );

  // Multi-Language Live Compiled Output (all 22 languages!)
  const compiledLanguageExport = useMemo(() => {
    const langKey: ExportLanguage =
      primaryLanguage === 'json'
        ? 'jsonld'
        : primaryLanguage === 'wasm'
          ? 'wat'
          : (primaryLanguage as ExportLanguage);
    return exportWorkspaceInLanguage(langKey, {
      rules,
      dialect,
      schemaConfig,
      mutations,
      mutationPolicy,
      ruleConfigs,
      grammarText,
      jsonText,
      watSource,
    });
  }, [primaryLanguage, rules, dialect, schemaConfig, mutations, mutationPolicy, ruleConfigs, grammarText, jsonText, watSource]);

  // Generational Histolog + Chained Undo/Redo + Historic Diff Reference
  const makeCurrentHistologSnapshot = useCallback(
    (): HistologSnapshotState => ({
      dialect,
      grammarText,
      jsonText,
      mutations,
      ruleConfigs,
      evalRule,
      evalPayload,
      pythonSource,
      rustSource,
      watSource,
      logicStatement,
      logicLabels,
      dslSource,
      virtualFiles: historyVirtualEdits,
    }),
    [
      dialect,
      grammarText,
      jsonText,
      mutations,
      ruleConfigs,
      evalRule,
      evalPayload,
      pythonSource,
      rustSource,
      watSource,
      logicStatement,
      logicLabels,
      dslSource,
      historyVirtualEdits,
    ]
  );

  const [histologEntries, setHistologEntries] = useState<HistologEntry[]>(() => [
    createHistologEntry({
      generation: 0,
      parentGeneration: null,
      source: 'init',
      summary: 'Initial studio workspace generation',
      snapshot: {
        dialect,
        grammarText,
        jsonText,
        mutations,
        ruleConfigs,
        evalRule,
        evalPayload,
        pythonSource,
        rustSource,
        watSource,
        logicStatement,
        logicLabels,
        dslSource,
        virtualFiles: historyVirtualEdits,
      },
      previousSnapshot: null,
    }),
  ]);
  const [histologCursor, setHistologCursor] = useState<number>(0);
  const [lastDiffRef, setLastDiffRef] = useState<{ from: number; to: number } | null>(() =>
    typeof initialDeepLink?.histologFromGen === 'number' &&
    typeof initialDeepLink?.histologToGen === 'number'
      ? { from: initialDeepLink.histologFromGen, to: initialDeepLink.histologToGen }
      : null
  );
  const suppressHistologRef = useRef(false);
  const histologIndex = useMemo(() => buildHistologIndex(histologEntries), [histologEntries]);
  const canExportHistory = canExportVirtualState && !histologEntries.some(entry =>
    entry.snapshot.virtualFiles && Object.keys(entry.snapshot.virtualFiles).length > 0 &&
    !canRestoreVirtualEdits(entry.snapshot.virtualFiles));

  // Auto-record new Histolog generations on meaningful workspace changes (debounced 450ms)
  useEffect(() => {
    if (suppressHistologRef.current) {
      suppressHistologRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      const snap = makeCurrentHistologSnapshot();
      setHistologEntries((prev) => {
        const current = prev[histologCursor] ?? prev[prev.length - 1];
        const nextEntry = createHistologEntry({
          generation: (prev[prev.length - 1]?.generation ?? -1) + 1,
          parentGeneration: current?.generation ?? null,
          source: 'mutation',
          summary: syncDirection,
          snapshot: snap,
          previousSnapshot: current?.snapshot ?? null,
        });
        if (current && nextEntry.fingerprint === current.fingerprint) {
          return prev;
        }
        const truncated = prev.slice(0, histologCursor + 1);
        const combined = [...truncated, nextEntry].slice(-60);
        setHistologCursor(combined.length - 1);
        return combined;
      });
    }, 450);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    grammarText,
    jsonText,
    dialect,
    schemaConfig,
    mutationPolicy,
    mutations,
    ruleConfigs,
    pythonSource,
    rustSource,
    watSource,
    logicStatement,
    logicLabels,
    dslSource,
    evalRule,
    evalPayload,
    historyVirtualEdits,
  ]);

  // Debounced Auto-Save to localStorage
  useEffect(() => {
    if (!autoSaveEnabled) return;
    const timer = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      const saved = saveAutoSavedState({
        savedAt,
        grammarText,
        dialect,
        schemaConfig,
        mutationPolicy,
        mutations,
        ruleConfigs,
        logicStatement,
        logicLabels,
        dslSource,
        evalRule,
        evalPayload,
        primaryLanguage,
        verifiedSteps,
        virtualFiles: historyVirtualEdits,
      });
      if (saved) setLastAutoSavedAt(savedAt);
      else showNotice('Browser autosave failed. Save a workspace snapshot to preserve your virtual edits.');
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    autoSaveEnabled,
    grammarText,
    dialect,
    schemaConfig,
    mutationPolicy,
    mutations,
    ruleConfigs,
    logicStatement,
    logicLabels,
    dslSource,
    evalRule,
    evalPayload,
    primaryLanguage,
    verifiedSteps,
    historyVirtualEdits,
    showNotice,
  ]);

  // Sync compact route parameters to browser URL (replaceState, no hash clobbering unless state requested)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const nextUrl = buildDeepLinkUrl(
        window.location.href,
        {
          v: 1,
          topView,
          activePage,
          modalOpen,
          modalStructure,
          viewportPreset: modalViewport,
          stageFilter,
          pipelineLayoutMode,
          primaryLanguage,
          selectedMcpServerId,
          histologFromGen: lastDiffRef?.from,
          histologToGen: lastDiffRef?.to,
        },
        { includeFullState: false }
      );
      if (nextUrl !== window.location.href) {
        window.history.replaceState(null, '', nextUrl);
      }
    } catch {
      // Ignore restricted history APIs in sandboxed iframes
    }
  }, [
    topView,
    activePage,
    modalOpen,
    modalStructure,
    modalViewport,
    stageFilter,
    pipelineLayoutMode,
    primaryLanguage,
    selectedMcpServerId,
    lastDiffRef,
  ]);

  // Google Drive + Offline Demo Vault state
  const [driveMode, setDriveMode] = useState<'drive' | 'demo'>('drive');
  const [driveUser, setDriveUser] = useState<User | null>(null);
  const [driveAuthLoading, setDriveAuthLoading] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<VaultRecord[]>([]);
  const [driveListingAvailable, setDriveListingAvailable] = useState(false);
  const [demoFiles, setDemoFiles] = useState<VaultRecord[]>(() => loadDemoVaultFromStorage());
  const [vaultNameInput, setVaultNameInput] = useState('order_action_schema.g2j.json');
  useEffect(() => {
    submitArtifacts('vault', driveMode === 'drive' && !driveListingAvailable ? [] : [{
      path: 'vault/listing.json',
      content: serializeVaultListing(driveMode, driveMode === 'drive' ? driveFiles : demoFiles),
    }]);
  }, [submitArtifacts, driveMode, driveListingAvailable, driveFiles, demoFiles]);

  // Confirmation dialog state for mutating/destructive operations
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    destructive: boolean;
    onConfirm: () => Promise<void> | void;
  }>({
    open: false,
    title: '',
    description: '',
    confirmLabel: 'Confirm',
    destructive: false,
    onConfirm: () => {},
  });

  // Sync Firebase Auth state listener
  useEffect(() => {
    const unsub = initDriveAuth(
      (user, token) => {
        setDriveUser(user);
        setDriveError(null);
        void listDriveWorkspaces(token)
          .then(setDriveFiles)
          .catch((err) => setDriveError(err instanceof Error ? err.message : 'Unable to list Drive files'));
      },
      () => {
        setDriveUser(null);
      }
    );
    return () => unsub();
  }, []);

  // Recompile downstream artifacts from Grammar changes
  const recompileFromGrammar = useCallback(
    (
      nextGrammar: string,
      nextDialect: DialectConfig,
      nextSchema: SchemaConfig,
      nextMutations?: Record<string, LineMutation>,
      nextPolicy?: MutationPolicy,
      nextRuleConfigs?: Record<string, RuleOrderConfig>
    ) => {
      const policy = nextPolicy ?? mutationPolicy;
      const nextRules = parseGrammar(nextGrammar, nextDialect);
      const mergedMuts = inferLineMutations(nextRules, nextMutations ?? mutations, rules);
      const mergedCfgs = inferRuleOrderConfigs(nextRules, nextRuleConfigs ?? ruleConfigs);
      setMutations(mergedMuts);
      setRuleConfigs(mergedCfgs);
      const nextJson = grammarToSchemaJson(
        nextRules,
        nextDialect,
        nextSchema,
        mergedMuts,
        policy,
        mergedCfgs
      );
      setJsonText(nextJson);
      setJsonValid(true);
      setJsonError(null);
      setPythonSource(generatePythonFromWorkspace(nextRules, nextSchema));
      setRustSource(generateRustFromWorkspace(nextRules, nextSchema, mergedMuts, policy));
      setWatSource(generateWatFromWorkspace(nextRules, nextSchema.schemaName, nextJson));
      if (nextRules.length > 0 && !nextRules.some((r) => r.name === evalRule)) {
        setEvalRule(nextRules[0].name);
      }
      setSyncDirection('Grammar → JSON-LD → Mutations / Evaluator / Python / Rust / WASM / MCP');
    },
    [rules, mutations, mutationPolicy, ruleConfigs, evalRule]
  );

  // Sync active Studio workspace + pipeline/breadcrumb state into lazy HTTP MCP server registry (debounced)
  const mcpWorkspaceContext: McpWorkspaceContext = useMemo(
    () => ({
      dialect,
      schemaConfig,
      mutationPolicy,
      grammarText,
      jsonText,
      mutations,
      ruleConfigs,
      evalRule,
      evalPayload,
      pythonSource,
      rustSource,
      watSource,
      logicStatement,
      logicLabels,
      dslSource,
      topView,
      activePage,
      stageFilter,
      verifiedSteps,
      pipelineLayoutMode,
    }),
    [
      dialect,
      schemaConfig,
      mutationPolicy,
      grammarText,
      jsonText,
      mutations,
      ruleConfigs,
      evalRule,
      evalPayload,
      pythonSource,
      rustSource,
      watSource,
      logicStatement,
      logicLabels,
      dslSource,
      topView,
      activePage,
      stageFilter,
      verifiedSteps,
      pipelineLayoutMode,
    ]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch('/api/mcp/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mcpWorkspaceContext),
      }).catch(() => {
        // Ignore if running in static build without Express backend
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [mcpWorkspaceContext]);

  const handleLogicStateChange = useCallback((stmt: string, lbls: LogicLabelBinding[]) => {
    setLogicStatement(stmt);
    setLogicLabels(lbls);
  }, []);

  const handleSaveGlobalCallback = useCallback(
    (input: {
      name: string;
      lambdaExpr: string;
      description?: string;
      source?: 'logic_calc' | 'rule_props' | 'manual';
    }) => {
      setGlobalCallbacks((prev) => {
        const next = upsertGlobalCallback(prev, input).list;
        saveGlobalCallbacks(next);
        return next;
      });
      showNotice(`Saved local global callback "${input.name}" to browser storage.`);
    },
    [showNotice]
  );

  const handleDeleteGlobalCallback = useCallback(
    (idOrName: string) => {
      setGlobalCallbacks((prev) => {
        const next = removeGlobalCallback(prev, idOrName);
        saveGlobalCallbacks(next);
        return next;
      });
      showNotice(`Removed global callback "${idOrName}".`);
    },
    [showNotice]
  );

  const handleToggleModule = useCallback(
    (moduleId: string) => {
      setLoadedModuleIds((prev) => {
        const next = prev.includes(moduleId)
          ? prev.filter((id) => id !== moduleId)
          : [...prev, moduleId];
        saveLoadedModuleIds(next);
        return next;
      });
    },
    []
  );

  const handleAddCustomModule = useCallback(
    (mod: ReferencedModule) => {
      setCustomModules((prev) => {
        const next = [...prev.filter((m) => m.id !== mod.id), mod];
        saveCustomModules(next);
        return next;
      });
      setLoadedModuleIds((prev) => {
        if (prev.includes(mod.id)) return prev;
        const next = [...prev, mod.id];
        saveLoadedModuleIds(next);
        return next;
      });
      showNotice(`Loaded custom referenced module "${mod.name}" (${mod.exports.length} export${mod.exports.length === 1 ? '' : 's'}).`);
    },
    [showNotice]
  );

  // Live Ripple when a Referenced Module export is selected in ANY modifiable input or output
  const handleRippleModuleExport = useCallback(
    (exp: ReferencedModuleExport, moduleName?: string) => {
      const rippledParts: string[] = [];

      if (exp.rippleGrammarLine) {
        const ruleNameMatch = exp.rippleGrammarLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)/);
        const alreadyExists = ruleNameMatch && rules.some((r) => r.name === ruleNameMatch[1]);
        if (!alreadyExists) {
          const rewritten = rewriteGrammarDialectTokens(
            exp.rippleGrammarLine,
            DIALECT_PRESETS.ebnf.config,
            dialect
          );
          const nextGrammar = `${grammarText.trimEnd()}\n${rewritten}\n`;
          setGrammarText(nextGrammar);
          recompileFromGrammar(nextGrammar, dialect, schemaConfig);
          rippledParts.push('grammar rule');
        }
      }

      if (exp.rippleCallback) {
        setGlobalCallbacks((prev) => {
          const next = upsertGlobalCallback(prev, {
            name: exp.rippleCallback!.name,
            lambdaExpr: exp.rippleCallback!.lambdaExpr,
            description: exp.rippleCallback!.description,
            source: 'manual',
          }).list;
          saveGlobalCallbacks(next);
          return next;
        });
        rippledParts.push(`λ ${exp.rippleCallback.name}`);
      }

      if (exp.rippleLabel) {
        setLogicLabels((prev) => {
          if (prev.some((l) => l.name.trim() === exp.rippleLabel!.name.trim())) return prev;
          return [
            ...prev,
            {
              id: `lbl_mod_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
              name: exp.rippleLabel!.name,
              kind: exp.rippleLabel!.kind,
              value: exp.rippleLabel!.value,
            },
          ];
        });
        rippledParts.push(`label ${exp.rippleLabel.name}`);
      }

      if (rippledParts.length > 0) {
        setSyncDirection(`Module Ripple (${moduleName || 'module'}) → Grammar / λ Callbacks / JSON-LD / AST`);
        showNotice(`Rippled ${exp.name} (${rippledParts.join(', ')}) across active scope.`);
      }
    },
    [rules, dialect, grammarText, schemaConfig, recompileFromGrammar, showNotice]
  );

  const handleUpdateRule = (
    originalName: string,
    patch: { name?: string; expression?: string; alternatives?: string[] }
  ) => {
    if (mutationPolicy.lockedRules.includes(originalName)) {
      showNotice(`Rule "${originalName}" is locked by declaration.`);
      return;
    }
    const res = updateGrammarRule(grammarText, rules, originalName, patch, dialect);
    if (!res.ok) {
      showNotice(res.error);
      return;
    }
    const nextCfgs = { ...ruleConfigs };
    if (res.nextName !== originalName && nextCfgs[originalName]) {
      nextCfgs[res.nextName] = nextCfgs[originalName];
      delete nextCfgs[originalName];
    }
    setGrammarText(res.grammar);
    if (evalRule === originalName) setEvalRule(res.nextName);
    recompileFromGrammar(res.grammar, dialect, schemaConfig, undefined, undefined, nextCfgs);
    showNotice(`Updated rule <${res.nextName}>.`);
  };

  const handleAddRule = (name: string, expression: string) => {
    const res = addGrammarRule(grammarText, rules, name, expression, dialect);
    if (!res.ok) {
      showNotice(res.error);
      return;
    }
    setGrammarText(res.grammar);
    recompileFromGrammar(res.grammar, dialect, schemaConfig);
    showNotice(`Added rule <${res.name}>.`);
  };

  const handleDeleteRule = (name: string) => {
    if (mutationPolicy.lockedRules.includes(name)) {
      showNotice(`Rule "${name}" is locked by declaration.`);
      return;
    }
    const res = deleteGrammarRule(grammarText, rules, name, dialect);
    if (!res.ok) {
      showNotice(res.error);
      return;
    }
    setGrammarText(res.grammar);
    recompileFromGrammar(res.grammar, dialect, schemaConfig);
    showNotice(`Deleted rule <${name}>.`);
  };

  const handleUpdateRuleConfig = (ruleName: string, patch: Partial<RuleOrderConfig>) => {
    const current = ruleConfigs[ruleName] || {
      precedence: Math.max(1, rules.findIndex((r) => r.name === ruleName) + 1),
      associativity: 'left' as const,
      properties: [],
    };
    const nextCfgs = { ...ruleConfigs, [ruleName]: { ...current, ...patch } };
    setRuleConfigs(nextCfgs);
    const nextJson = grammarToSchemaJson(
      rules,
      dialect,
      schemaConfig,
      mutations,
      mutationPolicy,
      nextCfgs
    );
    setJsonText(nextJson);
    setJsonValid(true);
    setPythonSource(generatePythonFromWorkspace(rules, schemaConfig));
    setRustSource(generateRustFromWorkspace(rules, schemaConfig, mutations, mutationPolicy));
    setWatSource(generateWatFromWorkspace(rules, schemaConfig.schemaName, nextJson));
    setSyncDirection('Rule Properties → JSON-LD / Python / Rust / WASM / MCP');
  };

  const handleApplyPrecedenceOrder = () => {
    const sorted = sortRulesByPrecedence(grammarText, rules, ruleConfigs, dialect);
    if (sorted === grammarText) {
      showNotice('Rules are already ordered by precedence.');
      return;
    }
    setGrammarText(sorted);
    recompileFromGrammar(sorted, dialect, schemaConfig, undefined, undefined, ruleConfigs);
    showNotice('Reordered grammar rules by numeric precedence.');
  };

  const handleSyncLogicToGrammar = (statement: string, labels: LogicLabelBinding[]) => {
    const op = dialect.ruleOperator ?? '';
    const c = dialect.commentPrefix || '//';
    const lines = [
      `${c} Synced from Logic & Lambda Calculus Calculator`,
      formatGrammarRuleLine('logic_expr', `'${statement.replace(/'/g, '"')}'`, op),
      ...labels.map((l) =>
        formatGrammarRuleLine(
          l.name.replace(/[^A-Za-z0-9_]/g, '_') || 'lbl',
          `'${l.value.replace(/'/g, '"')}'`,
          op
        )
      ),
    ];
    const nextGrammar = lines.join('\n');
    setGrammarText(nextGrammar);
    recompileFromGrammar(nextGrammar, dialect, schemaConfig, {});
    setSyncDirection('Logic & λ Calculator → Grammar / JSON-LD / AST / MCP');
    showNotice('Synced logic statement & λ bindings into active Studio grammar.');
  };

  // Handlers for live bidirectional editing
  const handleGrammarEdited = (nextGrammar: string) => {
    setGrammarText(nextGrammar);
    recompileFromGrammar(nextGrammar, dialect, schemaConfig);
  };

  const handleAutoStubMissingRules = (missingNames: string[]) => {
    if (missingNames.length === 0) return;
    const stubs = missingNames
      .map((name) => formatGrammarRuleLine(name, `'${name}'`, dialect.ruleOperator))
      .join('\n');
    const nextGrammar = `${grammarText.trimEnd()}\n${stubs}\n`;
    setGrammarText(nextGrammar);
    recompileFromGrammar(nextGrammar, dialect, schemaConfig);
    showNotice(`Added ${missingNames.length} stub rule definition(s) for missing references.`);
  };

  const handleReorderRules = (sourceName: string, targetName: string, position: 'before' | 'after') => {
    const res = reorderGrammarRules(grammarText, rules, sourceName, targetName, position, dialect);
    if (!res.ok) {
      showNotice(res.error);
      return;
    }
    setGrammarText(res.grammar);
    recompileFromGrammar(res.grammar, dialect, schemaConfig);
    setSyncDirection('Rule Reorder → JSON-LD / Python / Rust / WASM');
    showNotice(`Moved <${sourceName}> ${position} <${targetName}>.`);
  };

  const handleMergeRules = (sourceName: string, targetName: string, strategy?: RuleMergeStrategy) => {
    if (mutationPolicy.lockedRules.includes(sourceName)) {
      showNotice(`Rule "${sourceName}" is locked by declaration. Unlock it before merging.`);
      return;
    }
    if (mutationPolicy.lockedRules.includes(targetName)) {
      showNotice(`Rule "${targetName}" is locked by declaration. Unlock it before merging.`);
      return;
    }
    const activeStrategy = strategy ?? mergeStrategy;
    const res = mergeGrammarRules(grammarText, rules, sourceName, targetName, activeStrategy, dialect);
    if (!res.ok) {
      showNotice(res.error);
      return;
    }
    setGrammarText(res.grammar);
    if (evalRule === sourceName) {
      setEvalRule(targetName);
    }
    recompileFromGrammar(res.grammar, dialect, schemaConfig);
    setSyncDirection(`Rule Merge (${activeStrategy}) → JSON-LD / Python / Rust / WASM`);
    showNotice(res.summary);
  };

  const handleSplitRule = (ruleName: string, splitIndex?: number) => {
    if (mutationPolicy.lockedRules.includes(ruleName)) {
      showNotice(`Rule "${ruleName}" is locked by declaration. Unlock it before splitting.`);
      return;
    }
    const res = splitGrammarRule(grammarText, rules, ruleName, dialect, splitIndex);
    if (!res.ok) {
      showNotice(res.error);
      return;
    }
    setGrammarText(res.grammar);
    recompileFromGrammar(res.grammar, dialect, schemaConfig);
    setSyncDirection(`Biject / Split <${ruleName}> → JSON-LD / Python / Rust / WASM`);
    showNotice(res.summary);
  };

  const handleReorderFlows = (sourceFlowId: string, targetFlowId: string, position: 'before' | 'after') => {
    if (sourceFlowId === targetFlowId) return;
    const nextDsl = reorderDslFlows(dslSource, sourceFlowId, targetFlowId, position);
    if (nextDsl === dslSource) return;
    setDslSource(nextDsl);
    setSyncDirection('DSL Carousel Reorder → OpenAPI / Flows');
    showNotice(`Reordered workbench step ${sourceFlowId} ${position} ${targetFlowId}.`);
  };

  const handleMergeFlows = (sourceFlowId: string, targetFlowId: string) => {
    if (sourceFlowId === targetFlowId) return;
    const src = parsedDsl.flows.find((f) => f.id === sourceFlowId);
    const tgt = parsedDsl.flows.find((f) => f.id === targetFlowId);
    if (!src || !tgt) return;
    const mergedLabel = `${tgt.label} + ${src.label.replace(/^\d+\.\s*/, '')}`;
    const lines = dslSource.split(/\r?\n/);
    const filtered = lines
      .filter((line: string) => !line.includes(`flow ${sourceFlowId} `))
      .map((line: string) =>
        line.includes(`flow ${targetFlowId} `)
          ? line.replace(/label="[^"]*"/, `label="${mergedLabel}"`)
          : line
      );
    setDslSource(filtered.join('\n'));
    setSyncDirection(`DSL Flow Merge (${sourceFlowId} → ${targetFlowId})`);
    showNotice(`Merged flow ${sourceFlowId} into ${targetFlowId}.`);
  };

  const handleSplitFlow = (flowId: string, splitIndex?: number) => {
    const target = parsedDsl.flows.find((f) => f.id === flowId);
    if (!target) return;
    const suffix = splitIndex ?? 2;
    const newId = `${flowId}_B${suffix}`;
    const lines = dslSource.split(/\r?\n/);
    const out: string[] = [];
    for (const line of lines) {
      out.push(line);
      if (line.includes(`flow ${flowId} `)) {
        const clone = line
          .replace(`flow ${flowId} `, `flow ${newId} `)
          .replace(/label="([^"]*)"/, `label="$1 (Split ${suffix})"`);
        out.push(clone);
      }
    }
    setDslSource(out.join('\n'));
    setSyncDirection(`DSL Flow Biject/Split (${flowId} → ${newId})`);
    showNotice(`Bijected flow ${flowId} into ${flowId} + ${newId}.`);
  };

  // Apply a full Histolog snapshot cleanly to EVERY input and output area
  const applyHistologSnapshot = useCallback((snap: HistologSnapshotState) => {
    suppressHistologRef.current = true;
    setDialect(snap.dialect);
    setGrammarText(snap.grammarText);
    setJsonText(snap.jsonText);
    setJsonValid(true);
    setJsonError(null);
    setMutations(snap.mutations);
    setRuleConfigs(snap.ruleConfigs);
    setEvalRule(snap.evalRule);
    setEvalPayload(snap.evalPayload);
    setPythonSource(snap.pythonSource);
    setRustSource(snap.rustSource);
    setWatSource(snap.watSource);
    setLogicStatement(snap.logicStatement);
    setLogicLabels(snap.logicLabels.map((l) => ({ ...l })));
    setDslSource(snap.dslSource);
    const restoredEdits = !snap.virtualFiles || canRestoreVirtualEdits(snap.virtualFiles);
    if (snap.virtualFiles && restoredEdits) {
      setVirtualFiles(previous => restoreVirtualEdits(previous, snap.virtualFiles!));
    }
    return restoredEdits;
  }, [canRestoreVirtualEdits]);

  const canUndo = histologCursor > 0;
  const canRedo = histologCursor < histologEntries.length - 1;

  const handleUndo = useCallback(() => {
    if (histologCursor <= 0) return;
    const fromEntry = histologEntries[histologCursor];
    const nextCursor = histologCursor - 1;
    const targetEntry = histologEntries[nextCursor];
    if (!targetEntry) return;
    setHistologCursor(nextCursor);
    const restoredEdits = applyHistologSnapshot(targetEntry.snapshot);
    setLastDiffRef({ from: targetEntry.generation, to: fromEntry.generation });
    setSyncDirection(`Undo → G${targetEntry.generation} (ref diff G${targetEntry.generation}↔G${fromEntry.generation})`);
    showNotice(`Undid to G${targetEntry.generation}.${restoredEdits ? '' : ' Virtual edits were preserved because policy blocks restoration.'}`);
  }, [histologCursor, histologEntries, applyHistologSnapshot, showNotice]);

  const handleRedo = useCallback(() => {
    if (histologCursor >= histologEntries.length - 1) return;
    const fromEntry = histologEntries[histologCursor];
    const nextCursor = histologCursor + 1;
    const targetEntry = histologEntries[nextCursor];
    if (!targetEntry) return;
    setHistologCursor(nextCursor);
    const restoredEdits = applyHistologSnapshot(targetEntry.snapshot);
    setLastDiffRef({ from: fromEntry.generation, to: targetEntry.generation });
    setSyncDirection(`Redo → G${targetEntry.generation} (ref diff G${fromEntry.generation}↔G${targetEntry.generation})`);
    showNotice(`Redid to G${targetEntry.generation}.${restoredEdits ? '' : ' Virtual edits were preserved because policy blocks restoration.'}`);
  }, [histologCursor, histologEntries, applyHistologSnapshot, showNotice]);

  // Global Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z / Ctrl+Y shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextField =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTextField) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const handleCaptureCheckpoint = (note?: string) => {
    const snap = makeCurrentHistologSnapshot();
    const current = histologEntries[histologCursor] ?? histologEntries[histologEntries.length - 1];
    const nextGen = (histologEntries[histologEntries.length - 1]?.generation ?? -1) + 1;
    const entry = createHistologEntry({
      generation: nextGen,
      parentGeneration: current?.generation ?? null,
      source: 'checkpoint',
      summary: note?.trim() || `Manual checkpoint G${nextGen}`,
      snapshot: snap,
      previousSnapshot: current?.snapshot ?? null,
    });
    const nextList = [...histologEntries.slice(0, histologCursor + 1), entry].slice(-60);
    setHistologEntries(nextList);
    setHistologCursor(nextList.length - 1);
    showNotice(`Captured checkpoint G${entry.generation}.`);
  };

  const handleRestoreGeneration = (entry: HistologEntry) => {
    const currentGen = histologEntries[histologCursor]?.generation ?? 0;
    const idx = histologEntries.findIndex((e) => e.generation === entry.generation);
    if (idx >= 0) setHistologCursor(idx);
    const restoredEdits = applyHistologSnapshot(entry.snapshot);
    setLastDiffRef({ from: entry.generation, to: currentGen });
    setSyncDirection(`Restored Full Engine → G${entry.generation}`);
    showNotice(`Restored G${entry.generation}.${restoredEdits ? '' : ' Virtual edits were preserved because policy blocks restoration.'}`);
  };

  const handleRestoreSection = (entry: HistologEntry, field: HistologFieldKey) => {
    const s = entry.snapshot;
    if (field === 'grammar') {
      setDialect(s.dialect);
      setGrammarText(s.grammarText);
      recompileFromGrammar(s.grammarText, s.dialect, schemaConfig);
    } else if (field === 'jsonld') {
      handleJsonEdited(s.jsonText);
    } else if (field === 'python') {
      setPythonSource(s.pythonSource);
    } else if (field === 'rust') {
      setRustSource(s.rustSource);
    } else if (field === 'wat') {
      setWatSource(s.watSource);
    } else if (field === 'dsl') {
      setDslSource(s.dslSource);
    } else if (field === 'logic') {
      setLogicStatement(s.logicStatement);
      setLogicLabels(s.logicLabels.map((l) => ({ ...l })));
    } else if (field === 'mutations') {
      setMutations(s.mutations);
      setRuleConfigs(s.ruleConfigs);
      recompileFromGrammar(grammarText, dialect, schemaConfig, s.mutations, mutationPolicy, s.ruleConfigs);
    } else if (field === 'evaluator') {
      setEvalRule(s.evalRule);
      setEvalPayload(s.evalPayload);
    } else if (field === 'virtualFiles') {
      if (!s.virtualFiles || !canRestoreVirtualEdits(s.virtualFiles)) {
        showNotice('Virtual edit restoration is unavailable or blocked by mutation policy.');
        return;
      }
      setVirtualFiles(previous => restoreVirtualEdits(previous, s.virtualFiles!));
    }
    showNotice(`Restored section "${HISTOLOG_FIELD_LABELS[field]}" from G${entry.generation}.`);
  };

  const handleClearSection = (section: EngineSectionKey | HistologFieldKey) => {
    if (section === 'all') {
      handleClearEntireEngine();
      return;
    }
    if (section === 'grammar') {
      setGrammarText('');
      recompileFromGrammar('', dialect, schemaConfig, {});
    } else if (section === 'jsonld') {
      setJsonText('{}');
      setJsonValid(true);
      setJsonError(null);
    } else if (section === 'mutations') {
      setMutations({});
      setRuleConfigs({});
    } else if (section === 'logic') {
      setLogicStatement('');
      setLogicLabels([]);
    } else if (section === 'evaluator') {
      setEvalPayload('');
    } else if (section === 'dsl') {
      setDslSource(DEFAULT_DSL_SOURCE);
    } else if (section === 'python') {
      setPythonSource('# Cleared Python AST module\n');
    } else if (section === 'rust') {
      setRustSource('// Cleared Rust AST module\n');
    } else if (section === 'wat') {
      setWatSource('(module\n  (memory (export "memory") 1)\n  (func (export "rule_count") (result i32) (i32.const 0))\n)');
    } else if (section === 'callbacks') {
      setGlobalCallbacks([]);
      saveGlobalCallbacks([]);
    } else if (section === 'virtualFiles') {
      if (!canRestoreVirtualEdits({})) {
        showNotice('Clearing virtual edits is blocked by mutation policy.');
        return;
      }
      setVirtualFiles(previous => restoreVirtualEdits(previous, {}));
    }
    setClearMenuOpen(false);
    showNotice(`Cleared section: ${section}.`);
  };

  const handleClearEntireEngine = () => {
    setGrammarText('');
    setJsonText('{}');
    setJsonValid(true);
    setJsonError(null);
    setMutations({});
    setRuleConfigs({});
    setEvalPayload('');
    setLogicStatement('');
    setLogicLabels([]);
    setPythonSource('# Empty Python AST module\n');
    setRustSource('// Empty Rust AST module\n');
    setWatSource('(module\n  (memory (export "memory") 1)\n  (func (export "rule_count") (result i32) (i32.const 0))\n)');
    setVerifiedSteps([]);
    setClearMenuOpen(false);
    setSyncDirection('Cleared Entire Engine (Undo or Histolog G0 to restore)');
    showNotice('Cleared entire engine state — click Undo or restore G0 from Histolog at any time.');
  };

  const handleImportHistolog = (
    rawText: string,
    mode: 'replace' | 'merge'
  ): { ok: true; message: string } | { ok: false; error: string } => {
    const res = importHistologCustom(rawText, mode, histologEntries);
    if (!res.ok) return { ok: false, error: res.error };
    if (res.entries.some(entry => entry.snapshot.virtualFiles &&
      Object.keys(entry.snapshot.virtualFiles).length > 0 &&
      (!mutationPolicy.allowImportMutation || !canRestoreVirtualEdits(entry.snapshot.virtualFiles)))) {
      return { ok: false, error: 'History contains virtual edits blocked by the current mutation policy.' };
    }
    setHistologEntries(res.entries);
    setHistologCursor(Math.max(0, res.entries.length - 1));
    const msg = `Imported ${res.importedCount} generation${res.importedCount === 1 ? '' : 's'} (${res.detectedFormat}, mode: ${mode}).`;
    showNotice(msg);
    return { ok: true, message: msg };
  };

  const handleCopyDeepLink = async (options?: { includeFullState?: boolean; forceModalOpen?: boolean; fromGen?: number; toGen?: number }) => {
    if (typeof window === 'undefined') return;
    const url = buildDeepLinkUrl(
      window.location.href,
      {
        v: 1,
        topView: options?.fromGen !== undefined ? 'histolog' : topView,
        activePage,
        modalOpen: options?.forceModalOpen ?? modalOpen,
        modalStructure,
        viewportPreset: modalViewport,
        stageFilter,
        pipelineLayoutMode,
        primaryLanguage,
        selectedMcpServerId,
        histologFromGen: options?.fromGen ?? lastDiffRef?.from,
        histologToGen: options?.toGen ?? lastDiffRef?.to,
        ...(options?.includeFullState
          ? {
              grammarText,
              dialect,
              schemaConfig,
              evalRule,
              evalPayload,
              logicStatement,
              logicLabels,
              dslSource,
            }
          : {}),
      },
      { includeFullState: options?.includeFullState, forceModalOpen: options?.forceModalOpen }
    );
    try {
      await navigator.clipboard.writeText(url);
      showNotice(
        options?.includeFullState
          ? 'Copied full shareable state URL (#state=...) to clipboard.'
          : 'Copied direct URL link to clipboard.'
      );
    } catch {
      showNotice('Direct URL prepared in address bar.');
    }
  };

  const handleSyncWorkspaceToServer = useCallback(async () => {
    await fetch('/api/workspaces/default', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grammarText,
        dialect,
        schemaConfig,
        mutationPolicy,
        mutations,
        ruleConfigs,
        evalRule,
        evalPayload,
        logicStatement,
        logicLabels,
        dslSource,
        primaryLanguage,
      }),
    });
  }, [
    grammarText,
    dialect,
    schemaConfig,
    mutationPolicy,
    mutations,
    ruleConfigs,
    evalRule,
    evalPayload,
    logicStatement,
    logicLabels,
    dslSource,
    primaryLanguage,
  ]);

  const handlePullServerWorkspace = useCallback(async () => {
    try {
      const resp = await fetch('/api/workspaces/default');
      if (!resp.ok) return;
      const data = (await resp.json()) as Record<string, unknown>;
      if (typeof data.grammarText === 'string' && data.grammarText !== grammarText) {
        const nextDialect = (data.dialect as DialectConfig | undefined) ?? dialect;
        setDialect(nextDialect);
        setGrammarText(data.grammarText);
        recompileFromGrammar(data.grammarText, nextDialect, schemaConfig);
      }
      if (typeof data.logicStatement === 'string') setLogicStatement(data.logicStatement);
      if (Array.isArray(data.logicLabels)) setLogicLabels(data.logicLabels as LogicLabelBinding[]);
      if (typeof data.dslSource === 'string') setDslSource(data.dslSource);
      showNotice('Pulled live workspace changes from Express REST API.');
    } catch {
      // Ignore offline/static mode
    }
  }, [grammarText, dialect, schemaConfig, recompileFromGrammar, showNotice]);

  const handleJsonEdited = (nextJson: string) => {
    setJsonText(nextJson);
    const reverse = schemaJsonToGrammar(nextJson, dialect);
    if (!reverse.ok) {
      setJsonValid(false);
      setJsonError(reverse.error);
      return;
    }
    setJsonValid(true);
    setJsonError(null);
    const activePolicy = reverse.mutationPolicy ?? mutationPolicy;
    if (reverse.mutationPolicy) {
      setMutationPolicy(reverse.mutationPolicy);
    }
    setDialect(reverse.dialect);
    if (reverse.grammar.trim()) {
      setGrammarText(reverse.grammar);
      const nextRules = parseGrammar(reverse.grammar, reverse.dialect);
      const nextSchema: SchemaConfig = {
        ...schemaConfig,
        schemaName: reverse.schemaName || schemaConfig.schemaName,
        schemaOrgType: reverse.schemaType || schemaConfig.schemaOrgType,
      };
      setSchemaConfig(nextSchema);
      const nextMuts = inferLineMutations(nextRules, reverse.mutations ?? mutations, rules);
      const nextCfgs = inferRuleOrderConfigs(nextRules, ruleConfigs);
      setMutations(nextMuts);
      setRuleConfigs(nextCfgs);
      setPythonSource(generatePythonFromWorkspace(nextRules, nextSchema));
      setRustSource(generateRustFromWorkspace(nextRules, nextSchema, nextMuts, activePolicy));
      setWatSource(generateWatFromWorkspace(nextRules, nextSchema.schemaName, nextJson));
      if (nextRules.length > 0 && !nextRules.some((r) => r.name === evalRule)) {
        setEvalRule(nextRules[0].name);
      }
    }
    setSyncDirection('JSON-LD → Grammar → Mutations / Evaluator / Python / Rust / WASM');
  };

  const handleApplyDialectPreset = (presetId: DialectPresetId) => {
    const p = DIALECT_PRESETS[presetId];
    setDialect(p.config);
    setGrammarText(p.sampleGrammar);
    setEvalRule(p.sampleRule);
    setEvalPayload(p.samplePayload);
    recompileFromGrammar(p.sampleGrammar, p.config, schemaConfig, {});
    showNotice(`Loaded ${p.label} dialect preset.`);
  };

  // Live-rewrite rule operator, choice delimiter, comment prefix, AND Extended DAG operators into grammarText!
  const handleDialectChange = (patch: Partial<DialectConfig>) => {
    const next: DialectConfig = {
      ...dialect,
      ...patch,
      symbols: patch.symbols ? { ...dialect.symbols, ...patch.symbols } : dialect.symbols,
    };
    const rewrittenGrammar = rewriteGrammarDialectTokens(grammarText, dialect, next);
    setDialect(next);
    if (rewrittenGrammar !== grammarText) {
      setGrammarText(rewrittenGrammar);
      recompileFromGrammar(rewrittenGrammar, next, schemaConfig);
      setSyncDirection('Dialect Token Rewrite → Active Grammar Rules / JSON-LD / AST');
    } else {
      recompileFromGrammar(grammarText, next, schemaConfig);
    }
  };

  const handleApplySchemaPreset = (presetId: SchemaPresetId) => {
    const next: SchemaConfig = {
      ...schemaConfig,
      preset: presetId,
      schemaOrgType:
        presetId === 'softwareSource'
          ? 'SoftwareSourceCode'
          : presetId === 'definedTermSet'
            ? 'DefinedTermSet'
            : 'DefinedTermSet',
      includeJsonSchemaDefs: presetId !== 'definedTermSet',
      includePotentialActions: true,
    };
    setSchemaConfig(next);
    recompileFromGrammar(grammarText, dialect, next);
  };

  const handleSchemaConfigChange = (patch: Partial<SchemaConfig>) => {
    const next = { ...schemaConfig, ...patch };
    setSchemaConfig(next);
    recompileFromGrammar(grammarText, dialect, next);
  };

  const handleMutationPolicyChange = (patch: Partial<MutationPolicy>) => {
    const next = { ...mutationPolicy, ...patch };
    setMutationPolicy(next);
    recompileFromGrammar(grammarText, dialect, schemaConfig, mutations, next);
    showNotice('Updated declared x-mutation-policy in JSON-LD schema.');
  };

  const handleToggleRuleLock = (ruleName: string) => {
    const locked = mutationPolicy.lockedRules.includes(ruleName)
      ? mutationPolicy.lockedRules.filter((r) => r !== ruleName)
      : [...mutationPolicy.lockedRules, ruleName];
    const next = { ...mutationPolicy, lockedRules: locked };
    setMutationPolicy(next);
    recompileFromGrammar(grammarText, dialect, schemaConfig, mutations, next);
  };

  const handleMutationChange = (ruleName: string, patch: Partial<LineMutation>) => {
    if (mutationPolicy.lockedRules.includes(ruleName)) {
      showNotice(`Rule "${ruleName}" is locked by schema declaration.`);
      return;
    }
    const current = mutations[ruleName] || {
      ruleName,
      targetProperty: ruleName,
      jsonType: 'string' as const,
      patternOverride: '',
      description: '',
      enabled: true,
    };
    const nextMut: LineMutation = { ...current, ...patch };
    const nextMuts = { ...mutations, [ruleName]: nextMut };

    // If Workbench 5 updates a leaf rule's patternOverride to a clean literal alternation
    // (e.g. /^(0|1|2|3|4|5|6|7|8|9)$/), sync the Grammar rule branches as well so all workbenches align.
    let activeGrammar = grammarText;
    let activeRules = rules;
    if (patch.patternOverride !== undefined && nextMut.enabled) {
      const targetRule = rules.find((r) => r.name === ruleName);
      if (targetRule && targetRule.referencedRules.length === 0) {
        const extractedAlts = extractLiteralAlternationFromRegex(patch.patternOverride);
        if (extractedAlts && extractedAlts.length > 0) {
          const delim = dialect.choiceDelimiter || '|';
          const nextExpr = extractedAlts
            .map((lit) => (!lit.includes("'") ? `'${lit}'` : JSON.stringify(lit)))
            .join(` ${delim} `);
          if (nextExpr !== targetRule.expression) {
            const updated = updateGrammarRule(
              grammarText,
              rules,
              ruleName,
              { expression: nextExpr },
              dialect
            );
            if (updated.ok) {
              activeGrammar = updated.grammar;
              activeRules = parseGrammar(activeGrammar, dialect);
              setGrammarText(activeGrammar);
            }
          }
        }
      }
    }

    setMutations(nextMuts);
    const nextJson = grammarToSchemaJson(
      activeRules,
      dialect,
      schemaConfig,
      nextMuts,
      mutationPolicy,
      ruleConfigs
    );
    setJsonText(nextJson);
    setJsonValid(true);
    setJsonError(null);
    setPythonSource(generatePythonFromWorkspace(activeRules, schemaConfig));
    setRustSource(generateRustFromWorkspace(activeRules, schemaConfig, nextMuts, mutationPolicy));
    setWatSource(generateWatFromWorkspace(activeRules, schemaConfig.schemaName, nextJson));
    setSyncDirection('Line Mutations → Grammar / Evaluator / JSON-LD / Python / Rust / WASM');
  };

  const handleAutoInferMutations = () => {
    const inferred = inferLineMutations(rules, {});
    setMutations(inferred);
    const nextJson = grammarToSchemaJson(rules, dialect, schemaConfig, inferred, mutationPolicy, ruleConfigs);
    setJsonText(nextJson);
    setJsonValid(true);
    setJsonError(null);
    setPythonSource(generatePythonFromWorkspace(rules, schemaConfig));
    setRustSource(generateRustFromWorkspace(rules, schemaConfig, inferred, mutationPolicy));
    setWatSource(generateWatFromWorkspace(rules, schemaConfig.schemaName, nextJson));
    setSyncDirection('Line Mutations → Evaluator / JSON-LD / Python / Rust / WASM');
    showNotice(`Auto-inferred schema mutations for ${rules.length} rule(s).`);
  };

  const handleResetMutations = () => {
    const cleared: Record<string, LineMutation> = {};
    for (const r of rules) {
      cleared[r.name] = {
        ruleName: r.name,
        targetProperty: r.name,
        jsonType: 'string',
        patternOverride: '',
        description: `Rule ${r.name}`,
        enabled: true,
      };
    }
    setMutations(cleared);
    const nextJson = grammarToSchemaJson(rules, dialect, schemaConfig, cleared, mutationPolicy, ruleConfigs);
    setJsonText(nextJson);
    setJsonValid(true);
    setJsonError(null);
    setPythonSource(generatePythonFromWorkspace(rules, schemaConfig));
    setRustSource(generateRustFromWorkspace(rules, schemaConfig, cleared, mutationPolicy));
    setWatSource(generateWatFromWorkspace(rules, schemaConfig.schemaName, nextJson));
    setSyncDirection('Line Mutations → Evaluator / JSON-LD / Python / Rust / WASM');
    showNotice('Reset line mutations to defaults.');
  };

  // Primary Language Switcher (supports all 22 languages!)
  const handleSelectLanguage = (lang: PrimaryLanguage) => {
    setPrimaryLanguage(lang);
    const meta = SUPPORTED_LANGUAGES.find((l) => l.id === lang);
    if (lang === 'python') {
      setTopView('workbench');
      setActivePage('python_ast');
    } else if (lang === 'rust') {
      setTopView('workbench');
      setActivePage('rust_ast');
    } else if (lang === 'wasm') {
      setTopView('workbench');
      setActivePage('wasm_wabt');
    } else if (lang === 'json') {
      setTopView('workbench');
      setActivePage('schema');
    }
    showNotice(`Switched primary language target to ${meta?.label ?? lang}.`);
  };

  // Sample workflow triggers
  const handleRunPythonSample = () => {
    const p = DIALECT_PRESETS.python_peg;
    setPrimaryLanguage('python');
    setDialect(p.config);
    setGrammarText(p.sampleGrammar);
    setEvalRule(p.sampleRule);
    setEvalPayload(p.samplePayload);
    const nextSchema: SchemaConfig = {
      ...schemaConfig,
      schemaName: 'PythonPegSubset',
      schemaOrgType: 'SoftwareSourceCode',
    };
    setSchemaConfig(nextSchema);
    recompileFromGrammar(p.sampleGrammar, p.config, nextSchema, {});
    setTopView('workbench');
    setActivePage('python_ast');
    showNotice('Loaded Python PEG grammar & compiled Python ast.Module + JSON-LD schema.');
  };

  const handleRunRustSample = () => {
    const p = DIALECT_PRESETS.rust_macro;
    setPrimaryLanguage('rust');
    setDialect(p.config);
    setGrammarText(p.sampleGrammar);
    setEvalRule(p.sampleRule);
    setEvalPayload(p.samplePayload);
    const nextSchema: SchemaConfig = {
      ...schemaConfig,
      schemaName: 'RustSynDeclGrammar',
      schemaOrgType: 'SoftwareSourceCode',
    };
    setSchemaConfig(nextSchema);
    recompileFromGrammar(p.sampleGrammar, p.config, nextSchema, {});
    setTopView('workbench');
    setActivePage('rust_ast');
    showNotice('Loaded Rust macro grammar & compiled syn::File AST + JSON-LD schema.');
  };

  const handleRunWasmSample = () => {
    const p = DIALECT_PRESETS.wat_sexpr;
    setPrimaryLanguage('wasm');
    setDialect(p.config);
    setGrammarText(p.sampleGrammar);
    setEvalRule(p.sampleRule);
    setEvalPayload(p.samplePayload);
    const nextSchema: SchemaConfig = {
      ...schemaConfig,
      schemaName: 'WabtSExprGrammar',
      schemaOrgType: 'SoftwareSourceCode',
    };
    setSchemaConfig(nextSchema);
    recompileFromGrammar(p.sampleGrammar, p.config, nextSchema, {});
    setTopView('workbench');
    setActivePage('wasm_wabt');
    showNotice('Compiled WABT S-Expression sample into validated WebAssembly bytecode.');
  };

  // Snapshot builder & loader
  const buildSnapshot = useCallback(
    (nameOverride?: string): WorkspaceSnapshot => ({
      version: '2.1.0',
      savedAt: new Date().toISOString(),
      name: nameOverride || vaultNameInput || `${schemaConfig.schemaName || 'workspace'}.g2j.json`,
      primaryLanguage,
      dialect,
      schemaConfig,
      mutationPolicy,
      grammarText,
      jsonText,
      mutations,
      ruleConfigs,
      evalRule,
      evalPayload,
      pythonSource,
      rustSource,
      watSource,
      verifiedSteps,
      virtualFiles,
    }),
    [
      vaultNameInput,
      schemaConfig,
      mutationPolicy,
      primaryLanguage,
      dialect,
      grammarText,
      jsonText,
      mutations,
      ruleConfigs,
      evalRule,
      evalPayload,
      pythonSource,
      rustSource,
      watSource,
      verifiedSteps,
      virtualFiles,
    ]
  );

  const applySnapshot = useCallback(
    (snap: WorkspaceSnapshot) => {
      if (!mutationPolicy.allowImportMutation) {
        showNotice('Import mutation is disabled by the current x-mutation-policy declaration.');
        return;
      }
      const parsedFiles = parseVirtualFiles(snap.virtualFiles);
      if (parsedFiles.issues.length) {
        showNotice(`Workspace import rejected: ${parsedFiles.issues[0].slice(0, 200)}`);
        return;
      }
      const importedFiles = parsedFiles.files;
      if (Object.values(importedFiles).some(file => file.edit !== null && !virtualEditAllowed(file, mutationPolicy))) {
        showNotice('Workspace import contains virtual edits blocked by the current mutation policy.');
        return;
      }
      if (snap.dialect) setDialect(snap.dialect);
      if (snap.schemaConfig) setSchemaConfig(snap.schemaConfig);
      if (snap.mutationPolicy) setMutationPolicy(snap.mutationPolicy);
      if (typeof snap.grammarText === 'string') setGrammarText(snap.grammarText);
      if (typeof snap.jsonText === 'string') {
        setJsonText(snap.jsonText);
        setJsonValid(true);
      }
      if (snap.mutations) setMutations(snap.mutations);
      if (snap.ruleConfigs) setRuleConfigs(snap.ruleConfigs);
      if (typeof snap.evalRule === 'string') setEvalRule(snap.evalRule);
      if (typeof snap.evalPayload === 'string') setEvalPayload(snap.evalPayload);
      if (typeof snap.pythonSource === 'string') setPythonSource(snap.pythonSource);
      if (typeof snap.rustSource === 'string') setRustSource(snap.rustSource);
      if (typeof snap.watSource === 'string') setWatSource(snap.watSource);
      if (snap.primaryLanguage) setPrimaryLanguage(snap.primaryLanguage);
      if (Array.isArray(snap.verifiedSteps)) setVerifiedSteps(snap.verifiedSteps);
      if (snap.virtualFiles) {
        setVirtualFiles(previous => mergeVirtualFiles(previous, importedFiles));
        setSubmissionRevision(value => value + 1);
      }
      showNotice(`Loaded workspace "${snap.name || 'snapshot'}".`);
    },
    [mutationPolicy, showNotice]
  );

  // File I/O Helpers
  const triggerTextDownload = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showNotice(`Exported ${filename}.`);
  };

  const handleExportJsonLdPackage = (selectedTargets: TransformTarget[]) => {
    if (!mutationPolicy.allowExportMutation) {
      showNotice('Export mutation is locked by x-mutation-policy. Enable it in Step 2 to export packages.');
      return;
    }
    const pkg = buildJsonLdSchemaPackage({
      dialect,
      schemaConfig,
      mutationPolicy,
      grammarText,
      jsonText,
      selectedTargets,
      pythonSource,
      pythonAst,
      rustSource,
      rustAst,
      watSource,
      wasmResult,
    });
    const filename = `${schemaConfig.schemaName || 'grammar'}.package.jsonld`;
    const content = JSON.stringify(pkg, null, 2);
    submitArtifacts('payload', [{
      path: 'payload/last-package.jsonld',
      content,
      filename,
      targets: [...new Set<TransformTarget>(['jsonld', ...selectedTargets.filter(target => mutationPolicy.allowedTargets.includes(target))])],
    }]);
    triggerTextDownload(content, filename, 'application/ld+json');
  };

  const handleImportJsonLdPackageFile = async (file: File) => {
    if (!mutationPolicy.allowImportMutation) {
      showNotice('Import mutation is locked by x-mutation-policy. Enable it in Step 2 before importing.');
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<JsonLdSchemaPackage>;
      if (parsed['x-package-format'] === 'grammar2json-ld-package/v2') {
        const nextDialect = parsed['x-source-dialect'] || dialect;
        const nextPolicy = parsed['x-mutation-policy'] || mutationPolicy;
        const nextSchema: SchemaConfig = {
          ...schemaConfig,
          schemaName: parsed.name || schemaConfig.schemaName,
          schemaOrgType: parsed['@type'] || schemaConfig.schemaOrgType,
          schemaStoreDraft: parsed.$schema || schemaConfig.schemaStoreDraft,
        };
        setDialect(nextDialect);
        setMutationPolicy(nextPolicy);
        setSchemaConfig(nextSchema);
        const nextJson = JSON.stringify(parsed.schemaDocument || parsed, null, 2);
        setJsonText(nextJson);
        setJsonValid(true);
        if (parsed.artifacts?.grammar) setGrammarText(parsed.artifacts.grammar);
        if (parsed.artifacts?.python?.source) setPythonSource(parsed.artifacts.python.source);
        if (parsed.artifacts?.rust?.source) setRustSource(parsed.artifacts.rust.source);
        if (parsed.artifacts?.wasm?.wat) setWatSource(parsed.artifacts.wasm.wat);
        setSyncDirection('Imported JSON-LD Package → Grammar / Python / Rust / WASM');
        showNotice(`Imported JSON-LD Schema Package "${file.name}".`);
        return;
      }
      // Fallback: raw Schema.org JSON-LD schema file
      handleJsonEdited(text);
      showNotice(`Imported Schema.org JSON-LD "${file.name}" and translated to active targets.`);
    } catch {
      showNotice('Invalid JSON-LD package or schema file.');
    }
  };

  const handleTransformFromJsonLdToTarget = (target: TransformTarget) => {
    if (!mutationPolicy.allowExportMutation) {
      showNotice('Export mutation is disallowed by x-mutation-policy.');
      return;
    }
    if (!mutationPolicy.allowedTargets.includes(target)) {
      showNotice(`Target "${target.toUpperCase()}" is restricted by x-mutation-policy.allowedTargets.`);
      return;
    }
    const reverse = schemaJsonToGrammar(jsonText, dialect);
    if (!reverse.ok) {
      showNotice(`Fix JSON-LD syntax before translating: ${reverse.error}`);
      return;
    }
    const parsedRules = parseGrammar(reverse.grammar || grammarText, reverse.dialect);
    const nextMuts = inferLineMutations(parsedRules, mutations);
    const nextSchema: SchemaConfig = {
      ...schemaConfig,
      schemaName: reverse.schemaName || schemaConfig.schemaName,
      schemaOrgType: reverse.schemaType || schemaConfig.schemaOrgType,
    };

    if (target === 'python') {
      setPythonSource(generatePythonFromWorkspace(parsedRules, nextSchema));
      setPrimaryLanguage('python');
      setActivePage('python_ast');
      setSyncDirection('JSON-LD Schema → Python ast.Module');
      showNotice('Translated JSON-LD Schema into Python ast.Module.');
    } else if (target === 'rust') {
      setRustSource(generateRustFromWorkspace(parsedRules, nextSchema, nextMuts, mutationPolicy));
      setPrimaryLanguage('rust');
      setActivePage('rust_ast');
      setSyncDirection('JSON-LD Schema → Rust syn / serde AST');
      showNotice('Translated JSON-LD Schema into Rust syn / serde declarations.');
    } else if (target === 'wasm') {
      setWatSource(generateWatFromWorkspace(parsedRules, nextSchema.schemaName, jsonText));
      setPrimaryLanguage('wasm');
      setActivePage('wasm_wabt');
      setSyncDirection('JSON-LD Schema → WABT (.wat) + WASM Binary');
      showNotice('Translated JSON-LD Schema into WABT (.wat) & compiled WASM binary.');
    } else {
      const normalized = grammarToSchemaJson(parsedRules, reverse.dialect, nextSchema, nextMuts, mutationPolicy);
      setJsonText(normalized);
      setJsonValid(true);
      setPrimaryLanguage('json');
      setActivePage('schema');
      setSyncDirection('Normalized Schema.org JSON-LD');
      showNotice('Normalized Schema.org JSON-LD document.');
    }
  };

  const handleExportWasmBinary = () => {
    if (!mutationPolicy.allowExportMutation || !mutationPolicy.allowedTargets.includes('wasm')) {
      showNotice('WASM export is restricted by x-mutation-policy.');
      return;
    }
    if (!wasmResult.valid || wasmResult.bytes.length === 0) {
      showNotice('Fix WAT syntax before exporting a .wasm binary.');
      return;
    }
    const blob = new Blob([new Uint8Array(wasmResult.bytes)], { type: 'application/wasm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schemaConfig.schemaName || 'module'}.wasm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showNotice(`Exported ${wasmResult.sizeBytes}-byte .wasm binary.`);
  };

  const handleImportWorkspaceFile = async (file: File) => {
    try {
      const text = await file.text();
      const snap = JSON.parse(text) as WorkspaceSnapshot;
      applySnapshot(snap);
    } catch {
      showNotice('Invalid .g2j.json workspace file.');
    }
  };

  const handleImportGrammarFile = async (file: File) => {
    if (!mutationPolicy.allowImportMutation) {
      showNotice('Import mutation is disabled by x-mutation-policy.');
      return;
    }
    const text = await file.text();
    handleGrammarEdited(text);
    showNotice(`Imported grammar from ${file.name}.`);
  };

  const handleImportPythonFile = async (file: File) => {
    if (!mutationPolicy.allowImportMutation) {
      showNotice('Import mutation is disabled by x-mutation-policy.');
      return;
    }
    const text = await file.text();
    setPythonSource(text);
    setActivePage('python_ast');
    showNotice(`Imported Python module ${file.name}.`);
  };

  const handleImportRustFile = async (file: File) => {
    if (!mutationPolicy.allowImportMutation) {
      showNotice('Import mutation is disabled by x-mutation-policy.');
      return;
    }
    const text = await file.text();
    setRustSource(text);
    setActivePage('rust_ast');
    showNotice(`Imported Rust module ${file.name}.`);
  };

  const handleImportWatFile = async (file: File) => {
    if (!mutationPolicy.allowImportMutation) {
      showNotice('Import mutation is disabled by x-mutation-policy.');
      return;
    }
    const text = await file.text();
    setWatSource(text);
    setActivePage('wasm_wabt');
    showNotice(`Imported WAT source ${file.name}.`);
  };

  const handleImportWasmFile = async (file: File) => {
    if (!mutationPolicy.allowImportMutation) {
      showNotice('Import mutation is disabled by x-mutation-policy.');
      return;
    }
    const buf = await file.arrayBuffer();
    const res = decompileWasmToWat(new Uint8Array(buf));
    if (res.ok) {
      setWatSource(res.wat);
      setActivePage('wasm_wabt');
      showNotice(`Decompiled ${file.name} (${buf.byteLength} bytes) via wasm2wat.`);
    } else {
      showNotice(res.error);
    }
  };

  const handleDownloadProjectZip = async () => {
    if (!canExportVirtualState) {
      showNotice('Export is blocked by the mutation policy for virtual edits.');
      return;
    }
    const snap = buildSnapshot();
    const { fileCount, byteSize } = await downloadPhpProjectZip(OPENAPI_SPEC, dslSource, snap);
    showNotice(`Packaged ${fileCount} PHP/HTML/OpenAPI/DSL files (${(byteSize / 1024).toFixed(1)} KB .zip).`);
  };

  // Google Drive & Demo Vault Actions
  const handleGoogleSignIn = async () => {
    setDriveAuthLoading(true);
    setDriveError(null);
    try {
      const { user, accessToken } = await signInWithGoogleDrive();
      setDriveUser(user);
      const files = await listDriveWorkspaces(accessToken);
      setDriveFiles(files);
      setDriveListingAvailable(true);
      showNotice(`Signed in to Google Drive as ${user.email || user.displayName}.`);
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setDriveAuthLoading(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutGoogleDrive();
    setDriveUser(null);
    setDriveFiles([]);
    setDriveListingAvailable(false);
    showNotice('Signed out of Google Drive.');
  };

  const handleRefreshVault = async () => {
    setDriveError(null);
    if (driveMode === 'demo') {
      setDemoFiles(loadDemoVaultFromStorage());
      showNotice('Refreshed Demo Vault snapshots.');
      return;
    }
    const token = getCachedDriveToken();
    if (!token) {
      setDriveError('Sign in with Google to refresh Drive files.');
      return;
    }
    setDriveBusy(true);
    try {
      const files = await listDriveWorkspaces(token);
      setDriveFiles(files);
      setDriveListingAvailable(true);
      showNotice(`Synced ${files.length} workspace file(s) from Google Drive.`);
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : 'Drive refresh failed.');
    } finally {
      setDriveBusy(false);
    }
  };

  const handleSaveNewSnapshot = async () => {
    setDriveError(null);
    const filename = vaultNameInput.trim() || `${schemaConfig.schemaName || 'studio'}.g2j.json`;
    const normalized = filename.endsWith('.g2j.json') ? filename : `${filename}.g2j.json`;
    const snap = buildSnapshot(normalized);

    if (driveMode === 'demo') {
      const record: VaultRecord = {
        id: `demo_${Date.now()}`,
        name: normalized,
        updatedAt: snap.savedAt,
        sizeBytes: JSON.stringify(snap).length,
        source: 'demo',
        snapshot: snap,
      };
      const next = [record, ...demoFiles];
      if (!saveDemoVaultToStorage(next)) {
        setDriveError('Demo Vault save failed; browser storage may be full or unavailable.');
        return;
      }
      setDemoFiles(next);
      showNotice(`Saved "${normalized}" to Demo Vault.`);
      return;
    }

    if (!canExportVirtualState) {
      setDriveError('Drive save is blocked by the mutation policy for virtual edits.');
      return;
    }
    const token = getCachedDriveToken();
    if (!token) {
      setDriveError('Sign in with Google before saving to Google Drive.');
      return;
    }
    setDriveBusy(true);
    try {
      const created = await createDriveWorkspace(token, normalized, snap);
      setDriveFiles((prev) => [created, ...prev]);
      showNotice(`Saved "${created.name}" to Google Drive.`);
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : 'Drive save failed.');
    } finally {
      setDriveBusy(false);
    }
  };

  const handleLoadSnapshot = async (record: VaultRecord) => {
    setDriveError(null);
    if (record.source === 'demo' && record.snapshot) {
      applySnapshot(record.snapshot);
      return;
    }
    const token = getCachedDriveToken();
    if (!token) {
      setDriveError('Sign in with Google to load Drive files.');
      return;
    }
    setDriveBusy(true);
    try {
      const snap = await loadDriveWorkspace(token, record.id);
      applySnapshot(snap);
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : 'Drive load failed.');
    } finally {
      setDriveBusy(false);
    }
  };

  const handleRequestOverwriteSnapshot = (record: VaultRecord) => {
    setConfirmState({
      open: true,
      title: `Overwrite "${record.name}"?`,
      description:
        record.source === 'drive'
          ? `This will replace the contents of "${record.name}" in your Google Drive with your current Grammar2JSON Studio workspace.`
          : `This will overwrite "${record.name}" in the offline Demo Vault with your current workspace.`,
      confirmLabel: 'Overwrite File',
      destructive: false,
      onConfirm: async () => {
        const snap = buildSnapshot(record.name);
        if (record.source === 'demo') {
          const next = demoFiles.map((f) =>
            f.id === record.id
              ? { ...f, updatedAt: snap.savedAt, sizeBytes: JSON.stringify(snap).length, snapshot: snap }
              : f
          );
          if (!saveDemoVaultToStorage(next)) {
            setDriveError('Demo Vault save failed; browser storage may be full or unavailable.');
            setConfirmState((s) => ({ ...s, open: false }));
            return;
          }
          setDemoFiles(next);
          setConfirmState((s) => ({ ...s, open: false }));
          showNotice(`Overwrote "${record.name}" in Demo Vault.`);
          return;
        }
        if (!canExportVirtualState) {
          setDriveError('Drive save is blocked by the mutation policy for virtual edits.');
          setConfirmState((s) => ({ ...s, open: false }));
          return;
        }
        const token = getCachedDriveToken();
        if (!token) {
          setDriveError('Sign in with Google to update Drive files.');
          setConfirmState((s) => ({ ...s, open: false }));
          return;
        }
        setDriveBusy(true);
        try {
          await updateDriveWorkspace(token, record.id, snap);
          setDriveFiles((prev) =>
            prev.map((f) => (f.id === record.id ? { ...f, updatedAt: snap.savedAt } : f))
          );
          showNotice(`Updated "${record.name}" in Google Drive.`);
        } catch (err) {
          setDriveError(err instanceof Error ? err.message : 'Drive update failed.');
        } finally {
          setDriveBusy(false);
          setConfirmState((s) => ({ ...s, open: false }));
        }
      },
    });
  };

  const handleRequestDeleteSnapshot = (record: VaultRecord) => {
    setConfirmState({
      open: true,
      title: `Delete "${record.name}"?`,
      description:
        record.source === 'drive'
          ? `Are you sure you want to permanently delete "${record.name}" from Google Drive? This action cannot be undone.`
          : `Are you sure you want to delete "${record.name}" from the Demo Vault?`,
      confirmLabel: 'Delete Permanently',
      destructive: true,
      onConfirm: async () => {
        if (record.source === 'demo') {
          const next = demoFiles.filter((f) => f.id !== record.id);
          if (!saveDemoVaultToStorage(next)) {
            setDriveError('Demo Vault update failed; browser storage may be unavailable.');
            setConfirmState((s) => ({ ...s, open: false }));
            return;
          }
          setDemoFiles(next);
          setConfirmState((s) => ({ ...s, open: false }));
          showNotice(`Deleted "${record.name}" from Demo Vault.`);
          return;
        }
        const token = getCachedDriveToken();
        if (!token) {
          setDriveError('Sign in with Google to delete Drive files.');
          setConfirmState((s) => ({ ...s, open: false }));
          return;
        }
        setDriveBusy(true);
        try {
          await deleteDriveWorkspace(token, record.id);
          setDriveFiles((prev) => prev.filter((f) => f.id !== record.id));
          showNotice(`Deleted "${record.name}" from Google Drive.`);
        } catch (err) {
          setDriveError(err instanceof Error ? err.message : 'Drive delete failed.');
        } finally {
          setDriveBusy(false);
          setConfirmState((s) => ({ ...s, open: false }));
        }
      },
    });
  };

  // Carousel & DSL Flow Navigation
  const flows = parsedDsl.flows;
  const currentStepIndex = Math.max(
    0,
    flows.findIndex((f) => f.page === activePage)
  );
  const currentFlow = flows[currentStepIndex] || {
    id: 'FLOW_DIALECT',
    step: 1,
    stage: 'frontend' as PipelineStage,
    page: 'dialect' as WorkflowSlug,
    lang: 'grammar' as const,
    verify: 'has_rules',
    next: 'FLOW_RULE_PROPS',
    label: '1. Grammar & DAG',
  };

  const breadcrumbs = useMemo(
    () =>
      buildPipelineBreadcrumbs({
        flows,
        topView,
        activePage,
        stageFilter,
        verifiedSteps,
        contextLabel:
          topView === 'workbench'
            ? activePage === 'mcp_servers'
              ? `/api/mcp/${selectedMcpServerId}`
              : schemaConfig.schemaName
            : schemaConfig.schemaName,
        origin: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
      }),
    [flows, topView, activePage, stageFilter, verifiedSteps, selectedMcpServerId, schemaConfig.schemaName]
  );

  const handleBreadcrumbNavigate = useCallback(
    (target: { topView?: TopView; stageFilter?: 'all' | PipelineStage; page?: WorkflowSlug }) => {
      if (target.topView) setTopView(target.topView);
      if (target.stageFilter !== undefined) setStageFilter(target.stageFilter);
      if (target.page) setActivePage(target.page);
    },
    []
  );

  const handleOpenMcpServer = useCallback((serverId: McpServerId) => {
    setSelectedMcpServerId(serverId);
    setTopView('workbench');
    setActivePage('mcp_servers');
  }, []);

  const handlePipelineMcpEffect = useCallback(
    (effect: PipelineMcpUiEffect) => {
      if (effect.topView) setTopView(effect.topView);
      if (effect.stageFilter !== undefined) setStageFilter(effect.stageFilter);
      if (effect.activePage) setActivePage(effect.activePage);
      if (effect.verifiedSteps) setVerifiedSteps(effect.verifiedSteps);
      if (effect.pipelineLayoutMode) setPipelineLayoutMode(effect.pipelineLayoutMode);
      if (effect.dslSource && effect.dslSource !== dslSource) {
        setDslSource(effect.dslSource);
      }
      setSyncDirection('MCP /api/mcp/pipeline → Pipeline Grid & Breadcrumbs');
      showNotice('Applied live Pipeline MCP update to Studio Grid & Breadcrumbs.');
    },
    [dslSource, showNotice]
  );

  // Dynamic OpenAPI Spec that reacts live to child rule, dialect, language, and callback mutations
  const dynamicOpenApiSpec: OpenApiSpec = useMemo(() => {
    const liveRulePaths: OpenApiSpec['paths'] = {};
    rules.slice(0, 6).forEach((r) => {
      liveRulePaths[`/api/nodes/rule/${r.name}`] = {
        get: {
          operationId: `getRuleNode_${r.name}`,
          summary: `Inspect live rule <${r.name}> (${r.alternatives.length} branch${r.alternatives.length === 1 ? '' : 'es'}) & HATEOAS members`,
          tags: ['Rule Nodes'],
          'x-language': primaryLanguage,
          'x-workbench-step': 2,
          responses: { '200': { description: 'HATEOAS Rule Node & Members' } },
        },
        patch: {
          operationId: `patchRuleNode_${r.name}`,
          summary: `Mutate rule <${r.name}> expression or precedence via REST`,
          tags: ['Rule Nodes'],
          'x-language': primaryLanguage,
          'x-workbench-step': 2,
          responses: { '200': { description: 'Updated Rule Node' } },
        },
      };
    });
    return {
      ...OPENAPI_SPEC,
      info: {
        ...OPENAPI_SPEC.info,
        title: `${schemaConfig.schemaName} · Grammar2JSON OpenAPI`,
        description: `${OPENAPI_SPEC.info.description} Active dialect: ${dialect.preset} (${rules.length} rules, ${globalCallbacks.length} global callbacks, target: ${primaryLanguage}).`,
      },
      paths: {
        ...OPENAPI_SPEC.paths,
        ...liveRulePaths,
      },
    };
  }, [rules, dialect.preset, globalCallbacks.length, primaryLanguage, schemaConfig.schemaName]);

  useEffect(() => {
    submitArtifacts('workspace', [
      { path: 'grammar/grammar.txt', content: grammarText },
      { path: 'grammar/rules.json', content: JSON.stringify(rules, null, 2) },
      { path: 'grammar/dependencies.json', content: JSON.stringify(ruleGraph, null, 2) },
      { path: 'grammar/rule-properties.json', content: JSON.stringify(ruleConfigs, null, 2) },
      { path: 'dialect/config.json', content: JSON.stringify(dialect, null, 2) },
      { path: 'logic/statement.txt', content: logicStatement },
      { path: 'logic/labels.json', content: JSON.stringify(logicLabels, null, 2) },
      { path: 'schema/schema.jsonld', content: jsonText, target: 'jsonld' },
      { path: 'schema/mutations.json', content: JSON.stringify(mutations, null, 2) },
      { path: 'evaluator/result.json', content: JSON.stringify(evalResult, null, 2) },
      { path: 'python/source.py', content: pythonSource, target: 'python' },
      { path: 'python/ast.txt', content: pythonAstDump, target: 'python' },
      { path: 'rust/source.rs', content: rustSource, target: 'rust' },
      { path: 'rust/ast.txt', content: rustAstDump, target: 'rust' },
      { path: 'wasm/module.wat', content: watSource, target: 'wasm' },
      { path: 'wasm/compilation.json', content: JSON.stringify(wasmResult, null, 2), target: 'wasm' },
      { path: 'compiled/current.txt', content: compiledLanguageExport.content, filename: compiledLanguageExport.filename,
        ...(['json', 'python', 'rust', 'wasm'].includes(primaryLanguage)
          ? { target: primaryLanguage === 'json' ? 'jsonld' as const : primaryLanguage as 'python' | 'rust' | 'wasm' }
          : {}) },
      { path: 'specs/openapi.json', content: JSON.stringify(dynamicOpenApiSpec, null, 2) },
      { path: 'specs/flows.dsl', content: dslSource },
    ]);
  }, [submitArtifacts, grammarText, rules, ruleGraph, ruleConfigs, dialect, logicStatement, logicLabels, jsonText, mutations, evalResult, pythonSource, pythonAstDump, rustSource, rustAstDump, watSource, wasmResult, compiledLanguageExport, primaryLanguage, dynamicOpenApiSpec, dslSource]);

  useEffect(() => {
    submitArtifacts('history', [{ path: 'history/generations.json', content: JSON.stringify(histologEntries.map(({ generation, parentGeneration, timestamp, source, summary, changedFields }) => ({ generation, parentGeneration, timestamp, source, summary, changedFields })), null, 2) }]);
  }, [submitArtifacts, histologEntries]);

  const stepByOffset = (delta: number) => {
    if (flows.length === 0) return;
    const nextIdx = (currentStepIndex + delta + flows.length) % flows.length;
    setActivePage(flows[nextIdx].page);
  };

  const handleVerifyAndAdvance = (advanceToNext: boolean) => {
    const gate = currentFlow.verify;
    let passed = true;
    let failReason = '';

    if (gate === 'has_rules' && rules.length === 0) {
      passed = false;
      failReason = 'Add at least one grammar rule to verify Step 1.';
    } else if (gate === 'valid_json' && !jsonValid) {
      passed = false;
      failReason = 'Fix JSON syntax errors in the Live Mirror to verify Step 2.';
    } else if (gate === 'py_ast_valid' && (pythonAst.body || []).length === 0) {
      passed = false;
      failReason = 'Python module must contain at least one statement.';
    } else if (gate === 'rust_ast_valid' && rustAst.items.length === 0) {
      passed = false;
      failReason = 'Rust module must declare at least one struct, const, or function.';
    } else if (gate === 'wasm_valid' && !wasmResult.valid) {
      passed = false;
      failReason = 'WAT source must compile to a valid WebAssembly binary.';
    }

    if (!passed) {
      showNotice(failReason);
      return;
    }

    setVerifiedSteps((prev) => (prev.includes(currentFlow.page) ? prev : [...prev, currentFlow.page]));

    if (advanceToNext) {
      const nextFlow = flows.find((f) => f.id === currentFlow.next) || flows[(currentStepIndex + 1) % flows.length];
      if (nextFlow) {
        setActivePage(nextFlow.page);
        showNotice(`Verified ${currentFlow.label} and advanced to ${nextFlow.label}.`);
        return;
      }
    }
    showNotice(`Verified ${currentFlow.label}.`);
  };

  // Search Hits
  const searchHits = useMemo(
    () =>
      searchStudio(
        searchQuery,
        dynamicOpenApiSpec,
        parsedDsl,
        rules,
        pythonSymbols,
        rustSymbols,
        wasmResult.exports.map((e) => e.name)
      ),
    [searchQuery, dynamicOpenApiSpec, parsedDsl, rules, pythonSymbols, rustSymbols, wasmResult.exports]
  );

  // Shared props for StepViews (both inline & modal)
  const stepViewProps = {
    activePage,
    onSubmitArtifacts: submitArtifacts,
    dialect,
    schemaConfig,
    mutationPolicy,
    rules,
    ruleGraph,
    jsonText,
    jsonValid,
    mutations,
    evalRule,
    evalPayload,
    evalResult,
    pythonSource,
    pythonAst,
    pythonAstDump,
    rustSource,
    rustAst,
    rustAstDump,
    watSource,
    wasmResult,
    driveMode,
    driveUser,
    driveAuthLoading,
    driveBusy,
    driveError,
    vaultNameInput,
    vaultFiles: driveMode === 'drive' ? driveFiles : demoFiles,
    onApplyDialectPreset: handleApplyDialectPreset,
    onDialectChange: handleDialectChange,
    onLoadEbnfSample: () => handleApplyDialectPreset('ebnf'),
    onLoadPythonGrammarSample: () => handleApplyDialectPreset('python_peg'),
    onLoadRustGrammarSample: () => handleApplyDialectPreset('rust_macro'),
    onApplySchemaPreset: handleApplySchemaPreset,
    onSchemaConfigChange: handleSchemaConfigChange,
    onMutationPolicyChange: handleMutationPolicyChange,
    onToggleRuleLock: handleToggleRuleLock,
    onAutoInferMutations: handleAutoInferMutations,
    onResetMutations: handleResetMutations,
    onMutationChange: handleMutationChange,
    onEvalRuleChange: setEvalRule,
    onEvalPayloadChange: setEvalPayload,
    onExportWorkspace: () => {
      if (!canExportVirtualState) {
        showNotice('Export is blocked by the mutation policy for virtual edits.');
        return;
      }
      const snap = buildSnapshot();
      triggerTextDownload(JSON.stringify(snap, null, 2), snap.name, 'application/json');
    },
    onExportJsonLdPackage: handleExportJsonLdPackage,
    onImportJsonLdPackageFile: handleImportJsonLdPackageFile,
    onTransformFromJsonLdToTarget: handleTransformFromJsonLdToTarget,
    onImportWorkspaceFile: handleImportWorkspaceFile,
    onExportTextFile: triggerTextDownload,
    onImportGrammarFile: handleImportGrammarFile,
    onImportPythonFile: handleImportPythonFile,
    onImportRustFile: handleImportRustFile,
    onImportWatFile: handleImportWatFile,
    onImportWasmFile: handleImportWasmFile,
    onExportWasmBinary: handleExportWasmBinary,
    onLoadEmptyPayload: () => {
      setGrammarText('');
      setJsonText('{}');
      setJsonValid(true);
      setMutations({});
      setEvalPayload('');
      setPythonSource('# Empty Python AST module\n');
      setRustSource('// Empty Rust AST module\n');
      setWatSource(
        '(module\n  (memory (export "memory") 1)\n  (func (export "rule_count") (result i32)\n    (i32.const 0)\n  )\n)'
      );
      showNotice('Cleared workspace to empty payload.');
    },
    onRunPythonSample: handleRunPythonSample,
    onRunRustSample: handleRunRustSample,
    onRunWasmSample: handleRunWasmSample,
    onDownloadProjectZip: handleDownloadProjectZip,
    onDriveModeChange: (mode: 'drive' | 'demo') => {
      setDriveMode(mode);
      setDriveError(null);
    },
    onGoogleSignIn: handleGoogleSignIn,
    onGoogleSignOut: handleGoogleSignOut,
    onVaultNameChange: setVaultNameInput,
    onRefreshVault: handleRefreshVault,
    onSaveNewSnapshot: handleSaveNewSnapshot,
    onLoadSnapshot: handleLoadSnapshot,
    onRequestOverwriteSnapshot: handleRequestOverwriteSnapshot,
    onRequestDeleteSnapshot: handleRequestDeleteSnapshot,
    onPythonSourceChange: setPythonSource,
    onGeneratePythonFromGrammar: () => {
      setPythonSource(generatePythonFromWorkspace(rules, schemaConfig));
      setSyncDirection('Grammar / JSON-LD → Python AST');
      showNotice('Generated Python source from active grammar & JSON-LD schema.');
    },
    onUnparsePythonAst: () => {
      const unparsed = unparsePythonAst(pythonAst);
      setPythonSource(unparsed);
      showNotice('Reformatted Python source via ast.unparse().');
    },
    onSyncPythonToGrammar: () => {
      if (!mutationPolicy.allowImportMutation) {
        showNotice('Import mutation is disabled by x-mutation-policy.');
        return;
      }
      const extracted = extractRulesFromPythonAst(pythonAst, dialect);
      if (!extracted) {
        showNotice('Define a GRAMMAR_RULES dict in Python source to sync back to Grammar.');
        return;
      }
      setGrammarText(extracted);
      recompileFromGrammar(extracted, dialect, schemaConfig);
      setSyncDirection('Python AST → Grammar & JSON-LD');
      showNotice('Synced Python AST rules into Grammar, JSON-LD, Rust, and WASM.');
    },
    onRustSourceChange: setRustSource,
    onGenerateRustFromWorkspace: () => {
      setRustSource(generateRustFromWorkspace(rules, schemaConfig, mutations, mutationPolicy));
      setSyncDirection('Grammar / JSON-LD → Rust AST');
      showNotice('Generated Rust serde/syn declarations from active schema.');
    },
    onSyncRustToGrammar: () => {
      if (!mutationPolicy.allowImportMutation) {
        showNotice('Import mutation is disabled by x-mutation-policy.');
        return;
      }
      const extracted = extractRulesFromRustAst(rustAst, dialect);
      if (!extracted) {
        showNotice('Define pub const GRAMMAR_RULES: &[(&str, &str)] in Rust source to sync back.');
        return;
      }
      setGrammarText(extracted);
      recompileFromGrammar(extracted, dialect, schemaConfig);
      setSyncDirection('Rust syn AST → Grammar & JSON-LD');
      showNotice('Synced Rust AST declarations into Grammar, JSON-LD, Python, and WASM.');
    },
    onWatSourceChange: setWatSource,
    onGenerateWatFromWorkspace: () => {
      setWatSource(generateWatFromWorkspace(rules, schemaConfig.schemaName, jsonText));
      setSyncDirection('JSON-LD / Workspace → WAT → WASM');
      showNotice('Generated WAT S-expression module from current workspace.');
    },
    onDecompileWasmToWat: () => {
      const res = decompileWasmToWat(wasmResult.bytes);
      if (res.ok) {
        setWatSource(res.wat);
        setSyncDirection('WASM Binary → wasm2wat');
        showNotice('Decompiled compiled WASM binary back to WAT S-expressions.');
      } else {
        showNotice(res.error);
      }
    },
    grammarText,
    ruleConfigs,
    logicStatement,
    logicLabels,
    globalCallbacks,
    onSaveGlobalCallback: handleSaveGlobalCallback,
    onDeleteGlobalCallback: handleDeleteGlobalCallback,
    mcpWorkspaceContext,
    selectedMcpServerId,
    onPipelineMcpEffect: handlePipelineMcpEffect,
    onUpdateRule: handleUpdateRule,
    onAddRule: handleAddRule,
    onDeleteRule: handleDeleteRule,
    onUpdateRuleConfig: handleUpdateRuleConfig,
    onApplyPrecedenceOrder: handleApplyPrecedenceOrder,
    onLogicStateChange: handleLogicStateChange,
    onSyncLogicToGrammar: handleSyncLogicToGrammar,
    onNotify: showNotice,
    onAutoStubMissingRules: handleAutoStubMissingRules,
    onOpenFullGraphView: () => setTopView('graph'),
    mergeStrategy,
    onMergeStrategyChange: setMergeStrategy,
    onReorderRules: handleReorderRules,
    onMergeRules: handleMergeRules,
    onSplitRule: handleSplitRule,
    onOpenEditModal: (page: WorkflowSlug) => {
      setActivePage(page);
      setModalOpen(true);
    },
    primaryLanguage,
    autocompleteSuggestions,
    lintIssues: studioLintIssues,
    onRippleModuleExport: handleRippleModuleExport,
    canUndo,
    onUndo: handleUndo,
  };

  const isSpecsView = topView === 'openapi' || topView === 'dsl' || topView === 'bundle';
  const activeSpecsTab: 'openapi' | 'dsl' | 'bundle' =
    topView === 'dsl' ? 'dsl' : topView === 'bundle' ? 'bundle' : specsSubTab;
  const nextFlow = flows.find((flow) => flow.id === currentFlow.next);
  const workbenchPitch = getWorkbenchPitch(
    activePage,
    currentFlow.label,
    nextFlow?.label ?? currentFlow.next
  );
  const standalonePitch =
    topView === 'graph'
      ? STANDALONE_PITCHES.graph
      : topView === 'histolog'
        ? STANDALONE_PITCHES.histolog
        : topView === 'api'
          ? STANDALONE_PITCHES.api
          : isSpecsView
            ? STANDALONE_PITCHES.specs
            : null;

  const selectedLangMeta =
    SUPPORTED_LANGUAGES.find((l) => l.id === primaryLanguage) ?? SUPPORTED_LANGUAGES[0];

  const primaryNavItems: Array<{
    id: 'workbench' | 'graph' | 'histolog' | 'api' | 'specs';
    fullLabel: string;
    compactLabel: string;
    icon: typeof Layers;
    active: boolean;
    onClick: () => void;
  }> = [
    {
      id: 'workbench',
      fullLabel: 'Workbench',
      compactLabel: 'Work',
      icon: Layers,
      active: topView === 'workbench',
      onClick: () => setTopView('workbench'),
    },
    {
      id: 'graph',
      fullLabel: 'Rule Dependency Graph',
      compactLabel: 'Graph',
      icon: GitBranch,
      active: topView === 'graph',
      onClick: () => setTopView('graph'),
    },
    {
      id: 'histolog',
      fullLabel: 'Histolog & Diff',
      compactLabel: 'History',
      icon: History,
      active: topView === 'histolog',
      onClick: () => setTopView('histolog'),
    },
    {
      id: 'api',
      fullLabel: 'API Studio',
      compactLabel: 'API',
      icon: Terminal,
      active: topView === 'api',
      onClick: () => setTopView('api'),
    },
    {
      id: 'specs',
      fullLabel: 'Specifications & Bundle',
      compactLabel: 'Specs',
      icon: FileCode2,
      active: isSpecsView,
      onClick: () => setTopView(activeSpecsTab),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* STRICT 3-ZONE TOP BAR CONTRACT (compact on mobile <= 56px, full labels on desktop) */}
      <header
        data-tour-id={
          topView === 'workbench'
            ? 'home.views'
            : topView === 'graph'
              ? 'view.graph.navigation'
              : topView === 'histolog'
                ? 'view.histolog.navigation'
                : topView === 'openapi'
                  ? 'view.openapi.navigation'
                  : undefined
        }
        className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95"
      >
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-2.5 sm:px-6 md:py-3.5">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setTopView('workbench')}
            className="shrink-0 whitespace-nowrap text-sm font-bold tracking-tight text-slate-900 sm:text-base dark:text-slate-100"
          >
            Grammar2JSON Studio
          </button>

          {/* Zone 2: 5 Clean Non-Redundant Single-Line Nav Links (abbreviate ONLY when narrow viewport demands it) */}
          <nav className="hidden items-center gap-4 md:flex lg:gap-6" aria-label="Primary sections">
            {primaryNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className={`shrink-0 whitespace-nowrap border-b-2 py-1 text-sm font-medium transition-colors ${
                  item.active
                    ? 'border-blue-600 text-slate-900 dark:border-blue-400 dark:text-slate-100'
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <span className="hidden xl:inline">{item.fullLabel}</span>
                <span className="xl:hidden">{item.compactLabel}</span>
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handleDownloadProjectZip}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 sm:px-4"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download Project ZIP</span>
              <span className="sm:hidden">ZIP</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-5 px-3 py-4 pb-20 sm:px-6 sm:py-6 md:pb-8">
        {/* WORKSPACE TOOLBAR: GLOBAL SEARCH, 22-LANGUAGE SWITCHER, AUTO-SAVE, UNDO/REDO, CLEAR/RESTORE, DEEP LINKS */}
        <section className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Search Box */}
            <div className="relative flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setSearchOpen(false);
                }}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                placeholder="Search OpenAPI routes, DSL flows, rules, AST symbols, or WASM exports..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-9 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchOpen(false);
                  }}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}

              {/* Live Search Dropdown */}
              {searchOpen && searchQuery.trim() !== '' && (
                <div className="absolute right-0 left-0 z-20 mt-2 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between px-2.5 py-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>Search Results ({searchHits.length})</span>
                    <button
                      type="button"
                      onClick={() => setSearchOpen(false)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      Close
                    </button>
                  </div>
                  {searchHits.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-slate-500">
                      No OpenAPI operations, DSL flows, rules, or AST symbols match &quot;{searchQuery}&quot;.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {searchHits.map((hit) => (
                        <button
                          key={hit.id}
                          type="button"
                          onClick={() => {
                            setTopView('workbench');
                            setActivePage(hit.targetPage);
                            setSearchOpen(false);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/70"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                              {hit.title}
                            </div>
                            <div className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {hit.kind} · {hit.subtitle}
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                            {hit.method}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 22-Language Selector + Quick Target Tabs + Samples + Deep Link + Clear/Restore + Theme */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5">
                <div
                  className="hidden items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 sm:inline-flex dark:border-slate-800 dark:bg-slate-950"
                  role="group"
                  aria-label="Primary language quick switcher"
                >
                  {(
                    [
                      ['json', 'JSON-LD'],
                      ['python', 'Python'],
                      ['rust', 'Rust'],
                      ['wasm', 'WASM'],
                    ] as const
                  ).map(([lang, label]) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => handleSelectLanguage(lang)}
                      className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        primaryLanguage === lang
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <select
                  aria-label="Select target programming language (22 supported)"
                  value={primaryLanguage}
                  onChange={(e) => handleSelectLanguage(e.target.value as PrimaryLanguage)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.id} value={lang.id}>
                      {lang.label} ({lang.extension})
                    </option>
                  ))}
                </select>
                <DocTooltip docKey="languageSelection" />
              </div>

              {/* Clear / Restore Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setClearMenuOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Eraser className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Clear / Restore</span>
                  <span className="md:hidden">Clear</span>
                </button>
                {clearMenuOpen && (
                  <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <span>Clear Engine or Section</span>
                      <button
                        type="button"
                        onClick={() => setClearMenuOpen(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          ['grammar', 'Grammar Rules'],
                          ['jsonld', 'JSON-LD Schema'],
                          ['logic', 'Logic & λ Calc'],
                          ['mutations', 'Line Mutations'],
                          ['evaluator', 'Eval Payload'],
                          ['python', 'Python AST'],
                          ['rust', 'Rust AST'],
                          ['wat', 'WASM / WAT'],
                          ['dsl', 'Reset DSL Flows'],
                          ['callbacks', 'Global Callbacks'],
                        ] as Array<[EngineSectionKey, string]>
                      ).map(([sec, lbl]) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => handleClearSection(sec)}
                          className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-left text-[11px] font-medium text-slate-700 hover:border-amber-400 hover:bg-amber-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2.5 flex flex-col gap-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={handleClearEntireEngine}
                        className="w-full rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                      >
                        Clear Entire Engine
                      </button>
                      {histologEntries[0] && (
                        <button
                          type="button"
                          onClick={() => {
                            handleRestoreGeneration(histologEntries[0]);
                            setClearMenuOpen(false);
                          }}
                          className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restore Initial Generation (G0)
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Direct Link & Shareable State Link */}
              <button
                type="button"
                onClick={() => void handleCopyDeepLink({ includeFullState: false })}
                title="Copy direct URL for current view & workbench"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Link2 className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Copy Link</span>
              </button>
              <button
                type="button"
                onClick={() => void handleCopyDeepLink({ includeFullState: true })}
                title="Copy full shareable URL encoding workspace state (#state=...)"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">Share State</span>
              </button>

              <button
                type="button"
                onClick={() => setDarkMode((d) => !d)}
                aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Clean unboxed typographic metadata bar with Auto-Save + Chained Undo/Redo + Historic Diff Link */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{currentFlow.id}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                Step {currentFlow.step} of {flows.length}
              </span>
              <span aria-hidden="true">·</span>
              <span className="hidden sm:inline">Sync: {syncDirection}</span>
              <span className="sm:hidden">{selectedLangMeta.label}</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                disabled={recoveryPending}
                onClick={() => setAutoSaveEnabled((v) => !v)}
                title="Toggle automatic localStorage workspace persistence"
                className={`inline-flex items-center gap-1 font-medium ${
                  autoSaveEnabled
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                <Save className="h-3 w-3" />
                <span>
                  {autoSaveEnabled
                    ? lastAutoSavedAt
                      ? `Auto-saved ${new Date(lastAutoSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                      : 'Auto-Save On'
                    : 'Auto-Save Paused'}
                </span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {notice && (
                <div className="font-medium text-blue-600 dark:text-blue-400" role="status">
                  {notice}
                </div>
              )}

              {/* Chained Undo / Redo + Clickable Historic Diff Reference */}
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  disabled={!canUndo}
                  onClick={handleUndo}
                  title="Undo to previous Histolog generation (Ctrl/Cmd+Z)"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Undo2 className="h-3 w-3" />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  disabled={!canRedo}
                  onClick={handleRedo}
                  title="Redo to next Histolog generation (Ctrl/Cmd+Shift+Z)"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Redo2 className="h-3 w-3" />
                  <span>Redo</span>
                </button>
                <span className="font-mono text-[11px] tabular-nums text-slate-400">
                  G{histologEntries[histologCursor]?.generation ?? 0}/{histologEntries[histologEntries.length - 1]?.generation ?? 0}
                </span>
                {lastDiffRef && (
                  <button
                    type="button"
                    onClick={() => setTopView('histolog')}
                    title="Inspect historic diff in Histolog"
                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                  >
                    <FileDiff className="h-3 w-3" />
                    Diff G{lastDiffRef.from}↔G{lastDiffRef.to}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* WELL-DEFINED WAI-ARIA + SCHEMA.ORG BREADCRUMB NAVIGATION */}
        <PipelineBreadcrumbs
          breadcrumbs={breadcrumbs}
          onNavigate={handleBreadcrumbNavigate}
          onOpenPipelineMcp={() => handleOpenMcpServer('pipeline')}
          onExportJsonLd={triggerTextDownload}
        />

        {topView === 'workbench' ? (
          <ElevatorPitch copy={STUDIO_HOME_PITCH} compact headingLevel="p" />
        ) : standalonePitch ? (
          <ElevatorPitch copy={standalonePitch} compact headingLevel="p" />
        ) : null}

        {recoveryPending && <section role="alert" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          <p>Autosave is paused because saved virtual files contain invalid entries. Valid edits were restored; rejected data remains in browser storage.</p>
          <p>{savedVirtualFiles.issues.map(issue => issue.slice(0, 200)).join(' · ')}</p>
          <button type="button" className="mr-3 underline" disabled={!mutationPolicy.allowExportMutation || mutationPolicy.lockedRules.length > 0}
            onClick={() => triggerTextDownload(JSON.stringify(initialAutoSave?.virtualFiles, null, 2), 'virtual-files-recovery.json', 'application/json')}>Download saved virtual data</button>
          <button type="button" className="underline" disabled={mutationPolicy.lockedRules.length > 0}
            onClick={() => { setRecoveryPending(false); setAutoSaveEnabled(true); }}>Discard rejected entries and resume autosave</button>
        </section>}
        {Object.keys(virtualState.submissionIssues).length > 0 && <section role="alert" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          <p>Some workbench outputs were rejected; their previous files and edits were not changed.</p>
          {Object.entries(virtualState.submissionIssues).map(([owner, issues]) => <div key={owner}>
            <span>{owner}: {issues.map(issue => issue.slice(0, 200)).join(' · ')}</span>{' '}
            <button type="button" className="underline" onClick={() => dispatchVirtual({ type: 'retry', owner })}>Retry submission</button>
          </div>)}
        </section>}

        <div>
          <button type="button" className="rounded border px-3 py-1 text-sm font-medium" aria-expanded={showVirtualFiles} onClick={() => setShowVirtualFiles(value => !value)}>
            {showVirtualFiles ? 'Hide' : 'Open'} shared virtual files ({Object.keys(virtualFiles).length})
          </button>
          {showVirtualFiles && <VirtualFilesWorkbench files={virtualFiles} setFiles={setVirtualFiles} policy={mutationPolicy} onDownload={triggerTextDownload} />}
        </div>

        {/* TOP VIEW ROUTER */}
        {topView !== 'workbench' && (
          <div className="flex justify-end">
            <GuidedHelp key={topView} context={topView} />
          </div>
        )}
        {topView === 'graph' ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            <RuleDependencyGraph
              graph={ruleGraph}
              mergeStrategy={mergeStrategy}
              onMergeStrategyChange={setMergeStrategy}
              onReorderRules={handleReorderRules}
              onMergeRules={handleMergeRules}
              onSplitRule={handleSplitRule}
              onEditRuleInModal={(ruleName) => {
                setEvalRule(ruleName);
                setActivePage('rule_props');
                setModalOpen(true);
              }}
              canUndo={canUndo}
              onUndo={handleUndo}
              onSelectRuleForEval={(ruleName) => {
                setEvalRule(ruleName);
                setActivePage('evaluator');
                setTopView('workbench');
                showNotice(`Switched Evaluator start rule to <${ruleName}>.`);
              }}
              onToggleRuleLock={handleToggleRuleLock}
              onAutoStubMissingRules={handleAutoStubMissingRules}
            />
          </section>
        ) : topView === 'histolog' ? (
          <HistologWorkbench
            allowExport={canExportHistory}
            entries={histologEntries}
            index={histologIndex}
            schemaName={schemaConfig.schemaName}
            initialFromGen={lastDiffRef?.from}
            initialToGen={lastDiffRef?.to}
            onCaptureCheckpoint={handleCaptureCheckpoint}
            onRestoreGeneration={handleRestoreGeneration}
            onRestoreSection={handleRestoreSection}
            onClearSection={(field) => handleClearSection(field)}
            onClearEntireEngine={handleClearEntireEngine}
            onImportHistolog={handleImportHistolog}
            onDownloadFile={(content, filename, mime) => {
              if (!canExportHistory) {
                showNotice('History export is blocked by the mutation policy for virtual edits.');
                return;
              }
              triggerTextDownload(content, filename, mime);
            }}
            onCopyDiffLink={(fromGen, toGen) =>
              void handleCopyDeepLink({ includeFullState: false, fromGen, toGen })
            }
          />
        ) : topView === 'api' ? (
          <ApiStudioWorkbench
            onSubmitArtifacts={submitArtifacts}
            onSyncWorkspaceToServer={handleSyncWorkspaceToServer}
            onPullServerWorkspace={handlePullServerWorkspace}
            onDownloadFile={triggerTextDownload}
            onNotify={showNotice}
          />
        ) : isSpecsView ? (
          <SpecsBundleView
            onSubmitArtifacts={submitArtifacts}
            activeSubTab={activeSpecsTab}
            onSubTabChange={(sub) => {
              setSpecsSubTab(sub);
              setTopView(sub);
            }}
            openapi={dynamicOpenApiSpec}
            dslSource={dslSource}
            parsedDsl={parsedDsl}
            snapshot={buildSnapshot()}
            lintIssues={studioLintIssues}
            autocompleteSuggestions={autocompleteSuggestions}
            onRippleModuleExport={handleRippleModuleExport}
            onChangeDsl={setDslSource}
            onResetDsl={() => {
              setDslSource(DEFAULT_DSL_SOURCE);
              showNotice('Restored default dsl/flows.dsl definition.');
            }}
            onJumpToPage={(page) => {
              setActivePage(page);
              setTopView('workbench');
            }}
            onOpenEditModal={(page) => {
              setActivePage(page);
              setModalOpen(true);
            }}
            onReorderFlows={handleReorderFlows}
            onMergeFlows={handleMergeFlows}
            onSplitFlow={handleSplitFlow}
            onDownloadZip={handleDownloadProjectZip}
            onNotify={showNotice}
          />
        ) : (
          <>
            {/* OPTIMIZED COMPILER PIPELINE GRID (Compact Grid / Stage Lanes / Rail) */}
            <PipelineGrid
              flows={flows}
              stageSummaries={breadcrumbs.stageSummaries}
              activePage={activePage}
              currentFlow={currentFlow}
              verifiedSteps={verifiedSteps}
              stageFilter={stageFilter}
              layoutMode={pipelineLayoutMode}
              onSelectPage={setActivePage}
              onOpenModalForPage={(page) => {
                setActivePage(page);
                setModalOpen(true);
              }}
              onStageFilterChange={setStageFilter}
              onLayoutModeChange={setPipelineLayoutMode}
              onStepOffset={stepByOffset}
              onReorderFlows={handleReorderFlows}
              onMergeFlows={handleMergeFlows}
              onSplitFlow={handleSplitFlow}
              onOpenMcpServer={handleOpenMcpServer}
            />

            <div className="flex flex-wrap justify-end gap-2">
              <GuidedHelp context="home" />
              <GuidedHelp key={activePage} context={activePage} />
            </div>

            {/* Mobile/Tablet Pane Switcher between Active Workbench & Live State Mirror */}
            <div className="flex items-center justify-between gap-2 xl:hidden">
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setMobileWorkbenchPane('workbench')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    mobileWorkbenchPane === 'workbench'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Active Workbench
                </button>
                <button
                  type="button"
                  onClick={() => setMobileWorkbenchPane('mirror')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    mobileWorkbenchPane === 'mirror'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Live State Mirror
                </button>
              </div>
              {studioLintIssues.length > 0 && (
                <span className="font-mono text-xs text-amber-600 dark:text-amber-400">
                  {studioLintIssues.length} lint notice{studioLintIssues.length === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {/* ACTIVE DSL-CONTROLLED SPLIT PAGE + BIDIRECTIONAL LIVE STATE MIRROR */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              {/* Left 7 Cols: Active Split Page */}
              <section
                className={`flex flex-col rounded-xl border border-slate-200 bg-white p-4 sm:p-5 xl:col-span-7 dark:border-slate-800 dark:bg-slate-900 ${
                  mobileWorkbenchPane === 'mirror' ? 'hidden xl:flex' : 'flex'
                }`}
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3.5 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                      pages/{activePage}.php
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{currentFlow.id}</span>
                    <span aria-hidden="true">·</span>
                    <span>Verify: {currentFlow.verify}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleVerifyAndAdvance(true)}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Complete &amp; Verify Step {currentFlow.step}
                  </button>
                </div>

                <ElevatorPitch copy={workbenchPitch} compact />

                <div className="flex-1">
                  <StepViews {...stepViewProps} />
                </div>
              </section>

              {/* Right 5 Cols: Synchronized Multi-Language Live Mirror (Syntax Coloring + Autocomplete + HTML Output + Lint Tooltips) */}
              <section
                className={`flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 xl:col-span-5 dark:border-slate-800 dark:bg-slate-900 ${
                  mobileWorkbenchPane === 'workbench' ? 'hidden xl:flex' : 'flex'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Bidirectional Live State Mirror
                    </h2>
                    <DocTooltip docKey="liveMirror" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      <Boxes className="h-3 w-3 text-blue-500" />
                      {loadedModules.length} mod{loadedModules.length === 1 ? '' : 's'}
                    </span>
                    <span
                      className={`font-mono text-xs font-medium ${
                        jsonValid
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {jsonValid ? 'Valid JSON-LD' : 'Invalid JSON'}
                    </span>
                  </div>
                </div>

                {/* Live Studio Lint Strip (Unused calls, undefined refs, unused lambda params, disabled operators) with hover tooltips */}
                {studioLintIssues.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 dark:border-amber-900/60 dark:bg-amber-950/20">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                      <span className="inline-flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Live Lint Diagnostics ({studioLintIssues.length})
                      </span>
                      <span className="font-normal text-amber-700/80 dark:text-amber-400/80">
                        Hover item for details
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {studioLintIssues.slice(0, 8).map((issue) => (
                        <div key={issue.id} className="group relative">
                          <span
                            tabIndex={0}
                            className={`inline-flex cursor-help items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium underline decoration-wavy underline-offset-2 ${
                              issue.severity === 'error'
                                ? 'border-red-300 bg-red-50 text-red-700 decoration-red-500 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300'
                                : issue.severity === 'warning'
                                  ? 'border-amber-300 bg-white text-amber-800 decoration-amber-500 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300'
                                  : 'border-sky-300 bg-white text-sky-700 decoration-sky-500 dark:border-sky-800 dark:bg-slate-900 dark:text-sky-300'
                            }`}
                          >
                            {issue.symbol}
                            <span className="text-[9px] uppercase opacity-70">{issue.code.replace(/_/g, ' ')}</span>
                          </span>
                          <div className="pointer-events-none invisible absolute bottom-full left-0 z-40 mb-1.5 w-64 rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-left text-[11px] text-slate-100 opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                            <div className="font-semibold text-amber-300">
                              {issue.code} · {issue.symbol}
                            </div>
                            <p className="mt-1 text-slate-200">{issue.message}</p>
                            {issue.suggestion && (
                              <p className="mt-1 text-[10px] text-sky-300">Fix: {issue.suggestion}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!jsonValid && jsonError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-mono text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                    JSON syntax error: {jsonError}
                  </div>
                )}

                {/* Pane 1: Active Grammar Rules (Syntax-Colored Autocomplete Editor <-> Formatted HTML Output) */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                    <label htmlFor="mainGrammarInput" className="font-medium text-slate-700 dark:text-slate-300">
                      Active Grammar Rules ({dialect.preset}) · {rules.length} rule{rules.length === 1 ? '' : 's'}
                    </label>
                    <div className="inline-flex rounded border border-slate-200 bg-slate-100 p-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-950">
                      <button
                        type="button"
                        onClick={() => setGrammarMirrorMode('edit')}
                        className={`rounded px-2 py-0.5 font-medium ${
                          grammarMirrorMode === 'edit'
                            ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                            : 'text-slate-500'
                        }`}
                      >
                        Syntax Editor
                      </button>
                      <button
                        type="button"
                        onClick={() => setGrammarMirrorMode('html')}
                        className={`rounded px-2 py-0.5 font-medium ${
                          grammarMirrorMode === 'html'
                            ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                            : 'text-slate-500'
                        }`}
                      >
                        HTML Output
                      </button>
                    </div>
                  </div>
                  {grammarMirrorMode === 'edit' ? (
                    <AutocompleteField
                      inputId="mainGrammarInput"
                      value={grammarText}
                      onChange={handleGrammarEdited}
                      suggestions={autocompleteSuggestions}
                      onRippleModuleExport={handleRippleModuleExport}
                      multiline
                      rows={7}
                      syntaxMode="grammar"
                      commentPrefix={dialect.commentPrefix}
                      showModuleLoader
                      loadedModules={loadedModules}
                      allAvailableModules={allAvailableModules}
                      onToggleModule={handleToggleModule}
                      onAddCustomModule={handleAddCustomModule}
                      placeholder="Enter EBNF, BNF, PEG, Python, Rust, or WAT grammar rules..."
                    />
                  ) : (
                    <HtmlCodeOutput
                      code={grammarText}
                      language="grammar"
                      title={`Active Grammar Rules (${dialect.preset})`}
                      filename={`${schemaConfig.schemaName || 'grammar'}.ebnf`}
                      lintIssues={studioLintIssues}
                      maxHeightClass="max-h-56"
                    />
                  )}
                </div>

                {/* Pane 2: Editable Schema.org JSON-LD (HTML Output <-> Syntax-Colored Autocomplete Editor) */}
                <div className="flex flex-1 flex-col">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                    <label htmlFor="mainJsonEditor" className="font-medium text-slate-700 dark:text-slate-300">
                      Schema.org JSON-LD ({schemaConfig.schemaOrgType})
                    </label>
                    <div className="inline-flex rounded border border-slate-200 bg-slate-100 p-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-950">
                      <button
                        type="button"
                        onClick={() => setJsonMirrorMode('html')}
                        className={`rounded px-2 py-0.5 font-medium ${
                          jsonMirrorMode === 'html'
                            ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                            : 'text-slate-500'
                        }`}
                      >
                        HTML Output
                      </button>
                      <button
                        type="button"
                        onClick={() => setJsonMirrorMode('edit')}
                        className={`rounded px-2 py-0.5 font-medium ${
                          jsonMirrorMode === 'edit'
                            ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                            : 'text-slate-500'
                        }`}
                      >
                        Edit JSON-LD
                      </button>
                    </div>
                  </div>
                  {jsonMirrorMode === 'html' ? (
                    <HtmlCodeOutput
                      code={jsonText}
                      language="json"
                      title={`Schema.org JSON-LD · ${schemaConfig.schemaName}`}
                      filename={`${schemaConfig.schemaName || 'schema'}.jsonld`}
                      lintIssues={studioLintIssues}
                      maxHeightClass="max-h-64"
                    />
                  ) : (
                    <AutocompleteField
                      inputId="mainJsonEditor"
                      value={jsonText}
                      onChange={handleJsonEdited}
                      suggestions={autocompleteSuggestions}
                      onRippleModuleExport={handleRippleModuleExport}
                      multiline
                      rows={11}
                      syntaxMode="json"
                      placeholder='{ "@context": "https://schema.org" }'
                    />
                  )}
                </div>

                {/* Pane 3: Live Compiled Output for Any of the 22 Selected Languages (HTML Output + Download) */}
                {primaryLanguage !== 'json' && (
                  <div className="space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                        <Code2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        Compiled Target: {selectedLangMeta.label} ({selectedLangMeta.extension})
                      </span>
                      <div className="flex items-center gap-1.5">
                        <div className="inline-flex rounded border border-slate-200 bg-slate-100 p-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-950">
                          <button
                            type="button"
                            onClick={() => setCompiledMirrorMode('html')}
                            className={`rounded px-2 py-0.5 font-medium ${
                              compiledMirrorMode === 'html'
                                ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                                : 'text-slate-500'
                            }`}
                          >
                            HTML Output
                          </button>
                          <button
                            type="button"
                            onClick={() => setCompiledMirrorMode('edit')}
                            className={`rounded px-2 py-0.5 font-medium ${
                              compiledMirrorMode === 'edit'
                                ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                                : 'text-slate-500'
                            }`}
                          >
                            Editable
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            triggerTextDownload(
                              compiledLanguageExport.content,
                              compiledLanguageExport.filename,
                              compiledLanguageExport.mime
                            )
                          }
                          className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 dark:border-slate-700 dark:text-blue-400"
                        >
                          Export {selectedLangMeta.extension}
                        </button>
                      </div>
                    </div>
                    {compiledMirrorMode === 'html' ? (
                      <HtmlCodeOutput
                        code={compiledLanguageExport.content}
                        language={primaryLanguage}
                        title={`${selectedLangMeta.label} Export · ${compiledLanguageExport.filename}`}
                        filename={compiledLanguageExport.filename}
                        lintIssues={studioLintIssues}
                        maxHeightClass="max-h-56"
                      />
                    ) : (
                      <AutocompleteField
                        value={
                          primaryLanguage === 'python'
                            ? pythonSource
                            : primaryLanguage === 'rust'
                              ? rustSource
                              : primaryLanguage === 'wasm'
                                ? watSource
                                : compiledLanguageExport.content
                        }
                        onChange={(val) => {
                          if (primaryLanguage === 'python') setPythonSource(val);
                          else if (primaryLanguage === 'rust') setRustSource(val);
                          else if (primaryLanguage === 'wasm') setWatSource(val);
                        }}
                        suggestions={autocompleteSuggestions}
                        onRippleModuleExport={handleRippleModuleExport}
                        multiline
                        rows={8}
                        syntaxMode="code"
                      />
                    )}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      {/* MOBILE BOTTOM TAB BAR (5 destinations, >=44px touch targets, safe-area inset) */}
      <nav
        aria-label="Mobile navigation"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-xs md:hidden dark:border-slate-800 dark:bg-slate-900/95"
      >
        <div className="grid h-14 grid-cols-5">
          {primaryNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                  item.active
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.compactLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* UNIVERSAL WORKBENCH MODAL (Selectable Structures + Hardcoded Viewport Frames + Direct Modal Link) */}
      <UniversalWorkbenchModal
        open={modalOpen}
        flow={currentFlow}
        totalSteps={flows.length}
        structure={modalStructure}
        viewport={modalViewport}
        onStructureChange={setModalStructure}
        onViewportChange={setModalViewport}
        onPrevStep={() => stepByOffset(-1)}
        onVerifyAndAdvance={() => handleVerifyAndAdvance(true)}
        onCopyModalLink={() => void handleCopyDeepLink({ includeFullState: false, forceModalOpen: true })}
        onClose={() => setModalOpen(false)}
      >
        <StepViews {...stepViewProps} onSubmitArtifacts={submitModalArtifacts} layoutStructure={modalStructure} />
      </UniversalWorkbenchModal>

      {/* CONFIRMATION DIALOG FOR MUTATING / DESTRUCTIVE DRIVE OPERATIONS */}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        destructive={confirmState.destructive}
        busy={driveBusy}
        onConfirm={() => void confirmState.onConfirm()}
        onCancel={() => setConfirmState((s) => ({ ...s, open: false }))}
      />
    </div>
  );
}
