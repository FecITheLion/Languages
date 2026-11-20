import { DIALECT_PRESETS } from '../data/openapiAndDsl';
import {
  addGrammarRule,
  analyzeRuleDependencies,
  buildJsonLdSchemaPackage,
  compileWatToWasm,
  decompileWasmToWat,
  DEFAULT_MUTATION_POLICY,
  deleteGrammarRule,
  evaluateGrammarPayload,
  executeWasmExport,
  exportWorkspaceInLanguage,
  extractRulesFromPythonAst,
  extractRulesFromRustAst,
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
} from './bidirectionalEngine';
import {
  evaluateLogicStatement,
  exportLogicStatement,
  formatLogicAst,
  LOGIC_CALCULATOR_PRESETS,
  parseExportedLogicArtifact,
  type LogicExportTarget,
  type LogicLabelBinding,
} from './logicLambdaEngine';
import type {
  DialectConfig,
  ExportLanguage,
  LineMutation,
  McpJsonRpcRequest,
  McpJsonRpcResponse,
  McpServerId,
  McpServerStatus,
  McpToolDefinition,
  MutationPolicy,
  PipelineStage,
  RuleMergeStrategy,
  RuleOrderConfig,
  SchemaConfig,
  TransformTarget,
  WorkflowSlug,
} from '../types/studio';

export interface McpWorkspaceContext {
  dialect: DialectConfig;
  schemaConfig: SchemaConfig;
  mutationPolicy: MutationPolicy;
  grammarText: string;
  jsonText: string;
  mutations: Record<string, LineMutation>;
  ruleConfigs: Record<string, RuleOrderConfig>;
  evalRule: string;
  evalPayload: string;
  pythonSource: string;
  rustSource: string;
  watSource: string;
  logicStatement: string;
  logicLabels: LogicLabelBinding[];
}

interface McpServerDescriptor {
  id: McpServerId;
  name: string;
  stage: PipelineStage;
  targetPage: WorkflowSlug;
  description: string;
  tools: McpToolDefinition[];
}

interface CachedToolEntry {
  key: string;
  result: unknown;
  cachedAt: string;
  expiresAt: number;
  hits: number;
}

interface BuiltServerInstance {
  id: McpServerId;
  builtAt: string;
  buildDurationMs: number;
  workspaceHash: string;
  compiledSummary: Record<string, unknown>;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES_PER_SERVER = 64;

function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([k]) => !k.startsWith('_'))
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export function createDefaultMcpContext(): McpWorkspaceContext {
  const preset = DIALECT_PRESETS.ebnf;
  const schemaConfig: SchemaConfig = {
    preset: 'hybrid',
    schemaOrgType: 'DefinedTermSet',
    schemaName: 'OrderActionGrammar',
    schemaStoreDraft: 'https://json-schema.org/draft/2020-12/schema',
    includeJsonSchemaDefs: true,
    includePotentialActions: true,
  };
  const rules = parseGrammar(preset.sampleGrammar, preset.config);
  const mutations = inferLineMutations(rules);
  const ruleConfigs = inferRuleOrderConfigs(rules);
  const jsonText = grammarToSchemaJson(
    rules,
    preset.config,
    schemaConfig,
    mutations,
    DEFAULT_MUTATION_POLICY,
    ruleConfigs
  );
  const logicPreset = LOGIC_CALCULATOR_PRESETS[0];

  return {
    dialect: preset.config,
    schemaConfig,
    mutationPolicy: DEFAULT_MUTATION_POLICY,
    grammarText: preset.sampleGrammar,
    jsonText,
    mutations,
    ruleConfigs,
    evalRule: preset.sampleRule,
    evalPayload: preset.samplePayload,
    pythonSource: generatePythonFromWorkspace(rules, schemaConfig),
    rustSource: generateRustFromWorkspace(rules, schemaConfig, mutations, DEFAULT_MUTATION_POLICY),
    watSource: generateWatFromWorkspace(rules, schemaConfig.schemaName, jsonText),
    logicStatement: logicPreset.statement,
    logicLabels: logicPreset.labels.map((l) => ({ ...l })),
  };
}

