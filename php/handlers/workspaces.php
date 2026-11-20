<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

function history_node(stdClass $entry, string $prefix): array {
    $id = (string)$entry->generation; $href = $prefix.'/api/nodes/histolog/'.$id;
    $restore = $prefix.'/api/histolog/'.$id.'/restore';
    $members = describe_node_members([
        'summary'=>[$entry->summary,true,''], 'generation'=>[$entry->generation,false,'Immutable generation index'],
        'fingerprint'=>[$entry->fingerprint,false,'Immutable FNV-1a snapshot hash'],
        'timestamp'=>[$entry->timestamp,false,'Immutable creation timestamp'],
        'changedFields'=>[$entry->changedFields,false,'Computed diff fields'],
        'touchedSymbols'=>[$entry->touchedSymbols,false,'Computed symbol index'],
    ], 'histolog', $id, $prefix);
    return ['kind'=>'histolog','id'=>$id,'label'=>"Gen G$id: $entry->summary",'href'=>$href,'mutableCount'=>1,'immutableCount'=>5,'members'=>$members,
        '_links'=>['self'=>['href'=>$href,'method'=>'GET'],'members'=>['href'=>$href.'/members','method'=>'GET'],
            'restore'=>['href'=>$restore,'method'=>'POST'],'pretty'=>['href'=>$prefix.'/nodes/histolog/'.$id,'method'=>'GET','title'=>'Pretty node URL']],
        '_actions'=>['restoreGeneration'=>['name'=>'restoreGeneration','title'=>"Restore Engine or Section to G$id",
            'href'=>$restore,'method'=>'POST','contentType'=>'application/json',
            'fields'=>[['name'=>'section','type'=>'string','required'=>false,'example'=>'all']]]]];
}

function find_php_node(string $kind, string $id, array $state, string $prefix): ?array {
    if ($kind === 'logic' && $id === 'active') return logic_node($state, $prefix);
    if ($kind === 'callback') foreach ($state['callbacks'] as $callback) if ($callback['id'] === $id) return callback_node($callback, $prefix);
    if ($kind === 'histolog') foreach (array_slice(history_available($state), -8) as $entry) {
        if ((string)$entry->generation === $id) return history_node($entry, $prefix);
    }
    return find_grammar_node($kind, $id, workspace_default($state), $prefix);
}

function workspace_entries(array $state): array {
    $entries = $state['workspaces'] ?? [];
    if (!is_array($entries)) throw new LogicStorageError('Stored workspace collection is invalid.');
    $result = [];
    foreach ($entries as $entry) {
        try { $workspace = is_string($entry) ? json_decode($entry, false, 64, JSON_THROW_ON_ERROR) : null; }
        catch (JsonException $error) { throw new LogicStorageError('Stored workspace is invalid.'); }
        if (!$workspace instanceof stdClass || !is_string($workspace->id ?? null)
            || !is_string($workspace->name ?? null) || !is_string($workspace->updatedAt ?? null)
            || !($workspace->dialect ?? null) instanceof stdClass || !is_string($workspace->dialect->preset ?? null)) {
            throw new LogicStorageError('Stored workspace is invalid.');
        }
        $result[] = $workspace;
    }
    return $result;
}

