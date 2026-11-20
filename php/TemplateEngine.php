<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

const API_HTML_TEMPLATE_CONFIGS = [
    'studio' => ['name'=>'studio', 'title'=>'Grammar2JSON Studio', 'themeColor'=>'#2563eb', 'hardcodedDefault'=>true],
    'compact' => ['name'=>'compact', 'title'=>'Grammar Studio', 'themeColor'=>'#0f766e', 'hardcodedDefault'=>true],
];
const API_HTML_TEMPLATE_NAMES = ['studio', 'compact'];
const API_HTML_FRAGMENT_TEMPLATES = [
    'error' => '<main><h1 data-template-text="title">Request error</h1><p data-template-text="message"></p></main>',
    'notice' => '<aside role="status"><strong data-template-text="title">Notice</strong><p data-template-text="message"></p></aside>',
    'status' => '<main><h1 data-template-text="title">Status</h1><p data-template-text="message"></p></main>',
];

const DEFAULT_SLUG_ROUTES = [
    'home' => ['slug'=>'home', 'template'=>'studio', 'fragment'=>'document', 'enabled'=>true, 'hardcodedDefault'=>true],
    'studio' => ['slug'=>'studio', 'template'=>'studio', 'fragment'=>'document', 'enabled'=>true, 'hardcodedDefault'=>true],
    'compact' => ['slug'=>'compact', 'template'=>'compact', 'fragment'=>'document', 'enabled'=>true, 'hardcodedDefault'=>true],
    'help' => [
        'slug'=>'help', 'template'=>'studio', 'fragment'=>'status',
        'title'=>'Guided help',
        'message'=>'Choose a workbench and open its guided tour for illustrated steps.',
        'enabled'=>true, 'hardcodedDefault'=>true,
    ],
];

const DEFAULT_SLUG_PATTERNS = [
    'extended_node' => [
        'id'=>'extended_node', 'label'=>'Extended Node Slug',
        'pattern'=>'/nodes/{kind}/{nodeId}', 'targetTemplate'=>'/api/nodes/{kind}/{nodeId}',
        'description'=>'Canonical pretty route for any addressable node.',
        'enabled'=>true, 'hardcodedDefault'=>true,
    ],
    'extended_member' => [
        'id'=>'extended_member', 'label'=>'Extended Node Member Slug',
        'pattern'=>'/nodes/{kind}/{nodeId}/members/{member}', 'targetTemplate'=>'/api/nodes/{kind}/{nodeId}/members/{member}',
        'description'=>'Nested pretty route addressing an individual member on a node.',
        'enabled'=>true, 'hardcodedDefault'=>true,
    ],
    'short_member' => [
        'id'=>'short_member', 'label'=>'Short Isolated Member Slug',
        'pattern'=>'/members/{member}?node={kind}/{nodeId}', 'targetTemplate'=>'/api/nodes/{kind}/{nodeId}/members/{member}',
        'description'=>'Compact isolated member link carrying parent node identity in ?node=.',
        'enabled'=>true, 'hardcodedDefault'=>true,
    ],
    'template_fragment' => [
        'id'=>'template_fragment', 'label'=>'Template Fragment Route',
        'pattern'=>'/template/{template}/{fragment}', 'targetTemplate'=>'/api/templates/render?template={template}&fragment={fragment}',
        'description'=>'Content-negotiated (text/plain & text/html) template fragment route with ETag caching.',
        'enabled'=>true, 'hardcodedDefault'=>true,
    ],
];

function is_valid_template_identifier(mixed $name): bool {
    return is_string($name)
        && strlen($name) >= 1 && strlen($name) <= 64
        && (bool)preg_match('/^[a-z0-9][a-z0-9_-]*$/D', $name)
        && !str_contains($name, '..') && !str_contains($name, '/') && !str_contains($name, '\\');
}