export const MCP_SERVER_DESCRIPTORS: McpServerDescriptor[] = [
  {
    id: 'grammar',
    name: 'Grammar & Dependency DAG MCP Server',
    stage: 'frontend',
    targetPage: 'dialect',
    description:
      'Lazy build-on-call MCP server for parsing EBNF/BNF/PEG/Python/Rust/WAT grammars, computing rule dependency DAGs, reordering, and merging rules.',
    tools: [
      {
        name: 'parse_and_analyze_dag',
        description: 'Parse grammar rules and return the topological dependency graph, cycles, and diagnostics.',
        inputSchema: {
          type: 'object',
          properties: {
            grammar: { type: 'string', description: 'Optional grammar text override (defaults to active studio grammar).' },
            ruleOperator: { type: 'string', description: 'Rule assignment operator (e.g. ::=, =, :, =>, :=).' },
          },
        },
        sampleArgs: {},
      },
      {
        name: 'reorder_rules',
        description: 'Reorder a grammar rule before or after another rule and return the updated grammar.',
        inputSchema: {
          type: 'object',
          properties: {
            sourceRule: { type: 'string', description: 'Rule name to move.' },
            targetRule: { type: 'string', description: 'Anchor rule name.' },
            position: { type: 'string', description: 'Placement relative to targetRule.', enum: ['before', 'after'] },
          },
          required: ['sourceRule', 'targetRule', 'position'],
        },
        sampleArgs: { sourceRule: 'digit', targetRule: 'quantity', position: 'before' },
      },
      {
        name: 'merge_rules',
        description: 'Merge sourceRule into targetRule using choice, sequence, or inline substitution.',
        inputSchema: {
          type: 'object',
          properties: {
            sourceRule: { type: 'string', description: 'Rule to fold into target.' },
            targetRule: { type: 'string', description: 'Destination rule.' },
            strategy: { type: 'string', description: 'Merge strategy.', enum: ['choice', 'sequence', 'inline'] },
          },
          required: ['sourceRule', 'targetRule'],
        },
        sampleArgs: { sourceRule: 'digit', targetRule: 'quantity', strategy: 'inline' },
      },
    ],
  },
  {
    id: 'rule_props',
    name: 'Rule Properties & Language Export MCP Server',
    stage: 'frontend',
    targetPage: 'rule_props',
    description:
      'Inspect/mutate rule properties, precedence, and associativity, and export the grammar in Grammar, JSON-LD, Python, Rust, WABT/WAT, or TypeScript.',
    tools: [
      {
        name: 'export_in_language',
        description: 'Build on call and export all rules with precedence and custom properties into a target language.',
        inputSchema: {
          type: 'object',
          properties: {
            language: {
              type: 'string',
              description: 'Target language to export.',
              enum: ['grammar', 'jsonld', 'python', 'rust', 'wat', 'typescript'],
            },
          },
          required: ['language'],
        },
        sampleArgs: { language: 'typescript' },
      },
      {
        name: 'update_rule_property',
        description: 'Preview a rule rename, value change, or branch update with reference refactoring.',
        inputSchema: {
          type: 'object',
          properties: {
            originalName: { type: 'string', description: 'Existing rule name.' },
            name: { type: 'string', description: 'Optional new rule name.' },
            expression: { type: 'string', description: 'Optional new rule value expression.' },
          },
          required: ['originalName'],
        },
        sampleArgs: { originalName: 'action_verb', expression: "'BUY' | 'RESERVE' | 'SHIP' | 'CANCEL'" },
      },
      {
        name: 'sort_by_precedence',
        description: 'Sort grammar rules by configured numeric precedence order of operations.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        sampleArgs: {},
      },
    ],
  },
  {
    id: 'logic_calc',
    name: 'Symbolic Logic & Lambda Calculus MCP Server',
    stage: 'formal',
    targetPage: 'logic_calc',
    description:
      'Evaluate propositional logic, labeled arithmetic, and higher-order λ callbacks; generate truth tables; export to and parse from Python, JSON-LD, Rust, WABT, and WASM.',
    tools: [
      {
        name: 'evaluate_logic_lambda',
        description: 'Evaluate a logic/arithmetic/λ-calculus statement with named labels and return value, β-trace, and truth table.',
        inputSchema: {
          type: 'object',
          properties: {
            statement: { type: 'string', description: 'Logic/arithmetic/λ statement (defaults to active calculator statement).' },
            labels: { type: 'array', description: 'Optional array of { name, value, kind } bindings.' },
          },
        },
        sampleArgs: {},
      },
      {
        name: 'export_logic_target',
        description: 'Compile and export a logic/λ statement into Python, JSON-LD, Rust, WABT (.wat), or WASM (.wasm binary).',
        inputSchema: {
          type: 'object',
          properties: {
            target: {
              type: 'string',
              description: 'Output artifact target.',
              enum: ['python', 'jsonld', 'rust', 'wat', 'wasm'],
            },
            statement: { type: 'string', description: 'Optional statement override.' },
          },
          required: ['target'],
        },
        sampleArgs: { target: 'rust' },
      },
      {
        name: 'parse_logic_artifact',
        description: 'Parse exported Python, JSON-LD, Rust, WABT/WAT, or direct expressions back into structured logic statement and labels.',
        inputSchema: {
          type: 'object',
          properties: {
            artifact: { type: 'string', description: 'Exported code or expression string to parse.' },
          },
          required: ['artifact'],
        },
        sampleArgs: { artifact: '((P → Q) ∧ P) → Q' },
      },
    ],
  },
  {
    id: 'jsonld',
    name: 'Schema.org JSON-LD & Package MCP Server',
    stage: 'ir',
    targetPage: 'schema',
    description:
      'Bidirectional Grammar ↔ Schema.org JSON-LD + JSON Schema $defs compiler and multi-target JSON-LD Schema Package builder.',
    tools: [
      {
        name: 'compile_grammar_to_jsonld',
        description: 'Compile grammar rules, mutations, and rule properties into Schema.org JSON-LD.',
        inputSchema: {
          type: 'object',
          properties: {
            grammar: { type: 'string', description: 'Optional grammar text override.' },
          },
        },
        sampleArgs: {},
      },
      {
        name: 'decompile_jsonld_to_grammar',
        description: 'Reverse-compile a Schema.org JSON-LD document back into clean single-quoted grammar rules.',
        inputSchema: {
          type: 'object',
          properties: {
            jsonld: { type: 'string', description: 'Optional JSON-LD string override.' },
          },
        },
        sampleArgs: {},
      },
      {
        name: 'build_jsonld_package',
        description: 'Bundle Grammar + JSON-LD Schema + selected AST targets into a portable .package.jsonld archive.',
        inputSchema: {
          type: 'object',
          properties: {
            targets: { type: 'array', description: 'Target list subset of ["jsonld", "python", "rust", "wasm"].' },
          },
        },
        sampleArgs: { targets: ['jsonld', 'python', 'rust', 'wasm'] },
      },
    ],
  },
  {
    id: 'mutations',
    name: 'Schema Mutations & Locks MCP Server',
    stage: 'ir',
    targetPage: 'mutations',
    description:
      'Infer line-by-line JSON Schema property types, rename mappings, regex patterns, and declaration lock enforcement.',
    tools: [
      {
        name: 'infer_schema_mutations',
        description: 'Auto-infer target property names, JSON types, and regex patterns for every grammar rule.',
        inputSchema: {
          type: 'object',
          properties: {
            grammar: { type: 'string', description: 'Optional grammar override.' },
          },
        },
        sampleArgs: {},
      },
      {
        name: 'preview_mutation_map',
        description: 'Return the before -> after schema mutation diff and locked declaration status.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        sampleArgs: {},
      },
    ],
  },
  {
    id: 'evaluator',
    name: 'Backtracking Grammar Evaluator MCP Server',
    stage: 'ir',
    targetPage: 'evaluator',
    description:
      'Run recursive-descent backtracking longest-match payload evaluation against any rule with full step trace.',
    tools: [
      {
        name: 'evaluate_payload',
        description: 'Match an input payload string against a start rule and return match status + recursive trace.',
        inputSchema: {
          type: 'object',
          properties: {
            startRule: { type: 'string', description: 'Grammar start rule name.' },
            payload: { type: 'string', description: 'Input string to parse.' },
            grammar: { type: 'string', description: 'Optional grammar override.' },
          },
        },
        sampleArgs: { startRule: 'order_expr', payload: 'BUY SKU-402 12' },
      },
    ],
  },
  {
    id: 'python',
    name: 'Python AST Codegen & Unparser MCP Server',
    stage: 'codegen',
    targetPage: 'python_ast',
    description:
      'Generate Python ast.Module code from Grammar/JSON-LD, parse Python into ast.dump/AST JSON, unparse, and extract GRAMMAR_RULES.',
    tools: [
      {
        name: 'generate_python_module',
        description: 'Generate Python module with GRAMMAR_RULES and Schema.org metadata from current grammar.',
        inputSchema: {
          type: 'object',
          properties: {
            grammar: { type: 'string', description: 'Optional grammar override.' },
          },
        },
        sampleArgs: {},
      },
      {
        name: 'parse_python_ast',
        description: 'Parse Python source into ast.Module JSON and ast.dump() representation.',
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Optional Python source override.' },
          },
        },
        sampleArgs: {},
      },
      {
        name: 'extract_grammar_from_python',
        description: 'Extract GRAMMAR_RULES from Python source back into active grammar dialect syntax.',
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Optional Python source override.' },
          },
        },
        sampleArgs: {},
      },
    ],
  },
  {
    id: 'rust',
    name: 'Rust syn / serde AST MCP Server',
    stage: 'codegen',
    targetPage: 'rust_ast',
    description:
      'Generate strongly typed Rust serde/syn modules, parse Rust files into syn::File AST dumps, and extract GRAMMAR_RULES back to grammar.',
    tools: [
      {
        name: 'generate_rust_module',
        description: 'Generate Rust module with serde structs and GRAMMAR_RULES slice from current workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            grammar: { type: 'string', description: 'Optional grammar override.' },
          },
        },
        sampleArgs: {},
      },
      {
        name: 'parse_rust_syn_ast',
        description: 'Parse Rust source into syn::File AST items and formatted dump.',
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Optional Rust source override.' },
          },
        },
        sampleArgs: {},
      },
      {
        name: 'extract_grammar_from_rust',
        description: 'Extract pub const GRAMMAR_RULES from Rust source back into active grammar dialect syntax.',
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Optional Rust source override.' },
          },
        },
        sampleArgs: {},
      },
    ],
  },
  {
    id: 'wasm',
    name: 'WebAssembly Binary & Runtime MCP Server',
    stage: 'codegen',
    targetPage: 'wasm_wabt',
    description:
      'Compile WAT to validated WebAssembly binary (.wasm), execute exported functions with typed arguments, and decompile WASM bytes.',
    tools: [
      {
        name: 'compile_wat_to_wasm',
        description: 'Compile WAT S-expressions into a validated WebAssembly binary and return exports + hex dump.',
        inputSchema: {
          type: 'object',
          properties: {
            wat: { type: 'string', description: 'Optional WAT source override.' },
          },
        },
        sampleArgs: {},
      },
      {
        name: 'execute_wasm_export',
        description: 'Instantiate compiled WebAssembly binary and execute an exported function with numeric arguments.',
        inputSchema: {
          type: 'object',
          properties: {
            exportName: { type: 'string', description: 'Exported function name (e.g. rule_count, add_rule_weights).' },
            args: { type: 'array', description: 'Array of numeric i32 arguments.' },
            wat: { type: 'string', description: 'Optional WAT source override.' },
          },
          required: ['exportName'],
        },
        sampleArgs: { exportName: 'rule_count', args: [] },
      },
      {
        name: 'compile_logic_to_wasm',
        description: 'Compile a symbolic logic / arithmetic / λ statement directly into a runnable .wasm binary and execute eval_logic().',
        inputSchema: {
          type: 'object',
          properties: {
            statement: { type: 'string', description: 'Optional logic/λ statement override.' },
          },
        },
        sampleArgs: {},
      },
    ],
  },
  {
    id: 'wabt',
    name: 'WABT S-Expression & Disassembler MCP Server',
    stage: 'codegen',
    targetPage: 'wasm_wabt',
    description:
      'Generate WAT S-expression modules from Grammar/JSON-LD, run wasm2wat binary disassembly, and inspect WABT AST + linear memory payload.',
    tools: [
      {
        name: 'generate_wat_from_workspace',
        description: 'Generate a complete WAT S-expression module with embedded Schema.org JSON-LD linear memory.',
        inputSchema: {
          type: 'object',
          properties: {
            grammar: { type: 'string', description: 'Optional grammar override.' },
          },
        },
        sampleArgs: {},
      },
      {
        name: 'wasm2wat_roundtrip',
        description: 'Compile WAT to WASM bytes and decompile back via wasm2wat to verify lossless S-expression roundtrip.',
        inputSchema: {
          type: 'object',
          properties: {
            wat: { type: 'string', description: 'Optional WAT override.' },
          },
        },
        sampleArgs: {},
      },
    ],
  },
];

