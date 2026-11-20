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
const API_HTML_TEMPLATE_CONFIGS = [
    'studio' => ['title'=>'Grammar2JSON Studio', 'themeColor'=>'#2563eb'],
    'compact' => ['title'=>'Grammar Studio', 'themeColor'=>'#0f766e'],
];
const API_HTML_TEMPLATE_NAMES = ['studio', 'compact'];
const API_HTML_FRAGMENT_TEMPLATES = [
    'error' => '<main><h1 data-template-text="title">Request error</h1><p data-template-text="message"></p></main>',
    'notice' => '<aside role="status"><strong data-template-text="title">Notice</strong><p data-template-text="message"></p></aside>',
    'status' => '<main><h1 data-template-text="title">Status</h1><p data-template-text="message"></p></main>',
];

function select_api_template_name(mixed $requested = null): string {
    $name = is_string($requested) && $requested !== '' ? $requested : (defined('APP_TEMPLATE_NAME') ? APP_TEMPLATE_NAME : 'studio');
    if (!array_key_exists($name, API_HTML_TEMPLATE_CONFIGS)) throw new InvalidArgumentException('Unknown HTML template name.');
    return $name;
}

function render_api_html(string $templateName, string $fragment, array $values = [], ?string $document = null): string {
    $config = API_HTML_TEMPLATE_CONFIGS[select_api_template_name($templateName)];
    $source = $document ?? (API_HTML_FRAGMENT_TEMPLATES[$fragment] ?? null);
    if (!is_string($source) || strlen($source) > 2097152) throw new InvalidArgumentException('Unknown or oversized HTML template fragment.');
    $cacheKey = 'grammar2json-html-v1:' . hash('sha256', json_encode([$templateName, $fragment, $config, $values, hash('sha256', $source)], JSON_INVALID_UTF8_SUBSTITUTE));
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
        if ($html instanceof DOMElement) $html->setAttribute('data-template', $templateName);
    }
    foreach ($xpath->query('//*[@data-template-text]') as $node) {
        if (!$node instanceof DOMElement) continue;
        $key = $node->getAttribute('data-template-text');
        if (array_key_exists($key, $values)) $node->textContent = (string)$values[$key];
    }
    $result = $dom->saveHTML();
    if (!is_string($result)) throw new RuntimeException('Could not serialize HTML template.');
    $result = preg_replace('/^<\?xml encoding="UTF-8">/', '', $result) ?? $result;
    $memoryCache[$cacheKey] = $result;
    if (function_exists('apcu_store')) apcu_store($cacheKey, $result, 300);
    return $result;
}

