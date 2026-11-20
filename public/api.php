<?php
declare(strict_types=1);

/**
 * Shared file tree API. Mirrors the client virtual file tree on disk.
 *   GET  api.php?action=tree
 *   POST api.php?action=submit   {"workbench": "...", "files": [{"path": "...", "content": "..."}]}
 */
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$dataDir = __DIR__ . '/data';
$treeFile = $dataDir . '/tree.json';
const MAX_FILE_BYTES = 524288;
const MAX_FILES = 50;

function respond(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
    exit;
}

function safe_path(mixed $raw): ?string
{
    if (!is_string($raw)) {
        return null;
    }
    $p = ltrim(str_replace('\\', '/', $raw), '/');
    if ($p === '' || strlen($p) > 200 || !preg_match('#^[A-Za-z0-9_.\-/]+$#', $p)) {
        return null;
    }
    foreach (explode('/', $p) as $seg) {
        if ($seg === '' || $seg === '.' || $seg === '..') {
            return null;
        }
    }
    return $p;
}

if (!is_file($dataDir . '/config.json')) {
    respond(503, ['error' => 'not_installed', 'hint' => 'Open install.php first.']);
}

$tree = ['files' => [], 'seq' => 0];
if (is_file($treeFile)) {
    $decoded = json_decode((string) file_get_contents($treeFile), true);
    if (is_array($decoded) && isset($decoded['files']) && is_array($decoded['files'])) {
        $tree = $decoded;
    }
}

$action = $_GET['action'] ?? 'tree';

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'tree') {
    respond(200, $tree);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'submit') {
    // Custom header forces a CORS preflight, blocking cross-site form posts.
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'g2j') {
        respond(403, ['error' => 'forbidden']);
    }
    $raw = file_get_contents('php://input', false, null, 0, 8 * MAX_FILE_BYTES);
    $body = json_decode((string) $raw, true);
    $workbench = is_array($body) && is_string($body['workbench'] ?? null) ? $body['workbench'] : '';
    if (!preg_match('/^[a-z_]{1,40}$/', $workbench) || !is_array($body['files'] ?? null)) {
        respond(400, ['error' => 'bad_request']);
    }

    $changes = [];
    foreach (array_slice($body['files'], 0, MAX_FILES) as $f) {
        $path = safe_path($f['path'] ?? null);
        $content = $f['content'] ?? null;
        if ($path === null || !is_string($content) || strlen($content) > MAX_FILE_BYTES) {
            continue;
        }
        $prev = $tree['files'][$path] ?? null;
        if ($prev !== null && $prev['content'] === $content) {
            $changes[] = ['path' => $path, 'kind' => 'unchanged'];
            continue;
        }
        $tree['files'][$path] = [
            'path' => $path,
            'content' => $content,
            'source' => $workbench,
            'revision' => ($prev['revision'] ?? 0) + 1,
            'updatedAt' => gmdate('c'),
        ];
        $changes[] = ['path' => $path, 'kind' => $prev === null ? 'added' : 'modified'];
    }
    $tree['seq'] = ($tree['seq'] ?? 0) + 1;

    $fh = fopen($treeFile, 'c+');
    if ($fh === false || !flock($fh, LOCK_EX)) {
        respond(500, ['error' => 'write_failed']);
    }
    ftruncate($fh, 0);
    fwrite($fh, json_encode($tree, JSON_UNESCAPED_SLASHES));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);

    respond(200, ['ok' => true, 'seq' => $tree['seq'], 'changes' => $changes]);
}

respond(404, ['error' => 'unknown_action']);
