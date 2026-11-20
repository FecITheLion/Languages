<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

function callback_node(array $callback, string $prefix): array {
    $id = $callback['id']; $href = $prefix.'/api/nodes/callback/'.rawurlencode($id);
    $signature = $callback['name'].'('.implode(', ', $callback['params']).')';
    $members = describe_node_members([
        'name'=>[$callback['name'],true,''], 'lambdaExpr'=>[$callback['lambdaExpr'],true,''],
        'description'=>[$callback['description'] ?? null,true,''], 'id'=>[$id,false,'Immutable callback identifier'],
        'params'=>[$callback['params'],false,'Parsed from lambdaExpr'], 'signature'=>[$signature,false,'Derived from name and params'],
        'savedAt'=>[$callback['savedAt'],false,'System-managed timestamp'],
    ], 'callback', $id, $prefix);
    $resource = $prefix.'/api/callbacks/'.rawurlencode($id);
    return ['kind'=>'callback','id'=>$id,'label'=>'λ '.$signature,'href'=>$href,'mutableCount'=>3,'immutableCount'=>4,'members'=>$members,
        '_links'=>['self'=>['href'=>$href,'method'=>'GET'],'members'=>['href'=>$href.'/members','method'=>'GET'],
            'callbackResource'=>['href'=>$resource,'method'=>'GET'],'pretty'=>['href'=>$prefix.'/nodes/callback/'.rawurlencode($id),'method'=>'GET','title'=>'Pretty node URL']],
        '_actions'=>['updateLambdaExpr'=>['name'=>'updateLambdaExpr','title'=>'Update '.$callback['name'].' lambdaExpr',
            'href'=>$href.'/members/lambdaExpr','method'=>'PATCH','contentType'=>'application/json',
            'fields'=>[['name'=>'value','type'=>'string','required'=>true,'example'=>$callback['lambdaExpr']]]],
            'deleteCallback'=>['name'=>'deleteCallback','title'=>'Delete '.$callback['name'],'href'=>$resource,'method'=>'DELETE']]];
}

function logic_node(array $state, string $prefix): array {
    $href = $prefix.'/api/nodes/logic/active';
    $evaluation = evaluate_statement($state['statement'], $state['labels']);
    $sequence = evaluate_cauchy((object)$state['cauchyConfig'], $state['labels']);
    $members = describe_node_members([
        'statement'=>[$state['statement'],true,''], 'labels'=>[$state['labels'],true,''],
        'cauchyConfig'=>[(object)$state['cauchyConfig'],true,''],
        'evaluatedValue'=>[$evaluation['displayValue'],false,'Computed evaluation result'],
        'valueType'=>[$evaluation['valueType'],false,'Computed evaluation type'],
        'cauchyConverged'=>[$sequence['converged'],false,'Computed Cauchy convergence verdict'],
        'cauchyLimit'=>[$sequence['limitEstimate'],false,'Computed Cauchy limit estimate'],
        'cauchyIndexN'=>[$sequence['cauchyIndexN'],false,'Computed Cauchy index N(ε)'],
    ], 'logic', 'active', $prefix);
    return ['kind'=>'logic','id'=>'active','label'=>'Logic, Lambda & Cauchy Engine','href'=>$href,'mutableCount'=>3,'immutableCount'=>5,'members'=>$members,
        '_links'=>['self'=>['href'=>$href,'method'=>'GET'],'members'=>['href'=>$href.'/members','method'=>'GET'],
            'logicResource'=>['href'=>$prefix.'/api/logic','method'=>'GET'],'evaluateCauchy'=>['href'=>$prefix.'/api/logic/cauchy','method'=>'POST'],
            'pretty'=>['href'=>$prefix.'/nodes/logic/active','method'=>'GET','title'=>'Pretty node URL']],
        '_actions'=>['updateStatement'=>['name'=>'updateStatement','title'=>'Update LOGIC_STATEMENT','href'=>$href.'/members/statement',
            'method'=>'PATCH','contentType'=>'application/json','fields'=>[['name'=>'value','type'=>'string','required'=>true,'example'=>$state['statement']]]]]];
}