function is_valid_slug_identifier(mixed $slug): bool {
    return is_string($slug)
        && strlen($slug) >= 1 && strlen($slug) <= 64
        && (bool)preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $slug);
}

function middleware_default_config(): array {
    $envBase = getenv('PRETTY_BASE_PATH');
    $basePath = is_string($envBase) && preg_match('~^/(?:[A-Za-z0-9_-]+/)*$~D', $envBase)
        ? $envBase
        : app_effective_base();
    $azureFlag = strtolower((string)(getenv('ENABLE_AZURE_SUPPORT') ?: 'false'));
    $awsFlag = strtolower((string)(getenv('ENABLE_AWS_SUPPORT') ?: 'false'));
    $fragments = [];
    foreach (API_HTML_FRAGMENT_TEMPLATES as $name => $markup) {
        $fragments[$name] = ['name'=>$name, 'markup'=>$markup, 'hardcodedDefault'=>true];
    }
    return [
        'version' => 1,
        'updatedAt' => '2026-01-01T00:00:00.000Z',
        'templates' => API_HTML_TEMPLATE_CONFIGS,
        'fragments' => $fragments,
        'slugRoutes' => DEFAULT_SLUG_ROUTES,
        'slugPatterns' => DEFAULT_SLUG_PATTERNS,
        'frontend' => [
            'prettyBasePath' => $basePath,
            'defaultTemplate' => defined('APP_TEMPLATE_NAME') ? APP_TEMPLATE_NAME : 'studio',
            'defaultTopView' => 'workbench',
            'enableOfflineBanner' => true,
            'enableProgressiveDisclosure' => true,
            'lazyLoadGuideMedia' => true,
            'cacheBustVersion' => 'v3',
            'azure' => [
                'enabled' => in_array($azureFlag, ['true', '1'], true),
                'foundryProjectEndpoint' => (string)(getenv('AZURE_FOUNDRY_PROJECT_ENDPOINT') ?: ''),
                'foundryApiVersion' => (string)(getenv('AZURE_FOUNDRY_API_VERSION') ?: '2025-05-01-preview'),
                'proprietaryModelDeployment' => (string)(getenv('AZURE_FOUNDRY_PROPRIETARY_MODEL') ?: 'gpt-4.1'),
                'openModelDeployment' => (string)(getenv('AZURE_FOUNDRY_OPEN_MODEL') ?: 'Llama-3.3-70B-Instruct'),
                'authMode' => 'managed_identity',
                'region' => (string)(getenv('AZURE_REGION') ?: 'eastus2'),
                'resourceGroup' => (string)(getenv('AZURE_RESOURCE_GROUP') ?: ''),
            ],
            'aws' => [
                'enabled' => in_array($awsFlag, ['true', '1'], true),
                'region' => (string)(getenv('AWS_REGION') ?: 'us-east-1'),
                'bedrockProprietaryModelId' => (string)(getenv('AWS_BEDROCK_PROPRIETARY_MODEL') ?: 'anthropic.claude-3-7-sonnet-20250219-v1:0'),
                'bedrockOpenModelId' => (string)(getenv('AWS_BEDROCK_OPEN_MODEL') ?: 'meta.llama3-3-70b-instruct-v1:0'),
                'agentCoreEndpoint' => (string)(getenv('AWS_AGENTCORE_ENDPOINT') ?: ''),
                's3Bucket' => (string)(getenv('AWS_S3_BUCKET') ?: ''),
                'authMode' => 'iam_role',
            ],
        ],
    ];
}

