import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Moon,
  Search,
  Sun,
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
  schemaJsonToGrammar,
  sortRulesByPrecedence,
  unparsePythonAst,
  updateGrammarRule,
} from './engine/bidirectionalEngine';
import { LOGIC_CALCULATOR_PRESETS, type LogicLabelBinding } from './engine/logicLambdaEngine';
import type { McpWorkspaceContext } from './engine/mcpServerEngine';
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
import { ConfirmDialog } from './components/ConfirmDialog';
import { BundleInspector, DslInspector, OpenApiInspector } from './components/InspectorViews';
import type { PipelineMcpUiEffect } from './components/McpServersWorkbench';
import { PipelineBreadcrumbs } from './components/PipelineBreadcrumbs';
import { PipelineGrid } from './components/PipelineGrid';
import { RuleDependencyGraph } from './components/RuleDependencyGraph';
import { StepViews } from './components/StepViews';
import { UniversalWorkbenchModal } from './components/UniversalWorkbenchModal';
import type {
  DialectConfig,
  DialectPresetId,
  JsonLdSchemaPackage,
  LineMutation,
  McpServerId,
  ModalStructure,
  MutationPolicy,
  PipelineGridMode,
  PipelineStage,
  PrimaryLanguage,
  RuleMergeStrategy,
  RuleOrderConfig,
  SchemaConfig,
  SchemaPresetId,
  TopView,
  TransformTarget,
  VaultRecord,
  ViewportPreset,
  WorkflowSlug,
  WorkspaceSnapshot,
} from './types/studio';

const DEMO_VAULT_STORAGE_KEY = 'grammar2json_demo_vault_v2';

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

