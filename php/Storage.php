<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

final class InputError extends Exception {}
final class UnsupportedLogic extends Exception {}
final class EvaluationError extends Exception {}
final class LogicStorageError extends Exception {}

const DEFAULT_STATEMENT = '(apply_discount(double)(price) ≥ 80) ∧ ¬(tax > 15)';
const DEFAULT_LABELS = [
    ['id'=>'lbl_1','name'=>'price','value'=>'45','kind'=>'number'],
    ['id'=>'lbl_2','name'=>'tax','value'=>'8','kind'=>'number'],
    ['id'=>'lbl_3','name'=>'double','value'=>'λx. x * 2','kind'=>'lambda'],
    ['id'=>'lbl_4','name'=>'apply_discount','value'=>'λcb. λv. cb(v) - 10','kind'=>'lambda'],
];
const DEFAULT_CAUCHY = [
    'enabled'=>true, 'paramStyle'=>'directional', 'customParamNames'=>'left, right',
    'seedValues'=>'0, 1', 'recurrenceExpr'=>'(left + right) / 2',
    'maxIterations'=>24, 'epsilon'=>0.0001,
];
const DEFAULT_CALLBACKS = [
    ['id'=>'gcb_tax_fn','name'=>'tax_fn','params'=>['x'],'body'=>'x * 1.08','lambdaExpr'=>'λx. x * 1.08',
        'description'=>'Applies 8% tax multiplier to a numeric amount.','savedAt'=>'2026-01-01T00:00:00.000Z','source'=>'manual'],
    ['id'=>'gcb_apply_discount','name'=>'apply_discount','params'=>['amount','pct'],'body'=>'amount * (1 - pct / 100)',
        'lambdaExpr'=>'λamount. λpct. amount * (1 - pct / 100)','description'=>'Applies a percentage discount to an amount.',
        'savedAt'=>'2026-01-01T00:00:00.000Z','source'=>'manual'],
    ['id'=>'gcb_within_limit','name'=>'within_limit','params'=>['val','max_val'],'body'=>'val ≤ max_val',
        'lambdaExpr'=>'λval. λmax_val. val ≤ max_val','description'=>'Checks whether a value stays at or below a threshold.',
        'savedAt'=>'2026-01-01T00:00:00.000Z','source'=>'manual'],
];
const API_LANGUAGES = [
    ['json','jsonld','JSON-LD (Schema.org)','JSON-LD','.jsonld'],
    ['python','python','Python','Python','.py'],
    ['rust','rust','Rust','Rust','.rs'],
    ['wasm','wat','WASM / WABT','WASM','.wat'],
    ['typescript','typescript','TypeScript','TypeScript','.ts'],
    ['javascript','javascript','JavaScript (ESM)','JavaScript','.mjs'],
    ['go','go','Go','Go','.go'],
    ['java','java','Java','Java','.java'],
    ['cpp','cpp','C++ (C++20)','C++','.hpp'],
    ['csharp','csharp','C# (.NET)','C#','.cs'],
    ['php','php','PHP 8','PHP','.php'],
    ['sql','sql','SQL (DDL / Rules)','SQL','.sql'],
    ['swift','swift','Swift 6','Swift','.swift'],
    ['kotlin','kotlin','Kotlin','Kotlin','.kt'],
    ['ruby','ruby','Ruby 3','Ruby','.rb'],
    ['scala','scala','Scala 3','Scala','.scala'],
    ['haskell','haskell','Haskell','Haskell','.hs'],
    ['elixir','elixir','Elixir','Elixir','.ex'],
    ['lua','lua','Lua 5.4','Lua','.lua'],
    ['zig','zig','Zig','Zig','.zig'],
    ['dart','dart','Dart 3','Dart','.dart'],
    ['ocaml','ocaml','OCaml','OCaml','.ml'],
];

function app_effective_base(): string {
    $base = $GLOBALS['APP_EFFECTIVE_BASE'] ?? (defined('APP_BASE') ? APP_BASE : '/');
    return is_string($base) && $base !== '' ? $base : '/';
}

