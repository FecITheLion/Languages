export type DialectPresetId = 'ebnf' | 'bnf' | 'peg' | 'python_peg' | 'rust_macro' | 'wat_sexpr';

export type SchemaPresetId = 'hybrid' | 'definedTermSet' | 'softwareSource';

export type PrimaryLanguage = 'json' | 'python' | 'rust' | 'wasm';

export type ModalStructure = 'workbar' | 'calculator' | 'grid' | 'split';

export type ViewportPreset = 'responsive' | '375x667' | '768x1024' | '1024x768' | '1280x720';

export type WorkflowSlug =
  | 'dialect'
  | 'rule_props'
  | 'logic_calc'
  | 'schema'
  | 'mutations'
  | 'evaluator'
  | 'payload_io'
  | 'gdrive'
  | 'python_ast'
  | 'rust_ast'
  | 'wasm_wabt'
  | 'mcp_servers';

export type PipelineStage = 'frontend' | 'formal' | 'ir' | 'codegen' | 'storage';

export type TopView = 'workbench' | 'graph' | 'openapi' | 'dsl' | 'bundle';

export type TransformTarget = 'jsonld' | 'python' | 'rust' | 'wasm';

export type RuleMergeStrategy = 'choice' | 'sequence' | 'inline';

export type ExportLanguage = 'grammar' | 'jsonld' | 'python' | 'rust' | 'wat' | 'typescript';

export interface RulePropertyEntry {
  id: string;
  name: string;
  value: string;
}

export interface RuleOrderConfig {
  precedence: number;
  associativity: 'left' | 'right' | 'none';
  properties: RulePropertyEntry[];
}

export interface MutationPolicy {
  allowImportMutation: boolean;
  allowExportMutation: boolean;
  allowedTargets: TransformTarget[];
  lockedRules: string[];
}

export interface DialectConfig {
  preset: DialectPresetId;
  ruleOperator: string;
  choiceDelimiter: string;
  commentPrefix: string;
}

export interface SchemaConfig {
  preset: SchemaPresetId;
  schemaOrgType: string;
  schemaName: string;
  schemaStoreDraft: string;
  includeJsonSchemaDefs: boolean;
  includePotentialActions: boolean;
}

export interface GrammarRule {
  id: string;
  lineNumber: number;
  name: string;
  expression: string;
  alternatives: string[];
  referencedRules: string[];
  undefinedReferences: string[];
  literals: string[];
  rawLine: string;
}

export interface GrammarDiagnostic {
  id: string;
  severity: 'error' | 'warning';
  lineNumber?: number;
  ruleName?: string;
  code:
    | 'SYNTAX_OPERATOR'
    | 'UNCLOSED_QUOTE'
    | 'DUPLICATE_RULE'
    | 'UNDEFINED_REF'
    | 'CYCLE'
    | 'UNREACHABLE';
  message: string;
}

export interface RuleGraphNode {
  id: string;
  name: string;
  lineNumber: number | null;
  level: number;
  orderInLevel: number;
  inDegree: number;
  outDegree: number;
  branchesCount: number;
  literalsCount: number;
  isRoot: boolean;
  isLeaf: boolean;
  isMissing: boolean;
  isUnreachable: boolean;
  inCycle: boolean;
  isLocked: boolean;
  expression: string;
}

export interface RuleGraphEdge {
  id: string;
  from: string;
  to: string;
  isCycleEdge: boolean;
  isMissingTarget: boolean;
}

export interface RuleDependencyGraphData {
  nodes: RuleGraphNode[];
  edges: RuleGraphEdge[];
  diagnostics: GrammarDiagnostic[];
  topologicalOrder: string[];
  hasCycles: boolean;
  cycles: string[][];
  missingRules: string[];
  errorCount: number;
  warningCount: number;
}

export interface LineMutation {
  ruleName: string;
  targetProperty: string;
  jsonType: 'string' | 'number' | 'boolean' | 'object' | 'array';
  patternOverride: string;
  description: string;
  enabled: boolean;
}

export interface EvaluationTraceStep {
  depth: number;
  rule: string;
  inputSlice: string;
  matched: boolean;
  consumed: string;
  note: string;
}

export interface EvaluationResult {
  matched: boolean;
  consumedLength: number;
  remaining: string;
  summary: string;
  detail: string;
  trace: EvaluationTraceStep[];
}

export interface DslFlowNode {
  id: string;
  step: number;
  page: WorkflowSlug;
  stage: PipelineStage;
  lang: 'grammar' | 'logic' | 'json' | 'python' | 'rust' | 'wasm' | 'mcp';
  verify: string;
  next: string;
  label: string;
}

export interface DslEdge {
  relation: string;
  codec: string;
}

export interface ParsedDsl {
  flows: DslFlowNode[];
  edges: DslEdge[];
}

