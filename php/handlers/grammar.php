<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

const GRAMMAR_SYMBOL_LABELS = [
    'oneOrMore'=>'One or More (+)', 'zeroOrMore'=>'Zero or More (*)', 'optional'=>'Optional (?)',
    'repeatBraces'=>'Bounded / EBNF Braces', 'groupParens'=>'Group Parens', 'charClassBrackets'=>'Char Class / Opt Brackets',
    'posLookahead'=>'Pos Lookahead', 'negLookahead'=>'Neg Lookahead', 'posLookbehind'=>'Pos Lookbehind',
    'negLookbehind'=>'Neg Lookbehind', 'wildcard'=>'Wildcard', 'regexDelimiter'=>'Inline Regex',
];

const GRAMMAR_DEFAULT_SYMBOLS = [
    'oneOrMore'=>'+', 'zeroOrMore'=>'*', 'optional'=>'?', 'repeatBraces'=>'{}', 'groupParens'=>'()',
    'charClassBrackets'=>'[]', 'posLookahead'=>'&', 'negLookahead'=>'!', 'posLookbehind'=>'(?<=',
    'negLookbehind'=>'(?<!', 'wildcard'=>'.', 'regexDelimiter'=>'/',
];

function grammar_rule_members(array $rule, array $rules, stdClass $workspace, string $prefix): array {
    $name = $rule['name'];
    $config = $workspace->ruleConfigs->$name ?? (object)['precedence'=>$rule['lineNumber'], 'associativity'=>'left', 'properties'=>[]];
    $mutation = $workspace->mutations->$name ?? null;
    $locked = in_array($name, $workspace->mutationPolicy->lockedRules ?? [], true);
    $indegree = 0;
    foreach ($rules as $other) if (in_array($name, $other['referencedRules'], true)) ++$indegree;
    $items = [
        'expression'=>[$rule['expression'], !$locked, 'Locked by x-mutation-policy'],
        'precedence'=>[$config->precedence, !$locked, 'Locked by x-mutation-policy'],
        'associativity'=>[$config->associativity, !$locked, 'Locked by x-mutation-policy'],
        'properties'=>[$config->properties, !$locked, 'Locked by x-mutation-policy'],
        'mutation'=>[$mutation, !$locked, 'Locked by x-mutation-policy'],
        'locked'=>[$locked, true, ''],
        'id'=>[$rule['id'], false, 'Immutable structural rule identifier'],
        'name'=>[$name, false, 'Use PUT /api/rules/:name with nextName to rename'],
        'lineNumber'=>[$rule['lineNumber'], false, 'Derived from grammar source line index'],
        'alternatives'=>[$rule['alternatives'], false, 'Computed from expression AST'],
        'referencedRules'=>[$rule['referencedRules'], false, 'Computed DAG out-edges'],
        'undefinedReferences'=>[$rule['undefinedReferences'], false, 'Computed DAG diagnostic'],
        'literals'=>[$rule['literals'], false, 'Extracted terminal literals'],
        'usedOperators'=>[grammar_operators($rule['expression'], $workspace->dialect), false, 'Detected Extended DAG operator symbols'],
        'inDegree'=>[$indegree, false, 'Computed DAG in-degree'],
        'outDegree'=>[count($rule['referencedRules']) + count($rule['undefinedReferences']), false, 'Computed DAG out-degree'],
        'rawLine'=>[$rule['rawLine'], false, 'Derived source line'],
    ];
    return describe_node_members($items, 'rule', $name, $prefix);
}

function describe_node_members(array $items, string $kind, string $name, string $prefix): array {
    $encoded = rawurlencode($name); $href = $prefix.'/api/nodes/'.$kind.'/'.$encoded;
    $members = [];
    foreach ($items as $member=>[$value,$mutable,$reason]) {
        $memberHref = $href.'/members/'.rawurlencode($member);
        $links = [
            'self'=>['href'=>$memberHref,'method'=>'GET','title'=>"Read member '$member'",'type'=>'application/hal+json'],
            'node'=>['href'=>$href,'method'=>'GET','title'=>'Parent node'],
            'members'=>['href'=>$href.'/members','method'=>'GET','title'=>'All node members'],
        ];
        $actions = new stdClass();
        if ($mutable) {
            $links['update'] = ['href'=>$memberHref,'method'=>'PATCH','title'=>"Patch member '$member'"];
            $links['replace'] = ['href'=>$memberHref,'method'=>'PUT','title'=>"Replace member '$member'"];
            $links['reset'] = ['href'=>$memberHref,'method'=>'DELETE','title'=>"Reset/clear member '$member'"];
            $type = is_string($value) ? 'string' : (is_bool($value) ? 'boolean' : (is_int($value) || is_float($value) ? 'number' : 'object'));
            foreach (['update'=>['PATCH',"Update $member"],'replace'=>['PUT',"Replace $member"]] as $key=>[$actionMethod,$title]) {
                $actions->$key = ['name'=>$key,'title'=>$title,'href'=>$memberHref,'method'=>$actionMethod,'contentType'=>'application/json',
                    'fields'=>[['name'=>'value','type'=>$type,'required'=>true,'example'=>$value]]];
            }
            $actions->reset = ['name'=>'reset','title'=>"Clear/Reset $member",'href'=>$memberHref,'method'=>'DELETE'];
        }
        $links['pretty'] = ['href'=>$prefix.'/nodes/'.$kind.'/'.$encoded.'/members/'.rawurlencode($member),'method'=>'GET','title'=>'Extended pretty member URL'];
        $links['short'] = ['href'=>$prefix.'/members/'.rawurlencode($member).'?node='.rawurlencode($kind.'/'.$name),'method'=>'GET','title'=>'Short member URL; node query identifies its parent'];
        $valueType = $value === null ? 'null' : (is_array($value) ? 'array' : (is_string($value) ? 'string' : (is_bool($value) ? 'boolean' : (is_int($value) || is_float($value) ? 'number' : 'object'))));
        $members[$member] = ['name'=>$member,'value'=>$value,'valueType'=>$valueType,'mutable'=>$mutable,
            ...(!$mutable ? ['readOnlyReason'=>$reason] : []),
            'allowedMethods'=>$mutable ? ['GET','HEAD','OPTIONS','PUT','PATCH','DELETE'] : ['GET','HEAD','OPTIONS'],
            '_links'=>$links,'_actions'=>$actions];
    }
    return $members;
}