function api_links(string $route): array {
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $origin = preg_match('/^(?:[A-Za-z0-9.-]+|\[[0-9a-fA-F:]+\])(?::[0-9]{1,5})?$/D', $host) ? ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https://' : 'http://').$host) : '';
    $prefix = $origin . rtrim(app_effective_base(), '/');
    return ['self'=>['href'=>$prefix.$route,'method'=>'POST'],'logic'=>['href'=>$prefix.'/api/logic','method'=>'GET']];
}
function api_json(int $status, array $body, bool $hal = false): never {
    http_response_code($status);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Content-Type: '.($hal ? 'application/hal+json' : 'application/json').'; charset=utf-8');
    if ($hal && isset($body['_links'])) {
        $links = [];
        foreach ($body['_links'] as $rel=>$link) if (isset($link['href']) && is_string($link['href'])) {
            $links[] = '<'.$link['href'].'>; rel="'.$rel.'"';
        }
        if ($links) header('Link: '.implode(', ', $links));
    }
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

const STORAGE_SCHEMA_VERSION = 3;
const SESSION_ID_PATTERN = '/^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/D';

function api_session_id(): string {
    $raw = $_SERVER['HTTP_X_SESSION_ID'] ?? ($_GET['session'] ?? null);
    if (!is_string($raw) || trim($raw) === '') {
        return 'default';
    }
    $clean = trim($raw);
    if ($clean !== 'default' && !preg_match(SESSION_ID_PATTERN, $clean)) {
        throw new InputError('Invalid session id. Use 3-64 alphanumeric, underscore, or hyphen characters.', 400);
    }
    return $clean;
}

function storage_is_private_path(string $path): bool {
    if (PHP_OS_FAMILY === 'Windows') return true;
    $perms = @fileperms($path);
    return $perms !== false && ($perms & 0077) === 0;
}

function storage_run_migrations(PDO $db): void {
    $db->exec('CREATE TABLE IF NOT EXISTS schema_version (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, updated_at TEXT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS logic_state (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS cache_meta (id INTEGER PRIMARY KEY CHECK (id = 1), epoch INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS session_states (session_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS session_history (session_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)');
    $current = (int)($db->query('SELECT version FROM schema_version WHERE id = 1')->fetchColumn() ?: 0);
    $now = gmdate('Y-m-d\TH:i:s') . '.000Z';
    if ($current < 1) {
        $stmt = $db->prepare('INSERT INTO schema_version (id, version, updated_at) VALUES (1, 1, ?) ON CONFLICT(id) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at');
        $stmt->execute([$now]);
        $current = 1;
    }
    if ($current < 2) {
        $db->prepare('INSERT OR IGNORE INTO cache_meta (id, epoch, updated_at) VALUES (1, 1, ?)')->execute([$now]);
        $stmt = $db->prepare('UPDATE schema_version SET version = 2, updated_at = ? WHERE id = 1');
        $stmt->execute([$now]);
        $current = 2;
    }
    if ($current < 3) {
        $stmt = $db->prepare('UPDATE schema_version SET version = ?, updated_at = ? WHERE id = 1');
        $stmt->execute([STORAGE_SCHEMA_VERSION, $now]);
    }
}

function storage_cache_epoch(?PDO $db): int {
    if ($db === null) return 1;
    try {
        $epoch = $db->query('SELECT epoch FROM cache_meta WHERE id = 1')->fetchColumn();
        return $epoch !== false ? max(1, (int)$epoch) : 1;
    } catch (PDOException) {
        return 1;
    }
}

function storage_bump_cache_epoch(?PDO $db): int {
    if ($db === null) return 1;
    try {
        $now = gmdate('Y-m-d\TH:i:s') . '.000Z';
        $db->prepare('INSERT INTO cache_meta (id, epoch, updated_at) VALUES (1, 2, ?) ON CONFLICT(id) DO UPDATE SET epoch = epoch + 1, updated_at = excluded.updated_at')->execute([$now]);
        return storage_cache_epoch($db);
    } catch (PDOException) {
        return 1;
    }
}

function logic_store(): ?PDO {
    $directory = getenv('GRAMMAR2JSON_STATE_DIR');
    if ($directory === '' || (array_key_exists('GRAMMAR2JSON_STATE_DIR', $_SERVER) && $_SERVER['GRAMMAR2JSON_STATE_DIR'] === '')) {
        return null;
    }
    $webRoot = realpath(dirname(__DIR__)) ?: dirname(__DIR__);
    if ($directory === false) {
        $tmpBase = realpath(sys_get_temp_dir());
        if ($tmpBase === false || !is_dir($tmpBase) || !is_writable($tmpBase)) {
            return null;
        }
        $autoDir = rtrim($tmpBase, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'grammar2json-state-' . substr(hash('sha256', $webRoot), 0, 12);
        if (!file_exists($autoDir)) {
            $prevUmask = umask(0077);
            @mkdir($autoDir, 0700, true);
            umask($prevUmask);
        }
        if (is_link($autoDir) || !is_dir($autoDir)) {
            return null;
        }
        if (PHP_OS_FAMILY !== 'Windows') {
            @chmod($autoDir, 0700);
        }
        $resolvedAuto = realpath($autoDir);
        if ($resolvedAuto === false || $resolvedAuto === $webRoot || str_starts_with($resolvedAuto, $webRoot . DIRECTORY_SEPARATOR)) {
            return null;
        }
        $directory = $resolvedAuto;
    }
    $resolved = realpath($directory);
    $normalizedInput = rtrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $directory), DIRECTORY_SEPARATOR);
    $normalizedResolved = $resolved !== false ? rtrim($resolved, DIRECTORY_SEPARATOR) : '';
    if ($resolved === false || $normalizedInput !== $normalizedResolved || !is_dir($resolved) || is_link($directory)
        || $resolved === $webRoot || str_starts_with($resolved, $webRoot . DIRECTORY_SEPARATOR)
        || !is_writable($resolved) || !storage_is_private_path($resolved)
        || !extension_loaded('pdo_sqlite')) {
        throw new LogicStorageError('State directory must be a writable, private canonical directory outside the web root, with pdo_sqlite enabled.');
    }
    $file = $resolved . DIRECTORY_SEPARATOR . 'logic.sqlite3';
    if (is_link($file) || (file_exists($file) && (!is_file($file) || !storage_is_private_path($file)))) {
        throw new LogicStorageError('Logic state database must be a private regular file, not a symlink.');
    }
    $previous = umask(0077);
    try {
        $db = new PDO('sqlite:'.$file, null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT=>5]);
        $db->exec('PRAGMA journal_mode=WAL');
        $db->exec('PRAGMA busy_timeout=5000');
        $db->exec('PRAGMA synchronous=NORMAL');
        $db->exec('PRAGMA foreign_keys=ON');
        storage_run_migrations($db);
        return $db;
    } catch (PDOException $error) {
        error_log('Logic state database error: '.$error->getMessage());
        throw new LogicStorageError('Unable to access logic state database.');
    } finally {
        umask($previous);
    }
}