function serve_history(string $route, string $method): never {
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    $collection = ['href'=>$prefix.'/api/histolog','method'=>'GET'];
    try {
        $db = logic_store();
        if ($method === 'POST' && ($route === 'api/engine/clear' || $route === 'api/histolog'
            || preg_match('~^api/histolog/\d+/restore$~', $route))) {
            $input = logic_request_object(true);
            if ($route === 'api/histolog') {
                if (isset($input->summary) && !is_string($input->summary)) throw new InputError('Summary must be text.');
                $summary = ($input->summary ?? '') !== '' ? $input->summary : 'Manual API checkpoint';
                $result = logic_mutate($db, function (array $state) use ($summary): array {
                    $entry = history_record($state, 'api_checkpoint', $summary);
                    return [$state, ['ok'=>true,'generation'=>$entry->generation,'fingerprint'=>$entry->fingerprint,'summary'=>$entry->summary]];
                });
                api_json(201, [...$result, '_links'=>['self'=>['href'=>$collection['href'].'/'.$result['generation'],'method'=>'GET']]], true);
            }
            $section = $input->section ?? 'all';
            if (!is_string($section) || !in_array($section, ['all','grammar','mutations','jsonld','logic','evaluator','dsl','python','rust','wat','callbacks'], true)) {
                throw new InputError('Unknown engine section.');
            }
            if ($route === 'api/engine/clear') {
                $result = logic_mutate($db, function (array $state) use ($section): array {
                    $entry = history_clear($state, $section);
                    return [$state, ['ok'=>true,'cleared'=>$section,'generation'=>$entry->generation]];
                });
                api_json(200, [...$result, '_links'=>['root'=>['href'=>$prefix.'/api','method'=>'GET'],'histolog'=>$collection]], true);
            }
            preg_match('~^api/histolog/(\d+)/restore$~', $route, $match); $generation = (int)$match[1];
            $result = logic_mutate($db, function (array $state) use ($generation, $section): array {
                $entry = history_restore($state, $generation, $section);
                return [$state, ['ok'=>true,'restoredFrom'=>$generation,'section'=>$section,'newGeneration'=>$entry->generation]];
            });
            api_json(200, [...$result, '_links'=>['histolog'=>$collection,'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET']]], true);
        }
        if (in_array($method, ['GET','HEAD'], true) && $route !== 'api/engine/clear') {
            $entries = history_available(logic_state($db));
            if ($route === 'api/histolog') {
                $items = [];
                foreach ($entries as $entry) {
                    $href = $collection['href'].'/'.$entry->generation;
                    $items[] = ['generation'=>$entry->generation,'parentGeneration'=>$entry->parentGeneration,
                        'timestamp'=>$entry->timestamp,'source'=>$entry->source,'summary'=>$entry->summary,
                        'fingerprint'=>$entry->fingerprint,'changedFields'=>$entry->changedFields,'touchedSymbols'=>$entry->touchedSymbols,
                        'additions'=>$entry->additions,'deletions'=>$entry->deletions,
                        '_links'=>['self'=>['href'=>$href,'method'=>'GET'],'restore'=>['href'=>$href.'/restore','method'=>'POST'],
                            'node'=>['href'=>$prefix.'/api/nodes/histolog/'.$entry->generation,'method'=>'GET']]];
                }
                $last = $entries[count($entries)-1]->generation;
                api_json(200, ['index'=>history_index($entries),'_embedded'=>['generations'=>$items],
                    '_links'=>['self'=>$collection,'diff'=>['href'=>$collection['href'].'/diff?from=0&to='.$last,'method'=>'GET'],
                        'root'=>['href'=>$prefix.'/api','method'=>'GET']]], true);
            }
            if ($route === 'api/histolog/diff') {
                $from = filter_var($_GET['from'] ?? '0', FILTER_VALIDATE_INT);
                $to = filter_var($_GET['to'] ?? (string)$entries[count($entries)-1]->generation, FILTER_VALIDATE_INT);
                if ($from === false || $to === false) throw new InputError('History generations must be integers.');
                $first = history_find($entries, $from) ?? $entries[0];
                $last = history_find($entries, $to) ?? $entries[count($entries)-1];
                api_json(200, ['fromGen'=>$first->generation,'toGen'=>$last->generation,
                    'diffs'=>history_diff($first->snapshot, $last->snapshot),
                    '_links'=>['self'=>['href'=>$collection['href'].'/diff?from='.$first->generation.'&to='.$last->generation,'method'=>'GET'],
                        'collection'=>$collection]], true);
            }
            if (preg_match('~^api/histolog/(\d+)$~', $route, $match)) {
                $generation = (int)$match[1]; $entry = history_find($entries, $generation);
                if ($entry === null) throw new InputError("Generation G$generation not found.", 404);
                $href = $collection['href'].'/'.$generation;
                api_json(200, [...get_object_vars($entry),'_links'=>['self'=>['href'=>$href,'method'=>'GET'],
                    'restore'=>['href'=>$href.'/restore','method'=>'POST'],'collection'=>$collection]], true);
            }
        }
        header('Allow: '.($route === 'api/histolog' ? 'GET, HEAD, POST, OPTIONS' : 'POST, OPTIONS'));
        api_json(405, ['error'=>'Method not allowed.'], true);
    } catch (InputError $error) {
        api_json($error->getCode() === 404 ? 404 : 400, ['error'=>$error->getMessage()], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage()], true);
    }
}

