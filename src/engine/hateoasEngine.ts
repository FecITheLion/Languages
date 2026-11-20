import {
  addGrammarRule,
  analyzeRuleDependencies,
  deleteGrammarRule,
  evaluateGrammarPayload,
  exportWorkspaceInLanguage,
  grammarToSchemaJson,
  inferLineMutations,
  inferRuleOrderConfigs,
  parseGrammar,
  updateGrammarRule,
} from './bidirectionalEngine.ts';
import {
  DEFAULT_GLOBAL_CALLBACKS,
  removeGlobalCallback,
  upsertGlobalCallback,
  type GlobalCallbackDef,
} from './globalCallbacksEngine.ts';
import {
  buildHistologIndex,
  createHistologEntry,
  diffHistologSnapshots,
  type HistologEntry,
  type HistologSnapshotState,
} from './histologEngine.ts';
import {
  CAUCHY_SEQUENCE_PRESETS,
  evaluateCauchySequence,
  evaluateLogicStatement,
  exportLogicStatement,
  LOGIC_CALCULATOR_PRESETS,
  type CauchySequenceConfig,
  type LogicExportTarget,
  type LogicLabelBinding,
} from './logicLambdaEngine.ts';
import { DEFAULT_DSL_SOURCE, DEFAULT_GRAMMAR_SYMBOLS, DIALECT_PRESETS } from '../data/openapiAndDsl.ts';
import {
  SUPPORTED_LANGUAGES,
  type DialectConfig,
  type EngineSectionKey,
  type ExportLanguage,
  type GrammarSymbolDefinitions,
  type LineMutation,
  type MutationPolicy,
  type RuleOrderConfig,
  type SchemaConfig,
} from '../types/studio.ts';

export interface HateoasLink {
  href: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  title?: string;
  type?: string;
  templated?: boolean;
}

export interface HateoasAction {
  name: string;
  title: string;
  href: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  contentType?: string;
  fields?: Array<{
    name: string;
    type: string;
    required?: boolean;
    example?: unknown;
  }>;
}

export interface NodeMemberDescriptor {
  name: string;
  value: unknown;
  valueType: string;
  mutable: boolean;
  readOnlyReason?: string;
  allowedMethods: Array<'GET' | 'HEAD' | 'OPTIONS' | 'PUT' | 'PATCH' | 'DELETE'>;
  _links: Record<string, HateoasLink>;
  _actions: Record<string, HateoasAction>;
}

export interface AddressableNode {
  kind: 'rule' | 'dialect' | 'symbol' | 'mutation' | 'logic' | 'label' | 'callback' | 'cauchy' | 'histolog' | 'workspace' | 'language';
  id: string;
  label: string;
  href: string;
  mutableCount: number;
  immutableCount: number;
  members: Record<string, NodeMemberDescriptor>;
  _links: Record<string, HateoasLink>;
  _actions: Record<string, HateoasAction>;
}

export interface StoredWorkspace {
  id: string;
  name: string;
  updatedAt: string;
  dialect: DialectConfig;
  schemaConfig: SchemaConfig;
  mutationPolicy: MutationPolicy;
  grammarText: string;
  mutations: Record<string, LineMutation>;
  ruleConfigs: Record<string, RuleOrderConfig>;
  evalRule: string;
  evalPayload: string;
  logicStatement: string;
  logicLabels: LogicLabelBinding[];
  cauchyConfig: CauchySequenceConfig;
  dslSource: string;
}

export function formatRfc8288LinkHeader(links: Record<string, HateoasLink>): string {
  return Object.entries(links)
    .slice(0, 12)
    .map(([rel, l]) => `<${l.href}>; rel="${rel}"${l.title ? `; title="${l.title.replace(/"/g, "'")}"` : ''}`)
    .join(', ');
}

export function buildMemberDescriptor(
  nodeHref: string,
  memberName: string,
  value: unknown,
  mutable: boolean,
  readOnlyReason?: string
): NodeMemberDescriptor {
  const encoded = encodeURIComponent(memberName);
  const memberHref = `${nodeHref}/members/${encoded}`;
  const allowedMethods: NodeMemberDescriptor['allowedMethods'] = mutable
    ? ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']
    : ['GET', 'HEAD', 'OPTIONS'];

  const links: Record<string, HateoasLink> = {
    self: { href: memberHref, method: 'GET', title: `Read member '${memberName}'`, type: 'application/hal+json' },
    node: { href: nodeHref, method: 'GET', title: 'Parent node' },
    members: { href: `${nodeHref}/members`, method: 'GET', title: 'All node members' },
  };
  if (mutable) {
    links.update = { href: memberHref, method: 'PATCH', title: `Patch member '${memberName}'` };
    links.replace = { href: memberHref, method: 'PUT', title: `Replace member '${memberName}'` };
    links.reset = { href: memberHref, method: 'DELETE', title: `Reset/clear member '${memberName}'` };
  }

  const actions: Record<string, HateoasAction> = {};
  if (mutable) {
    actions.update = {
      name: 'update',
      title: `Update ${memberName}`,
      href: memberHref,
      method: 'PATCH',
      contentType: 'application/json',
      fields: [{ name: 'value', type: typeof value, required: true, example: value }],
    };
    actions.replace = {
      name: 'replace',
      title: `Replace ${memberName}`,
      href: memberHref,
      method: 'PUT',
      contentType: 'application/json',
      fields: [{ name: 'value', type: typeof value, required: true, example: value }],
    };
    actions.reset = {
      name: 'reset',
      title: `Clear/Reset ${memberName}`,
      href: memberHref,
      method: 'DELETE',
    };
  }

  return {
    name: memberName,
    value,
    valueType: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value,
    mutable,
    ...(readOnlyReason ? { readOnlyReason } : {}),
    allowedMethods,
    _links: links,
    _actions: actions,
  };
}