function dialect_preset(string $name): stdClass {
    $presets = [
        'ebnf'=>['::=','|','//'], 'bnf'=>['::=','|','#'], 'peg'=>['=','/','#'],
        'python_peg'=>[':','|','#'], 'rust_macro'=>['=>','|','//'], 'wat_sexpr'=>[':=','|',';;'],
    ];
    if (!isset($presets[$name])) throw new InputError('Unknown dialect preset.');
    [$operator,$choice,$comment] = $presets[$name];
    $symbols = GRAMMAR_DEFAULT_SYMBOLS;
    if ($name === 'peg') $symbols['regexDelimiter'] = '';
    return (object)['preset'=>$name,'ruleOperator'=>$operator,'choiceDelimiter'=>$choice,'commentPrefix'=>$comment,'symbols'=>(object)$symbols];
}

function grammar_symbols(stdClass $workspace): array {
    $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
    $symbols = $workspace->dialect->symbols ?? new stdClass();
    $counts = array_fill_keys(array_keys(GRAMMAR_SYMBOL_LABELS), 0);
    foreach ($rules as $rule) foreach (grammar_operators($rule['expression'], $workspace->dialect) as $operator) {
        $key = explode(':', $operator, 2)[0];
        ++$counts[$key];
    }
    $result = [];
    foreach (GRAMMAR_SYMBOL_LABELS as $key=>$label) {
        $value = is_string($symbols->$key ?? null) ? trim($symbols->$key) : '';
        $result[] = ['key'=>$key, 'label'=>$label, 'value'=>$value, 'enabled'=>$value !== '', 'usageCount'=>$counts[$key]];
    }
    return $result;
}

function symbol_node(array $symbol, string $prefix): array {
    $id = $symbol['key']; $href = $prefix.'/api/nodes/symbol/'.rawurlencode($id);
    $members = describe_node_members([
        'value'=>[$symbol['value'],true,''], 'key'=>[$id,false,'Immutable symbol registry key'],
        'label'=>[$symbol['label'],false,'Immutable symbol specification label'],
        'enabled'=>[$symbol['enabled'],false,'Derived from non-empty symbol value'],
        'usageCount'=>[$symbol['usageCount'],false,'Computed Extended DAG usage count'],
    ], 'symbol', $id, $prefix);
    return ['kind'=>'symbol','id'=>$id,'label'=>'Symbol: '.$symbol['label'],'href'=>$href,'mutableCount'=>1,'immutableCount'=>4,'members'=>$members,
        '_links'=>['self'=>['href'=>$href,'method'=>'GET'],'members'=>['href'=>$href.'/members','method'=>'GET'],
            'collection'=>['href'=>$prefix.'/api/symbols','method'=>'GET'],
            'pretty'=>['href'=>$prefix.'/nodes/symbol/'.rawurlencode($id),'method'=>'GET','title'=>'Pretty node URL']],
        '_actions'=>['setSymbolValue'=>['name'=>'setSymbolValue','title'=>"Set or Disable $id (empty string disables)",
            'href'=>$href.'/members/value','method'=>'PATCH','contentType'=>'application/json',
            'fields'=>[['name'=>'value','type'=>'string','required'=>true,'example'=>$symbol['value']]]]]];
}

function rule_node(array $rule, array $rules, stdClass $workspace, string $prefix): array {
    $name = $rule['name']; $href = $prefix.'/api/nodes/rule/'.rawurlencode($name);
    $members = grammar_rule_members($rule, $rules, $workspace, $prefix);
    $mutable = count(array_filter($members, fn($member) => $member['mutable']));
    $resource = $prefix.'/api/rules/'.rawurlencode($name);
    return ['kind'=>'rule','id'=>$name,'label'=>"<$name>",'href'=>$href,'mutableCount'=>$mutable,
        'immutableCount'=>count($members)-$mutable,'members'=>$members,
        '_links'=>['self'=>['href'=>$href,'method'=>'GET','title'=>"Inspect rule node <$name>"],
            'members'=>['href'=>$href.'/members','method'=>'GET','title'=>'All mutable & immutable members'],
            'ruleResource'=>['href'=>$resource,'method'=>'GET','title'=>'Rule CRUD resource'],
            'evaluate'=>['href'=>$prefix.'/api/evaluate','method'=>'POST','title'=>"Evaluate payload starting at <$name>"],
            'collection'=>['href'=>$prefix.'/api/nodes','method'=>'GET','title'=>'All addressable nodes'],
            'pretty'=>['href'=>$prefix.'/nodes/rule/'.rawurlencode($name),'method'=>'GET','title'=>'Pretty node URL']],
        '_actions'=>['patchExpression'=>['name'=>'patchExpression','title'=>"Update <$name> expression",
            'href'=>$href.'/members/expression','method'=>'PATCH','contentType'=>'application/json',
            'fields'=>[['name'=>'value','type'=>'string','required'=>true,'example'=>$rule['expression']]]],
            'deleteRule'=>['name'=>'deleteRule','title'=>"Delete rule <$name>",'href'=>$resource,'method'=>'DELETE']]];
}

