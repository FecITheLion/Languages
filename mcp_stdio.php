#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Native PHP MCP stdio Transport (zero external dependencies).
 * Run via: php mcp_stdio.php
 * Reads newline-delimited JSON-RPC 2.0 messages on STDIN and writes responses to STDOUT.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("stdio transport must be run from CLI.\n");
}

require_once __DIR__ . '/php/mcp_core.php';

while (($line = fgets(STDIN)) !== false) {
    $trimmed = trim($line);
    if ($trimmed === '') {
        continue;
    }

    $req = json_decode($trimmed, true);
    if (!is_array($req)) {
        $err = [
            'jsonrpc' => '2.0',
            'id' => null,
            'error' => ['code' => -32700, 'message' => 'Parse error: invalid JSON'],
        ];
        fwrite(STDOUT, json_encode($err, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        fflush(STDOUT);
        continue;
    }

    $resp = handle_mcp_message($req);
    if ($resp !== null) {
        fwrite(STDOUT, json_encode($resp, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
        fflush(STDOUT);
    }
}