/**
 * Server-side stateful REST/CRUD/HATEOAS Engine Store (used by server.ts).
 */
export class RestHateoasEngineStore {
  public workspace: StoredWorkspace;
  public workspaces: Map<string, StoredWorkspace> = new Map();
  public callbacks: GlobalCallbackDef[];
  public histolog: HistologEntry[] = [];

  constructor() {
    const preset = DIALECT_PRESETS.ebnf;
    const initRules = parseGrammar(preset.sampleGrammar, preset.config);
    this.workspace = {
      id: 'default',
      name: 'OrderActionGrammar',
      updatedAt: new Date().toISOString(),
      dialect: { ...preset.config, symbols: { ...DEFAULT_GRAMMAR_SYMBOLS, ...(preset.config.symbols || {}) } },
      schemaConfig: {
        preset: 'hybrid',
        schemaOrgType: 'DefinedTermSet',
        schemaName: 'OrderActionGrammar',
        schemaStoreDraft: 'https://json-schema.org/draft/2020-12/schema',
        includeJsonSchemaDefs: true,
        includePotentialActions: true,
      },
      mutationPolicy: {
        allowImportMutation: true,
        allowExportMutation: true,
        allowedTargets: ['jsonld', 'python', 'rust', 'wasm'],
        lockedRules: [],
      },
      grammarText: preset.sampleGrammar,
      mutations: inferLineMutations(initRules),
      ruleConfigs: inferRuleOrderConfigs(initRules),
      evalRule: preset.sampleRule,
      evalPayload: preset.samplePayload,
      logicStatement: LOGIC_CALCULATOR_PRESETS[0].statement,
      logicLabels: LOGIC_CALCULATOR_PRESETS[0].labels.map((l) => ({ ...l })),
      cauchyConfig: { ...CAUCHY_SEQUENCE_PRESETS[0].config },
      dslSource: DEFAULT_DSL_SOURCE,
    };
    this.workspaces.set('default', this.workspace);
    this.callbacks = DEFAULT_GLOBAL_CALLBACKS.map((c) => ({ ...c }));
    this.recordHistolog('init', 'Initial REST/HATEOAS workspace');
  }

  public getRules() {
    return parseGrammar(this.workspace.grammarText, this.workspace.dialect);
  }

  public getGraph() {
    return analyzeRuleDependencies(
      this.getRules(),
      this.workspace.grammarText,
      this.workspace.dialect,
      this.workspace.mutationPolicy.lockedRules
    );
  }

  public buildJsonLd(): string {
    return grammarToSchemaJson(
      this.getRules(),
      this.workspace.dialect,
      this.workspace.schemaConfig,
      this.workspace.mutations,
      this.workspace.mutationPolicy,
      this.workspace.ruleConfigs
    );
  }

  public buildSnapshotState(): HistologSnapshotState {
    const rules = this.getRules();
    const jsonText = this.buildJsonLd();
    return {
      grammarText: this.workspace.grammarText,
      dialect: { ...this.workspace.dialect, symbols: { ...(this.workspace.dialect.symbols || {}) } },
      jsonText,
      mutations: { ...this.workspace.mutations },
      ruleConfigs: { ...this.workspace.ruleConfigs },
      evalRule: this.workspace.evalRule,
      evalPayload: this.workspace.evalPayload,
      logicStatement: this.workspace.logicStatement,
      logicLabels: this.workspace.logicLabels.map((l) => ({ ...l })),
      dslSource: this.workspace.dslSource,
      pythonSource: exportWorkspaceInLanguage('python', {
        rules,
        dialect: this.workspace.dialect,
        schemaConfig: this.workspace.schemaConfig,
        mutations: this.workspace.mutations,
        mutationPolicy: this.workspace.mutationPolicy,
        ruleConfigs: this.workspace.ruleConfigs,
        grammarText: this.workspace.grammarText,
        jsonText,
        watSource: '',
      }).content,
      rustSource: exportWorkspaceInLanguage('rust', {
        rules,
        dialect: this.workspace.dialect,
        schemaConfig: this.workspace.schemaConfig,
        mutations: this.workspace.mutations,
        mutationPolicy: this.workspace.mutationPolicy,
        ruleConfigs: this.workspace.ruleConfigs,
        grammarText: this.workspace.grammarText,
        jsonText,
        watSource: '',
      }).content,
      watSource: exportWorkspaceInLanguage('wat', {
        rules,
        dialect: this.workspace.dialect,
        schemaConfig: this.workspace.schemaConfig,
        mutations: this.workspace.mutations,
        mutationPolicy: this.workspace.mutationPolicy,
        ruleConfigs: this.workspace.ruleConfigs,
        grammarText: this.workspace.grammarText,
        jsonText,
        watSource: '',
      }).content,
    };
  }

  public recordHistolog(source: string, summary?: string): HistologEntry {
    const prev = this.histolog.length > 0 ? this.histolog[this.histolog.length - 1] : null;
    const entry = createHistologEntry({
      generation: prev ? prev.generation + 1 : 0,
      parentGeneration: prev ? prev.generation : null,
      source,
      summary: summary || `${source} update`,
      snapshot: this.buildSnapshotState(),
      previousSnapshot: prev ? prev.snapshot : null,
    });
    if (!prev || prev.fingerprint !== entry.fingerprint) {
      this.histolog.push(entry);
      if (this.histolog.length > 60) {
        this.histolog = this.histolog.slice(-60);
      }
      return entry;
    }
    return prev;
  }

