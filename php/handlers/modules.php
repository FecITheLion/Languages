<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

function module_validate_package(stdClass $raw, ?string $forcedId = null): array {
    if (!($raw->manifest ?? null) instanceof stdClass || !($raw->files ?? null) instanceof stdClass) {
        throw new InputError('Module payload requires "manifest" and "files" objects.');
    }
    $m = $raw->manifest;
    $id = $forcedId ?? ($m->id ?? null);
    if (!is_string($id) || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $id) || strlen($id) > 64) {
        throw new InputError('Module manifest requires a lowercase kebab-case id.');
    }
    $name = $m->name ?? null;
    if (!is_string($name) || trim($name) === '') {
        throw new InputError('Module manifest requires a non-empty name.');
    }
    $version = $m->version ?? '1.0.0';
    if (!is_string($version) || !preg_match('/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/D', $version)) {
        throw new InputError('Module version must use semver syntax.');
    }
    $kind = $m->kind ?? 'website';
    if (!is_string($kind) || !in_array($kind, ['workbench', 'endpoint', 'website'], true)) {
        throw new InputError('Unsupported module kind.');
    }
    $entrypoint = $m->entrypoint ?? null;
    if (!is_string($entrypoint) || $entrypoint === '') {
        throw new InputError('Module manifest requires an entrypoint.');
    }
    $filesArr = [];
    $totalBytes = 0;
    foreach (get_object_vars($raw->files) as $path => $content) {
        if (!is_string($path) || $path === '' || str_starts_with($path, '/') || str_contains($path, '\\') || str_contains($path, "\0")
            || !preg_match('/^(?:scripts|templates|styles|assets)\/[A-Za-z0-9._\/-]+$/D', $path)
            || in_array('..', explode('/', $path), true) || in_array('.', explode('/', $path), true) || str_contains($path, '//')) {
            throw new InputError("Invalid module file path '{$path}'.");
        }
        if (!is_string($content)) throw new InputError("Module file '{$path}' must contain text.");
        $totalBytes += strlen($content);
        if ($totalBytes > 2097152) throw new InputError('Module content exceeds 2 MiB limit.');
        $filesArr[$path] = $content;
    }
    if (count($filesArr) < 1 || count($filesArr) > 128) throw new InputError('Module must contain between 1 and 128 files.');
    if (!array_key_exists($entrypoint, $filesArr)) throw new InputError('Module entrypoint must reference an included file.');

    $manifest = ['id'=>$id, 'name'=>trim($name), 'version'=>$version, 'kind'=>$kind, 'entrypoint'=>$entrypoint];
    if ($kind === 'workbench') {
        $slug = $m->workbenchSlug ?? $id;
        if (!is_string($slug) || !preg_match('/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/D', $slug)) {
            throw new InputError('Workbench modules require a valid workbenchSlug.');
        }
        $manifest['workbenchSlug'] = $slug;
    }
    if (isset($m->description) && is_string($m->description)) $manifest['description'] = $m->description;
    if (isset($m->routes)) {
        if (!is_array($m->routes)) throw new InputError('Module routes must be an array.');
        foreach ($m->routes as $rt) {
            if (!is_string($rt) || !str_starts_with($rt, '/') || str_starts_with($rt, '//')) {
                throw new InputError('Module routes must be origin-relative paths.');
            }
        }
        $manifest['routes'] = array_values($m->routes);
    } elseif ($kind === 'endpoint') {
        throw new InputError('Endpoint modules require at least one route.');
    }
    if (isset($m->processing)) {
        if (!$m->processing instanceof stdClass) throw new InputError('Module processing conditions must be an object.');
        $proc = json_decode(json_encode($m->processing, JSON_THROW_ON_ERROR), true, 16, JSON_THROW_ON_ERROR);
        foreach (['routes','methods','workbenchSlugs','blockScopes','callNames'] as $selKey) {
            if (array_key_exists($selKey, $proc)) {
                if (!is_array($proc[$selKey])) throw new InputError("Module processing selector '{$selKey}' must be an array.");
                foreach ($proc[$selKey] as $v) {
                    if (!is_string($v) || $v === '') throw new InputError("Module processing selector '{$selKey}' entries must be non-empty strings.");
                }
            }
        }
        if (isset($proc['properties'])) {
            if (!is_array($proc['properties'])) throw new InputError('Module processing properties must be an object.');
            foreach ($proc['properties'] as $propPath => $propVal) {
                if (!preg_match('/^(?:input|environment|scope|call)(?:\.[A-Za-z0-9_-]+)+$/D', (string)$propPath)
                    || (!is_string($propVal) && !is_int($propVal) && !is_float($propVal) && !is_bool($propVal) && $propVal !== null)) {
                    throw new InputError("Invalid module processing property condition '{$propPath}'.");
                }
            }
        }
        $manifest['processing'] = $proc;
    }
    return ['manifest'=>$manifest, 'files'=>$filesArr, 'updatedAt'=>gmdate('Y-m-d\TH:i:s').'.000Z'];
}