function middleware_active_config(?array $state = null): array {
    $defaults = middleware_default_config();
    if ($state === null) {
        try {
            $state = logic_state(logic_store());
        } catch (Throwable) {
            return $defaults;
        }
    }
    $stored = $state['middlewareConfig'] ?? null;
    if (!is_array($stored)) return $defaults;
    return [
        'version' => (int)($stored['version'] ?? 1),
        'updatedAt' => is_string($stored['updatedAt'] ?? null) ? $stored['updatedAt'] : $defaults['updatedAt'],
        'templates' => is_array($stored['templates'] ?? null) ? array_merge($defaults['templates'], $stored['templates']) : $defaults['templates'],
        'fragments' => is_array($stored['fragments'] ?? null) ? array_merge($defaults['fragments'], $stored['fragments']) : $defaults['fragments'],
        'slugRoutes' => is_array($stored['slugRoutes'] ?? null) ? $stored['slugRoutes'] : $defaults['slugRoutes'],
        'slugPatterns' => is_array($stored['slugPatterns'] ?? null) ? array_merge($defaults['slugPatterns'], $stored['slugPatterns']) : $defaults['slugPatterns'],
        'frontend' => is_array($stored['frontend'] ?? null)
            ? array_replace_recursive($defaults['frontend'], $stored['frontend'])
            : $defaults['frontend'],
    ];
}