  public syncFromMcpPatch(patch: Record<string, unknown>): void {
    if (typeof patch.grammarText === 'string') this.workspace.grammarText = patch.grammarText;
    if (patch.dialect && typeof patch.dialect === 'object') {
      this.workspace.dialect = patch.dialect as DialectConfig;
    }
    if (patch.schemaConfig && typeof patch.schemaConfig === 'object') {
      this.workspace.schemaConfig = patch.schemaConfig as SchemaConfig;
    }
    if (patch.mutationPolicy && typeof patch.mutationPolicy === 'object') {
      this.workspace.mutationPolicy = patch.mutationPolicy as MutationPolicy;
    }
    if (patch.mutations && typeof patch.mutations === 'object') {
      this.workspace.mutations = patch.mutations as Record<string, LineMutation>;
    }
    if (patch.ruleConfigs && typeof patch.ruleConfigs === 'object') {
      this.workspace.ruleConfigs = patch.ruleConfigs as Record<string, RuleOrderConfig>;
    }
    if (typeof patch.evalRule === 'string') this.workspace.evalRule = patch.evalRule;
    if (typeof patch.evalPayload === 'string') this.workspace.evalPayload = patch.evalPayload;
    if (typeof patch.logicStatement === 'string') this.workspace.logicStatement = patch.logicStatement;
    if (Array.isArray(patch.logicLabels)) this.workspace.logicLabels = patch.logicLabels as LogicLabelBinding[];
    if (typeof patch.dslSource === 'string') this.workspace.dslSource = patch.dslSource;
    this.workspace.updatedAt = new Date().toISOString();
    this.recordHistolog('studio_sync', 'Synced workspace from Studio');
  }

  public buildRootDocument(origin = '') {
    const _links: Record<string, HateoasLink> = {
      self: { href: `${origin}/api`, method: 'GET', title: 'API Root (HATEOAS Discovery)', type: 'application/hal+json' },
      nodes: { href: `${origin}/api/nodes`, method: 'GET', title: 'All Addressable Nodes & Mutable/Immutable Members' },
      rules: { href: `${origin}/api/rules`, method: 'GET', title: 'Grammar Rules CRUD Collection' },
      symbols: { href: `${origin}/api/symbols`, method: 'GET', title: 'Extended DAG Symbol Definitions CRUD' },
      callbacks: { href: `${origin}/api/callbacks`, method: 'GET', title: 'Global Lambda Callbacks CRUD' },
      logic: { href: `${origin}/api/logic`, method: 'GET', title: 'Logic, Labeled Arithmetic & Cauchy Engine' },
      logicLabels: { href: `${origin}/api/logic/labels`, method: 'GET', title: 'Logic Labels CRUD Collection' },
      histolog: { href: `${origin}/api/histolog`, method: 'GET', title: 'Generational Histolog & Historical Diff' },
      workspaces: { href: `${origin}/api/workspaces`, method: 'GET', title: 'Workspaces CRUD Collection' },
      languages: { href: `${origin}/api/languages`, method: 'GET', title: 'Supported Target Languages (12)' },
      exportTemplate: { href: `${origin}/api/export/{language}`, method: 'GET', templated: true, title: 'Export Workspace in Target Language' },
      logicExportTemplate: { href: `${origin}/api/logic/export/{language}`, method: 'GET', templated: true, title: 'Export Logic/Cauchy in Target Language' },
      mcpServers: { href: `${origin}/api/mcp/servers`, method: 'GET', title: '11 Lazy MCP Tool Servers' },
    };

    const _actions: Record<string, HateoasAction> = {
      createRule: {
        name: 'createRule',
        title: 'Create Grammar Rule',
        href: `${origin}/api/rules`,
        method: 'POST',
        contentType: 'application/json',
        fields: [
          { name: 'name', type: 'string', required: true, example: 'discount_code' },
          { name: 'expression', type: 'string', required: true, example: "'SAVE-' digit+" },
        ],
      },
      evaluatePayload: {
        name: 'evaluatePayload',
        title: 'Evaluate Grammar Payload',
        href: `${origin}/api/evaluate`,
        method: 'POST',
        contentType: 'application/json',
        fields: [
          { name: 'rule', type: 'string', required: false, example: this.workspace.evalRule },
          { name: 'payload', type: 'string', required: true, example: this.workspace.evalPayload },
        ],
      },
      evaluateCauchy: {
        name: 'evaluateCauchy',
        title: 'Evaluate Cauchy Sequence',
        href: `${origin}/api/logic/cauchy`,
        method: 'POST',
        contentType: 'application/json',
        fields: [
          { name: 'paramStyle', type: 'string', required: false, example: 'directional' },
          { name: 'seedValues', type: 'string', required: true, example: '0, 1' },
          { name: 'recurrenceExpr', type: 'string', required: true, example: '(left + right) / 2' },
          { name: 'maxIterations', type: 'number', required: false, example: 24 },
          { name: 'epsilon', type: 'number', required: false, example: 0.0001 },
        ],
      },
      clearEngineOrSection: {
        name: 'clearEngineOrSection',
        title: 'Clear Entire Engine or Individual Section',
        href: `${origin}/api/engine/clear`,
        method: 'POST',
        contentType: 'application/json',
        fields: [{ name: 'section', type: 'string', required: true, example: 'grammar' }],
      },
    };

    const rules = this.getRules();
    return {
      service: 'Grammar2JSON Studio REST/CRUD/HATEOAS API',
      version: '2.4.0',
      mediaType: 'application/hal+json',
      hateoas: true,
      summary: {
        ruleCount: rules.length,
        callbackCount: this.callbacks.length,
        histologGenerations: this.histolog.length,
        supportedLanguageCount: SUPPORTED_LANGUAGES.length,
        workspaceCount: this.workspaces.size,
      },
      _links,
      _actions,
    };
  }