function serve_callbacks(string $route, string $method): never {
    $links = logic_links('/'.$route);
    $id = null;
    if (preg_match('~^api/callbacks/([^/]+)$~', $route, $match)) $id = rawurldecode($match[1]);
    try {
        $db = logic_store();
        if (in_array($method, ['GET','HEAD'], true)) {
            $callbacks = logic_state($db)['callbacks'];
            if ($id === null) {
                api_json(200, ['count'=>count($callbacks), '_embedded'=>['callbacks'=>$callbacks], '_links'=>$links], true);
            }
            foreach ($callbacks as $callback) if ($callback['id'] === $id || $callback['name'] === $id) {
                api_json(200, [...$callback, '_links'=>$links], true);
            }
            api_json(404, ['error'=>"Callback '$id' not found.", '_links'=>$links], true);
        }
        if (($id === null && $method === 'POST') || ($id !== null && $method === 'PUT')) {
            $input = logic_request_object();
            $saved = logic_mutate($db, function (array $state) use ($id, $input): array {
                $existing = null;
                foreach ($state['callbacks'] as $callback) if ($callback['id'] === $id || $callback['name'] === $id) { $existing = $callback; break; }
                $name = $input->name ?? $existing['name'] ?? $id;
                $expression = $input->lambdaExpr ?? $existing['lambdaExpr'] ?? ($id === null ? null : 'λx. x');
                $description = $input->description ?? $existing['description'] ?? '';
                if (!is_string($name) || !is_string($expression) || !is_string($description) || trim($name) === '' || trim($expression) === '') {
                    throw new InputError('Both "name" and "lambdaExpr" must be text.');
                }
                $name = trim($name);
                $index = null;
                foreach ($state['callbacks'] as $i=>$callback) if ($callback['name'] === $name) { $index = $i; break; }
                if ($index === null && count($state['callbacks']) >= 64) throw new InputError('At most 64 callbacks are supported.');
                $saved = callback_binding($name, $expression, $description, $index === null ? null : $state['callbacks'][$index]['id']);
                if ($index === null) $state['callbacks'][] = $saved; else $state['callbacks'][$index] = $saved;
                return [$state, $saved];
            });
            $self = logic_links('/api/callbacks/'.rawurlencode($saved['id']));
            if ($method === 'POST') header('Location: '.$self['self']['href']);
            api_json($method === 'POST' ? 201 : 200, ['ok'=>true, 'callback'=>$saved, '_links'=>$self], true);
        }
        if ($id !== null && $method === 'DELETE') {
            $result = logic_mutate($db, function (array $state) use ($id): array {
                $before = count($state['callbacks']);
                $state['callbacks'] = array_values(array_filter($state['callbacks'], fn($callback) => $callback['id'] !== $id && $callback['name'] !== $id));
                if ($before === count($state['callbacks'])) throw new InputError("Callback '$id' not found.", 404);
                return [$state, ['ok'=>true, 'deleted'=>$id]];
            });
            api_json(200, [...$result, '_links'=>$links], true);
        }
        header('Allow: '.($id === null ? 'GET, HEAD, POST, OPTIONS' : 'GET, HEAD, PUT, DELETE, OPTIONS'));
        api_json(405, ['error'=>'Method not allowed.', '_links'=>$links], true);
    } catch (InputError $error) {
        api_json($error->getCode() === 404 ? 404 : 400, ['error'=>$error->getMessage(), '_links'=>$links], true);
    } catch (UnsupportedLogic $error) {
        api_json(400, ['error'=>'Invalid or unsupported callback expression: '.$error->getMessage(), '_links'=>$links], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage(), '_links'=>$links], true);
    }
}

function update_logic_state(array &$state, stdClass $input): void {
    if (isset($input->statement)) {
        if (!is_string($input->statement)) throw new InputError('Statement must be text.');
        if (trim($input->statement) !== '') parse_logic($input->statement);
        $state['statement'] = $input->statement;
    }
    if (isset($input->labels)) {
        if (!is_array($input->labels)) throw new InputError('Labels must be an array of complete bindings.');
        foreach ($input->labels as $label) {
            if (!$label instanceof stdClass || !isset($label->id, $label->name, $label->kind, $label->value)
                || !is_string($label->id) || !is_string($label->name) || !is_string($label->kind) || !is_string($label->value)) {
                throw new InputError('Labels must be an array of complete bindings.');
            }
        }
        $state['labels'] = $input->labels === [] ? [] : normalize_labels($input->labels, []);
    }
    if (isset($input->cauchyConfig)) {
        if (!$input->cauchyConfig instanceof stdClass) throw new InputError('Cauchy config must be an object.');
        $config = array_merge($state['cauchyConfig'], get_object_vars($input->cauchyConfig));
        evaluate_cauchy((object)$config, $state['labels']);
        $state['cauchyConfig'] = $config;
    }
}