export const VALID_MCP_SERVER_IDS = new Set<McpServerId>(MCP_SERVER_DESCRIPTORS.map((d) => d.id));

export class McpLazyServerRegistry {
  private context: McpWorkspaceContext;
  private workspaceHash: string;
  private builtServers = new Map<McpServerId, BuiltServerInstance>();
  private buildCounts = new Map<McpServerId, number>();
  private caches = new Map<McpServerId, Map<string, CachedToolEntry>>();
  private stats = new Map<McpServerId, { hits: number; misses: number }>();

  constructor(initialContext?: Partial<McpWorkspaceContext>) {
    this.context = { ...createDefaultMcpContext(), ...initialContext };
    this.workspaceHash = this.computeContextHash(this.context);
  }

  private computeContextHash(ctx: McpWorkspaceContext): string {
    return fnv1aHash(
      stableStringify({
        dialect: ctx.dialect,
        schemaConfig: ctx.schemaConfig,
        mutationPolicy: ctx.mutationPolicy,
        grammarText: ctx.grammarText,
        jsonText: ctx.jsonText,
        mutations: ctx.mutations,
        ruleConfigs: ctx.ruleConfigs,
        pythonSource: ctx.pythonSource,
        rustSource: ctx.rustSource,
        watSource: ctx.watSource,
        logicStatement: ctx.logicStatement,
        logicLabels: ctx.logicLabels,
      })
    );
  }

  public updateContext(patch: Partial<McpWorkspaceContext>): { workspaceHash: string; changed: boolean } {
    const next: McpWorkspaceContext = { ...this.context, ...patch };
    const nextHash = this.computeContextHash(next);
    const changed = nextHash !== this.workspaceHash;
    this.context = next;
    this.workspaceHash = nextHash;
    return { workspaceHash: nextHash, changed };
  }

  public getContext(): McpWorkspaceContext {
    return this.context;
  }

  public getDescriptor(serverId: McpServerId): McpServerDescriptor | undefined {
    return MCP_SERVER_DESCRIPTORS.find((d) => d.id === serverId);
  }