  public listAddressableNodes(origin = ''): AddressableNode[] {
    const nodes: AddressableNode[] = [];
    const rules = this.getRules();
    const graph = this.getGraph();

    // 1. Rule nodes (every mutable & non-mutable member addressable!)
    for (const rule of rules) {
      const nodeHref = `${origin}/api/nodes/rule/${encodeURIComponent(rule.name)}`;
      const graphNode = graph.nodes.find((n) => n.name === rule.name);
      const cfg = this.workspace.ruleConfigs[rule.name] || { precedence: rule.lineNumber, associativity: 'left', properties: [] };
      const mut = this.workspace.mutations[rule.name] || null;
      const isLocked = this.workspace.mutationPolicy.lockedRules.includes(rule.name);

      const members: Record<string, NodeMemberDescriptor> = {
        // Mutable members
        expression: buildMemberDescriptor(nodeHref, 'expression', rule.expression, !isLocked, isLocked ? 'Locked by x-mutation-policy' : undefined),
        precedence: buildMemberDescriptor(nodeHref, 'precedence', cfg.precedence, !isLocked, isLocked ? 'Locked by x-mutation-policy' : undefined),
        associativity: buildMemberDescriptor(nodeHref, 'associativity', cfg.associativity, !isLocked, isLocked ? 'Locked by x-mutation-policy' : undefined),
        properties: buildMemberDescriptor(nodeHref, 'properties', cfg.properties, !isLocked, isLocked ? 'Locked by x-mutation-policy' : undefined),
        mutation: buildMemberDescriptor(nodeHref, 'mutation', mut, !isLocked, isLocked ? 'Locked by x-mutation-policy' : undefined),
        locked: buildMemberDescriptor(nodeHref, 'locked', isLocked, true),
        // Non-mutable (computed/structural) members
        id: buildMemberDescriptor(nodeHref, 'id', rule.id, false, 'Immutable structural rule identifier'),
        name: buildMemberDescriptor(nodeHref, 'name', rule.name, false, 'Use PUT /api/rules/:name with nextName to rename'),
        lineNumber: buildMemberDescriptor(nodeHref, 'lineNumber', rule.lineNumber, false, 'Derived from grammar source line index'),
        alternatives: buildMemberDescriptor(nodeHref, 'alternatives', rule.alternatives, false, 'Computed from expression AST'),
        referencedRules: buildMemberDescriptor(nodeHref, 'referencedRules', rule.referencedRules, false, 'Computed DAG out-edges'),
        undefinedReferences: buildMemberDescriptor(nodeHref, 'undefinedReferences', rule.undefinedReferences, false, 'Computed DAG diagnostic'),
        literals: buildMemberDescriptor(nodeHref, 'literals', rule.literals, false, 'Extracted terminal literals'),
        usedOperators: buildMemberDescriptor(nodeHref, 'usedOperators', graphNode?.usedOperators || [], false, 'Detected Extended DAG operator symbols'),
        inDegree: buildMemberDescriptor(nodeHref, 'inDegree', graphNode?.inDegree ?? 0, false, 'Computed DAG in-degree'),
        outDegree: buildMemberDescriptor(nodeHref, 'outDegree', graphNode?.outDegree ?? 0, false, 'Computed DAG out-degree'),
        rawLine: buildMemberDescriptor(nodeHref, 'rawLine', rule.rawLine, false, 'Derived source line'),
      };

      const mutableCount = Object.values(members).filter((m) => m.mutable).length;
      const immutableCount = Object.values(members).length - mutableCount;

      nodes.push({
        kind: 'rule',
        id: rule.name,
        label: `<${rule.name}>`,
        href: nodeHref,
        mutableCount,
        immutableCount,
        members,
        _links: {
          self: { href: nodeHref, method: 'GET', title: `Inspect rule node <${rule.name}>` },
          members: { href: `${nodeHref}/members`, method: 'GET', title: 'All mutable & immutable members' },
          ruleResource: { href: `${origin}/api/rules/${encodeURIComponent(rule.name)}`, method: 'GET', title: 'Rule CRUD resource' },
          evaluate: { href: `${origin}/api/evaluate`, method: 'POST', title: `Evaluate payload starting at <${rule.name}>` },
          collection: { href: `${origin}/api/nodes`, method: 'GET', title: 'All addressable nodes' },
        },
        _actions: {
          patchExpression: {
            name: 'patchExpression',
            title: `Update <${rule.name}> expression`,
            href: `${nodeHref}/members/expression`,
            method: 'PATCH',
            contentType: 'application/json',
            fields: [{ name: 'value', type: 'string', required: true, example: rule.expression }],
          },
          deleteRule: {
            name: 'deleteRule',
            title: `Delete rule <${rule.name}>`,
            href: `${origin}/api/rules/${encodeURIComponent(rule.name)}`,
            method: 'DELETE',
          },
        },
      });
    }

    // 2. Dialect & Extended DAG Symbol nodes
    const dialectHref = `${origin}/api/nodes/dialect/active`;
    const dialectMembers: Record<string, NodeMemberDescriptor> = {
      preset: buildMemberDescriptor(dialectHref, 'preset', this.workspace.dialect.preset, true),
      ruleOperator: buildMemberDescriptor(dialectHref, 'ruleOperator', this.workspace.dialect.ruleOperator, true),
      choiceDelimiter: buildMemberDescriptor(dialectHref, 'choiceDelimiter', this.workspace.dialect.choiceDelimiter, true),
      commentPrefix: buildMemberDescriptor(dialectHref, 'commentPrefix', this.workspace.dialect.commentPrefix, true),
      symbols: buildMemberDescriptor(dialectHref, 'symbols', this.workspace.dialect.symbols || {}, true),
      enabledSymbolCount: buildMemberDescriptor(
        dialectHref,
        'enabledSymbolCount',
        (graph.symbolRegistry ?? []).filter((s) => s.enabled).length,
        false,
        'Computed count of enabled Extended DAG symbols'
      ),
    };
    nodes.push({
      kind: 'dialect',
      id: 'active',
      label: `Dialect (${this.workspace.dialect.preset})`,
      href: dialectHref,
      mutableCount: 5,
      immutableCount: 1,
      members: dialectMembers,
      _links: {
        self: { href: dialectHref, method: 'GET', title: 'Active Dialect Node' },
        members: { href: `${dialectHref}/members`, method: 'GET' },
        symbols: { href: `${origin}/api/symbols`, method: 'GET', title: 'Extended DAG Symbols' },
      },
      _actions: {
        updateRuleOperator: {
          name: 'updateRuleOperator',
          title: 'Update Rule Operator',
          href: `${dialectHref}/members/ruleOperator`,
          method: 'PATCH',
          contentType: 'application/json',
          fields: [{ name: 'value', type: 'string', required: true, example: this.workspace.dialect.ruleOperator }],
        },
      },
    });

    for (const sym of graph.symbolRegistry ?? []) {
      const symHref = `${origin}/api/nodes/symbol/${encodeURIComponent(sym.key)}`;
      const members: Record<string, NodeMemberDescriptor> = {
        value: buildMemberDescriptor(symHref, 'value', sym.value, true),
        key: buildMemberDescriptor(symHref, 'key', sym.key, false, 'Immutable symbol registry key'),
        label: buildMemberDescriptor(symHref, 'label', sym.label, false, 'Immutable symbol specification label'),
        enabled: buildMemberDescriptor(symHref, 'enabled', sym.enabled, false, 'Derived from non-empty symbol value'),
        usageCount: buildMemberDescriptor(symHref, 'usageCount', sym.usageCount, false, 'Computed Extended DAG usage count'),
      };
      nodes.push({
        kind: 'symbol',
        id: sym.key,
        label: `Symbol: ${sym.label}`,
        href: symHref,
        mutableCount: 1,
        immutableCount: 4,
        members,
        _links: {
          self: { href: symHref, method: 'GET' },
          members: { href: `${symHref}/members`, method: 'GET' },
          collection: { href: `${origin}/api/symbols`, method: 'GET' },
        },
        _actions: {
          setSymbolValue: {
            name: 'setSymbolValue',
            title: `Set or Disable ${sym.key} (empty string disables)`,
            href: `${symHref}/members/value`,
            method: 'PATCH',
            contentType: 'application/json',
            fields: [{ name: 'value', type: 'string', required: true, example: sym.value }],
          },
        },
      });
    }

    // 3. Logic & Cauchy node
    const logicHref = `${origin}/api/nodes/logic/active`;
    const logicEval = evaluateLogicStatement(this.workspace.logicStatement, this.workspace.logicLabels);
    const cauchyEval = evaluateCauchySequence(this.workspace.cauchyConfig, this.workspace.logicLabels);
    const logicMembers: Record<string, NodeMemberDescriptor> = {
      statement: buildMemberDescriptor(logicHref, 'statement', this.workspace.logicStatement, true),
      labels: buildMemberDescriptor(logicHref, 'labels', this.workspace.logicLabels, true),
      cauchyConfig: buildMemberDescriptor(logicHref, 'cauchyConfig', this.workspace.cauchyConfig, true),
      evaluatedValue: buildMemberDescriptor(logicHref, 'evaluatedValue', logicEval.displayValue, false, 'Computed evaluation result'),
      valueType: buildMemberDescriptor(logicHref, 'valueType', logicEval.valueType, false, 'Computed evaluation type'),
      cauchyConverged: buildMemberDescriptor(logicHref, 'cauchyConverged', cauchyEval.converged, false, 'Computed Cauchy convergence verdict'),
      cauchyLimit: buildMemberDescriptor(logicHref, 'cauchyLimit', cauchyEval.limitEstimate, false, 'Computed Cauchy limit estimate'),
      cauchyIndexN: buildMemberDescriptor(logicHref, 'cauchyIndexN', cauchyEval.cauchyIndexN, false, 'Computed Cauchy index N(ε)'),
    };
    nodes.push({
      kind: 'logic',
      id: 'active',
      label: 'Logic, Lambda & Cauchy Engine',
      href: logicHref,
      mutableCount: 3,
      immutableCount: 5,
      members: logicMembers,
      _links: {
        self: { href: logicHref, method: 'GET' },
        members: { href: `${logicHref}/members`, method: 'GET' },
        logicResource: { href: `${origin}/api/logic`, method: 'GET' },
        evaluateCauchy: { href: `${origin}/api/logic/cauchy`, method: 'POST' },
      },
      _actions: {
        updateStatement: {
          name: 'updateStatement',
          title: 'Update LOGIC_STATEMENT',
          href: `${logicHref}/members/statement`,
          method: 'PATCH',
          contentType: 'application/json',
          fields: [{ name: 'value', type: 'string', required: true, example: this.workspace.logicStatement }],
        },
      },
    });

    // 4. Global Callback nodes
    for (const cb of this.callbacks) {
      const cbHref = `${origin}/api/nodes/callback/${encodeURIComponent(cb.id)}`;
      const cbSig = `${cb.name}(${cb.params.join(', ')})`;
      const members: Record<string, NodeMemberDescriptor> = {
        name: buildMemberDescriptor(cbHref, 'name', cb.name, true),
        lambdaExpr: buildMemberDescriptor(cbHref, 'lambdaExpr', cb.lambdaExpr, true),
        description: buildMemberDescriptor(cbHref, 'description', cb.description, true),
        id: buildMemberDescriptor(cbHref, 'id', cb.id, false, 'Immutable callback identifier'),
        params: buildMemberDescriptor(cbHref, 'params', cb.params, false, 'Parsed from lambdaExpr'),
        signature: buildMemberDescriptor(cbHref, 'signature', cbSig, false, 'Derived from name and params'),
        savedAt: buildMemberDescriptor(cbHref, 'savedAt', cb.savedAt, false, 'System-managed timestamp'),
      };
      nodes.push({
        kind: 'callback',
        id: cb.id,
        label: `λ ${cbSig}`,
        href: cbHref,
        mutableCount: 3,
        immutableCount: 4,
        members,
        _links: {
          self: { href: cbHref, method: 'GET' },
          members: { href: `${cbHref}/members`, method: 'GET' },
          callbackResource: { href: `${origin}/api/callbacks/${encodeURIComponent(cb.id)}`, method: 'GET' },
        },
        _actions: {
          updateLambdaExpr: {
            name: 'updateLambdaExpr',
            title: `Update ${cb.name} lambdaExpr`,
            href: `${cbHref}/members/lambdaExpr`,
            method: 'PATCH',
            contentType: 'application/json',
            fields: [{ name: 'value', type: 'string', required: true, example: cb.lambdaExpr }],
          },
          deleteCallback: {
            name: 'deleteCallback',
            title: `Delete ${cb.name}`,
            href: `${origin}/api/callbacks/${encodeURIComponent(cb.id)}`,
            method: 'DELETE',
          },
        },
      });
    }

    // 5. Histolog generation nodes (non-mutable historical records with restore actions)
    for (const entry of this.histolog.slice(-8)) {
      const genHref = `${origin}/api/nodes/histolog/${entry.generation}`;
      const members: Record<string, NodeMemberDescriptor> = {
        summary: buildMemberDescriptor(genHref, 'summary', entry.summary, true),
        generation: buildMemberDescriptor(genHref, 'generation', entry.generation, false, 'Immutable generation index'),
        fingerprint: buildMemberDescriptor(genHref, 'fingerprint', entry.fingerprint, false, 'Immutable FNV-1a snapshot hash'),
        timestamp: buildMemberDescriptor(genHref, 'timestamp', entry.timestamp, false, 'Immutable creation timestamp'),
        changedFields: buildMemberDescriptor(genHref, 'changedFields', entry.changedFields, false, 'Computed diff fields'),
        touchedSymbols: buildMemberDescriptor(genHref, 'touchedSymbols', entry.touchedSymbols, false, 'Computed symbol index'),
      };
      nodes.push({
        kind: 'histolog',
        id: String(entry.generation),
        label: `Gen G${entry.generation}: ${entry.summary}`,
        href: genHref,
        mutableCount: 1,
        immutableCount: 5,
        members,
        _links: {
          self: { href: genHref, method: 'GET' },
          members: { href: `${genHref}/members`, method: 'GET' },
          restore: { href: `${origin}/api/histolog/${entry.generation}/restore`, method: 'POST' },
        },
        _actions: {
          restoreGeneration: {
            name: 'restoreGeneration',
            title: `Restore Engine or Section to G${entry.generation}`,
            href: `${origin}/api/histolog/${entry.generation}/restore`,
            method: 'POST',
            contentType: 'application/json',
            fields: [{ name: 'section', type: 'string', required: false, example: 'all' }],
          },
        },
      });
    }

    return nodes;
  }