function dialect_node(stdClass $workspace, string $prefix): array {
    $href = $prefix.'/api/nodes/dialect/active'; $dialect = $workspace->dialect;
    $members = describe_node_members([
        'preset'=>[$dialect->preset,true,''], 'ruleOperator'=>[$dialect->ruleOperator,true,''],
        'choiceDelimiter'=>[$dialect->choiceDelimiter,true,''], 'commentPrefix'=>[$dialect->commentPrefix,true,''],
        'symbols'=>[$dialect->symbols,true,''],
        'enabledSymbolCount'=>[count(array_filter(grammar_symbols($workspace), fn($symbol) => $symbol['enabled'])),false,'Computed count of enabled Extended DAG symbols'],
    ], 'dialect', 'active', $prefix);
    return ['kind'=>'dialect','id'=>'active','label'=>'Dialect ('.$dialect->preset.')','href'=>$href,'mutableCount'=>5,'immutableCount'=>1,'members'=>$members,
        '_links'=>['self'=>['href'=>$href,'method'=>'GET','title'=>'Active Dialect Node'],'members'=>['href'=>$href.'/members','method'=>'GET'],
            'symbols'=>['href'=>$prefix.'/api/symbols','method'=>'GET','title'=>'Extended DAG Symbols'],
            'pretty'=>['href'=>$prefix.'/nodes/dialect/active','method'=>'GET','title'=>'Pretty node URL']],
        '_actions'=>['updateRuleOperator'=>['name'=>'updateRuleOperator','title'=>'Update Rule Operator',
            'href'=>$href.'/members/ruleOperator','method'=>'PATCH','contentType'=>'application/json',
            'fields'=>[['name'=>'value','type'=>'string','required'=>true,'example'=>$dialect->ruleOperator]]]]];
}

function find_grammar_node(string $kind, string $id, stdClass $workspace, string $prefix): ?array {
    if ($kind === 'rule') {
        $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
        foreach ($rules as $rule) if ($rule['name'] === $id) return rule_node($rule, $rules, $workspace, $prefix);
    } elseif ($kind === 'symbol') {
        foreach (grammar_symbols($workspace) as $symbol) if ($symbol['key'] === $id) return symbol_node($symbol, $prefix);
    } elseif ($kind === 'dialect' && $id === 'active') return dialect_node($workspace, $prefix);
    return null;
}

function serve_grammar_nodes(string $method): never {
    if (!in_array($method, ['GET','HEAD'], true)) {
        header('Allow: GET, HEAD, OPTIONS');
        api_json(405, ['error'=>'Method not allowed.'], true);
    }
    $kind = $_GET['kind'] ?? '';
    if (!is_string($kind)) api_json(400, ['error'=>'Node kind must be text.'], true);
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    try {
        $state = logic_state(logic_store());
        $workspace = workspace_default($state);
        $nodes = [];
        if ($kind === '' || $kind === 'rule') {
            $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
            foreach ($rules as $rule) $nodes[] = rule_node($rule, $rules, $workspace, $prefix);
        }
        if ($kind === '' || $kind === 'dialect') $nodes[] = dialect_node($workspace, $prefix);
        if ($kind === '' || $kind === 'symbol') {
            foreach (grammar_symbols($workspace) as $symbol) $nodes[] = symbol_node($symbol, $prefix);
        }
        if ($kind === '' || $kind === 'logic') $nodes[] = logic_node($state, $prefix);
        if ($kind === '' || $kind === 'callback') foreach ($state['callbacks'] as $callback) $nodes[] = callback_node($callback, $prefix);
        if ($kind === '' || $kind === 'histolog') foreach (array_slice(history_available($state), -8) as $entry) $nodes[] = history_node($entry, $prefix);
        $items = [];
        foreach ($nodes as $node) $items[] = ['kind'=>$node['kind'],'id'=>$node['id'],'label'=>$node['label'],
            'mutableCount'=>$node['mutableCount'],'immutableCount'=>$node['immutableCount'],
            'memberNames'=>array_keys($node['members']),'_links'=>$node['_links'],'_actions'=>$node['_actions']];
        $kinds = [];
        if (parse_grammar($workspace->grammarText, $workspace->dialect)) $kinds[] = 'rule';
        array_push($kinds, 'dialect', 'symbol', 'logic');
        if ($state['callbacks']) $kinds[] = 'callback';
        $kinds[] = 'histolog';
        api_json(200, ['count'=>count($items),'kinds'=>$kinds,'_embedded'=>['nodes'=>$items],
            '_links'=>['self'=>['href'=>$prefix.'/api/nodes','method'=>'GET'],
                'root'=>['href'=>$prefix.'/api','method'=>'GET']]], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage()], true);
    } catch (UnsupportedLogic $error) {
        api_json(503, ['error'=>'PHP logic evaluator cannot handle this input: '.$error->getMessage()], true);
    }
}