export interface OpenApiOperation {
  operationId: string;
  summary: string;
  tags: string[];
  'x-workbench-step'?: number;
  'x-dsl-flow'?: string;
  'x-language'?: string;
  'x-prev-page'?: string;
  'x-next-page'?: string;
  parameters?: Array<{
    name: string;
    in: string;
    required: boolean;
    schema: { type: string };
  }>;
  responses: Record<string, { description: string }>;
}

export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description: string }>;
  paths: Record<string, Record<string, OpenApiOperation>>;
}

export interface SearchHit {
  id: string;
  kind:
    | 'OpenAPI Operation'
    | 'DSL Mutation Edge'
    | 'Grammar Rule'
    | 'Python AST'
    | 'Rust AST'
    | 'WASM Export'
    | 'MCP Tool Server';
  title: string;
  subtitle: string;
  method: string;
  targetPage: WorkflowSlug;
  language: string;
}

export interface PythonAstNode {
  _type: string;
  lineno?: number;
  name?: string;
  id?: string;
  value?: unknown;
  targets?: PythonAstNode[];
  body?: PythonAstNode[];
  args?: string[];
  keys?: PythonAstNode[];
  values?: PythonAstNode[];
  elts?: PythonAstNode[];
  func?: string;
  callArgs?: PythonAstNode[];
  op?: string;
  left?: PythonAstNode;
  right?: PythonAstNode;
}

export interface RustAstItem {
  kind: 'Attribute' | 'Struct' | 'Enum' | 'Const' | 'Fn';
  lineno: number;
  name: string;
  visibility: 'pub' | 'private';
  signature?: string;
  fields?: Array<{ name: string; rustType: string }>;
  variants?: string[];
  entries?: Array<{ key: string; value: string }>;
  returnType?: string;
}

export interface RustAstModule {
  kind: 'File';
  crateName: string;
  derives: string[];
  items: RustAstItem[];
}

export interface WasmParamSpec {
  name: string;
  type: 'i32' | 'i64' | 'f32' | 'f64';
}

export interface WasmExportEntry {
  name: string;
  kind: 'func' | 'memory';
  index: number;
  params: WasmParamSpec[];
  result: string | null;
}

export interface WasmCompilationResult {
  valid: boolean;
  bytes: Uint8Array;
  hexDump: string;
  sizeBytes: number;
  exports: WasmExportEntry[];
  dataPayload: string;
  astJson: Record<string, unknown>;
  error?: string;
}

export interface JsonLdSchemaPackage {
  '@context': 'https://schema.org';
  '@type': string;
  name: string;
  $schema: string;
  $id: string;
  'x-package-format': 'grammar2json-ld-package/v2';
  'x-generated-at': string;
  'x-source-dialect': DialectConfig;
  'x-mutation-policy': MutationPolicy;
  schemaDocument: Record<string, unknown>;
  artifacts: {
    grammar: string;
    python?: { source: string; ast: PythonAstNode };
    rust?: { source: string; ast: RustAstModule };
    wasm?: { wat: string; byteLength: number; valid: boolean; ast: Record<string, unknown> };
  };
}

export interface WorkspaceSnapshot {
  version: string;
  savedAt: string;
  name: string;
  primaryLanguage: PrimaryLanguage;
  dialect: DialectConfig;
  schemaConfig: SchemaConfig;
  mutationPolicy: MutationPolicy;
  grammarText: string;
  jsonText: string;
  mutations: Record<string, LineMutation>;
  ruleConfigs?: Record<string, RuleOrderConfig>;
  evalRule: string;
  evalPayload: string;
  pythonSource: string;
  rustSource: string;
  watSource: string;
  verifiedSteps: WorkflowSlug[];
}

export interface VaultRecord {
  id: string;
  name: string;
  updatedAt: string;
  sizeBytes: number;
  source: 'drive' | 'demo';
  snapshot?: WorkspaceSnapshot;
}

export type McpServerId =
  | 'grammar'
  | 'rule_props'
  | 'logic_calc'
  | 'jsonld'
  | 'mutations'
  | 'evaluator'
  | 'python'
  | 'rust'
  | 'wasm'
  | 'wabt';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[]; default?: unknown }>;
    required?: string[];
  };
  sampleArgs: Record<string, unknown>;
}

export interface McpServerStatus {
  id: McpServerId;
  name: string;
  stage: PipelineStage;
  targetPage: WorkflowSlug;
  endpoint: string;
  description: string;
  state: 'cold' | 'warm';
  builtAt: string | null;
  buildCount: number;
  lastBuildMs: number | null;
  cacheEntries: number;
  cacheHits: number;
  cacheMisses: number;
  toolCount: number;
  tools: McpToolDefinition[];
}

export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