  public getAddressableNode(kind: string, nodeId: string, origin = ''): AddressableNode | null {
    return this.listAddressableNodes(origin).find((n) => n.kind === kind && n.id === nodeId) || null;
  }

  public mutateNodeMember(
    kind: string,
    nodeId: string,
    memberName: string,
    mode: 'update' | 'delete',
    value: unknown,
    origin = ''
  ):
    | { status: 200; body: Record<string, unknown> }
    | { status: 400 | 404 | 405 | 423; allow?: string; body: Record<string, unknown> } {
    const node = this.getAddressableNode(kind, nodeId, origin);
    if (!node) {
      return {
        status: 404,
        body: {
          error: `Node '${kind}/${nodeId}' not found.`,
          _links: { nodes: { href: `${origin}/api/nodes`, method: 'GET' } },
        },
      };
    }

    const member = node.members[memberName];
    if (!member) {
      return {
        status: 404,
        body: {
          error: `Member '${memberName}' does not exist on node '${kind}/${nodeId}'.`,
          availableMembers: Object.keys(node.members),
          _links: { node: { href: node.href, method: 'GET' }, members: { href: `${node.href}/members`, method: 'GET' } },
        },
      };
    }

    if (!member.mutable) {
      const isPolicyLock = member.readOnlyReason?.includes('x-mutation-policy');
      return {
        status: isPolicyLock ? 423 : 405,
        allow: 'GET, HEAD, OPTIONS',
        body: {
          error: `Member '${memberName}' on '${kind}/${nodeId}' is non-mutable (${member.readOnlyReason || 'read-only'}).`,
          mutable: false,
          allowedMethods: member.allowedMethods,
          _links: member._links,
        },
      };
    }

    // Apply mutation by kind & member
    if (kind === 'rule') {
      const rules = this.getRules();
      if (memberName === 'expression') {
        const nextExpr = mode === 'delete' ? "''" : String(value ?? '');
        const res = updateGrammarRule(this.workspace.grammarText, rules, nodeId, { expression: nextExpr }, this.workspace.dialect);
        if (!res.ok) return { status: 400, body: { error: res.error, _links: member._links } };
        this.workspace.grammarText = res.grammar;
      } else if (memberName === 'precedence') {
        const prevCfg = this.workspace.ruleConfigs[nodeId] || { precedence: 1, associativity: 'left', properties: [] };
        this.workspace.ruleConfigs[nodeId] = {
          ...prevCfg,
          precedence: mode === 'delete' ? 1 : Math.max(1, Number(value) || 1),
        };
      } else if (memberName === 'associativity') {
        const prevCfg = this.workspace.ruleConfigs[nodeId] || { precedence: 1, associativity: 'left', properties: [] };
        const assoc = mode === 'delete' ? 'left' : value === 'right' || value === 'none' ? value : 'left';
        this.workspace.ruleConfigs[nodeId] = { ...prevCfg, associativity: assoc };
      } else if (memberName === 'properties') {
        const prevCfg = this.workspace.ruleConfigs[nodeId] || { precedence: 1, associativity: 'left', properties: [] };
        this.workspace.ruleConfigs[nodeId] = {
          ...prevCfg,
          properties: mode === 'delete' ? [] : Array.isArray(value) ? value : prevCfg.properties,
        };
      } else if (memberName === 'mutation') {
        if (mode === 'delete') {
          delete this.workspace.mutations[nodeId];
        } else if (value && typeof value === 'object') {
          this.workspace.mutations[nodeId] = {
            ...(this.workspace.mutations[nodeId] || {
              ruleName: nodeId,
              targetProperty: nodeId,
              jsonType: 'string',
              patternOverride: '',
              description: `Rule ${nodeId}`,
              enabled: true,
            }),
            ...(value as Partial<LineMutation>),
          };
        }
      } else if (memberName === 'locked') {
        const shouldLock = mode === 'delete' ? false : Boolean(value);
        const set = new Set(this.workspace.mutationPolicy.lockedRules);
        if (shouldLock) set.add(nodeId);
        else set.delete(nodeId);
        this.workspace.mutationPolicy = { ...this.workspace.mutationPolicy, lockedRules: Array.from(set) };
      }
      this.recordHistolog('rest_node_member', `${mode === 'delete' ? 'Reset' : 'Updated'} rule.${nodeId}.${memberName}`);
    } else if (kind === 'dialect') {
      if (memberName === 'ruleOperator') {
        this.workspace.dialect = { ...this.workspace.dialect, ruleOperator: mode === 'delete' ? '' : String(value ?? '') };
      } else if (memberName === 'choiceDelimiter') {
        this.workspace.dialect = { ...this.workspace.dialect, choiceDelimiter: mode === 'delete' ? '|' : String(value ?? '|') };
      } else if (memberName === 'commentPrefix') {
        this.workspace.dialect = { ...this.workspace.dialect, commentPrefix: mode === 'delete' ? '//' : String(value ?? '//') };
      } else if (memberName === 'preset') {
        const presetKey = String(value ?? 'ebnf') as keyof typeof DIALECT_PRESETS;
        if (DIALECT_PRESETS[presetKey]) {
          this.workspace.dialect = { ...DIALECT_PRESETS[presetKey].config };
        }
      } else if (memberName === 'symbols') {
        this.workspace.dialect = {
          ...this.workspace.dialect,
          symbols: mode === 'delete' ? {} : ((value && typeof value === 'object' ? value : {}) as GrammarSymbolDefinitions),
        };
      }
      this.recordHistolog('rest_node_member', `Updated dialect.${memberName}`);
    } else if (kind === 'symbol') {
      const symKey = nodeId as keyof GrammarSymbolDefinitions;
      const nextSymbols: GrammarSymbolDefinitions = {
        ...DEFAULT_GRAMMAR_SYMBOLS,
        ...(this.workspace.dialect.symbols || {}),
        [symKey]: mode === 'delete' ? '' : String(value ?? ''),
      };
      this.workspace.dialect = { ...this.workspace.dialect, symbols: nextSymbols };
      this.recordHistolog('rest_node_member', `${mode === 'delete' ? 'Disabled' : 'Updated'} symbol.${symKey}`);
    } else if (kind === 'logic') {
      if (memberName === 'statement') {
        this.workspace.logicStatement = mode === 'delete' ? '' : String(value ?? '');
      } else if (memberName === 'labels') {
        this.workspace.logicLabels = mode === 'delete' ? [] : Array.isArray(value) ? (value as LogicLabelBinding[]) : this.workspace.logicLabels;
      } else if (memberName === 'cauchyConfig') {
        this.workspace.cauchyConfig =
          mode === 'delete'
            ? { ...CAUCHY_SEQUENCE_PRESETS[0].config, enabled: false }
            : { ...this.workspace.cauchyConfig, ...(value && typeof value === 'object' ? (value as Partial<CauchySequenceConfig>) : {}) };
      }
      this.recordHistolog('rest_node_member', `Updated logic.${memberName}`);
    } else if (kind === 'callback') {
      const existing = this.callbacks.find((c) => c.id === nodeId || c.name === nodeId);
      if (!existing) return { status: 404, body: { error: `Callback '${nodeId}' not found.` } };
      const nextName = memberName === 'name' ? String(value ?? existing.name) : existing.name;
      const nextExpr = memberName === 'lambdaExpr' ? (mode === 'delete' ? 'λx. x' : String(value ?? existing.lambdaExpr)) : existing.lambdaExpr;
      const nextDesc = memberName === 'description' ? (mode === 'delete' ? '' : String(value ?? '')) : existing.description;
      this.callbacks = upsertGlobalCallback(this.callbacks, {
        name: nextName,
        lambdaExpr: nextExpr,
        description: nextDesc,
        source: existing.source,
      }).list;
    } else if (kind === 'histolog') {
      const target = this.histolog.find((h) => String(h.generation) === nodeId);
      if (target && memberName === 'summary') {
        target.summary = mode === 'delete' ? `Generation G${target.generation}` : String(value ?? target.summary);
      }
    }

    const updatedNode = this.getAddressableNode(kind, nodeId, origin);
    return {
      status: 200,
      body: {
        ok: true,
        node: `${kind}/${nodeId}`,
        member: updatedNode?.members[memberName] || member,
        _links: updatedNode?._links || node._links,
      },
    };
  }

