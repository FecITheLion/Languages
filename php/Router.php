<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

function api_allowed_origins(): array {
    $raw = getenv('ALLOWED_ORIGINS');
    if ($raw === false || trim($raw) === '') return [];
    return array_values(array_filter(array_map('trim', explode(',', $raw)), fn($o) => $o !== ''));
}

function api_apply_cors(string $method): void {
    $allowed = api_allowed_origins();
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (!$allowed) {
        header('Access-Control-Allow-Origin: *');
    } elseif ($origin !== '') {
        header('Vary: Origin');
        if (in_array($origin, $allowed, true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
        } else {
            if ($method === 'OPTIONS') {
                api_json(403, ['ok'=>false, 'error'=>'Origin not allowed by ALLOWED_ORIGINS.']);
            }
            api_json(403, ['ok'=>false, 'error'=>'Origin not allowed by ALLOWED_ORIGINS.']);
        }
    }
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept, Authorization, X-API-Key, Mcp-Session-Id, X-Session-Id');
    header('Access-Control-Expose-Headers: Link, Location, Allow, Retry-After, X-Session-Id');
    if ($method === 'OPTIONS') {
        header('Allow: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
        http_response_code(204);
        header('Cache-Control: no-store');
        exit;
    }
}

function api_is_state_mutating(string $route, string $method): bool {
    if (in_array($method, ['PUT', 'PATCH', 'DELETE'], true)) return true;
    if ($method !== 'POST') return false;
    return in_array($route, [
        'api/rules', 'api/workspaces', 'api/callbacks', 'api/logic/labels',
        'api/histolog', 'api/engine/clear', 'api/middleware/reset', 'api/modules', 'api/sessions',
        'api/mcp/context', 'api/mcp/cache/clear',
    ], true) || (bool)preg_match('~^api/histolog/\d+/restore$~', $route);
}

function api_require_write_auth(string $route, string $method): void {
    $token = getenv('GRAMMAR2JSON_WRITE_TOKEN');
    if ($token === false || $token === '' || !api_is_state_mutating($route, $method)) return;
    $supplied = '';
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) {
        $supplied = trim($m[1]);
    } elseif (is_string($_SERVER['HTTP_X_API_KEY'] ?? null)) {
        $supplied = trim($_SERVER['HTTP_X_API_KEY']);
    }
    if ($supplied === '' || !hash_equals($token, $supplied)) {
        header('WWW-Authenticate: Bearer realm="grammar2json-studio"');
        api_json(401, ['ok'=>false, 'error'=>'Write authentication required. Supply Authorization: Bearer <token> or X-API-Key.']);
    }
}

function api_enforce_write_rate_limit(string $route, string $method): void {
    if (!api_is_state_mutating($route, $method)) return;
    $rawMax = getenv('GRAMMAR2JSON_RATE_LIMIT_MAX');
    if ($rawMax === false || trim($rawMax) === '') return;
    $max = (int)$rawMax;
    if ($max <= 0) return;
    $tmp = sys_get_temp_dir();
    if ($tmp === '' || !is_writable($tmp)) return;
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'local';
    $bucketFile = rtrim($tmp, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'g2j_rl_' . hash('sha256', $ip . '|' . (dirname(__DIR__) ?: '')) . '.json';
    $now = time();
    $fh = @fopen($bucketFile, 'c+');
    if (!$fh) return;
    try {
        if (@flock($fh, LOCK_EX)) {
            $raw = stream_get_contents($fh);
            $times = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
            if (!is_array($times)) $times = [];
            $times = array_values(array_filter($times, fn($t) => is_int($t) && ($now - $t) < 60));
            if (count($times) >= $max) {
                header('Retry-After: 60');
                @flock($fh, LOCK_UN);
                @fclose($fh);
                api_json(429, ['ok'=>false, 'error'=>'Write rate limit exceeded. Try again shortly.']);
            }
            $times[] = $now;
            ftruncate($fh, 0);
            rewind($fh);
            fwrite($fh, json_encode($times));
            @flock($fh, LOCK_UN);
        }
    } finally {
        if (is_resource($fh)) @fclose($fh);
    }
}

function serve_api(string $route): never {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (strtolower(rtrim($route, '/')) === 'healthz' && in_array($method, ['GET','HEAD'], true)) {
        api_json(200, ['ok'=>true,'service'=>'grammar2json-studio']);
    }
    $route = rtrim($route, '/');
    if (preg_match('~^api(?:/|$)~i', $route)) {
        api_apply_cors($method);
        try {
            header('X-Session-Id: ' . api_session_id());
        } catch (InputError $error) {
            api_json(400, ['ok'=>false, 'error'=>$error->getMessage()]);
        }
        api_require_write_auth($route, $method);
        api_enforce_write_rate_limit($route, $method);
    }
    if (in_array($route, ['api','api/languages'], true)) serve_api_discovery($route);
    if ($route === 'api/sessions' || preg_match('~^api/sessions/[^/]+$~', $route)) serve_sessions($route, $method);
    if ($route === 'api/templates') serve_templates_list($method);
    if ($route === 'api/templates/render') serve_templates_render($method);
    if ($route === 'api/callbacks' || preg_match('~^api/callbacks/[^/]+$~', $route)) serve_callbacks($route, $method);
    if ($route === 'api/modules' || preg_match('~^api/modules/[^/]+$~', $route)) serve_modules($route, $method);
    if ($route === 'api/rules' || preg_match('~^api/rules/[^/]+$~', $route)) serve_rules($route, $method);
    if ($route === 'api/symbols' || preg_match('~^api/symbols/[^/]+$~', $route)) serve_symbols($route, $method);
    if ($route === 'api/nodes') serve_grammar_nodes($method);
    if ($route === 'api/evaluate') serve_grammar_evaluation($method);
    if ($route === 'api/schema/predicate-tree') serve_schema_predicate($method);
    if ($route === 'api/engine/clear' || $route === 'api/histolog' || $route === 'api/histolog/diff'
        || preg_match('~^api/histolog/\d+(?:/restore)?$~', $route)) serve_history($route, $method);
    if (preg_match('~^api/logic/export/[^/]+$~', $route)) serve_logic_export($route, $method);
    if ($route === 'api/logic/multiline') serve_multiline_logic($method);
    if (preg_match('~^api/export/[a-z]+$~', $route)) serve_grammar_export($method, substr($route, strlen('api/export/')));
    if (preg_match('~^api/nodes/(rule|symbol|dialect|logic|callback|histolog)/[^/]+(?:/members(?:/[^/]+)?)?$~', $route)) serve_grammar_node($route, $method);
    if ($route === 'api/middleware/config' || $route === 'api/middleware/slugs' || $route === 'api/middleware/templates'
        || $route === 'api/middleware/frontend' || $route === 'api/middleware/reset'
        || preg_match('~^api/middleware/slugs/[^/]+$~', $route)) serve_middleware($route, $method);
    if ($route === 'api/openai/tools' || $route === 'api/openai/tools/execute') dispatch_mcp_handler($route, $method);
    if ($route === 'api/mcp' || str_starts_with($route, 'api/mcp/')) dispatch_mcp_handler($route, $method);
    if ($route === 'api/workspaces' || preg_match('~^api/workspaces/[^/]+$~', $route)) serve_workspaces($route, $method);
    if (in_array($route, ['api/logic','api/logic/labels'], true) || preg_match('~^api/logic/labels/[^/]+$~', $route)) serve_logic_state($route, $method);
    if (in_array($route, ['api/logic/evaluate','api/logic/cauchy'], true)) serve_logic_evaluate_or_cauchy($route, $method);
    api_json(404, ['error'=>'Endpoint not found.']);
}