function serve_logic_state(string $route, string $method): never {
    $links = logic_links('/'.$route);
    try {
        $db = logic_store();
        if ($route === 'api/logic' && in_array($method, ['GET','HEAD'], true)) {
            $state = logic_state($db);
            $evaluation = evaluate_statement($state['statement'], $state['labels']);
            $sequence = evaluate_cauchy((object)$state['cauchyConfig'], $state['labels']);
            $fields = ['ok','converged','cauchyIndexN','limitEstimate','resolvedParamNames'];
            api_json(200, ['statement'=>$state['statement'], 'labels'=>$state['labels'],
                'evaluation'=>array_intersect_key($evaluation, array_flip(['ok','displayValue','valueType','error'])),
                'cauchyConfig'=>$state['cauchyConfig'],
                'cauchyEvaluation'=>array_intersect_key($sequence, array_flip($fields)), '_links'=>$links], true);
        }
        if ($route === 'api/logic' && in_array($method, ['PUT','PATCH'], true)) {
            $input = logic_request_object();
            $result = logic_mutate($db, function (array $state) use ($input): array {
                update_logic_state($state, $input);
                $evaluation = evaluate_statement($state['statement'], $state['labels']);
                return [$state, ['ok'=>true, 'statement'=>$state['statement'], 'labels'=>$state['labels'], 'displayValue'=>$evaluation['displayValue']]];
            }, fn() => ['rest_logic_update', 'Updated logic / Cauchy configuration']);
            api_json(200, [...$result, '_links'=>$links], true);
        }
        if ($route === 'api/logic/labels' && in_array($method, ['GET','HEAD'], true)) {
            $labels = logic_state($db)['labels'];
            api_json(200, ['count'=>count($labels), 'labels'=>$labels, '_links'=>$links], true);
        }
        if ($route === 'api/logic/labels' && $method === 'POST') {
            $input = logic_request_object();
            if (!is_string($input->name ?? null) || trim($input->name) === '') throw new InputError('"name" is required.');
            $name = trim($input->name);
            $kind = $input->kind ?? 'number';
            $value = $input->value ?? '0';
            $binding = normalize_binding($name, (object)['kind'=>$kind, 'value'=>$value], null);
            $binding['id'] = 'lbl_'.bin2hex(random_bytes(12));
            $label = logic_mutate($db, function (array $state) use ($binding): array {
                $state['labels'] = array_values(array_filter($state['labels'], fn($item) => $item['name'] !== $binding['name']));
                if (count($state['labels']) >= 64) throw new InputError('At most 64 labels are supported.');
                $state['labels'][] = $binding;
                return [$state, $binding];
            });
            api_json(201, ['ok'=>true, 'label'=>$label, '_links'=>$links], true);
        }
        if (preg_match('~^api/logic/labels/([^/]+)$~', $route, $match) && in_array($method, ['GET','HEAD','DELETE'], true)) {
            $id = rawurldecode($match[1]);
            if ($method !== 'DELETE') {
                foreach (logic_state($db)['labels'] as $label) if ($label['id'] === $id || $label['name'] === $id)
                    api_json(200, ['label'=>$label, '_links'=>$links], true);
                api_json(404, ['error'=>"Label '$id' not found.", '_links'=>$links], true);
            }
            $result = logic_mutate($db, function (array $state) use ($id): array {
                $before = count($state['labels']);
                $state['labels'] = array_values(array_filter($state['labels'], fn($item) => $item['id'] !== $id && $item['name'] !== $id));
                if (count($state['labels']) === $before) throw new InputError("Label '$id' not found.", 404);
                return [$state, ['ok'=>true, 'deleted'=>$id]];
            });
            api_json(200, [...$result, '_links'=>$links], true);
        }
        header('Allow: '.($route === 'api/logic' ? 'GET, HEAD, PUT, PATCH, OPTIONS' : ($route === 'api/logic/labels' ? 'GET, HEAD, POST, OPTIONS' : 'GET, HEAD, DELETE, OPTIONS')));
        api_json(405, ['error'=>'Method not allowed.', '_links'=>$links], true);
    } catch (InputError $error) {
        api_json($error->getCode() === 404 ? 404 : 400, ['error'=>$error->getMessage(), '_links'=>$links], true);
    } catch (UnsupportedLogic $error) {
        api_json(503, ['error'=>'PHP logic evaluator cannot handle this input: '.$error->getMessage(), '_links'=>$links], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage(), '_links'=>$links], true);
    }
}