  public clearSection(section: EngineSectionKey): { cleared: EngineSectionKey; generation: number } {
    this.recordHistolog('pre_clear_checkpoint', `Checkpoint before clearing ${section}`);
    if (section === 'all' || section === 'grammar') {
      this.workspace.grammarText = '';
    }
    if (section === 'all' || section === 'mutations') {
      this.workspace.mutations = {};
      this.workspace.ruleConfigs = {};
    }
    if (section === 'all' || section === 'logic') {
      this.workspace.logicStatement = '';
      this.workspace.logicLabels = [];
    }
    if (section === 'all' || section === 'evaluator') {
      this.workspace.evalRule = '';
      this.workspace.evalPayload = '';
    }
    if (section === 'all' || section === 'dsl') {
      this.workspace.dslSource = '';
    }
    if (section === 'all' || section === 'callbacks') {
      this.callbacks = [];
    }
    this.workspace.updatedAt = new Date().toISOString();
    const entry = this.recordHistolog('engine_clear', `Cleared ${section === 'all' ? 'entire engine' : section}`);
    return { cleared: section, generation: entry.generation };
  }

  public restoreGeneration(
    generation: number,
    section: EngineSectionKey = 'all'
  ): { ok: true; entry: HistologEntry } | { ok: false; error: string } {
    const target = this.histolog.find((h) => h.generation === generation);
    if (!target) {
      return { ok: false, error: `Generation G${generation} not found.` };
    }
    const snap = target.snapshot;
    if (section === 'all' || section === 'grammar') {
      this.workspace.grammarText = snap.grammarText;
      this.workspace.dialect = { ...snap.dialect, symbols: { ...(snap.dialect.symbols || {}) } };
    }
    if (section === 'all' || section === 'mutations') {
      this.workspace.mutations = { ...snap.mutations };
      this.workspace.ruleConfigs = { ...snap.ruleConfigs };
    }
    if (section === 'all' || section === 'logic') {
      this.workspace.logicStatement = snap.logicStatement;
      this.workspace.logicLabels = snap.logicLabels.map((l) => ({ ...l }));
    }
    if (section === 'all' || section === 'evaluator') {
      this.workspace.evalRule = snap.evalRule;
      this.workspace.evalPayload = snap.evalPayload;
    }
    if (section === 'all' || section === 'dsl') {
      this.workspace.dslSource = snap.dslSource;
    }
    this.workspace.updatedAt = new Date().toISOString();
    const restored = this.recordHistolog(
      'histolog_restore',
      `Restored ${section === 'all' ? 'entire engine' : section} to G${generation}`
    );
    return { ok: true, entry: restored };
  }

