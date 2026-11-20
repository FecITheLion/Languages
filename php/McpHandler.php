<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

function mcp_server_catalog(): array {
    return [
        'pipeline' => [
            'id'=>'pipeline', 'name'=>'Pipeline Grid & Breadcrumbs MCP Server', 'stage'=>'codegen', 'targetPage'=>'mcp_servers',
            'description'=>'Controls the 5-stage, 12-step compiler Pipeline Grid, breadcrumbs, and end-to-end compilation.',
            'tools'=>[
                ['name'=>'get_pipeline_grid', 'description'=>'Return the structured 5-stage compiler Pipeline Grid.', 'inputSchema'=>['type'=>'object','properties'=>['stage'=>['type'=>'string']]]],
                ['name'=>'run_full_pipeline', 'description'=>'Execute all compiler stages end-to-end and return diagnostics.', 'inputSchema'=>['type'=>'object','properties'=>['grammar'=>['type'=>'string']]]],
            ],
        ],
        'grammar' => [
            'id'=>'grammar', 'name'=>'Grammar & Dependency DAG MCP Server', 'stage'=>'frontend', 'targetPage'=>'dialect',
            'description'=>'Parses EBNF/BNF/PEG grammars, lists rules, and inspects symbol usage.',
            'tools'=>[
                ['name'=>'parse_grammar', 'description'=>'Parse grammar text using the active dialect.', 'inputSchema'=>['type'=>'object','properties'=>['grammar'=>['type'=>'string']]]],
                ['name'=>'analyze_grammar_dag', 'description'=>'Return rules, references, and extended symbol statuses.', 'inputSchema'=>['type'=>'object','properties'=>['grammar'=>['type'=>'string']]]],
            ],
        ],
        'rule_props' => [
            'id'=>'rule_props', 'name'=>'Rule Properties & Precedence MCP Server', 'stage'=>'frontend', 'targetPage'=>'rule_props',
            'description'=>'Inspects and sorts grammar rules by configured precedence and metadata.',
            'tools'=>[
                ['name'=>'list_rule_properties', 'description'=>'Return per-rule precedence, associativity, and custom properties.', 'inputSchema'=>['type'=>'object','properties'=>new stdClass()]],
            ],
        ],
        'logic_calc' => [
            'id'=>'logic_calc', 'name'=>'Symbolic Logic & Lambda Calculus MCP Server', 'stage'=>'formal', 'targetPage'=>'logic_calc',
            'description'=>'Evaluates symbolic logic, arithmetic, lambda calculus, Cauchy sequences, and code exports.',
            'tools'=>[
                [
                    'name'=>'evaluate_logic_lambda',
                    'description'=>'Evaluate a logic, arithmetic, or lambda statement using the PHP logic evaluator.',
                    'inputSchema'=>[
                        'type'=>'object',
                        'properties'=>[
                            'statement'=>['type'=>'string'], 'labels'=>['type'=>'array'],
                            'logic_statement'=>['type'=>'string'], 'logic_labels'=>['type'=>'string'],
                            'input'=>['type'=>'string'], 'values'=>['type'=>'array'],
                        ],
                    ],
                ],
                [
                    'name'=>'evaluate_cauchy_sequence',
                    'description'=>'Evaluate a numeric Cauchy recurrence sequence for convergence and limit estimate.',
                    'inputSchema'=>[
                        'type'=>'object',
                        'properties'=>[
                            'paramStyle'=>['type'=>'string'], 'seedValues'=>['type'=>'string'],
                            'recurrenceExpr'=>['type'=>'string'], 'maxIterations'=>['type'=>'number'], 'epsilon'=>['type'=>'number'],
                        ],
                    ],
                ],
                [
                    'name'=>'export_logic_code',
                    'description'=>'Export the active logic statement to any supported target language.',
                    'inputSchema'=>[
                        'type'=>'object',
                        'properties'=>['target'=>['type'=>'string'], 'mode'=>['type'=>'string','enum'=>['cli','hardcoded']]],
                    ],
                ],
                [
                    'name'=>'evaluate_multiline_logic',
                    'description'=>'Evaluate a multiline formal boolean, predicate & lambda block program and build its truth table.',
                    'inputSchema'=>[
                        'type'=>'object',
                        'properties'=>['preInput'=>['type'=>'string'], 'program'=>['type'=>'string']],
                    ],
                ],
            ],
        ],
        'jsonld' => [
            'id'=>'jsonld', 'name'=>'Schema.org JSON-LD IR MCP Server', 'stage'=>'ir', 'targetPage'=>'schema',
            'description'=>'Compiles the active grammar and mutations into Schema.org JSON-LD.',
            'tools'=>[
                ['name'=>'generate_schema_jsonld', 'description'=>'Compile the active workspace grammar into Schema.org JSON-LD.', 'inputSchema'=>['type'=>'object','properties'=>new stdClass()]],
                [
                    'name'=>'compile_schema_predicate_tree',
                    'description'=>'Compile a JSON Schema into Schema EBNF + Predicate-Argument Tree + Logic/Lambda expressions and validate an instance.',
                    'inputSchema'=>['type'=>'object','properties'=>['schema'=>['type'=>['string','object']],'instance'=>['type'=>['string','object']]]],
                ],
            ],
        ],
        'mutations' => [
            'id'=>'mutations', 'name'=>'Schema Mutations & Locks MCP Server', 'stage'=>'ir', 'targetPage'=>'mutations',
            'description'=>'Inspects per-rule schema mutations and declaration lock policies.',
            'tools'=>[
                ['name'=>'list_mutations', 'description'=>'List per-rule schema mutations and mutation policy.', 'inputSchema'=>['type'=>'object','properties'=>new stdClass()]],
            ],
        ],
        'evaluator' => [
            'id'=>'evaluator', 'name'=>'Backtracking Grammar Evaluator MCP Server', 'stage'=>'ir', 'targetPage'=>'evaluator',
            'description'=>'Evaluates UTF-8 payloads against grammar rules with full expansion traces.',
            'tools'=>[
                ['name'=>'evaluate_grammar_payload', 'description'=>'Match a payload string against a grammar rule.', 'inputSchema'=>['type'=>'object','properties'=>['rule'=>['type'=>'string'],'payload'=>['type'=>'string']]]],
            ],
        ],
        'python' => [
            'id'=>'python', 'name'=>'Python AST & Codegen MCP Server', 'stage'=>'codegen', 'targetPage'=>'python_ast',
            'description'=>'Generates Python parser source and multi-language workspace exports.',
            'tools'=>[
                ['name'=>'generate_python_source', 'description'=>'Generate Python workspace parser source.', 'inputSchema'=>['type'=>'object','properties'=>new stdClass()]],
                ['name'=>'export_workspace_language', 'description'=>'Export workspace grammar and schema in a target language.', 'inputSchema'=>['type'=>'object','properties'=>['language'=>['type'=>'string']]]],
            ],
        ],
        'rust' => [
            'id'=>'rust', 'name'=>'Rust syn AST & Codegen MCP Server', 'stage'=>'codegen', 'targetPage'=>'rust_ast',
            'description'=>'Generates Rust workspace structs and parser definitions.',
            'tools'=>[
                ['name'=>'generate_rust_source', 'description'=>'Generate Rust workspace source.', 'inputSchema'=>['type'=>'object','properties'=>new stdClass()]],
            ],
        ],
        'wasm' => [
            'id'=>'wasm', 'name'=>'WebAssembly Compiler MCP Server', 'stage'=>'codegen', 'targetPage'=>'wasm_wabt',
            'description'=>'Generates WAT/WASM artifacts for grammar and logic.',
            'tools'=>[
                ['name'=>'generate_wat_source', 'description'=>'Generate WebAssembly Text (WAT) workspace source.', 'inputSchema'=>['type'=>'object','properties'=>new stdClass()]],
            ],
        ],
        'wabt' => [
            'id'=>'wabt', 'name'=>'WABT (wat2wasm / wasm2wat) MCP Server', 'stage'=>'codegen', 'targetPage'=>'wasm_wabt',
            'description'=>'Generates and validates WABT WAT modules.',
            'tools'=>[
                ['name'=>'generate_wat_source', 'description'=>'Generate WABT WAT source from active workspace.', 'inputSchema'=>['type'=>'object','properties'=>new stdClass()]],
            ],
        ],
    ];
}