function serve_grammar_export(string $method, string $language = 'grammar'): never {
    if (!in_array($method, ['GET','HEAD'], true)) {
        header('Allow: GET, HEAD, OPTIONS');
        api_json(405, ['error'=>'Method not allowed.'], true);
    }
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    try {
        $workspace = workspace_default(logic_state(logic_store()));
        $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
        usort($rules, function ($a, $b) use ($workspace) {
            $pa = $workspace->ruleConfigs->{$a['name']}->precedence ?? $a['lineNumber'];
            $pb = $workspace->ruleConfigs->{$b['name']}->precedence ?? $b['lineNumber'];
            return ($pa <=> $pb) ?: ($a['lineNumber'] <=> $b['lineNumber']);
        });
        $schemaName = $workspace->schemaConfig->schemaName;
        $slug = preg_replace('/[^A-Za-z0-9_-]/', '_', $schemaName !== '' ? $schemaName : 'grammar_schema');
        if ($language === 'jsonld') {
            api_json(200, ['language'=>'jsonld','content'=>grammar_schema_json($rules, $workspace),
                'filename'=>"$slug.schema.jsonld",'mime'=>'application/ld+json','label'=>'Schema.org JSON-LD',
                '_links'=>['self'=>['href'=>$prefix.'/api/export/jsonld','method'=>'GET'],
                    'languages'=>['href'=>$prefix.'/api/languages','method'=>'GET'],'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET']]], true);
        }
        if (in_array($language, ['python','rust','wat'], true)) {
            [$content, $extension, $mime, $label] = match ($language) {
                'python'=>[workspace_python_source($rules, $workspace), 'py', 'text/x-python', 'Python (.py)'],
                'rust'=>[workspace_rust_source($rules, $workspace), 'rs', 'text/plain', 'Rust (.rs)'],
                'wat'=>[workspace_wat_source($rules, $workspace), 'wat', 'text/plain', 'WABT / WAT (.wat)'],
            };
            api_json(200, ['language'=>$language,'content'=>$content,'filename'=>"$slug.$extension",'mime'=>$mime,'label'=>$label,
                '_links'=>['self'=>['href'=>$prefix.'/api/export/'.$language,'method'=>'GET'],
                    'languages'=>['href'=>$prefix.'/api/languages','method'=>'GET'],'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET']]], true);
        }
        if ($language !== 'grammar') {
            $export = workspace_other_export($language, $rules, $workspace, $slug);
            if ($export === null) api_json(503, ['error'=>'This workspace export language is not implemented.'], true);
            api_json(200, ['language'=>$language, ...$export,
                '_links'=>['self'=>['href'=>$prefix.'/api/export/'.rawurlencode($language),'method'=>'GET'],
                    'languages'=>['href'=>$prefix.'/api/languages','method'=>'GET'],'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET']]], true);
        }
        $dialect = $workspace->dialect;
        $ext = $dialect->preset === 'bnf' ? 'bnf' : (in_array($dialect->preset, ['peg','python_peg'], true) ? 'peg' : 'ebnf');
        $comment = $dialect->commentPrefix !== '' ? $dialect->commentPrefix : '//';
        $lines = ["$comment Exported Grammar ($dialect->preset) — $slug", "$comment Ordered by precedence (Order of Operations)"];
        foreach ($rules as $rule) {
            $config = $workspace->ruleConfigs->{$rule['name']} ?? null;
            $precedence = $config->precedence ?? $rule['lineNumber'];
            $assoc = $config->associativity ?? 'left';
            $properties = $config->properties ?? [];
            if (!is_array($properties)) throw new LogicStorageError('Rule properties are invalid.');
            $props = [];
            foreach ($properties as $property) {
                if (!$property instanceof stdClass || !is_string($property->name ?? null) || !is_string($property->value ?? null)) throw new LogicStorageError('Rule properties are invalid.');
                $props[] = $property->name.'='.$property->value;
            }
            $lines[] = "$comment [op #$precedence | assoc=$assoc".($props ? ' | props: '.implode(', ', $props) : '').']';
            $operator = trim($dialect->ruleOperator);
            $lines[] = $rule['name'].($operator === '' ? '' : ' '.$operator).' '.grammar_normalize_expression($rule['expression']);
        }
        api_json(200, ['language'=>'grammar','content'=>implode("\n", $lines)."\n",'filename'=>"$slug.$ext",
            'mime'=>'text/plain','label'=>'Grammar ('.strtoupper($dialect->preset).')',
            '_links'=>['self'=>['href'=>$prefix.'/api/export/grammar','method'=>'GET'],
                'languages'=>['href'=>$prefix.'/api/languages','method'=>'GET'],'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET']]], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage()], true);
    }
}

function serve_grammar_evaluation(string $method): never {
    if ($method !== 'POST') {
        header('Allow: POST, OPTIONS');
        api_json(405, ['error'=>'Method not allowed.'], true);
    }
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    $links = ['self'=>['href'=>$prefix.'/api/evaluate','method'=>'POST'],
        'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET'],
        'symbols'=>['href'=>$prefix.'/api/symbols','method'=>'GET']];
    try {
        $input = logic_request_object(true);
        $workspace = workspace_default(logic_state(logic_store()));
        $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
        $rule = is_string($input->rule ?? null) ? $input->rule : $workspace->evalRule;
        if ($rule === '') $rule = $rules[0]['name'] ?? '';
        $payload = is_string($input->payload ?? null) ? $input->payload : $workspace->evalPayload;
        $result = (new GrammarPayloadEvaluator($rules, $workspace, $payload))->evaluate($rule);
        api_json(200, [...$result, '_links'=>$links], true);
    } catch (InputError $error) {
        api_json(400, ['error'=>$error->getMessage(), '_links'=>$links], true);
    } catch (LogicStorageError|UnsupportedLogic $error) {
        api_json(503, ['error'=>$error->getMessage(), '_links'=>$links], true);
    }
}

