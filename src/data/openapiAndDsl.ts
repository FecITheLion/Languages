import type {
  DialectConfig,
  DialectPresetId,
  DslEdge,
  DslFlowNode,
  GrammarRule,
  OpenApiSpec,
  ParsedDsl,
  SearchHit,
  WorkflowSlug,
} from '../types/studio.ts';

const LOGIC_LABELS_INPUT_SCHEMA = {
  anyOf: [
    { type: 'string' },
    { type: 'array', items: { type: ['string', 'number', 'boolean'] } },
    {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'kind', 'value'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          kind: { type: 'string', enum: ['number', 'boolean', 'lambda'] },
          value: { type: 'string' },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: {
        oneOf: [
          { type: ['string', 'number', 'boolean'] },
          {
            type: 'object',
            required: ['kind', 'value'],
            properties: {
              kind: { type: 'string', enum: ['number', 'boolean', 'lambda'] },
              value: { type: ['string', 'number', 'boolean'] },
            },
            additionalProperties: false,
          },
        ],
      },
    },
  ],
  description:
    'Label text, positional values, complete binding objects, or a name-to-value object. Use {kind:"lambda",value:"λx. ..."} for new callbacks. Empty arrays retain configured labels.',
};

export const OPENAPI_SPEC: OpenApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Grammar2JSON Studio — OpenAPI & DSL Workflow API',
    version: '2.1.0',
    description:
      'Bidirectional OpenAPI workflow controlling Grammar, Schema.org JSON-LD + Generated Schema Packages, Python ast, Rust syn AST, and WASM/WABT split pages with integrated search and declared mutation policies.',
  },
  servers: [{ url: './', description: 'Grammar2JSON Studio HTTP server' }],
  paths: {
    '/index.php?page=dialect': {
      get: {
        operationId: 'flowDialect',
        summary: '1. Frontend — Grammar Dialect & Dependency DAG',
        tags: ['Frontend'],
        'x-workbench-step': 1,
        'x-dsl-flow': 'FLOW_DIALECT',
        'x-language': 'grammar',
        'x-prev-page': 'gdrive',
        'x-next-page': 'rule_props',
        responses: { '200': { description: 'Grammar dialect rules and dependency graph workbench' } },
      },
    },
    '/index.php?page=rule_props': {
      get: {
        operationId: 'flowRuleProps',
        summary: '2. Frontend — Rule Properties, Precedence & Export',
        tags: ['Frontend'],
        'x-workbench-step': 2,
        'x-dsl-flow': 'FLOW_RULE_PROPS',
        'x-language': 'grammar',
        'x-prev-page': 'dialect',
        'x-next-page': 'logic_calc',
        responses: { '200': { description: 'Per-rule properties, order of operations, and language export' } },
      },
    },
    '/index.php?page=logic_calc': {
      get: {
        operationId: 'flowLogicCalc',
        summary: '3. Formal Logic — Symbolic Logic, Arithmetic & λ Calculus',
        tags: ['Formal Logic'],
        'x-workbench-step': 3,
        'x-dsl-flow': 'FLOW_LOGIC_CALC',
        'x-language': 'logic',
        'x-prev-page': 'rule_props',
        'x-next-page': 'schema',
        responses: { '200': { description: 'Logic symbol builder, lambda calculus callbacks, and 5-target export/parser' } },
      },
    },
    '/index.php?page=schema': {
      get: {
        operationId: 'flowSchema',
        summary: '4. IR & Schema — Schema.org JSON-LD & Mutation Policy',
        tags: ['IR & Schema'],
        'x-workbench-step': 4,
        'x-dsl-flow': 'FLOW_SCHEMA',
        'x-language': 'json',
        'x-prev-page': 'logic_calc',
        'x-next-page': 'mutations',
        responses: { '200': { description: 'Schema.org JSON-LD vocabulary & mutation policy workbench' } },
      },
    },
    '/index.php?page=mutations': {
      get: {
        operationId: 'flowMutations',
        summary: '5. IR & Schema — Line-by-Line Schema Transforms',
        tags: ['IR & Schema'],
        'x-workbench-step': 5,
        'x-dsl-flow': 'FLOW_MUTATIONS',
        'x-language': 'json',
        'x-prev-page': 'schema',
        'x-next-page': 'evaluator',
        responses: { '200': { description: 'Line-by-line schema transforms & declaration locks' } },
      },
    },
    '/index.php?page=evaluator': {
      get: {
        operationId: 'flowEvaluator',
        summary: '6. IR & Schema — Backtracking Parser & Trace',
        tags: ['IR & Schema'],
        'x-workbench-step': 6,
        'x-dsl-flow': 'FLOW_EVALUATOR',
        'x-language': 'grammar',
        'x-prev-page': 'mutations',
        'x-next-page': 'python_ast',
        responses: { '200': { description: 'Recursive descent backtracking grammar evaluator & trace' } },
      },
    },
    '/index.php?page=python_ast': {
      get: {
        operationId: 'flowPythonAst',
        summary: '7. Codegen — Python ast.Module & Unparse',
        tags: ['Codegen'],
        'x-workbench-step': 7,
        'x-dsl-flow': 'FLOW_PYTHON_AST',
        'x-language': 'python',
        'x-prev-page': 'evaluator',
        'x-next-page': 'rust_ast',
        responses: { '200': { description: 'Python ast.Module, ast.dump & ast.unparse codegen target' } },
      },
    },
    '/index.php?page=rust_ast': {
      get: {
        operationId: 'flowRustAst',
        summary: '8. Codegen — Rust syn / serde AST',
        tags: ['Codegen'],
        'x-workbench-step': 8,
        'x-dsl-flow': 'FLOW_RUST_AST',
        'x-language': 'rust',
        'x-prev-page': 'python_ast',
        'x-next-page': 'wasm_wabt',
        responses: { '200': { description: 'Rust syn::File AST & serde declaration codegen target' } },
      },
    },
    '/index.php?page=wasm_wabt': {
      get: {
        operationId: 'flowWasmWabt',
        summary: '9. Codegen — WebAssembly & WABT (wat2wasm)',
        tags: ['Codegen'],
        'x-workbench-step': 9,
        'x-dsl-flow': 'FLOW_WASM_WABT',
        'x-language': 'wasm',
        'x-prev-page': 'rust_ast',
        'x-next-page': 'mcp_servers',
        responses: { '200': { description: 'WAT S-expression, WABT binary encoder & WebAssembly runtime' } },
      },
    },
    '/index.php?page=mcp_servers': {
      get: {
        operationId: 'flowMcpServers',
        summary: '10. Codegen — Build-on-Call MCP Tool Servers (Cached)',
        tags: ['Codegen', 'MCP'],
        'x-workbench-step': 10,
        'x-dsl-flow': 'FLOW_MCP_SERVERS',
        'x-language': 'mcp',
        'x-prev-page': 'wasm_wabt',
        'x-next-page': 'payload_io',
        responses: { '200': { description: 'Lazy build-on-call cached MCP JSON-RPC 2.0 servers per target' } },
      },
    },
    '/api/mcp/{serverId}': {
      post: {
        operationId: 'invokeLazyMcpServer',
        summary: 'Invoke Lazy Build-on-Call MCP JSON-RPC 2.0 Tool Server',
        tags: ['MCP'],
        'x-language': 'mcp',
        parameters: [
          {
            name: 'serverId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: { '200': { description: 'JSON-RPC 2.0 MCP response with cache HIT/MISS metadata' } },
      },
    },
    '/api/logic/evaluate': {
      post: {
        operationId: 'evaluateLogic',
        summary: 'Evaluate logic with configured or supplied inputs',
        tags: ['Logic API'],
        'x-language': 'logic',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                anyOf: [
                  { type: 'null', description: 'Use the configured statement and labels.' },
                  {
                    type: 'string',
                    description:
                      'Statement text, known name=value bindings, or a combined JSON object/array encoded as text; blank text uses configured defaults.',
                  },
                  {
                    type: 'array',
                    minItems: 2,
                    maxItems: 2,
                    prefixItems: [{ type: 'string' }, { type: 'string' }],
                    description:
                      'Two strings form [statement, labels], except when both are numeric/boolean literals, which are positional values; blank members use defaults.',
                  },
                  {
                    type: 'array',
                    items: { type: ['string', 'number', 'boolean'] },
                    description:
                      'Positional literals; values map in order to configured non-lambda labels. Empty arrays use defaults.',
                  },
                  {
                    type: 'object',
                    properties: {
                      statement: { type: 'string', description: 'Legacy statement field.' },
                      labels: LOGIC_LABELS_INPUT_SCHEMA,
                      logic_statement: { type: 'string', description: 'Named statement field.' },
                      logic_labels: LOGIC_LABELS_INPUT_SCHEMA,
                      input: {
                        type: ['string', 'array', 'object', 'null'],
                        description: 'A single statement, combined JSON, or another supported input form.',
                      },
                      values: {
                        type: 'array',
                        items: { type: ['string', 'number', 'boolean'] },
                        description: 'Positional literal values for configured non-lambda labels.',
                      },
                    },
                    additionalProperties: false,
                    description:
                      'Omit or empty fields to use configured defaults. Existing statement/label fields remain supported.',
                  },
                ],
              },
            },
            'text/plain': {
              schema: {
                type: 'string',
                description: 'Statement text, known name=value bindings, or a combined JSON object/array string.',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Evaluation result, including matched value, trace, and evaluator errors.',
            content: {
              'application/hal+json': {
                schema: {
                  type: 'object',
                  required: ['statement', 'ok', 'displayValue', 'valueType', 'trace', '_links'],
                  properties: {
                    statement: { type: 'string' },
                    ok: { type: 'boolean' },
                    displayValue: { type: 'string' },
                    valueType: { type: 'string' },
                    trace: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['step', 'kind', 'expression', 'result'],
                        properties: {
                          step: { type: 'number' },
                          kind: { type: 'string', enum: ['beta', 'callback', 'logic', 'arith', 'bind'] },
                          expression: { type: 'string' },
                          result: { type: 'string' },
                        },
                      },
                    },
                    error: { type: ['string', 'null'] },
                    _links: { type: 'object' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Malformed, ambiguous, or incomplete input.',
            content: {
              'application/hal+json': {
                schema: {
                  type: 'object',
                  required: ['ok', 'error', '_links'],
                  properties: {
                    ok: { const: false },
                    error: { type: 'string' },
                    _links: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/index.php?page=payload_io': {
      get: {
        operationId: 'flowPayloadIO',
        summary: '11. Storage — JSON-LD Package & Artifact I/O',
        tags: ['Storage'],
        'x-workbench-step': 11,
        'x-dsl-flow': 'FLOW_PAYLOAD_IO',
        'x-language': 'json',
        'x-prev-page': 'mcp_servers',
        'x-next-page': 'gdrive',
        responses: { '200': { description: 'JSON-LD schema packaging and target selection I/O' } },
      },
    },
    '/index.php?page=gdrive': {
      get: {
        operationId: 'flowGoogleDrive',
        summary: '12. Storage — Google Drive Sync & Vault',
        tags: ['Storage'],
        'x-workbench-step': 12,
        'x-dsl-flow': 'FLOW_GDRIVE',
        'x-language': 'json',
        'x-prev-page': 'payload_io',
        'x-next-page': 'dialect',
        responses: { '200': { description: 'Google Drive OAuth2 and Demo Vault persistence' } },
      },
    },
    '/index.php?api=search': {
      get: {
        operationId: 'searchWorkflow',
        summary: 'Search OpenAPI Operations, DSL Flows, Languages & Rules',
        tags: ['Search'],
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: { '200': { description: 'Matching OpenAPI operations and DSL flow definitions' } },
      },
    },
    '/index.php?api=zip': {
      get: {
        operationId: 'downloadProjectZip',
        summary: 'Package and Download Full PHP/HTML/OpenAPI/DSL Website ZIP',
        tags: ['Packaging'],
        responses: { '200': { description: 'application/zip archive' } },
      },
    },
  },
};

export const DEFAULT_DSL_SOURCE = `# Grammar2JSON Studio — Industry Compiler Toolchain DSL Flow Definition
# Format: FLOW <id> | step=<n> | stage=<frontend|formal|ir|codegen|storage> | page=<slug> | lang=<grammar|logic|json|python|rust|wasm|mcp> | verify=<rule> | next=<next_id> | label=<title>
#
# Implemented REST contract (served by server.ts, not a workflow/UI route):
# POST /api/logic/evaluate, Content-Type: application/json or text/plain
# Omitted/empty input uses the configured logic statement and label bindings.
# Accepted inputs: statement text; [statement, labels] string pair (unless both
# strings are numeric/boolean literals); positional literal arrays; or
# {"logic_statement":"...", "logic_labels":"..."}.
# logic_labels accepts name=value text, positional text/arrays, or a JSON object
# string/object. New number/boolean names infer kind; callbacks require an
# explicit {"kind":"lambda","value":"λx. ..."} value. Legacy label bindings
# remain supported. Invalid/ambiguous inputs return HTTP 400.

FLOW FLOW_DIALECT     | step=1  | stage=frontend | page=dialect     | lang=grammar | verify=has_rules        | next=FLOW_RULE_PROPS  | label=1. Grammar & DAG
FLOW FLOW_RULE_PROPS  | step=2  | stage=frontend | page=rule_props  | lang=grammar | verify=has_rules        | next=FLOW_LOGIC_CALC  | label=2. Rule Props & Ops
FLOW FLOW_LOGIC_CALC  | step=3  | stage=formal   | page=logic_calc  | lang=logic   | verify=logic_ready      | next=FLOW_SCHEMA      | label=3. Logic & λ Calc
FLOW FLOW_SCHEMA      | step=4  | stage=ir       | page=schema      | lang=json    | verify=valid_json       | next=FLOW_MUTATIONS   | label=4. Schema.org IR
FLOW FLOW_MUTATIONS   | step=5  | stage=ir       | page=mutations   | lang=json    | verify=mutations_ready  | next=FLOW_EVALUATOR    | label=5. Schema Mutator
FLOW FLOW_EVALUATOR   | step=6  | stage=ir       | page=evaluator   | lang=grammar | verify=eval_ready       | next=FLOW_PYTHON_AST  | label=6. Parser & Trace
FLOW FLOW_PYTHON_AST  | step=7  | stage=codegen  | page=python_ast  | lang=python  | verify=py_ast_valid     | next=FLOW_RUST_AST    | label=7. Python AST
FLOW FLOW_RUST_AST    | step=8  | stage=codegen  | page=rust_ast    | lang=rust    | verify=rust_ast_valid   | next=FLOW_WASM_WABT   | label=8. Rust syn AST
FLOW FLOW_WASM_WABT   | step=9  | stage=codegen  | page=wasm_wabt   | lang=wasm    | verify=wasm_valid       | next=FLOW_MCP_SERVERS | label=9. WASM & WABT
FLOW FLOW_MCP_SERVERS | step=10 | stage=codegen  | page=mcp_servers | lang=mcp     | verify=mcp_ready        | next=FLOW_PAYLOAD_IO  | label=10. MCP Servers
FLOW FLOW_PAYLOAD_IO  | step=11 | stage=storage  | page=payload_io  | lang=json    | verify=bundle_ready     | next=FLOW_GDRIVE      | label=11. Package & I/O
FLOW FLOW_GDRIVE      | step=12 | stage=storage  | page=gdrive      | lang=json    | verify=drive_ready      | next=FLOW_DIALECT     | label=12. Drive Vault

# Bidirectional Language, Logic & Lazy MCP Mutation Graph
EDGE grammar    <-> json       | codec=SchemaOrgJsonLdCompiler
EDGE logic_calc <-> python_ast | codec=LambdaCalculusPythonCodec
EDGE logic_calc <-> rust_ast   | codec=LambdaCalculusRustCodec
EDGE logic_calc <-> wasm_wabt  | codec=LambdaCalculusWasmCodec
EDGE json       <-> python_ast | codec=PythonAstLiteralEval
EDGE json       <-> rust_ast   | codec=RustSynSerdeCodec
EDGE rust_ast   <-> wasm_wabt  | codec=RustWasmBindgenCodec
EDGE json       <-> wasm_wabt  | codec=WasmLinearMemoryData
EDGE all_stages <-> mcp_server | codec=LazyBuildOnCallMcpCache`;

const VALID_PAGES = new Set<WorkflowSlug>([
  'dialect',
  'rule_props',
  'logic_calc',
  'schema',
  'mutations',
  'evaluator',
  'payload_io',
  'gdrive',
  'python_ast',
  'rust_ast',
  'wasm_wabt',
  'mcp_servers',
]);

export function parseDslFlows(dslSource: string): ParsedDsl {
  const flows: DslFlowNode[] = [];
  const edges: DslEdge[] = [];

  for (const rawLine of dslSource.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('FLOW ')) {
      const parts = trimmed
        .slice(5)
        .split('|')
        .map((p) => p.trim());
      const id = parts.shift() || 'FLOW_CUSTOM';
      const meta: Record<string, string> = {};
      for (const kv of parts) {
        const eqIdx = kv.indexOf('=');
        if (eqIdx > 0) {
          meta[kv.slice(0, eqIdx).trim()] = kv.slice(eqIdx + 1).trim();
        }
      }
      const pageCandidate = (meta.page || 'dialect') as WorkflowSlug;
      const page: WorkflowSlug = VALID_PAGES.has(pageCandidate) ? pageCandidate : 'dialect';
      const langRaw = meta.lang || 'json';
      const lang =
        langRaw === 'grammar' ||
        langRaw === 'logic' ||
        langRaw === 'json' ||
        langRaw === 'python' ||
        langRaw === 'rust' ||
        langRaw === 'wasm' ||
        langRaw === 'mcp'
          ? langRaw
          : 'json';
      const stageRaw = meta.stage || 'ir';
      const stage =
        stageRaw === 'frontend' ||
        stageRaw === 'formal' ||
        stageRaw === 'ir' ||
        stageRaw === 'codegen' ||
        stageRaw === 'storage'
          ? stageRaw
          : 'ir';

      flows.push({
        id,
        step: Number.parseInt(meta.step || String(flows.length + 1), 10) || flows.length + 1,
        stage,
        page,
        lang,
        verify: meta.verify || 'always_ok',
        next: meta.next || 'FLOW_DIALECT',
        label: meta.label || `${flows.length + 1}. ${page}`,
      });
    } else if (trimmed.startsWith('EDGE ')) {
      const parts = trimmed
        .slice(5)
        .split('|')
        .map((p) => p.trim());
      edges.push({
        relation: parts[0] || '',
        codec: (parts[1] || '').replace(/^codec=/, '').trim(),
      });
    }
  }

  flows.sort((a, b) => a.step - b.step);
  return { flows, edges };
}

export function reorderDslFlows(
  dslSource: string,
  sourceFlowId: string,
  targetFlowId: string,
  position: 'before' | 'after'
): string {
  if (sourceFlowId === targetFlowId) return dslSource;
  const parsed = parseDslFlows(dslSource);
  const srcIdx = parsed.flows.findIndex((f) => f.id === sourceFlowId);
  const tgtIdx = parsed.flows.findIndex((f) => f.id === targetFlowId);
  if (srcIdx === -1 || tgtIdx === -1) return dslSource;

  const reordered = [...parsed.flows];
  const [moved] = reordered.splice(srcIdx, 1);
  const newTargetIdx = reordered.findIndex((f) => f.id === targetFlowId);
  const insertAt = position === 'before' ? newTargetIdx : newTargetIdx + 1;
  reordered.splice(insertAt, 0, moved);

  const flowLines = reordered.map((flow, idx) => {
    const stepNum = idx + 1;
    const nextId = reordered[(idx + 1) % reordered.length].id;
    const cleanTitle = flow.label.replace(/^\d+\.\s*/, '');
    return `FLOW ${flow.id.padEnd(15)} | step=${String(stepNum).padEnd(2)} | stage=${flow.stage.padEnd(8)} | page=${flow.page.padEnd(10)} | lang=${flow.lang.padEnd(7)} | verify=${flow.verify.padEnd(16)} | next=${nextId.padEnd(15)} | label=${stepNum}. ${cleanTitle}`;
  });

  const edgeLines = parsed.edges.map(
    (edge) => `EDGE ${edge.relation.padEnd(24)} | codec=${edge.codec}`
  );

  return [
    '# Grammar2JSON Studio — Industry Compiler Toolchain DSL Flow Definition',
    '# Format: FLOW <id> | step=<n> | stage=<frontend|formal|ir|codegen|storage> | page=<slug> | lang=<grammar|logic|json|python|rust|wasm> | verify=<rule> | next=<next_id> | label=<title>',
    '',
    ...flowLines,
    '',
    '# Bidirectional Language & Logic Mutation Graph',
    ...edgeLines,
  ].join('\n');
}

export const DEFAULT_GRAMMAR_SYMBOLS = {
  oneOrMore: '+',
  zeroOrMore: '*',
  optional: '?',
  repeatBraces: '{}',
  groupParens: '()',
  charClassBrackets: '[]',
  posLookahead: '&',
  negLookahead: '!',
  posLookbehind: '(?<=',
  negLookbehind: '(?<!',
  wildcard: '.',
  regexDelimiter: '/',
} as const;

export const DIALECT_PRESETS: Record<
  DialectPresetId,
  { label: string; config: DialectConfig; sampleGrammar: string; sampleRule: string; samplePayload: string }
> = {
  ebnf: {
    label: 'EBNF Standard (::= | //)',
    config: {
      preset: 'ebnf',
      ruleOperator: '::=',
      choiceDelimiter: '|',
      commentPrefix: '//',
      symbols: { ...DEFAULT_GRAMMAR_SYMBOLS },
    },
    sampleGrammar: `// Schema.org Order Action EBNF Grammar
order_expr ::= action_verb ' ' item_code ' ' quantity
action_verb ::= 'BUY' | 'RESERVE' | 'SHIP'
item_code ::= 'SKU-' digit digit digit
quantity ::= digit+
digit ::= '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'`,
    sampleRule: 'order_expr',
    samplePayload: 'BUY SKU-402 12',
  },
  bnf: {
    label: 'Classic BNF (::= | #)',
    config: {
      preset: 'bnf',
      ruleOperator: '::=',
      choiceDelimiter: '|',
      commentPrefix: '#',
      symbols: { ...DEFAULT_GRAMMAR_SYMBOLS },
    },
    sampleGrammar: `# Classic BNF Routing Expression
route ::= '/' segment '/' segment
segment ::= 'api' | 'v1' | 'schemas' | 'ast' | 'rust' | 'wasm'`,
    sampleRule: 'route',
    samplePayload: '/api/schemas',
  },
  peg: {
    label: 'PEG / Assignment (= / #)',
    config: {
      preset: 'peg',
      ruleOperator: '=',
      choiceDelimiter: '/',
      commentPrefix: '#',
      symbols: { ...DEFAULT_GRAMMAR_SYMBOLS, regexDelimiter: '' },
    },
    sampleGrammar: `# Parsing Expression Grammar (Ordered Choice)
kv_pair = key '=' value
key = 'dialect' / 'schema' / 'target'
value = 'json' / 'python' / 'rust' / 'wasm'`,
    sampleRule: 'kv_pair',
    samplePayload: 'target=rust',
  },
  python_peg: {
    label: 'Python Grammar (PEG : | #)',
    config: {
      preset: 'python_peg',
      ruleOperator: ':',
      choiceDelimiter: '|',
      commentPrefix: '#',
      symbols: { ...DEFAULT_GRAMMAR_SYMBOLS },
    },
    sampleGrammar: `# Python 3.12 Style PEG Subset
stmt: assign_stmt | return_stmt
assign_stmt: ident ' = ' literal
return_stmt: 'return ' ident
ident: 'schema_id' | 'rules_count' | 'ast_node'
literal: '42' | '200' | 'ok'`,
    sampleRule: 'stmt',
    samplePayload: 'schema_id = 42',
  },
  rust_macro: {
    label: 'Rust Macro / syn Grammar (=> | //)',
    config: {
      preset: 'rust_macro',
      ruleOperator: '=>',
      choiceDelimiter: '|',
      commentPrefix: '//',
      symbols: { ...DEFAULT_GRAMMAR_SYMBOLS },
    },
    sampleGrammar: `// Rust syn / macro_rules! Declaration Grammar
item_decl => visibility ' ' item_kind ' ' ident
visibility => 'pub' | 'pub(crate)'
item_kind => 'struct' | 'enum' | 'fn'
ident => 'OrderSchema' | 'AstNode' | 'WasmModule'`,
    sampleRule: 'item_decl',
    samplePayload: 'pub struct OrderSchema',
  },
  wat_sexpr: {
    label: 'WABT S-Expr Grammar (:= | ;;)',
    config: {
      preset: 'wat_sexpr',
      ruleOperator: ':=',
      choiceDelimiter: '|',
      commentPrefix: ';;',
      symbols: { ...DEFAULT_GRAMMAR_SYMBOLS },
    },
    sampleGrammar: `;; WebAssembly S-Expression Instruction Grammar
wasm_inst := '(' opcode ' ' operand ')'
opcode := 'i32.const' | 'i32.add' | 'local.get'
operand := digit+
digit := '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'`,
    sampleRule: 'wasm_inst',
    samplePayload: '(i32.const 201)',
  },
};

export function searchStudio(
  query: string,
  openapi: OpenApiSpec,
  dsl: ParsedDsl,
  rules: GrammarRule[],
  pythonSymbols: string[],
  rustSymbols: string[],
  wasmExports: string[]
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: SearchHit[] = [];

  for (const [route, methods] of Object.entries(openapi.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const haystack = [
        route,
        op.operationId,
        op.summary,
        op['x-dsl-flow'] || '',
        op['x-language'] || '',
        ...(op.tags || []),
      ]
        .join(' ')
        .toLowerCase();
      if (haystack.includes(q)) {
        const pageMatch = route.match(/page=([a-z_]+)/);
        const targetPage = route.includes('/api/mcp')
          ? 'mcp_servers'
          : ((pageMatch?.[1] as WorkflowSlug) || 'dialect');
        hits.push({
          id: `oa-${op.operationId}`,
          kind: route.includes('/api/mcp') ? 'MCP Tool Server' : 'OpenAPI Operation',
          title: op.summary,
          subtitle: `${op.operationId} · ${op['x-dsl-flow'] || route}`,
          method: method.toUpperCase(),
          targetPage: VALID_PAGES.has(targetPage) ? targetPage : 'dialect',
          language: op['x-language'] || 'all',
        });
      }
    }
  }

  for (const edge of dsl.edges) {
    const haystack = `${edge.relation} ${edge.codec}`.toLowerCase();
    if (haystack.includes(q)) {
      const targetPage: WorkflowSlug = edge.relation.includes('wasm')
        ? 'wasm_wabt'
        : edge.relation.includes('rust')
          ? 'rust_ast'
          : edge.relation.includes('python')
            ? 'python_ast'
            : 'schema';
      hits.push({
        id: `edge-${edge.codec}`,
        kind: 'DSL Mutation Edge',
        title: edge.relation,
        subtitle: `Codec: ${edge.codec}`,
        method: 'BIDI',
        targetPage,
        language: 'all',
      });
    }
  }

  for (const rule of rules) {
    const haystack = `${rule.name} ${rule.expression}`.toLowerCase();
    if (haystack.includes(q)) {
      hits.push({
        id: `rule-${rule.name}-${rule.lineNumber}`,
        kind: 'Grammar Rule',
        title: rule.name,
        subtitle: `Line ${rule.lineNumber} · ${rule.expression}`,
        method: 'RULE',
        targetPage: 'dialect',
        language: 'grammar',
      });
    }
  }

  for (const sym of pythonSymbols) {
    if (sym.toLowerCase().includes(q)) {
      hits.push({
        id: `py-${sym}`,
        kind: 'Python AST',
        title: sym,
        subtitle: 'Python ast.Module symbol',
        method: 'PY',
        targetPage: 'python_ast',
        language: 'python',
      });
    }
  }

  for (const sym of rustSymbols) {
    if (sym.toLowerCase().includes(q)) {
      hits.push({
        id: `rs-${sym}`,
        kind: 'Rust AST',
        title: sym,
        subtitle: 'Rust syn AST item',
        method: 'RS',
        targetPage: 'rust_ast',
        language: 'rust',
      });
    }
  }

  for (const exp of wasmExports) {
    if (exp.toLowerCase().includes(q)) {
      hits.push({
        id: `wasm-${exp}`,
        kind: 'WASM Export',
        title: exp,
        subtitle: 'Exported WebAssembly symbol',
        method: 'WASM',
        targetPage: 'wasm_wabt',
        language: 'wasm',
      });
    }
  }

  const mcpSearchCatalog: Array<{ id: string; title: string; subtitle: string; page: WorkflowSlug }> = [
    {
      id: 'pipeline',
      title: '/api/mcp/pipeline — Pipeline Grid & Breadcrumbs MCP Server',
      subtitle: 'get_pipeline_grid · get_breadcrumbs · navigate_pipeline · reorder_pipeline_steps · verify_pipeline_step · run_full_pipeline',
      page: 'mcp_servers',
    },
    {
      id: 'grammar',
      title: '/api/mcp/grammar — Grammar & DAG MCP Server',
      subtitle: 'parse_and_analyze_dag · reorder_rules · merge_rules',
      page: 'mcp_servers',
    },
    {
      id: 'logic_calc',
      title: '/api/mcp/logic_calc — Logic & Lambda Calculus MCP Server',
      subtitle: 'evaluate_logic_lambda · export_logic_target · parse_logic_artifact',
      page: 'mcp_servers',
    },
    {
      id: 'jsonld',
      title: '/api/mcp/jsonld — Schema.org JSON-LD MCP Server',
      subtitle: 'compile_grammar_to_jsonld · decompile_jsonld_to_grammar · build_jsonld_package',
      page: 'mcp_servers',
    },
  ];

  for (const srv of mcpSearchCatalog) {
    const hay = `${srv.id} ${srv.title} ${srv.subtitle} breadcrumb breadcrumbs pipeline mcp`.toLowerCase();
    if (hay.includes(q)) {
      hits.push({
        id: `mcp-${srv.id}`,
        kind: 'MCP Tool Server',
        title: srv.title,
        subtitle: srv.subtitle,
        method: 'MCP',
        targetPage: srv.page,
        language: 'mcp',
      });
    }
  }

  return hits.slice(0, 20);
}
