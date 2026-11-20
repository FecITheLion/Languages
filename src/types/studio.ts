export type DialectPresetId = 'ebnf' | 'bnf' | 'peg' | 'python_peg' | 'rust_macro' | 'wat_sexpr';

export type SchemaPresetId = 'hybrid' | 'definedTermSet' | 'softwareSource';

export type PrimaryLanguage =
  | 'json'
  | 'python'
  | 'rust'
  | 'wasm'
  | 'typescript'
  | 'javascript'
  | 'go'
  | 'java'
  | 'cpp'
  | 'csharp'
  | 'php'
  | 'sql'
  | 'swift'
  | 'kotlin'
  | 'ruby'
  | 'scala'
  | 'haskell'
  | 'elixir'
  | 'lua'
  | 'zig'
  | 'dart'
  | 'ocaml';

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

export type TopView = 'workbench' | 'graph' | 'histolog' | 'api' | 'files' | 'openapi' | 'dsl' | 'bundle';

export type TransformTarget = 'jsonld' | 'python' | 'rust' | 'wasm';

export type RuleMergeStrategy = 'choice' | 'sequence' | 'inline';

export type ExportLanguage =
  | 'grammar'
  | 'jsonld'
  | 'python'
  | 'rust'
  | 'wat'
  | 'typescript'
  | 'javascript'
  | 'go'
  | 'java'
  | 'cpp'
  | 'csharp'
  | 'php'
  | 'sql'
  | 'swift'
  | 'kotlin'
  | 'ruby'
  | 'scala'
  | 'haskell'
  | 'elixir'
  | 'lua'
  | 'zig'
  | 'dart'
  | 'ocaml';

export interface SupportedLanguageSpec {
  id: PrimaryLanguage;
  exportId: ExportLanguage;
  label: string;
  shortLabel: string;
  extension: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguageSpec[] = [
  { id: 'json', exportId: 'jsonld', label: 'JSON-LD (Schema.org)', shortLabel: 'JSON-LD', extension: '.jsonld' },
  { id: 'python', exportId: 'python', label: 'Python', shortLabel: 'Python', extension: '.py' },
  { id: 'rust', exportId: 'rust', label: 'Rust', shortLabel: 'Rust', extension: '.rs' },
  { id: 'wasm', exportId: 'wat', label: 'WASM / WABT', shortLabel: 'WASM', extension: '.wat' },
  { id: 'typescript', exportId: 'typescript', label: 'TypeScript', shortLabel: 'TypeScript', extension: '.ts' },
  { id: 'javascript', exportId: 'javascript', label: 'JavaScript (ESM)', shortLabel: 'JavaScript', extension: '.mjs' },
  { id: 'go', exportId: 'go', label: 'Go', shortLabel: 'Go', extension: '.go' },
  { id: 'java', exportId: 'java', label: 'Java', shortLabel: 'Java', extension: '.java' },
  { id: 'cpp', exportId: 'cpp', label: 'C++ (C++20)', shortLabel: 'C++', extension: '.hpp' },
  { id: 'csharp', exportId: 'csharp', label: 'C# (.NET)', shortLabel: 'C#', extension: '.cs' },
  { id: 'php', exportId: 'php', label: 'PHP 8', shortLabel: 'PHP', extension: '.php' },
  { id: 'sql', exportId: 'sql', label: 'SQL (DDL / Rules)', shortLabel: 'SQL', extension: '.sql' },
  { id: 'swift', exportId: 'swift', label: 'Swift 6', shortLabel: 'Swift', extension: '.swift' },
  { id: 'kotlin', exportId: 'kotlin', label: 'Kotlin', shortLabel: 'Kotlin', extension: '.kt' },
  { id: 'ruby', exportId: 'ruby', label: 'Ruby 3', shortLabel: 'Ruby', extension: '.rb' },
  { id: 'scala', exportId: 'scala', label: 'Scala 3', shortLabel: 'Scala', extension: '.scala' },
  { id: 'haskell', exportId: 'haskell', label: 'Haskell', shortLabel: 'Haskell', extension: '.hs' },
  { id: 'elixir', exportId: 'elixir', label: 'Elixir', shortLabel: 'Elixir', extension: '.ex' },
  { id: 'lua', exportId: 'lua', label: 'Lua 5.4', shortLabel: 'Lua', extension: '.lua' },
  { id: 'zig', exportId: 'zig', label: 'Zig', shortLabel: 'Zig', extension: '.zig' },
  { id: 'dart', exportId: 'dart', label: 'Dart 3', shortLabel: 'Dart', extension: '.dart' },
  { id: 'ocaml', exportId: 'ocaml', label: 'OCaml', shortLabel: 'OCaml', extension: '.ml' },
];

export type EngineSectionKey =
  | 'all'
  | 'grammar'
  | 'mutations'
  | 'jsonld'
  | 'logic'
  | 'evaluator'
  | 'dsl'
  | 'python'
  | 'rust'
  | 'wat'
  | 'callbacks';

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

export interface GrammarSymbolDefinitions {
  oneOrMore?: string;
  zeroOrMore?: string;
  optional?: string;
  repeatBraces?: string;
  groupParens?: string;
  charClassBrackets?: string;
  posLookahead?: string;
  negLookahead?: string;
  posLookbehind?: string;
  negLookbehind?: string;
  wildcard?: string;
  regexDelimiter?: string;
}

export interface GrammarSymbolStatus {
  key: keyof GrammarSymbolDefinitions;
  label: string;
  value: string;
  enabled: boolean;
  usageCount: number;
}

export interface DialectConfig {
  preset: DialectPresetId;
  ruleOperator: string;
  choiceDelimiter: string;
  commentPrefix: string;
  symbols?: GrammarSymbolDefinitions;
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
    | 'UNREACHABLE'
    | 'DISABLED_SYMBOL';
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
  usedOperators?: string[];
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
  symbolRegistry?: GrammarSymbolStatus[];
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
  requestBody?: {
    required?: boolean;
    content: Record<string, { schema: Record<string, unknown> }>;
  };
  responses: Record<
    string,
    {
      description: string;
      content?: Record<string, { schema: Record<string, unknown> }>;
    }
  >;
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
  virtualFiles?: import('../engine/virtualFiles').VirtualFiles;
}

export interface VaultRecord {
  id: string;
  name: string;
  updatedAt: string;
  sizeBytes: number;
  source: 'drive' | 'demo';
  snapshot?: WorkspaceSnapshot;
}

export type PipelineGridMode = 'compact' | 'lanes' | 'rail';

export interface BreadcrumbSibling {
  id: string;
  label: string;
  sublabel?: string;
  active: boolean;
  verified?: boolean;
  targetTopView?: TopView;
  targetStage?: 'all' | PipelineStage;
  targetPage?: WorkflowSlug;
}

export interface BreadcrumbItem {
  id: string;
  position: number;
  label: string;
  kind: 'root' | 'view' | 'stage' | 'step' | 'context';
  href: string;
  current: boolean;
  targetTopView?: TopView;
  targetStage?: 'all' | PipelineStage;
  targetPage?: WorkflowSlug;
  siblings?: BreadcrumbSibling[];
}

export interface SchemaOrgBreadcrumbList {
  '@context': 'https://schema.org';
  '@type': 'BreadcrumbList';
  name: string;
  numberOfItems: number;
  itemListElement: Array<{
    '@type': 'ListItem';
    position: number;
    name: string;
    item: string;
    identifier: string;
  }>;
}

export type McpServerId =
  | 'pipeline'
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