function serve_schema_predicate(string $method): never {
    if ($method !== 'POST') {
        header('Allow: POST, OPTIONS');
        api_json(405, ['error'=>'Method not allowed.'], true);
    }
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    $links = ['self'=>['href'=>$prefix.'/api/schema/predicate-tree','method'=>'POST'],
        'root'=>['href'=>$prefix.'/api','method'=>'GET']];
    try {
        $input = logic_request_object(true);
        $schemaRaw = $input->schema ?? DEFAULT_JSON_SCHEMA_SAMPLE;
        $instanceRaw = property_exists($input, 'instance') ? $input->instance : DEFAULT_TEST_INSTANCE_SAMPLE;
        $res = evaluate_schema_predicate_studio($schemaRaw, $instanceRaw);
        api_json(200, [...$res, '_links'=>$links], true);
    } catch (InputError $error) {
        api_json(400, ['ok'=>false, 'error'=>$error->getMessage(), '_links'=>$links], true);
    }
}

function serve_grammar_node(string $route, string $method): never {
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    $parts = explode('/', $route);
    $kind = $parts[2]; $id = rawurldecode($parts[3]);
    $memberName = isset($parts[5]) ? rawurldecode($parts[5]) : null;
    $membersPath = isset($parts[4]);
    try {
        $db = logic_store();
        $state = logic_state($db);
        $node = find_php_node($kind, $id, $state, $prefix);
        if ($node === null) throw new InputError("Node '$kind/$id' not found.", 404);
        if (in_array($method, ['GET','HEAD'], true)) {
            if (!$membersPath) api_json(200, $node, true);
            if ($memberName === null) api_json(200, ['node'=>"$kind/$id",'label'=>$node['label'],
                'mutableCount'=>$node['mutableCount'],'immutableCount'=>$node['immutableCount'],'members'=>$node['members'],
                '_links'=>['self'=>['href'=>$node['href'].'/members','method'=>'GET'],
                    'node'=>['href'=>$node['href'],'method'=>'GET'],'nodes'=>['href'=>$prefix.'/api/nodes','method'=>'GET']]], true);
            if (!isset($node['members'][$memberName])) throw new InputError("Member '$memberName' not found on '$kind/$id'.", 404);
            $member = $node['members'][$memberName];
            header('Allow: '.implode(', ', $member['allowedMethods']));
            api_json(200, ['node'=>"$kind/$id", ...$member], true);
        }
        if ($memberName !== null && in_array($method, ['PUT','PATCH','DELETE'], true)) {
            $input = $method === 'DELETE' ? null : logic_request_object();
            $value = $input !== null && property_exists($input, 'value') ? $input->value : $input;
            $updated = logic_mutate($db, function (array $state) use ($kind, $id, $memberName, $method, $value, $prefix): array {
                $node = find_php_node($kind, $id, $state, $prefix);
                if ($node === null) throw new InputError("Node '$kind/$id' not found.", 404);
                $member = $node['members'][$memberName] ?? null;
                if ($member === null) throw new InputError("Member '$memberName' not found on '$kind/$id'.", 404);
                if (!$member['mutable']) {
                    $status = str_contains($member['readOnlyReason'] ?? '', 'x-mutation-policy') ? 423 : 405;
                    throw new InputError("Member '$memberName' on '$kind/$id' is non-mutable.", $status);
                }
                if ($kind === 'histolog') {
                    if ($method !== 'DELETE' && !is_string($value)) throw new InputError('Summary must be text.');
                    $entries = history_entries($state);
                    foreach ($entries as $i=>$entry) if ((string)$entry->generation === $id) {
                        $entry->summary = $method === 'DELETE' ? 'Generation G'.$id : $value;
                        $state['histolog'][$i] = json_encode($entry, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS);
                        break;
                    }
                } elseif ($kind === 'logic') {
                    $patch = new stdClass();
                    $patch->$memberName = $method === 'DELETE'
                        ? ($memberName === 'statement' ? '' : ($memberName === 'labels' ? [] : (object)[...DEFAULT_CAUCHY, 'enabled'=>false])) : $value;
                    update_logic_state($state, $patch);
                } elseif ($kind === 'callback') {
                    $index = null;
                    foreach ($state['callbacks'] as $i=>$callback) if ($callback['id'] === $id) { $index = $i; break; }
                    if ($index === null) throw new InputError("Callback '$id' not found.", 404);
                    $callback = $state['callbacks'][$index];
                    if ($method === 'DELETE' && $memberName === 'name') throw new InputError('A callback name cannot be cleared.');
                    if ($method !== 'DELETE' && !is_string($value)) throw new InputError('Callback value must be text.');
                    $nextName = $memberName === 'name' ? $value : $callback['name'];
                    $expression = $memberName === 'lambdaExpr' ? ($method === 'DELETE' ? 'λx. x' : $value) : $callback['lambdaExpr'];
                    $description = $memberName === 'description' ? ($method === 'DELETE' ? '' : $value) : ($callback['description'] ?? '');
                    foreach ($state['callbacks'] as $i=>$other) if ($i !== $index && $other['name'] === $nextName) throw new InputError('A callback with that name already exists.');
                    $updatedCb = callback_binding($nextName, $expression, $description, $id);
                    $updatedCb['source'] = $callback['source'];
                    $state['callbacks'][$index] = $updatedCb;
                } else {
                    $workspace = workspace_default($state);
                    if ($kind === 'symbol') {
                        if ($method !== 'DELETE' && !is_string($value)) throw new InputError('Symbol value must be text.');
                        $workspace->dialect->symbols->$id = $method === 'DELETE' ? '' : $value;
                    } elseif ($kind === 'dialect') {
                        if ($memberName === 'preset') {
                            if ($method !== 'DELETE' && !is_string($value)) throw new InputError('Dialect preset must be text.');
                            $workspace->dialect = dialect_preset($method === 'DELETE' ? 'ebnf' : $value);
                        } elseif ($memberName === 'symbols') {
                            if ($method !== 'DELETE' && !$value instanceof stdClass) throw new InputError('Symbols must be an object.');
                            $symbols = $method === 'DELETE' ? new stdClass() : $value;
                            foreach (get_object_vars($symbols) as $key=>$part) {
                                if (!array_key_exists($key, GRAMMAR_SYMBOL_LABELS) || !is_string($part)) throw new InputError('Symbols must contain known text values.');
                            }
                            $workspace->dialect->symbols = $symbols;
                        } else {
                            if ($method !== 'DELETE' && !is_string($value)) throw new InputError('Dialect value must be text.');
                            $defaults = ['ruleOperator'=>'','choiceDelimiter'=>'|','commentPrefix'=>'//'];
                            $workspace->dialect->$memberName = $method === 'DELETE' ? $defaults[$memberName] : $value;
                        }
                    } else {
                        $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
                        $config = $workspace->ruleConfigs->$id ?? (object)['precedence'=>1,'associativity'=>'left','properties'=>[]];
                        if ($memberName === 'expression') {
                            if ($method !== 'DELETE' && (!is_string($value) || trim($value) === '')) throw new InputError('Rule value expression cannot be empty.');
                            foreach ($rules as &$rule) if ($rule['name'] === $id) $rule['expression'] = $method === 'DELETE' ? "''" : grammar_normalize_expression(trim($value));
                            unset($rule);
                            $workspace->grammarText = grammar_serialize($workspace->grammarText, $rules, $workspace->dialect);
                        } elseif ($memberName === 'locked') {
                            if ($method !== 'DELETE' && !is_bool($value)) throw new InputError('Locked value must be boolean.');
                            $locked = array_values(array_filter($workspace->mutationPolicy->lockedRules, fn($name) => $name !== $id));
                            if ($method !== 'DELETE' && $value) $locked[] = $id;
                            $workspace->mutationPolicy->lockedRules = $locked;
                        } elseif ($memberName === 'precedence') {
                            if ($method !== 'DELETE' && (!is_int($value) && !is_float($value) || !is_finite((float)$value))) throw new InputError('Precedence must be a finite number.');
                            $config->precedence = $method === 'DELETE' ? 1 : max(1, $value);
                            $workspace->ruleConfigs->$id = $config;
                        } elseif ($memberName === 'associativity') {
                            if ($method !== 'DELETE' && !in_array($value, ['left','right','none'], true)) throw new InputError('Associativity must be left, right, or none.');
                            $config->associativity = $method === 'DELETE' ? 'left' : $value;
                            $workspace->ruleConfigs->$id = $config;
                        } elseif ($memberName === 'properties') {
                            if ($method !== 'DELETE' && !is_array($value)) throw new InputError('Properties must be an array.');
                            $config->properties = $method === 'DELETE' ? [] : $value;
                            $workspace->ruleConfigs->$id = $config;
                        } elseif ($memberName === 'mutation') {
                            if ($method === 'DELETE') unset($workspace->mutations->$id);
                            else {
                                if (!$value instanceof stdClass) throw new InputError('Mutation must be an object.');
                                $mutation = $workspace->mutations->$id ?? (object)['ruleName'=>$id,'targetProperty'=>$id,'jsonType'=>'string','patternOverride'=>'','description'=>"Rule $id",'enabled'=>true];
                                foreach (get_object_vars($value) as $key=>$part) $mutation->$key = $part;
                                $workspace->mutations->$id = $mutation;
                            }
                        }
                    }
                    save_active_workspace($state, $workspace);
                }
                $node = find_php_node($kind, $id, $state, $prefix);
                return [$state, ['ok'=>true,'node'=>"$kind/$id",'member'=>$node['members'][$memberName],'_links'=>$node['_links']]];
            }, function () use ($kind, $id, $memberName, $method): ?array {
                if ($kind === 'callback' || $kind === 'histolog') return null;
                $summary = match ($kind) {
                    'rule'=>($method === 'DELETE' ? 'Reset' : 'Updated')." rule.$id.$memberName",
                    'dialect'=>"Updated dialect.$memberName",
                    'symbol'=>($method === 'DELETE' ? 'Disabled' : 'Updated')." symbol.$id",
                    'logic'=>"Updated logic.$memberName",
                };
                return ['rest_node_member', $summary];
            });
            api_json(200, $updated, true);
        }
        header('Allow: GET, HEAD, OPTIONS');
        api_json(405, ['error'=>'Method not allowed.'], true);
    } catch (InputError $error) {
        $status = in_array($error->getCode(), [404,405,423], true) ? $error->getCode() : 400;
        if (in_array($status, [405,423], true)) header('Allow: GET, HEAD, OPTIONS');
        api_json($status, ['error'=>$error->getMessage()], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage()], true);
    } catch (UnsupportedLogic $error) {
        api_json(503, ['error'=>'PHP logic evaluator cannot handle this input: '.$error->getMessage()], true);
    }
}