function mcp_resource_for_server(string $serverId, array $state): array {
    $workspace = workspace_default($state);
    $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
    return match ($serverId) {
        'logic_calc' => [
            'uri'=>'grammar2json://logic_calc/artifact',
            'name'=>'Symbolic Logic & Lambda Calculus MCP Server Active Artifact',
            'mimeType'=>'text/plain',
            'text'=>preg_replace_callback('/^ +/m', fn($m) => str_repeat(' ', intdiv(strlen($m[0]), 2)),
                json_encode(['statement'=>$state['statement'], 'labels'=>$state['labels']], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS)),
        ],
        'grammar' => [
            'uri'=>'grammar2json://grammar/artifact', 'name'=>'Active Grammar Source', 'mimeType'=>'text/plain',
            'text'=>$workspace->grammarText,
        ],
        'jsonld' => [
            'uri'=>'grammar2json://jsonld/artifact', 'name'=>'Compiled Schema.org JSON-LD', 'mimeType'=>'application/ld+json',
            'text'=>grammar_schema_json($rules, $workspace),
        ],
        'evaluator' => [
            'uri'=>'grammar2json://evaluator/artifact', 'name'=>'Active Evaluator Payload', 'mimeType'=>'application/json',
            'text'=>json_encode(['rule'=>$workspace->evalRule, 'payload'=>$workspace->evalPayload], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT),
        ],
        'python' => [
            'uri'=>'grammar2json://python/artifact', 'name'=>'Generated Python Workspace Export', 'mimeType'=>'text/x-python',
            'text'=>workspace_python_source($rules, $workspace),
        ],
        'rust' => [
            'uri'=>'grammar2json://rust/artifact', 'name'=>'Generated Rust Workspace Export', 'mimeType'=>'text/x-rust',
            'text'=>workspace_rust_source($rules, $workspace),
        ],
        'wasm', 'wabt' => [
            'uri'=>"grammar2json://{$serverId}/artifact", 'name'=>'Generated WebAssembly Text (WAT)', 'mimeType'=>'text/plain',
            'text'=>workspace_wat_source($rules, $workspace),
        ],
        default => [
            'uri'=>"grammar2json://{$serverId}/artifact", 'name'=>"Active {$serverId} Artifact", 'mimeType'=>'application/json',
            'text'=>json_encode(['serverId'=>$serverId, 'ruleCount'=>count($rules), 'statement'=>$state['statement']], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT),
        ],
    };
}

