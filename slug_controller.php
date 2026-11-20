<?php
declare(strict_types=1);
if (!defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

function valid_node_slug_segment(string $value): bool {
    return $value !== '' && $value !== '.' && $value !== '..' && strlen($value) <= 200
        && !str_contains($value, '/') && !str_contains($value, '\\') && !str_contains($value, "\0");
}

function slug_app_base_prefix(): string {
    $base = function_exists('app_effective_base') ? app_effective_base() : (defined('APP_BASE') ? APP_BASE : '/');
    return $base === '/' ? '' : rtrim($base, '/');
}

function redirect_pretty_node(string $target): never {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        http_response_code(405);
        header('Allow: GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE');
        exit;
    }
    header('Cache-Control: no-store');
    header('Location: ' . $target, true, 307);
    exit;
}

function dispatch_slug_route(mixed $rawSlug): never {
    $basePrefix = slug_app_base_prefix();
    if (is_string($rawSlug) && preg_match('~^nodes/([^/]+)/([^/]+)(?:/members/([^/]+))?/?$~D', $rawSlug, $match)) {
        $kind = rawurldecode($match[1]);
        $nodeId = rawurldecode($match[2]);
        $member = isset($match[3]) ? rawurldecode($match[3]) : null;
        if (!valid_node_slug_segment($kind) || !valid_node_slug_segment($nodeId) || ($member !== null && !valid_node_slug_segment($member))) {
            http_response_code(400);
            header('Cache-Control: no-store');
            header('Content-Type: text/html; charset=utf-8');
            echo render_api_html('studio', 'error', ['title'=>'Invalid node route', 'message'=>'Node and member path segments must be valid single URI components.']);
            exit;
        }
        $target = $basePrefix . '/api/nodes/' . rawurlencode($kind) . '/' . rawurlencode($nodeId);
        if ($member !== null) $target .= '/members/' . rawurlencode($member);
        redirect_pretty_node($target);
    }
    if (is_string($rawSlug) && preg_match('~^members/([^/]+)/?$~D', $rawSlug, $match)) {
        $member = rawurldecode($match[1]);
        $node = $_GET['node'] ?? null;
        if (!valid_node_slug_segment($member) || !is_string($node)) {
            http_response_code(400);
            header('Cache-Control: no-store');
            header('Content-Type: text/html; charset=utf-8');
            echo render_api_html('studio', 'error', ['title'=>'Incomplete member route', 'message'=>'The short member URL requires its parent node in the node query parameter.']);
            exit;
        }
        $identity = explode('/', rawurldecode($node));
        if (count($identity) !== 2 || !valid_node_slug_segment($identity[0]) || !valid_node_slug_segment($identity[1])) {
            http_response_code(400);
            header('Cache-Control: no-store');
            header('Content-Type: text/html; charset=utf-8');
            echo render_api_html('studio', 'error', ['title'=>'Invalid member route', 'message'=>'The node parameter must contain a kind and node ID.']);
            exit;
        }
        redirect_pretty_node($basePrefix . '/api/nodes/' . rawurlencode($identity[0]) . '/' . rawurlencode($identity[1]) . '/members/' . rawurlencode($member));
    }
    $cleanSlug = is_string($rawSlug) ? rtrim($rawSlug, '/') : '';
    if (!is_valid_slug_identifier($cleanSlug)) {
        http_response_code(400);
        header('Cache-Control: no-store');
        header('Content-Type: text/html; charset=utf-8');
        echo render_api_html('studio', 'error', ['title'=>'Invalid route', 'message'=>'Use a lowercase letter, number, or hyphen in the route slug.']);
        exit;
    }

    $mw = middleware_active_config();
    $routes = $mw['slugRoutes'] ?? DEFAULT_SLUG_ROUTES;
    if (!isset($routes[$cleanSlug]) || ($routes[$cleanSlug]['enabled'] ?? true) === false) {
        http_response_code(404);
        header('Cache-Control: no-store');
        header('Content-Type: text/html; charset=utf-8');
        echo render_api_html('studio', 'error', ['title'=>'Page not found', 'message'=>'No page is registered for this slug.']);
        exit;
    }

    $route = $routes[$cleanSlug];
    try {
        $template = select_api_template_name($_GET['template'] ?? ($route['template'] ?? 'studio'));
    } catch (InvalidArgumentException) {
        http_response_code(400);
        header('Cache-Control: no-store');
        header('Content-Type: text/html; charset=utf-8');
        echo render_api_html('studio', 'error', ['title'=>'Invalid template', 'message'=>'Choose a configured template name.']);
        exit;
    }
    if (($route['fragment'] ?? 'document') === 'document') {
        $effectiveBase = function_exists('app_effective_base') ? app_effective_base() : APP_BASE;
        $html = load_spa_document_html(__DIR__, $effectiveBase);
        if ($html === null) {
            http_response_code(503);
            header('Cache-Control: no-store');
            header('Content-Type: text/html; charset=utf-8');
            echo render_api_html('studio', 'error', ['title'=>'Studio unavailable', 'message'=>'Build the single-page application before serving it.']);
            exit;
        }
        http_response_code(200);
        header('Cache-Control: no-cache');
        header('X-Content-Type-Options: nosniff');
        header('Content-Type: text/html; charset=utf-8');
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') echo render_api_html($template, 'document', [], $html);
        exit;
    }
    http_response_code(200);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Content-Type: text/html; charset=utf-8');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
        echo render_api_html($template, (string)$route['fragment'], [
            'title'=>$route['title'] ?? '',
            'message'=>$route['message'] ?? '',
        ]);
    }
    exit;
}