function serve_symbols(string $route, string $method): never {
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    $collection = ['href'=>$prefix.'/api/symbols','method'=>'GET'];
    $key = $route === 'api/symbols' ? null : rawurldecode(substr($route, strlen('api/symbols/')));
    try {
        $db = logic_store();
        if (in_array($method, ['GET','HEAD'], true)) {
            $symbols = grammar_symbols(workspace_default(logic_state($db)));
            if ($key === null) {
                $items = [];
                foreach ($symbols as $symbol) {
                    $id = rawurlencode($symbol['key']); $self = $collection['href'].'/'.$id;
                    $items[] = [...$symbol, '_links'=>['self'=>['href'=>$self,'method'=>'GET'],
                        'node'=>['href'=>$prefix.'/api/nodes/symbol/'.$id,'method'=>'GET'],
                        'update'=>['href'=>$self,'method'=>'PUT'], 'disable'=>['href'=>$self,'method'=>'DELETE']]];
                }
                api_json(200, ['count'=>count($items),'enabledCount'=>count(array_filter($symbols, fn($s) => $s['enabled'])),
                    '_embedded'=>['symbols'=>$items], '_links'=>['self'=>$collection,'root'=>['href'=>$prefix.'/api','method'=>'GET']]], true);
            }
            foreach ($symbols as $symbol) if ($symbol['key'] === $key) {
                api_json(200, [...$symbol, '_links'=>['self'=>['href'=>$collection['href'].'/'.rawurlencode($key),'method'=>'GET'],
                    'node'=>['href'=>$prefix.'/api/nodes/symbol/'.rawurlencode($key),'method'=>'GET'],'collection'=>$collection]], true);
            }
            throw new InputError("Symbol '$key' not found.", 404);
        }
        if ($key !== null && in_array($method, ['PUT','DELETE'], true)) {
            if (!array_key_exists($key, GRAMMAR_SYMBOL_LABELS)) throw new InputError("Symbol '$key' not found.", 404);
            $input = $method === 'DELETE' ? new stdClass() : logic_request_object();
            $value = $method === 'DELETE' ? '' : ($input->value ?? '');
            if (!is_string($value)) throw new InputError('Symbol value must be text.');
            $updated = logic_mutate($db, function (array $state) use ($key, $value, $prefix): array {
                $workspace = workspace_default($state);
                $workspace->dialect->symbols->$key = $value;
                save_active_workspace($state, $workspace);
                foreach (grammar_symbols($workspace) as $symbol) if ($symbol['key'] === $key) {
                    $node = symbol_node($symbol, $prefix);
                    return [$state, ['ok'=>true,'node'=>'symbol/'.$key,'member'=>$node['members']['value'],'_links'=>$node['_links']]];
                }
                throw new LogicStorageError('Updated symbol cannot be resolved.');
            }, fn() => ['rest_node_member', ($method === 'DELETE' ? 'Disabled' : 'Updated')." symbol.$key"]);
            api_json(200, $updated, true);
        }
        header('Allow: '.($key === null ? 'GET, HEAD, OPTIONS' : 'GET, HEAD, PUT, DELETE, OPTIONS'));
        api_json(405, ['error'=>'Method not allowed.'], true);
    } catch (InputError $error) {
        api_json($error->getCode() === 404 ? 404 : 400, ['error'=>$error->getMessage(),'_links'=>['collection'=>$collection]], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage(),'_links'=>['collection'=>$collection]], true);
    }
}