  /**
   * Lazy build-on-call instantiation: servers remain 'cold' (zero compilation cost)
   * until the first JSON-RPC request invokes them, then cache their compiled state
   * keyed by workspaceHash.
   */
  public ensureBuilt(serverId: McpServerId): { instance: BuiltServerInstance; builtNow: boolean } {
    const existing = this.builtServers.get(serverId);
    if (existing && existing.workspaceHash === this.workspaceHash) {
      return { instance: existing, builtNow: false };
    }

    const start = nowMs();
    const ctx = this.context;
    const rules = parseGrammar(ctx.grammarText, ctx.dialect);
    let compiledSummary: Record<string, unknown> = { ruleCount: rules.length };

    if (serverId === 'grammar') {
      const dag = analyzeRuleDependencies(rules, ctx.grammarText, ctx.dialect, ctx.mutationPolicy.lockedRules);
      compiledSummary = {
        ruleCount: rules.length,
        edges: dag.edges.length,
        hasCycles: dag.hasCycles,
        diagnostics: dag.diagnostics.length,
      };
    } else if (serverId === 'rule_props') {
      compiledSummary = {
        ruleCount: rules.length,
        configuredRules: Object.keys(ctx.ruleConfigs).length,
      };
    } else if (serverId === 'logic_calc') {
      const evalRes = evaluateLogicStatement(ctx.logicStatement, ctx.logicLabels);
      compiledSummary = {
        statement: ctx.logicStatement,
        ok: evalRes.ok,
        valueType: evalRes.valueType,
        displayValue: evalRes.displayValue,
      };
    } else if (serverId === 'jsonld') {
      compiledSummary = {
        schemaName: ctx.schemaConfig.schemaName,
        schemaType: ctx.schemaConfig.schemaOrgType,
        byteLength: ctx.jsonText.length,
      };
    } else if (serverId === 'mutations') {
      compiledSummary = {
        mutationCount: Object.keys(ctx.mutations).length,
        lockedRules: ctx.mutationPolicy.lockedRules.length,
      };
    } else if (serverId === 'evaluator') {
      const res = evaluateGrammarPayload(rules, ctx.evalRule, ctx.evalPayload);
      compiledSummary = { startRule: ctx.evalRule, matched: res.matched, steps: res.trace.length };
    } else if (serverId === 'python') {
      const parsed = parsePythonToAst(ctx.pythonSource);
      compiledSummary = { symbolCount: parsed.symbols.length, statements: (parsed.ast.body || []).length };
    } else if (serverId === 'rust') {
      const parsed = parseRustToAst(ctx.rustSource);
      compiledSummary = { crateName: parsed.ast.crateName, items: parsed.ast.items.length };
    } else if (serverId === 'wasm' || serverId === 'wabt') {
      const compiled = compileWatToWasm(ctx.watSource);
      compiledSummary = { valid: compiled.valid, sizeBytes: compiled.sizeBytes, exports: compiled.exports.length };
    }

    const duration = Math.max(0.1, Number((nowMs() - start).toFixed(2)));
    const instance: BuiltServerInstance = {
      id: serverId,
      builtAt: new Date().toISOString(),
      buildDurationMs: duration,
      workspaceHash: this.workspaceHash,
      compiledSummary,
    };

    this.builtServers.set(serverId, instance);
    this.buildCounts.set(serverId, (this.buildCounts.get(serverId) || 0) + 1);
    return { instance, builtNow: true };
  }

  public clearCache(serverId?: McpServerId): { clearedServers: McpServerId[]; clearedEntries: number } {
    const targets: McpServerId[] = serverId
      ? [serverId]
      : MCP_SERVER_DESCRIPTORS.map((d) => d.id);
    let clearedEntries = 0;
    for (const id of targets) {
      const cache = this.caches.get(id);
      if (cache) {
        clearedEntries += cache.size;
        cache.clear();
      }
      this.builtServers.delete(id);
      this.stats.set(id, { hits: 0, misses: 0 });
    }
    return { clearedServers: targets, clearedEntries };
  }

  public getServerStatuses(): McpServerStatus[] {
    return MCP_SERVER_DESCRIPTORS.map((desc) => {
      const built = this.builtServers.get(desc.id);
      const isWarm = Boolean(built && built.workspaceHash === this.workspaceHash);
      const cache = this.caches.get(desc.id);
      const st = this.stats.get(desc.id) || { hits: 0, misses: 0 };
      return {
        id: desc.id,
        name: desc.name,
        stage: desc.stage,
        targetPage: desc.targetPage,
        endpoint: `/api/mcp/${desc.id}`,
        description: desc.description,
        state: isWarm ? 'warm' : 'cold',
        builtAt: built?.builtAt || null,
        buildCount: this.buildCounts.get(desc.id) || 0,
        lastBuildMs: built?.buildDurationMs ?? null,
        cacheEntries: cache ? cache.size : 0,
        cacheHits: st.hits,
        cacheMisses: st.misses,
        toolCount: desc.tools.length,
        tools: desc.tools,
      };
    });
  }

  private getServerCache(serverId: McpServerId): Map<string, CachedToolEntry> {
    let cache = this.caches.get(serverId);
    if (!cache) {
      cache = new Map();
      this.caches.set(serverId, cache);
    }
    return cache;
  }

  private recordStat(serverId: McpServerId, hit: boolean): void {
    const current = this.stats.get(serverId) || { hits: 0, misses: 0 };
    if (hit) current.hits += 1;
    else current.misses += 1;
    this.stats.set(serverId, current);
  }

