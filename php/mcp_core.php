<?php
declare(strict_types=1);

/**
 * Shared Zero-Dependency Native PHP MCP (Model Context Protocol) Core Handler.
 * Exposes all Grammar2JSON Studio features across both stdio (mcp_stdio.php) and HTTP (mcp_http.php).
 */

if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) {
    define('PHP_API_ENTRY', true);
}

foreach ([
    'Storage.php',
    'TemplateEngine.php',
    'GrammarEngine.php',
    'LogicEngine.php',
    'SchemaPredicateEngine.php',
    'MultilineLogicEngine.php',
    'handlers/grammar.php',
    'handlers/schemastore.php',
] as $engineFile) {
    $full = __DIR__ . '/' . $engineFile;
    if (is_file($full)) {
        require_once $full;
    }
}

function mcp_build_workspace_obj(?string $grammar = null, ?array $dialectOverrides = null, ?string $schemaName = null): stdClass {
    $db = function_exists('logic_store') ? logic_store() : null;
    $state = function_exists('logic_state') ? logic_state($db) : [];
    $ws = function_exists('workspace_default') ? clone workspace_default($state) : (object)[
        'grammarText' => '',
        'dialect' => (object)[
            'preset' => 'ebnf',
            'ruleOperator' => '::=',
            'choiceDelimiter' => '|',
            'commentPrefix' => '//',
        ],
        'schemaConfig' => (object)[
            'preset' => 'definedTermSet',
            'schemaName' => 'CustomGrammarSchema',
            'schemaOrgType' => 'DefinedTermSet',
            'schemaStoreDraft' => 'https://json-schema.org/draft/2020-12/schema',
            'includeJsonSchemaDefs' => true,
            'includePotentialActions' => false,
        ],
        'mutations' => (object)[],
        'mutationPolicy' => (object)[
            'allowImportMutation' => true,
            'allowExportMutation' => true,
            'allowedTargets' => ['jsonld', 'python', 'rust', 'wasm'],
            'lockedRules' => [],
        ],
        'ruleConfigs' => (object)[],
    ];

    if ($grammar !== null && trim($grammar) !== '') {
        $ws->grammarText = $grammar;
    }
    if ($dialectOverrides !== null) {
        $d = isset($ws->dialect) && is_object($ws->dialect) ? clone $ws->dialect : (object)[];
        foreach (['preset', 'ruleOperator', 'choiceDelimiter', 'commentPrefix'] as $k) {
            if (isset($dialectOverrides[$k]) && is_string($dialectOverrides[$k])) {
                $d->$k = $dialectOverrides[$k];
            }
        }
        $ws->dialect = $d;
    }
    if ($schemaName !== null && trim($schemaName) !== '') {
        if (!isset($ws->schemaConfig) || !is_object($ws->schemaConfig)) {
            $ws->schemaConfig = (object)[];
        }
        $ws->schemaConfig->schemaName = trim($schemaName);
    }
    return $ws;
}