  public createRule(name: string, expression: string) {
    const res = addGrammarRule(this.workspace.grammarText, this.getRules(), name, expression, this.workspace.dialect);
    if (!res.ok) return res;
    this.workspace.grammarText = res.grammar;
    this.workspace.updatedAt = new Date().toISOString();
    this.recordHistolog('rest_create_rule', `Created rule <${name}>`);
    return res;
  }

  public updateRule(name: string, patch: { name?: string; expression?: string }) {
    const res = updateGrammarRule(this.workspace.grammarText, this.getRules(), name, patch, this.workspace.dialect);
    if (!res.ok) return res;
    this.workspace.grammarText = res.grammar;
    this.workspace.updatedAt = new Date().toISOString();
    this.recordHistolog('rest_update_rule', `Updated rule <${res.nextName}>`);
    return res;
  }

  public deleteRule(name: string) {
    const res = deleteGrammarRule(this.workspace.grammarText, this.getRules(), name, this.workspace.dialect);
    if (!res.ok) return res;
    this.workspace.grammarText = res.grammar;
    delete this.workspace.mutations[name];
    delete this.workspace.ruleConfigs[name];
    this.workspace.updatedAt = new Date().toISOString();
    this.recordHistolog('rest_delete_rule', `Deleted rule <${name}>`);
    return res;
  }

