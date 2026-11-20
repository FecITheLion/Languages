<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

function schemastore_allowed_host(string $host): bool {
    $h = strtolower(trim($host));
    $exact = [
        'schemastore.org',
        'www.schemastore.org',
        'json.schemastore.org',
        'raw.githubusercontent.com',
        'json-schema.org',
        'www.json-schema.org',
        'cdn.jsdelivr.net',
        'getcomposer.org',
        'spec.openapis.org',
    ];
    if (in_array($h, $exact, true)) return true;
    return str_ends_with($h, '.schemastore.org');
}

function schemastore_http_get(string $url, int $maxBytes = 2097152): array {
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 12,
            'ignore_errors' => true,
            'header' => "User-Agent: Grammar2JSON-Studio/1.0\r\nAccept: application/json\r\n",
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);
    $raw = @file_get_contents($url, false, $ctx, 0, $maxBytes + 1);
    if (!is_string($raw) || $raw === '') {
        return ['ok' => false, 'status' => 502, 'error' => 'Unable to reach remote SchemaStore endpoint.'];
    }
    if (strlen($raw) > $maxBytes) {
        return ['ok' => false, 'status' => 413, 'error' => 'Remote schema exceeds 2 MB size limit.'];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return ['ok' => false, 'status' => 502, 'error' => 'Remote endpoint did not return valid JSON.'];
    }
    return ['ok' => true, 'status' => 200, 'data' => $decoded];
}

function serve_schemastore(string $route, string $method): never {
    if ($method !== 'GET') {
        api_json(405, ['ok' => false, 'error' => 'Method not allowed; use GET.']);
    }

    if ($route === 'api/schemastore/catalog') {
        $res = schemastore_http_get('https://www.schemastore.org/api/json/catalog.json', 4194304);
        if (!$res['ok']) {
            api_json($res['status'], ['ok' => false, 'error' => $res['error']]);
        }
        $schemas = $res['data']['schemas'] ?? [];
        $compact = [];
        if (is_array($schemas)) {
            foreach ($schemas as $entry) {
                if (!is_array($entry) || empty($entry['url']) || empty($entry['name'])) continue;
                $compact[] = [
                    'name' => (string)$entry['name'],
                    'description' => (string)($entry['description'] ?? ''),
                    'url' => (string)$entry['url'],
                    'fileMatch' => is_array($entry['fileMatch'] ?? null)
                        ? array_values(array_map('strval', $entry['fileMatch']))
                        : [],
                ];
            }
        }
        header('Cache-Control: public, max-age=600');
        api_json(200, ['ok' => true, 'count' => count($compact), 'schemas' => $compact]);
    }

    if ($route === 'api/schemastore/schema') {
        $url = trim((string)($_GET['url'] ?? ''));
        if ($url === '') {
            api_json(400, ['ok' => false, 'error' => 'Missing required query parameter: url']);
        }
        $parts = parse_url($url);
        if (!is_array($parts) || strtolower((string)($parts['scheme'] ?? '')) !== 'https') {
            api_json(400, ['ok' => false, 'error' => 'Only HTTPS schema URLs are supported.']);
        }
        $host = (string)($parts['host'] ?? '');
        if ($host === '' || !schemastore_allowed_host($host)) {
            api_json(403, ['ok' => false, 'error' => "Host not in SchemaStore allowlist: {$host}"]);
        }
        $res = schemastore_http_get($url, 2097152);
        if (!$res['ok']) {
            api_json($res['status'], ['ok' => false, 'error' => $res['error']]);
        }
        header('Cache-Control: public, max-age=300');
        api_json(200, ['ok' => true, 'url' => $url, 'schema' => $res['data']]);
    }

    api_json(404, ['ok' => false, 'error' => 'SchemaStore endpoint not found.']);
}