function logic_state(?PDO $db, ?string $sessionId = null): array {
    $defaults = ['statement'=>DEFAULT_STATEMENT, 'labels'=>DEFAULT_LABELS, 'cauchyConfig'=>DEFAULT_CAUCHY, 'callbacks'=>DEFAULT_CALLBACKS, 'modules'=>[]];
    if ($db === null) return $defaults;
    $sid = $sessionId ?? api_session_id();
    try {
        $stmt = $db->prepare('SELECT data FROM session_states WHERE session_id = ?');
        $stmt->execute([$sid]);
        $data = $stmt->fetchColumn();
        if ($data === false && $sid === 'default') {
            $data = $db->query('SELECT data FROM logic_state WHERE id = 1')->fetchColumn();
        }
        if ($data === false) return $defaults;
        $state = json_decode($data, true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($state) || !is_string($state['statement'] ?? null)
            || !is_array($state['labels'] ?? null) || !is_array($state['cauchyConfig'] ?? null)) {
            throw new LogicStorageError('Stored logic state is invalid.');
        }
        if (array_key_exists('callbacks', $state) && !is_array($state['callbacks'])) throw new LogicStorageError('Stored callback state is invalid.');
        return $state + ['callbacks'=>DEFAULT_CALLBACKS, 'modules'=>[]];
    } catch (PDOException|JsonException $error) {
        error_log('Logic state read error: '.$error->getMessage());
        throw new LogicStorageError('Unable to read logic state.');
    }
}

function callback_binding(string $name, string $expression, string $description, ?string $id = null): array {
    if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/D', $name)) throw new InputError('Callback name must be an identifier.');
    $expression = trim($expression);
    $ast = parse_logic($expression);
    if ($ast['type'] !== 'lambda') throw new InputError('Callback expression must be a lambda abstraction.');
    $params = [];
    while ($ast['type'] === 'lambda') {
        $params[] = $ast['name'];
        $ast = $ast['body'];
    }
    if (!preg_match('/^(?:(?:λ|\\\\)\s*[A-Za-z_][A-Za-z0-9_]*\s*\.\s*)+/u', $expression, $match)) {
        throw new InputError('Callback must begin with a lambda abstraction.');
    }
    $body = trim(substr($expression, strlen($match[0])));
    $callback = ['id'=>$id ?? 'gcb_'.bin2hex(random_bytes(12)), 'name'=>$name, 'params'=>$params,
        'body'=>$body, 'lambdaExpr'=>$expression, 'savedAt'=>gmdate('Y-m-d\TH:i:s').'.000Z', 'source'=>'manual'];
    if (trim($description) !== '') $callback['description'] = trim($description);
    return $callback;
}