function get_tools(): array {
    return [
        // 1. Grammar & Compiler Pipeline
        [
            'name' => 'parse_grammar',
            'description' => 'Parses an EBNF/BNF/ABNF/PEG grammar into structured production rules, alternatives, references, and literals.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'grammar' => ['type' => 'string', 'description' => 'Grammar text (uses active workspace grammar if omitted)'],
                    'ruleOperator' => ['type' => 'string', 'description' => 'Rule operator (default "::=")'],
                    'choiceDelimiter' => ['type' => 'string', 'description' => 'Choice delimiter (default "|")'],
                    'commentPrefix' => ['type' => 'string', 'description' => 'Comment prefix (default "//")'],
                ],
            ],
        ],
        [
            'name' => 'export_grammar',
            'description' => 'Compiles a grammar into any of the 22+ supported target languages (jsonld, python, rust, wat, typescript, javascript, go, java, cpp, csharp, php, sql, swift, kotlin, ruby, scala, haskell, elixir, lua, zig, dart, ocaml).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'language' => ['type' => 'string', 'description' => 'Target language ID (e.g. python, rust, jsonld, typescript, go, php, sql, wat)'],
                    'grammar' => ['type' => 'string', 'description' => 'Optional grammar text (uses active workspace grammar if omitted)'],
                    'schemaName' => ['type' => 'string', 'description' => 'Optional schema/compiler name'],
                ],
                'required' => ['language'],
            ],
        ],
        [
            'name' => 'manage_rules',
            'description' => 'Lists, adds/updates, or deletes grammar rules in the active persisted Studio workspace.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'action' => ['type' => 'string', 'enum' => ['list', 'upsert', 'delete'], 'description' => 'Operation to perform'],
                    'name' => ['type' => 'string', 'description' => 'Rule name (required for upsert/delete)'],
                    'expression' => ['type' => 'string', 'description' => 'Rule RHS expression (required for upsert)'],
                ],
                'required' => ['action'],
            ],
        ],
        [
            'name' => 'list_grammar_symbols',
            'description' => 'Lists Extended DAG grammar operators and symbol definitions for the active workspace.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => (object)[],
            ],
        ],

        // 2. Formal Logic, Arithmetic, Lambda & Cauchy
        [
            'name' => 'evaluate_expression',
            'description' => 'Evaluates a simple arithmetic expression (add, sub, mul, div).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'a' => ['type' => 'number', 'description' => 'First operand'],
                    'b' => ['type' => 'number', 'description' => 'Second operand'],
                    'op' => ['type' => 'string', 'enum' => ['add', 'sub', 'mul', 'div'], 'description' => 'Arithmetic operator'],
                ],
                'required' => ['a', 'b', 'op'],
            ],
        ],
        [
            'name' => 'evaluate_logic',
            'description' => 'Evaluates a formal logic, arithmetic, quantifier, or lambda calculus statement with optional label bindings.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'statement' => ['type' => 'string', 'description' => 'Logic or lambda expression'],
                    'labels' => [
                        'type' => 'array',
                        'description' => 'Optional label bindings [{name, kind, value}]',
                        'items' => ['type' => 'object'],
                    ],
                ],
                'required' => ['statement'],
            ],
        ],
        [
            'name' => 'export_logic',
            'description' => 'Exports a formal logic/lambda statement to executable code in a target language (python, rust, javascript, typescript, jsonld, php, go, java, cpp, csharp, ruby, lua, etc.).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'target' => ['type' => 'string', 'description' => 'Target language (e.g. python, rust, javascript, typescript, php, jsonld)'],
                    'statement' => ['type' => 'string', 'description' => 'Optional logic statement (uses active workspace statement if omitted)'],
                    'labels' => ['type' => 'array', 'items' => ['type' => 'object'], 'description' => 'Optional label bindings'],
                    'inputMode' => ['type' => 'string', 'enum' => ['cli', 'hardcoded'], 'description' => 'CLI inputs or hardcoded mode (default cli)'],
                ],
                'required' => ['target'],
            ],
        ],
        [
            'name' => 'evaluate_multiline_logic',
            'description' => 'Evaluates a multi-line formal logic, boolean, arithmetic, or lambda program with optional pre-input assignments.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'preInput' => ['type' => 'string', 'description' => 'Optional pre-input assignments (one per line)'],
                    'program' => ['type' => 'string', 'description' => 'Multi-line logic/arithmetic program'],
                ],
                'required' => ['program'],
            ],
        ],
        [
            'name' => 'evaluate_cauchy_sequence',
            'description' => 'Evaluates a Cauchy recurrence sequence and checks convergence within epsilon.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'seedValues' => ['type' => 'string', 'description' => 'Comma-separated seed values (e.g. "1, 2")'],
                    'recurrenceExpr' => ['type' => 'string', 'description' => 'Recurrence expression (e.g. "(_1 + _2) / 2")'],
                    'maxIterations' => ['type' => 'integer', 'description' => 'Maximum iterations (default 20)'],
                    'epsilon' => ['type' => 'number', 'description' => 'Convergence threshold (default 0.0001)'],
                ],
                'required' => ['seedValues', 'recurrenceExpr'],
            ],
        ],
        [
            'name' => 'manage_callbacks',
            'description' => 'Lists, saves, or deletes persistent Workspace Callbacks (λ functions) in Studio storage.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'action' => ['type' => 'string', 'enum' => ['list', 'save', 'delete'], 'description' => 'Operation to perform'],
                    'name' => ['type' => 'string', 'description' => 'Callback name (required for save/delete)'],
                    'expression' => ['type' => 'string', 'description' => 'Lambda expression (e.g. "λx. x * 2")'],
                    'description' => ['type' => 'string', 'description' => 'Optional description'],
                ],
                'required' => ['action'],
            ],
        ],

        // 3. JSON Schema EBNF, Predicate Tree & SchemaStore
        [
            'name' => 'compile_schema_predicate_tree',
            'description' => 'Compiles a JSON Schema into an EBNF grammar + Predicate Tree and validates a JSON instance.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'schema' => ['type' => 'string', 'description' => 'JSON Schema document string'],
                    'instance' => ['type' => 'string', 'description' => 'JSON instance string to validate'],
                ],
                'required' => ['schema', 'instance'],
            ],
        ],
        [
            'name' => 'schemastore_catalog',
            'description' => 'Searches and lists schemas dynamically from the live SchemaStore catalog (~700 schemas).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'query' => ['type' => 'string', 'description' => 'Optional search filter (e.g. "tsconfig", "package", "github")'],
                    'limit' => ['type' => 'integer', 'description' => 'Max results to return (default 20, max 100)'],
                ],
            ],
        ],
        [
            'name' => 'schemastore_load',
            'description' => 'Dynamically fetches a JSON Schema from an allowlisted SchemaStore HTTPS URL and optionally compiles & validates a JSON instance.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'url' => ['type' => 'string', 'description' => 'SchemaStore HTTPS URL (e.g. "https://json.schemastore.org/package.json")'],
                    'instance' => ['type' => 'string', 'description' => 'Optional JSON instance string to validate against the fetched schema'],
                ],
                'required' => ['url'],
            ],
        ],

        // 4. Workspaces, Histolog (Revision History) & Middleware Suite
        [
            'name' => 'workspace_get',
            'description' => 'Returns the active persisted Studio workspace state (grammar, dialect, schemaConfig, logic statement, labels, callbacks).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => (object)[],
            ],
        ],
        [
            'name' => 'workspace_save',
            'description' => 'Updates and persists the active Studio workspace (grammarText, logicStatement, dialect) and records a Histolog generation.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'grammarText' => ['type' => 'string', 'description' => 'Updated grammar text'],
                    'logicStatement' => ['type' => 'string', 'description' => 'Updated logic statement'],
                    'summary' => ['type' => 'string', 'description' => 'Histolog commit summary'],
                ],
            ],
        ],
        [
            'name' => 'histolog_list',
            'description' => 'Lists Histolog revision generations or computes a diff between two generation numbers.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'fromGeneration' => ['type' => 'integer', 'description' => 'Optional start generation for diff'],
                    'toGeneration' => ['type' => 'integer', 'description' => 'Optional end generation for diff'],
                ],
            ],
        ],
        [
            'name' => 'histolog_restore',
            'description' => 'Restores the active Studio workspace to a specific Histolog generation number.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'generation' => ['type' => 'integer', 'description' => 'Generation number to restore'],
                    'section' => ['type' => 'string', 'enum' => ['all', 'grammar', 'logic'], 'description' => 'Section to restore (default "all")'],
                ],
                'required' => ['generation'],
            ],
        ],
        [
            'name' => 'middleware_config',
            'description' => 'Reads or updates the Studio Middleware Suite configuration (slugs, templates, routing).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'action' => ['type' => 'string', 'enum' => ['get', 'patch'], 'description' => 'Read or patch middleware config (default "get")'],
                    'patch' => ['type' => 'object', 'description' => 'Partial config patch object when action is "patch"'],
                ],
            ],
        ],
    ];
}