function mcp_execute_tool(string $serverId, string $toolName, stdClass $args, array $state): array {
    $workspace = workspace_default($state);
    if ($serverId === 'logic_calc' && $toolName === 'evaluate_logic_lambda') {
        try {
            [$statement, $labels] = normalized_input($args, 0, $state);
            $evaluated = null; $truthTable = null;
            $evaluation = evaluate_statement($statement, $labels, $evaluated, $truthTable);
            return ['statement'=>$statement, 'astFormatted'=>format_ast(parse_logic($statement)), 'truthTable'=>$truthTable, ...$evaluation];
        } catch (InputError $error) {
            $message = $error->getMessage();
            $code = preg_match('/^(Ambiguous|Do not mix)/', $message) ? 'ambiguous_input' : 'invalid_input';
            return ['ok'=>false, 'error'=>$message, 'diagnostics'=>[['code'=>$code, 'message'=>$message]]];
        } catch (UnsupportedLogic $error) {
            return ['ok'=>false, 'error'=>'PHP logic evaluator cannot handle this input: '.$error->getMessage()];
        }
    }
    if ($serverId === 'logic_calc' && $toolName === 'evaluate_cauchy_sequence') {
        return evaluate_cauchy($args, $state['labels'], $state['cauchyConfig']);
    }
    if ($serverId === 'logic_calc' && $toolName === 'export_logic_code') {
        $target = is_string($args->target ?? null) ? $args->target : 'python';
        $mode = is_string($args->mode ?? null) ? $args->mode : 'cli';
        return ['ok'=>true, ...logic_export_target($state, $target, $mode)];
    }
    if ($serverId === 'logic_calc' && $toolName === 'evaluate_multiline_logic') {
        $pre = is_string($args->preInput ?? null) ? $args->preInput : "e=true";
        $prog = is_string($args->program ?? null) ? $args->program : "a(b,c)=b & c\nd=false\na(e,d)";
        return evaluate_multiline_logic_program($pre, $prog);
    }
    if ($serverId === 'grammar' && in_array($toolName, ['parse_grammar', 'analyze_grammar_dag'], true)) {
        $text = is_string($args->grammar ?? null) ? $args->grammar : $workspace->grammarText;
        $rules = parse_grammar($text, $workspace->dialect);
        return ['ok'=>true, 'ruleCount'=>count($rules), 'rules'=>$rules, 'symbols'=>grammar_symbols($workspace)];
    }
    if ($serverId === 'rule_props' && $toolName === 'list_rule_properties') {
        return ['ok'=>true, 'ruleConfigs'=>$workspace->ruleConfigs];
    }
    if ($serverId === 'jsonld' && $toolName === 'generate_schema_jsonld') {
        $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
        return ['ok'=>true, 'jsonld'=>grammar_schema_json($rules, $workspace)];
    }
    if ($serverId === 'jsonld' && $toolName === 'compile_schema_predicate_tree') {
        $schema = property_exists($args, 'schema') ? $args->schema : DEFAULT_JSON_SCHEMA_SAMPLE;
        $instance = property_exists($args, 'instance') ? $args->instance : DEFAULT_TEST_INSTANCE_SAMPLE;
        return evaluate_schema_predicate_studio($schema, $instance);
    }
    if ($serverId === 'mutations' && $toolName === 'list_mutations') {
        return ['ok'=>true, 'mutationPolicy'=>$workspace->mutationPolicy, 'mutations'=>$workspace->mutations];
    }
    if ($serverId === 'evaluator' && $toolName === 'evaluate_grammar_payload') {
        $rule = is_string($args->rule ?? null) ? $args->rule : $workspace->evalRule;
        $payload = is_string($args->payload ?? null) ? $args->payload : $workspace->evalPayload;
        $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
        return ['ok'=>true, ...(new GrammarPayloadEvaluator($rules, $workspace, $payload))->evaluate($rule)];
    }
    if ($serverId === 'python' && $toolName === 'generate_python_source') {
        $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
        return ['ok'=>true, 'language'=>'python', 'content'=>workspace_python_source($rules, $workspace)];
    }
    if ($serverId === 'rust' && $toolName === 'generate_rust_source') {
        $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
        return ['ok'=>true, 'language'=>'rust', 'content'=>workspace_rust_source($rules, $workspace)];
    }
    if (in_array($serverId, ['wasm', 'wabt'], true) && $toolName === 'generate_wat_source') {
        $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
        return ['ok'=>true, 'language'=>'wat', 'content'=>workspace_wat_source($rules, $workspace)];
    }
    if ($serverId === 'python' && $toolName === 'export_workspace_language') {
        $lang = is_string($args->language ?? null) ? $args->language : 'python';
        $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
        if ($lang === 'python') return ['ok'=>true, 'language'=>'python', 'content'=>workspace_python_source($rules, $workspace)];
        if ($lang === 'rust') return ['ok'=>true, 'language'=>'rust', 'content'=>workspace_rust_source($rules, $workspace)];
        if ($lang === 'wat') return ['ok'=>true, 'language'=>'wat', 'content'=>workspace_wat_source($rules, $workspace)];
        if ($lang === 'jsonld') return ['ok'=>true, 'language'=>'jsonld', 'content'=>grammar_schema_json($rules, $workspace)];
        $other = workspace_other_export($lang, $rules, $workspace, $workspace->schemaConfig->schemaName ?? 'Grammar');
        if ($other !== null) return ['ok'=>true, 'language'=>$lang, ...$other];
        return ['ok'=>false, 'error'=>"Unsupported workspace export language '$lang'."];
    }
    if ($serverId === 'pipeline' && $toolName === 'get_pipeline_grid') {
        $catalog = mcp_server_catalog();
        return ['ok'=>true, 'stages'=>['frontend','formal','ir','codegen','storage'], 'servers'=>array_keys($catalog)];
    }
    if ($serverId === 'pipeline' && $toolName === 'run_full_pipeline') {
        $text = is_string($args->grammar ?? null) ? $args->grammar : $workspace->grammarText;
        $rules = parse_grammar($text, $workspace->dialect);
        $eval = (new GrammarPayloadEvaluator($rules, $workspace, $workspace->evalPayload))->evaluate($workspace->evalRule);
        $logic = evaluate_statement($state['statement'], $state['labels']);
        return ['ok'=>true, 'ruleCount'=>count($rules), 'grammarMatched'=>$eval['matched'], 'logicOk'=>$logic['ok'], 'logicDisplayValue'=>$logic['displayValue']];
    }
    throw new InputError("Unknown MCP tool '$toolName' on server '$serverId'.", 404);
}

