<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

require_once __DIR__ . '/php/Storage.php';
require_once __DIR__ . '/php/TemplateEngine.php';
require_once __DIR__ . '/php/PhpStudioView.php';
require_once __DIR__ . '/php/GrammarEngine.php';
require_once __DIR__ . '/php/LogicEngine.php';
require_once __DIR__ . '/php/SchemaPredicateEngine.php';
require_once __DIR__ . '/php/MultilineLogicEngine.php';
require_once __DIR__ . '/php/McpHandler.php';
require_once __DIR__ . '/php/handlers/grammar.php';
require_once __DIR__ . '/php/handlers/logic.php';
require_once __DIR__ . '/php/handlers/workspaces.php';
require_once __DIR__ . '/php/handlers/templates.php';
require_once __DIR__ . '/php/handlers/modules.php';
require_once __DIR__ . '/php/handlers/sessions.php';
require_once __DIR__ . '/php/handlers/schemastore.php';
require_once __DIR__ . '/php/handlers/mcp.php';
require_once __DIR__ . '/php/Router.php';
