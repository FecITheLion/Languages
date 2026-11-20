import JSZip from 'jszip';
import type { OpenApiSpec, WorkspaceSnapshot } from '../types/studio';

export interface ProjectBundleFile {
  path: string;
  language: 'json' | 'dsl' | 'php' | 'css' | 'js';
  content: string;
}

export function buildPhpProjectFiles(
  openapi: OpenApiSpec,
  dslSource: string,
  snapshot: WorkspaceSnapshot
): ProjectBundleFile[] {
  const workflowEnginePhp = `<?php
declare(strict_types=1);

function load_openapi_spec(string $rootDir): array {
    $path = $rootDir . '/openapi.json';
    if (!is_file($path)) {
        return ['paths' => []];
    }
    $decoded = json_decode((string) file_get_contents($path), true);
    return is_array($decoded) ? $decoded : ['paths' => []];
}

function parse_dsl_flows(string $rootDir): array {
    $path = $rootDir . '/dsl/flows.dsl';
    $flows = [];
    $edges = [];
    if (!is_file($path)) {
        return ['flows' => $flows, 'edges' => $edges];
    }
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || str_starts_with($trimmed, '#')) {
            continue;
        }
        if (str_starts_with($trimmed, 'FLOW ')) {
            $parts = array_map('trim', explode('|', substr($trimmed, 5)));
            $id = array_shift($parts);
            $meta = ['id' => $id];
            foreach ($parts as $kv) {
                if (str_contains($kv, '=')) {
                    [$k, $v] = explode('=', $kv, 2);
                    $meta[trim($k)] = trim($v);
                }
            }
            $meta['step'] = (int) ($meta['step'] ?? 1);
            $flows[$meta['page'] ?? $id] = $meta;
        } elseif (str_starts_with($trimmed, 'EDGE ')) {
            $parts = array_map('trim', explode('|', substr($trimmed, 5)));
            $edges[] = [
                'relation' => $parts[0] ?? '',
                'codec' => str_replace('codec=', '', $parts[1] ?? '')
            ];
        }
    }
    uasort($flows, fn(array $a, array $b) => $a['step'] <=> $b['step']);
    return ['flows' => $flows, 'edges' => $edges];
}

function search_openapi_and_dsl(string $query, array $openapi, array $dsl): array {
    $q = strtolower(trim($query));
    $results = [];

    foreach (($openapi['paths'] ?? []) as $route => $methods) {
        foreach ($methods as $method => $op) {
            $haystack = strtolower(
                $route . ' ' .
                ($op['operationId'] ?? '') . ' ' .
                ($op['summary'] ?? '') . ' ' .
                ($op['x-dsl-flow'] ?? '') . ' ' .
                ($op['x-language'] ?? '') . ' ' .
                implode(' ', $op['tags'] ?? [])
            );
            if ($q === '' || str_contains($haystack, $q)) {
                $results[] = [
                    'kind' => 'OpenAPI Operation',
                    'title' => $op['summary'] ?? $route,
                    'route' => $route,
                    'method' => strtoupper($method),
                    'flow' => $op['x-dsl-flow'] ?? '',
                    'step' => $op['x-workbench-step'] ?? null,
                    'language' => $op['x-language'] ?? 'all'
                ];
            }
        }
    }

    foreach (($dsl['edges'] ?? []) as $edge) {
        $haystack = strtolower($edge['relation'] . ' ' . $edge['codec']);
        if ($q === '' || str_contains($haystack, $q)) {
            $results[] = [
                'kind' => 'DSL Mutation Edge',
                'title' => $edge['relation'],
                'route' => 'index.php?page=wasm_wabt',
                'method' => 'BIDI',
                'flow' => $edge['codec'],
                'step' => null,
                'language' => 'all'
            ];
        }
    }

    return $results;
}

function build_project_zip(string $rootDir): ?string {
    if (!class_exists('ZipArchive')) {
        return null;
    }
    $tmpZip = sys_get_temp_dir() . '/grammar2json_openapi_studio_' . time() . '.zip';
    $zip = new ZipArchive();
    if ($zip->open($tmpZip, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        return null;
    }

    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($rootDir, RecursiveDirectoryIterator::SKIP_DOTS)
    );
    foreach ($iterator as $file) {
        if ($file->isDir()) {
            continue;
        }
        $fullPath = $file->getPathname();
        $relPath = ltrim(str_replace('\\\\', '/', substr($fullPath, strlen($rootDir))), '/');
        if (str_ends_with($relPath, '.zip')) {
            continue;
        }
        $zip->addFile($fullPath, 'grammar2json-studio/' . $relPath);
    }
    $zip->close();
    return $tmpZip;
}

function handle_api_requests(string $rootDir, array $openapi, array $dsl): void {
    $api = $_GET['api'] ?? '';
    if ($api === '') {
        return;
    }

    if ($api === 'openapi') {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($openapi, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($api === 'dsl') {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($dsl, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($api === 'search') {
        header('Content-Type: application/json; charset=utf-8');
        $q = (string) ($_GET['q'] ?? '');
        $res = search_openapi_and_dsl($q, $openapi, $dsl);
        echo json_encode([
            'query' => $q,
            'count' => count($res),
            'results' => $res
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($api === 'zip') {
        $zipFile = build_project_zip($rootDir);
        if ($zipFile && is_file($zipFile)) {
            header('Content-Type: application/zip');
            header('Content-Disposition: attachment; filename="grammar2json_openapi_studio.zip"');
            header('Content-Length: ' . filesize($zipFile));
            readfile($zipFile);
            @unlink($zipFile);
            exit;
        }
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'PHP ZipArchive extension is not enabled on this server.']);
        exit;
    }
}
`;

  const indexPhp = `<?php
declare(strict_types=1);

$rootDir = __DIR__;
require_once $rootDir . '/includes/workflow_engine.php';

$openapi = load_openapi_spec($rootDir);
$dsl = parse_dsl_flows($rootDir);
handle_api_requests($rootDir, $openapi, $dsl);

$flows = $dsl['flows'];
$requestedPage = (string) ($_GET['page'] ?? 'dialect');
if (!isset($flows[$requestedPage])) {
    $requestedPage = 'dialect';
}
$currentFlow = $flows[$requestedPage];
$searchQuery = trim((string) ($_GET['q'] ?? ''));
$searchResults = $searchQuery !== '' ? search_openapi_and_dsl($searchQuery, $openapi, $dsl) : [];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grammar2JSON Studio — OpenAPI &amp; DSL Multi-Page Bidirectional Studio</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="assets/studio.css">
</head>
<body data-active-page="<?= htmlspecialchars($requestedPage, ENT_QUOTES) ?>" data-active-step="<?= (int) $currentFlow['step'] ?>">
    <div class="container-fluid py-4 px-4 studio-shell">
        <header class="studio-panel p-4 mb-4">
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
                <div>
                    <h1 class="h4 fw-bold mb-1">Grammar2JSON Studio</h1>
                    <p id="statusToastBanner" class="mb-0 small text-secondary">
                        Flow <?= htmlspecialchars($currentFlow['id']) ?> — Step <?= (int) $currentFlow['step'] ?> / <?= count($flows) ?>
                    </p>
                </div>
                <div class="d-flex flex-wrap gap-2">
                    <div class="btn-group" role="group">
                        <button type="button" onclick="selectPrimaryLanguage('json')" class="btn btn-sm btn-outline-primary active">JSON</button>
                        <button type="button" onclick="selectPrimaryLanguage('python')" class="btn btn-sm btn-outline-primary">Python</button>
                        <button type="button" onclick="selectPrimaryLanguage('wasm')" class="btn btn-sm btn-outline-primary">WASM / WABT</button>
                    </div>
                    <a href="index.php?api=zip" class="btn btn-sm btn-primary">Download ZIP</a>
                </div>
            </div>
            <form method="get" action="index.php" class="row g-2">
                <input type="hidden" name="page" value="<?= htmlspecialchars($requestedPage, ENT_QUOTES) ?>">
                <div class="col-md-9">
                    <input type="search" id="globalSearchInput" name="q" value="<?= htmlspecialchars($searchQuery, ENT_QUOTES) ?>" placeholder="Search OpenAPI operations, DSL flows, Python AST, WASM/WABT..." class="form-control">
                </div>
                <div class="col-md-3 d-flex gap-2">
                    <button type="submit" class="btn btn-primary flex-fill">Search</button>
                    <a href="index.php?api=openapi" target="_blank" class="btn btn-outline-secondary">OpenAPI</a>
                    <a href="index.php?api=dsl" target="_blank" class="btn btn-outline-secondary">DSL</a>
                </div>
            </form>
        </header>

        <div class="workbench-btn-grid mb-4">
            <?php foreach ($flows as $slug => $flow): ?>
                <a href="index.php?page=<?= urlencode($slug) ?>" class="wb-grid-card text-decoration-none <?= $slug === $requestedPage ? 'wb-step-outlined' : '' ?>">
                    <div class="small text-secondary font-mono"><?= htmlspecialchars($flow['lang']) ?></div>
                    <div class="fw-semibold"><?= htmlspecialchars($flow['label']) ?></div>
                </a>
            <?php endforeach; ?>
        </div>

        <div class="row g-4">
            <div class="col-xl-7">
                <section class="studio-panel p-4">
                    <?php
                    $pageFile = $rootDir . '/pages/' . $requestedPage . '.php';
                    if (is_file($pageFile)) {
                        include $pageFile;
                    }
                    ?>
                </section>
            </div>
            <div class="col-xl-5">
                <section class="studio-panel p-4 d-flex flex-column gap-3">
                    <h2 class="h6 fw-bold mb-0">Bidirectional Live Mirror</h2>
                    <textarea id="mainGrammarInput" rows="7" class="form-control font-mono"></textarea>
                    <textarea id="mainJsonEditor" rows="11" class="form-control font-mono"></textarea>
                </section>
            </div>
        </div>
    </div>
    <script>
        window.OPENAPI_SPEC = <?= json_encode($openapi, JSON_UNESCAPED_SLASHES) ?>;
        window.DSL_DATA = <?= json_encode($dsl, JSON_UNESCAPED_SLASHES) ?>;
        window.INITIAL_SNAPSHOT = <?= json_encode($snapshot, JSON_UNESCAPED_SLASHES) ?>;
    </script>
    <script src="assets/studio.js"></script>
</body>
</html>
`;

  const dialectPhp = `<div data-workbench-template="0" class="wb-page-root">
    <h3 class="h5 fw-bold mb-3">Step 1: Syntax Dialect &amp; Grammar Rules</h3>
    <div class="row g-3">
        <div class="col-md-6">
            <label for="dialectPreset" class="form-label small fw-semibold">Dialect Preset</label>
            <select id="dialectPreset" class="form-select">
                <option value="ebnf">EBNF Standard (::= | //)</option>
                <option value="bnf">Classic BNF (::= | #)</option>
                <option value="peg">PEG / Assignment (= / #)</option>
                <option value="python_peg">Python Grammar (PEG : | #)</option>
                <option value="wat_sexpr">WABT S-Expr Grammar (:= | ;;)</option>
            </select>
        </div>
        <div class="col-md-6">
            <label for="ruleOperator" class="form-label small fw-semibold">Rule Operator</label>
            <input type="text" id="ruleOperator" value="::=" class="form-control font-mono">
        </div>
        <div class="col-md-6">
            <label for="choiceDelimiter" class="form-label small fw-semibold">Choice Delimiter</label>
            <input type="text" id="choiceDelimiter" value="|" class="form-control font-mono">
        </div>
        <div class="col-md-6">
            <label for="commentPrefix" class="form-label small fw-semibold">Comment Prefix</label>
            <input type="text" id="commentPrefix" value="//" class="form-control font-mono">
        </div>
    </div>
</div>
`;

  const rulePropsPhp = `<div data-workbench-template="1" class="wb-page-root">
    <h3 class="h5 fw-bold mb-3">Step 2: Rule Properties, Order of Operations &amp; Language Export</h3>
    <p class="small text-secondary">Edit each grammar rule by name, expression value, custom properties, and operation order, then export in Grammar, JSON-LD, Python, Rust, WAT, or TypeScript.</p>
    <div id="rulePropsWorkbench" class="d-flex flex-column gap-2"></div>
</div>
`;

  const logicCalcPhp = `<div data-workbench-template="2" class="wb-page-root">
    <h3 class="h5 fw-bold mb-3">Step 3: Symbolic Logic, Arithmetic &amp; Lambda Calculus Calculator</h3>
    <p class="small text-secondary">Build and evaluate logic statements, labeled arithmetic, and lambda callbacks; export and parse across Python, JSON-LD, Rust, WABT, and WASM.</p>
    <div id="logicCalcWorkbench" class="d-flex flex-column gap-2"></div>
</div>
`;

  const schemaPhp = `<div data-workbench-template="1" class="wb-page-root">
    <h3 class="h5 fw-bold mb-3">Step 2: Schema.org &amp; SchemaStore Vocabulary</h3>
    <div class="row g-3">
        <div class="col-md-6">
            <label for="schemaOrgType" class="form-label small fw-semibold">Root Schema.org @type</label>
            <input type="text" id="schemaOrgType" value="DefinedTermSet" class="form-control">
        </div>
        <div class="col-md-6">
            <label for="schemaName" class="form-label small fw-semibold">Schema Name / $id</label>
            <input type="text" id="schemaName" value="CustomGrammarSchema" class="form-control">
        </div>
        <div class="col-12">
            <label for="schemaStoreDraft" class="form-label small fw-semibold">$schema Draft</label>
            <input type="text" id="schemaStoreDraft" value="https://json-schema.org/draft/2020-12/schema" class="form-control font-mono">
        </div>
    </div>
</div>
`;

  const mutationsPhp = `<div data-workbench-template="2" class="wb-page-root">
    <h3 class="h5 fw-bold mb-3">Step 3: Line-by-Line Mutation Calculator</h3>
    <div id="lineMutationsContainer" class="d-flex flex-column gap-2"></div>
</div>
`;

  const evaluatorPhp = `<div data-workbench-template="3" class="wb-page-root">
    <h3 class="h5 fw-bold mb-3">Step 4: Recursive Grammar Evaluator &amp; Trace</h3>
    <div class="mb-3">
        <label for="evalRuleInput" class="form-label small fw-semibold">Start Rule</label>
        <input type="text" id="evalRuleInput" class="form-control font-mono">
    </div>
    <div class="mb-3">
        <label for="evalPayloadInput" class="form-label small fw-semibold">Test Payload</label>
        <textarea id="evalPayloadInput" rows="4" class="form-control font-mono"></textarea>
    </div>
    <pre id="evalTraceOutput" class="preview-code-box"></pre>
</div>
`;

  const payloadIoPhp = `<div data-workbench-template="4" class="wb-page-root">
    <h3 class="h5 fw-bold mb-3">Step 5: Import / Export &amp; Payload Manager</h3>
    <p class="small text-secondary">Export or import unified .g2j.json workspaces, Python source, WAT text, and WASM binaries.</p>
    <div class="d-flex flex-wrap gap-2">
        <button type="button" onclick="exportWorkspace()" class="btn btn-primary btn-sm">Export Workspace (.g2j.json)</button>
        <a href="index.php?api=zip" class="btn btn-outline-primary btn-sm">Download Full Project ZIP</a>
    </div>
</div>
`;

  const gdrivePhp = `<div data-workbench-template="5" class="wb-page-root">
    <h3 class="h5 fw-bold mb-3">Step 6: Google Drive Cloud Sync</h3>
    <p class="small text-secondary">Authenticate with Google Drive to save, load, update, and delete .g2j.json workspace snapshots, or switch to the offline Demo Vault.</p>
    <div class="d-flex flex-wrap gap-2 mb-3">
        <button type="button" id="driveConnectBtn" class="btn btn-primary btn-sm">Sign in with Google</button>
        <button type="button" id="driveSaveBtn" class="btn btn-outline-primary btn-sm">Save Current Workspace</button>
    </div>
    <div id="driveVaultList" class="small text-secondary">Connect Google Drive or use the Demo Vault to manage snapshots.</div>
</div>
`;

  const pythonAstPhp = `<div data-workbench-template="6" class="wb-page-root">
    <h3 class="h5 fw-bold mb-3">Step 7: Python ast Bidirectional Workflow</h3>
    <label for="pySourceEditor" class="form-label small fw-semibold">Python Source (.py)</label>
    <textarea id="pySourceEditor" rows="8" class="form-control font-mono mb-3"></textarea>
    <label for="pyAstDump" class="form-label small fw-semibold">ast.dump(Module)</label>
    <pre id="pyAstDump" class="preview-code-box"></pre>
</div>
`;

  const rustAstPhp = `<div data-workbench-template="7" class="wb-page-root">
    <h3 class="h5 fw-bold mb-3">Step 8: Rust AST (syn / serde) Bidirectional Workflow</h3>
    <label for="rustSourceEditor" class="form-label small fw-semibold">Rust Source (.rs)</label>
    <textarea id="rustSourceEditor" rows="8" class="form-control font-mono mb-3"></textarea>
    <label for="rustAstDump" class="form-label small fw-semibold">syn::File AST Dump</label>
    <pre id="rustAstDump" class="preview-code-box"></pre>
</div>
`;

  const wasmWabtPhp = `<div data-workbench-template="8" class="wb-page-root">
    <h3 class="h5 fw-bold mb-3">Step 9: WASM &amp; WABT Bidirectional Workflow</h3>
    <label for="watSourceEditor" class="form-label small fw-semibold">WABT Text Format (.wat)</label>
    <textarea id="watSourceEditor" rows="10" class="form-control font-mono mb-3"></textarea>
    <label for="wasmHexPreview" class="form-label small fw-semibold">Compiled WASM Binary Hex</label>
    <pre id="wasmHexPreview" class="preview-code-box"></pre>
</div>
`;

  const studioCss = `:root {
  --bg: #f8fafc;
  --surface: #ffffff;
  --border: #e2e8f0;
  --ink: #0f172a;
  --accent: #2563eb;
}
body {
  background: var(--bg);
  color: var(--ink);
  font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif;
}
.studio-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.workbench-btn-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.wb-grid-card {
  display: block;
  padding: 14px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--ink);
}
.wb-step-outlined {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18);
}
.preview-code-box {
  background: #0f172a;
  color: #e2e8f0;
  padding: 12px;
  border-radius: 8px;
  font-size: 12px;
  max-height: 300px;
  overflow: auto;
}
`;

  const studioJs = `// Grammar2JSON Studio — Client Bidirectional State Bootstrap
(function () {
  const snap = window.INITIAL_SNAPSHOT || {};
  const grammarEl = document.getElementById('mainGrammarInput');
  const jsonEl = document.getElementById('mainJsonEditor');
  const pyEl = document.getElementById('pySourceEditor');
  const rustEl = document.getElementById('rustSourceEditor');
  const watEl = document.getElementById('watSourceEditor');

  if (grammarEl && snap.grammarText) grammarEl.value = snap.grammarText;
  if (jsonEl && snap.jsonText) jsonEl.value = snap.jsonText;
  if (pyEl && snap.pythonSource) pyEl.value = snap.pythonSource;
  if (rustEl && snap.rustSource) rustEl.value = snap.rustSource;
  if (watEl && snap.watSource) watEl.value = snap.watSource;

  window.selectPrimaryLanguage = function (lang) {
    const banner = document.getElementById('statusToastBanner');
    if (banner) banner.textContent = 'Active primary language switched to ' + lang.toUpperCase();
  };

  window.exportWorkspace = function () {
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (snap.name || 'grammar2json_workspace') + '.g2j.json';
    a.click();
    URL.revokeObjectURL(url);
  };
})();
`;

  const zipProjectPhp = `<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/workflow_engine.php';

$zipPath = build_project_zip(__DIR__);
if (!$zipPath || !is_file($zipPath)) {
    fwrite(STDERR, "Error: PHP ZipArchive extension is required to package grammar2json-studio.\\n");
    exit(1);
}

if (PHP_SAPI === 'cli') {
    $dest = __DIR__ . '/grammar2json_openapi_studio.zip';
    rename($zipPath, $dest);
    echo "Created archive: {$dest}\\n";
    exit(0);
}

header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="grammar2json_openapi_studio.zip"');
header('Content-Length: ' . filesize($zipPath));
readfile($zipPath);
@unlink($zipPath);
`;

  const mcpServersPhp = `<?php
// Step 10: Build-on-Call Cached MCP Tool Servers (per target)
?>
<section class="studio-card">
  <h2>10. MCP Tool Servers (Build-on-Call &amp; Cached)</h2>
  <p>Each compiler target exposes a lazy JSON-RPC 2.0 MCP endpoint at <code>api/mcp.php?server=&lt;target&gt;</code> that builds on call and caches by content hash.</p>
</section>
`;

  const apiMcpPhp = `<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

$server = preg_replace('/[^a-z0-9_]/', '', (string) ($_GET['server'] ?? 'grammar'));
$body = json_decode((string) file_get_contents('php://input'), true) ?: [];
$id = $body['id'] ?? null;
$method = (string) ($body['method'] ?? 'initialize');
$params = is_array($body['params'] ?? null) ? $body['params'] : [];
$cacheDir = sys_get_temp_dir() . '/g2j_mcp_cache';
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0775, true);

if ($method === 'initialize') {
    echo json_encode([
        'jsonrpc' => '2.0',
        'id' => $id,
        'result' => [
            'protocolVersion' => '2025-03-26',
            'serverInfo' => ['name' => "grammar2json-{$server}-mcp", 'version' => '2.2.0'],
            'capabilities' => ['tools' => ['listChanged' => false]],
            '_meta' => ['mode' => 'build-on-call-cached', 'server' => $server],
        ],
    ], JSON_PRETTY_PRINT);
    exit;
}

$cacheKey = hash('sha256', $server . ':' . $method . ':' . json_encode($params));
$cacheFile = "{$cacheDir}/{$cacheKey}.json";
if (is_file($cacheFile) && empty($params['arguments']['_bypassCache'])) {
    $cached = json_decode((string) file_get_contents($cacheFile), true);
    $cached['id'] = $id;
    $cached['result']['_meta']['cache'] = 'HIT';
    echo json_encode($cached, JSON_PRETTY_PRINT);
    exit;
}

$response = [
    'jsonrpc' => '2.0',
    'id' => $id,
    'result' => [
        'content' => [['type' => 'text', 'text' => json_encode(['server' => $server, 'method' => $method, 'params' => $params], JSON_PRETTY_PRINT)]],
        '_meta' => ['cache' => 'MISS', 'cacheKey' => substr($cacheKey, 0, 12), 'builtAt' => gmdate('c')],
    ],
];
@file_put_contents($cacheFile, json_encode($response));
echo json_encode($response, JSON_PRETTY_PRINT);
`;

  return [
    { path: 'grammar2json-studio/openapi.json', language: 'json', content: JSON.stringify(openapi, null, 2) },
    { path: 'grammar2json-studio/dsl/flows.dsl', language: 'dsl', content: dslSource },
    { path: 'grammar2json-studio/includes/workflow_engine.php', language: 'php', content: workflowEnginePhp },
    { path: 'grammar2json-studio/api/mcp.php', language: 'php', content: apiMcpPhp },
    { path: 'grammar2json-studio/index.php', language: 'php', content: indexPhp },
    { path: 'grammar2json-studio/pages/dialect.php', language: 'php', content: dialectPhp },
    { path: 'grammar2json-studio/pages/rule_props.php', language: 'php', content: rulePropsPhp },
    { path: 'grammar2json-studio/pages/logic_calc.php', language: 'php', content: logicCalcPhp },
    { path: 'grammar2json-studio/pages/schema.php', language: 'php', content: schemaPhp },
    { path: 'grammar2json-studio/pages/mutations.php', language: 'php', content: mutationsPhp },
    { path: 'grammar2json-studio/pages/evaluator.php', language: 'php', content: evaluatorPhp },
    { path: 'grammar2json-studio/pages/python_ast.php', language: 'php', content: pythonAstPhp },
    { path: 'grammar2json-studio/pages/rust_ast.php', language: 'php', content: rustAstPhp },
    { path: 'grammar2json-studio/pages/wasm_wabt.php', language: 'php', content: wasmWabtPhp },
    { path: 'grammar2json-studio/pages/mcp_servers.php', language: 'php', content: mcpServersPhp },
    { path: 'grammar2json-studio/pages/payload_io.php', language: 'php', content: payloadIoPhp },
    { path: 'grammar2json-studio/pages/gdrive.php', language: 'php', content: gdrivePhp },
    { path: 'grammar2json-studio/assets/studio.css', language: 'css', content: studioCss },
    { path: 'grammar2json-studio/assets/studio.js', language: 'js', content: studioJs },
    { path: 'grammar2json-studio/zip_project.php', language: 'php', content: zipProjectPhp },
    {
      path: 'grammar2json-studio/workspace.g2j.json',
      language: 'json',
      content: JSON.stringify(snapshot, null, 2),
    },
  ];
}

export async function downloadPhpProjectZip(
  openapi: OpenApiSpec,
  dslSource: string,
  snapshot: WorkspaceSnapshot
): Promise<{ fileCount: number; byteSize: number }> {
  const zip = new JSZip();
  const files = buildPhpProjectFiles(openapi, dslSource, snapshot);
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'grammar2json_openapi_studio.zip';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return { fileCount: files.length, byteSize: blob.size };
}