function mcp_json_tool_result(mixed $data, bool $isError = false): array {
    return [
        'content' => [
            ['type' => 'text', 'text' => is_string($data) ? $data : (json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}')],
        ],
        'isError' => $isError,
    ];
}

function call_tool(string $name, array $args): array {
    switch ($name) {
        case 'evaluate_expression': {
            $a = (float)($args['a'] ?? 0);
            $b = (float)($args['b'] ?? 0);
            $op = (string)($args['op'] ?? 'add');
            $res = match ($op) {
                'add' => $a + $b,
                'sub' => $a - $b,
                'mul' => $a * $b,
                'div' => $b == 0.0
                    ? throw new RuntimeException('Division by zero', -32602)
                    : $a / $b,
                default => throw new RuntimeException("Unsupported op: {$op}", -32602),
            };
            return mcp_json_tool_result((string)$res, false);
        }

        case 'parse_grammar': {
            $ws = mcp_build_workspace_obj(
                isset($args['grammar']) ? (string)$args['grammar'] : null,
                $args
            );
            $rules = parse_grammar((string)($ws->grammarText ?? ''), $ws->dialect);
            return mcp_json_tool_result(['ok' => true, 'ruleCount' => count($rules), 'rules' => $rules], false);
        }

        case 'export_grammar': {
            $lang = strtolower(trim((string)($args['language'] ?? 'jsonld')));
            $ws = mcp_build_workspace_obj(
                isset($args['grammar']) ? (string)$args['grammar'] : null,
                null,
                isset($args['schemaName']) ? (string)$args['schemaName'] : null
            );
            $rules = parse_grammar((string)($ws->grammarText ?? ''), $ws->dialect);
            $slug = preg_replace('/[^A-Za-z0-9_-]/', '_', (string)($ws->schemaConfig->schemaName ?? 'grammar')) ?: 'grammar';

            if ($lang === 'jsonld' || $lang === 'json') {
                return mcp_json_tool_result(['language' => 'jsonld', 'filename' => "{$slug}.schema.json", 'content' => grammar_schema_json($rules, $ws)], false);
            }
            if ($lang === 'python') {
                return mcp_json_tool_result(['language' => 'python', 'filename' => "{$slug}.py", 'content' => workspace_python_source($rules, $ws)], false);
            }
            if ($lang === 'rust') {
                return mcp_json_tool_result(['language' => 'rust', 'filename' => "{$slug}.rs", 'content' => workspace_rust_source($rules, $ws)], false);
            }
            if ($lang === 'wat' || $lang === 'wasm') {
                return mcp_json_tool_result(['language' => 'wat', 'filename' => "{$slug}.wat", 'content' => workspace_wat_source($rules, $ws)], false);
            }
            $other = workspace_other_export($lang, $rules, $ws, $slug);
            if ($other === null) {
                throw new RuntimeException("Unsupported grammar export language: {$lang}", -32602);
            }
            return mcp_json_tool_result($other, false);
        }

        case 'manage_rules': {
            $action = (string)($args['action'] ?? 'list');
            $db = logic_store();
            $state = logic_state($db);
            $ws = workspace_default($state);
            $rules = parse_grammar((string)($ws->grammarText ?? ''), $ws->dialect);

            if ($action === 'list') {
                return mcp_json_tool_result(['ok' => true, 'ruleCount' => count($rules), 'rules' => $rules], false);
            }
            $ruleName = trim((string)($args['name'] ?? ''));
            if ($ruleName === '') {
                throw new RuntimeException('Missing required parameter: name', -32602);
            }
            if ($action === 'upsert') {
                $expr = trim((string)($args['expression'] ?? ''));
                if ($expr === '') {
                    throw new RuntimeException('Missing required parameter: expression', -32602);
                }
                $found = false;
                foreach ($rules as &$r) {
                    if (($r['name'] ?? '') === $ruleName) {
                        $r['expression'] = $expr;
                        $found = true;
                        break;
                    }
                }
                unset($r);
                if (!$found) {
                    $rules[] = ['name' => $ruleName, 'expression' => $expr];
                }
            } elseif ($action === 'delete') {
                $rules = array_values(array_filter($rules, static fn(array $r): bool => ($r['name'] ?? '') !== $ruleName));
            } else {
                throw new RuntimeException("Unsupported action: {$action}", -32602);
            }

            $serialized = grammar_serialize((string)($ws->grammarText ?? ''), $rules, $ws->dialect);
            logic_mutate($db, static function (array &$s) use ($serialized): void {
                $w = workspace_default($s);
                $w->grammarText = $serialized;
                save_active_workspace($s, $w);
            }, static fn(): array => ['mcp', "Rule {$action}: {$ruleName}"]);

            return mcp_json_tool_result(['ok' => true, 'action' => $action, 'name' => $ruleName, 'grammarText' => $serialized], false);
        }

        case 'list_grammar_symbols': {
            $ws = mcp_build_workspace_obj();
            $symbols = function_exists('grammar_symbols') ? grammar_symbols($ws) : [];
            return mcp_json_tool_result(['ok' => true, 'symbols' => $symbols], false);
        }

        case 'evaluate_logic': {
            $stmt = (string)($args['statement'] ?? '');
            $labels = is_array($args['labels'] ?? null) ? $args['labels'] : [];
            $res = evaluate_statement($stmt, $labels);
            return mcp_json_tool_result($res, !($res['ok'] ?? false));
        }

        case 'export_logic': {
            $target = strtolower(trim((string)($args['target'] ?? 'python')));
            $inputMode = (string)($args['inputMode'] ?? 'cli');
            $db = logic_store();
            $state = logic_state($db);
            if (isset($args['statement']) && is_string($args['statement'])) {
                $state['statement'] = $args['statement'];
            }
            if (is_array($args['labels'] ?? null)) {
                $state['labels'] = $args['labels'];
            }
            $res = logic_export_target($state, $target, $inputMode);
            return mcp_json_tool_result($res, false);
        }

        case 'evaluate_multiline_logic': {
            $preInput = (string)($args['preInput'] ?? '');
            $program = (string)($args['program'] ?? '');
            $res = evaluate_multiline_logic_program($preInput, $program);
            return mcp_json_tool_result($res, false);
        }

        case 'evaluate_cauchy_sequence': {
            $cfg = (object)[
                'enabled' => true,
                'paramStyle' => 'positional',
                'customParamNames' => '',
                'seedValues' => (string)($args['seedValues'] ?? '1, 2'),
                'recurrenceExpr' => (string)($args['recurrenceExpr'] ?? '(_1 + _2) / 2'),
                'maxIterations' => (int)($args['maxIterations'] ?? 20),
                'epsilon' => (float)($args['epsilon'] ?? 0.0001),
            ];
            $res = evaluate_cauchy($cfg);
            return mcp_json_tool_result($res, !($res['ok'] ?? false));
        }

        case 'manage_callbacks': {
            $action = (string)($args['action'] ?? 'list');
            $db = logic_store();
            $state = logic_state($db);
            $callbacks = is_array($state['callbacks'] ?? null) ? $state['callbacks'] : [];
            if ($action === 'list') {
                return mcp_json_tool_result(['ok' => true, 'count' => count($callbacks), 'callbacks' => $callbacks], false);
            }
            $cbName = trim((string)($args['name'] ?? ''));
            if ($cbName === '') {
                throw new RuntimeException('Missing required parameter: name', -32602);
            }
            if ($action === 'save') {
                $expr = trim((string)($args['expression'] ?? ''));
                if ($expr === '') {
                    throw new RuntimeException('Missing required parameter: expression', -32602);
                }
                $desc = trim((string)($args['description'] ?? ''));
                $binding = callback_binding($cbName, $expr, $desc);
                $updated = logic_mutate($db, static function (array &$s) use ($binding, $cbName): void {
                    $list = is_array($s['callbacks'] ?? null) ? $s['callbacks'] : [];
                    $list = array_values(array_filter($list, static fn(array $c): bool => ($c['name'] ?? '') !== $cbName));
                    $list[] = $binding;
                    $s['callbacks'] = $list;
                }, static fn(): array => ['mcp', "Saved callback {$cbName}"]);
                return mcp_json_tool_result(['ok' => true, 'callback' => $binding, 'count' => count($updated['callbacks'] ?? [])], false);
            }
            if ($action === 'delete') {
                $updated = logic_mutate($db, static function (array &$s) use ($cbName): void {
                    $list = is_array($s['callbacks'] ?? null) ? $s['callbacks'] : [];
                    $s['callbacks'] = array_values(array_filter($list, static fn(array $c): bool => ($c['name'] ?? '') !== $cbName));
                }, static fn(): array => ['mcp', "Deleted callback {$cbName}"]);
                return mcp_json_tool_result(['ok' => true, 'deleted' => $cbName, 'count' => count($updated['callbacks'] ?? [])], false);
            }
            throw new RuntimeException("Unsupported action: {$action}", -32602);
        }

        case 'compile_schema_predicate_tree': {
            $schema = $args['schema'] ?? '{}';
            $instance = $args['instance'] ?? '{}';
            $res = evaluate_schema_predicate_studio($schema, $instance);
            return mcp_json_tool_result($res, !($res['ok'] ?? false));
        }

        case 'schemastore_catalog': {
            $query = strtolower(trim((string)($args['query'] ?? '')));
            $limit = max(1, min(100, (int)($args['limit'] ?? 20)));
            $res = schemastore_http_get('https://www.schemastore.org/api/json/catalog.json', 4194304);
            if (!$res['ok']) {
                return mcp_json_tool_result(['ok' => false, 'error' => $res['error']], true);
            }
            $all = is_array($res['data']['schemas'] ?? null) ? $res['data']['schemas'] : [];
            $matches = [];
            foreach ($all as $entry) {
                if (!is_array($entry) || empty($entry['url']) || empty($entry['name'])) continue;
                $n = (string)$entry['name'];
                $d = (string)($entry['description'] ?? '');
                if ($query === '' || str_contains(strtolower($n), $query) || str_contains(strtolower($d), $query)) {
                    $matches[] = ['name' => $n, 'description' => $d, 'url' => (string)$entry['url']];
                    if (count($matches) >= $limit) break;
                }
            }
            return mcp_json_tool_result(['ok' => true, 'totalCatalog' => count($all), 'returned' => count($matches), 'schemas' => $matches], false);
        }

        case 'schemastore_load': {
            $url = trim((string)($args['url'] ?? ''));
            $parts = parse_url($url);
            if (!is_array($parts) || strtolower((string)($parts['scheme'] ?? '')) !== 'https') {
                throw new RuntimeException('Only HTTPS schema URLs are supported', -32602);
            }
            $host = (string)($parts['host'] ?? '');
            if ($host === '' || !schemastore_allowed_host($host)) {
                throw new RuntimeException("Host not in SchemaStore allowlist: {$host}", -32602);
            }
            $res = schemastore_http_get($url, 2097152);
            if (!$res['ok']) {
                return mcp_json_tool_result(['ok' => false, 'error' => $res['error']], true);
            }
            $out = ['ok' => true, 'url' => $url, 'schema' => $res['data']];
            if (isset($args['instance']) && is_string($args['instance']) && trim($args['instance']) !== '') {
                $out['evaluation'] = evaluate_schema_predicate_studio($res['data'], $args['instance']);
            }
            return mcp_json_tool_result($out, false);
        }

        case 'workspace_get': {
            $db = logic_store();
            $state = logic_state($db);
            $ws = workspace_default($state);
            return mcp_json_tool_result([
                'ok' => true,
                'workspace' => $ws,
                'logicStatement' => $state['statement'] ?? '',
                'labels' => $state['labels'] ?? [],
                'callbacks' => $state['callbacks'] ?? [],
            ], false);
        }

        case 'workspace_save': {
            $db = logic_store();
            $summary = trim((string)($args['summary'] ?? 'Updated workspace via MCP'));
            $updated = logic_mutate($db, static function (array &$s) use ($args): void {
                $w = workspace_default($s);
                if (isset($args['grammarText']) && is_string($args['grammarText'])) {
                    $w->grammarText = $args['grammarText'];
                }
                if (isset($args['logicStatement']) && is_string($args['logicStatement'])) {
                    $s['statement'] = $args['logicStatement'];
                }
                save_active_workspace($s, $w);
            }, static fn(): array => ['mcp', $summary]);
            $entries = history_entries($updated);
            $latest = end($entries);
            return mcp_json_tool_result([
                'ok' => true,
                'generation' => is_object($latest) ? ($latest->generation ?? null) : null,
                'summary' => $summary,
            ], false);
        }

        case 'histolog_list': {
            $db = logic_store();
            $state = logic_state($db);
            $entries = history_entries($state);
            if (isset($args['fromGeneration'], $args['toGeneration'])) {
                $from = history_find($entries, (int)$args['fromGeneration']);
                $to = history_find($entries, (int)$args['toGeneration']);
                if (!$from || !$to) {
                    throw new RuntimeException('Requested Histolog generation not found', -32602);
                }
                return mcp_json_tool_result([
                    'ok' => true,
                    'from' => (int)$args['fromGeneration'],
                    'to' => (int)$args['toGeneration'],
                    'diff' => history_diff($from->snapshot, $to->snapshot),
                ], false);
            }
            return mcp_json_tool_result(['ok' => true, 'count' => count($entries), 'entries' => history_index($entries)], false);
        }

        case 'histolog_restore': {
            $gen = (int)($args['generation'] ?? 0);
            $section = (string)($args['section'] ?? 'all');
            $db = logic_store();
            $restored = null;
            logic_mutate($db, static function (array &$s) use ($gen, $section, &$restored): void {
                $restored = history_restore($s, $gen, $section);
            });
            return mcp_json_tool_result(['ok' => true, 'restoredGeneration' => $gen, 'section' => $section, 'entry' => $restored], false);
        }

        case 'middleware_config': {
            $action = (string)($args['action'] ?? 'get');
            $db = logic_store();
            $state = logic_state($db);
            if ($action === 'patch' && is_array($args['patch'] ?? null)) {
                $next = middleware_apply_patch(middleware_active_config($state), $args['patch']);
                logic_mutate($db, static function (array &$s) use ($next): void {
                    $s['middleware'] = $next;
                }, static fn(): array => ['mcp', 'Patched middleware config']);
                return mcp_json_tool_result(['ok' => true, 'middleware' => $next], false);
            }
            return mcp_json_tool_result(['ok' => true, 'middleware' => middleware_active_config($state)], false);
        }

        default:
            throw new RuntimeException("Unknown tool: {$name}", -32601);
    }
}

function handle_mcp_message(array $req): ?array {
    $id = $req['id'] ?? null;
    $method = (string)($req['method'] ?? '');
    $params = is_array($req['params'] ?? null) ? $req['params'] : [];

    // Notifications (no id) must not return a JSON-RPC response
    if ($id === null && str_starts_with($method, 'notifications/')) {
        return null;
    }

    try {
        $result = match ($method) {
            'initialize' => [
                'protocolVersion' => '2025-03-26',
                'capabilities' => ['tools' => (object)[]],
                'serverInfo' => ['name' => 'php-mcp-server', 'version' => '1.0.0'],
            ],
            'ping' => (object)[],
            'tools/list' => ['tools' => get_tools()],
            'tools/call' => call_tool(
                (string)($params['name'] ?? ''),
                is_array($params['arguments'] ?? null) ? $params['arguments'] : []
            ),
            default => throw new RuntimeException("Method not found: {$method}", -32601),
        };

        return ['jsonrpc' => '2.0', 'id' => $id, 'result' => $result];
    } catch (Throwable $e) {
        return [
            'jsonrpc' => '2.0',
            'id' => $id,
            'error' => [
                'code' => $e->getCode() ?: -32603,
                'message' => $e->getMessage(),
            ],
        ];
    }
}
