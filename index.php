<?php
declare(strict_types=1);

// install.php replaces this with the deployment's validated URL prefix.
const APP_BASE = '/';

function fail_request(int $status, string $message, bool $json = false): never {
    http_response_code($status);
    header('Cache-Control: no-store');
    header('Content-Type: ' . ($json ? 'application/json' : 'text/plain') . '; charset=utf-8');
    echo $json ? json_encode(['error' => $message], JSON_UNESCAPED_SLASHES) : $message;
    exit;
}

$rawPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!is_string($rawPath) || preg_match('/%(?![0-9a-f]{2})/i', $rawPath)) fail_request(400, 'Invalid path');
$path = rawurldecode($rawPath);
if (str_contains($path, "\0") || str_contains($path, '\\') || str_contains($path, '%') || preg_match('~(?:^|/)\.\.?(/|$)~', $path)) fail_request(400, 'Invalid path');
$baseRoot = rtrim(APP_BASE, '/');
if ($baseRoot !== '' && $path === $baseRoot) {
    header('Location: ' . APP_BASE, true, 308);
    exit;
}
if (!str_starts_with($path, APP_BASE)) fail_request(404, 'Not found');
$relative = substr($path, strlen(APP_BASE));
if (preg_match('~^(?:api|healthz)(?:/|$)~i', $relative)) {
    define('PHP_API_ENTRY', true);
    require __DIR__ . '/api.php';
    serve_api($relative);
}
if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)) fail_request(405, 'Method not allowed');
if (preg_match('~(?:^|/)\.~', $relative)) fail_request(404, 'Not found');

$mime = [
    'html' => 'text/html; charset=utf-8', 'js' => 'text/javascript; charset=utf-8',
    'css' => 'text/css; charset=utf-8', 'json' => 'application/json; charset=utf-8',
    'webmanifest' => 'application/manifest+json', 'png' => 'image/png', 'svg' => 'image/svg+xml',
    'webp' => 'image/webp', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif',
    'ico' => 'image/x-icon', 'woff' => 'font/woff', 'woff2' => 'font/woff2', 'ttf' => 'font/ttf',
    'wasm' => 'application/wasm', 'map' => 'application/json', 'txt' => 'text/plain; charset=utf-8',
];
$file = __DIR__ . '/' . $relative;
$resolved = realpath($file);
if ($relative !== '' && $resolved !== false && is_file($resolved) && str_starts_with($resolved, __DIR__ . DIRECTORY_SEPARATOR)) {
    $extension = strtolower(pathinfo($resolved, PATHINFO_EXTENSION));
    if (!isset($mime[$extension])) fail_request(404, 'Not found');
    header('Content-Type: ' . $mime[$extension]);
    header('X-Content-Type-Options: nosniff');
    if ($relative === 'index.html' || $relative === 'sw.js') header('Cache-Control: no-cache');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') readfile($resolved);
    exit;
}
if ($relative !== '' && pathinfo($relative, PATHINFO_EXTENSION) !== '') fail_request(404, 'Not found');
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
if (!is_file(__DIR__ . '/index.html')) fail_request(503, 'Built SPA not installed');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') readfile(__DIR__ . '/index.html');