function middleware_apply_patch(array $current, array $patch): array {
    $next = $current;
    $next['version'] = ((int)($current['version'] ?? 1)) + 1;
    $next['updatedAt'] = gmdate('Y-m-d\TH:i:s') . '.000Z';

    if (isset($patch['templates'])) {
        if (!is_array($patch['templates'])) throw new InputError('templates must be an object.');
        foreach ($patch['templates'] as $key => $cfg) {
            if (!is_valid_template_identifier((string)$key)) {
                throw new InputError("Invalid template identifier '$key'.");
            }
            if ($cfg === null) {
                if (isset(API_HTML_TEMPLATE_CONFIGS[$key])) $next['templates'][$key] = API_HTML_TEMPLATE_CONFIGS[$key];
                else unset($next['templates'][$key]);
                continue;
            }
            if (!is_array($cfg)) throw new InputError("Template '$key' must be an object.");
            $color = is_string($cfg['themeColor'] ?? null) && preg_match('/^#[0-9a-fA-F]{3,8}$/', $cfg['themeColor'])
                ? $cfg['themeColor'] : '#2563eb';
            $next['templates'][$key] = [
                'name' => (string)$key,
                'title' => substr((string)($cfg['title'] ?? $key), 0, 120),
                'themeColor' => $color,
                'hardcodedDefault' => isset(API_HTML_TEMPLATE_CONFIGS[$key]),
            ];
        }
    }

    if (isset($patch['fragments'])) {
        if (!is_array($patch['fragments'])) throw new InputError('fragments must be an object.');
        foreach ($patch['fragments'] as $key => $cfg) {
            if (!is_valid_template_identifier((string)$key)) {
                throw new InputError("Invalid fragment identifier '$key'.");
            }
            if ($cfg === null) {
                if (isset(API_HTML_FRAGMENT_TEMPLATES[$key])) {
                    $next['fragments'][$key] = ['name'=>$key, 'markup'=>API_HTML_FRAGMENT_TEMPLATES[$key], 'hardcodedDefault'=>true];
                } else {
                    unset($next['fragments'][$key]);
                }
                continue;
            }
            if (!is_array($cfg) || !is_string($cfg['markup'] ?? null)) throw new InputError("Fragment '$key' requires string markup.");
            $markup = trim($cfg['markup']);
            if ($markup === '' || strlen($markup) > 65536) throw new InputError("Fragment '$key' markup must be 1..65536 bytes.");
            if (preg_match('/<script\b|javascript:|on[a-z]+\s*=/i', $markup)) {
                throw new InputError("Fragment '$key' cannot contain inline scripts or event handlers.");
            }
            $next['fragments'][$key] = [
                'name' => (string)$key,
                'markup' => $markup,
                'hardcodedDefault' => isset(API_HTML_FRAGMENT_TEMPLATES[$key]),
            ];
        }
    }

    if (isset($patch['slugRoutes'])) {
        if (!is_array($patch['slugRoutes'])) throw new InputError('slugRoutes must be an object.');
        foreach ($patch['slugRoutes'] as $slug => $cfg) {
            if (!is_valid_slug_identifier((string)$slug)) {
                throw new InputError("Invalid route slug '$slug'.");
            }
            if ($cfg === null) {
                unset($next['slugRoutes'][$slug]);
                continue;
            }
            if (!is_array($cfg)) throw new InputError("Slug '$slug' must be an object.");
            $template = (string)($cfg['template'] ?? 'studio');
            $fragment = (string)($cfg['fragment'] ?? 'document');
            if (!isset($next['templates'][$template])) throw new InputError("Slug '$slug' references unknown template '$template'.");
            if ($fragment !== 'document' && !isset($next['fragments'][$fragment])) {
                throw new InputError("Slug '$slug' references unknown fragment '$fragment'.");
            }
            $entry = [
                'slug' => (string)$slug,
                'template' => $template,
                'fragment' => $fragment,
                'enabled' => ($cfg['enabled'] ?? true) !== false,
                'hardcodedDefault' => isset(DEFAULT_SLUG_ROUTES[$slug]),
            ];
            if (is_string($cfg['title'] ?? null)) $entry['title'] = substr($cfg['title'], 0, 160);
            if (is_string($cfg['message'] ?? null)) $entry['message'] = substr($cfg['message'], 0, 500);
            $next['slugRoutes'][$slug] = $entry;
        }
    }

    if (isset($patch['slugPatterns'])) {
        if (!is_array($patch['slugPatterns'])) throw new InputError('slugPatterns must be an object.');
        foreach ($patch['slugPatterns'] as $id => $cfg) {
            if (!is_valid_template_identifier((string)$id)) throw new InputError("Invalid slug pattern ID '$id'.");
            if ($cfg === null) {
                if (isset(DEFAULT_SLUG_PATTERNS[$id])) $next['slugPatterns'][$id] = DEFAULT_SLUG_PATTERNS[$id];
                else unset($next['slugPatterns'][$id]);
                continue;
            }
            if (!is_array($cfg)) throw new InputError("Slug pattern '$id' must be an object.");
            $pat = trim((string)($cfg['pattern'] ?? ''));
            $tgt = trim((string)($cfg['targetTemplate'] ?? ''));
            if (!str_starts_with($pat, '/') || str_contains($pat, '..') || str_contains($pat, '\\') || str_contains($pat, "\0")) {
                throw new InputError("Slug pattern '$id' has an unsafe pattern.");
            }
            if (!str_starts_with($tgt, '/') || str_contains($tgt, '..') || str_contains($tgt, '\\') || str_contains($tgt, "\0")) {
                throw new InputError("Slug pattern '$id' has an unsafe targetTemplate.");
            }
            $next['slugPatterns'][$id] = [
                'id' => (string)$id,
                'label' => substr((string)($cfg['label'] ?? $id), 0, 80),
                'pattern' => $pat,
                'targetTemplate' => $tgt,
                'description' => substr((string)($cfg['description'] ?? ''), 0, 300),
                'enabled' => ($cfg['enabled'] ?? true) !== false,
                'hardcodedDefault' => isset(DEFAULT_SLUG_PATTERNS[$id]),
            ];
        }
    }

    if (isset($patch['frontend'])) {
        if (!is_array($patch['frontend'])) throw new InputError('frontend must be an object.');
        $f = $patch['frontend'];
        if (isset($f['prettyBasePath'])) {
            if (!is_string($f['prettyBasePath']) || !preg_match('~^/(?:[A-Za-z0-9_-]+/)*$~D', $f['prettyBasePath'])) {
                throw new InputError('PRETTY_BASE_PATH must be / or a slash-terminated path of letters, digits, hyphens, and underscores.');
            }
            $next['frontend']['prettyBasePath'] = $f['prettyBasePath'];
        }
        if (isset($f['defaultTemplate'])) {
            if (!is_string($f['defaultTemplate']) || !isset($next['templates'][$f['defaultTemplate']])) {
                throw new InputError("Unknown default template.");
            }
            $next['frontend']['defaultTemplate'] = $f['defaultTemplate'];
        }
        foreach (['enableOfflineBanner', 'enableProgressiveDisclosure', 'lazyLoadGuideMedia'] as $boolKey) {
            if (isset($f[$boolKey]) && is_bool($f[$boolKey])) $next['frontend'][$boolKey] = $f[$boolKey];
        }
        if (isset($f['cacheBustVersion']) && is_string($f['cacheBustVersion']) && preg_match('/^[A-Za-z0-9._-]{1,32}$/', $f['cacheBustVersion'])) {
            $next['frontend']['cacheBustVersion'] = $f['cacheBustVersion'];
        }
        if (isset($f['azure']) && is_array($f['azure'])) {
            $next['frontend']['azure'] = array_merge($next['frontend']['azure'], $f['azure']);
            $next['frontend']['azure']['enabled'] = (bool)($next['frontend']['azure']['enabled'] ?? false);
        }
        if (isset($f['aws']) && is_array($f['aws'])) {
            $next['frontend']['aws'] = array_merge($next['frontend']['aws'], $f['aws']);
            $next['frontend']['aws']['enabled'] = (bool)($next['frontend']['aws']['enabled'] ?? false);
        }
    }

    return $next;
}