function serve_workspaces(string $route, string $method): never {
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    $collection = ['href'=>$prefix.'/api/workspaces', 'method'=>'GET'];
    $id = $route === 'api/workspaces' ? null : rawurldecode(substr($route, strlen('api/workspaces/')));
    try {
        $db = logic_store();
        if (in_array($method, ['GET','HEAD'], true)) {
            $state = logic_state($db);
            $entries = workspace_entries($state);
            $default = workspace_default($state);
            foreach ($entries as $index=>$workspace) if ($workspace->id === 'default') {
                $default = $workspace;
                unset($entries[$index]);
                break;
            }
            array_unshift($entries, $default);
            if ($id === null) {
                $list = [];
                foreach ($entries as $workspace) $list[] = [
                    'id'=>$workspace->id, 'name'=>$workspace->name, 'updatedAt'=>$workspace->updatedAt,
                    'dialectPreset'=>$workspace->dialect->preset,
                    '_links'=>['self'=>['href'=>$collection['href'].'/'.rawurlencode($workspace->id),'method'=>'GET'],
                        'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET']],
                ];
                api_json(200, ['count'=>count($list), '_embedded'=>['workspaces'=>$list],
                    '_links'=>['self'=>$collection,'root'=>['href'=>$prefix.'/api','method'=>'GET']]], true);
            }
            foreach ($entries as $workspace) if ($workspace->id === $id) {
                api_json(200, [...get_object_vars($workspace), '_links'=>[
                    'self'=>['href'=>$collection['href'].'/'.rawurlencode($id),'method'=>'GET'],
                    'collection'=>$collection, 'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET'],
                ]], true);
            }
            throw new InputError("Workspace '$id' not found.", 404);
        }
        if (($id === null && $method === 'POST') || ($id !== null && in_array($method, ['PUT','PATCH'], true))) {
            $input = logic_request_object();
            $saved = logic_mutate($db, function (array $state) use ($id, $input): array {
                $wsId = $id ?? ($input->id ?? ('ws_'.bin2hex(random_bytes(12))));
                if (!is_string($wsId) || trim($wsId) === '' || strlen($wsId) > 200 || in_array(trim($wsId), ['.', '..'], true)
                    || preg_match('~[/%\\\\\x00-\x1f\x7f]~', $wsId)) throw new InputError('Workspace id must be a routable path segment.');
                $wsId = trim($wsId);
                $workspace = workspace_default($state);
                foreach (get_object_vars($input) as $key=>$value) $workspace->$key = $value;
                $workspace->id = $wsId;
                $workspace->name = ($input->name ?? '') === '' ? $wsId : $input->name;
                $workspace->updatedAt = gmdate('Y-m-d\TH:i:s').'.000Z';
                if (!is_string($workspace->name) || !($workspace->dialect ?? null) instanceof stdClass || !is_string($workspace->dialect->preset ?? null)) throw new InputError('Workspace name and dialect preset must be text.');
                if ($wsId === 'default') save_active_workspace($state, $workspace);
                $encoded = json_encode($workspace, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                $existing = workspace_entries($state);
                $state['workspaces'] = [];
                $replaced = false;
                foreach ($existing as $entry) {
                    if ($entry->id === $wsId) { $state['workspaces'][] = $encoded; $replaced = true; }
                    else $state['workspaces'][] = json_encode($entry, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                }
                if (!$replaced) $state['workspaces'][] = $encoded;
                return [$state, ['workspace'=>$workspace]];
            });
            $self = ['href'=>$collection['href'].'/'.rawurlencode($saved['workspace']->id),'method'=>'GET'];
            if ($method === 'POST') header('Location: '.$self['href']);
            api_json($method === 'POST' ? 201 : 200, ['ok'=>true, 'workspace'=>$saved['workspace'], '_links'=>['self'=>$self]], true);
        }
        if ($id !== null && $method === 'DELETE') {
            if ($id === 'default') {
                $result = logic_mutate($db, function (array $state): array {
                    $entry = history_clear($state, 'all');
                    return [$state, ['ok'=>true,'clearedDefault'=>true,'cleared'=>'all','generation'=>$entry->generation]];
                });
                api_json(200, [...$result, '_links'=>['collection'=>$collection]], true);
            }
            $result = logic_mutate($db, function (array $state) use ($id): array {
                $entries = workspace_entries($state);
                $state['workspaces'] = [];
                $found = false;
                foreach ($entries as $entry) {
                    if ($entry->id === $id) { $found = true; continue; }
                    $state['workspaces'][] = json_encode($entry, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                }
                if (!$found) throw new InputError("Workspace '$id' not found.", 404);
                return [$state, ['ok'=>true, 'deleted'=>$id]];
            });
            api_json(200, [...$result, '_links'=>['collection'=>$collection]], true);
        }
        header('Allow: '.($id === null ? 'GET, HEAD, POST, OPTIONS' : 'GET, HEAD, PUT, PATCH, DELETE, OPTIONS'));
        api_json(405, ['error'=>'Method not allowed.'], true);
    } catch (InputError $error) {
        api_json($error->getCode() === 404 ? 404 : 400, ['error'=>$error->getMessage()], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage()], true);
    }
}