function logic_mutate(?PDO $db, callable $update, ?callable $historyEvent = null, ?string $sessionId = null): array {
    if ($db === null) throw new LogicStorageError('Configure GRAMMAR2JSON_STATE_DIR to enable persistent logic updates.');
    $sid = $sessionId ?? api_session_id();
    $transaction = false;
    try {
        $db->exec('BEGIN IMMEDIATE');
        $transaction = true;
        $state = logic_state($db, $sid);
        if (empty($state['histolog'])) history_record($state, 'init', 'Initial REST/HATEOAS workspace');
        [$state, $result] = $update($state);
        if ($historyEvent !== null) {
            $event = $historyEvent($result);
            if ($event !== null) history_record($state, $event[0], $event[1]);
        }
        $encoded = json_encode($state, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $now = gmdate('Y-m-d\TH:i:s') . '.000Z';
        $db->prepare('INSERT INTO session_states (session_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
            ->execute([$sid, $encoded, $now]);
        if ($sid === 'default') {
            $db->prepare('INSERT INTO logic_state (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')->execute([$encoded]);
        }
        storage_bump_cache_epoch($db);
        $db->exec('COMMIT');
        $transaction = false;
        return $result;
    } catch (PDOException|JsonException $error) {
        error_log('Logic state write error: '.$error->getMessage());
        throw new LogicStorageError('Unable to save logic state.');
    } finally {
        if ($transaction) $db->exec('ROLLBACK');
    }
}

function logic_request_object(bool $allowEmpty = false): stdClass {
    $body = file_get_contents('php://input', false, null, 0, 262145);
    if ($body === false || strlen($body) > 262144) throw new InputError('Logic state request exceeds 256 KiB.');
    if ($allowEmpty && $body === '') return new stdClass();
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') throw new InputError('Use application/json.');
    try { $input = json_decode($body, false, 32, JSON_THROW_ON_ERROR); }
    catch (JsonException) { throw new InputError('Malformed JSON request body.'); }
    if (!$input instanceof stdClass) throw new InputError('Request body must be an object.');
    return $input;
}

function logic_links(string $route, string $method = 'GET'): array {
    $links = api_links($route);
    $links['self']['method'] = $method;
    return $links;
}


function history_stable_json(mixed $value): string {
    if ($value instanceof stdClass) {
        $entries = (array)$value; ksort($entries, SORT_STRING); $parts = [];
        foreach ($entries as $key=>$item) $parts[] = history_stable_json((string)$key).':'.history_stable_json($item);
        return '{'.implode(',', $parts).'}';
    }
    if (is_array($value)) return '['.implode(',', array_map('history_stable_json', $value)).']';
    return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS);
}
function history_fingerprint(stdClass $snapshot): string {
    $labels = [];
    foreach ($snapshot->logicLabels as $label) $labels[] = (object)['name'=>$label->name, 'kind'=>$label->kind, 'value'=>$label->value];
    $data = clone $snapshot;
    $data->logicLabels = $labels; $data->virtualFiles = $snapshot->virtualFiles ?? new stdClass();
    $encoded = history_stable_json($data); $hash = 0x811c9dc5; $length = strlen($encoded);
    for ($i = 0; $i < $length;) {
        $byte = ord($encoded[$i++]);
        if ($byte < 0x80) $code = $byte;
        elseif ($byte < 0xe0) $code = (($byte & 0x1f) << 6) | (ord($encoded[$i++]) & 0x3f);
        elseif ($byte < 0xf0) $code = (($byte & 0x0f) << 12) | ((ord($encoded[$i++]) & 0x3f) << 6) | (ord($encoded[$i++]) & 0x3f);
        else $code = (($byte & 0x07) << 18) | ((ord($encoded[$i++]) & 0x3f) << 12) | ((ord($encoded[$i++]) & 0x3f) << 6) | (ord($encoded[$i++]) & 0x3f);
        $units = $code <= 0xffff ? [$code] : [0xd800 + (($code - 0x10000) >> 10), 0xdc00 + (($code - 0x10000) & 0x3ff)];
        foreach ($units as $unit) $hash = (($hash ^ $unit) * 0x01000193) & 0xffffffff;
    }
    return sprintf('%08x', $hash);
}
function history_snapshot(array $state): stdClass {
    $workspace = workspace_default($state);
    $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
    $json = grammar_schema_json($rules, $workspace);
    $ordered = $rules;
    usort($ordered, function ($a, $b) use ($workspace) {
        return (($workspace->ruleConfigs->{$a['name']}->precedence ?? $a['lineNumber'])
            <=> ($workspace->ruleConfigs->{$b['name']}->precedence ?? $b['lineNumber']))
            ?: ($a['lineNumber'] <=> $b['lineNumber']);
    });
    return (object)['grammarText'=>$workspace->grammarText, 'dialect'=>$workspace->dialect, 'jsonText'=>$json,
        'mutations'=>$workspace->mutations, 'ruleConfigs'=>$workspace->ruleConfigs, 'evalRule'=>$workspace->evalRule,
        'evalPayload'=>$workspace->evalPayload, 'logicStatement'=>$workspace->logicStatement,
        'logicLabels'=>array_map(fn($label) => (object)$label, $workspace->logicLabels), 'dslSource'=>$workspace->dslSource,
        'pythonSource'=>workspace_python_source($ordered, $workspace), 'rustSource'=>workspace_rust_source($ordered, $workspace),
        'watSource'=>workspace_wat_source($ordered, $workspace)];
}
function history_fields(stdClass $snapshot): array {
    $mutationLines = []; $mutations = (array)$snapshot->mutations; ksort($mutations, SORT_STRING);
    foreach ($mutations as $key=>$mutation) {
        $pattern = ($mutation->patternOverride ?? '') !== '' ? ' /'.$mutation->patternOverride.'/' : '';
        $target = ($mutation->targetProperty ?? '') !== '' ? ' -> '.$mutation->targetProperty : '';
        $status = ($mutation->enabled ?? false) ? '' : ' [disabled]';
        $mutationLines[] = "$key$target : $mutation->jsonType$pattern$status";
    }
    $configLines = []; $configs = (array)$snapshot->ruleConfigs; ksort($configs, SORT_STRING);
    foreach ($configs as $name=>$config) {
        $props = array_map(fn($p) => $p->name.'='.$p->value, $config->properties ?? []);
        $configLines[] = "  $name: prec=$config->precedence assoc=$config->associativity".($props ? ' {'.implode(', ', $props).'}' : '');
    }
    $logic = ['statement: '.$snapshot->logicStatement];
    foreach ($snapshot->logicLabels as $label) $logic[] = "  $label->name ($label->kind) := $label->value";
    $dialect = $snapshot->dialect;
    $grammar = ['# dialect='.$dialect->preset.' op="'.$dialect->ruleOperator.'" choice="'.$dialect->choiceDelimiter.'"'];
    $grammarText = rtrim($snapshot->grammarText);
    if ($grammarText !== '') $grammar[] = $grammarText;
    if ($configLines) $grammar[] = "\n# rule_configs\n".implode("\n", $configLines);
    return ['grammar'=>implode("\n", $grammar), 'mutations'=>$mutationLines ? implode("\n", $mutationLines) : '(no line mutations)',
        'jsonld'=>rtrim($snapshot->jsonText), 'logic'=>implode("\n", $logic),
        'evaluator'=>'start_rule: '.$snapshot->evalRule."\npayload: ".$snapshot->evalPayload."\ndialect: ".$dialect->preset.' (op="'.$dialect->ruleOperator.'", choice="'.$dialect->choiceDelimiter.'")',
        'dsl'=>rtrim($snapshot->dslSource), 'python'=>rtrim($snapshot->pythonSource), 'rust'=>rtrim($snapshot->rustSource),
        'wat'=>rtrim($snapshot->watSource), 'virtualFiles'=>'{}'];
}
function history_line_diff(string $before, string $after): array {
    $a = $before === '' ? [] : explode("\n", str_replace("\r\n", "\n", $before));
    $b = $after === '' ? [] : explode("\n", str_replace("\r\n", "\n", $after));
    $start = 0; $lengthA = count($a); $lengthB = count($b);
    while ($start < $lengthA && $start < $lengthB && $a[$start] === $b[$start]) ++$start;
    $endA = $lengthA - 1; $endB = $lengthB - 1;
    while ($endA >= $start && $endB >= $start && $a[$endA] === $b[$endB]) { --$endA; --$endB; }
    $lines = []; $added = 0; $removed = 0;
    for ($i = 0; $i < $start; ++$i) $lines[] = ['kind'=>'context','oldLine'=>$i+1,'newLine'=>$i+1,'text'=>$a[$i]];
    $m = max(0, $endA - $start + 1); $n = max(0, $endB - $start + 1);
    $i = 0; $j = 0;
    if ($m * $n <= 45000) {
        $dp = array_fill(0, $m + 1, array_fill(0, $n + 1, 0));
        for ($i = $m - 1; $i >= 0; --$i) for ($j = $n - 1; $j >= 0; --$j) {
            $dp[$i][$j] = $a[$start+$i] === $b[$start+$j] ? $dp[$i+1][$j+1] + 1 : max($dp[$i+1][$j], $dp[$i][$j+1]);
        }
        $i = 0; $j = 0;
        while ($i < $m && $j < $n) {
            if ($a[$start+$i] === $b[$start+$j]) {
                $lines[] = ['kind'=>'context','oldLine'=>$start+$i+1,'newLine'=>$start+$j+1,'text'=>$a[$start+$i]];
                ++$i; ++$j;
            } elseif ($dp[$i+1][$j] >= $dp[$i][$j+1]) {
                $lines[] = ['kind'=>'removed','oldLine'=>$start+$i+1,'newLine'=>null,'text'=>$a[$start+$i++]]; ++$removed;
            } else {
                $lines[] = ['kind'=>'added','oldLine'=>null,'newLine'=>$start+$j+1,'text'=>$b[$start+$j++]]; ++$added;
            }
        }
    }
    while ($i < $m) { $lines[] = ['kind'=>'removed','oldLine'=>$start+$i+1,'newLine'=>null,'text'=>$a[$start+$i++]]; ++$removed; }
    while ($j < $n) { $lines[] = ['kind'=>'added','oldLine'=>null,'newLine'=>$start+$j+1,'text'=>$b[$start+$j++]]; ++$added; }
    for ($i = $endA + 1, $j = $endB + 1; $i < $lengthA && $j < $lengthB; ++$i, ++$j) {
        $lines[] = ['kind'=>'context','oldLine'=>$i+1,'newLine'=>$j+1,'text'=>$a[$i]];
    }
    return ['added'=>$added,'removed'=>$removed,'unchanged'=>count($lines)-$added-$removed,'lines'=>$lines];
}
function history_diff(stdClass $from, stdClass $to): array {
    $before = history_fields($from); $after = history_fields($to); $results = [];
    foreach (HISTORY_FIELDS as $field=>$label) {
        $diff = history_line_diff($before[$field], $after[$field]);
        $results[] = ['field'=>$field,'label'=>$label,'changed'=>$diff['added'] > 0 || $diff['removed'] > 0, ...$diff];
    }
    return $results;
}
function history_symbols(?stdClass $from, stdClass $to): array {
    $extract = static function (stdClass $snapshot): array {
        $map = []; $operator = $snapshot->dialect->ruleOperator;
        foreach (explode("\n", str_replace("\r\n", "\n", $snapshot->grammarText)) as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || str_starts_with($line, '//') || str_starts_with($line, ';;')) continue;
            if (trim($operator) !== '') {
                $pos = strpos($line, $operator);
                if ($pos !== false && $pos > 0) $map[trim(trim(substr($line, 0, $pos)), '<>')] = trim(substr($line, $pos + strlen($operator)));
            } elseif (preg_match('/^([A-Za-z_<>][\w<>-]*)\s+(.+)$/', $line, $m)) $map[trim($m[1], '<>')] = trim($m[2]);
        }
        return $map;
    };
    $nextRules = $extract($to); $oldRules = $from ? $extract($from) : []; $touched = [];
    foreach ($nextRules as $name=>$expr) if (!array_key_exists($name, $oldRules) || $oldRules[$name] !== $expr) $touched[$name] = true;
    foreach ($oldRules as $name=>$expr) if (!array_key_exists($name, $nextRules)) $touched[$name] = true;
    foreach (['mutations','ruleConfigs'] as $field) {
        if ($from === null && $field === 'ruleConfigs') continue;
        $old = $from ? (array)$from->$field : []; $next = (array)$to->$field;
        foreach (array_unique([...array_keys($old), ...array_keys($next)]) as $name) {
            if (!array_key_exists($name, $old) || !array_key_exists($name, $next) || history_stable_json($old[$name]) !== history_stable_json($next[$name])) $touched[$name] = true;
        }
    }
    $oldLabels = []; $nextLabels = [];
    if ($from) foreach ($from->logicLabels as $label) $oldLabels[trim($label->name)] = $label->kind.':'.$label->value;
    foreach ($to->logicLabels as $label) $nextLabels[trim($label->name)] = $label->kind.':'.$label->value;
    foreach (array_unique([...array_keys($oldLabels), ...array_keys($nextLabels)]) as $name) {
        if ($name !== '' && ($oldLabels[$name] ?? null) !== ($nextLabels[$name] ?? null)) $touched[$name] = true;
    }
    if ($from && $from->evalRule !== $to->evalRule && trim($to->evalRule) !== '') $touched[trim($to->evalRule)] = true;
    $names = array_keys($touched); sort($names, SORT_STRING); return $names;
}
function history_entries(array $state): array {
    $entries = [];
    foreach ($state['histolog'] ?? [] as $encoded) {
        try { $entry = is_string($encoded) ? json_decode($encoded, false, 64, JSON_THROW_ON_ERROR) : null; }
        catch (JsonException $error) { throw new LogicStorageError('Stored history is invalid.'); }
        if (!$entry instanceof stdClass || !($entry->snapshot ?? null) instanceof stdClass) throw new LogicStorageError('Stored history is invalid.');
        $entries[] = $entry;
    }
    return $entries;
}
function history_record(array &$state, string $source, string $summary): stdClass {
    $entries = history_entries($state); $previous = $entries ? $entries[count($entries)-1] : null;
    $snapshot = history_snapshot($state); $fingerprint = history_fingerprint($snapshot);
    if ($previous && $previous->fingerprint === $fingerprint) return $previous;
    $generation = $previous ? $previous->generation + 1 : 0;
    $changed = []; $additions = 0; $deletions = 0;
    if ($previous) foreach (history_diff($previous->snapshot, $snapshot) as $diff) {
        if ($diff['changed']) { $changed[] = $diff['field']; $additions += $diff['added']; $deletions += $diff['removed']; }
    } else {
        $changed = ['grammar','mutations','jsonld','logic']; $fields = history_fields($snapshot);
        $additions = count(explode("\n", $fields['grammar'])) + count(explode("\n", $fields['mutations']));
    }
    $entry = (object)['id'=>"gen-$generation-$fingerprint", 'generation'=>$generation,
        'parentGeneration'=>$previous->generation ?? null, 'timestamp'=>gmdate('Y-m-d\TH:i:s').'.000Z',
        'source'=>$source, 'summary'=>$summary, 'fingerprint'=>$fingerprint, 'changedFields'=>$changed,
        'touchedSymbols'=>history_symbols($previous->snapshot ?? null, $snapshot), 'additions'=>$additions,
        'deletions'=>$deletions, 'snapshot'=>$snapshot];
    $state['histolog'][] = json_encode($entry, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS);
    $state['histolog'] = array_slice($state['histolog'], -60);
    return $entry;
}