function serve_rules(string $route, string $method): never {
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    $collection = ['href'=>$prefix.'/api/rules','method'=>'GET'];
    $name = $route === 'api/rules' ? null : rawurldecode(substr($route, strlen('api/rules/')));
    try {
        $db = logic_store();
        if (in_array($method, ['GET','HEAD'], true)) {
            $workspace = workspace_default(logic_state($db));
            $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
            if ($name === null) {
                $items = [];
                foreach ($rules as $rule) {
                    $id = rawurlencode($rule['name']); $self = $collection['href'].'/'.$id; $node = $prefix.'/api/nodes/rule/'.$id;
                    $items[] = [...$rule, 'usedOperators'=>grammar_operators($rule['expression'], $workspace->dialect),
                        'config'=>$workspace->ruleConfigs->{$rule['name']} ?? null, 'mutation'=>$workspace->mutations->{$rule['name']} ?? null,
                        '_links'=>['self'=>['href'=>$self,'method'=>'GET'], 'node'=>['href'=>$node,'method'=>'GET'],
                            'members'=>['href'=>$node.'/members','method'=>'GET'], 'update'=>['href'=>$self,'method'=>'PUT'], 'delete'=>['href'=>$self,'method'=>'DELETE']]];
                }
                api_json(200, ['count'=>count($rules),'dialect'=>$workspace->dialect,'_embedded'=>['rules'=>$items],
                    '_links'=>['self'=>$collection,'root'=>['href'=>$prefix.'/api','method'=>'GET'],
                        'symbols'=>['href'=>$prefix.'/api/symbols','method'=>'GET'], 'evaluate'=>['href'=>$prefix.'/api/evaluate','method'=>'POST']],
                    '_actions'=>['create'=>['name'=>'create','title'=>'Create Grammar Rule','href'=>$collection['href'],'method'=>'POST',
                        'contentType'=>'application/json','fields'=>[['name'=>'name','type'=>'string','required'=>true,'example'=>'promo_code'],
                            ['name'=>'expression','type'=>'string','required'=>true,'example'=>"'PROMO-' digit+"]]]]], true);
            }
            foreach ($rules as $rule) if ($rule['name'] === $name) {
                $self = $collection['href'].'/'.rawurlencode($name); $node = $prefix.'/api/nodes/rule/'.rawurlencode($name);
                api_json(200, [...$rule, 'config'=>$workspace->ruleConfigs->$name ?? null, 'mutation'=>$workspace->mutations->$name ?? null,
                    'members'=>grammar_rule_members($rule, $rules, $workspace, $prefix),
                    '_links'=>['self'=>['href'=>$self,'method'=>'GET'],'collection'=>$collection,'node'=>['href'=>$node,'method'=>'GET'],'members'=>['href'=>$node.'/members','method'=>'GET']],
                    '_actions'=>['update'=>['name'=>'update','title'=>"Update <$name>",'href'=>$self,'method'=>'PUT','contentType'=>'application/json',
                        'fields'=>[['name'=>'expression','type'=>'string','required'=>true,'example'=>$rule['expression']]]],
                        'delete'=>['name'=>'delete','title'=>"Delete <$name>",'href'=>$self,'method'=>'DELETE']]], true);
            }
            throw new InputError("Rule '$name' not found.", 404);
        }
        if (($name === null && $method === 'POST') || ($name !== null && in_array($method, ['PUT','PATCH','DELETE'], true))) {
            $input = $method === 'DELETE' ? new stdClass() : logic_request_object();
            $result = logic_mutate($db, function (array $state) use ($name, $method, $input): array {
                $workspace = workspace_default($state); $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
                $index = null;
                foreach ($rules as $i=>$rule) if ($rule['name'] === $name) { $index = $i; break; }
                if ($name !== null && $index === null) throw new InputError("Rule \"$name\" not found.", $method === 'DELETE' ? 404 : 400);
                if ($name === null) {
                    if (!is_string($input->name ?? null) || !is_string($input->expression ?? null) || trim($input->name) === '' || trim($input->expression) === '') throw new InputError('Both "name" and "expression" are required to create a grammar rule.');
                    $nextName = trim($input->name);
                    if (!preg_match('/^[A-Za-z_][A-Za-z0-9_-]*$/D', $nextName)) throw new InputError('Provide a valid identifier for the new rule name.');
                    foreach ($rules as $rule) if ($rule['name'] === $nextName) throw new InputError("Rule \"$nextName\" already exists.");
                    $rules[] = ['name'=>$nextName,'expression'=>grammar_normalize_expression(trim($input->expression))];
                } elseif ($method === 'DELETE') {
                    array_splice($rules, $index, 1);
                    unset($workspace->mutations->$name, $workspace->ruleConfigs->$name);
                    $nextName = $name;
                } else {
                    $nextName = is_string($input->name ?? null) ? trim($input->name) : $name;
                    if (!preg_match('/^[A-Za-z_][A-Za-z0-9_-]*$/D', $nextName)) throw new InputError('Rule name must start with a letter or underscore and contain only letters, digits, _ or -.');
                    foreach ($rules as $i=>$rule) if ($i !== $index && $rule['name'] === $nextName) throw new InputError("A rule named \"$nextName\" already exists.");
                    if (is_string($input->expression ?? null)) {
                        $expression = trim($input->expression);
                        if ($expression === '') throw new InputError('Rule value expression cannot be empty.');
                        $rules[$index]['expression'] = grammar_normalize_expression($expression);
                    }
                    if ($nextName !== $name) foreach ($rules as &$rule) $rule['expression'] = grammar_rename_references($rule['expression'], $name, $nextName);
                    unset($rule);
                    $rules[$index]['name'] = $nextName;
                }
                $workspace->grammarText = grammar_serialize($workspace->grammarText, $rules, $workspace->dialect);
                $workspace->updatedAt = gmdate('Y-m-d\TH:i:s').'.000Z';
                save_active_workspace($state, $workspace);
                return [$state, ['name'=>$nextName,'grammarText'=>$workspace->grammarText]];
            }, fn($saved) => match ($method) {
                'POST'=>['rest_create_rule', 'Created rule <'.$saved['name'].'>'],
                'DELETE'=>['rest_delete_rule', 'Deleted rule <'.$saved['name'].'>'],
                default=>['rest_update_rule', 'Updated rule <'.$saved['name'].'>'],
            });
            if ($method === 'DELETE') api_json(200, ['ok'=>true,'deleted'=>$result['name'],'grammarText'=>$result['grammarText'],
                '_links'=>['collection'=>$collection,'root'=>['href'=>$prefix.'/api','method'=>'GET']]], true);
            $self = $collection['href'].'/'.rawurlencode($result['name']);
            if ($method === 'POST') header('Location: '.$self);
            api_json($method === 'POST' ? 201 : 200, ['ok'=>true,'name'=>$result['name'],
                ...($method === 'POST' ? ['expression'=>trim($input->expression)] : []), 'grammarText'=>$result['grammarText'],
                '_links'=>['self'=>['href'=>$self,'method'=>'GET'],'node'=>['href'=>$prefix.'/api/nodes/rule/'.rawurlencode($result['name']),'method'=>'GET'],'collection'=>$collection]], true);
        }
        header('Allow: '.($name === null ? 'GET, HEAD, POST, OPTIONS' : 'GET, HEAD, PUT, PATCH, DELETE, OPTIONS'));
        api_json(405, ['error'=>'Method not allowed.'], true);
    } catch (InputError $error) {
        api_json($error->getCode() === 404 ? 404 : 400, ['error'=>$error->getMessage(),'_links'=>['collection'=>$collection]], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage(),'_links'=>['collection'=>$collection]], true);
    }
}