function saveDemoVaultToStorage(records: VaultRecord[]): void {
  try {
    localStorage.setItem(DEMO_VAULT_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Ignore storage quota issues in restricted iframes
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

  // Top-level navigation & workflow step state
  const [topView, setTopView] = useState<TopView>('workbench');
  const [dslSource, setDslSource] = useState(DEFAULT_DSL_SOURCE);
  const parsedDsl = useMemo(() => parseDslFlows(dslSource), [dslSource]);

  const [activePage, setActivePage] = useState<WorkflowSlug>('dialect');
  const [primaryLanguage, setPrimaryLanguage] = useState<PrimaryLanguage>('json');
  const [verifiedSteps, setVerifiedSteps] = useState<WorkflowSlug[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStructure, setModalStructure] = useState<ModalStructure>('split');
  const [modalViewport, setModalViewport] = useState<ViewportPreset>('responsive');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  // Toast feedback
  const [notice, setNotice] = useState<string | null>(null);
  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
  }, []);

  // Drag-and-drop reorder / merge strategy & undo stack
  const [mergeStrategy, setMergeStrategy] = useState<RuleMergeStrategy>('choice');
  const [undoStack, setUndoStack] = useState<Array<{ grammarText: string; dslSource: string; label: string }>>([]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4600);
    return () => window.clearTimeout(t);
  }, [notice]);

  // Core bidirectional workspace state
  const initialPreset = DIALECT_PRESETS.ebnf;
  const [dialect, setDialect] = useState<DialectConfig>(initialPreset.config);
  const [schemaConfig, setSchemaConfig] = useState<SchemaConfig>(INITIAL_SCHEMA_CONFIG);
  const [mutationPolicy, setMutationPolicy] = useState<MutationPolicy>(DEFAULT_MUTATION_POLICY);

  const [grammarText, setGrammarText] = useState<string>(initialPreset.sampleGrammar);
  const rules = useMemo(() => parseGrammar(grammarText, dialect), [grammarText, dialect]);
  const ruleGraph = useMemo(
    () => analyzeRuleDependencies(rules, grammarText, dialect, mutationPolicy.lockedRules),
    [rules, grammarText, dialect, mutationPolicy.lockedRules]
  );

  const [stageFilter, setStageFilter] = useState<'all' | PipelineStage>('all');
  const [pipelineLayoutMode, setPipelineLayoutMode] = useState<PipelineGridMode>('compact');
  const [selectedMcpServerId, setSelectedMcpServerId] = useState<McpServerId>('pipeline');
  const [mutations, setMutations] = useState<Record<string, LineMutation>>(() =>
    inferLineMutations(parseGrammar(initialPreset.sampleGrammar, initialPreset.config))
  );
  const [ruleConfigs, setRuleConfigs] = useState<Record<string, RuleOrderConfig>>(() =>
    inferRuleOrderConfigs(parseGrammar(initialPreset.sampleGrammar, initialPreset.config))
  );
  const [logicStatement, setLogicStatement] = useState<string>(LOGIC_CALCULATOR_PRESETS[0].statement);
  const [logicLabels, setLogicLabels] = useState<LogicLabelBinding[]>(() =>
    LOGIC_CALCULATOR_PRESETS[0].labels.map((l) => ({ ...l }))
  );

  const [jsonText, setJsonText] = useState<string>(() => {
    const initialRules = parseGrammar(initialPreset.sampleGrammar, initialPreset.config);
    const initialMuts = inferLineMutations(initialRules);
    const initialCfg = inferRuleOrderConfigs(initialRules);
    return grammarToSchemaJson(
      initialRules,
      initialPreset.config,
      INITIAL_SCHEMA_CONFIG,
      initialMuts,
      DEFAULT_MUTATION_POLICY,
      initialCfg
    );
  });
  const [jsonValid, setJsonValid] = useState(true);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [syncDirection, setSyncDirection] = useState('Grammar → JSON-LD → Python / Rust / WASM / MCP');

  const [evalRule, setEvalRule] = useState(initialPreset.sampleRule);
  const [evalPayload, setEvalPayload] = useState(initialPreset.samplePayload);
  const evalResult = useMemo(
    () => evaluateGrammarPayload(rules, evalRule, evalPayload, mutations),
    [rules, evalRule, evalPayload, mutations]
  );

  // Python AST state
  const [pythonSource, setPythonSource] = useState<string>(() =>
    generatePythonFromWorkspace(
      parseGrammar(initialPreset.sampleGrammar, initialPreset.config),
      INITIAL_SCHEMA_CONFIG
    )
  );
  const { ast: pythonAst, symbols: pythonSymbols } = useMemo(
    () => parsePythonToAst(pythonSource),
    [pythonSource]
  );
  const pythonAstDump = useMemo(() => formatPythonAstDump(pythonAst), [pythonAst]);

  // Rust AST state
  const [rustSource, setRustSource] = useState<string>(() => {
    const initialRules = parseGrammar(initialPreset.sampleGrammar, initialPreset.config);
    const initialMuts = inferLineMutations(initialRules);
    return generateRustFromWorkspace(initialRules, INITIAL_SCHEMA_CONFIG, initialMuts, DEFAULT_MUTATION_POLICY);
  });
  const { ast: rustAst, symbols: rustSymbols } = useMemo(
    () => parseRustToAst(rustSource),
    [rustSource]
  );
  const rustAstDump = useMemo(() => formatRustAstDump(rustAst), [rustAst]);

  // WASM / WABT state
  const [watSource, setWatSource] = useState<string>(() => {
    const initialRules = parseGrammar(initialPreset.sampleGrammar, initialPreset.config);
    const initialMuts = inferLineMutations(initialRules);
    const initJson = grammarToSchemaJson(
      initialRules,
      initialPreset.config,
      INITIAL_SCHEMA_CONFIG,
      initialMuts,
      DEFAULT_MUTATION_POLICY
    );
    return generateWatFromWorkspace(initialRules, INITIAL_SCHEMA_CONFIG.schemaName, initJson);
  });
  const wasmResult = useMemo(() => compileWatToWasm(watSource), [watSource]);

  // Google Drive + Offline Demo Vault state
  const [driveMode, setDriveMode] = useState<'drive' | 'demo'>('drive');
  const [driveUser, setDriveUser] = useState<User | null>(null);
  const [driveAuthLoading, setDriveAuthLoading] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<VaultRecord[]>([]);
  const [demoFiles, setDemoFiles] = useState<VaultRecord[]>(() => loadDemoVaultFromStorage());
  const [vaultNameInput, setVaultNameInput] = useState('order_action_schema.g2j.json');

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
    setUndoStack((prev) => [
      ...prev.slice(-14),
      { grammarText, dslSource, label: `Update rule ${originalName}` },
    ]);
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
    setUndoStack((prev) => [
      ...prev.slice(-14),
      { grammarText, dslSource, label: `Add rule ${res.name}` },
    ]);
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
    setUndoStack((prev) => [
      ...prev.slice(-14),
      { grammarText, dslSource, label: `Delete rule ${name}` },
    ]);
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
    setUndoStack((prev) => [
      ...prev.slice(-14),
      { grammarText, dslSource, label: 'Sort rules by precedence' },
    ]);
    setGrammarText(sorted);
    recompileFromGrammar(sorted, dialect, schemaConfig, undefined, undefined, ruleConfigs);
    showNotice('Reordered grammar rules by numeric precedence.');
  };

  const handleSyncLogicToGrammar = (statement: string, labels: LogicLabelBinding[]) => {
    setUndoStack((prev) => [
      ...prev.slice(-14),
      { grammarText, dslSource, label: 'Sync logic statement to grammar' },
    ]);
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
    setUndoStack((prev) => [...prev.slice(-14), { grammarText, dslSource, label: 'Auto-stub missing rules' }]);
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
    setUndoStack((prev) => [
      ...prev.slice(-14),
      { grammarText, dslSource, label: `Reorder ${sourceName} ${position} ${targetName}` },
    ]);
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
    setUndoStack((prev) => [
      ...prev.slice(-14),
      { grammarText, dslSource, label: `Merge ${sourceName} → ${targetName}` },
    ]);
    setGrammarText(res.grammar);
    if (evalRule === sourceName) {
      setEvalRule(targetName);
    }
    recompileFromGrammar(res.grammar, dialect, schemaConfig);
    setSyncDirection(`Rule Merge (${activeStrategy}) → JSON-LD / Python / Rust / WASM`);
    showNotice(res.summary);
  };

  const handleReorderFlows = (sourceFlowId: string, targetFlowId: string, position: 'before' | 'after') => {
    if (sourceFlowId === targetFlowId) return;
    const nextDsl = reorderDslFlows(dslSource, sourceFlowId, targetFlowId, position);
    if (nextDsl === dslSource) return;
    setUndoStack((prev) => [
      ...prev.slice(-14),
      { grammarText, dslSource, label: `Reorder workbench ${sourceFlowId}` },
    ]);
    setDslSource(nextDsl);
    setSyncDirection('DSL Carousel Reorder → OpenAPI / Flows');
    showNotice(`Reordered workbench step ${sourceFlowId} ${position} ${targetFlowId}.`);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    if (last.grammarText !== grammarText) {
      setGrammarText(last.grammarText);
      recompileFromGrammar(last.grammarText, dialect, schemaConfig);
    }
    if (last.dslSource !== dslSource) {
      setDslSource(last.dslSource);
    }
    showNotice(`Undid: ${last.label}.`);
  };

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

  const handleDialectChange = (patch: Partial<DialectConfig>) => {
    const next = { ...dialect, ...patch };
    setDialect(next);
    recompileFromGrammar(grammarText, next, schemaConfig);
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

  // Primary Language Switcher
  const handleSelectLanguage = (lang: PrimaryLanguage) => {
    setPrimaryLanguage(lang);
    setTopView('workbench');
    if (lang === 'python') {
      setActivePage('python_ast');
      showNotice('Switched primary language to Python AST workflow.');
    } else if (lang === 'rust') {
      setActivePage('rust_ast');
      showNotice('Switched primary language to Rust syn / serde AST workflow.');
    } else if (lang === 'wasm') {
      setActivePage('wasm_wabt');
      showNotice('Switched primary language to WASM / WABT workflow.');
    } else {
      setActivePage('schema');
      showNotice('Switched primary language to Schema.org JSON-LD workflow.');
    }
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
    ]
  );

  const applySnapshot = useCallback(
    (snap: WorkspaceSnapshot) => {
      if (!mutationPolicy.allowImportMutation) {
        showNotice('Import mutation is disabled by the current x-mutation-policy declaration.');
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
      showNotice(`Loaded workspace "${snap.name || 'snapshot'}".`);
    },
    [mutationPolicy.allowImportMutation, showNotice]
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
    triggerTextDownload(JSON.stringify(pkg, null, 2), filename, 'application/ld+json');
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
      setDemoFiles(next);
      saveDemoVaultToStorage(next);
      showNotice(`Saved "${normalized}" to Demo Vault.`);
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
          setDemoFiles(next);
          saveDemoVaultToStorage(next);
          setConfirmState((s) => ({ ...s, open: false }));
          showNotice(`Overwrote "${record.name}" in Demo Vault.`);
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
          setDemoFiles(next);
          saveDemoVaultToStorage(next);
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
        setUndoStack((prev) => [
          ...prev.slice(-14),
          { grammarText, dslSource, label: 'MCP pipeline reorder' },
        ]);
        setDslSource(effect.dslSource);
      }
      setSyncDirection('MCP /api/mcp/pipeline → Pipeline Grid & Breadcrumbs');
      showNotice('Applied live Pipeline MCP update to Studio Grid & Breadcrumbs.');
    },
    [dslSource, grammarText, showNotice]
  );

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
        OPENAPI_SPEC,
        parsedDsl,
        rules,
        pythonSymbols,
        rustSymbols,
        wasmResult.exports.map((e) => e.name)
      ),
    [searchQuery, parsedDsl, rules, pythonSymbols, rustSymbols, wasmResult.exports]
  );

  // Shared props for StepViews (both inline & modal)
  const stepViewProps = {
    activePage,
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
    canUndo: undoStack.length > 0,
    onUndo: handleUndo,
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setTopView('workbench')}
            className="shrink-0 whitespace-nowrap text-base font-bold tracking-tight text-slate-900 dark:text-slate-100"
          >
            Grammar2JSON Studio
          </button>

          {/* Zone 2: 5 Clean Single-Line Nav Links */}
          <nav className="hidden items-center gap-6 md:flex" aria-label="Primary sections">
            {(
              [
                ['workbench', 'Workbench'],
                ['graph', 'Rule Graph'],
                ['openapi', 'OpenAPI Spec'],
                ['dsl', 'DSL Flows'],
                ['bundle', 'Export Bundle'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTopView(id)}
                className={`shrink-0 whitespace-nowrap border-b-2 py-1 text-sm font-medium transition-colors ${
                  topView === id
                    ? 'border-blue-600 text-slate-900 dark:border-blue-400 dark:text-slate-100'
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handleDownloadProjectZip}
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Download className="h-3.5 w-3.5" />
              Download ZIP
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6">
        {/* Mobile Navigation Fallback */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:hidden">
          {(
            [
              ['workbench', 'Workbench'],
              ['graph', 'Rule Graph'],
              ['openapi', 'OpenAPI Spec'],
              ['dsl', 'DSL Flows'],
              ['bundle', 'Export Bundle'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTopView(id)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
                topView === id
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* WORKSPACE TOOLBAR: GLOBAL SEARCH, LANGUAGE SWITCHER, SAMPLES & THEME */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Search Box */}
            <div className="relative flex-1 lg:max-w-lg">
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
                placeholder="Search OpenAPI routes, DSL flows, rules, Python/Rust AST, or WASM exports..."
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
                      No OpenAPI operations, DSL flows, rules, or AST symbols match "{searchQuery}".
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

            {/* Language Switcher (JSON-LD | Python | Rust | WASM/WABT) + Quick Samples + Theme */}
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-950"
                role="group"
                aria-label="Primary language target"
              >
                {(
                  [
                    ['json', 'JSON-LD'],
                    ['python', 'Python'],
                    ['rust', 'Rust'],
                    ['wasm', 'WASM / WABT'],
                  ] as const
                ).map(([lang, label]) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => handleSelectLanguage(lang)}
                    className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      primaryLanguage === lang
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleRunPythonSample}
                className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Python Sample
              </button>
              <button
                type="button"
                onClick={handleRunRustSample}
                className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Rust Sample
              </button>
              <button
                type="button"
                onClick={handleRunWasmSample}
                className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                WASM Sample
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

          {/* Clean unboxed typographic metadata bar */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{currentFlow.id}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                Step {currentFlow.step} of {flows.length}
              </span>
              <span aria-hidden="true">·</span>
              <span>Sync: {syncDirection}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{verifiedSteps.length} verified</span>
            </div>
            <div className="flex items-center gap-3">
              {notice && (
                <div className="font-medium text-blue-600 dark:text-blue-400" role="status">
                  {notice}
                </div>
              )}
              {undoStack.length > 0 && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Undo2 className="h-3 w-3" />
                  Undo
                </button>
              )}
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

        {/* TOP VIEW ROUTER */}
        {topView === 'graph' ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <RuleDependencyGraph
              graph={ruleGraph}
              mergeStrategy={mergeStrategy}
              onMergeStrategyChange={setMergeStrategy}
              onReorderRules={handleReorderRules}
              onMergeRules={handleMergeRules}
              canUndo={undoStack.length > 0}
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
        ) : topView === 'openapi' ? (
          <OpenApiInspector
            spec={OPENAPI_SPEC}
            onJumpToPage={(page) => {
              setActivePage(page);
              setTopView('workbench');
            }}
          />
        ) : topView === 'dsl' ? (
          <DslInspector
            dslSource={dslSource}
            parsedDsl={parsedDsl}
            onChangeDsl={setDslSource}
            onResetDsl={() => {
              setDslSource(DEFAULT_DSL_SOURCE);
              showNotice('Restored default dsl/flows.dsl definition.');
            }}
            onJumpToPage={(page) => {
              setActivePage(page);
              setTopView('workbench');
            }}
          />
        ) : topView === 'bundle' ? (
          <BundleInspector
            openapi={OPENAPI_SPEC}
            dslSource={dslSource}
            snapshot={buildSnapshot()}
            onDownloadZip={handleDownloadProjectZip}
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
              onOpenMcpServer={handleOpenMcpServer}
            />

            {/* ACTIVE DSL-CONTROLLED SPLIT PAGE + BIDIRECTIONAL LIVE STATE MIRROR */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              {/* Left 7 Cols: Active Split Page */}
              <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 xl:col-span-7 dark:border-slate-800 dark:bg-slate-900">
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

                <div className="flex-1">
                  <StepViews {...stepViewProps} />
                </div>
              </section>

              {/* Right 5 Cols: Synchronized Multi-Language Live Mirror */}
              <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 xl:col-span-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3.5 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Bidirectional Live State Mirror
                  </h2>
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

                {!jsonValid && jsonError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-mono text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                    JSON syntax error: {jsonError}
                  </div>
                )}

                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <label htmlFor="mainGrammarInput" className="font-medium text-slate-700 dark:text-slate-300">
                      Active Grammar Rules ({dialect.preset})
                    </label>
                    <span className="font-mono tabular-nums text-slate-400">
                      {rules.length} rule{rules.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <textarea
                    id="mainGrammarInput"
                    rows={7}
                    value={grammarText}
                    onChange={(e) => handleGrammarEdited(e.target.value)}
                    spellCheck={false}
                    placeholder="Enter EBNF, BNF, PEG, Python, Rust, or WAT grammar rules..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-100 focus:border-blue-500 focus:outline-none dark:border-slate-800"
                  />
                </div>

                <div className="flex flex-1 flex-col">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <label htmlFor="mainJsonEditor" className="font-medium text-slate-700 dark:text-slate-300">
                      Editable Schema.org JSON-LD &amp; Generated Schema
                    </label>
                    <span className="font-mono text-slate-400">{schemaConfig.schemaOrgType}</span>
                  </div>
                  <textarea
                    id="mainJsonEditor"
                    rows={12}
                    value={jsonText}
                    onChange={(e) => handleJsonEdited(e.target.value)}
                    spellCheck={false}
                    placeholder='{ "@context": "https://schema.org" }'
                    className="min-h-[240px] w-full flex-1 rounded-lg border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs leading-relaxed text-slate-100 focus:border-blue-500 focus:outline-none dark:border-slate-800"
                  />
                </div>
              </section>
            </div>
          </>
        )}
      </main>

      {/* UNIVERSAL WORKBENCH MODAL (Selectable Structures + Hardcoded Viewport Frames) */}
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
        onClose={() => setModalOpen(false)}
      >
        <StepViews {...stepViewProps} layoutStructure={modalStructure} />
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