function history_available(array $state): array {
    $entries = history_entries($state);
    if (!$entries) $entries[] = history_record($state, 'init', 'Initial REST/HATEOAS workspace');
    return $entries;
}
function history_index(array $entries): array {
    $generation = new stdClass(); $symbol = new stdClass(); $field = new stdClass(); $source = new stdClass();
    foreach (HISTORY_FIELDS as $key=>$label) $field->$key = [];
    $additions = 0; $deletions = 0;
    foreach ($entries as $entry) {
        $key = (string)$entry->generation; $generation->$key = $entry->id;
        $additions += $entry->additions; $deletions += $entry->deletions;
        foreach ($entry->touchedSymbols as $name) {
            $values = $symbol->$name ?? [];
            if (!in_array($entry->generation, $values, true)) $values[] = $entry->generation;
            $symbol->$name = $values;
        }
        foreach ($entry->changedFields as $name) {
            if (isset($field->$name) && !in_array($entry->generation, $field->$name, true)) $field->{$name}[] = $entry->generation;
        }
        $values = $source->{$entry->source} ?? [];
        if (!in_array($entry->generation, $values, true)) $values[] = $entry->generation;
        $source->{$entry->source} = $values;
    }
    $names = array_keys((array)$symbol); sort($names, SORT_STRING);
    return ['byGeneration'=>$generation, 'bySymbol'=>$symbol, 'byField'=>$field, 'bySource'=>$source,
        'totalGenerations'=>count($entries), 'totalAdditions'=>$additions, 'totalDeletions'=>$deletions, 'uniqueSymbols'=>$names];
}
function history_find(array $entries, int $generation): ?stdClass {
    foreach ($entries as $entry) if ($entry->generation === $generation) return $entry;
    return null;
}
function history_clear(array &$state, string $section): stdClass {
    history_record($state, 'pre_clear_checkpoint', "Checkpoint before clearing $section");
    $workspace = workspace_default($state);
    if ($section === 'all' || $section === 'grammar') $workspace->grammarText = '';
    if ($section === 'all' || $section === 'mutations') { $workspace->mutations = new stdClass(); $workspace->ruleConfigs = new stdClass(); }
    if ($section === 'all' || $section === 'logic') { $state['statement'] = ''; $state['labels'] = []; }
    if ($section === 'all' || $section === 'evaluator') { $workspace->evalRule = ''; $workspace->evalPayload = ''; }
    if ($section === 'all' || $section === 'dsl') $workspace->dslSource = '';
    if ($section === 'all' || $section === 'callbacks') $state['callbacks'] = [];
    $workspace->updatedAt = gmdate('Y-m-d\TH:i:s').'.000Z';
    save_active_workspace($state, $workspace);
    return history_record($state, 'engine_clear', 'Cleared '.($section === 'all' ? 'entire engine' : $section));
}
function history_restore(array &$state, int $generation, string $section): stdClass {
    $entry = history_find(history_entries($state), $generation);
    if ($entry === null) throw new InputError("Generation G$generation not found.", 404);
    $snapshot = $entry->snapshot; $workspace = workspace_default($state);
    if ($section === 'all' || $section === 'grammar') { $workspace->grammarText = $snapshot->grammarText; $workspace->dialect = $snapshot->dialect; }
    if ($section === 'all' || $section === 'mutations') { $workspace->mutations = $snapshot->mutations; $workspace->ruleConfigs = $snapshot->ruleConfigs; }
    if ($section === 'all' || $section === 'logic') {
        $state['statement'] = $snapshot->logicStatement;
        $state['labels'] = array_map(fn($label) => (array)$label, $snapshot->logicLabels);
    }
    if ($section === 'all' || $section === 'evaluator') { $workspace->evalRule = $snapshot->evalRule; $workspace->evalPayload = $snapshot->evalPayload; }
    if ($section === 'all' || $section === 'dsl') $workspace->dslSource = $snapshot->dslSource;
    $workspace->updatedAt = gmdate('Y-m-d\TH:i:s').'.000Z';
    save_active_workspace($state, $workspace);
    return history_record($state, 'histolog_restore', 'Restored '.($section === 'all' ? 'entire engine' : $section)." to G$generation");
}