function select_api_template_name(mixed $requested = null): string {
    $mw = middleware_active_config();
    $defaultName = $mw['frontend']['defaultTemplate'] ?? (defined('APP_TEMPLATE_NAME') ? APP_TEMPLATE_NAME : 'studio');
    $name = is_string($requested) && $requested !== '' ? $requested : $defaultName;
    if (!is_valid_template_identifier($name) || !array_key_exists($name, $mw['templates'])) {
        throw new InvalidArgumentException('Unknown HTML template name.');
    }
    return $name;
}

function api_fragment_source(string $fragment): ?string {
    if (!is_valid_template_identifier($fragment)) return null;
    $mw = middleware_active_config();
    $entry = $mw['fragments'][$fragment] ?? null;
    if (is_array($entry) && is_string($entry['markup'] ?? null)) return $entry['markup'];
    return API_HTML_FRAGMENT_TEMPLATES[$fragment] ?? null;
}

function template_cache_epoch(): int {
    static $localEpoch = 1;
    try {
        $db = logic_store();
        if ($db !== null) return storage_cache_epoch($db);
    } catch (Throwable) {
    }
    return $localEpoch;
}

function template_etag(string $mediaType, string $templateName, string $fragment, string $payload): string {
    $epoch = template_cache_epoch();
    return '"' . hash('sha256', implode("\x1f", [$mediaType, (string)$epoch, $templateName, $fragment, $payload])) . '"';
}

function spa_document_root(string $baseDir): array {
    $sep = DIRECTORY_SEPARATOR;
    $distDir = $baseDir . $sep . 'dist';
    $distIndex = $distDir . $sep . 'index.html';
    $rootIndex = $baseDir . $sep . 'index.html';
    if (is_file($distIndex)) {
        if (!is_file($rootIndex)) {
            return [$distDir, true];
        }
        $rootHtml = @file_get_contents($rootIndex);
        if (is_string($rootHtml) && str_contains($rootHtml, '/src/main.tsx')) {
            return [$distDir, true];
        }
    }
    return [$baseDir, false];
}