function openai_rest_api_tools(): array {
    return [
        ['name'=>'api_discover_root', 'description'=>'Discover the Grammar2JSON Studio HATEOAS API root.', 'method'=>'GET', 'path'=>'/api', 'parameters'=>['type'=>'object','properties'=>new stdClass()]],
        ['name'=>'api_list_rules', 'description'=>'List all grammar rules in the active workspace.', 'method'=>'GET', 'path'=>'/api/rules', 'parameters'=>['type'=>'object','properties'=>new stdClass()]],
        ['name'=>'api_list_symbols', 'description'=>'List extended DAG grammar symbols.', 'method'=>'GET', 'path'=>'/api/symbols', 'parameters'=>['type'=>'object','properties'=>new stdClass()]],
        ['name'=>'api_evaluate_grammar', 'description'=>'Evaluate a payload against a grammar rule.', 'method'=>'POST', 'path'=>'/api/evaluate', 'parameters'=>['type'=>'object','properties'=>['rule'=>['type'=>'string'],'payload'=>['type'=>'string']]]],
        ['name'=>'api_get_logic', 'description'=>'Read active logic statement, labels, evaluation, and Cauchy config.', 'method'=>'GET', 'path'=>'/api/logic', 'parameters'=>['type'=>'object','properties'=>new stdClass()]],
        ['name'=>'api_evaluate_logic', 'description'=>'Evaluate symbolic logic or lambda expression.', 'method'=>'POST', 'path'=>'/api/logic/evaluate', 'parameters'=>['type'=>'object','properties'=>['logic_statement'=>['type'=>'string'],'logic_labels'=>['type'=>'string'],'input'=>['type'=>'string']]]],
        ['name'=>'api_evaluate_cauchy', 'description'=>'Evaluate numeric Cauchy recurrence sequence.', 'method'=>'POST', 'path'=>'/api/logic/cauchy', 'parameters'=>['type'=>'object','properties'=>['seedValues'=>['type'=>'string'],'recurrenceExpr'=>['type'=>'string']]]],
        ['name'=>'api_export_workspace', 'description'=>'Export active workspace in a supported language.', 'method'=>'GET', 'path'=>'/api/export/{language}', 'parameters'=>['type'=>'object','properties'=>['language'=>['type'=>'string']],'required'=>['language']]],
        ['name'=>'api_export_logic', 'description'=>'Export logic statement as executable code (mode=cli|hardcoded).', 'method'=>'GET', 'path'=>'/api/logic/export/{language}', 'parameters'=>['type'=>'object','properties'=>['language'=>['type'=>'string'],'mode'=>['type'=>'string']],'required'=>['language']]],
        ['name'=>'api_evaluate_multiline_logic', 'description'=>'Evaluate a multiline formal boolean & lambda program with per-block truth tables.', 'method'=>'POST', 'path'=>'/api/logic/multiline', 'parameters'=>['type'=>'object','properties'=>['preInput'=>['type'=>'string'],'program'=>['type'=>'string']]]],
        ['name'=>'api_compile_schema_predicate_tree', 'description'=>'Compile a JSON Schema into Schema EBNF and Predicate-Argument Tree and validate an instance.', 'method'=>'POST', 'path'=>'/api/schema/predicate-tree', 'parameters'=>['type'=>'object','properties'=>['schema'=>['type'=>['string','object']],'instance'=>['type'=>['string','object']]]]],
        ['name'=>'api_list_modules', 'description'=>'List persisted Module Workbench drafts and processing pipeline rules.', 'method'=>'GET', 'path'=>'/api/modules', 'parameters'=>['type'=>'object','properties'=>new stdClass()]],
        ['name'=>'api_get_middleware_config', 'description'=>'Inspect Middleware Management Suite config (templates, slugs, frontend, Azure/AWS).', 'method'=>'GET', 'path'=>'/api/middleware/config', 'parameters'=>['type'=>'object','properties'=>new stdClass()]],
    ];
}

