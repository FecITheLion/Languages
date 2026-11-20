export interface StudioDocEntry {
  key: string;
  title: string;
  category: string;
  summary: string;
  syntax?: string;
  example?: string;
  notes?: string;
}

export const STUDIO_DOCS: Record<string, StudioDocEntry> = {
  ruleOperator: {
    key: 'ruleOperator',
    title: 'Rule Operator (Live Rewrite)',
    category: '01. Syntax Dialect',
    summary:
      'Separates the left-hand rule identifier from its production expression. Editing this token live-rewrites every existing rule operator in your grammar.',
    syntax: '<rule_name> <ruleOperator> <expression>  |  leave empty ("") for space-separated rules',
    example: 'order_expr ::= action_verb item_code  →  order_expr := action_verb item_code  or  order_expr action_verb item_code',
    notes: 'Quoted literals inside rule expressions are preserved untouched during live rewrites.',
  },
  choiceDelimiter: {
    key: 'choiceDelimiter',
    title: 'Choice Delimiter (Live Rewrite)',
    category: '01. Syntax Dialect',
    summary:
      'Separates ordered or unordered alternative branches in a rule. Editing this field live-rewrites every unquoted choice delimiter across all rules.',
    syntax: "branch_a <choiceDelimiter> branch_b",
    example: "'BUY' | 'RESERVE' | 'SHIP'  →  'BUY' / 'RESERVE' / 'SHIP'",
    notes: 'Delimiters inside single quotes, double quotes, character classes [...], and regexes are safely skipped.',
  },
  commentPrefix: {
    key: 'commentPrefix',
    title: 'Comment Prefix (Live Rewrite)',
    category: '01. Syntax Dialect',
    summary:
      'Marks full-line comments in the grammar source. Editing this value live-rewrites every existing comment line prefix.',
    syntax: '<commentPrefix> explanatory text',
    example: '// Schema.org Order Grammar  →  ;; Schema.org Order Grammar  or  # Schema.org Order Grammar',
    notes: 'Comment headers are preserved when sorting, merging, splitting, or round-tripping JSON-LD.',
  },
  extendedDagSymbols: {
    key: 'extendedDagSymbols',
    title: 'Extended DAG Symbol Definitions',
    category: '01. Syntax Dialect & DAG',
    summary:
      'Controls which regex/EBNF/PEG operator tokens are active in the Extended DAG analyzer and backtracking evaluator. Set any symbol to a non-empty token to enable it, or clear it (empty) to disable that operator.',
    syntax: 'oneOrMore (+), zeroOrMore (*), optional (?), repeatBraces ({}), groupParens (()), charClassBrackets ([]), posLookahead (&), negLookahead (!), posLookbehind ((?<=), negLookbehind ((?<!), wildcard (.), regexDelimiter (/)',
    example: 'quantity ::= digit+  matches "12" (14/14 chars) when oneOrMore is "+"; clearing "+" disables repetition and emits a DISABLED_SYMBOL diagnostic.',
    notes: 'Custom multi-character tokens are supported and tracked live with per-symbol usage counts in the Rule Dependency Graph.',
  },
  cauchySequence: {
    key: 'cauchySequence',
    title: 'Cauchy Sequence Analyzer',
    category: '03. Logic & Lambda',
    summary:
      'Evaluates iterative numerical recurrences and verifies the Cauchy convergence criterion: ∀ε > 0, ∃N such that ∀m,n ≥ N, |a_m - a_n| < ε.',
    syntax: 'Parameter styles: Positional (_1, _2 or _0, _1) · Directional (left, right, mid) · Given Names (e.g. a, b)',
    example: 'Seeds: "0, 1", Recurrence: "(left + right) / 2" → converges to 0.666667 (2/3) with Cauchy Index N(0.0001) = 13.',
    notes: 'All saved Local Global Callbacks and logic labels are automatically in scope inside the recurrence expression and exported to Python, JSON-LD, and TypeScript.',
  },
  globalCallbacks: {
    key: 'globalCallbacks',
    title: 'Local Global Lambda Callbacks',
    category: '02. Rule Properties & 03. Logic',
    summary:
      'Persists reusable named λ closures to localStorage so you can invoke them inside Custom Rule Properties, Logic Labels, and Cauchy recurrences.',
    syntax: 'Direct call: tax_fn (100)  |  Formula: =apply_discount (200, 15)  |  Template: Total {{tax_fn (price)}}',
    example: 'λprice. price * 1.08 saved as tax_fn → calling tax_fn (100) evaluates live to 108.',
    notes: 'Also addressable over REST/CRUD/HATEOAS at /api/callbacks and /api/nodes/callback/:id.',
  },
  histologUndoRedo: {
    key: 'histologUndoRedo',
    title: 'Undo/Redo Chain & Generational Histolog',
    category: 'History & Diff',
    summary:
      'Every workspace edit records a fingerprinted generation (G0..Gn) with an inverted symbol/field/source index. Undo and Redo step along the exact generational chain with live references to the historic unified diff.',
    syntax: 'Ctrl/Cmd+Z (Undo) · Ctrl/Cmd+Shift+Z or Ctrl+Y (Redo) · Click G(a)↔G(b) to inspect exact line diff',
    example: 'Undo G4 → G3 restores Grammar, JSON-LD, Mutations, Logic, and ASTs while preserving G4 for Redo or selective section restore.',
    notes: 'Export/import full archives via .histolog.json, .histolog.ndjson, or unified .diff.patch.',
  },
  clearRestoreEngine: {
    key: 'clearRestoreEngine',
    title: 'Clear Engine / Selective Section Clear & Restore',
    category: 'Engine Lifecycle',
    summary:
      'Clear the entire engine to a blank slate or clear any individual section (Grammar, Mutations, JSON-LD, Logic, Evaluator, DSL, Python, Rust, WAT, Callbacks), or restore either the full engine or a single section to any historical generation.',
    syntax: 'Toolbar → Clear / Restore  |  Histolog Diff Header → Restore <Section> to G<n>',
    example: 'Restore only "Grammar" from G1 while keeping your newer Logic/Cauchy state intact.',
    notes: 'A safety checkpoint is automatically recorded in Histolog before any Clear operation.',
  },
  hateoasRestNodes: {
    key: 'hateoasRestNodes',
    title: 'HATEOAS & Node/Member-Level REST CRUD',
    category: 'API Studio & Server',
    summary:
      'Every engine resource and graph node exposes HAL+JSON hypermedia (_links & _actions) and RFC 8288 Link headers down to every individual mutable and non-mutable member.',
    syntax: 'GET /api/nodes/:kind/:id/members/:member  |  PUT/PATCH/DELETE (200 on mutable · 405 Method Not Allowed on immutable · 423 on policy-locked)',
    example: 'PATCH /api/nodes/rule/quantity/members/expression updates <quantity>; PATCH .../members/inDegree returns 405 with Allow: GET, HEAD, OPTIONS.',
    notes: 'Explore and follow live links interactively in the Postman-style API Studio view.',
  },
  domDragSplitMerge: {
    key: 'domDragSplitMerge',
    title: 'DOM Drag-and-Drop: Order, Merge & Biject/Split',
    category: 'Higher Echelons & Routine Builder',
    summary:
      'Drag any element in Workbench, Rule Graph, OpenAPI Spec, DSL Flows, Export Bundle, or the Sequential Routine Builder. While dragging, temporary drop zones appear for Before, After, Merge, and every possible Split/Biject boundary.',
    syntax: 'Drag handle → hover dashed drop slots: [Insert Before] · [Merge Composite] · [Temp Split Slot] · [Insert After]',
    example: 'Drag step A onto a Split Slot on step B to biject/split step B and splice A cleanly, or drop onto Merge to combine into a reversible composite artifact.',
    notes: 'Biject/Split operations preserve inverse symmetry so merged artifacts can be cleanly split back apart.',
  },
  mcpClientExport: {
    key: 'mcpClientExport',
    title: 'MCP Server Export (VS Code, Ollama, OpenClaw, Cursor)',
    category: '10. MCP Tool Servers',
    summary:
      'Generates drop-in Streamable HTTP MCP client configurations for VS Code (.vscode/mcp.json), Ollama MCP bridges, OpenClaw agents, Cursor, Claude Desktop, Windsurf, and cURL.',
    syntax: 'GET /api/mcp/:serverId/export/:client  (client = vscode | ollama | openclaw | cursor | claude | windsurf | curl)',
    example: 'Select "VS Code" or "OpenClaw" and click Export to download a ready-to-use config pointing to your build-on-call endpoints.',
    notes: 'Servers build lazily on first JSON-RPC 2.0 call and cache results by content hash.',
  },
  languageSelection: {
    key: 'languageSelection',
    title: '22-Language Compilation & Selection',
    category: 'Workspace & Codegen',
    summary:
      'Switch the active target language anywhere in the Studio across 22 languages: JSON-LD, Python, Rust, WASM/WABT, TypeScript, JavaScript, Go, Java, C++, C#, PHP, SQL, Swift, Kotlin, Ruby, Scala, Haskell, Elixir, Lua, Zig, Dart, and OCaml.',
    syntax: 'Toolbar Language Selector · Rule Properties Export · Logic & Cauchy Export · GET /api/export/:language',
    example: 'Selecting Go, Rust, or TypeScript updates the Live State Mirror code output and syncs your default export target across workbenches.',
    notes: 'All 22 languages are also exposed over HATEOAS at /api/languages.',
  },
  cliLiteralParams: {
    key: 'cliLiteralParams',
    title: 'CLI Named Literal Parameters & Editable Strings',
    category: '03. Export & CLI Codegen',
    summary:
      'Every exported script exposes each bound literal variable as a named CLI option (--<name> <literal>), plus editable string overrides (--input, --statement, --grammar), automatically falling back to the embedded defaults when omitted.',
    syntax: 'python3 logic_lambda_calc.py --price 120 --tax 15  |  --input "price=80 tax=8"  |  --statement "price + tax * 2"  |  (no args = defaults)',
    example: 'Pass --P true --Q false to override booleans as literals, or pass --input "50 10" to parse all inputs from a single grammar-guided string.',
    notes: 'Precedence: Embedded Defaults → Grammar-parsed --input / positional string → Explicit --<name> literal flags.',
  },
  globalEquationPipeline: {
    key: 'globalEquationPipeline',
    title: 'Global Equation Pipeline Creator & Superset-Script',
    category: '03. Logic & Pipeline Composer',
    summary:
      'Collects exported equations from 03. Symbolic Logic, Arithmetic & Lambda Calculus Calculator under referencable call names and composes them into a single executable superset-script with CLI inputs, branching, piping, and nested sub-pipelines.',
    syntax: 'Export & Parse → Add to Global Pipeline (callName) → Wire Inputs & Branch Guards → Export Superset-Script (.py / .mjs / .ts / .rs)',
    example: 'Chain calc_subtotal(price, qty) → apply_tax(subtotal) → approve_order(total) into a runnable CLI superset-script.',
    notes: 'Saved globally in browser storage so you can accumulate equations across sessions and export a unified orchestrator at any time.',
  },
  pipelinePipingDelegation: {
    key: 'pipelinePipingDelegation',
    title: 'Positional & Named Output Delegation',
    category: 'Pipeline Piping',
    summary:
      'Each pipeline node delegates its evaluated output as a named variable (e.g. calc_tax_out), as a positional bus slot ($1, $2, ..., or prev), or both—so downstream children can wire any parameter to either named or positional outputs.',
    syntax: 'Delegation: Named | Positional | Both  ·  Child Input Binding: CLI/Default | Pipe Named | Pipe Positional ($N / prev) | Literal',
    example: 'Node #1 (calc_tax) emits named "tax_total" and positional "$1". Node #2 binds its "amount" parameter to "$1" or "tax_total".',
    notes: 'Unbound root inputs are automatically hoisted to the superset-script CLI interface as named --<var> literal parameters.',
  },
  pipelineBranching: {
    key: 'pipelineBranching',
    title: 'Conditional Branch Guards & Fallbacks',
    category: 'Pipeline Branching',
    summary:
      'Attach a branch guard to any child equation so it only invokes when a parent node output satisfies a condition (Truthy, Falsy, >, <, ==, != threshold). When a branch is skipped, an optional fallback literal is delegated downstream.',
    syntax: 'if <parent_call_name> [is truthy | is falsy | > T | < T | == T | != T] → invoke child, else delegate fallbackValue',
    example: 'Run discount_tier only when calc_subtotal > 100; otherwise skip and pass fallback 0 to final_total.',
    notes: 'Branch decisions are traced live in the Pipeline Runner and emitted as explicit conditional branches in the exported superset-script.',
  },
  pipelineRecursiveEdit: {
    key: 'pipelineRecursiveEdit',
    title: 'Recursive Equation & Sub-Pipeline Editing',
    category: 'Recursive Composition',
    summary:
      'Supports two-level recursive editing: (1) load any saved pipeline equation back into the Step 03 calculator to modify its statement/labels and save changes back in place, or (2) drill into any node as a nested sub-pipeline and compose child stages recursively.',
    syntax: 'Edit in Calculator (in-place update)  |  Drill Into Sub-Pipeline (breadcrumb stack: Root > Child > Grandchild)',
    example: 'Drill into "pricing_stage" to add internal "base_calc" → "surcharge" child equations; its final output becomes "pricing_stage" output in the parent pipeline.',
    notes: 'Recursive sub-pipelines execute live up to depth 8 and compile into nested callable functions in the exported superset-script.',
  },
};

export type StudioDocKey = keyof typeof STUDIO_DOCS;