function load_spa_document_html(string $baseDir, string $effectiveBase): ?string {
    [$spaRoot, $usingDistDir] = spa_document_root($baseDir);
    $indexPath = $spaRoot . DIRECTORY_SEPARATOR . 'index.html';
    if (!is_file($indexPath)) return null;
    $html = @file_get_contents($indexPath);
    if (!is_string($html) || $html === '') return null;
    if ($usingDistDir) {
        $distPrefix = rtrim($effectiveBase, '/') . '/dist/';
        $html = preg_replace(
            '~(\b(?:src|href)=["\'])/(assets/|icons/|manifest\.webmanifest|icon\.svg|sw\.js|boolean-logic-calculator\.html|schema-ebnf-predicate-studio\.html)~i',
            '$1' . $distPrefix . '$2',
            $html
        ) ?? $html;
    }
    return $html;
}

function render_api_html(string $templateName, string $fragment, array $values = [], ?string $document = null): string {
    $mw = middleware_active_config();
    $validTemplate = select_api_template_name($templateName);
    $config = $mw['templates'][$validTemplate];
    $source = $document ?? api_fragment_source($fragment);
    if (!is_string($source) || strlen($source) > 2097152) {
        throw new InvalidArgumentException('Unknown or oversized HTML template fragment.');
    }
    $docBaseAttrs = $document !== null ? [
        'data-app-base' => is_string($GLOBALS['APP_EFFECTIVE_BASE'] ?? null) ? $GLOBALS['APP_EFFECTIVE_BASE'] : app_effective_base(),
        'data-asset-base' => is_string($GLOBALS['APP_ASSET_BASE'] ?? null) ? $GLOBALS['APP_ASSET_BASE'] : app_effective_base(),
        'data-api-base' => is_string($GLOBALS['APP_API_BASE'] ?? null) ? $GLOBALS['APP_API_BASE'] : rtrim(app_effective_base(), '/'),
    ] : [];
    $epoch = template_cache_epoch();
    $cacheKey = 'grammar2json-html-v2:' . $epoch . ':' . hash('sha256', json_encode([$validTemplate, $fragment, $config, $values, $docBaseAttrs, hash('sha256', $source)], JSON_INVALID_UTF8_SUBSTITUTE));
    if (function_exists('apcu_fetch')) {
        $cached = apcu_fetch($cacheKey, $found);
        if ($found && is_string($cached)) return $cached;
    }
    static $memoryCache = [];
    if (array_key_exists($cacheKey, $memoryCache)) return $memoryCache[$cacheKey];
    $previous = libxml_use_internal_errors(true);
    $dom = new DOMDocument('1.0', 'UTF-8');
    $loaded = $dom->loadHTML('<?xml encoding="UTF-8">' . $source, LIBXML_NONET | LIBXML_COMPACT);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    if (!$loaded) throw new RuntimeException('Could not parse HTML template.');
    $xpath = new DOMXPath($dom);
    if ($document !== null) {
        $title = $xpath->query('//title')->item(0);
        if ($title) $title->textContent = $config['title'];
        $theme = $xpath->query('//meta[@name="theme-color"]')->item(0);
        if ($theme instanceof DOMElement) $theme->setAttribute('content', $config['themeColor']);
        $html = $xpath->query('/html')->item(0);
        if ($html instanceof DOMElement) {
            $html->setAttribute('data-template', $validTemplate);
            foreach ($docBaseAttrs as $attr => $val) {
                $html->setAttribute($attr, $val);
            }
        }
    }
    foreach ($xpath->query('//*[@data-template-text]') as $node) {
        if (!$node instanceof DOMElement) continue;
        $key = $node->getAttribute('data-template-text');
        if (array_key_exists($key, $values)) $node->textContent = (string)$values[$key];
    }
    $result = $dom->saveHTML();
    if (!is_string($result)) throw new RuntimeException('Could not serialize HTML template.');
    $result = preg_replace('/^<\?xml encoding="UTF-8">/', '', $result) ?? $result;
    if (count($memoryCache) > 256) $memoryCache = [];
    $memoryCache[$cacheKey] = $result;
    if (function_exists('apcu_store')) apcu_store($cacheKey, $result, 300);
    return $result;
}