  public upsertCallback(input: { name: string; lambdaExpr: string; description?: string }) {
    this.callbacks = upsertGlobalCallback(this.callbacks, { ...input, source: 'manual' }).list;
    return this.callbacks.find((c) => c.name === input.name.trim()) || this.callbacks[0];
  }

  public deleteCallback(idOrName: string): boolean {
    const before = this.callbacks.length;
    this.callbacks = removeGlobalCallback(this.callbacks, idOrName);
    return this.callbacks.length < before;
  }

  public evaluatePayload(ruleName?: string, payload?: string) {
    const targetRule = (ruleName ?? this.workspace.evalRule) || this.getRules()[0]?.name || '';
    const targetPayload = payload ?? this.workspace.evalPayload;
    return evaluateGrammarPayload(
      this.getRules(),
      targetRule,
      targetPayload,
      this.workspace.mutations,
      this.workspace.dialect
    );
  }

  public exportWorkspace(language: ExportLanguage) {
    const rules = this.getRules();
    const jsonText = this.buildJsonLd();
    return exportWorkspaceInLanguage(language, {
      rules,
      dialect: this.workspace.dialect,
      schemaConfig: this.workspace.schemaConfig,
      mutations: this.workspace.mutations,
      mutationPolicy: this.workspace.mutationPolicy,
      ruleConfigs: this.workspace.ruleConfigs,
      grammarText: this.workspace.grammarText,
      jsonText,
      watSource: '',
    });
  }

  public exportLogic(target: LogicExportTarget) {
    const evalRes = evaluateLogicStatement(this.workspace.logicStatement, this.workspace.logicLabels);
    const rules = parseGrammar(this.workspace.grammarText, this.workspace.dialect);
    return exportLogicStatement(
      target,
      this.workspace.logicStatement,
      this.workspace.logicLabels,
      evalRes,
      this.workspace.cauchyConfig,
      {
        grammarText: this.workspace.grammarText,
        rules,
        dialect: this.workspace.dialect,
        sampleInput: this.workspace.evalPayload,
      }
    );
  }

  public getHistologIndex() {
    return buildHistologIndex(this.histolog);
  }

  public getHistologDiff(fromGen: number, toGen: number) {
    const fromEntry = this.histolog.find((h) => h.generation === fromGen) || this.histolog[0];
    const toEntry = this.histolog.find((h) => h.generation === toGen) || this.histolog[this.histolog.length - 1];
    if (!fromEntry || !toEntry) return null;
    return {
      fromGen: fromEntry.generation,
      toGen: toEntry.generation,
      diffs: diffHistologSnapshots(fromEntry.snapshot, toEntry.snapshot),
    };
  }
}
