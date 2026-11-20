<?php
declare(strict_types=1);

// install.php replaces this with the deployment's validated URL prefix.
const APP_BASE = '/';
const APP_TEMPLATE_NAME = 'studio';
define('PHP_RENDER_ENTRY', true);
require_once __DIR__ . '/api.php';

function requested_template_name(): string {
    try {
        return select_api_template_name($_GET['template'] ?? null);
    } catch (InvalidArgumentException) {
        fail_request(400, 'Unknown HTML template name.');
    }
}

function fail_request(int $status, string $message, bool $json = false): never {
    http_response_code($status);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    if ($json) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => $message], JSON_UNESCAPED_SLASHES);
    } else {
        header('Content-Type: text/html; charset=utf-8');
        $template = 'studio';
        try { $template = select_api_template_name($_GET['template'] ?? null); } catch (InvalidArgumentException) {}
        echo render_api_html($template, 'error', ['title' => 'Request error', 'message' => $message]);
    }
    exit;
}

function resolve_app_base(string $requestPath): string {
    if (APP_BASE !== '/') {
        return APP_BASE;
    }
    $scriptName = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
    if ($scriptName !== '' && preg_match('~^(.*/)index\.php$~i', $scriptName, $match)) {
        $scriptDir = $match[1];
        if ($scriptDir !== '/'
            && preg_match('~^/(?:[A-Za-z0-9._-]+/)*$~D', $scriptDir)
            && !preg_match('~(?:^|/)\.\.?(/|$)~', $scriptDir)
        ) {
            $scriptRoot = rtrim($scriptDir, '/');
            if ($requestPath === $scriptRoot || str_starts_with($requestPath, $scriptDir)) {
                return $scriptDir;
            }
        }
    }
    return APP_BASE;
}

$rawPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!is_string($rawPath) || preg_match('/%(?![0-9a-f]{2})/i', $rawPath)) fail_request(400, 'Invalid path');
$path = rawurldecode($rawPath);
if (str_contains($path, "\0") || str_contains($path, '\\') || str_contains($path, '%') || preg_match('~(?:^|/)\.\.?(/|$)~', $path)) fail_request(400, 'Invalid path');
$effectiveBase = resolve_app_base($path);
[$spaRoot, $usingDistDir] = spa_document_root(__DIR__);
$GLOBALS['APP_EFFECTIVE_BASE'] = $effectiveBase;
$GLOBALS['APP_ASSET_BASE'] = $usingDistDir ? rtrim($effectiveBase, '/') . '/dist/' : $effectiveBase;
$GLOBALS['APP_API_BASE'] = ($usingDistDir && !is_file(__DIR__ . '/.htaccess'))
    ? rtrim($effectiveBase, '/') . '/index.php'
    : rtrim($effectiveBase, '/');
$baseRoot = rtrim($effectiveBase, '/');
if ($baseRoot !== '' && $path === $baseRoot) {
    header('Location: ' . $effectiveBase, true, 308);
    exit;
}
if (!str_starts_with($path, $effectiveBase)) fail_request(404, 'Not found');
$relative = substr($path, strlen($effectiveBase));
// Allow opening index.php directly (and index.php/<route> PATH_INFO), stripping only once.
if (preg_match('~^index\.php(?:/(.*))?$~i', $relative, $entryMatch)) {
    $relative = $entryMatch[1] ?? '';
}
if (isset($_GET['template_route'])) {
    require_once __DIR__ . '/slug_controller.php';
    dispatch_template_route($_GET['template_route']);
}
if (isset($_GET['slug'])) {
    require_once __DIR__ . '/slug_controller.php';
    dispatch_slug_route($_GET['slug']);
}
if (preg_match('~^(?:api|healthz)(?:/|$)~i', $relative)) {
    define('PHP_API_ENTRY', true);
    require_once __DIR__ . '/api.php';
    serve_api($relative);
}
if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)) fail_request(405, 'Method not allowed');
if (preg_match('~(?:^|/)\.~', $relative) || preg_match('~^php(?:/|$)~i', $relative)) fail_request(404, 'Not found');

$mime = [
    'html' => 'text/html; charset=utf-8', 'js' => 'text/javascript; charset=utf-8',
    'css' => 'text/css; charset=utf-8', 'json' => 'application/json; charset=utf-8',
    'webmanifest' => 'application/manifest+json', 'png' => 'image/png', 'svg' => 'image/svg+xml',
    'webp' => 'image/webp', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif',
    'ico' => 'image/x-icon', 'woff' => 'font/woff', 'woff2' => 'font/woff2', 'ttf' => 'font/ttf',
    'wasm' => 'application/wasm', 'map' => 'application/json', 'txt' => 'text/plain; charset=utf-8',
];
if ($relative === 'index.html') {
    header('Content-Type: text/html; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-cache');
    $html = load_spa_document_html(__DIR__, $effectiveBase);
    if ($html === null) fail_request(503, 'Built SPA not installed');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
        echo render_api_html(requested_template_name(), 'document', [], $html);
    }
    exit;
}
$resolved = null;
if ($relative !== '') {
    $roots = $usingDistDir ? [$spaRoot, __DIR__] : [__DIR__];
    foreach ($roots as $candidateRoot) {
        $rootReal = realpath($candidateRoot);
        if ($rootReal === false) continue;
        $candidateResolved = realpath($candidateRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative));
        if ($candidateResolved !== false && is_file($candidateResolved) && str_starts_with($candidateResolved, $rootReal . DIRECTORY_SEPARATOR)) {
            $resolved = $candidateResolved;
            break;
        }
    }
}
if ($resolved !== null) {
    $extension = strtolower(pathinfo($resolved, PATHINFO_EXTENSION));
    if (!isset($mime[$extension])) fail_request(404, 'Not found');
    header('Content-Type: ' . $mime[$extension]);
    header('X-Content-Type-Options: nosniff');
    if ($relative === 'sw.js') header('Cache-Control: no-cache');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
        readfile($resolved);
    }
    exit;
}
if ($relative !== '' && pathinfo($relative, PATHINFO_EXTENSION) !== '') fail_request(404, 'Not found');
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
$html = load_spa_document_html(__DIR__, $effectiveBase);
if ($html === null) fail_request(503, 'Built SPA not installed');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
    echo render_api_html(requested_template_name(), 'document', [], $html);
}