final class LogicParser {
    private array $tokens = [];
    private int $position = 0;
    private int $depth = 0;
    private const MAP = [
        '<->'=>'↔','<=>'=>'↔','->'=>'→','=>'=>'→','&&'=>'∧','/\\'=>'∧',
        '||'=>'∨','\\/'=>'∨','!='=>'≠','<>'=>'≠','<='=>'≤','>='=>'≥','=='=>'=','**'=>'^',
        '!'=>'¬','~'=>'¬','&'=>'∧','|'=>'∨','−'=>'-','×'=>'*','·'=>'*','÷'=>'/',
        'and'=>'∧','or'=>'∨','xor'=>'⊕','not'=>'¬','implies'=>'→','iff'=>'↔','equiv'=>'≡',
        'lambda'=>'λ','\\'=>'λ','forall'=>'∀','exists'=>'∃','true'=>'⊤','false'=>'⊥',
    ];
    private const PRECEDENCE = ['↔'=>1,'≡'=>1,'→'=>2,'∨'=>3,'⊕'=>4,'∧'=>5,'='=>6,'≠'=>6,'<'=>6,'≤'=>6,'>'=>6,'≥'=>6,'+'=>7,'-'=>7,'*'=>8,'/'=>8,'%'=>8,'^'=>9];
    public function __construct(string $text) {
        if (strlen($text) > 16384 || !preg_match('//u', $text)) throw new UnsupportedLogic('Expression is too long or is not valid UTF-8.');
        $pattern = '~\G\s*(<->|<=>|->|=>|&&|/\\\\|\|\||\\\\/|!=|<>|<=|>=|==|\*\*|[0-9][0-9.]*|[A-Za-z_][A-Za-z0-9_]*|[λ\\\\.(),¬!~&∧|∨⊕→↔≡∀∃⊤⊥=≠<≤>≥+−*×·/÷%^\-])~u';
        // Use # as the delimiter because ~ is itself a supported operator.
        $pattern = '#' . substr($pattern, 1, -2) . '#u';
        $offset = 0; $length = strlen($text);
        while ($offset < $length) {
            if (preg_match('/\G\s*$/u', $text, $unused, 0, $offset)) break;
            if (!preg_match($pattern, $text, $match, 0, $offset)) throw new UnsupportedLogic('Unsupported or invalid logic syntax.');
            $offset += strlen($match[0]);
            $token = $match[1];
            $lower = strtolower($token);
            $this->tokens[] = self::MAP[$lower] ?? $token;
            if (count($this->tokens) > 2048) throw new UnsupportedLogic('Expression has too many tokens.');
        }
        $this->tokens[] = '';
    }
    private function peek(): string { return $this->tokens[$this->position]; }
    private function take(): string { return $this->tokens[$this->position++]; }
    private function expect(string $token): void { if ($this->take() !== $token) throw new UnsupportedLogic('Unsupported or invalid logic syntax.'); }
    private static function identifier(string $token): bool { return (bool) preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/D', $token); }
    public function parse(): array {
        $node = $this->expression();
        if ($this->peek() !== '') throw new UnsupportedLogic('Unsupported or invalid logic syntax.');
        return $node;
    }
    private function expression(int $min = 0): array {
        if (++$this->depth > 100) throw new UnsupportedLogic('Expression nesting limit exceeded.');
        $token = $this->take();
        if ($token === 'λ' || $token === '∀' || $token === '∃') {
            $names = [];
            while (self::identifier($this->peek())) {
                $names[] = $this->take();
                if ($this->peek() === ',') $this->take();
            }
            if (!$names || ($token === 'λ' && !in_array($this->peek(), ['.', '→'], true))) throw new UnsupportedLogic('Unsupported or invalid abstraction.');
            if ($this->peek() === '.' || ($token === 'λ' && $this->peek() === '→')) $this->take();
            $node = $this->expression();
            foreach (array_reverse($names) as $name) $node = ['type'=>$token === 'λ' ? 'lambda' : 'quantifier', 'name'=>$name, 'op'=>$token, 'body'=>$node];
        } elseif ($token === '¬' || $token === '-') {
            $node = ['type'=>'unary', 'op'=>$token, 'body'=>$this->expression(10)];
        } elseif ($token === '(') {
            $node = $this->expression(); $this->expect(')');
        } elseif ($token === '⊤' || $token === '⊥') {
            $node = ['type'=>'boolean', 'value'=>$token === '⊤'];
        } elseif (preg_match('/^[0-9]+(?:\.[0-9]*)?$/D', $token)) {
            $num = (float)$token;
            if (!is_finite($num)) throw new UnsupportedLogic('Non-finite number.');
            $node = ['type'=>'number','value'=>$num];
        } elseif (self::identifier($token)) {
            $node = ['type'=>'identifier', 'name'=>$token];
        } else throw new UnsupportedLogic('Unsupported or invalid logic syntax.');
        while (true) {
            if ($this->peek() === '(' && 11 >= $min) {
                $this->take(); $args = [];
                if ($this->peek() !== ')') {
                    $args[] = $this->expression();
                    while ($this->peek() === ',') { $this->take(); $args[] = $this->expression(); }
                }
                $this->expect(')');
                foreach ($args as $arg) $node = ['type'=>'call','callee'=>$node,'arg'=>$arg];
                continue;
            }
            $op = $this->peek(); $precedence = self::PRECEDENCE[$op] ?? 0;
            if (!$precedence || $precedence < $min) break;
            $this->take();
            $right = $this->expression($precedence + (in_array($op, ['→','^'], true) ? 0 : 1));
            $node = ['type'=>'binary','op'=>$op,'left'=>$node,'right'=>$right];
        }
        --$this->depth;
        return $node;
    }
}
function parse_logic(string $value): array { return (new LogicParser($value))->parse(); }
function numeric_literal(mixed $value): bool {
    return (is_int($value) || is_float($value)) && is_finite((float)$value) ||
        is_string($value) && (bool)preg_match('/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/D', trim($value)) && is_finite((float)$value);
}
function literal(mixed $value): bool { return is_string($value) || is_bool($value) || (is_int($value) || is_float($value)) && is_finite((float)$value); }
function literal_text(string $value): bool {
    return numeric_literal($value) || in_array(strtolower(trim($value)), ['true','false','⊤','⊥','1','0'], true);
}
function js_number(float $value): string {
    if (!is_finite($value)) throw new UnsupportedLogic('Non-finite numeric results are not supported.');
    if ($value == 0) return '0';
    ini_set('serialize_precision', '-1');
    $formatted = (string)json_encode($value);
    if (!str_contains($formatted, 'e')) return $formatted;
    [$mantissa, $exponent] = explode('e', $formatted);
    $power = (int)$exponent;
    $negative = str_starts_with($mantissa, '-');
    $mantissa = ltrim($mantissa, '-');
    if (abs($value) >= 1e21 || abs($value) < 1e-6) {
        $mantissa = rtrim(rtrim($mantissa, '0'), '.');
        return ($negative ? '-' : '').$mantissa.'e'.($power >= 0 ? '+' : '').$power;
    }
    $point = strpos($mantissa, '.');
    $decimal = ($point === false ? strlen($mantissa) : $point) + $power;
    $digits = str_replace('.', '', $mantissa);
    if ($decimal <= 0) $result = '0.'.str_repeat('0', -$decimal).$digits;
    elseif ($decimal >= strlen($digits)) $result = $digits.str_repeat('0', $decimal-strlen($digits));
    else $result = substr($digits, 0, $decimal).'.'.substr($digits, $decimal);
    if (str_contains($result, '.')) $result = rtrim(rtrim($result, '0'), '.');
    return ($negative ? '-' : '').$result;
}
function literal_string(mixed $value): string { return is_bool($value) ? ($value ? 'true' : 'false') : (is_string($value) ? trim($value) : js_number((float)$value)); }
function normalize_binding(string $name, mixed $raw, ?array $existing): array {
    if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/D', $name)) throw new InputError("Invalid logic label name '$name'. Use an identifier.");
    $kind = $existing['kind'] ?? null;
    if ($raw instanceof stdClass) {
        $fields = get_object_vars($raw);
        if (count($fields) !== 2 || !array_key_exists('kind', $fields) || !array_key_exists('value', $fields) || !in_array($fields['kind'], ['number','boolean','lambda'], true)) throw new InputError("Logic label '$name' object values must contain exactly a valid \"kind\" and \"value\".");
        $kind = $raw->kind; $raw = $raw->value;
    }
    if (!$kind) {
        if (is_bool($raw)) $kind = 'boolean';
        elseif (numeric_literal($raw)) $kind = 'number';
        elseif (is_string($raw) && in_array(strtolower(trim($raw)), ['true','false','⊤','⊥','1','0'], true)) $kind = 'boolean';
        else throw new InputError("Cannot infer a literal kind for new logic label '$name'; use a number, boolean, or { \"kind\": \"lambda\", \"value\": \"λx. ...\" }.");
    }
    if ($kind === 'lambda') {
        if (!is_string($raw) || !preg_match('/^(?:λ|\\\\)\s*[A-Za-z_][A-Za-z0-9_]*\s*\./u', trim($raw))) throw new InputError("Lambda label '$name' must have a non-empty λ/\\ abstraction value.");
        if (parse_logic($raw)['type'] !== 'lambda') throw new InputError("Lambda label '$name' must have a non-empty λ/\\ abstraction value.");
        $value = $raw;
    } elseif ($kind === 'boolean') {
        if (!literal($raw) || !in_array(strtolower(literal_string($raw)), ['true','false','⊤','⊥','1','0'], true)) throw new InputError("Boolean logic label '$name' must be true, false, 1, 0, ⊤, or ⊥.");
        $value = literal_string($raw);
    } else {
        if (!numeric_literal($raw)) throw new InputError("Numeric logic label '$name' must have a finite numeric literal value.");
        $value = literal_string($raw);
    }
    return ['id'=>$existing['id'] ?? 'input_'.$name, 'name'=>$name, 'kind'=>$kind, 'value'=>$value];
}
function merge_labels(array $entries, array $labels): array {
    $seen = [];
    foreach ($entries as [$name,$value]) {
        if (isset($seen[$name])) throw new InputError("Duplicate logic label '$name'.");
        $seen[$name] = true; $index = null;
        foreach ($labels as $i=>$label) if ($label['name'] === $name) { $index = $i; break; }
        $binding = normalize_binding((string)$name, $value, $index === null ? null : $labels[$index]);
        if ($index === null) $labels[] = $binding; else $labels[$index] = $binding;
        if (count($labels) > 64) throw new UnsupportedLogic('Too many labels.');
    }
    return $labels;
}
function positional_labels(array $values, array $labels): array {
    $targets = array_values(array_filter($labels, fn($l) => $l['kind'] !== 'lambda'));
    $entries = [];
    foreach ($values as $i=>$value) {
        if (!literal($value)) throw new InputError('Positional value '.($i+1).' must be a string, number, or boolean literal.');
        $name = $targets[$i]['name'] ?? '_'.($i+1);
        if (!isset($targets[$i])) foreach ($labels as $label) if ($label['name'] === $name) throw new InputError("Positional fallback '$name' conflicts with a configured label.");
        $entries[] = [$name, $value];
    }
    return merge_labels($entries, $labels);
}
function decode_label_token(string $token): string {
    if (str_starts_with($token, '"') && str_ends_with($token, '"')) {
        $decoded = json_decode($token); return is_string($decoded) ? $decoded : substr($token, 1, -1);
    }
    if (str_starts_with($token, "'") && str_ends_with($token, "'")) return substr($token, 1, -1);
    return $token;
}
function label_tokens(string $text): array {
    preg_match_all('/"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|[^\s,;]+/u', $text, $matches);
    return $matches[0];
}
function normalize_labels(mixed $value, array $labels, int $depth = 0): array {
    if ($depth > 10) throw new UnsupportedLogic('Label input nesting limit exceeded.');
    if (is_string($value)) {
        if (strlen($value) > 16384) throw new UnsupportedLogic('Label input is too long.');
        $text = trim($value);
        if ($text === '') return $labels;
        if ($text[0] === '"') {
            $decoded = json_decode($text);
            if (is_string($decoded) && $decoded !== $text) return normalize_labels($decoded, $labels, $depth+1);
        }
        if ($text[0] === '{' || $text[0] === '[') {
            $parsed = json_decode($text);
            if (json_last_error() !== JSON_ERROR_NONE) throw new InputError('"logic_labels" contains malformed JSON.');
            return normalize_labels($parsed, $labels, $depth+1);
        }
        $tokens = label_tokens($text); $named = 0;
        foreach ($tokens as $token) {
            if ((str_starts_with($token, '"') && !str_ends_with($token, '"')) || (str_starts_with($token, "'") && !str_ends_with($token, "'"))) throw new InputError('Invalid quoted value in "logic_labels".');
            if (preg_match('/^[^=]+=.*/', $token)) ++$named;
        }
        if ($named && $named !== count($tokens)) throw new InputError('Do not mix named and positional logic label values.');
        if (!$named) return positional_labels(array_map('decode_label_token', $tokens), $labels);
        $entries = [];
        foreach ($tokens as $token) {
            [$name,$raw] = explode('=', $token, 2); $name = trim($name); $raw = decode_label_token(trim($raw));
            if ($name === '' || $raw === '') throw new InputError("Invalid named logic label '$token'. Use name=value.");
            $entries[] = [$name,$raw];
        }
        return merge_labels($entries, $labels);
    }
    if (is_array($value)) {
        if (!$value) return $labels;
        $complete = true;
        foreach ($value as $v) if (!($v instanceof stdClass) || !isset($v->id,$v->name,$v->kind,$v->value) || !is_string($v->id) || !is_string($v->name) || !in_array($v->kind, ['number','boolean','lambda'], true) || !is_string($v->value)) { $complete = false; break; }
        if (!$complete) return positional_labels($value, $labels);
        if (count($value) > 64) throw new UnsupportedLogic('Too many labels.');
        $ids = []; $names = []; $out = [];
        foreach ($value as $v) {
            if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/D', $v->name)) throw new InputError('Label binding names must be valid identifiers.');
            if (trim($v->id) === '') throw new InputError('Label binding IDs must not be empty.');
            if (isset($ids[$v->id]) || isset($names[$v->name])) throw new InputError('Label binding arrays cannot contain duplicate IDs or names.');
            $ids[$v->id] = $names[$v->name] = true;
            $parsed = parse_logic($v->value);
            if ($v->kind === 'lambda' && (!preg_match('/^(?:λ|\\\\)\s*[A-Za-z_][A-Za-z0-9_]*\s*\./u', trim($v->value)) || $parsed['type'] !== 'lambda')) throw new InputError("Lambda label '$v->name' must contain a valid λ/\\ abstraction.");
            $out[] = ['id'=>$v->id, 'name'=>$v->name, 'kind'=>$v->kind, 'value'=>$v->value];
        }
        return $out;
    }
    if ($value instanceof stdClass) {
        if (count(get_object_vars($value)) > 64) throw new UnsupportedLogic('Too many labels.');
        $entries = []; foreach (get_object_vars($value) as $name=>$raw) $entries[] = [(string)$name,$raw];
        return merge_labels($entries, $labels);
    }
    throw new InputError('Logic labels must be text, a literal array, a label object, or a label-binding array.');
}
function normalized_input(mixed $raw, int $depth = 0, ?array $defaults = null): array {
    if ($depth > 10) throw new UnsupportedLogic('Input nesting limit exceeded.');
    $defaults ??= ['statement'=>DEFAULT_STATEMENT, 'labels'=>DEFAULT_LABELS];
    $statement = $defaults['statement']; $labels = $defaults['labels'];
    if ($raw === null || $raw === '' || $raw === []) return [$statement, $labels];
    if (is_string($raw)) {
        if (strlen($raw) > 16384) throw new UnsupportedLogic('Logic input is too long.');
        $text = trim($raw);
        if ($text === '') return [$statement, $labels];
        if (in_array($text[0], ['{','[','"'], true)) {
            $decoded = json_decode($text);
            if (json_last_error() !== JSON_ERROR_NONE) throw new InputError('Input looks like combined JSON but is malformed.');
            if ($decoded instanceof stdClass || is_array($decoded) || (is_string($decoded) && preg_match('/^[\[{]/', trim($decoded)))) return normalized_input($decoded, $depth+1, $defaults);
        }
        $tokens = label_tokens($text); $known = count($tokens) > 0;
        foreach ($tokens as $token) {
            $parts = explode('=', $token, 2); $found = false;
            if (count($parts) === 2 && trim($parts[1]) !== '') foreach ($labels as $label) if ($label['name'] === trim($parts[0])) $found = true;
            if (!$found) $known = false;
        }
        return [$known ? $statement : $raw, $known ? normalize_labels($text, $labels) : $labels];
    }
    if (is_array($raw)) {
        if (count($raw) === 2 && is_string($raw[0]) && is_string($raw[1]) && !(literal_text($raw[0]) && literal_text($raw[1]))) return [trim($raw[0]) !== '' ? $raw[0] : $statement, normalize_labels($raw[1], $labels)];
        foreach ($raw as $v) if (!literal($v)) throw new InputError('Input arrays must be a two-string [statement, labels] pair or an array of literal values.');
        return [$statement, positional_labels($raw, $labels)];
    }
    if (!($raw instanceof stdClass)) throw new InputError('Input must be an object, string, statement/labels pair, or literal array.');
    $fields = get_object_vars($raw); $allowed = ['statement','labels','logic_statement','logic_labels','input','values'];
    foreach ($fields as $key=>$v) if (!in_array($key, $allowed, true)) throw new InputError("Unknown logic input field '$key'.");
    $has = fn($key) => array_key_exists($key, $fields);
    if ($has('input') && count($fields) > 1) throw new InputError('Ambiguous input: "input" cannot be combined with statement, labels, or values fields.');
    if ($has('values') && count($fields) > 1) throw new InputError('Ambiguous input: "values" cannot be combined with statement or label fields.');
    if ($has('statement') && $has('logic_statement') && $fields['statement'] !== $fields['logic_statement']) throw new InputError('Ambiguous statement input: "statement" and "logic_statement" differ.');
    if ($has('labels') && $has('logic_labels')) throw new InputError('Ambiguous label input: use either "labels" or "logic_labels", not both.');
    if ($has('input')) return normalized_input($fields['input'], $depth+1, $defaults);
    $stmt = $fields['logic_statement'] ?? $fields['statement'] ?? null;
    if ($stmt !== null) {
        if (!is_string($stmt)) throw new InputError('The logic statement must be text.');
        if (trim($stmt) !== '') $statement = $stmt;
    }
    if ($has('values')) {
        if (!is_array($fields['values']) || count(array_filter($fields['values'], 'literal')) !== count($fields['values'])) throw new InputError('"values" must be an array of literal values.');
        $labels = positional_labels($fields['values'], $labels);
    } elseif ($has('logic_labels') || $has('labels')) $labels = normalize_labels($fields['logic_labels'] ?? $fields['labels'] ?? null, $labels);
    return [$statement, $labels];
}
function format_ast(array $node): string {
    return match ($node['type']) {
        'number' => js_number($node['value']),
        'boolean' => $node['value'] ? '⊤' : '⊥',
        'identifier' => $node['name'],
        'unary' => $node['op'] . ($node['body']['type'] === 'binary' ? '('.format_ast($node['body']).')' : format_ast($node['body'])),
        'binary' => '('.format_ast($node['left']).' '.$node['op'].' '.format_ast($node['right']).')',
        'lambda' => '(λ'.$node['name'].'. '.format_ast($node['body']).')',
        'quantifier' => '('.$node['op'].$node['name'].'. '.format_ast($node['body']).')',
        'call' => format_ast($node['callee']).'('.format_ast($node['arg']).')',
    };
}
function display_value(array $value): string {
    if ($value['kind'] === 'boolean') return $value['value'] ? '⊤ (true)' : '⊥ (false)';
    if ($value['kind'] === 'closure') return 'λ'.$value['name'].'. '.format_ast($value['body']);
    $number = $value['value'];
    if (floor($number) !== $number) {
        $scaled = abs($number * 1000000);
        if (empty($GLOBALS['cauchyEvaluation']) && $scaled < 1e15 && abs(($scaled - floor($scaled)) - 0.5) < 1e-8) throw new UnsupportedLogic('Ambiguous floating-point rounding.');
        $number = round($number, 6);
    }
    return js_number($number);
}
function truthy(array $v): bool { return $v['kind'] === 'closure' || (bool)$v['value']; }
function numeric(array $v): float {
    if ($v['kind'] === 'closure') throw new EvaluationError('Expected numeric operand, received lambda closure ('.display_value($v).').');
    return (float)$v['value'];
}
function trace_step(array &$trace, string $kind, string $expression, string $result): void {
    if (count($trace) < 80) $trace[] = ['step'=>count($trace)+1,'kind'=>$kind,'expression'=>$expression,'result'=>$result];
}
function eval_node(array $node, array $env, array &$trace, int $depth, int &$budget): array {
    if ($depth > 48) throw new EvaluationError('Maximum lambda recursion depth (48) exceeded.');
    if (--$budget < 0) throw new UnsupportedLogic('Evaluation work limit exceeded.');
    $type = $node['type'];
    if ($type === 'number' || $type === 'boolean') return ['kind'=>$type,'value'=>$node['value']];
    if ($type === 'identifier') {
        if (!array_key_exists($node['name'], $env)) throw new EvaluationError('Unbound label "'.$node['name'].'". Define it in the Labels & Callbacks panel.');
        return $env[$node['name']];
    }
    if ($type === 'lambda') return ['kind'=>'closure','name'=>$node['name'],'body'=>$node['body'],'env'=>$env];
    if ($type === 'quantifier') {
        $silent = []; $a = $env; $b = $env;
        $a[$node['name']] = ['kind'=>'boolean','value'=>true]; $b[$node['name']] = ['kind'=>'boolean','value'=>false];
        $left = truthy(eval_node($node['body'], $a, $silent, $depth+1, $budget)); $silent = [];
        $right = truthy(eval_node($node['body'], $b, $silent, $depth+1, $budget));
        $result = ['kind'=>'boolean','value'=>$node['op'] === '∀' ? $left && $right : $left || $right];
        trace_step($trace, 'logic', $node['op'].$node['name'].' ∈ {⊥,⊤}. '.format_ast($node['body']), display_value($result));
        return $result;
    }
    if ($type === 'call') {
        $fn = eval_node($node['callee'], $env, $trace, $depth+1, $budget);
        if ($fn['kind'] !== 'closure') throw new EvaluationError('Cannot invoke non-lambda value "'.display_value($fn).'" as a callback.');
        $arg = eval_node($node['arg'], $env, $trace, $depth+1, $budget);
        $inner = $fn['env']; $inner[$fn['name']] = $arg;
        $result = eval_node($fn['body'], $inner, $trace, $depth+1, $budget);
        trace_step($trace, $arg['kind'] === 'closure' ? 'callback' : 'beta', '(λ'.$fn['name'].'. '.format_ast($fn['body']).')('.display_value($arg).')', display_value($result));
        return $result;
    }
    if ($type === 'unary') {
        $value = eval_node($node['body'], $env, $trace, $depth+1, $budget);
        $result = $node['op'] === '¬' ? ['kind'=>'boolean','value'=>!truthy($value)] : ['kind'=>'number','value'=>-numeric($value)];
        trace_step($trace, $node['op'] === '¬' ? 'logic' : 'arith', $node['op'].display_value($value), display_value($result));
        return $result;
    }
    $left = eval_node($node['left'], $env, $trace, $depth+1, $budget);
    $right = eval_node($node['right'], $env, $trace, $depth+1, $budget);
    $op = $node['op'];
    switch ($op) {
        case '∧': $value = truthy($left) && truthy($right); break;
        case '∨': $value = truthy($left) || truthy($right); break;
        case '⊕': $value = truthy($left) !== truthy($right); break;
        case '→': $value = !truthy($left) || truthy($right); break;
        case '↔': case '≡': $value = truthy($left) === truthy($right); break;
        case '=': $value = $left['kind'] === 'boolean' && $right['kind'] === 'boolean' ? $left['value'] === $right['value'] : numeric($left) === numeric($right); break;
        case '≠': $value = $left['kind'] === 'boolean' && $right['kind'] === 'boolean' ? $left['value'] !== $right['value'] : numeric($left) !== numeric($right); break;
        case '<': $value = numeric($left) < numeric($right); break;
        case '≤': $value = numeric($left) <= numeric($right); break;
        case '>': $value = numeric($left) > numeric($right); break;
        case '≥': $value = numeric($left) >= numeric($right); break;
        case '+': $value = numeric($left) + numeric($right); break;
        case '-': $value = numeric($left) - numeric($right); break;
        case '*': $value = numeric($left) * numeric($right); break;
        case '/': if (numeric($right) == 0) throw new EvaluationError('Division by zero.'); $value = numeric($left) / numeric($right); break;
        case '%': if (numeric($right) == 0) throw new EvaluationError('Modulo by zero.'); $value = fmod(numeric($left), numeric($right)); break;
        case '^': $value = pow(numeric($left), numeric($right)); break;
        default: throw new UnsupportedLogic('Unsupported operator.');
    }
    if (is_float($value) && !is_finite($value)) throw new UnsupportedLogic('Non-finite numeric results are not supported.');
    $kind = is_bool($value) ? 'boolean' : 'number';
    $result = ['kind'=>$kind,'value'=>$value];
    trace_step($trace, $kind === 'boolean' ? 'logic' : 'arith', display_value($left).' '.$op.' '.display_value($right), display_value($result));
    return $result;
}
function collect_free(array $node, array $bound = []): array {
    switch ($node['type']) {
        case 'identifier': return isset($bound[$node['name']]) ? [] : [$node['name']];
        case 'lambda': case 'quantifier': $bound[$node['name']] = true; return collect_free($node['body'], $bound);
        case 'unary': return collect_free($node['body'], $bound);
        case 'binary': return array_unique(array_merge(collect_free($node['left'], $bound), collect_free($node['right'], $bound)));
        case 'call': return array_unique(array_merge(collect_free($node['callee'], $bound), collect_free($node['arg'], $bound)));
        default: return [];
    }
}
function binding_diagnostics(string $error, array $ast, array $labels): array {
    if (!preg_match('/^Unbound label "([A-Za-z_][A-Za-z0-9_]*)"/', $error, $match)) return [];
    $configured = array_map(fn($label) => trim($label['name']), $labels);
    $missing = array_filter(collect_free($ast), fn($name) => !in_array($name, $configured, true));
    $missing[] = $match[1];
    return array_map(fn($name) => ['code'=>'unbound_label', 'label'=>$name], array_values(array_unique($missing)));
}
function evaluate_statement(string $statement, array $labels, ?array &$evaluated = null): array {
    $ast = parse_logic($statement); $env = []; $trace = []; $budget = 20000;
    foreach ($labels as $label) {
        $name = trim($label['name']); $raw = trim($label['value']); $kind = $label['kind'];
        try {
            if ($kind === 'boolean' && in_array(strtolower($raw), ['true','false','⊤','⊥','1','0'], true)) {
                $bool = in_array(strtolower($raw), ['true','⊤','1'], true);
                $env[$name] = ['kind'=>'boolean','value'=>$bool];
                $symbol = $bool ? '⊤' : '⊥';
                $trace[] = ['step'=>count($trace)+1,'kind'=>'bind','expression'=>"$name := $symbol",'result'=>$symbol];
            } elseif ($kind === 'number' && $raw !== '' && is_numeric($raw) && is_finite((float)$raw)) {
                $env[$name] = ['kind'=>'number','value'=>(float)$raw]; $number = js_number((float)$raw);
                $trace[] = ['step'=>count($trace)+1,'kind'=>'bind','expression'=>"$name := $number",'result'=>$number];
            } else {
                $sub = parse_logic($raw); $innerTrace = [];
                if ($kind === 'lambda') $value = eval_node($sub, $env, $innerTrace, 0, $budget);
                else $value = eval_node($sub, $env, $trace, 0, $budget);
                if ($kind === 'boolean') $value = ['kind'=>'boolean','value'=>$value['kind'] === 'closure' ? false : truthy($value)];
                if ($kind === 'number') {
                    if ($value['kind'] === 'closure') throw new EvaluationError("Label \"$name\" evaluated to a closure instead of a number.");
                    $value = ['kind'=>'number','value'=>numeric($value)];
                }
                $env[$name] = $value;
                $result = $kind === 'boolean' ? ($value['value'] ? '⊤' : '⊥') : ($kind === 'number' ? js_number($value['value']) : display_value($value));
                $trace[] = ['step'=>count($trace)+1,'kind'=>'bind','expression'=>"$name := $raw",'result'=>$result];
            }
        } catch (EvaluationError $error) {
            return ['ok'=>false,'displayValue'=>$kind === 'lambda' ? 'Callback Error' : 'Binding Error','valueType'=>'error','trace'=>$trace,'error'=>$error->getMessage(),'diagnostics'=>binding_diagnostics($error->getMessage(), $ast, $labels)];
        }
    }
    try {
        $value = eval_node($ast, $env, $trace, 0, $budget);
        if ($value['kind'] === 'boolean') {
            $free = collect_free($ast); $boolNames = [];
            foreach ($labels as $label) if ($label['kind'] === 'boolean' && in_array(trim($label['name']), $free, true)) $boolNames[] = trim($label['name']);
            $boolNames = array_slice($boolNames, 0, 4);
            for ($mask=0; $boolNames && $mask < (1 << count($boolNames)); ++$mask) {
                $testEnv = $env; $silent = [];
                foreach ($boolNames as $i=>$name) $testEnv[$name] = ['kind'=>'boolean','value'=>(bool)($mask & (1 << (count($boolNames)-1-$i)))];
                eval_node($ast, $testEnv, $silent, 0, $budget);
            }
        }
        $display = display_value($value);
        $evaluated = $value;
        return ['ok'=>true,'displayValue'=>$display,'valueType'=>$value['kind'] === 'closure' ? 'lambda' : $value['kind'],'trace'=>$trace,'diagnostics'=>[]];
    } catch (EvaluationError $error) {
        return ['ok'=>false,'displayValue'=>'Eval Error','valueType'=>'error','trace'=>$trace,'error'=>$error->getMessage(),'diagnostics'=>binding_diagnostics($error->getMessage(), $ast, $labels)];
    }
}
function cauchy_names(string $style, int $arity, string $custom = ''): array {
    $count = max(1, min(8, $arity));
    if ($style === 'positional') return array_map(fn($i) => '_'.$i, range(1, $count));
    if ($style === 'directional') {
        if ($count === 1) return ['right'];
        if ($count === 2) return ['left', 'right'];
        if ($count === 3) return ['left', 'mid', 'right'];
        $names = ['left'];
        for ($i=1; $i <= $count-2; ++$i) $names[] = 'mid_'.$i;
        $names[] = 'right';
        return $names;
    }
    $parsed = array_values(array_filter(preg_split('/[,\s]+/', trim($custom)), fn($name) => (bool)preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/D', $name)));
    $names = [];
    for ($i=0; $i < $count; ++$i) $names[] = $parsed[$i] ?? 'param_'.($i+1);
    return $names;
}
function cauchy_error(array $names, array $aliases, string $error): array {
    return ['ok'=>false,'converged'=>false,'cauchyIndexN'=>null,'limitEstimate'=>null,'finalDelta'=>null,'tailDiameter'=>null,'resolvedParamNames'=>$names,'availableAliases'=>$aliases,'steps'=>[],'error'=>$error];
}
function evaluate_cauchy(mixed $raw, array $defaultLabels = DEFAULT_LABELS, array $defaultConfig = DEFAULT_CAUCHY): array {
    $GLOBALS['cauchyEvaluation'] = true;
    if ($raw !== null && !($raw instanceof stdClass)) throw new UnsupportedLogic('Cauchy config must be a JSON object.');
    $config = array_merge($defaultConfig, ['enabled'=>true], $raw === null ? [] : get_object_vars($raw));
    foreach (['paramStyle','customParamNames','seedValues','recurrenceExpr'] as $name) {
        if (!is_string($config[$name]) || strlen($config[$name]) > 16384) throw new UnsupportedLogic('Unsupported Cauchy config field '.$name.'.');
    }
    if (!(is_int($config['maxIterations']) || is_float($config['maxIterations'])) || !is_finite((float)$config['maxIterations'])) throw new UnsupportedLogic('Unsupported Cauchy iteration count.');
    if (!(is_int($config['epsilon']) || is_float($config['epsilon'])) || !is_finite((float)$config['epsilon'])) throw new UnsupportedLogic('Unsupported Cauchy epsilon.');
    $seeds = array_values(array_filter(array_map('trim', explode(',', $config['seedValues'])), fn($v) => $v !== ''));
    if (!$seeds) return ['config'=>$config, ...cauchy_error(cauchy_names($config['paramStyle'], 2, $config['customParamNames']), ['_1','_2','left','right','n','prev'], 'Provide at least one comma-separated numeric seed term (e.g. "0, 1").')];
    if (count($seeds) > 8) throw new UnsupportedLogic('At most eight Cauchy seed terms are supported.');
    $terms = [];
    foreach ($seeds as $i=>$seed) {
        if (is_numeric($seed) && is_finite((float)$seed)) $terms[] = (float)$seed;
        else {
            $value = null; $evaluation = evaluate_statement($seed, $defaultLabels, $value);
            if (!$evaluation['ok'] || $value['kind'] !== 'number' || !is_finite((float)$value['value'])) {
                return ['config'=>$config, ...cauchy_error(cauchy_names($config['paramStyle'], count($seeds), $config['customParamNames']), [], 'Seed #'.($i+1).' ("'.$seed.'") did not evaluate to a finite number.')];
            }
            $terms[] = (float)$value['value'];
        }
    }
    $arity = count($terms);
    $names = cauchy_names($config['paramStyle'], $arity, $config['customParamNames']);
    $recurrence = trim($config['recurrenceExpr']);
    $zeroIndexed = (bool)preg_match('/\\b_0\\b/', $recurrence);
    $positional = [];
    for ($i=0; $i<$arity; ++$i) $positional[] = '_'.($zeroIndexed ? $i : $i+1);
    $directional = cauchy_names('directional', $arity);
    $aliases = array_values(array_unique(array_merge($names, $positional, $directional, ['left','right','prev','n'])));
    if ($recurrence === '') return ['config'=>$config, ...cauchy_error($names, $aliases, 'Enter a recurrence expression (e.g. "(left + right) / 2" or "(_1 + _2) / 2").')];
    $maxIterations = (int)max(1, min(120, floor($config['maxIterations'] ?: 24)));
    $epsilon = $config['epsilon'] > 0 ? $config['epsilon'] : 0.0001;
    for ($iteration=0; $iteration<$maxIterations; ++$iteration) {
        $window = array_slice($terms, -$arity);
        $bindings = ['n'=>count($terms), 'prev'=>$window[$arity-1], 'left'=>$window[0], 'right'=>$window[$arity-1]];
        foreach ($directional as $i=>$name) $bindings[$name] = $window[$i];
        foreach ($positional as $i=>$name) $bindings[$name] = $window[$i];
        foreach ($names as $i=>$name) $bindings[$name] = $window[$i];
        $labels = array_values(array_filter($defaultLabels, fn($label) => !array_key_exists(trim($label['name']), $bindings)));
        foreach ($bindings as $name=>$value) $labels[] = ['id'=>'cauchy', 'name'=>$name, 'kind'=>'number', 'value'=>js_number((float)$value)];
        $value = null; $evaluation = evaluate_statement($recurrence, $labels, $value);
        if (!$evaluation['ok']) return ['config'=>$config, ...cauchy_error($names, $aliases, 'Step n='.count($terms).': '.($evaluation['error'] ?? 'Recurrence evaluation failed.'))];
        if ($value['kind'] !== 'number' || !is_finite((float)$value['value'])) return ['config'=>$config, ...cauchy_error($names, $aliases, 'Step n='.count($terms).' produced non-finite value ('.$evaluation['displayValue'].').')];
        $terms[] = (float)$value['value'];
    }
    $steps = []; $index = null; $total = count($terms);
    for ($i=0; $i<$total; ++$i) {
        $tail = array_slice($terms, $i);
        $diameter = max($tail) - min($tail);
        $delta = $i === 0 ? null : abs($terms[$i] - $terms[$i-1]);
        $within = $i < $total-1 ? $diameter < $epsilon : ($delta ?? $diameter) < $epsilon;
        if ($index === null && $i < $total-1 && $diameter < $epsilon) $index = $i;
        $steps[] = ['n'=>$i, 'value'=>$terms[$i], 'prevDelta'=>$delta, 'tailDiameter'=>$diameter, 'withinEpsilon'=>$within];
    }
    $last = $steps[$total-1];
    return ['config'=>$config, 'ok'=>true, 'converged'=>$index !== null, 'cauchyIndexN'=>$index,
        'limitEstimate'=>$last['value'], 'finalDelta'=>$last['prevDelta'],
        'tailDiameter'=>$steps[$index ?? max(0, $total-2)]['tailDiameter'], 'resolvedParamNames'=>$names,
        'availableAliases'=>$aliases, 'steps'=>$steps];
}
function api_links(string $route): array {
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $origin = preg_match('/^(?:[A-Za-z0-9.-]+|\[[0-9a-fA-F:]+\])(?::[0-9]{1,5})?$/D', $host) ? ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https://' : 'http://').$host) : '';
    $prefix = $origin . rtrim(APP_BASE, '/');
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

function logic_store(): ?PDO {
    $directory = getenv('GRAMMAR2JSON_STATE_DIR');
    if ($directory === false || $directory === '') return null;
    $resolved = realpath($directory);
    if ($resolved === false || $directory !== $resolved || !is_dir($resolved) || is_link($directory)
        || $resolved === __DIR__ || str_starts_with($resolved, __DIR__.DIRECTORY_SEPARATOR)
        || !is_writable($resolved) || (fileperms($resolved) & 0077) !== 0
        || !extension_loaded('pdo_sqlite')) {
        throw new LogicStorageError('State directory must be a writable, private canonical directory outside the web root, with pdo_sqlite enabled.');
    }
    $file = $resolved . '/logic.sqlite3';
    if (is_link($file) || (file_exists($file) && (!is_file($file) || (fileperms($file) & 0077) !== 0))) {
        throw new LogicStorageError('Logic state database must be a private regular file, not a symlink.');
    }
    $previous = umask(0077);
    try {
        $db = new PDO('sqlite:'.$file, null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT=>5]);
        $db->exec('CREATE TABLE IF NOT EXISTS logic_state (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)');
        return $db;
    } catch (PDOException $error) {
        error_log('Logic state database error: '.$error->getMessage());
        throw new LogicStorageError('Unable to access logic state database.');
    } finally {
        umask($previous);
    }
}

function logic_state(?PDO $db): array {
    $defaults = ['statement'=>DEFAULT_STATEMENT, 'labels'=>DEFAULT_LABELS, 'cauchyConfig'=>DEFAULT_CAUCHY, 'callbacks'=>DEFAULT_CALLBACKS];
    if ($db === null) return $defaults;
    try {
        $data = $db->query('SELECT data FROM logic_state WHERE id = 1')->fetchColumn();
        if ($data === false) return $defaults;
        $state = json_decode($data, true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($state) || !is_string($state['statement'] ?? null)
            || !is_array($state['labels'] ?? null) || !is_array($state['cauchyConfig'] ?? null)) {
            throw new LogicStorageError('Stored logic state is invalid.');
        }
        if (array_key_exists('callbacks', $state) && !is_array($state['callbacks'])) throw new LogicStorageError('Stored callback state is invalid.');
        return $state + ['callbacks'=>DEFAULT_CALLBACKS];
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

function serve_callbacks(string $route, string $method): never {
    $links = logic_links('/'.$route);
    $id = null;
    if (preg_match('~^api/callbacks/([^/]+)$~', $route, $match)) $id = rawurldecode($match[1]);
    try {
        $db = logic_store();
        if (in_array($method, ['GET','HEAD'], true)) {
            $callbacks = logic_state($db)['callbacks'];
            if ($id === null) {
                api_json(200, ['count'=>count($callbacks), '_embedded'=>['callbacks'=>$callbacks], '_links'=>$links], true);
            }
            foreach ($callbacks as $callback) if ($callback['id'] === $id || $callback['name'] === $id) {
                api_json(200, [...$callback, '_links'=>$links], true);
            }
            api_json(404, ['error'=>"Callback '$id' not found.", '_links'=>$links], true);
        }
        if (($id === null && $method === 'POST') || ($id !== null && $method === 'PUT')) {
            $input = logic_request_object();
            $saved = logic_mutate($db, function (array $state) use ($id, $input): array {
                $existing = null;
                foreach ($state['callbacks'] as $callback) if ($callback['id'] === $id || $callback['name'] === $id) { $existing = $callback; break; }
                $name = $input->name ?? $existing['name'] ?? $id;
                $expression = $input->lambdaExpr ?? $existing['lambdaExpr'] ?? ($id === null ? null : 'λx. x');
                $description = $input->description ?? $existing['description'] ?? '';
                if (!is_string($name) || !is_string($expression) || !is_string($description) || trim($name) === '' || trim($expression) === '') {
                    throw new InputError('Both "name" and "lambdaExpr" must be text.');
                }
                $name = trim($name);
                $index = null;
                foreach ($state['callbacks'] as $i=>$callback) if ($callback['name'] === $name) { $index = $i; break; }
                if ($index === null && count($state['callbacks']) >= 64) throw new InputError('At most 64 callbacks are supported.');
                $saved = callback_binding($name, $expression, $description, $index === null ? null : $state['callbacks'][$index]['id']);
                if ($index === null) $state['callbacks'][] = $saved; else $state['callbacks'][$index] = $saved;
                return [$state, $saved];
            });
            $self = logic_links('/api/callbacks/'.rawurlencode($saved['id']));
            if ($method === 'POST') header('Location: '.$self['self']['href']);
            api_json($method === 'POST' ? 201 : 200, ['ok'=>true, 'callback'=>$saved, '_links'=>$self], true);
        }
        if ($id !== null && $method === 'DELETE') {
            $result = logic_mutate($db, function (array $state) use ($id): array {
                $before = count($state['callbacks']);
                $state['callbacks'] = array_values(array_filter($state['callbacks'], fn($callback) => $callback['id'] !== $id && $callback['name'] !== $id));
                if ($before === count($state['callbacks'])) throw new InputError("Callback '$id' not found.", 404);
                return [$state, ['ok'=>true, 'deleted'=>$id]];
            });
            api_json(200, [...$result, '_links'=>$links], true);
        }
        header('Allow: '.($id === null ? 'GET, HEAD, POST, OPTIONS' : 'GET, HEAD, PUT, DELETE, OPTIONS'));
        api_json(405, ['error'=>'Method not allowed.', '_links'=>$links], true);
    } catch (InputError $error) {
        api_json($error->getCode() === 404 ? 404 : 400, ['error'=>$error->getMessage(), '_links'=>$links], true);
    } catch (UnsupportedLogic $error) {
        api_json(400, ['error'=>'Invalid or unsupported callback expression: '.$error->getMessage(), '_links'=>$links], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage(), '_links'=>$links], true);
    }
}

function logic_mutate(?PDO $db, callable $update): array {
    if ($db === null) throw new LogicStorageError('Configure GRAMMAR2JSON_STATE_DIR to enable persistent logic updates.');
    $transaction = false;
    try {
        $db->exec('BEGIN IMMEDIATE');
        $transaction = true;
        [$state, $result] = $update(logic_state($db));
        $encoded = json_encode($state, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $query = $db->prepare('INSERT INTO logic_state (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data');
        $query->execute([$encoded]);
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

function logic_request_object(): stdClass {
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') throw new InputError('Use application/json.');
    $body = file_get_contents('php://input', false, null, 0, 262145);
    if ($body === false || strlen($body) > 262144) throw new InputError('Logic state request exceeds 256 KiB.');
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
            'logicLabels'=>['href'=>$prefix.'/api/logic/labels','method'=>'GET'],
            'evaluate'=>['href'=>$prefix.'/api/logic/evaluate','method'=>'POST'],
            'cauchy'=>['href'=>$prefix.'/api/logic/cauchy','method'=>'POST'],
            'callbacks'=>['href'=>$prefix.'/api/callbacks','method'=>'GET'],
            'languages'=>['href'=>$prefix.'/api/languages','method'=>'GET'],
            'templates'=>['href'=>$prefix.'/api/templates','method'=>'GET'],
        ];
        api_json(200, ['service'=>'Grammar2JSON Studio PHP API', 'mediaType'=>'application/hal+json',
            'partial'=>true, 'summary'=>['supportedLanguageCount'=>count(API_LANGUAGES)], '_links'=>$links], true);
    }
    $languages = [];
    foreach (API_LANGUAGES as [$id,$exportId,$label,$shortLabel,$extension]) {
        $languages[] = [
            'id'=>$id, 'exportId'=>$exportId, 'label'=>$label, 'shortLabel'=>$shortLabel, 'extension'=>$extension,
            '_links'=>[
                'exportWorkspace'=>['href'=>$prefix.'/api/export/'.rawurlencode($exportId),'method'=>'GET','available'=>false],
                'exportLogic'=>['href'=>$prefix.'/api/logic/export/'.rawurlencode($exportId),'method'=>'GET','available'=>false],
            ],
        ];
    }
    api_json(200, ['count'=>count($languages), 'languages'=>$languages, '_links'=>[
        'self'=>['href'=>$prefix.'/api/languages','method'=>'GET'], 'root'=>['href'=>$prefix.'/api','method'=>'GET'],
    ]], true);
}

function serve_logic_state(string $route, string $method): never {
    $links = logic_links('/'.$route);
    try {
        $db = logic_store();
        if ($route === 'api/logic' && in_array($method, ['GET','HEAD'], true)) {
            $state = logic_state($db);
            $evaluation = evaluate_statement($state['statement'], $state['labels']);
            $sequence = evaluate_cauchy((object)$state['cauchyConfig'], $state['labels']);
            $fields = ['ok','converged','cauchyIndexN','limitEstimate','resolvedParamNames'];
            api_json(200, ['statement'=>$state['statement'], 'labels'=>$state['labels'],
                'evaluation'=>array_intersect_key($evaluation, array_flip(['ok','displayValue','valueType','error'])),
                'cauchyConfig'=>$state['cauchyConfig'],
                'cauchyEvaluation'=>array_intersect_key($sequence, array_flip($fields)), '_links'=>$links], true);
        }
        if ($route === 'api/logic' && in_array($method, ['PUT','PATCH'], true)) {
            $input = logic_request_object();
            $result = logic_mutate($db, function (array $state) use ($input): array {
                if (isset($input->statement)) {
                    if (!is_string($input->statement) || trim($input->statement) === '') throw new InputError('Statement must be non-empty text.');
                    parse_logic($input->statement);
                    $state['statement'] = $input->statement;
                }
                if (isset($input->labels)) {
                    if (!is_array($input->labels)) throw new InputError('Labels must be an array of complete bindings.');
                    foreach ($input->labels as $label) {
                        if (!$label instanceof stdClass || !isset($label->id, $label->name, $label->kind, $label->value)
                            || !is_string($label->id) || !is_string($label->name) || !is_string($label->kind) || !is_string($label->value)) {
                            throw new InputError('Labels must be an array of complete bindings.');
                        }
                    }
                    $state['labels'] = $input->labels === [] ? [] : normalize_labels($input->labels, []);
                }
                if (isset($input->cauchyConfig)) {
                    if (!$input->cauchyConfig instanceof stdClass) throw new InputError('Cauchy config must be an object.');
                    $config = array_merge($state['cauchyConfig'], get_object_vars($input->cauchyConfig));
                    evaluate_cauchy((object)$config, $state['labels']);
                    $state['cauchyConfig'] = $config;
                }
                $evaluation = evaluate_statement($state['statement'], $state['labels']);
                return [$state, ['ok'=>true, 'statement'=>$state['statement'], 'labels'=>$state['labels'], 'displayValue'=>$evaluation['displayValue']]];
            });
            api_json(200, [...$result, '_links'=>$links], true);
        }
        if ($route === 'api/logic/labels' && in_array($method, ['GET','HEAD'], true)) {
            $labels = logic_state($db)['labels'];
            api_json(200, ['count'=>count($labels), 'labels'=>$labels, '_links'=>$links], true);
        }
        if ($route === 'api/logic/labels' && $method === 'POST') {
            $input = logic_request_object();
            if (!is_string($input->name ?? null) || trim($input->name) === '') throw new InputError('"name" is required.');
            $name = trim($input->name);
            $kind = $input->kind ?? 'number';
            $value = $input->value ?? '0';
            $binding = normalize_binding($name, (object)['kind'=>$kind, 'value'=>$value], null);
            $binding['id'] = 'lbl_'.bin2hex(random_bytes(12));
            $label = logic_mutate($db, function (array $state) use ($binding): array {
                $state['labels'] = array_values(array_filter($state['labels'], fn($item) => $item['name'] !== $binding['name']));
                if (count($state['labels']) >= 64) throw new InputError('At most 64 labels are supported.');
                $state['labels'][] = $binding;
                return [$state, $binding];
            });
            api_json(201, ['ok'=>true, 'label'=>$label, '_links'=>$links], true);
        }
        if (preg_match('~^api/logic/labels/([^/]+)$~', $route, $match) && in_array($method, ['GET','HEAD','DELETE'], true)) {
            $id = rawurldecode($match[1]);
            if ($method !== 'DELETE') {
                foreach (logic_state($db)['labels'] as $label) if ($label['id'] === $id || $label['name'] === $id)
                    api_json(200, ['label'=>$label, '_links'=>$links], true);
                api_json(404, ['error'=>"Label '$id' not found.", '_links'=>$links], true);
            }
            $result = logic_mutate($db, function (array $state) use ($id): array {
                $before = count($state['labels']);
                $state['labels'] = array_values(array_filter($state['labels'], fn($item) => $item['id'] !== $id && $item['name'] !== $id));
                if (count($state['labels']) === $before) throw new InputError("Label '$id' not found.", 404);
                return [$state, ['ok'=>true, 'deleted'=>$id]];
            });
            api_json(200, [...$result, '_links'=>$links], true);
        }
        header('Allow: '.($route === 'api/logic' ? 'GET, HEAD, PUT, PATCH, OPTIONS' : ($route === 'api/logic/labels' ? 'GET, HEAD, POST, OPTIONS' : 'GET, HEAD, DELETE, OPTIONS')));
        api_json(405, ['error'=>'Method not allowed.', '_links'=>$links], true);
    } catch (InputError $error) {
        api_json($error->getCode() === 404 ? 404 : 400, ['error'=>$error->getMessage(), '_links'=>$links], true);
    } catch (UnsupportedLogic $error) {
        api_json(503, ['error'=>'PHP logic evaluator cannot handle this input: '.$error->getMessage(), '_links'=>$links], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage(), '_links'=>$links], true);
    }
}

function serve_api(string $route): never {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (strtolower(rtrim($route, '/')) === 'healthz' && in_array($method, ['GET','HEAD'], true)) api_json(200, ['ok'=>true,'service'=>'grammar2json-studio']);
    if (preg_match('~^api(?:/|$)~i', $route)) {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Accept, Authorization, Mcp-Session-Id');
        header('Access-Control-Expose-Headers: Link, Location, Allow');
        if ($method === 'OPTIONS') { header('Allow: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS'); http_response_code(204); header('Cache-Control: no-store'); exit; }
    }
    $route = rtrim($route, '/');
    if (in_array($route, ['api','api/languages'], true)) serve_api_discovery($route);
    if ($route === 'api/templates' && $method === 'GET') {
        try {
            api_json(200, [
                'template'=>select_api_template_name($_GET['template'] ?? null),
                'templates'=>API_HTML_TEMPLATE_NAMES,
                'fragments'=>array_keys(API_HTML_FRAGMENT_TEMPLATES),
            ]);
        } catch (InvalidArgumentException $error) {
            api_json(400, ['error'=>$error->getMessage()]);
        }
    }
    if ($route === 'api/templates/render' && $method === 'POST') {
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
        } catch (JsonException $error) {
            api_json(400, ['error'=>'Malformed template JSON.']);
        } catch (InputError|InvalidArgumentException $error) {
            api_json(400, ['error'=>$error->getMessage()]);
        } catch (RuntimeException $error) {
            api_json(404, ['error'=>$error->getMessage()]);
        }
    }
    if ($route === 'api/callbacks' || preg_match('~^api/callbacks/[^/]+$~', $route)) serve_callbacks($route, $method);
    if (in_array($route, ['api/logic','api/logic/labels'], true) || preg_match('~^api/logic/labels/[^/]+$~', $route)) serve_logic_state($route, $method);
    if (!in_array($route, ['api/logic/evaluate','api/logic/cauchy'], true) || $method !== 'POST') api_json(503, ['error'=>'This endpoint is not implemented by the PHP deployment. Configure a separate Node API proxy.']);
    $links = api_links('/'.$route);
    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
    if (!in_array($contentType, ['application/json','text/plain'], true)) api_json(415, ['ok'=>false,'error'=>'Use application/json or text/plain.','_links'=>$links], true);
    if (isset($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH'] > 5242880) api_json(413, ['ok'=>false,'error'=>'Request body exceeds 5 MiB.','_links'=>$links], true);
    $body = file_get_contents('php://input', false, null, 0, 5242881);
    if ($body === false || strlen($body) > 5242880) api_json(413, ['ok'=>false,'error'=>'Request body exceeds 5 MiB.','_links'=>$links], true);
    if (!preg_match('//u', $body)) api_json(400, ['ok'=>false,'error'=>'Request body must be valid UTF-8.','_links'=>$links], true);
    try {
        if ($contentType === 'application/json') {
            if (trim($body) === '') $raw = null;
            else { $raw = json_decode($body, false, 32, JSON_THROW_ON_ERROR); }
        } else $raw = $body;
        $state = logic_state(logic_store());
        if ($route === 'api/logic/cauchy') api_json(200, [...evaluate_cauchy($raw, $state['labels'], $state['cauchyConfig']), '_links'=>$links], true);
        [$statement, $labels] = normalized_input($raw, 0, $state);
        $result = evaluate_statement($statement, $labels);
        api_json(200, ['statement'=>$statement, ...$result, '_links'=>$links], true);
    } catch (JsonException $error) {
        api_json(400, ['ok'=>false,'error'=>'Malformed JSON request body.','_links'=>$links], true);
    } catch (InputError $error) {
        $message = $error->getMessage();
        $code = preg_match('/^(Ambiguous|Do not mix)/', $message) ? 'ambiguous_input' : 'invalid_input';
        api_json(400, ['ok'=>false,'error'=>$message,'diagnostics'=>[['code'=>$code,'message'=>$message]],'_links'=>$links], true);
    } catch (UnsupportedLogic $error) {
        api_json(503, ['ok'=>false,'error'=>'PHP logic evaluator cannot handle this input: '.$error->getMessage(),'_links'=>$links], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['ok'=>false,'error'=>$error->getMessage(),'_links'=>$links], true);
    }
}