  public async handleJsonRpc(
    serverId: McpServerId,
    request: McpJsonRpcRequest
  ): Promise<McpJsonRpcResponse> {
    const reqId = request.id ?? null;
    const descriptor = this.getDescriptor(serverId);
    if (!descriptor) {
      return {
        jsonrpc: '2.0',
        id: reqId,
        error: { code: -32601, message: `Unknown MCP server target: ${String(serverId)}` },
      };
    }

    const method = request.method;
    const params = (request.params || {}) as Record<string, unknown>;

    if (method === 'ping') {
      return { jsonrpc: '2.0', id: reqId, result: { pong: true, serverId, timestamp: new Date().toISOString() } };
    }

    if (method === 'notifications/initialized') {
      return { jsonrpc: '2.0', id: reqId, result: { acknowledged: true } };
    }

    // Build lazily on first protocol call (initialize, tools/list, tools/call, resources/*)
    const { instance, builtNow } = this.ensureBuilt(serverId);

    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: reqId,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
          },
          serverInfo: {
            name: `grammar2json-${serverId}-mcp`,
            version: '2.2.0',
          },
          _meta: {
            mode: 'build-on-call-cached',
            builtOnThisCall: builtNow,
            buildDurationMs: instance.buildDurationMs,
            workspaceHash: instance.workspaceHash,
            summary: instance.compiledSummary,
          },
        },
      };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: reqId,
        result: {
          tools: descriptor.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
          _meta: {
            serverId,
            builtOnThisCall: builtNow,
            workspaceHash: instance.workspaceHash,
          },
        },
      };
    }

    if (method === 'resources/list') {
      return {
        jsonrpc: '2.0',
        id: reqId,
        result: {
          resources: [
            {
              uri: `grammar2json://${serverId}/artifact`,
              name: `${descriptor.name} Active Artifact`,
              mimeType: serverId === 'jsonld' ? 'application/ld+json' : 'text/plain',
              description: `Lazily built & cached primary artifact for ${serverId}.`,
            },
          ],
        },
      };
    }

    if (method === 'resources/read') {
      const uri = String(params.uri || `grammar2json://${serverId}/artifact`);
      const text = this.readServerResource(serverId);
      return {
        jsonrpc: '2.0',
        id: reqId,
        result: {
          contents: [
            {
              uri,
              mimeType: serverId === 'jsonld' ? 'application/ld+json' : 'text/plain',
              text,
            },
          ],
          _meta: { serverId, builtOnThisCall: builtNow, workspaceHash: instance.workspaceHash },
        },
      };
    }

    if (method === 'tools/call') {
      const toolName = String(params.name || '');
      const toolArgs = ((params.arguments as Record<string, unknown>) || {}) as Record<string, unknown>;
      const bypassCache = Boolean(toolArgs._bypassCache);

      const toolDef = descriptor.tools.find((t) => t.name === toolName);
      if (!toolDef) {
        return {
          jsonrpc: '2.0',
          id: reqId,
          error: {
            code: -32602,
            message: `Tool '${toolName}' not found on MCP server '${serverId}'.`,
          },
        };
      }

      const cacheKey = fnv1aHash(
        `${serverId}:${toolName}:${this.workspaceHash}:${stableStringify(toolArgs)}`
      );
      const cache = this.getServerCache(serverId);
      const now = Date.now();

      if (!bypassCache) {
        const cached = cache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
          cached.hits += 1;
          this.recordStat(serverId, true);
          return {
            jsonrpc: '2.0',
            id: reqId,
            result: {
              ...(cached.result as Record<string, unknown>),
              _meta: {
                serverId,
                tool: toolName,
                cache: 'HIT',
                cacheKey,
                hitCount: cached.hits,
                cachedAt: cached.cachedAt,
                builtOnThisCall: builtNow,
                durationMs: 0.05,
                cacheSize: cache.size,
              },
            },
          };
        }
      }

      const execStart = nowMs();
      try {
        const payload = await this.executeTool(serverId, toolName, toolArgs);
        const durationMs = Math.max(0.1, Number((nowMs() - execStart).toFixed(2)));
        const mcpResult = {
          content: [
            {
              type: 'text',
              text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
            },
          ],
          structuredContent: payload,
          isError: false,
        };

        // LRU eviction when full
        if (cache.size >= MAX_CACHE_ENTRIES_PER_SERVER) {
          const oldestKey = cache.keys().next().value;
          if (oldestKey) cache.delete(oldestKey);
        }
        cache.set(cacheKey, {
          key: cacheKey,
          result: mcpResult,
          cachedAt: new Date().toISOString(),
          expiresAt: now + DEFAULT_CACHE_TTL_MS,
          hits: 0,
        });
        this.recordStat(serverId, false);

        return {
          jsonrpc: '2.0',
          id: reqId,
          result: {
            ...mcpResult,
            _meta: {
              serverId,
              tool: toolName,
              cache: bypassCache ? 'BYPASS' : 'MISS',
              cacheKey,
              builtOnThisCall: builtNow,
              durationMs,
              cacheSize: cache.size,
            },
          },
        };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id: reqId,
          result: {
            content: [
              {
                type: 'text',
                text: err instanceof Error ? err.message : 'MCP tool execution failed.',
              },
            ],
            isError: true,
            _meta: { serverId, tool: toolName, cache: 'ERROR' },
          },
        };
      }
    }

    return {
      jsonrpc: '2.0',
      id: reqId,
      error: { code: -32601, message: `Unsupported MCP method: ${method}` },
    };
  }

  /**
   * Unified router across all 10 lazy servers using namespaced tool names `<serverId>__<toolName>`.
   */
  public async handleUnifiedJsonRpc(request: McpJsonRpcRequest): Promise<McpJsonRpcResponse> {
    const reqId = request.id ?? null;
    if (request.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: reqId,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'grammar2json-unified-mcp', version: '2.2.0' },
          _meta: {
            mode: 'lazy-router',
            targets: MCP_SERVER_DESCRIPTORS.map((d) => d.id),
          },
        },
      };
    }

    if (request.method === 'tools/list') {
      const tools = MCP_SERVER_DESCRIPTORS.flatMap((d) =>
        d.tools.map((t) => ({
          name: `${d.id}__${t.name}`,
          description: `[${d.id}] ${t.description}`,
          inputSchema: t.inputSchema,
        }))
      );
      return { jsonrpc: '2.0', id: reqId, result: { tools } };
    }

    if (request.method === 'tools/call') {
      const params = (request.params || {}) as Record<string, unknown>;
      const fullName = String(params.name || '');
      const sep = fullName.indexOf('__');
      if (sep <= 0) {
        return {
          jsonrpc: '2.0',
          id: reqId,
          error: { code: -32602, message: `Expected namespaced tool "<serverId>__<toolName>", got "${fullName}".` },
        };
      }
      const serverId = fullName.slice(0, sep) as McpServerId;
      const toolName = fullName.slice(sep + 2);
      return this.handleJsonRpc(serverId, {
        ...request,
        params: { ...params, name: toolName },
      });
    }

    return {
      jsonrpc: '2.0',
      id: reqId,
      error: { code: -32601, message: `Unsupported unified MCP method: ${request.method}` },
    };
  }

  private readServerResource(serverId: McpServerId): string {
    const ctx = this.context;
    switch (serverId) {
      case 'grammar':
      case 'rule_props':
      case 'evaluator':
        return ctx.grammarText;
      case 'logic_calc':
        return JSON.stringify({ statement: ctx.logicStatement, labels: ctx.logicLabels }, null, 2);
      case 'jsonld':
      case 'mutations':
        return ctx.jsonText;
      case 'python':
        return ctx.pythonSource;
      case 'rust':
        return ctx.rustSource;
      case 'wasm':
      case 'wabt':
        return ctx.watSource;
    }
  }

  private async executeTool(
    serverId: McpServerId,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const ctx = this.context;
    const grammarText = typeof args.grammar === 'string' && args.grammar.trim() ? args.grammar : ctx.grammarText;
    const dialect: DialectConfig =
      typeof args.ruleOperator === 'string' && args.ruleOperator.trim()
        ? { ...ctx.dialect, ruleOperator: args.ruleOperator.trim() }
        : ctx.dialect;
    const rules = parseGrammar(grammarText, dialect);
    const mutations = inferLineMutations(rules, ctx.mutations);
    const ruleConfigs = inferRuleOrderConfigs(rules, ctx.ruleConfigs);

    // 1. GRAMMAR SERVER
    if (serverId === 'grammar') {
      if (toolName === 'parse_and_analyze_dag') {
        const dag = analyzeRuleDependencies(rules, grammarText, dialect, ctx.mutationPolicy.lockedRules);
        return {
          dialect,
          ruleCount: rules.length,
          topologicalOrder: dag.topologicalOrder,
          hasCycles: dag.hasCycles,
          cycles: dag.cycles,
          missingRules: dag.missingRules,
          diagnostics: dag.diagnostics,
          rules: rules.map((r) => ({
            name: r.name,
            line: r.lineNumber,
            expression: r.expression,
            alternatives: r.alternatives,
            references: r.referencedRules,
          })),
        };
      }
      if (toolName === 'reorder_rules') {
        const src = String(args.sourceRule || '');
        const tgt = String(args.targetRule || '');
        const pos = args.position === 'after' ? 'after' : 'before';
        const res = reorderGrammarRules(grammarText, rules, src, tgt, pos, dialect);
        return res.ok ? { ok: true, grammar: res.grammar } : { ok: false, error: res.error };
      }
      if (toolName === 'merge_rules') {
        const src = String(args.sourceRule || '');
        const tgt = String(args.targetRule || '');
        const strategy = (['choice', 'sequence', 'inline'].includes(String(args.strategy))
          ? String(args.strategy)
          : 'choice') as RuleMergeStrategy;
        const res = mergeGrammarRules(grammarText, rules, src, tgt, strategy, dialect);
        return res.ok ? { ok: true, summary: res.summary, grammar: res.grammar } : { ok: false, error: res.error };
      }
    }

    // 2. RULE PROPERTIES & EXPORT SERVER
    if (serverId === 'rule_props') {
      if (toolName === 'export_in_language') {
        const lang = (['grammar', 'jsonld', 'python', 'rust', 'wat', 'typescript'].includes(String(args.language))
          ? String(args.language)
          : 'python') as ExportLanguage;
        const exported = exportWorkspaceInLanguage(lang, {
          rules,
          dialect,
          schemaConfig: ctx.schemaConfig,
          mutations,
          mutationPolicy: ctx.mutationPolicy,
          ruleConfigs,
          grammarText,
          jsonText: ctx.jsonText,
          watSource: ctx.watSource,
        });
        return { language: lang, ...exported };
      }
      if (toolName === 'update_rule_property') {
        const orig = String(args.originalName || '');
        const res = updateGrammarRule(
          grammarText,
          rules,
          orig,
          {
            name: typeof args.name === 'string' ? args.name : undefined,
            expression: typeof args.expression === 'string' ? args.expression : undefined,
          },
          dialect
        );
        return res.ok
          ? { ok: true, nextName: res.nextName, grammar: res.grammar }
          : { ok: false, error: res.error };
      }
      if (toolName === 'sort_by_precedence') {
        const sorted = sortRulesByPrecedence(grammarText, rules, ruleConfigs, dialect);
        return { ok: true, grammar: sorted };
      }
    }

    // 3. LOGIC & LAMBDA CALCULUS SERVER
    if (serverId === 'logic_calc') {
      const statement =
        typeof args.statement === 'string' && args.statement.trim()
          ? args.statement
          : ctx.logicStatement;
      const labels: LogicLabelBinding[] = Array.isArray(args.labels)
        ? (args.labels as Array<Record<string, unknown>>).map((l, idx) => ({
            id: `mcp_lbl_${idx}`,
            name: String(l.name || `x_${idx}`),
            value: String(l.value ?? '0'),
            kind: (['number', 'boolean', 'lambda'].includes(String(l.kind))
              ? String(l.kind)
              : 'number') as LogicLabelBinding['kind'],
          }))
        : ctx.logicLabels;

      if (toolName === 'evaluate_logic_lambda') {
        const evalRes = evaluateLogicStatement(statement, labels);
        return {
          ok: evalRes.ok,
          statement,
          displayValue: evalRes.displayValue,
          valueType: evalRes.valueType,
          astFormatted: evalRes.ast ? formatLogicAst(evalRes.ast) : null,
          trace: evalRes.trace,
          truthTable: evalRes.truthTable,
          error: evalRes.error,
        };
      }
      if (toolName === 'export_logic_target') {
        const target = (['python', 'jsonld', 'rust', 'wat', 'wasm'].includes(String(args.target))
          ? String(args.target)
          : 'python') as LogicExportTarget;
        const evalRes = evaluateLogicStatement(statement, labels);
        const exported = exportLogicStatement(target, statement, labels, evalRes);
        return {
          target,
          filename: exported.filename,
          mime: exported.mime,
          evaluated: evalRes.displayValue,
          wasmByteLength: exported.wasm?.sizeBytes ?? null,
          wasmValid: exported.wasm?.valid ?? null,
          content: exported.content,
        };
      }
      if (toolName === 'parse_logic_artifact') {
        const artifact = String(args.artifact || '');
        const parsed = parseExportedLogicArtifact(artifact);
        if (!parsed.ok) return { ok: false, error: parsed.error };
        const evalRes = evaluateLogicStatement(parsed.statement, parsed.labels);
        return {
          ok: true,
          detectedFormat: parsed.detectedFormat,
          statement: parsed.statement,
          labels: parsed.labels,
          evaluated: evalRes.displayValue,
          valueType: evalRes.valueType,
        };
      }
    }

    // 4. JSON-LD SERVER
    if (serverId === 'jsonld') {
      if (toolName === 'compile_grammar_to_jsonld') {
        const compiled = grammarToSchemaJson(
          rules,
          dialect,
          ctx.schemaConfig,
          mutations,
          ctx.mutationPolicy,
          ruleConfigs
        );
        return { ok: true, schemaName: ctx.schemaConfig.schemaName, jsonld: JSON.parse(compiled) };
      }
      if (toolName === 'decompile_jsonld_to_grammar') {
        const raw = typeof args.jsonld === 'string' && args.jsonld.trim() ? args.jsonld : ctx.jsonText;
        const rev = schemaJsonToGrammar(raw, dialect);
        return rev.ok
          ? { ok: true, schemaName: rev.schemaName, dialect: rev.dialect, grammar: rev.grammar }
          : { ok: false, error: rev.error };
      }
      if (toolName === 'build_jsonld_package') {
        const selectedTargets: TransformTarget[] = Array.isArray(args.targets)
          ? (args.targets.filter((t) => ['jsonld', 'python', 'rust', 'wasm'].includes(String(t))) as TransformTarget[])
          : ['jsonld', 'python', 'rust', 'wasm'];
        const pyAst = parsePythonToAst(ctx.pythonSource).ast;
        const rsAst = parseRustToAst(ctx.rustSource).ast;
        const wasmRes = compileWatToWasm(ctx.watSource);
        const pkg = buildJsonLdSchemaPackage({
          dialect,
          schemaConfig: ctx.schemaConfig,
          mutationPolicy: ctx.mutationPolicy,
          grammarText,
          jsonText: ctx.jsonText,
          selectedTargets,
          pythonSource: ctx.pythonSource,
          pythonAst: pyAst,
          rustSource: ctx.rustSource,
          rustAst: rsAst,
          watSource: ctx.watSource,
          wasmResult: wasmRes,
        });
        return { ok: true, package: pkg };
      }
    }

    // 5. MUTATIONS SERVER
    if (serverId === 'mutations') {
      if (toolName === 'infer_schema_mutations') {
        const inferred = inferLineMutations(rules, {});
        return { ok: true, ruleCount: rules.length, mutations: inferred };
      }
      if (toolName === 'preview_mutation_map') {
        const entries = rules.map((r) => ({
          rule: r.name,
          locked: ctx.mutationPolicy.lockedRules.includes(r.name),
          mutation: mutations[r.name] || null,
        }));
        return { ok: true, policy: ctx.mutationPolicy, entries };
      }
    }

    // 6. EVALUATOR SERVER
    if (serverId === 'evaluator') {
      if (toolName === 'evaluate_payload') {
        const startRule = typeof args.startRule === 'string' && args.startRule.trim() ? args.startRule : ctx.evalRule;
        const payload = typeof args.payload === 'string' ? args.payload : ctx.evalPayload;
        const result = evaluateGrammarPayload(rules, startRule, payload);
        return { startRule, payload, ...result };
      }
    }

    // 7. PYTHON AST SERVER
    if (serverId === 'python') {
      if (toolName === 'generate_python_module') {
        const source = generatePythonFromWorkspace(rules, ctx.schemaConfig);
        const { ast, symbols } = parsePythonToAst(source);
        return { ok: true, symbols, source, astDump: formatPythonAstDump(ast) };
      }
      if (toolName === 'parse_python_ast') {
        const src = typeof args.source === 'string' && args.source.trim() ? args.source : ctx.pythonSource;
        const { ast, symbols } = parsePythonToAst(src);
        return {
          ok: true,
          symbols,
          astDump: formatPythonAstDump(ast),
          unparsed: unparsePythonAst(ast),
          ast,
        };
      }
      if (toolName === 'extract_grammar_from_python') {
        const src = typeof args.source === 'string' && args.source.trim() ? args.source : ctx.pythonSource;
        const { ast } = parsePythonToAst(src);
        const extracted = extractRulesFromPythonAst(ast, dialect);
        return extracted
          ? { ok: true, grammar: extracted }
          : { ok: false, error: 'No GRAMMAR_RULES dict found in Python source.' };
      }
    }

    // 8. RUST AST SERVER
    if (serverId === 'rust') {
      if (toolName === 'generate_rust_module') {
        const source = generateRustFromWorkspace(rules, ctx.schemaConfig, mutations, ctx.mutationPolicy);
        const { ast, symbols } = parseRustToAst(source);
        return { ok: true, symbols, source, synDump: formatRustAstDump(ast) };
      }
      if (toolName === 'parse_rust_syn_ast') {
        const src = typeof args.source === 'string' && args.source.trim() ? args.source : ctx.rustSource;
        const { ast, symbols } = parseRustToAst(src);
        return { ok: true, symbols, synDump: formatRustAstDump(ast), ast };
      }
      if (toolName === 'extract_grammar_from_rust') {
        const src = typeof args.source === 'string' && args.source.trim() ? args.source : ctx.rustSource;
        const { ast } = parseRustToAst(src);
        const extracted = extractRulesFromRustAst(ast, dialect);
        return extracted
          ? { ok: true, grammar: extracted }
          : { ok: false, error: 'No pub const GRAMMAR_RULES slice found in Rust source.' };
      }
    }

    // 9. WASM SERVER
    if (serverId === 'wasm') {
      if (toolName === 'compile_wat_to_wasm') {
        const wat = typeof args.wat === 'string' && args.wat.trim() ? args.wat : ctx.watSource;
        const compiled = compileWatToWasm(wat);
        return {
          valid: compiled.valid,
          sizeBytes: compiled.sizeBytes,
          exports: compiled.exports,
          hexDump: compiled.hexDump,
          astJson: compiled.astJson,
          error: compiled.error,
        };
      }
      if (toolName === 'execute_wasm_export') {
        const wat = typeof args.wat === 'string' && args.wat.trim() ? args.wat : ctx.watSource;
        const compiled = compileWatToWasm(wat);
        if (!compiled.valid) {
          return { ok: false, error: compiled.error || 'Invalid WAT binary.' };
        }
        const exportName = String(args.exportName || 'rule_count');
        const callArgs = Array.isArray(args.args)
          ? args.args.map((a) => Number(a) || 0)
          : [];
        const run = await executeWasmExport(compiled.bytes, exportName, callArgs);
        return { exportName, args: callArgs, ...run };
      }
      if (toolName === 'compile_logic_to_wasm') {
        const stmt =
          typeof args.statement === 'string' && args.statement.trim()
            ? args.statement
            : ctx.logicStatement;
        const evalRes = evaluateLogicStatement(stmt, ctx.logicLabels);
        const exported = exportLogicStatement('wasm', stmt, ctx.logicLabels, evalRes);
        let runtimeResult: number | null = null;
        if (exported.wasm?.valid) {
          const run = await executeWasmExport(exported.wasm.bytes, 'eval_logic', []);
          if (run.ok) runtimeResult = run.value;
        }
        return {
          statement: stmt,
          evaluated: evalRes.displayValue,
          valid: exported.wasm?.valid ?? false,
          sizeBytes: exported.wasm?.sizeBytes ?? 0,
          eval_logic_result: runtimeResult,
          hexDump: exported.wasm?.hexDump || '',
        };
      }
    }

    // 10. WABT SERVER
    if (serverId === 'wabt') {
      if (toolName === 'generate_wat_from_workspace') {
        const nextJson = grammarToSchemaJson(
          rules,
          dialect,
          ctx.schemaConfig,
          mutations,
          ctx.mutationPolicy,
          ruleConfigs
        );
        const wat = generateWatFromWorkspace(rules, ctx.schemaConfig.schemaName, nextJson);
        const compiled = compileWatToWasm(wat);
        return { ok: compiled.valid, sizeBytes: compiled.sizeBytes, exports: compiled.exports, wat };
      }
      if (toolName === 'wasm2wat_roundtrip') {
        const wat = typeof args.wat === 'string' && args.wat.trim() ? args.wat : ctx.watSource;
        const compiled = compileWatToWasm(wat);
        if (!compiled.valid) return { ok: false, error: compiled.error || 'WAT compile failed.' };
        const dec = decompileWasmToWat(compiled.bytes);
        return dec.ok
          ? { ok: true, sizeBytes: compiled.sizeBytes, decompiledWat: dec.wat }
          : { ok: false, error: dec.error };
      }
    }

    // Unused helper imports guard (keep tree clean & allow future dynamic rules)
    void addGrammarRule;
    void deleteGrammarRule;

    throw new Error(`Unhandled tool '${toolName}' on server '${serverId}'.`);
  }
}