function template_accept_type(): ?string {
    $accept = trim($_SERVER['HTTP_ACCEPT'] ?? '');
    if ($accept === '') return 'text/html';
    $qualities = [];
    foreach (explode(',', $accept) as $entry) {
        $parts = array_map('trim', explode(';', $entry));
        $type = strtolower(array_shift($parts) ?? '');
        if (!in_array($type, ['text/html', 'text/plain', 'text/*', '*/*'], true)) continue;
        $quality = 1.0;
        foreach ($parts as $parameter) {
            if (preg_match('/^q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i', $parameter, $match)) $quality = (float)$match[1];
        }
        $qualities[$type] = $quality;
    }
    $plain = $qualities['text/plain'] ?? $qualities['text/*'] ?? $qualities['*/*'] ?? 0.0;
    $html = $qualities['text/html'] ?? $qualities['text/*'] ?? $qualities['*/*'] ?? 0.0;
    if ($plain <= 0 && $html <= 0) return null;
    return $plain > 0 && $plain >= $html ? 'text/plain' : 'text/html';
}

function etag_matches_if_none_match(string $etag): bool {
    $header = trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '');
    if ($header === '') return false;
    if ($header === '*') return true;
    foreach (explode(',', $header) as $candidate) {
        $clean = trim($candidate);
        if ($clean === $etag || $clean === 'W/' . $etag) return true;
    }
    return false;
}

function dispatch_template_route(mixed $rawRoute): never {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, ['GET', 'HEAD', 'POST'], true)) {
        http_response_code(405);
        header('Allow: GET, HEAD, POST');
        exit;
    }
    if (!is_string($rawRoute) || !preg_match('~^([^/]+)/([^/]+)/?$~D', $rawRoute, $match)) {
        http_response_code(404);
        exit;
    }
    $rawTemplate = rawurldecode($match[1]);
    $rawFragment = rawurldecode($match[2]);
    // Strict allowlist validation to prevent path traversal or injection
    if (!is_valid_template_identifier($rawTemplate) || !is_valid_template_identifier($rawFragment)) {
        http_response_code(404);
        exit;
    }
    try {
        $template = select_api_template_name($rawTemplate);
    } catch (InvalidArgumentException) {
        http_response_code(404);
        exit;
    }
    $source = api_fragment_source($rawFragment);
    if ($source === null) {
        http_response_code(404);
        exit;
    }
    $mediaType = template_accept_type();
    header('Vary: Accept');
    header('X-Content-Type-Options: nosniff');
    if ($mediaType === null) {
        http_response_code(406);
        header('Cache-Control: no-store');
        exit;
    }
    if ($mediaType === 'text/plain') {
        $etag = template_etag('text/plain', $template, $rawFragment, $source);
        header('Cache-Control: public, max-age=300');
        header('ETag: ' . $etag);
        header('Content-Type: text/plain; charset=utf-8');
        if ($method !== 'POST' && etag_matches_if_none_match($etag)) {
            http_response_code(304);
            exit;
        }
        http_response_code(200);
        if ($method !== 'HEAD') echo $source;
        exit;
    }

    $submittedValues = [];
    if ($method === 'POST') {
        $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
        if ($contentType === 'application/json') {
            $body = file_get_contents('php://input', false, null, 0, 262145);
            if ($body === false || strlen($body) > 262144) {
                http_response_code(413);
                exit;
            }
            try {
                $decoded = json_decode($body, false, 16, JSON_THROW_ON_ERROR);
            } catch (JsonException) {
                http_response_code(400);
                exit;
            }
            if (!$decoded instanceof stdClass) {
                http_response_code(400);
                exit;
            }
            $submittedValues = get_object_vars($decoded);
        } elseif ($contentType === 'application/x-www-form-urlencoded') {
            $submittedValues = $_POST;
        } else {
            http_response_code(415);
            header('Accept-Post: application/json, application/x-www-form-urlencoded');
            exit;
        }
    } else {
        $submittedValues = $_GET;
        unset($submittedValues['template_route'], $submittedValues['template'], $submittedValues['slug']);
    }
    $values = [];
    foreach ($submittedValues as $key=>$value) {
        if (!is_string($key) || (!is_string($value) && !is_numeric($value) && !is_bool($value))) {
            http_response_code(400);
            exit;
        }
        $values[$key] = is_bool($value) ? ($value ? 'true' : 'false') : (string)$value;
    }
    $html = render_api_html($template, $rawFragment, $values);
    $etag = template_etag('text/html', $template, $rawFragment, $html);
    header('ETag: ' . $etag);
    header('Cache-Control: ' . ($method === 'POST' ? 'private, no-store' : 'private, no-cache'));
    header('Content-Type: text/html; charset=utf-8');
    if ($method !== 'POST' && etag_matches_if_none_match($etag)) {
        http_response_code(304);
        exit;
    }
    http_response_code(200);
    if ($method !== 'HEAD') echo $html;
    exit;
}