function serve_multiline_logic(string $method): never {
    if ($method !== 'POST') {
        header('Allow: POST, OPTIONS');
        api_json(405, ['error'=>'Method not allowed.'], true);
    }
    $links = logic_links('/api/logic/multiline');
    try {
        $input = logic_request_object(true);
        $preInput = is_string($input->preInput ?? null) ? $input->preInput : 'e=true';
        $program = is_string($input->program ?? null) ? $input->program : "a(b,c)=b & c\nd=false\na(e,d)";
        $result = evaluate_multiline_logic_program($preInput, $program);
        api_json(200, [...$result, '_links'=>$links], true);
    } catch (InputError $error) {
        api_json(400, ['ok'=>false, 'error'=>$error->getMessage(), '_links'=>$links], true);
    }
}

function serve_logic_evaluate_or_cauchy(string $route, string $method): never {
    if ($method !== 'POST') api_json(404, ['error'=>'Endpoint not found.']);
    $links = api_links('/'.$route);
    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
    if (!in_array($contentType, ['application/json','text/plain'], true)) api_json(415, ['ok'=>false,'error'=>'Use application/json or text/plain.','_links'=>$links], true);
    if (isset($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH'] > 5242880) api_json(413, ['ok'=>false,'error'=>'Request body exceeds 5 MiB.','_links'=>$links], true);
    $body = file_get_contents('php://input', false, null, 0, 5242881);
    if ($body === false || strlen($body) > 5242880) api_json(413, ['ok'=>false,'error'=>'Request body exceeds 5 MiB.','_links'=>$links], true);
    if (!preg_match('//u', $body)) api_json(400, ['ok'=>false,'error'=>'Request body must be valid UTF-8.','_links'=>$links], true);
    try {
        if ($contentType === 'application/json') {
            if (trim($body) === '') $raw = null;
            else { $raw = json_decode($body, false, 32, JSON_THROW_ON_ERROR); }
        } else $raw = $body;
        $state = logic_state(logic_store());
        if ($route === 'api/logic/cauchy') api_json(200, [...evaluate_cauchy($raw, $state['labels'], $state['cauchyConfig']), '_links'=>$links], true);
        [$statement, $labels] = normalized_input($raw, 0, $state);
        $result = evaluate_statement($statement, $labels);
        $cauchySafety = assess_cauchy_safety($raw, $statement, $labels, $state['cauchyConfig']);
        $extra = [];
        if ($cauchySafety['canEnable']) {
            $seq = evaluate_cauchy((object)$state['cauchyConfig'], $labels);
            $extra['cauchyAutoEnabled'] = true;
            $extra['cauchyEvaluation'] = array_intersect_key($seq, array_flip(['ok','converged','cauchyIndexN','limitEstimate','resolvedParamNames']));
        } elseif (!empty($state['cauchyConfig']['enabled'])) {
            $extra['cauchyAutoEnabled'] = false;
            $extra['cauchySkippedReason'] = $cauchySafety['reason'];
        }
        api_json(200, ['statement'=>$statement, ...$result, ...$extra, '_links'=>$links], true);
    } catch (JsonException $error) {
        api_json(400, ['ok'=>false,'error'=>'Malformed JSON request body.','_links'=>$links], true);
    } catch (InputError $error) {
        $message = $error->getMessage();
        $code = preg_match('/^(Ambiguous|Do not mix)/', $message) ? 'ambiguous_input' : 'invalid_input';
        api_json(400, ['ok'=>false,'error'=>$message,'diagnostics'=>[['code'=>$code,'message'=>$message]],'_links'=>$links], true);
    } catch (UnsupportedLogic $error) {
        api_json(503, ['ok'=>false,'error'=>'PHP logic evaluator cannot handle this input: '.$error->getMessage(),'_links'=>$links], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['ok'=>false,'error'=>$error->getMessage(),'_links'=>$links], true);
    }
}