export function generateMcpClientConfig(baseUrl: string, serverId?: McpServerId): string {
  const origin = baseUrl.replace(/\/+$/, '');
  const targets = serverId
    ? MCP_SERVER_DESCRIPTORS.filter((d) => d.id === serverId)
    : MCP_SERVER_DESCRIPTORS;

  const mcpServers: Record<string, Record<string, unknown>> = {};
  for (const t of targets) {
    mcpServers[`grammar2json-${t.id}`] = {
      type: 'streamable-http',
      url: `${origin}/api/mcp/${t.id}`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      'x-activation': 'build-on-call',
      'x-cache': 'content-addressed-lru',
    };
  }
  return JSON.stringify({ mcpServers }, null, 2);
}

export function generateStandaloneMcpScript(
  serverId: McpServerId,
  format: 'typescript' | 'python'
): { content: string; filename: string; mime: string } {
  const desc = MCP_SERVER_DESCRIPTORS.find((d) => d.id === serverId) || MCP_SERVER_DESCRIPTORS[0];
  const toolNames = desc.tools.map((t) => `'${t.name}'`).join(', ');

  if (format === 'python') {
    const content = `"""Standalone Build-on-Call Cached MCP Tool Server: ${desc.name}"""
from functools import lru_cache
import hashlib
import json

SERVER_ID = "${desc.id}"
TOOLS = [${toolNames}]

@lru_cache(maxsize=64)
def build_and_execute_cached(tool_name: str, canonical_args: str) -> dict:
    """Lazily builds on first call and caches by content hash (no launch loop required)."""
    args = json.loads(canonical_args)
    return {
        "server": SERVER_ID,
        "tool": tool_name,
        "cacheKey": hashlib.sha256(f"{SERVER_ID}:{tool_name}:{canonical_args}".encode()).hexdigest()[:12],
        "args": args,
        "status": "built-on-call",
    }

def handle_jsonrpc(payload: dict) -> dict:
    req_id = payload.get("id")
    method = payload.get("method", "")
    params = payload.get("params") or {}
    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2025-03-26",
                "serverInfo": {"name": f"grammar2json-{SERVER_ID}-mcp", "version": "2.2.0"},
                "capabilities": {"tools": {}},
            },
        }
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": [{"name": t} for t in TOOLS]}}
    if method == "tools/call":
        name = params.get("name", "")
        canonical = json.dumps(params.get("arguments") or {}, sort_keys=True)
        out = build_and_execute_cached(name, canonical)
        return {"jsonrpc": "2.0", "id": req_id, "result": {"content": [{"type": "text", "text": json.dumps(out, indent=2)}]}}
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Unknown method: {method}"}}
`;
    return { content, filename: `mcp_${desc.id}_server.py`, mime: 'text/x-python' };
  }

  const content = `// Standalone Build-on-Call Cached MCP Tool Server Handler: ${desc.name}
// Drop into any HTTP route, Cloudflare Worker, or Express endpoint — zero upfront launch required.

const SERVER_ID = '${desc.id}';
const CACHE = new Map<string, { value: unknown; cachedAt: string }>();

export async function handleMcpRequest(req: {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}) {
  const id = req.id ?? null;
  if (req.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2025-03-26',
        serverInfo: { name: \`grammar2json-\${SERVER_ID}-mcp\`, version: '2.2.0' },
        capabilities: { tools: { listChanged: false } },
      },
    };
  }

  if (req.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: ${JSON.stringify(
          desc.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
          null,
          2
        )},
      },
    };
  }

  if (req.method === 'tools/call') {
    const name = String(req.params?.name || '');
    const args = (req.params?.arguments as Record<string, unknown>) || {};
    const key = \`\${SERVER_ID}:\${name}:\${JSON.stringify(args)}\`;
    const hit = CACHE.get(key);
    if (hit) {
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(hit.value, null, 2) }], _meta: { cache: 'HIT', cachedAt: hit.cachedAt } } };
    }
    const built = { serverId: SERVER_ID, tool: name, args, builtAt: new Date().toISOString() };
    CACHE.set(key, { value: built, cachedAt: built.builtAt });
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(built, null, 2) }], _meta: { cache: 'MISS' } } };
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: \`Unsupported method: \${req.method}\` } };
}
`;
  return { content, filename: `mcp_${desc.id}_handler.ts`, mime: 'text/typescript' };
}
