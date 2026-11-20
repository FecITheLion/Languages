<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

function dispatch_mcp_handler(string $route, string $method): never {
    if ($route === 'api/openai/tools' || $route === 'api/openai/tools/execute') {
        serve_openai_tools($route, $method);
    }
    serve_mcp($route, $method);
}
