<?php
declare(strict_types=1);

/**
 * Native PHP MCP HTTP Transport (zero external dependencies, Apache/XAMPP ready).
 * Endpoint: POST /Application/Languages-main/mcp_http.php
 */

require_once __DIR__ . '/php/mcp_core.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept, Mcp-Session-Id');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($method === 'GET') {
    http_response_code(200);
    echo json_encode([
        'ok' => true,
        'transport' => 'http',
        'protocolVersion' => '2025-03-26',
        'serverInfo' => ['name' => 'php-mcp-server', 'version' => '1.0.0'],
        'tools' => array_map(static fn(array $t): string => (string)$t['name'], get_tools()),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'jsonrpc' => '2.0',
        'id' => null,
        'error' => ['code' => -32600, 'message' => 'Method not allowed; use POST for JSON-RPC 2.0'],
    ]);
    exit;
}

$raw = file_get_contents('php://input');
$decoded = is_string($raw) ? json_decode($raw, true) : null;
if (!is_array($decoded)) {
    http_response_code(400);
    echo json_encode([
        'jsonrpc' => '2.0',
        'id' => null,
        'error' => ['code' => -32700, 'message' => 'Parse error: invalid JSON'],
    ]);
    exit;
}

// Support both single JSON-RPC 2.0 message and batch arrays
$isBatch = array_is_list($decoded);
if ($isBatch) {
    $responses = [];
    foreach ($decoded as $item) {
        if (!is_array($item)) continue;
        $resp = handle_mcp_message($item);
        if ($resp !== null) {
            $responses[] = $resp;
        }
    }
    if ($responses === []) {
        http_response_code(202);
        exit;
    }
    http_response_code(200);
    echo json_encode($responses, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$resp = handle_mcp_message($decoded);
if ($resp === null) {
    http_response_code(202);
    exit;
}

http_response_code(200);
echo json_encode($resp, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