function serve_modules(string $route, string $method): never {
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    $collection = ['href'=>$prefix.'/api/modules', 'method'=>'GET'];
    $id = $route === 'api/modules' ? null : rawurldecode(substr($route, strlen('api/modules/')));
    try {
        $db = logic_store();
        $state = logic_state($db);
        $modules = is_array($state['modules'] ?? null) ? $state['modules'] : [];
        if (in_array($method, ['GET', 'HEAD'], true)) {
            if ($id === null) {
                $list = [];
                foreach ($modules as $modId => $mod) {
                    $list[] = [...$mod, '_links'=>['self'=>['href'=>$collection['href'].'/'.rawurlencode((string)$modId), 'method'=>'GET']]];
                }
                api_json(200, ['count'=>count($list), 'modules'=>array_values($list), '_links'=>['self'=>$collection, 'root'=>['href'=>$prefix.'/api', 'method'=>'GET']]], true);
            }
            if (!isset($modules[$id])) throw new InputError("Module '{$id}' not found.", 404);
            api_json(200, [...$modules[$id], '_links'=>['self'=>['href'=>$collection['href'].'/'.rawurlencode($id), 'method'=>'GET'], 'collection'=>$collection]], true);
        }
        if (($id === null && $method === 'POST') || ($id !== null && in_array($method, ['PUT', 'PATCH'], true))) {
            $input = logic_request_object();
            $pkg = module_validate_package($input, $id);
            $modId = $pkg['manifest']['id'];
            $saved = logic_mutate($db, function (array $s) use ($modId, $pkg): array {
                if (!is_array($s['modules'] ?? null)) $s['modules'] = [];
                if (count($s['modules']) >= 64 && !isset($s['modules'][$modId])) {
                    throw new InputError('At most 64 stored modules are supported.');
                }
                $s['modules'][$modId] = $pkg;
                return [$s, $pkg];
            }, fn() => ['rest_module_save', "Saved module {$modId}"]);
            $selfHref = $collection['href'].'/'.rawurlencode($modId);
            if ($method === 'POST') header('Location: '.$selfHref);
            api_json($method === 'POST' ? 201 : 200, ['ok'=>true, 'module'=>$saved, '_links'=>['self'=>['href'=>$selfHref, 'method'=>'GET'], 'collection'=>$collection]], true);
        }
        if ($id !== null && $method === 'DELETE') {
            $deleted = logic_mutate($db, function (array $s) use ($id): array {
                if (!is_array($s['modules'] ?? null) || !isset($s['modules'][$id])) {
                    throw new InputError("Module '{$id}' not found.", 404);
                }
                unset($s['modules'][$id]);
                return [$s, $id];
            }, fn() => ['rest_module_delete', "Deleted module {$id}"]);
            api_json(200, ['ok'=>true, 'deleted'=>$deleted, '_links'=>['collection'=>$collection]], true);
        }
        header('Allow: '.($id === null ? 'GET, HEAD, POST, OPTIONS' : 'GET, HEAD, PUT, PATCH, DELETE, OPTIONS'));
        api_json(405, ['error'=>'Method not allowed.'], true);
    } catch (InputError $error) {
        api_json($error->getCode() === 404 ? 404 : 400, ['ok'=>false, 'error'=>$error->getMessage()], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['ok'=>false, 'error'=>$error->getMessage()], true);
    }
}