function mcp_export_for_client(string $client, string $prefix, ?string $serverId = null): array {
    $catalog = mcp_server_catalog();
    $targets = $serverId !== null && isset($catalog[$serverId]) ? [$catalog[$serverId]] : array_values($catalog);
    if ($client === 'foundry') {
        $mcpConnections = array_map(fn($t) => [
            'type'=>'mcp', 'server_label'=>'grammar2json_'.$t['id'], 'server_url'=>$prefix.'/api/mcp/'.$t['id'],
            'transport'=>'streamable-http', 'protocol_version'=>'2025-03-26', 'require_approval'=>'never',
            'allowed_tools'=>array_column($t['tools'], 'name'),
        ], $targets);
        $fnTools = [];
        foreach ($targets as $t) foreach ($t['tools'] as $tool) {
            $fnTools[] = ['type'=>'function', 'function'=>['name'=>$t['id'].'__'.$tool['name'], 'description'=>$tool['description'], 'parameters'=>$tool['inputSchema'], 'strict'=>false]];
        }
        foreach (openai_rest_api_tools() as $apiTool) {
            $fnTools[] = ['type'=>'function', 'function'=>['name'=>$apiTool['name'], 'description'=>$apiTool['description'], 'parameters'=>$apiTool['parameters'], 'strict'=>false]];
        }
        $bundle = [
            'schemaVersion'=>'microsoft.foundry.agent-workflow/v1',
            'platform'=>'Microsoft Foundry',
            'purpose'=>'Build AI agents and workflows in Microsoft Foundry, experiment with open or proprietary models.',
            'agent'=>[
                'name'=>$serverId ? "grammar2json-{$serverId}-agent" : 'grammar2json-studio-agent',
                'modelExperimentation'=>[
                    'proprietaryModels'=>[['id'=>'gpt-4.1','provider'=>'Azure OpenAI'],['id'=>'o4-mini','provider'=>'Azure OpenAI']],
                    'openModels'=>[['id'=>'Llama-3.3-70B-Instruct','provider'=>'Foundry Models (Open)'],['id'=>'Mistral-Large-2411','provider'=>'Foundry Models (Open)'],['id'=>'Phi-4','provider'=>'Microsoft Open Weights']],
                ],
                'tools'=>array_merge($mcpConnections, $fnTools),
            ],
            'azureConfiguration'=>['optionalCloudFlag'=>'ENABLE_AZURE_SUPPORT', 'apiVersion'=>'2025-05-01-preview'],
        ];
        return ['filename'=>'microsoft-foundry-mcp-workflow.json', 'mime'=>'application/json',
            'content'=>json_encode($bundle, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            'installHint'=>'Import into Microsoft Foundry Agent Service & Workflows for open or proprietary model experimentation.'];
    }
    if ($client === 'openai') {
        $manifest = openai_tools_manifest($prefix, 'all', 'responses', $serverId);
        return ['filename'=>'openai-tools-manifest.json', 'mime'=>'application/json',
            'content'=>json_encode($manifest, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            'installHint'=>'Use with OpenAI Responses API, Chat Completions, or POST /api/openai/tools/execute.'];
    }
    if ($client === 'aws_bedrock') {
        $bundle = [
            'schemaVersion'=>'aws.bedrock.agentcore-mcp/v1', 'optionalSupportFlag'=>'ENABLE_AWS_SUPPORT', 'defaultEnabled'=>false,
            'mcpTargets'=>array_map(fn($t) => ['targetName'=>'grammar2json-'.$t['id'], 'transport'=>'streamable-http', 'endpointUrl'=>$prefix.'/api/mcp/'.$t['id']], $targets),
        ];
        return ['filename'=>'aws-bedrock-agentcore-mcp.json', 'mime'=>'application/json',
            'content'=>json_encode($bundle, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            'installHint'=>'Optional AWS integration (default disabled). Set ENABLE_AWS_SUPPORT=true to enable.'];
    }
    $servers = [];
    foreach ($targets as $t) {
        $servers['grammar2json-'.$t['id']] = ['type'=>'http', 'url'=>$prefix.'/api/mcp/'.$t['id']];
    }
    return ['filename'=>$client.'-mcp.json', 'mime'=>'application/json',
        'content'=>json_encode(['mcpServers'=>$servers], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        'installHint'=>"Configure {$client} with the generated Streamable HTTP MCP endpoints."];
}

function openai_tools_manifest(string $prefix, string $scope = 'all', string $format = 'responses', ?string $serverId = null): array {
    $catalog = mcp_server_catalog();
    $targets = $serverId !== null && isset($catalog[$serverId]) ? [$catalog[$serverId]] : array_values($catalog);
    $tools = [];
    $mcpCount = 0;
    if ($scope === 'all' || $scope === 'mcp') {
        foreach ($targets as $t) foreach ($t['tools'] as $tool) {
            ++$mcpCount;
            $name = $t['id'].'__'.$tool['name'];
            $desc = "[MCP:{$t['id']}] {$tool['description']}";
            $tools[] = $format === 'responses'
                ? ['type'=>'function', 'name'=>$name, 'description'=>$desc, 'parameters'=>$tool['inputSchema'], 'strict'=>false]
                : ['type'=>'function', 'function'=>['name'=>$name, 'description'=>$desc, 'parameters'=>$tool['inputSchema'], 'strict'=>false]];
        }
    }
    $apiTools = openai_rest_api_tools();
    if ($scope === 'all' || $scope === 'api') {
        foreach ($apiTools as $apiTool) {
            $tools[] = $format === 'responses'
                ? ['type'=>'function', 'name'=>$apiTool['name'], 'description'=>$apiTool['description'], 'parameters'=>$apiTool['parameters'], 'strict'=>false]
                : ['type'=>'function', 'function'=>['name'=>$apiTool['name'], 'description'=>$apiTool['description'], 'parameters'=>$apiTool['parameters'], 'strict'=>false]];
        }
    }
    $responsesMcp = array_map(fn($t) => [
        'type'=>'mcp', 'server_label'=>'grammar2json_'.$t['id'], 'server_url'=>$prefix.'/api/mcp/'.$t['id'],
        'require_approval'=>'never', 'allowed_tools'=>array_column($t['tools'], 'name'),
    ], $targets);
    return [
        'schemaVersion'=>'openai.tools/v1', 'format'=>$format, 'scope'=>$scope, 'origin'=>$prefix,
        'executionEndpoint'=>$prefix.'/api/openai/tools/execute', 'unifiedMcpUrl'=>$prefix.'/api/mcp',
        'responsesApiMcpTools'=>$responsesMcp, 'tools'=>$tools,
        'counts'=>['mcpServers'=>count($targets), 'mcpTools'=>$mcpCount, 'restApiTools'=>$scope === 'mcp' ? 0 : count($apiTools), 'totalFunctionTools'=>count($tools)],
    ];
}

function serve_openai_tools(string $route, string $method): never {
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    if ($route === 'api/openai/tools') {
        if (!in_array($method, ['GET', 'HEAD'], true)) {
            header('Allow: GET, HEAD, OPTIONS');
            api_json(405, ['error'=>'Method not allowed.']);
        }
        $scope = is_string($_GET['scope'] ?? null) && in_array($_GET['scope'], ['all','mcp','api'], true) ? $_GET['scope'] : 'all';
        $format = is_string($_GET['format'] ?? null) && $_GET['format'] === 'chat_completions' ? 'chat_completions' : 'responses';
        $serverId = is_string($_GET['serverId'] ?? null) && isset(mcp_server_catalog()[$_GET['serverId']]) ? $_GET['serverId'] : null;
        $manifest = openai_tools_manifest($prefix, $scope, $format, $serverId);
        api_json(200, [...$manifest, '_links'=>[
            'self'=>['href'=>$prefix.'/api/openai/tools', 'method'=>'GET'],
            'execute'=>['href'=>$prefix.'/api/openai/tools/execute', 'method'=>'POST'],
            'root'=>['href'=>$prefix.'/api', 'method'=>'GET'],
        ]], true);
    }
    if ($route === 'api/openai/tools/execute') {
        if ($method !== 'POST') { header('Allow: POST, OPTIONS'); api_json(405, ['error'=>'Method not allowed.']); }
        try {
            $body = logic_request_object();
            $calls = [];
            if (is_array($body->tool_calls ?? null)) {
                foreach ($body->tool_calls as $idx => $tc) {
                    if (!$tc instanceof stdClass) continue;
                    $fn = ($tc->function ?? null) instanceof stdClass ? $tc->function : $tc;
                    $rawArgs = $fn->arguments ?? new stdClass();
                    if (is_string($rawArgs)) $rawArgs = json_decode($rawArgs, false, 16) ?: new stdClass();
                    if (!$rawArgs instanceof stdClass) $rawArgs = new stdClass();
                    $calls[] = ['id'=>(string)($tc->id ?? 'call_'.($idx + 1)), 'name'=>(string)($fn->name ?? ''), 'args'=>$rawArgs];
                }
            } elseif (is_string($body->name ?? null)) {
                $rawArgs = $body->arguments ?? new stdClass();
                if (is_string($rawArgs)) $rawArgs = json_decode($rawArgs, false, 16) ?: new stdClass();
                if (!$rawArgs instanceof stdClass) $rawArgs = new stdClass();
                $calls[] = ['id'=>(string)($body->tool_call_id ?? 'call_1'), 'name'=>$body->name, 'args'=>$rawArgs];
            } else {
                api_json(400, ['ok'=>false, 'error'=>'Provide { "name", "arguments" } or { "tool_calls": [...] }.'], true);
            }
            $state = logic_state(logic_store());
            $workspace = workspace_default($state);
            $messages = [];
            foreach ($calls as $call) {
                $name = $call['name'];
                $args = $call['args'];
                if (str_contains($name, '__')) {
                    [$srv, $tName] = explode('__', $name, 2);
                    try { $out = mcp_execute_tool($srv, $tName, $args, $state); }
                    catch (Throwable $e) { $out = ['ok'=>false, 'error'=>$e->getMessage()]; }
                } else {
                    $out = match ($name) {
                        'api_discover_root' => ['service'=>'Grammar2JSON Studio PHP API', 'partial'=>false],
                        'api_list_rules' => ['rules'=>parse_grammar($workspace->grammarText, $workspace->dialect)],
                        'api_list_symbols' => ['symbols'=>grammar_symbols($workspace)],
                        'api_evaluate_grammar' => (new GrammarPayloadEvaluator(parse_grammar($workspace->grammarText, $workspace->dialect), $workspace, is_string($args->payload ?? null) ? $args->payload : $workspace->evalPayload))->evaluate(is_string($args->rule ?? null) ? $args->rule : $workspace->evalRule),
                        'api_get_logic' => ['statement'=>$state['statement'], 'labels'=>$state['labels'], 'evaluation'=>evaluate_statement($state['statement'], $state['labels'])],
                        'api_evaluate_logic' => (function () use ($args, $state) {
                            [$st, $lb] = normalized_input($args, 0, $state);
                            return ['statement'=>$st, ...evaluate_statement($st, $lb)];
                        })(),
                        'api_evaluate_cauchy' => evaluate_cauchy($args, $state['labels'], $state['cauchyConfig']),
                        'api_export_logic' => logic_export_target($state, is_string($args->language ?? null) ? $args->language : 'python', is_string($args->mode ?? null) ? $args->mode : 'cli'),
                        'api_evaluate_multiline_logic' => evaluate_multiline_logic_program(is_string($args->preInput ?? null) ? $args->preInput : 'e=true', is_string($args->program ?? null) ? $args->program : "a(b,c)=b & c\nd=false\na(e,d)"),
                        'api_compile_schema_predicate_tree' => evaluate_schema_predicate_studio(property_exists($args, 'schema') ? $args->schema : DEFAULT_JSON_SCHEMA_SAMPLE, property_exists($args, 'instance') ? $args->instance : DEFAULT_TEST_INSTANCE_SAMPLE),
                        'api_list_modules' => ['count'=>count($state['modules'] ?? []), 'modules'=>$state['modules'] ?? []],
                        'api_get_middleware_config' => middleware_active_config($state),
                        default => ['ok'=>false, 'error'=>"Unknown OpenAI tool '$name'."],
                    };
                }
                $messages[] = [
                    'tool_call_id'=>$call['id'], 'role'=>'tool', 'name'=>$name,
                    'content'=>json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'parsed'=>$out,
                ];
            }
            api_json(200, ['ok'=>true, 'count'=>count($messages), 'messages'=>$messages, '_links'=>[
                'self'=>['href'=>$prefix.'/api/openai/tools/execute', 'method'=>'POST'],
                'tools'=>['href'=>$prefix.'/api/openai/tools', 'method'=>'GET'],
            ]], true);
        } catch (InputError $e) {
            api_json(400, ['ok'=>false, 'error'=>$e->getMessage()], true);
        } catch (LogicStorageError $e) {
            api_json(503, ['ok'=>false, 'error'=>$e->getMessage()], true);
        }
    }
    api_json(404, ['error'=>'Unknown OpenAI endpoint.']);
}

function serve_mcp(string $route, string $method): never {
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    $catalog = mcp_server_catalog();

    if ($route === 'api/mcp/servers') {
        if (!in_array($method, ['GET', 'HEAD'], true)) { header('Allow: GET, HEAD, OPTIONS'); api_json(405, ['error'=>'Method not allowed.']); }
        $servers = array_map(fn($s) => [
            ...$s, 'status'=>'ready', 'activation'=>'build-on-call', 'cacheHits'=>0, 'cacheSize'=>0,
            '_links'=>[
                'self'=>['href'=>$prefix.'/api/mcp/'.$s['id'], 'method'=>'GET'],
                'rpc'=>['href'=>$prefix.'/api/mcp/'.$s['id'], 'method'=>'POST'],
                'exportFoundry'=>['href'=>$prefix.'/api/mcp/'.$s['id'].'/export/foundry', 'method'=>'GET'],
                'exportOpenai'=>['href'=>$prefix.'/api/mcp/'.$s['id'].'/export/openai', 'method'=>'GET'],
                'exportAwsBedrock'=>['href'=>$prefix.'/api/mcp/'.$s['id'].'/export/aws_bedrock', 'method'=>'GET'],
                'exportVscode'=>['href'=>$prefix.'/api/mcp/'.$s['id'].'/export/vscode', 'method'=>'GET'],
                'exportOllama'=>['href'=>$prefix.'/api/mcp/'.$s['id'].'/export/ollama', 'method'=>'GET'],
                'exportOpenclaw'=>['href'=>$prefix.'/api/mcp/'.$s['id'].'/export/openclaw', 'method'=>'GET'],
            ],
        ], array_values($catalog));
        api_json(200, [
            'protocol'=>'MCP 2025-03-26 (Streamable HTTP)', 'activation'=>'build-on-call', 'caching'=>'content-addressed-lru',
            'servers'=>$servers,
            '_links'=>[
                'self'=>['href'=>$prefix.'/api/mcp/servers', 'method'=>'GET'],
                'root'=>['href'=>$prefix.'/api', 'method'=>'GET'],
                'unifiedRpc'=>['href'=>$prefix.'/api/mcp', 'method'=>'POST'],
            ],
        ], true);
    }

    if (preg_match('~^api/mcp/([^/]+)/export/([^/]+)$~', $route, $m)) {
        if (!in_array($method, ['GET', 'HEAD'], true)) { header('Allow: GET, HEAD, OPTIONS'); api_json(405, ['error'=>'Method not allowed.']); }
        $srv = $m[1] === 'all' ? null : $m[1];
        if ($srv !== null && !isset($catalog[$srv])) api_json(404, ['error'=>"Unknown MCP server '{$m[1]}'."], true);
        $client = $m[2];
        $exported = mcp_export_for_client($client, $prefix, $srv);
        api_json(200, ['client'=>$client, 'serverId'=>$srv ?? 'all', ...$exported, '_links'=>[
            'self'=>['href'=>$prefix.'/'.$route, 'method'=>'GET'],
            'servers'=>['href'=>$prefix.'/api/mcp/servers', 'method'=>'GET'],
        ]], true);
    }

    if ($route === 'api/mcp/context' && $method === 'POST') {
        try {
            $patch = logic_request_object(true);
            $db = logic_store();
            if ($db !== null) {
                logic_mutate($db, function (array $state) use ($patch): array {
                    $ws = workspace_default($state);
                    foreach (['grammarText','evalRule','evalPayload','dslSource'] as $k) {
                        if (is_string($patch->$k ?? null)) $ws->$k = $patch->$k;
                    }
                    if (is_string($patch->logicStatement ?? null)) { $state['statement'] = $patch->logicStatement; $ws->logicStatement = $patch->logicStatement; }
                    save_active_workspace($state, $ws);
                    return [$state, true];
                });
            }
            api_json(200, ['ok'=>true, '_links'=>['root'=>['href'=>$prefix.'/api','method'=>'GET']]], true);
        } catch (InputError $e) { api_json(400, ['error'=>$e->getMessage()], true); }
        catch (LogicStorageError $e) { api_json(503, ['error'=>$e->getMessage()], true); }
    }

    if ($route === 'api/mcp/cache/clear' && $method === 'POST') {
        api_json(200, ['ok'=>true, 'cleared'=>true, '_links'=>['servers'=>['href'=>$prefix.'/api/mcp/servers','method'=>'GET']]], true);
    }

    $unified = $route === 'api/mcp';
    $serverId = $unified ? null : substr($route, strlen('api/mcp/'));
    if (!$unified && !isset($catalog[$serverId])) {
        if ($method === 'POST') {
            api_json(404, ['jsonrpc'=>'2.0', 'id'=>null, 'error'=>['code'=>-32601, 'message'=>"Unknown MCP server '{$serverId}'."]]);
        }
        api_json(404, ['error'=>"Unknown MCP server '{$serverId}'.", 'available'=>array_keys($catalog)], true);
    }

    if (!$unified && in_array($method, ['GET', 'HEAD'], true)) {
        $s = $catalog[$serverId];
        api_json(200, [
            ...$s, 'status'=>'ready', 'activation'=>'build-on-call',
            'clientConfig'=>json_decode(mcp_export_for_client('cursor', $prefix, $serverId)['content'], true),
            '_links'=>[
                'self'=>['href'=>$prefix.'/api/mcp/'.$serverId, 'method'=>'GET'],
                'rpc'=>['href'=>$prefix.'/api/mcp/'.$serverId, 'method'=>'POST'],
                'exportFoundry'=>['href'=>$prefix.'/api/mcp/'.$serverId.'/export/foundry', 'method'=>'GET'],
                'exportOpenai'=>['href'=>$prefix.'/api/mcp/'.$serverId.'/export/openai', 'method'=>'GET'],
                'exportAwsBedrock'=>['href'=>$prefix.'/api/mcp/'.$serverId.'/export/aws_bedrock', 'method'=>'GET'],
                'exportVscode'=>['href'=>$prefix.'/api/mcp/'.$serverId.'/export/vscode', 'method'=>'GET'],
                'servers'=>['href'=>$prefix.'/api/mcp/servers', 'method'=>'GET'],
            ],
        ], true);
    }

    if ($method !== 'POST') {
        header('Allow: GET, HEAD, POST, OPTIONS');
        api_json(405, ['error'=>'Method not allowed.']);
    }

    try {
        $request = logic_request_object();
        $id = $request->id ?? null;
        if (($request->jsonrpc ?? null) !== '2.0' || !is_string($request->method ?? null)
            || !(is_string($id) || is_int($id) || $id === null)) {
            api_json(400, ['jsonrpc'=>'2.0', 'id'=>null, 'error'=>['code'=>-32600,'message'=>'Invalid JSON-RPC 2.0 request.']]);
        }
        if (!property_exists($request, 'id')) {
            http_response_code(202);
            header('Cache-Control: no-store');
            exit;
        }
        $reply = ['jsonrpc'=>'2.0', 'id'=>$id];
        if ($request->method === 'initialize') {
            $capabilities = ['tools'=>['listChanged'=>false], 'resources'=>['subscribe'=>false, 'listChanged'=>false]];
            api_json(200, [...$reply, 'result'=>[
                'protocolVersion'=>'2025-03-26', 'capabilities'=>$capabilities,
                'serverInfo'=>['name'=>$unified ? 'grammar2json-unified-mcp' : "grammar2json-{$serverId}-mcp", 'version'=>'2.3.0'],
            ]]);
        }
        if ($request->method === 'ping') api_json(200, [...$reply, 'result'=>new stdClass()]);
        if ($request->method === 'tools/list') {
            $tools = [];
            if ($unified) {
                foreach ($catalog as $srv) foreach ($srv['tools'] as $t) {
                    $tools[] = [...$t, 'name'=>$srv['id'].'__'.$t['name']];
                }
            } else {
                $tools = $catalog[$serverId]['tools'];
            }
            api_json(200, [...$reply, 'result'=>['tools'=>$tools]]);
        }
        if ($request->method === 'resources/list') {
            $state = logic_state(logic_store());
            $ids = $unified ? array_keys($catalog) : [$serverId];
            $resources = array_map(function (string $sid) use ($state): array {
                $r = mcp_resource_for_server($sid, $state);
                return ['uri'=>$r['uri'], 'name'=>$r['name'], 'mimeType'=>$r['mimeType'], 'description'=>"Live {$sid} artifact."];
            }, $ids);
            api_json(200, [...$reply, 'result'=>['resources'=>$resources]]);
        }
        if ($request->method === 'resources/read') {
            $params = $request->params ?? null;
            if (!$params instanceof stdClass || !is_string($params->uri ?? null)) {
                api_json(200, [...$reply, 'error'=>['code'=>-32602, 'message'=>'Resource read requires a URI.']]);
            }
            $state = logic_state(logic_store());
            $ids = $unified ? array_keys($catalog) : [$serverId];
            foreach ($ids as $sid) {
                $r = mcp_resource_for_server($sid, $state);
                if ($r['uri'] === $params->uri) {
                    api_json(200, [...$reply, 'result'=>['contents'=>[['uri'=>$r['uri'], 'mimeType'=>$r['mimeType'], 'text'=>$r['text']]]]]);
                }
            }
            api_json(200, [...$reply, 'error'=>['code'=>-32002, 'message'=>'Resource not found.']]);
        }
        if ($request->method !== 'tools/call') {
            api_json(200, [...$reply, 'error'=>['code'=>-32601, 'message'=>'Unsupported MCP method: '.$request->method]]);
        }
        $params = $request->params ?? null;
        if (!$params instanceof stdClass || !is_string($params->name ?? null)
            || (isset($params->arguments) && !$params->arguments instanceof stdClass)) {
            api_json(200, [...$reply, 'error'=>['code'=>-32602, 'message'=>'Tool call requires a name and object arguments.']]);
        }
        $targetServer = $serverId;
        $targetTool = $params->name;
        if ($unified) {
            if (!str_contains($targetTool, '__')) {
                api_json(200, [...$reply, 'error'=>['code'=>-32601, 'message'=>'Unified MCP tool names must use server__tool format.']]);
            }
            [$targetServer, $targetTool] = explode('__', $targetTool, 2);
            if (!isset($catalog[$targetServer])) {
                api_json(200, [...$reply, 'error'=>['code'=>-32601, 'message'=>'Unknown MCP server in tool name.']]);
            }
        }
        $knownTools = array_column($catalog[$targetServer]['tools'], 'name');
        if (!in_array($targetTool, $knownTools, true)) {
            api_json(200, [...$reply, 'error'=>['code'=>-32601, 'message'=>'Unknown MCP tool.']]);
        }
        $state = logic_state(logic_store());
        $payload = mcp_execute_tool($targetServer, $targetTool, $params->arguments ?? new stdClass(), $state);
        $encoded = json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        api_json(200, [...$reply, 'result'=>[
            'content'=>[['type'=>'text', 'text'=>$encoded]], 'structuredContent'=>$payload, 'isError'=>!($payload['ok'] ?? true),
        ]]);
    } catch (InputError $error) {
        api_json(400, ['jsonrpc'=>'2.0', 'id'=>null, 'error'=>['code'=>-32600, 'message'=>$error->getMessage()]]);
    } catch (LogicStorageError $error) {
        api_json(503, ['jsonrpc'=>'2.0', 'id'=>$id ?? null, 'error'=>['code'=>-32000, 'message'=>$error->getMessage()]]);
    } catch (JsonException $error) {
        error_log('MCP response encoding failed: '.$error->getMessage());
        api_json(500, ['jsonrpc'=>'2.0', 'id'=>$id ?? null, 'error'=>['code'=>-32603, 'message'=>'MCP response encoding failed.']]);
    }
}
