<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

function serve_api_discovery(string $route): never {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, ['GET','HEAD'], true)) {
        header('Allow: GET, HEAD, OPTIONS');
        api_json(405, ['error'=>'Method not allowed.']);
    }
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    if ($route === 'api') {
        $links = [
            'self'=>['href'=>$prefix.'/api','method'=>'GET'],
            'logic'=>['href'=>$prefix.'/api/logic','method'=>'GET'],
            'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET'],
            'symbols'=>['href'=>$prefix.'/api/symbols','method'=>'GET'],
            'nodes'=>['href'=>$prefix.'/api/nodes','method'=>'GET'],
            'grammarExport'=>['href'=>$prefix.'/api/export/grammar','method'=>'GET'],
            'jsonldExport'=>['href'=>$prefix.'/api/export/jsonld','method'=>'GET'],
            'grammarEvaluate'=>['href'=>$prefix.'/api/evaluate','method'=>'POST'],
            'schemaPredicateTree'=>['href'=>$prefix.'/api/schema/predicate-tree','method'=>'POST'],
            'histolog'=>['href'=>$prefix.'/api/histolog','method'=>'GET'],
            'logicLabels'=>['href'=>$prefix.'/api/logic/labels','method'=>'GET'],
            'evaluate'=>['href'=>$prefix.'/api/logic/evaluate','method'=>'POST'],
            'multilineLogic'=>['href'=>$prefix.'/api/logic/multiline','method'=>'POST'],
            'cauchy'=>['href'=>$prefix.'/api/logic/cauchy','method'=>'POST'],
            'callbacks'=>['href'=>$prefix.'/api/callbacks','method'=>'GET'],
            'modules'=>['href'=>$prefix.'/api/modules','method'=>'GET'],
            'sessions'=>['href'=>$prefix.'/api/sessions','method'=>'GET'],
            'workspaces'=>['href'=>$prefix.'/api/workspaces','method'=>'GET'],
            'mcp'=>['href'=>$prefix.'/api/mcp','method'=>'POST'],
            'mcpServers'=>['href'=>$prefix.'/api/mcp/servers','method'=>'GET'],
            'openaiTools'=>['href'=>$prefix.'/api/openai/tools','method'=>'GET'],
            'middleware'=>['href'=>$prefix.'/api/middleware/config','method'=>'GET'],
            'slugs'=>['href'=>$prefix.'/api/middleware/slugs','method'=>'GET'],
            'languages'=>['href'=>$prefix.'/api/languages','method'=>'GET'],
            'templates'=>['href'=>$prefix.'/api/templates','method'=>'GET'],
        ];
        api_json(200, ['service'=>'Grammar2JSON Studio PHP API', 'mediaType'=>'application/hal+json',
            'partial'=>false, 'summary'=>['supportedLanguageCount'=>count(API_LANGUAGES)], '_links'=>$links], true);
    }
    $languages = [];
    foreach (API_LANGUAGES as [$id,$exportId,$label,$shortLabel,$extension]) {
        $languages[] = [
            'id'=>$id, 'exportId'=>$exportId, 'label'=>$label, 'shortLabel'=>$shortLabel, 'extension'=>$extension,
            '_links'=>[
                'exportWorkspace'=>['href'=>$prefix.'/api/export/'.rawurlencode($exportId),'method'=>'GET','available'=>true],
                'exportLogic'=>['href'=>$prefix.'/api/logic/export/'.rawurlencode($exportId),'method'=>'GET','available'=>true],
            ],
        ];
    }
    api_json(200, ['count'=>count($languages), 'languages'=>$languages, '_links'=>[
        'self'=>['href'=>$prefix.'/api/languages','method'=>'GET'], 'root'=>['href'=>$prefix.'/api','method'=>'GET'],
    ]], true);
}

function serve_templates_list(string $method): never {
    if (!in_array($method, ['GET', 'HEAD'], true)) {
        header('Allow: GET, HEAD, OPTIONS');
        api_json(405, ['error'=>'Method not allowed.']);
    }
    try {
        $mw = middleware_active_config();
        api_json(200, [
            'template'=>select_api_template_name($_GET['template'] ?? null),
            'templates'=>array_keys($mw['templates']),
            'fragments'=>array_keys($mw['fragments']),
            'cacheEpoch'=>template_cache_epoch(),
        ]);
    } catch (InvalidArgumentException $error) {
        api_json(400, ['error'=>$error->getMessage()]);
    }
}

function serve_templates_render(string $method): never {
    if ($method !== 'POST') {
        header('Allow: POST, OPTIONS');
        api_json(405, ['error'=>'Method not allowed.']);
    }
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') api_json(415, ['error'=>'Use application/json.']);
    $body = file_get_contents('php://input', false, null, 0, 262145);
    if ($body === false || strlen($body) > 262144) api_json(413, ['error'=>'Template request exceeds 256 KiB.']);
    try {
        $input = json_decode($body, false, 16, JSON_THROW_ON_ERROR);
        if (!$input instanceof stdClass || !is_string($input->fragment ?? null)) throw new InputError('Template request requires a fragment name.');
        $template = select_api_template_name($input->template ?? null);
        $values = [];
        if (isset($input->values)) {
            if (!$input->values instanceof stdClass) throw new InputError('Template values must be an object.');
            foreach (get_object_vars($input->values) as $key=>$value) {
                if (!is_string($value) && !is_numeric($value) && !is_bool($value)) throw new InputError('Template values must be scalar text.');
                $values[$key] = is_bool($value) ? ($value ? 'true' : 'false') : (string)$value;
            }
        }
        $html = render_api_html($template, $input->fragment, $values);
        http_response_code(200);
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        header('Content-Type: text/html; charset=utf-8');
        if ($method !== 'HEAD') echo $html;
        exit;
    } catch (JsonException) {
        api_json(400, ['error'=>'Malformed template JSON.']);
    } catch (InputError|InvalidArgumentException $error) {
        api_json(400, ['error'=>$error->getMessage()]);
    } catch (RuntimeException $error) {
        api_json(404, ['error'=>$error->getMessage()]);
    }
}