function serve_middleware(string $route, string $method): never {
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    try {
        $db = logic_store();
        if ($route === 'api/middleware/config') {
            if (in_array($method, ['GET', 'HEAD'], true)) {
                $state = logic_state($db);
                $cfg = middleware_active_config($state);
                api_json(200, [
                    ...$cfg,
                    'cacheEpoch' => template_cache_epoch(),
                    'defaults' => [
                        'templates' => API_HTML_TEMPLATE_CONFIGS,
                        'fragments' => array_map(fn($k, $v) => ['name'=>$k, 'markup'=>$v, 'hardcodedDefault'=>true], array_keys(API_HTML_FRAGMENT_TEMPLATES), API_HTML_FRAGMENT_TEMPLATES),
                        'slugRoutes' => DEFAULT_SLUG_ROUTES,
                        'slugPatterns' => DEFAULT_SLUG_PATTERNS,
                    ],
                    '_links' => [
                        'self' => ['href'=>$prefix.'/api/middleware/config', 'method'=>'GET'],
                        'slugs' => ['href'=>$prefix.'/api/middleware/slugs', 'method'=>'GET'],
                        'templates' => ['href'=>$prefix.'/api/middleware/templates', 'method'=>'GET'],
                        'frontend' => ['href'=>$prefix.'/api/middleware/frontend', 'method'=>'GET'],
                        'reset' => ['href'=>$prefix.'/api/middleware/reset', 'method'=>'POST'],
                    ],
                ], true);
            }
            if (in_array($method, ['PUT', 'PATCH'], true)) {
                $body = logic_request_object();
                $patch = json_decode(json_encode($body, JSON_THROW_ON_ERROR), true, 32, JSON_THROW_ON_ERROR);
                $updated = logic_mutate($db, function (array $state) use ($patch): array {
                    $next = middleware_apply_patch(middleware_active_config($state), $patch);
                    $state['middlewareConfig'] = $next;
                    return [$state, $next];
                });
                api_json(200, ['ok'=>true, 'cacheEpoch'=>template_cache_epoch(), 'config'=>$updated, '_links'=>['self'=>['href'=>$prefix.'/api/middleware/config','method'=>'GET']]], true);
            }
            header('Allow: GET, HEAD, PUT, PATCH, OPTIONS');
            api_json(405, ['error'=>'Method not allowed.'], true);
        }
        if ($route === 'api/middleware/slugs' && in_array($method, ['GET', 'HEAD'], true)) {
            $cfg = middleware_active_config(logic_state($db));
            api_json(200, [
                'prettyBasePath'=>$cfg['frontend']['prettyBasePath'],
                'slugRoutes'=>$cfg['slugRoutes'],
                'slugPatterns'=>$cfg['slugPatterns'],
                'hardcodedDefaults'=>['slugRoutes'=>DEFAULT_SLUG_ROUTES, 'slugPatterns'=>DEFAULT_SLUG_PATTERNS],
                '_links'=>['self'=>['href'=>$prefix.'/api/middleware/slugs','method'=>'GET']],
            ], true);
        }
        if (preg_match('~^api/middleware/slugs/([^/]+)$~', $route, $m)) {
            $slug = rawurldecode($m[1]);
            if (!is_valid_slug_identifier($slug)) api_json(400, ['ok'=>false, 'error'=>"Invalid slug '$slug'."], true);
            if ($method === 'PUT') {
                $body = logic_request_object();
                $arr = json_decode(json_encode($body, JSON_THROW_ON_ERROR), true, 16, JSON_THROW_ON_ERROR);
                $arr['slug'] = $slug;
                $updated = logic_mutate($db, function (array $state) use ($slug, $arr): array {
                    $next = middleware_apply_patch(middleware_active_config($state), ['slugRoutes'=>[$slug=>$arr]]);
                    $state['middlewareConfig'] = $next;
                    return [$state, $next['slugRoutes'][$slug]];
                });
                api_json(200, ['ok'=>true, 'slug'=>$updated, '_links'=>['self'=>['href'=>$prefix.'/api/middleware/slugs/'.rawurlencode($slug),'method'=>'GET']]], true);
            }
            if ($method === 'DELETE') {
                $restored = logic_mutate($db, function (array $state) use ($slug): array {
                    $cfg = middleware_active_config($state);
                    if (!isset($cfg['slugRoutes'][$slug])) throw new InputError("Slug '$slug' not found.", 404);
                    if (isset(DEFAULT_SLUG_ROUTES[$slug])) $cfg['slugRoutes'][$slug] = DEFAULT_SLUG_ROUTES[$slug];
                    else unset($cfg['slugRoutes'][$slug]);
                    $cfg['version'] = ((int)($cfg['version'] ?? 1)) + 1;
                    $cfg['updatedAt'] = gmdate('Y-m-d\TH:i:s') . '.000Z';
                    $state['middlewareConfig'] = $cfg;
                    return [$state, isset(DEFAULT_SLUG_ROUTES[$slug])];
                });
                api_json(200, ['ok'=>true, 'slug'=>$slug, 'restoredDefault'=>$restored, '_links'=>['slugs'=>['href'=>$prefix.'/api/middleware/slugs','method'=>'GET']]], true);
            }
            header('Allow: PUT, DELETE, OPTIONS');
            api_json(405, ['error'=>'Method not allowed.'], true);
        }
        if ($route === 'api/middleware/templates' && in_array($method, ['GET', 'HEAD'], true)) {
            $cfg = middleware_active_config(logic_state($db));
            api_json(200, ['cacheEpoch'=>template_cache_epoch(), 'templates'=>$cfg['templates'], 'fragments'=>$cfg['fragments'],
                '_links'=>['self'=>['href'=>$prefix.'/api/middleware/templates','method'=>'GET']]], true);
        }
        if ($route === 'api/middleware/frontend' && in_array($method, ['GET', 'HEAD'], true)) {
            $cfg = middleware_active_config(logic_state($db));
            api_json(200, ['frontend'=>$cfg['frontend'], '_links'=>['self'=>['href'=>$prefix.'/api/middleware/frontend','method'=>'GET']]], true);
        }
        if ($route === 'api/middleware/reset' && $method === 'POST') {
            $body = logic_request_object(true);
            $branch = is_string($body->branch ?? null) ? $body->branch : 'all';
            $updated = logic_mutate($db, function (array $state) use ($branch): array {
                $defaults = middleware_default_config();
                $cur = middleware_active_config($state);
                if ($branch === 'slugs') { $cur['slugRoutes'] = $defaults['slugRoutes']; $cur['slugPatterns'] = $defaults['slugPatterns']; }
                elseif ($branch === 'templates') { $cur['templates'] = $defaults['templates']; $cur['fragments'] = $defaults['fragments']; }
                elseif ($branch === 'frontend') { $cur['frontend'] = $defaults['frontend']; }
                else { $cur = $defaults; }
                $cur['version'] = ((int)($cur['version'] ?? 1)) + 1;
                $cur['updatedAt'] = gmdate('Y-m-d\TH:i:s') . '.000Z';
                $state['middlewareConfig'] = $cur;
                return [$state, $cur];
            });
            api_json(200, ['ok'=>true, 'resetBranch'=>$branch, 'cacheEpoch'=>template_cache_epoch(), 'config'=>$updated, '_links'=>['self'=>['href'=>$prefix.'/api/middleware/config','method'=>'GET']]], true);
        }
        api_json(404, ['error'=>'Unknown middleware endpoint.'], true);
    } catch (InputError $e) {
        api_json($e->getCode() === 404 ? 404 : 400, ['ok'=>false, 'error'=>$e->getMessage()], true);
    } catch (LogicStorageError $e) {
        api_json(503, ['ok'=>false, 'error'=>$e->getMessage()], true);
    }
}