// Generated from RestHateoasEngineStore's initial workspace; see the parity test.
const WORKSPACE_DEFAULT_JSON = <<<'WORKSPACE_DEFAULT'
{"id":"default","name":"OrderActionGrammar","dialect":{"preset":"ebnf","ruleOperator":"::=","choiceDelimiter":"|","commentPrefix":"//","symbols":{"oneOrMore":"+","zeroOrMore":"*","optional":"?","repeatBraces":"{}","groupParens":"()","charClassBrackets":"[]","posLookahead":"&","negLookahead":"!","posLookbehind":"(?<=","negLookbehind":"(?<!","wildcard":".","regexDelimiter":"/"}},"schemaConfig":{"preset":"hybrid","schemaOrgType":"DefinedTermSet","schemaName":"OrderActionGrammar","schemaStoreDraft":"https://json-schema.org/draft/2020-12/schema","includeJsonSchemaDefs":true,"includePotentialActions":true},"mutationPolicy":{"allowImportMutation":true,"allowExportMutation":true,"allowedTargets":["jsonld","python","rust","wasm"],"lockedRules":[]},"grammarText":"// Schema.org Order Action EBNF Grammar\norder_expr ::= action_verb ' ' item_code ' ' quantity\naction_verb ::= 'BUY' | 'RESERVE' | 'SHIP'\nitem_code ::= 'SKU-' digit digit digit\nquantity ::= digit+\ndigit ::= '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'","mutations":{"order_expr":{"ruleName":"order_expr","targetProperty":"order_expr","jsonType":"string","patternOverride":"","description":"Compiled from grammar rule 'order_expr' (1 branch)","enabled":true},"action_verb":{"ruleName":"action_verb","targetProperty":"action_verb","jsonType":"string","patternOverride":"^(BUY|RESERVE|SHIP)$","description":"Compiled from grammar rule 'action_verb' (3 branches)","enabled":true},"item_code":{"ruleName":"item_code","targetProperty":"item_code","jsonType":"string","patternOverride":"","description":"Compiled from grammar rule 'item_code' (1 branch)","enabled":true},"quantity":{"ruleName":"quantity","targetProperty":"quantity","jsonType":"string","patternOverride":"","description":"Compiled from grammar rule 'quantity' (1 branch)","enabled":true},"digit":{"ruleName":"digit","targetProperty":"digit","jsonType":"number","patternOverride":"^(0|1|2|3|4|5|6|7|8|9)$","description":"Compiled from grammar rule 'digit' (10 branches)","enabled":true}},"ruleConfigs":{"order_expr":{"precedence":1,"associativity":"left","properties":[]},"action_verb":{"precedence":2,"associativity":"left","properties":[]},"item_code":{"precedence":3,"associativity":"left","properties":[]},"quantity":{"precedence":4,"associativity":"left","properties":[]},"digit":{"precedence":5,"associativity":"left","properties":[]}},"evalRule":"order_expr","evalPayload":"BUY SKU-402 12","logicStatement":"(apply_discount(double)(price) ≥ 80) ∧ ¬(tax > 15)","logicLabels":[{"id":"lbl_1","name":"price","value":"45","kind":"number"},{"id":"lbl_2","name":"tax","value":"8","kind":"number"},{"id":"lbl_3","name":"double","value":"λx. x * 2","kind":"lambda"},{"id":"lbl_4","name":"apply_discount","value":"λcb. λv. cb(v) - 10","kind":"lambda"}],"cauchyConfig":{"enabled":true,"paramStyle":"directional","customParamNames":"left, right","seedValues":"0, 1","recurrenceExpr":"(left + right) / 2","maxIterations":24,"epsilon":0.0001},"dslSource":"# Grammar2JSON Studio — Industry Compiler Toolchain DSL Flow Definition\n# Format: FLOW <id> | step=<n> | stage=<frontend|formal|ir|codegen|storage> | page=<slug> | lang=<grammar|logic|json|python|rust|wasm|mcp> | verify=<rule> | next=<next_id> | label=<title>\n#\n# Implemented REST contract (served by server.ts, not a workflow/UI route):\n# POST /api/logic/evaluate, Content-Type: application/json or text/plain\n# Omitted/empty input uses the configured logic statement and label bindings.\n# Accepted inputs: statement text; [statement, labels] string pair (unless both\n# strings are numeric/boolean literals); positional literal arrays; or\n# {\"logic_statement\":\"...\", \"logic_labels\":\"...\"}.\n# logic_labels accepts name=value text, positional text/arrays, or a JSON object\n# (excess positional values use their _# position; collisions are errors).\n# string/object. New number/boolean names infer kind; callbacks require an\n# explicit {\"kind\":\"lambda\",\"value\":\"λx. ...\"} value. Legacy label bindings\n# remain supported. Invalid/ambiguous inputs return HTTP 400.\n\nFLOW FLOW_DIALECT     | step=1  | stage=frontend | page=dialect     | lang=grammar | verify=has_rules        | next=FLOW_RULE_PROPS  | label=1. Grammar & DAG\nFLOW FLOW_RULE_PROPS  | step=2  | stage=frontend | page=rule_props  | lang=grammar | verify=has_rules        | next=FLOW_LOGIC_CALC  | label=2. Rule Props & Ops\nFLOW FLOW_LOGIC_CALC  | step=3  | stage=formal   | page=logic_calc  | lang=logic   | verify=logic_ready      | next=FLOW_SCHEMA      | label=3. Logic & λ Calc\nFLOW FLOW_SCHEMA      | step=4  | stage=ir       | page=schema      | lang=json    | verify=valid_json       | next=FLOW_MUTATIONS   | label=4. Schema.org IR\nFLOW FLOW_MUTATIONS   | step=5  | stage=ir       | page=mutations   | lang=json    | verify=mutations_ready  | next=FLOW_EVALUATOR    | label=5. Schema Mutator\nFLOW FLOW_EVALUATOR   | step=6  | stage=ir       | page=evaluator   | lang=grammar | verify=eval_ready       | next=FLOW_PYTHON_AST  | label=6. Parser & Trace\nFLOW FLOW_PYTHON_AST  | step=7  | stage=codegen  | page=python_ast  | lang=python  | verify=py_ast_valid     | next=FLOW_RUST_AST    | label=7. Python AST\nFLOW FLOW_RUST_AST    | step=8  | stage=codegen  | page=rust_ast    | lang=rust    | verify=rust_ast_valid   | next=FLOW_WASM_WABT   | label=8. Rust syn AST\nFLOW FLOW_WASM_WABT   | step=9  | stage=codegen  | page=wasm_wabt   | lang=wasm    | verify=wasm_valid       | next=FLOW_MCP_SERVERS | label=9. WASM & WABT\nFLOW FLOW_MCP_SERVERS | step=10 | stage=codegen  | page=mcp_servers | lang=mcp     | verify=mcp_ready        | next=FLOW_PAYLOAD_IO  | label=10. MCP Servers\nFLOW FLOW_PAYLOAD_IO  | step=11 | stage=storage  | page=payload_io  | lang=json    | verify=bundle_ready     | next=FLOW_GDRIVE      | label=11. Package & I/O\nFLOW FLOW_GDRIVE      | step=12 | stage=storage  | page=gdrive      | lang=json    | verify=drive_ready      | next=FLOW_DIALECT     | label=12. Drive Vault\n\n# Bidirectional Language, Logic & Lazy MCP Mutation Graph\nEDGE grammar    <-> json       | codec=SchemaOrgJsonLdCompiler\nEDGE logic_calc <-> python_ast | codec=LambdaCalculusPythonCodec\nEDGE logic_calc <-> rust_ast   | codec=LambdaCalculusRustCodec\nEDGE logic_calc <-> wasm_wabt  | codec=LambdaCalculusWasmCodec\nEDGE json       <-> python_ast | codec=PythonAstLiteralEval\nEDGE json       <-> rust_ast   | codec=RustSynSerdeCodec\nEDGE rust_ast   <-> wasm_wabt  | codec=RustWasmBindgenCodec\nEDGE json       <-> wasm_wabt  | codec=WasmLinearMemoryData\nEDGE all_stages <-> mcp_server | codec=LazyBuildOnCallMcpCache"}
WORKSPACE_DEFAULT;

function workspace_default(array $state): stdClass {
    try { $workspace = json_decode(WORKSPACE_DEFAULT_JSON, false, 64, JSON_THROW_ON_ERROR); }
    catch (JsonException $error) { throw new LogicStorageError('Initial workspace is invalid.'); }
    if (!$workspace instanceof stdClass) throw new LogicStorageError('Initial workspace is invalid.');
    $installedAt = filemtime(__FILE__);
    if ($installedAt === false) throw new LogicStorageError('Unable to determine initial workspace timestamp.');
    $workspace->updatedAt = gmdate('Y-m-d\TH:i:s', $installedAt).'.000Z';
    if (isset($state['activeWorkspace'])) {
        try { $active = is_string($state['activeWorkspace']) ? json_decode($state['activeWorkspace'], false, 64, JSON_THROW_ON_ERROR) : null; }
        catch (JsonException $error) { throw new LogicStorageError('Stored active workspace is invalid.'); }
        if (!$active instanceof stdClass) throw new LogicStorageError('Stored active workspace is invalid.');
        foreach (['grammarText','updatedAt','evalRule','evalPayload','dslSource'] as $key) {
            if (!is_string($active->$key ?? null)) throw new LogicStorageError('Stored active workspace is invalid.');
            $workspace->$key = $active->$key;
        }
        foreach (['dialect','schemaConfig','mutationPolicy','mutations','ruleConfigs'] as $key) {
            if (!($active->$key ?? null) instanceof stdClass) throw new LogicStorageError('Stored active workspace is invalid.');
            $workspace->$key = $active->$key;
        }
    }
    $workspace->logicStatement = $state['statement'];
    $workspace->logicLabels = $state['labels'];
    $workspace->cauchyConfig = $state['cauchyConfig'];
    return $workspace;
}

function save_active_workspace(array &$state, stdClass $workspace): void {
    $active = new stdClass();
    foreach (['grammarText','updatedAt','evalRule','evalPayload','dslSource','dialect','schemaConfig','mutationPolicy','mutations','ruleConfigs'] as $key) {
        $active->$key = $workspace->$key;
    }
    $state['activeWorkspace'] = json_encode($active, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

