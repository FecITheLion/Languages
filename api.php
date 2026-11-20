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
function evaluate_statement(string $statement, array $labels, ?array &$evaluated = null, ?array &$truthTable = null): array {
    $truthTable = null;
    if (trim($statement) === '') return ['ok'=>false, 'displayValue'=>'Parse Error', 'valueType'=>'error',
        'trace'=>[], 'error'=>'Expression is empty.', 'diagnostics'=>[]];
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
            $rows = [];
            for ($mask=0; $boolNames && $mask < (1 << count($boolNames)); ++$mask) {
                $testEnv = $env; $silent = []; $assignments = [];
                foreach ($boolNames as $i=>$name) {
                    $assignments[$name] = (bool)($mask & (1 << (count($boolNames)-1-$i)));
                    $testEnv[$name] = ['kind'=>'boolean','value'=>$assignments[$name]];
                }
                $row = eval_node($ast, $testEnv, $silent, 0, $budget);
                $rows[] = ['assignments'=>$assignments, 'result'=>$row['kind'] === 'boolean' ? ($row['value'] ? '⊤' : '⊥') : display_value($row)];
            }
            if ($boolNames) $truthTable = ['variables'=>$boolNames, 'rows'=>$rows];
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

function logic_mutate(?PDO $db, callable $update, ?callable $historyEvent = null): array {
    if ($db === null) throw new LogicStorageError('Configure GRAMMAR2JSON_STATE_DIR to enable persistent logic updates.');
    $transaction = false;
    try {
        $db->exec('BEGIN IMMEDIATE');
        $transaction = true;
        $state = logic_state($db);
        if (empty($state['histolog'])) history_record($state, 'init', 'Initial REST/HATEOAS workspace');
        [$state, $result] = $update($state);
        if ($historyEvent !== null) {
            $event = $historyEvent($result);
            if ($event !== null) history_record($state, $event[0], $event[1]);
        }
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

function grammar_split_alternatives(string $expression, string $delimiter): array {
    if ($delimiter === '') return [trim($expression)];
    $result = []; $current = ''; $quote = ''; $depth = ['('=>0, '['=>0, '{'=>0]; $n = strlen($expression);
    for ($i = 0; $i < $n;) {
        $ch = $expression[$i];
        if ($quote !== '') {
            $current .= $ch;
            if ($ch === $quote && ($i === 0 || $expression[$i - 1] !== '\\')) $quote = '';
            ++$i; continue;
        }
        if ($ch === '"' || $ch === "'") { $quote = $ch; $current .= $ch; ++$i; continue; }
        if ($ch === '/' && $delimiter !== '/') {
            for ($j = $i + 1; $j < $n; ++$j) {
                if ($expression[$j] === '\\') { ++$j; continue; }
                if ($expression[$j] === '/') { $current .= substr($expression, $i, $j + 1 - $i); $i = $j + 1; continue 2; }
            }
        }
        if (isset($depth[$ch])) ++$depth[$ch];
        elseif ($ch === ')' && $depth['('] > 0) --$depth['('];
        elseif ($ch === ']' && $depth['['] > 0) --$depth['['];
        elseif ($ch === '}' && $depth['{'] > 0) --$depth['{'];
        if (array_sum($depth) === 0 && substr($expression, $i, strlen($delimiter)) === $delimiter) {
            if (trim($current) !== '') $result[] = trim($current);
            $current = ''; $i += strlen($delimiter); continue;
        }
        $current .= $ch; ++$i;
    }
    if (trim($current) !== '') $result[] = trim($current);
    return $result;
}

function grammar_literal_segments(string $expression, array &$literals): string {
    $stripped = ''; $n = strlen($expression);
    for ($i = 0; $i < $n;) {
        $quote = $expression[$i];
        if ($quote !== '"' && $quote !== "'") { $stripped .= $quote; ++$i; continue; }
        $j = $i + 1;
        while ($j < $n && $expression[$j] !== $quote) {
            if ($expression[$j] === '\\' && $j + 1 < $n) $j += 2; else ++$j;
        }
        if ($j === $n) { $stripped .= $quote; ++$i; continue; }
        $literals[] = substr($expression, $i + 1, $j - $i - 1);
        $stripped .= ' '; $i = $j + 1;
    }
    return $stripped;
}

function parse_grammar(string $text, stdClass $dialect): array {
    $operator = trim(is_string($dialect->ruleOperator ?? null) ? $dialect->ruleOperator : '');
    $delimiter = is_string($dialect->choiceDelimiter ?? null) && $dialect->choiceDelimiter !== '' ? $dialect->choiceDelimiter : '|';
    $comment = is_string($dialect->commentPrefix ?? null) && $dialect->commentPrefix !== '' ? $dialect->commentPrefix : '//';
    $raw = []; $names = [];
    foreach (preg_split('/\r?\n/', $text) as $index=>$line) {
        $clean = trim($line);
        if ($clean === '' || str_starts_with($clean, $comment)) continue;
        $quote = '';
        for ($i = 0, $length = strlen($clean); $i < $length; ++$i) {
            $ch = $clean[$i];
            if ($quote !== '') { if ($ch === $quote && ($i === 0 || $clean[$i - 1] !== '\\')) $quote = ''; }
            elseif ($ch === '"' || $ch === "'") $quote = $ch;
            elseif (substr($clean, $i, strlen($comment)) === $comment) { $clean = trim(substr($clean, 0, $i)); break; }
        }
        if ($operator === '') {
            if (!preg_match('/^(\S+)(\s+)(.+)$/s', $clean, $parts)) continue;
            $name = preg_replace('/^<|>$/', '', trim($parts[1]));
            if (!preg_match('/^[A-Za-z_][A-Za-z0-9_.-]*$/D', $name)) continue;
            $expression = trim($parts[3]);
        } else {
            $position = strpos($clean, $operator);
            if ($position === false || $position === 0) continue;
            $name = preg_replace('/^<|>$/', '', trim(substr($clean, 0, $position)));
            $expression = trim(substr($clean, $position + strlen($operator)));
        }
        if ($name === '' || $expression === '') continue;
        $raw[] = ['lineNumber'=>$index+1, 'name'=>$name, 'expression'=>$expression, 'rawLine'=>$clean];
        $names[$name] = true;
    }
    $result = [];
    foreach ($raw as $rule) {
        $literals = []; $stripped = grammar_literal_segments($rule['expression'], $literals);
        if ($delimiter !== '/') $stripped = preg_replace('~/(?:\\\\.|[^/\\\\])+/~', ' ', $stripped);
        $stripped = preg_replace_callback('/\[[^\]]*\]/', function ($match) use ($names) {
            $inner = trim(substr($match[0], 1, -1));
            preg_match_all('/[A-Za-z_][A-Za-z0-9_-]*/', $inner, $words);
            foreach ($words[0] as $word) if (isset($names[$word])) return ' '.$inner.' ';
            return ' ';
        }, $stripped);
        preg_match_all('/[A-Za-z_][A-Za-z0-9_-]*/', $stripped, $matches);
        $tokens = array_values(array_unique($matches[0]));
        $result[] = ['id'=>'rule_'.$rule['name'].'_'.$rule['lineNumber'], ...$rule,
            'alternatives'=>grammar_split_alternatives($rule['expression'], $delimiter),
            'referencedRules'=>array_values(array_filter($tokens, fn($token) => isset($names[$token]))),
            'undefinedReferences'=>array_values(array_filter($tokens, fn($token) => !isset($names[$token]))),
            'literals'=>$literals];
    }
    return $result;
}

function grammar_operators(string $expression, stdClass $dialect): array {
    $ignored = []; $text = grammar_literal_segments($expression, $ignored);
    $symbols = $dialect->symbols ?? new stdClass();
    $result = [];
    foreach (['oneOrMore','zeroOrMore','optional','repeatBraces','groupParens','charClassBrackets','posLookahead','negLookahead','posLookbehind','negLookbehind','wildcard','regexDelimiter'] as $key) {
        $symbol = is_string($symbols->$key ?? null) ? trim($symbols->$key) : '';
        if ($symbol === '' || ($key === 'regexDelimiter' && ($dialect->choiceDelimiter ?? '') === '/')) continue;
        if (in_array($key, ['repeatBraces','groupParens','charClassBrackets'], true)) {
            $present = strlen($symbol) >= 2 && str_contains($text, $symbol[0]) && str_contains($text, $symbol[strlen($symbol)-1]);
        } elseif ($key === 'optional') {
            $present = str_contains(preg_replace('/\(\?[=!<:]/', ' ', $text), $symbol);
        } elseif ($key === 'posLookahead') {
            $present = str_contains($text, $symbol) || str_contains($text, '(?=');
        } elseif ($key === 'negLookahead') {
            $clean = str_replace('(?<!', ' ', $text);
            $present = str_contains($clean, $symbol) || str_contains($clean, '(?!');
        } else $present = str_contains($text, $symbol);
        if ($present) $result[] = $key.':'.$symbol;
    }
    return $result;
}

function grammar_normalize_expression(string $expression): string {
    while (str_contains($expression, '\\"')) $expression = str_replace('\\"', '"', $expression);
    $result = ''; $n = strlen($expression);
    for ($i = 0; $i < $n;) {
        $quote = $expression[$i];
        if ($quote !== '"' && $quote !== "'") { $result .= $quote; ++$i; continue; }
        $j = $i + 1; $inner = '';
        while ($j < $n && $expression[$j] !== $quote) {
            if ($expression[$j] === '\\' && $j + 1 < $n) {
                $inner .= $quote === '"' ? $expression[$j + 1] : substr($expression, $j, 2);
                $j += 2;
            } else $inner .= $expression[$j++];
        }
        $closed = $j < $n;
        if ($closed) ++$j;
        $result .= $quote === '"' && $closed && !str_contains($inner, "'") ? "'".$inner."'" : substr($expression, $i, $j - $i);
        $i = $j;
    }
    return $result;
}

function grammar_rename_references(string $expression, string $from, string $to): string {
    $result = ''; $n = strlen($expression);
    for ($i = 0; $i < $n;) {
        $ch = $expression[$i];
        if ($ch === '"' || $ch === "'") {
            $j = $i + 1;
            while ($j < $n && $expression[$j] !== $ch) {
                if ($expression[$j] === '\\' && $j + 1 < $n) $j += 2; else ++$j;
            }
            if ($j < $n) ++$j;
            $result .= substr($expression, $i, $j - $i); $i = $j; continue;
        }
        if (preg_match('/[A-Za-z_]/', $ch)) {
            $j = $i + 1;
            while ($j < $n && preg_match('/[A-Za-z0-9_-]/', $expression[$j])) ++$j;
            $token = substr($expression, $i, $j - $i);
            $result .= $token === $from ? $to : $token; $i = $j; continue;
        }
        $result .= $ch; ++$i;
    }
    return $result;
}

function grammar_serialize(string $original, array $rules, stdClass $dialect): string {
    $comment = is_string($dialect->commentPrefix ?? null) && $dialect->commentPrefix !== '' ? $dialect->commentPrefix : '//';
    $lines = [];
    foreach (preg_split('/\r?\n/', $original) as $line) {
        $trimmed = trim($line);
        if ($trimmed === '') { if ($lines) break; continue; }
        if (str_starts_with($trimmed, $comment)) $lines[] = $line; else break;
    }
    $operator = trim(is_string($dialect->ruleOperator ?? null) ? $dialect->ruleOperator : '');
    foreach ($rules as $rule) $lines[] = $rule['name'].($operator !== '' ? ' '.$operator : '').' '.$rule['expression'];
    return implode("\n", $lines);
}

final class GrammarExpressionParser {
    private string $src;
    private int $pos = 0;
    private array $symbols;
    private array $names;
    private string $choice;
    private int $depth = 0;

    public function __construct(string $source, array $names, stdClass $dialect) {
        $this->src = trim($source);
        $this->names = array_fill_keys($names, true);
        $this->symbols = array_merge(GRAMMAR_DEFAULT_SYMBOLS, (array)($dialect->symbols ?? new stdClass()));
        $this->choice = trim($dialect->choiceDelimiter ?? '') ?: '|';
    }

    private function skip(): void {
        while ($this->pos < strlen($this->src) && (ctype_space($this->src[$this->pos]) || $this->src[$this->pos] === ',')) ++$this->pos;
    }
    private function starts(string $text): bool {
        return $text !== '' && substr_compare($this->src, $text, $this->pos, strlen($text)) === 0;
    }
    private function pair(string $key): ?array {
        $symbol = $this->symbols[$key] ?? '';
        return strlen($symbol) >= 2 ? [$symbol[0], $symbol[strlen($symbol) - 1]] : null;
    }
    private function atChoice(): bool {
        if ($this->choice !== '/' && $this->starts($this->choice)) return true;
        if ($this->starts('|')) return true;
        $n = strlen($this->src);
        return $this->starts('/') && ($this->pos === 0 || ctype_space($this->src[$this->pos - 1]))
            && ($this->pos + 1 >= $n || ctype_space($this->src[$this->pos + 1]));
    }
    public function parse(): ?array {
        if (++$this->depth > 64) throw new UnsupportedLogic('Grammar expression nesting exceeds the PHP limit.');
        try {
            $first = $this->sequence();
            if ($first === null) return null;
            $branches = [$first];
            while (true) {
                $this->skip();
                if (!$this->atChoice()) break;
                $this->pos += $this->choice !== '/' && $this->starts($this->choice) ? strlen($this->choice) : 1;
                $next = $this->sequence();
                if ($next !== null) $branches[] = $next;
            }
            return count($branches) === 1 ? $branches[0] : ['type'=>'choice', 'items'=>$branches];
        } finally { --$this->depth; }
    }
    private function sequence(): ?array {
        $items = [];
        while ($this->pos < strlen($this->src)) {
            $this->skip();
            if ($this->pos >= strlen($this->src)) break;
            $ch = $this->src[$this->pos];
            $closing = [')'];
            foreach (['groupParens','charClassBrackets','repeatBraces'] as $key) {
                $pair = $this->pair($key);
                if ($pair !== null) $closing[] = $pair[1];
            }
            if (in_array($ch, $closing, true) || $this->atChoice()) break;
            $item = $this->prefix();
            if ($item === null) ++$this->pos; else $items[] = $item;
        }
        return !$items ? null : (count($items) === 1 ? $items[0] : ['type'=>'sequence', 'items'=>$items]);
    }
    private function prefix(): ?array {
        $this->skip();
        foreach (['posLookahead'=>true, 'negLookahead'=>false] as $key=>$positive) {
            $symbol = $this->symbols[$key] ?? '';
            if ($this->starts($symbol)) {
                $start = $this->pos;
                $this->pos += strlen($symbol);
                $node = $this->postfix();
                return $node === null ? null : ['type'=>'lookahead', 'node'=>$node, 'positive'=>$positive,
                    'raw'=>trim(substr($this->src, $start, $this->pos - $start))];
            }
        }
        return $this->postfix();
    }
    private function postfix(): ?array {
        $node = $this->atom();
        if ($node === null) return null;
        $candidates = [];
        foreach (['oneOrMore'=>[1,128], 'zeroOrMore'=>[0,128], 'optional'=>[0,1]] as $key=>$bounds) {
            $symbol = $this->symbols[$key] ?? '';
            if ($symbol !== '') $candidates[] = [$symbol, ...$bounds];
        }
        usort($candidates, fn($a, $b) => strlen($b[0]) <=> strlen($a[0]));
        while ($this->pos < strlen($this->src)) {
            $found = false;
            foreach ($candidates as [$token, $min, $max]) {
                if (!$this->starts($token)) continue;
                $this->pos += strlen($token);
                $optional = $this->symbols['optional'] ?? '';
                $lazy = $this->starts($optional);
                if ($lazy) $this->pos += strlen($optional);
                $node = ['type'=>'repeat', 'node'=>$node, 'min'=>$min, 'max'=>$max, 'lazy'=>$lazy];
                $found = true;
                break;
            }
            if ($found) continue;
            $pair = $this->pair('repeatBraces');
            if ($pair !== null && $this->starts($pair[0])) {
                $pattern = '/^'.preg_quote($pair[0], '/').'\s*(\d+)(?:\s*,\s*(\d*))?\s*'.preg_quote($pair[1], '/').'(\?)?/';
                if (preg_match($pattern, substr($this->src, $this->pos), $m, PREG_UNMATCHED_AS_NULL)) {
                    $this->pos += strlen($m[0]);
                    $min = (int)$m[1];
                    $max = $m[2] === null ? $min : ($m[2] === '' ? 128 : max($min, (int)$m[2]));
                    $node = ['type'=>'repeat', 'node'=>$node, 'min'=>$min, 'max'=>min($max,128), 'lazy'=>($m[3] ?? null) !== null];
                    continue;
                }
            }
            break;
        }
        return $node;
    }
    private function atom(): ?array {
        $this->skip();
        $n = strlen($this->src);
        if ($this->pos >= $n) return null;
        $ch = $this->src[$this->pos];
        if ($ch === "'" || $ch === '"') {
            ++$this->pos; $value = '';
            while ($this->pos < $n && $this->src[$this->pos] !== $ch) {
                $c = $this->src[$this->pos++];
                if ($c === '\\' && $this->pos < $n) {
                    $next = $this->src[$this->pos++];
                    $value .= match ($next) {
                        'n'=>"\n", 'r'=>"\r", 't'=>"\t", 'b'=>"\x08", 'f'=>"\x0c", 'v'=>"\x0b",
                        '\\','"', "'" => $next, default => '\\'.$next,
                    };
                } else $value .= $c;
            }
            if ($this->pos < $n) ++$this->pos;
            return ['type'=>'literal', 'value'=>$value];
        }
        foreach (['posLookbehind'=>true, 'negLookbehind'=>false] as $key=>$positive) {
            $symbol = $this->symbols[$key] ?? '';
            if ($this->starts($symbol)) {
                $start = $this->pos; $this->pos += strlen($symbol);
                $inner = $this->parse(); $this->skip();
                if ($this->starts(')')) ++$this->pos;
                return $inner === null ? null : ['type'=>'lookbehind', 'node'=>$inner, 'positive'=>$positive,
                    'raw'=>substr($this->src, $start, $this->pos - $start)];
            }
        }
        foreach (['(?='=>true, '(?!'=>false] as $op=>$positive) {
            if (($this->symbols[$positive ? 'posLookahead' : 'negLookahead'] ?? '') !== '' && $this->starts($op)) {
                $start = $this->pos; $this->pos += 3;
                $inner = $this->parse(); $this->skip();
                if ($this->starts(')')) ++$this->pos;
                return $inner === null ? null : ['type'=>'lookahead', 'node'=>$inner, 'positive'=>$positive,
                    'raw'=>substr($this->src, $start, $this->pos - $start)];
            }
        }
        $pair = $this->pair('groupParens');
        if ($pair !== null && $ch === $pair[0]) {
            ++$this->pos;
            if ($this->starts('?:')) $this->pos += 2;
            $inner = $this->parse(); $this->skip();
            if ($this->starts($pair[1])) ++$this->pos;
            return $inner;
        }
        $pair = $this->pair('charClassBrackets');
        if ($pair !== null && $ch === $pair[0]) {
            $end = $this->pos + 1; $quote = '';
            while ($end < $n) {
                $c = $this->src[$end];
                if ($c === '\\') { $end += 2; continue; }
                if ($quote !== '') { if ($c === $quote) $quote = ''; }
                elseif ($c === '"' || $c === "'") $quote = $c;
                elseif ($c === $pair[1]) break;
                ++$end;
            }
            if ($end < $n) {
                $inside = substr($this->src, $this->pos + 1, $end - $this->pos - 1);
                $trimmed = trim($inside);
                preg_match_all('/[A-Za-z_][A-Za-z0-9_-]*/', $trimmed, $words);
                $optional = str_contains($inside, '"') || str_contains($inside, "'") || isset($this->names[$trimmed])
                    || (str_contains($trimmed, ' ') && count(array_intersect($words[0], array_keys($this->names))) > 0);
                if ($optional) {
                    ++$this->pos; $inner = $this->parse(); $this->skip();
                    if ($this->starts($pair[1])) ++$this->pos;
                    return $inner === null ? null : ['type'=>'repeat', 'node'=>$inner, 'min'=>0, 'max'=>1, 'lazy'=>false];
                }
                $raw = substr($this->src, $this->pos, $end - $this->pos + 1); $this->pos = $end + 1;
                return ['type'=>'class', 'raw'=>$raw, 'pattern'=>$raw];
            }
        }
        $pair = $this->pair('repeatBraces');
        if ($pair !== null && $ch === $pair[0]) {
            ++$this->pos; $inner = $this->parse(); $this->skip();
            if ($this->starts($pair[1])) ++$this->pos;
            return $inner === null ? null : ['type'=>'repeat', 'node'=>$inner, 'min'=>0, 'max'=>128, 'lazy'=>false];
        }
        $delimiter = $this->symbols['regexDelimiter'] ?? '';
        if ($this->starts($delimiter)) {
            $end = $this->pos + strlen($delimiter);
            while ($end < $n && substr_compare($this->src, $delimiter, $end, strlen($delimiter)) !== 0) {
                $end += $this->src[$end] === '\\' ? 2 : 1;
            }
            if ($end < $n) {
                $pattern = substr($this->src, $this->pos + strlen($delimiter), $end - $this->pos - strlen($delimiter));
                $raw = substr($this->src, $this->pos, $end - $this->pos + strlen($delimiter)); $this->pos = $end + strlen($delimiter);
                if (str_starts_with($pattern, '^')) $pattern = substr($pattern, 1);
                return ['type'=>'regex', 'raw'=>$raw, 'pattern'=>$pattern];
            }
        }
        $wildcard = $this->symbols['wildcard'] ?? '';
        if ($this->starts($wildcard)) { $this->pos += strlen($wildcard); return ['type'=>'wildcard']; }
        if ($ch === '^' || $ch === '$') { ++$this->pos; return ['type'=>'anchor', 'kind'=>$ch]; }
        if ($ch === '<') {
            $end = strpos($this->src, '>', $this->pos);
            if ($end !== false) {
                $name = trim(substr($this->src, $this->pos + 1, $end - $this->pos - 1)); $this->pos = $end + 1;
                return $name === '' ? null : ['type'=>'ref', 'name'=>$name];
            }
        }
        if (preg_match('/^[A-Za-z_][A-Za-z0-9_-]*/', substr($this->src, $this->pos), $m)) {
            $this->pos += strlen($m[0]); return ['type'=>'ref', 'name'=>$m[0]];
        }
        return null;
    }
}

final class GrammarPayloadEvaluator {
    private array $rules = [];
    private array $asts = [];
    private array $active = [];
    private int $work = 0;
    private string $payload;
    private stdClass $mutations;

    public function __construct(array $rules, stdClass $workspace, string $payload) {
        if (strlen($payload) > 16384 || preg_match('/[^\x00-\x7f]/', $payload)) {
            throw new UnsupportedLogic('Grammar evaluation currently supports ASCII payloads up to 16 KiB.');
        }
        $this->payload = $payload;
        $this->mutations = $workspace->mutations;
        $names = array_column($rules, 'name');
        foreach ($rules as $rule) {
            if (preg_match('/[^\x00-\x7f]/', $rule['expression'])) {
                throw new UnsupportedLogic('Grammar evaluation currently supports ASCII expressions.');
            }
            $this->rules[$rule['name']] = $rule;
            $this->asts[$rule['name']] = [];
            foreach ($rule['alternatives'] as $alternative) {
                $ast = (new GrammarExpressionParser($alternative, $names, $workspace->dialect))->parse();
                if ($ast !== null) $this->asts[$rule['name']][] = ['raw'=>$alternative, 'node'=>$ast];
            }
        }
    }

    private function tick(): void {
        if (++$this->work > 100000) throw new UnsupportedLogic('Grammar evaluation exceeded its work limit.');
    }
    private function regex(string $pattern, int $pos): ?string {
        if (preg_match('/\\\\[upPkKgG]|\\(\\?[<P#(]|\\(\\*|\\\\[1-9]/', $pattern)) {
            throw new UnsupportedLogic('The grammar regular expression uses syntax not supported by the PHP evaluator.');
        }
        $pattern = '~(*LIMIT_MATCH=100000)(*LIMIT_DEPTH=1000)^(?:'.str_replace('~', '\\~', $pattern).')~';
        set_error_handler(static function (int $severity, string $message): never {
            throw new UnsupportedLogic('Invalid grammar regular expression: '.$message);
        });
        try { $matched = preg_match($pattern, substr($this->payload, $pos), $matches); }
        finally { restore_error_handler(); }
        if ($matched === false) throw new UnsupportedLogic('Grammar regular expression failed: '.preg_last_error_msg());
        return $matched === 1 && $matches[0] !== '' ? $matches[0] : null;
    }
    private function outcome(int $end, array $trace = []): array { return ['endPos'=>$end, 'trace'=>$trace]; }
    private function step(int $depth, string $rule, int $pos, string $consumed, string $note, int $preview = 16): array {
        return ['depth'=>$depth, 'rule'=>$rule, 'inputSlice'=>substr($this->payload, $pos, $preview),
            'matched'=>true, 'consumed'=>$consumed, 'note'=>$note];
    }
    private function expression(array $node, int $pos, int $depth, bool $inRepeat = false): array {
        $this->tick();
        if ($depth > 32) return [];
        $type = $node['type'];
        if ($type === 'literal') {
            $value = $node['value'];
            if (substr($this->payload, $pos, strlen($value)) !== $value) return [];
            return [$this->outcome($pos + strlen($value), [$this->step($depth, '"'.$value.'"', $pos, $value, 'Terminal literal matched')])];
        }
        if ($type === 'wildcard') {
            if ($pos >= strlen($this->payload)) return [];
            $value = $this->payload[$pos];
            return [$this->outcome($pos + 1, [$this->step($depth, '.', $pos, $value, 'Wildcard matched single char')])];
        }
        if ($type === 'anchor') {
            if (($node['kind'] === '^' && $pos !== 0) || ($node['kind'] === '$' && $pos !== strlen($this->payload))) return [];
            return [$this->outcome($pos, [$this->step($depth, $node['kind'], $pos, '',
                $node['kind'] === '^' ? 'Start anchor matched' : 'End anchor matched', 12)])];
        }
        if ($type === 'class' || $type === 'regex') {
            $value = $this->regex($node['pattern'], $pos);
            return $value === null ? [] : [$this->outcome($pos + strlen($value), [
                $this->step($depth, $node['raw'], $pos, $value, $type === 'class' ? 'Character class matched' : 'Inline regex matched')])];
        }
        if ($type === 'ref') return $this->matchRule($node['name'], $pos, $depth, $inRepeat);
        if ($type === 'sequence') {
            $states = [$this->outcome($pos)];
            foreach ($node['items'] as $item) {
                $next = [];
                foreach ($states as $state) {
                    foreach ($this->expression($item, $state['endPos'], $depth, $inRepeat) as $out) {
                        $next[] = $this->outcome($out['endPos'], array_merge($state['trace'], $out['trace']));
                        if (count($next) >= 24) break 2;
                    }
                }
                $states = $next;
                if (!$states) break;
            }
            return $states;
        }
        if ($type === 'choice') {
            $results = []; $seen = [];
            foreach ($node['items'] as $item) foreach ($this->expression($item, $pos, $depth, $inRepeat) as $out) {
                if (isset($seen[$out['endPos']])) continue;
                $seen[$out['endPos']] = true; $results[] = $out;
                if (count($results) >= 24) break 2;
            }
            return $results;
        }
        if ($type === 'repeat') {
            $results = []; $seen = []; $frontier = [$this->outcome($pos)];
            if ($node['min'] === 0) { $seen[$pos] = true; $results[] = $this->outcome($pos); }
            for ($count = 1; $count <= min($node['max'], 128); ++$count) {
                $next = []; $nextSeen = [];
                foreach ($frontier as $state) foreach ($this->expression($node['node'], $state['endPos'], $depth, true) as $out) {
                    $end = $out['endPos'];
                    if ($end === $state['endPos'] || isset($nextSeen[$end])) continue;
                    $nextSeen[$end] = true;
                    $combined = $this->outcome($end, array_merge($state['trace'], $out['trace']));
                    $next[] = $combined;
                    if ($count >= $node['min'] && !isset($seen[$end])) { $seen[$end] = true; $results[] = $combined; }
                    if (count($next) >= 24) break 2;
                }
                $frontier = $next;
                if (!$frontier) break;
            }
            usort($results, fn($a, $b) => $node['lazy'] ? $a['endPos'] <=> $b['endPos'] : $b['endPos'] <=> $a['endPos']);
            return array_slice($results, 0, 24);
        }
        if ($type === 'lookahead') {
            $probe = $this->expression($node['node'], $pos, $depth + 1);
            if ((bool)$probe !== $node['positive']) return [];
            $preview = $probe ? substr($this->payload, $pos, $probe[0]['endPos'] - $pos) : '';
            $note = $node['positive'] ? 'Positive lookahead matched "'.$preview.'" (zero-width)' : 'Negative lookahead satisfied (zero-width)';
            return [$this->outcome($pos, [$this->step($depth, $node['raw'], $pos, '', $note)])];
        }
        if ($type === 'lookbehind') {
            $matched = null;
            for ($start = $pos; $start >= max(0, $pos - 64); --$start) {
                foreach ($this->expression($node['node'], $start, $depth + 1) as $out) {
                    if ($out['endPos'] === $pos) { $matched = substr($this->payload, $start, $pos - $start); break 2; }
                }
            }
            if (($matched !== null) !== $node['positive']) return [];
            $note = $node['positive'] ? 'Positive lookbehind matched "'.$matched.'" (zero-width)' : 'Negative lookbehind satisfied (zero-width)';
            $step = $this->step($depth, $node['raw'], max(0, $pos - 12), '', $note, min(12, $pos) + 8);
            return [$this->outcome($pos, [$step])];
        }
        throw new UnsupportedLogic('Unknown grammar expression node.');
    }

    private function mutationMatches(stdClass $mutation, int $pos, bool $single): array {
        $pattern = trim($mutation->patternOverride ?? '');
        if (str_starts_with($pattern, '/') && strrpos($pattern, '/') > 0) $pattern = substr($pattern, 1, strrpos($pattern, '/') - 1);
        if (str_starts_with($pattern, '^')) $pattern = substr($pattern, 1);
        if (str_ends_with($pattern, '$') && !str_ends_with($pattern, '\\$')) $pattern = substr($pattern, 0, -1);
        $matches = [];
        $add = static function (?string $value) use (&$matches): void {
            if ($value !== null && !in_array($value, $matches, true)) $matches[] = $value;
        };
        if ($mutation->jsonType === 'number' && $pattern !== '' && !$single
            && preg_match('/^(?:\[0-9\]|\\\\d|\(\[0-9\]\)|\(\\\\d\)|\(?\d(?:\|\d)+\)?)$/', $pattern)) {
            $value = $this->regex('(?:'.$pattern.')+', $pos);
            if ($value !== null) for ($length = strlen($value); $length >= 1; --$length) $add(substr($value, 0, $length));
        }
        if ($pattern !== '') $add($this->regex($pattern, $pos));
        elseif ($mutation->jsonType === 'number') $add($this->regex('-?\d+(?:\.\d+)?', $pos));
        elseif ($mutation->jsonType === 'boolean') $add($this->regex('(?i:true|false)', $pos));
        usort($matches, fn($a, $b) => strlen($b) <=> strlen($a));
        return $matches;
    }
    private function matchRule(string $name, int $pos, int $depth, bool $repeat = false): array {
        $this->tick();
        if ($depth > 32 || !isset($this->rules[$name])) return [];
        $key = $name.'@'.$pos.'@'.($repeat ? 'r' : 'n');
        if (isset($this->active[$key])) return [];
        $this->active[$key] = true; $results = []; $seen = [];
        try {
            $rule = $this->rules[$name];
            $mutation = $this->mutations->$name ?? null;
            $activePattern = $mutation && ($mutation->enabled ?? false) && trim($mutation->patternOverride ?? '') !== '';
            $leaf = !$rule['referencedRules'];
            if ($mutation && ($mutation->enabled ?? false) && ($activePattern || ($leaf && in_array($mutation->jsonType, ['number','boolean'], true)))) {
                foreach ($this->mutationMatches($mutation, $pos, $repeat) as $value) {
                    $end = $pos + strlen($value);
                    if (isset($seen[$end])) continue;
                    $seen[$end] = true;
                    $results[] = $this->outcome($end, [
                        $this->step($depth, $name, $pos, $value, "Matched branch: '$value'", 20),
                        $this->step($depth + 1, '"'.$value.'"', $pos, $value, 'Terminal literal matched'),
                    ]);
                }
            }
            if (!$leaf || !$activePattern) {
                foreach ($this->asts[$name] as $entry) foreach ($this->expression($entry['node'], $pos, $depth + 1) as $out) {
                    $end = $out['endPos'];
                    if (isset($seen[$end])) continue;
                    $seen[$end] = true;
                    $header = $this->step($depth, $name, $pos, substr($this->payload, $pos, $end - $pos), 'Matched branch: '.$entry['raw'], 20);
                    $results[] = $this->outcome($end, array_merge([$header], $out['trace']));
                }
            }
        } finally { unset($this->active[$key]); }
        usort($results, fn($a, $b) => $b['endPos'] <=> $a['endPos']);
        return array_slice($results, 0, 24);
    }
    public function evaluate(string $start): array {
        if (!$this->rules) return ['matched'=>false, 'consumedLength'=>0, 'remaining'=>$this->payload,
            'summary'=>'No grammar rules loaded', 'detail'=>'Define at least one rule in Step 1 before evaluating.', 'trace'=>[]];
        if (!isset($this->rules[$start])) $start = array_key_first($this->rules);
        $outcomes = $this->matchRule($start, 0, 0);
        $length = strlen($this->payload);
        foreach ($outcomes as $out) if ($out['endPos'] === $length) {
            return ['matched'=>true, 'consumedLength'=>$length, 'remaining'=>'',
                'summary'=>"Valid match for <$start> ($length/$length chars)",
                'detail'=>'Consumed all '.$length.' characters across '.count($out['trace']).' expansion steps.',
                'trace'=>array_slice($out['trace'], 0, 140)];
        }
        $best = $outcomes[0] ?? null;
        if ($best && $best['endPos'] > 0) {
            $consumed = $best['endPos']; $remaining = substr($this->payload, $consumed);
            return ['matched'=>false, 'consumedLength'=>$consumed, 'remaining'=>$remaining,
                'summary'=>"Partial match ($consumed/$length chars)",
                'detail'=>"Rule <$start> matched prefix \"".substr($this->payload, 0, $consumed)."\", trailing \"$remaining\" unconsumed.",
                'trace'=>array_slice($best['trace'], 0, 140)];
        }
        $input = $this->payload !== '' ? $this->payload : '(empty)';
        return ['matched'=>false, 'consumedLength'=>0, 'remaining'=>$this->payload,
            'summary'=>"No match for <$start>", 'detail'=>"Input \"$input\" did not satisfy any branch of <$start>.",
            'trace'=>[['depth'=>0, 'rule'=>$start, 'inputSlice'=>substr($this->payload, 0, 20),
                'matched'=>false, 'consumed'=>'', 'note'=>'No alternative matched from offset 0']]];
    }
}

function grammar_schema_json(array $rules, stdClass $workspace): string {
    $schema = $workspace->schemaConfig;
    $dialect = $workspace->dialect;
    $policy = $workspace->mutationPolicy;
    $name = trim($schema->schemaName);
    if ($name === '') $name = 'CustomGrammarSchema';
    $definitions = new stdClass();
    $terms = [];
    foreach ($rules as $index => $rule) {
        $ruleName = $rule['name'];
        $locked = in_array($ruleName, $policy->lockedRules, true);
        $mutation = $workspace->mutations->$ruleName ?? null;
        $config = $workspace->ruleConfigs->$ruleName ?? null;
        $apply = ($mutation->enabled ?? false) && !$locked;
        $property = $apply && trim($mutation->targetProperty) !== '' ? trim($mutation->targetProperty) : $ruleName;
        $expression = grammar_normalize_expression($rule['expression']);
        $alternatives = array_map('grammar_normalize_expression', $rule['alternatives']);
        $precedence = $config->precedence ?? $index + 1;
        $associativity = $config->associativity ?? 'left';
        $order = ['precedence'=>$precedence, 'associativity'=>$associativity];
        $additional = [];
        foreach (['expression'=>$expression, 'alternatives'=>$alternatives, 'references'=>$rule['referencedRules'],
            'precedence'=>$precedence, 'associativity'=>$associativity] as $key => $value) {
            $additional[] = ['@type'=>'PropertyValue', 'name'=>$key, 'value'=>$value];
        }
        foreach ($config->properties ?? [] as $item) {
            if (trim($item->name) !== '') $additional[] = ['@type'=>'PropertyValue', 'name'=>trim($item->name), 'value'=>$item->value];
        }
        $description = $mutation->description ?? '';
        $term = ['@type'=>'DefinedTerm', 'termCode'=>$property, 'name'=>$ruleName,
            'description'=>$description !== '' ? $description : 'Production rule at line '.$rule['lineNumber'],
            'inDefinedTermSet'=>$name, 'x-locked'=>$locked, 'x-order-of-operations'=>$order, 'additionalProperty'=>$additional];
        if ($schema->includePotentialActions && count($alternatives) > 1) {
            $term['potentialAction'] = ['@type'=>'ChooseAction', 'name'=>"Select branch for $property", 'actionOption'=>$alternatives];
        }
        $terms[] = $term;
        if ($schema->includeJsonSchemaDefs) {
            $definition = ['type'=>$apply ? $mutation->jsonType : 'string',
                'description'=>$description !== '' ? $description : $expression,
                'x-grammar-rule'=>$ruleName, 'x-grammar-expression'=>$expression,
                'x-mutation-locked'=>$locked, 'x-order-of-operations'=>$order];
            if ($apply && ($mutation->patternOverride ?? '') !== '') $definition['pattern'] = $mutation->patternOverride;
            elseif ($rule['literals'] && !$rule['referencedRules']) $definition['enum'] = $rule['literals'];
            $definitions->$property = $definition;
        }
    }
    $schemaType = trim($schema->schemaOrgType);
    $schemaDraft = trim($schema->schemaStoreDraft);
    $root = ['@context'=>'https://schema.org', '@type'=>$schemaType !== '' ? $schemaType : 'DefinedTermSet',
        'name'=>$name, '$schema'=>$schemaDraft !== '' ? $schemaDraft : 'https://json-schema.org/draft/2020-12/schema',
        '$id'=>'https://grammar2json.studio/schemas/'.str_replace(['%21','%27','%28','%29','%2A'], ['!',"'",'(',')','*'], rawurlencode($name)).'.schema.json',
        'x-dialect'=>['preset'=>$dialect->preset, 'ruleOperator'=>$dialect->ruleOperator,
            'choiceDelimiter'=>$dialect->choiceDelimiter, 'commentPrefix'=>$dialect->commentPrefix],
        'x-mutation-policy'=>['allowImportMutation'=>$policy->allowImportMutation,
            'allowExportMutation'=>$policy->allowExportMutation, 'allowedTargets'=>$policy->allowedTargets, 'lockedRules'=>$policy->lockedRules],
        'hasDefinedTerm'=>$terms];
    if ($schema->preset === 'softwareSource') {
        $root['programmingLanguage'] = strtoupper($dialect->preset);
        $root['codeRepository'] = 'grammar2json-studio';
    }
    if ($schema->includeJsonSchemaDefs) $root['$defs'] = $definitions;
    $json = json_encode($root, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS);
    return preg_replace_callback('/^ +/m', fn($match) => str_repeat(' ', intdiv(strlen($match[0]), 2)), $json);
}

function workspace_python_literal(string $value): string {
    if (!str_contains($value, "\n")) {
        if (str_contains($value, '"') && !str_contains($value, "'")) return "'".$value."'";
        if (!str_contains($value, '"')) return '"'.$value.'"';
    }
    return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS);
}
function workspace_rust_literal(string $value): string {
    if (str_contains($value, '"') || str_contains($value, '\\')) {
        if (!str_contains($value, '"#')) return 'r#"'.$value.'"#';
        if (!str_contains($value, '"##')) return 'r##"'.$value.'"##';
    }
    return '"'.$value.'"';
}
function workspace_python_source(array $rules, stdClass $workspace): string {
    $schema = $workspace->schemaConfig;
    $safeName = preg_replace('/[^A-Za-z0-9_]/', '_', $schema->schemaName !== '' ? $schema->schemaName : 'CustomGrammarSchema');
    $schemaType = $schema->schemaOrgType !== '' ? $schema->schemaOrgType : 'DefinedTermSet';
    $entries = []; $orders = []; $properties = []; $cliNames = []; $cliValues = [];
    foreach ($rules as $index=>$rule) {
        $name = $rule['name']; $config = $workspace->ruleConfigs->$name ?? null;
        $entries[] = '    '.workspace_python_literal($name).': '.workspace_python_literal(grammar_normalize_expression($rule['expression'])).',';
        $orders[] = '    ('.($config->precedence ?? $index + 1).', '.workspace_python_literal($name).', '.workspace_python_literal($config->associativity ?? 'left').'),';
        $props = [];
        foreach ($config->properties ?? [] as $prop) {
            if (trim($prop->name) === '') continue;
            $props[] = workspace_python_literal($prop->name).': '.workspace_python_literal($prop->value);
            $trimmed = trim($prop->name);
            if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/D', $trimmed) && !in_array($trimmed, $cliNames, true)) $cliNames[] = $trimmed;
        }
        $properties[] = '    '.workspace_python_literal($name).': {'.implode(', ', $props).'},';
    }
    foreach ($cliNames as $name) {
        $value = '';
        foreach ($rules as $rule) {
            $config = $workspace->ruleConfigs->{$rule['name']} ?? null;
            foreach ($config->properties ?? [] as $prop) {
                if (trim($prop->name) === $name) { $value = $prop->value; break 2; }
            }
        }
        $cliValues[] = '    ('.workspace_python_literal($name).', '.workspace_python_literal($value).'),';
    }
    $base = '# Auto-generated Python AST module for '.$safeName."\n"
        .'SCHEMA_NAME = '.workspace_python_literal($safeName)."\n"
        .'SCHEMA_TYPE = '.workspace_python_literal($schemaType)."\n"
        .'RULE_COUNT = '.count($rules)."\n\nGRAMMAR_RULES = {\n"
        .($entries ? implode("\n", $entries) : '    "start": "\'ok\'",')
        ."\n}\n\ndef get_rule_count():\n    return RULE_COUNT\n\ndef validate_rule(rule_name):\n    return rule_name in GRAMMAR_RULES\n";
    $body = <<<'PYTHON'

ORDER_OF_OPERATIONS = [
{{orders}}
]

RULE_PROPERTIES = {
{{properties}}
}

CLI_NAMED_PARAMETERS = [
{{cliValues}}
]

def _coerce_cli_value(raw: str):
    t = raw.strip()
    if t.lower() == 'true':
        return True
    if t.lower() == 'false':
        return False
    try:
        return int(t) if t.lstrip('-').isdigit() else float(t)
    except ValueError:
        return t

def run_workspace_cli(argv=None):
    """Exposes named rule properties as literal CLI options, allows editing strings, or uses defaults."""
    import argparse, json, sys
    parser = argparse.ArgumentParser(description=f"Grammar2JSON Workspace CLI ({SCHEMA_NAME})")
    parser.add_argument("--schema-name", default=SCHEMA_NAME, help=f"Edit SCHEMA_NAME string (default: {SCHEMA_NAME})")
    parser.add_argument("--rule", action="append", default=[], help="Override a rule string as name=expression")
    for p_name, p_default in CLI_NAMED_PARAMETERS:
        parser.add_argument(f"--{p_name}", dest=f"param__{p_name}", default=None, help=f"Literal value for '{p_name}' (default: {p_default})")
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])
    resolved_params = {
        p_name: _coerce_cli_value(getattr(args, f"param__{p_name}") if getattr(args, f"param__{p_name}") is not None else p_default)
        for p_name, p_default in CLI_NAMED_PARAMETERS
    }
    edited_rules = dict(GRAMMAR_RULES) if "GRAMMAR_RULES" in globals() else {}
    for override in args.rule:
        if "=" in override:
            k, v = override.split("=", 1)
            edited_rules[k.strip()] = v.strip()
    print(json.dumps({"schemaName": args.schema_name, "parameters": resolved_params, "ruleCount": len(ORDER_OF_OPERATIONS), "rules": edited_rules}, indent=2))

if __name__ == "__main__":
    run_workspace_cli()
PYTHON;
    return $base.strtr($body, ['{{orders}}'=>implode("\n", $orders), '{{properties}}'=>implode("\n", $properties),
        '{{cliValues}}'=>implode("\n", $cliValues)])."\n";
}

function workspace_rust_source(array $rules, stdClass $workspace): string {
    $schema = $workspace->schemaConfig;
    $originalName = $schema->schemaName !== '' ? $schema->schemaName : 'OrderActionGrammar';
    $words = trim(preg_replace('/[^A-Za-z0-9]+/', ' ', $originalName));
    $struct = $words === '' ? 'GrammarSchema' : implode('', array_map('ucfirst', preg_split('/\s+/', $words)));
    $schemaName = $schema->schemaName !== '' ? $schema->schemaName : $struct;
    $schemaType = $schema->schemaOrgType !== '' ? $schema->schemaOrgType : 'DefinedTermSet';
    $fields = []; $tuples = []; $orders = []; $properties = [];
    foreach ($rules as $index=>$rule) {
        $name = $rule['name']; $mutation = $workspace->mutations->$name ?? null;
        $property = ($mutation->enabled ?? false) && ($mutation->targetProperty ?? '') !== '' ? $mutation->targetProperty : $name;
        $property = preg_replace('/([a-z0-9])([A-Z])/', '$1_$2', $property);
        $property = trim(strtolower(preg_replace('/[^A-Za-z0-9]+/', '_', $property)), '_');
        if ($property === '') $property = 'field';
        $type = match ($mutation->jsonType ?? 'string') { 'number'=>'i64', 'boolean'=>'bool', 'array'=>'Vec<String>', default=>'String' };
        $fields[] = "    pub $property: $type,";
        $tuples[] = '    ('.workspace_rust_literal($name).', '.workspace_rust_literal(grammar_normalize_expression($rule['expression'])).'),';
        $config = $workspace->ruleConfigs->$name ?? null;
        $orders[] = '    ('.($config->precedence ?? $index + 1).', '.workspace_rust_literal($name).', '.workspace_rust_literal($config->associativity ?? 'left').'),';
        foreach ($config->properties ?? [] as $prop) if (trim($prop->name) !== '') {
            $properties[] = '    ('.workspace_rust_literal($name).', '.workspace_rust_literal($prop->name).', '.workspace_rust_literal($prop->value).'),';
        }
    }
    $base = "// Auto-generated Rust AST & Serde Schema Declaration\nuse serde::{Deserialize, Serialize};\n\n"
        .'pub const SCHEMA_NAME: &str = '.workspace_rust_literal($schemaName).";\n"
        .'pub const SCHEMA_TYPE: &str = '.workspace_rust_literal($schemaType).";\n"
        .'pub const ALLOW_IMPORT_MUTATION: bool = '.($workspace->mutationPolicy->allowImportMutation ? 'true' : 'false').";\n"
        .'pub const ALLOW_EXPORT_MUTATION: bool = '.($workspace->mutationPolicy->allowExportMutation ? 'true' : 'false').";\n\n"
        ."pub const GRAMMAR_RULES: &[(&str, &str)] = &[\n".($tuples ? implode("\n", $tuples) : '    ("start", "\'ok\'"),')
        ."\n];\n\n#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct $struct {\n"
        .($fields ? implode("\n", $fields) : '    pub start: String,')
        ."\n}\n\npub fn rule_count() -> usize {\n    GRAMMAR_RULES.len()\n}\n\n"
        ."pub fn has_rule(name: &str) -> bool {\n    GRAMMAR_RULES.iter().any(|(k, _)| *k == name)\n}\n";
    return $base."\npub const ORDER_OF_OPERATIONS: &[(u32, &str, &str)] = &[\n".implode("\n", $orders)
        ."\n];\n\npub const RULE_PROPERTIES: &[(&str, &str, &str)] = &[\n"
        .($properties ? implode("\n", $properties) : '    // Add custom rule properties in the Rule Properties workbench')."\n];\n";
}

function workspace_wat_source(array $rules, stdClass $workspace): string {
    $name = str_replace(['"', '\\'], '', $workspace->schemaConfig->schemaName !== '' ? $workspace->schemaConfig->schemaName : 'GrammarSchema');
    $names = implode(',', array_map(fn($rule) => str_replace(['"', '\\'], '', $rule['name']), array_slice($rules, 0, 8)));
    $count = count($rules); $branches = array_sum(array_map(fn($rule) => count($rule['alternatives']), $rules));
    $template = <<<'WAT'
(module
  ;; Grammar2JSON Studio — WABT S-Expression Module ({{name}})
  (memory (export "memory") 1)
  (data (i32.const 0) "schema={{name}};rules={{count}};names={{names}}")

  ;; Returns total parsed grammar rules (0 params)
  (func (export "rule_count") (result i32)
    (i32.const {{count}})
  )

  ;; Returns total choice branches across rules (0 params)
  (func (export "branch_count") (result i32)
    (i32.const {{branches}})
  )

  ;; Checks whether rule index is within bounds (1 param)
  (func (export "is_valid_rule_idx") (param $idx i32) (result i32)
    (local.get $idx)
    (i32.const {{count}})
    (i32.lt_u)
  )

  ;; Computes checksum step ($a + $b) (2 params)
  (func (export "add_score") (param $a i32) (param $b i32) (result i32)
    (local.get $a)
    (local.get $b)
    (i32.add)
  )
)
WAT;
    return strtr($template, ['{{name}}'=>$name, '{{names}}'=>$names, '{{count}}'=>(string)$count, '{{branches}}'=>(string)$branches]);
}

const HISTORY_FIELDS = ['grammar'=>'Grammar', 'mutations'=>'Mutations', 'jsonld'=>'JSON-LD', 'logic'=>'Logic / λ',
    'evaluator'=>'Evaluator', 'dsl'=>'DSL Flows', 'python'=>'Python AST', 'rust'=>'Rust AST',
    'wat'=>'WABT / WAT', 'virtualFiles'=>'Virtual file edits'];

// Generated from the workspace export templates; kept in PHP for standalone installations.
const WORKSPACE_EXPORT_TEMPLATES = <<<'WORKSPACE_EXPORT_TEMPLATES'
{"javascript":"// Auto-generated JavaScript (ESM) Grammar & Order-of-Operations Module ({{slug}})\n// Exposes named parameters (--<name> <literal>), editable strings (--schema-name, --rule name=expr), or defaults.\nexport const SCHEMA_NAME = {{quotedSlug}};\nexport const DIALECT_PRESET = {{quotedDialect}};\n\nexport const GRAMMAR_RULES = {{compiled}};\n\nexport function getRuleOrderOfOperations() {\n  return [...GRAMMAR_RULES]\n    .sort((a, b) => a.precedence - b.precedence)\n    .map((rule) => rule.name);\n}\n\nexport function runWorkspaceCli(argv = typeof process !== 'undefined' ? process.argv.slice(2) : []) {\n  let schemaName = SCHEMA_NAME;\n  const overrides = {};\n  const rules = GRAMMAR_RULES.map((r) => ({ ...r, properties: { ...r.properties } }));\n  for (let i = 0; i < argv.length; i += 1) {\n    const arg = argv[i];\n    if (!arg.startsWith('--')) continue;\n    const body = arg.slice(2);\n    const eq = body.indexOf('=');\n    const key = eq >= 0 ? body.slice(0, eq) : body;\n    const val = eq >= 0 ? body.slice(eq + 1) : argv[++i];\n    if (key === 'schema-name' && val !== undefined) schemaName = val;\n    else if (key === 'rule' && val && val.includes('=')) {\n      const idx = val.indexOf('=');\n      const rName = val.slice(0, idx).trim();\n      const rExpr = val.slice(idx + 1).trim();\n      const hit = rules.find((r) => r.name === rName);\n      if (hit) hit.expression = rExpr;\n    } else if (val !== undefined) {\n      const coerced = val === 'true' ? true : val === 'false' ? false : !Number.isNaN(Number(val)) ? Number(val) : val;\n      overrides[key.replace(/-/g, '_')] = coerced;\n    }\n  }\n  const out = { schemaName, dialect: DIALECT_PRESET, overrides, rules };\n  console.log(JSON.stringify(out, null, 2));\n  return out;\n}\n","go":"// Auto-generated Go Grammar & Order-of-Operations Package ({{slug}})\npackage grammar\n\ntype CompiledGrammarRule struct {\n\tName          string\n\tPrecedence    int\n\tAssociativity string\n\tExpression    string\n\tProperties    map[string]string\n}\n\nconst SchemaName = {{quotedSlug}}\nconst DialectPreset = {{quotedDialect}}\n\nvar GrammarRules = []CompiledGrammarRule{\n{{entries}}\n}\n","java":"// Auto-generated Java Grammar & Order-of-Operations Class ({{slug}})\nimport java.util.List;\nimport java.util.Map;\n\npublic final class {{className}}Grammar {\n    public record CompiledRule(\n        String name,\n        int precedence,\n        String associativity,\n        String expression,\n        Map<String, String> properties\n    ) {}\n\n    public static final String SCHEMA_NAME = {{quotedSlug}};\n    public static final String DIALECT_PRESET = {{quotedDialect}};\n\n    public static final List<CompiledRule> GRAMMAR_RULES = List.of(\n{{entries}}\n    );\n}\n","cpp":"// Auto-generated C++20 Grammar & Order-of-Operations Header ({{slug}})\n#pragma once\n#include <string>\n#include <unordered_map>\n#include <vector>\n\nnamespace grammar_studio {\n\nstruct CompiledGrammarRule {\n    std::string name;\n    int precedence;\n    std::string associativity;\n    std::string expression;\n    std::unordered_map<std::string, std::string> properties;\n};\n\ninline const std::string SCHEMA_NAME = {{quotedSlug}};\ninline const std::string DIALECT_PRESET = {{quotedDialect}};\n\ninline const std::vector<CompiledGrammarRule> GRAMMAR_RULES = {\n{{entries}}\n};\n\n} // namespace grammar_studio\n","csharp":"// Auto-generated C# (.NET) Grammar & Order-of-Operations Module ({{slug}})\nusing System.Collections.Generic;\n\nnamespace GrammarStudio;\n\npublic sealed record CompiledGrammarRule(\n    string Name,\n    int Precedence,\n    string Associativity,\n    string Expression,\n    IReadOnlyDictionary<string, string> Properties\n);\n\npublic static class {{className}}Grammar\n{\n    public const string SchemaName = {{quotedSlug}};\n    public const string DialectPreset = {{quotedDialect}};\n\n    public static readonly IReadOnlyList<CompiledGrammarRule> Rules = new List<CompiledGrammarRule>\n    {\n{{entries}}\n    };\n}\n","php":"<?php\n// Auto-generated PHP 8 Grammar & Order-of-Operations Registry ({{slug}})\ndeclare(strict_types=1);\n\nconst SCHEMA_NAME = {{quotedSlug}};\nconst DIALECT_PRESET = {{quotedDialect}};\n\nconst GRAMMAR_RULES = [\n{{entries}}\n];\n","sql":"-- Auto-generated SQL Grammar & Order-of-Operations Schema ({{slug}})\nCREATE TABLE IF NOT EXISTS grammar_rules (\n  schema_name VARCHAR(128) NOT NULL,\n  dialect_preset VARCHAR(64) NOT NULL,\n  rule_name VARCHAR(128) NOT NULL,\n  precedence INTEGER NOT NULL,\n  associativity VARCHAR(16) NOT NULL,\n  expression TEXT NOT NULL,\n  properties_json JSONB NOT NULL,\n  PRIMARY KEY (schema_name, rule_name)\n);\n\n{{entries}}\n","swift":"// Auto-generated Swift 6 Grammar & Order-of-Operations Module ({{slug}})\nimport Foundation\n\npublic struct CompiledGrammarRule: Sendable, Codable {\n    public let name: String\n    public let precedence: Int\n    public let associativity: String\n    public let expression: String\n    public let properties: [String: String]\n}\n\npublic enum {{grammarClass}}Schema {\n    public static let schemaName = {{quotedSlug}}\n    public static let dialectPreset = {{quotedDialect}}\n    public static let rules: [CompiledGrammarRule] = [\n{{entries}}\n    ]\n}\n","kotlin":"// Auto-generated Kotlin Grammar & Order-of-Operations Module ({{slug}})\npackage grammar.studio\n\ndata class CompiledGrammarRule(\n    val name: String,\n    val precedence: Int,\n    val associativity: String,\n    val expression: String,\n    val properties: Map<String, String>\n)\n\nobject {{grammarClass}}Schema {\n    const val SCHEMA_NAME = {{quotedSlug}}\n    const val DIALECT_PRESET = {{quotedDialect}}\n    val RULES: List<CompiledGrammarRule> = listOf(\n{{entries}}\n    )\n}\n","ruby":"# frozen_string_literal: true\n# Auto-generated Ruby 3 Grammar & Order-of-Operations Module ({{slug}})\nmodule GrammarStudio\n  SCHEMA_NAME = {{quotedSlug}}\n  DIALECT_PRESET = {{quotedDialect}}\n\n  GRAMMAR_RULES = [\n{{entries}}\n  ].freeze\nend\n","scala":"// Auto-generated Scala 3 Grammar & Order-of-Operations Module ({{slug}})\npackage grammar.studio\n\nfinal case class CompiledGrammarRule(\n  name: String,\n  precedence: Int,\n  associativity: String,\n  expression: String,\n  properties: Map[String, String]\n)\n\nobject {{grammarClass}}Schema:\n  val schemaName: String = {{quotedSlug}}\n  val dialectPreset: String = {{quotedDialect}}\n  val rules: List[CompiledGrammarRule] = List(\n{{entries}}\n  )\n","haskell":"-- Auto-generated Haskell Grammar & Order-of-Operations Module ({{slug}})\nmodule GrammarStudio where\n\ndata CompiledRule = CompiledRule\n  { ruleName :: String\n  , rulePrecedence :: Int\n  , ruleAssociativity :: String\n  , ruleExpression :: String\n  , ruleProperties :: [(String, String)]\n  } deriving (Show, Eq)\n\nschemaName :: String\nschemaName = {{quotedSlug}}\n\ndialectPreset :: String\ndialectPreset = {{quotedDialect}}\n\ngrammarRules :: [CompiledRule]\ngrammarRules =\n  [\n{{entries}}\n  ]\n","elixir":"# Auto-generated Elixir Grammar & Order-of-Operations Module ({{slug}})\ndefmodule GrammarStudio.Schema do\n  @schema_name {{quotedSlug}}\n  @dialect_preset {{quotedDialect}}\n\n  def schema_name, do: @schema_name\n  def dialect_preset, do: @dialect_preset\n\n  def grammar_rules do\n    [\n{{entries}}\n    ]\n  end\nend\n","lua":"-- Auto-generated Lua 5.4 Grammar & Order-of-Operations Module ({{slug}})\nlocal M = {}\n\nM.SCHEMA_NAME = {{quotedSlug}}\nM.DIALECT_PRESET = {{quotedDialect}}\nM.GRAMMAR_RULES = {\n{{entries}}\n}\n\nreturn M\n","zig":"// Auto-generated Zig Grammar & Order-of-Operations Module ({{slug}})\npub const CompiledGrammarRule = struct {\n    name: []const u8,\n    precedence: u32,\n    associativity: []const u8,\n    expression: []const u8,\n};\n\npub const SCHEMA_NAME: []const u8 = {{quotedSlug}};\npub const DIALECT_PRESET: []const u8 = {{quotedDialect}};\n\npub const GRAMMAR_RULES = [_]CompiledGrammarRule{\n{{entries}}\n};\n","dart":"// Auto-generated Dart 3 Grammar & Order-of-Operations Module ({{slug}})\nclass CompiledGrammarRule {\n  final String name;\n  final int precedence;\n  final String associativity;\n  final String expression;\n  final Map<String, String> properties;\n  const CompiledGrammarRule({\n    required this.name,\n    required this.precedence,\n    required this.associativity,\n    required this.expression,\n    required this.properties,\n  });\n}\n\nconst String schemaName = {{quotedSlug}};\nconst String dialectPreset = {{quotedDialect}};\n\nconst List<CompiledGrammarRule> grammarRules = [\n{{entries}}\n];\n","ocaml":"(* Auto-generated OCaml Grammar & Order-of-Operations Module ({{slug}}) *)\ntype compiled_rule = {\n  name : string;\n  precedence : int;\n  associativity : string;\n  expression : string;\n  properties : (string * string) list;\n}\n\nlet schema_name = {{quotedSlug}}\nlet dialect_preset = {{quotedDialect}}\n\nlet grammar_rules : compiled_rule list = [\n{{entries}}\n]\n","typescript":"// Auto-generated TypeScript Grammar & Order-of-Operations Module ({{slug}})\nexport interface CompiledGrammarRule {\n  name: string;\n  precedence: number;\n  associativity: 'left' | 'right' | 'none';\n  expression: string;\n  alternatives: string[];\n  properties: Record<string, string>;\n}\n\nexport const SCHEMA_NAME = '{{slug}}';\nexport const DIALECT_PRESET = '{{dialect}}';\n\nexport const GRAMMAR_RULES: CompiledGrammarRule[] = {{compiled}};\n\nexport function getRuleOrderOfOperations(): string[] {\n  return [...GRAMMAR_RULES]\n    .sort((a, b) => a.precedence - b.precedence)\n    .map((rule) => rule.name);\n}\n"}
WORKSPACE_EXPORT_TEMPLATES;

function workspace_other_export(string $language, array $rules, stdClass $workspace, string $slug): ?array {
    $templates = json_decode(WORKSPACE_EXPORT_TEMPLATES, true, 16, JSON_THROW_ON_ERROR);
    if (!isset($templates[$language])) return null;
    $quote = static fn($value) => json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS);
    $compiled = []; $entries = [];
    foreach ($rules as $index=>$rule) {
        $name = $rule['name']; $config = $workspace->ruleConfigs->$name ?? null; $properties = new stdClass();
        foreach ($config->properties ?? [] as $prop) if (trim($prop->name) !== '') $properties->{trim($prop->name)} = $prop->value;
        $compiled[] = ['name'=>$name, 'precedence'=>$config->precedence ?? $index + 1,
            'associativity'=>$config->associativity ?? 'left', 'expression'=>grammar_normalize_expression($rule['expression']),
            'alternatives'=>array_map('grammar_normalize_expression', $rule['alternatives']), 'properties'=>$properties];
    }
    foreach ($compiled as $rule) {
        $n = $quote($rule['name']); $p = $rule['precedence']; $a = $quote($rule['associativity']); $e = $quote($rule['expression']);
        $pairs = [];
        foreach ($rule['properties'] as $key=>$value) $pairs[] = [$quote((string)$key), $quote($value)];
        $joined = static fn(string $separator, string $between, string $left = '', string $right = '') =>
            implode($between, array_map(fn($pair) => $left.$pair[0].$separator.$pair[1].$right, $pairs));
        $entries[] = match ($language) {
            'go'=>"\t{Name: $n, Precedence: $p, Associativity: $a, Expression: $e, Properties: map[string]string{".$joined(': ', ', ')." }},",
            'java'=>"        new CompiledRule($n, $p, $a, $e, Map.ofEntries(".$joined(', ', ', ', 'Map.entry(', ')').'))',
            'cpp'=>"    {{$n}, $p, $a, $e, {".$joined(', ', ', ', '{', '}').'}},',
            'csharp'=>"        new($n, $p, $a, $e, new Dictionary<string, string> { ".$joined('] = ', ', ', '[')." }),",
            'php'=>"    [\n        'name' => $n,\n        'precedence' => $p,\n        'associativity' => $a,\n        'expression' => $e,\n        'properties' => [".$joined(' => ', ', ')."],\n    ],",
            'sql'=>"INSERT INTO grammar_rules (schema_name, dialect_preset, rule_name, precedence, associativity, expression, properties_json)\nVALUES ("
                .implode(', ', array_map(fn($s) => "'".str_replace("'", "''", $s)."'", [$slug, $workspace->dialect->preset, $rule['name']]))
                .", $p, '".str_replace("'", "''", $rule['associativity'])."', '".str_replace("'", "''", $rule['expression'])
                ."', '".str_replace("'", "''", $quote($rule['properties']))."');",
            'swift'=>"    CompiledGrammarRule(name: $n, precedence: $p, associativity: $a, expression: $e, properties: [".($pairs ? $joined(': ', ', ') : ':').'])',
            'kotlin'=>"    CompiledGrammarRule($n, $p, $a, $e, mapOf(".$joined(' to ', ', ').'))',
            'ruby'=>"    { name: $n, precedence: $p, associativity: $a, expression: $e, properties: { ".$joined(' => ', ', ')." } }",
            'scala'=>"    CompiledGrammarRule($n, $p, $a, $e, Map(".$joined(' -> ', ', ').'))',
            'haskell'=>"  CompiledRule $n $p $a $e [".$joined(', ', ', ', '(', ')').']',
            'elixir'=>"    %{name: $n, precedence: $p, associativity: $a, expression: $e, properties: %{".$joined(' => ', ', ').'}}',
            'lua'=>"  { name = $n, precedence = $p, associativity = $a, expression = $e, properties = { ".$joined('] = ', ', ', '[')." } }",
            'zig'=>"    .{ .name = $n, .precedence = $p, .associativity = $a, .expression = $e },",
            'dart'=>"  CompiledGrammarRule(name: $n, precedence: $p, associativity: $a, expression: $e, properties: {".$joined(': ', ', ').'}),',
            'ocaml'=>"  { name = $n; precedence = $p; associativity = $a; expression = $e; properties = [".$joined(', ', '; ', '(', ')').'] }',
            default=>'',
        };
    }
    if ($language === 'go') $entries = array_map(fn($entry) => str_replace(' }},', '}},', $entry), $entries);
    $separator = match ($language) {
        'java','swift','kotlin','ruby','scala','elixir','lua'=>",\n",
        'haskell'=>"\n  , ", 'ocaml'=>";\n", 'sql'=>"\n\n", default=>"\n",
    };
    $compiledJson = json_encode($compiled, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS);
    $compiledJson = preg_replace_callback('/^ +/m', fn($m) => str_repeat(' ', intdiv(strlen($m[0]), 2)), $compiledJson);
    $class = preg_replace('/[^A-Za-z0-9]/', '', $slug);
    $content = strtr($templates[$language], ['{{slug}}'=>$slug, '{{dialect}}'=>$workspace->dialect->preset,
        '{{quotedSlug}}'=>$quote($slug), '{{quotedDialect}}'=>$quote($workspace->dialect->preset),
        '{{compiled}}'=>$compiledJson, '{{className}}'=>$class !== '' ? $class : 'GrammarSchema',
        '{{grammarClass}}'=>$class !== '' ? $class : 'Grammar', '{{entries}}'=>implode($separator, $entries)]);
    [$filename, $mime, $label] = match ($language) {
        'javascript'=>["$slug.mjs", 'text/javascript', 'JavaScript (.mjs)'],
        'typescript'=>["$slug.ts", 'text/typescript', 'TypeScript (.ts)'],
        'go'=>["$slug.go", 'text/plain', 'Go (.go)'],
        'java'=>[($class !== '' ? $class : 'GrammarSchema').'Grammar.java', 'text/plain', 'Java (.java)'],
        'cpp'=>["$slug.hpp", 'text/plain', 'C++ (.hpp)'],
        'csharp'=>[($class !== '' ? $class : 'GrammarSchema').'Grammar.cs', 'text/plain', 'C# (.cs)'],
        'php'=>["$slug.php", 'application/x-httpd-php', 'PHP (.php)'],
        'sql'=>["$slug.sql", 'application/sql', 'SQL (.sql)'],
        'swift'=>["$slug.swift", 'text/plain', 'Swift (.swift)'],
        'kotlin'=>["$slug.kt", 'text/plain', 'Kotlin (.kt)'],
        'ruby'=>["$slug.rb", 'text/plain', 'Ruby (.rb)'],
        'scala'=>["$slug.scala", 'text/plain', 'Scala (.scala)'],
        'haskell'=>["$slug.hs", 'text/plain', 'Haskell (.hs)'],
        'elixir'=>["$slug.ex", 'text/plain', 'Elixir (.ex)'],
        'lua'=>["$slug.lua", 'text/plain', 'Lua (.lua)'],
        'zig'=>["$slug.zig", 'text/plain', 'Zig (.zig)'],
        'dart'=>["$slug.dart", 'text/plain', 'Dart (.dart)'],
        'ocaml'=>["$slug.ml", 'text/plain', 'OCaml (.ml)'],
    };
    return ['content'=>$content, 'filename'=>$filename, 'mime'=>$mime, 'label'=>$label];
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

function mcp_logic_tool(bool $unified): array {
    return [
        'name'=>($unified ? 'logic_calc__' : '').'evaluate_logic_lambda',
        'description'=>'Evaluate a logic, arithmetic, or lambda statement using the PHP logic evaluator.',
        'inputSchema'=>[
            'type'=>'object',
            'properties'=>[
                'statement'=>['type'=>'string'], 'labels'=>['type'=>'array'],
                'logic_statement'=>['type'=>'string'], 'logic_labels'=>['type'=>'string'],
                'input'=>['type'=>'string'], 'values'=>['type'=>'array'],
            ],
        ],
    ];
}

function serve_logic_mcp(string $route, string $method): never {
    $unified = $route === 'api/mcp';
    if (!$unified && in_array($method, ['GET','HEAD'], true)) {
        api_json(503, ['error'=>'PHP MCP server discovery is not yet implemented.']);
    }
    if ($method !== 'POST') {
        header('Allow: POST, OPTIONS');
        api_json(405, ['error'=>'Method not allowed.']);
    }
    try {
        $request = logic_request_object();
        $id = $request->id ?? null;
        if (($request->jsonrpc ?? null) !== '2.0' || !is_string($request->method ?? null)
            || !(is_string($id) || is_int($id) || $id === null)) {
            api_json(400, ['jsonrpc'=>'2.0', 'id'=>null, 'error'=>['code'=>-32600,'message'=>'Invalid JSON-RPC 2.0 request.']]);
        }
        if (!property_exists($request, 'id')) {
            http_response_code(202);
            header('Cache-Control: no-store');
            exit;
        }
        $reply = ['jsonrpc'=>'2.0', 'id'=>$id];
        if ($request->method === 'initialize') {
            $capabilities = ['tools'=>['listChanged'=>false]];
            if (!$unified) $capabilities['resources'] = ['subscribe'=>false, 'listChanged'=>false];
            api_json(200, [...$reply, 'result'=>[
                'protocolVersion'=>'2025-03-26', 'capabilities'=>$capabilities,
                'serverInfo'=>['name'=>$unified ? 'grammar2json-unified-mcp' : 'grammar2json-logic_calc-mcp', 'version'=>'2.2.0'],
            ]]);
        }
        if ($request->method === 'ping') api_json(200, [...$reply, 'result'=>new stdClass()]);
        if ($request->method === 'tools/list') api_json(200, [...$reply, 'result'=>['tools'=>[mcp_logic_tool($unified)]]]);
        if (!$unified && $request->method === 'resources/list') {
            api_json(200, [...$reply, 'result'=>['resources'=>[[
                'uri'=>'grammar2json://logic_calc/artifact',
                'name'=>'Symbolic Logic & Lambda Calculus MCP Server Active Artifact',
                'mimeType'=>'text/plain',
                'description'=>'The current PHP logic statement and label bindings.',
            ]]]]);
        }
        if (!$unified && $request->method === 'resources/read') {
            $params = $request->params ?? null;
            if (!$params instanceof stdClass || !is_string($params->uri ?? null)) {
                api_json(200, [...$reply, 'error'=>['code'=>-32602, 'message'=>'Resource read requires a URI.']]);
            }
            if ($params->uri !== 'grammar2json://logic_calc/artifact') {
                api_json(200, [...$reply, 'error'=>['code'=>-32002, 'message'=>'Resource not found.']]);
            }
            $state = logic_state(logic_store());
            $text = json_encode(['statement'=>$state['statement'], 'labels'=>$state['labels']],
                JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS);
            $text = preg_replace_callback('/^ +/m', fn($match) => str_repeat(' ', intdiv(strlen($match[0]), 2)), $text);
            api_json(200, [...$reply, 'result'=>['contents'=>[['uri'=>$params->uri, 'mimeType'=>'text/plain', 'text'=>$text]]]]);
        }
        if ($request->method !== 'tools/call') api_json(200, [...$reply, 'error'=>['code'=>-32601, 'message'=>'Unsupported MCP method: '.$request->method]]);
        $params = $request->params ?? null;
        if (!$params instanceof stdClass || !is_string($params->name ?? null)
            || (isset($params->arguments) && !$params->arguments instanceof stdClass)) {
            api_json(200, [...$reply, 'error'=>['code'=>-32602, 'message'=>'Tool call requires a name and object arguments.']]);
        }
        if ($params->name !== mcp_logic_tool($unified)['name']) api_json(200, [...$reply, 'error'=>['code'=>-32601, 'message'=>'Unknown or unported MCP tool.']]);
        $args = $params->arguments ?? new stdClass();
        try {
            $state = logic_state(logic_store());
            [$statement, $labels] = normalized_input($args, 0, $state);
            $evaluated = null; $truthTable = null;
            $evaluation = evaluate_statement($statement, $labels, $evaluated, $truthTable);
            $payload = ['statement'=>$statement, 'astFormatted'=>format_ast(parse_logic($statement)), 'truthTable'=>$truthTable, ...$evaluation];
        } catch (InputError $error) {
            $message = $error->getMessage();
            $code = preg_match('/^(Ambiguous|Do not mix)/', $message) ? 'ambiguous_input' : 'invalid_input';
            $payload = ['ok'=>false, 'error'=>$message, 'diagnostics'=>[['code'=>$code, 'message'=>$message]]];
        } catch (UnsupportedLogic $error) {
            $payload = ['ok'=>false, 'error'=>'PHP logic evaluator cannot handle this input: '.$error->getMessage()];
        }
        $encoded = json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        api_json(200, [...$reply, 'result'=>[
            'content'=>[['type'=>'text', 'text'=>$encoded]], 'structuredContent'=>$payload, 'isError'=>!$payload['ok'],
        ]]);
    } catch (InputError $error) {
        api_json(400, ['jsonrpc'=>'2.0', 'id'=>null, 'error'=>['code'=>-32600, 'message'=>$error->getMessage()]]);
    } catch (LogicStorageError $error) {
        api_json(503, ['jsonrpc'=>'2.0', 'id'=>$id ?? null, 'error'=>['code'=>-32000, 'message'=>$error->getMessage()]]);
    } catch (JsonException $error) {
        error_log('MCP response encoding failed: '.$error->getMessage());
        api_json(500, ['jsonrpc'=>'2.0', 'id'=>$id ?? null, 'error'=>['code'=>-32603, 'message'=>'MCP response encoding failed.']]);
    }
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

function grammar_rule_members(array $rule, array $rules, stdClass $workspace, string $prefix): array {
    $name = $rule['name'];
    $config = $workspace->ruleConfigs->$name ?? (object)['precedence'=>$rule['lineNumber'], 'associativity'=>'left', 'properties'=>[]];
    $mutation = $workspace->mutations->$name ?? null;
    $locked = in_array($name, $workspace->mutationPolicy->lockedRules ?? [], true);
    $indegree = 0;
    foreach ($rules as $other) if (in_array($name, $other['referencedRules'], true)) ++$indegree;
    $items = [
        'expression'=>[$rule['expression'], !$locked, 'Locked by x-mutation-policy'],
        'precedence'=>[$config->precedence, !$locked, 'Locked by x-mutation-policy'],
        'associativity'=>[$config->associativity, !$locked, 'Locked by x-mutation-policy'],
        'properties'=>[$config->properties, !$locked, 'Locked by x-mutation-policy'],
        'mutation'=>[$mutation, !$locked, 'Locked by x-mutation-policy'],
        'locked'=>[$locked, true, ''],
        'id'=>[$rule['id'], false, 'Immutable structural rule identifier'],
        'name'=>[$name, false, 'Use PUT /api/rules/:name with nextName to rename'],
        'lineNumber'=>[$rule['lineNumber'], false, 'Derived from grammar source line index'],
        'alternatives'=>[$rule['alternatives'], false, 'Computed from expression AST'],
        'referencedRules'=>[$rule['referencedRules'], false, 'Computed DAG out-edges'],
        'undefinedReferences'=>[$rule['undefinedReferences'], false, 'Computed DAG diagnostic'],
        'literals'=>[$rule['literals'], false, 'Extracted terminal literals'],
        'usedOperators'=>[grammar_operators($rule['expression'], $workspace->dialect), false, 'Detected Extended DAG operator symbols'],
        'inDegree'=>[$indegree, false, 'Computed DAG in-degree'],
        'outDegree'=>[count($rule['referencedRules']) + count($rule['undefinedReferences']), false, 'Computed DAG out-degree'],
        'rawLine'=>[$rule['rawLine'], false, 'Derived source line'],
    ];
    return describe_node_members($items, 'rule', $name, $prefix);
}

function describe_node_members(array $items, string $kind, string $name, string $prefix): array {
    $encoded = rawurlencode($name); $href = $prefix.'/api/nodes/'.$kind.'/'.$encoded;
    $members = [];
    foreach ($items as $member=>[$value,$mutable,$reason]) {
        $memberHref = $href.'/members/'.rawurlencode($member);
        $links = [
            'self'=>['href'=>$memberHref,'method'=>'GET','title'=>"Read member '$member'",'type'=>'application/hal+json'],
            'node'=>['href'=>$href,'method'=>'GET','title'=>'Parent node'],
            'members'=>['href'=>$href.'/members','method'=>'GET','title'=>'All node members'],
        ];
        $actions = new stdClass();
        if ($mutable) {
            $links['update'] = ['href'=>$memberHref,'method'=>'PATCH','title'=>"Patch member '$member'"];
            $links['replace'] = ['href'=>$memberHref,'method'=>'PUT','title'=>"Replace member '$member'"];
            $links['reset'] = ['href'=>$memberHref,'method'=>'DELETE','title'=>"Reset/clear member '$member'"];
            $type = is_string($value) ? 'string' : (is_bool($value) ? 'boolean' : (is_int($value) || is_float($value) ? 'number' : 'object'));
            foreach (['update'=>['PATCH',"Update $member"],'replace'=>['PUT',"Replace $member"]] as $key=>[$actionMethod,$title]) {
                $actions->$key = ['name'=>$key,'title'=>$title,'href'=>$memberHref,'method'=>$actionMethod,'contentType'=>'application/json',
                    'fields'=>[['name'=>'value','type'=>$type,'required'=>true,'example'=>$value]]];
            }
            $actions->reset = ['name'=>'reset','title'=>"Clear/Reset $member",'href'=>$memberHref,'method'=>'DELETE'];
        }
        $links['pretty'] = ['href'=>$prefix.'/nodes/'.$kind.'/'.$encoded.'/members/'.rawurlencode($member),'method'=>'GET','title'=>'Extended pretty member URL'];
        $links['short'] = ['href'=>$prefix.'/members/'.rawurlencode($member).'?node='.rawurlencode($kind.'/'.$name),'method'=>'GET','title'=>'Short member URL; node query identifies its parent'];
        $valueType = $value === null ? 'null' : (is_array($value) ? 'array' : (is_string($value) ? 'string' : (is_bool($value) ? 'boolean' : (is_int($value) || is_float($value) ? 'number' : 'object'))));
        $members[$member] = ['name'=>$member,'value'=>$value,'valueType'=>$valueType,'mutable'=>$mutable,
            ...(!$mutable ? ['readOnlyReason'=>$reason] : []),
            'allowedMethods'=>$mutable ? ['GET','HEAD','OPTIONS','PUT','PATCH','DELETE'] : ['GET','HEAD','OPTIONS'],
            '_links'=>$links,'_actions'=>$actions];
    }
    return $members;
}

const GRAMMAR_SYMBOL_LABELS = [
    'oneOrMore'=>'One or More (+)', 'zeroOrMore'=>'Zero or More (*)', 'optional'=>'Optional (?)',
    'repeatBraces'=>'Bounded / EBNF Braces', 'groupParens'=>'Group Parens', 'charClassBrackets'=>'Char Class / Opt Brackets',
    'posLookahead'=>'Pos Lookahead', 'negLookahead'=>'Neg Lookahead', 'posLookbehind'=>'Pos Lookbehind',
    'negLookbehind'=>'Neg Lookbehind', 'wildcard'=>'Wildcard', 'regexDelimiter'=>'Inline Regex',
];
const GRAMMAR_DEFAULT_SYMBOLS = [
    'oneOrMore'=>'+', 'zeroOrMore'=>'*', 'optional'=>'?', 'repeatBraces'=>'{}', 'groupParens'=>'()',
    'charClassBrackets'=>'[]', 'posLookahead'=>'&', 'negLookahead'=>'!', 'posLookbehind'=>'(?<=',
    'negLookbehind'=>'(?<!', 'wildcard'=>'.', 'regexDelimiter'=>'/',
];

function dialect_preset(string $name): stdClass {
    $presets = [
        'ebnf'=>['::=','|','//'], 'bnf'=>['::=','|','#'], 'peg'=>['=','/','#'],
        'python_peg'=>[':','|','#'], 'rust_macro'=>['=>','|','//'], 'wat_sexpr'=>[':=','|',';;'],
    ];
    if (!isset($presets[$name])) throw new InputError('Unknown dialect preset.');
    [$operator,$choice,$comment] = $presets[$name];
    $symbols = GRAMMAR_DEFAULT_SYMBOLS;
    if ($name === 'peg') $symbols['regexDelimiter'] = '';
    return (object)['preset'=>$name,'ruleOperator'=>$operator,'choiceDelimiter'=>$choice,'commentPrefix'=>$comment,'symbols'=>(object)$symbols];
}

function grammar_symbols(stdClass $workspace): array {
    $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
    $symbols = $workspace->dialect->symbols ?? new stdClass();
    $counts = array_fill_keys(array_keys(GRAMMAR_SYMBOL_LABELS), 0);
    foreach ($rules as $rule) foreach (grammar_operators($rule['expression'], $workspace->dialect) as $operator) {
        $key = explode(':', $operator, 2)[0];
        ++$counts[$key];
    }
    $result = [];
    foreach (GRAMMAR_SYMBOL_LABELS as $key=>$label) {
        $value = is_string($symbols->$key ?? null) ? trim($symbols->$key) : '';
        $result[] = ['key'=>$key, 'label'=>$label, 'value'=>$value, 'enabled'=>$value !== '', 'usageCount'=>$counts[$key]];
    }
    return $result;
}

function symbol_node(array $symbol, string $prefix): array {
    $id = $symbol['key']; $href = $prefix.'/api/nodes/symbol/'.rawurlencode($id);
    $members = describe_node_members([
        'value'=>[$symbol['value'],true,''], 'key'=>[$id,false,'Immutable symbol registry key'],
        'label'=>[$symbol['label'],false,'Immutable symbol specification label'],
        'enabled'=>[$symbol['enabled'],false,'Derived from non-empty symbol value'],
        'usageCount'=>[$symbol['usageCount'],false,'Computed Extended DAG usage count'],
    ], 'symbol', $id, $prefix);
    return ['kind'=>'symbol','id'=>$id,'label'=>'Symbol: '.$symbol['label'],'href'=>$href,'mutableCount'=>1,'immutableCount'=>4,'members'=>$members,
        '_links'=>['self'=>['href'=>$href,'method'=>'GET'],'members'=>['href'=>$href.'/members','method'=>'GET'],
            'collection'=>['href'=>$prefix.'/api/symbols','method'=>'GET'],
            'pretty'=>['href'=>$prefix.'/nodes/symbol/'.rawurlencode($id),'method'=>'GET','title'=>'Pretty node URL']],
        '_actions'=>['setSymbolValue'=>['name'=>'setSymbolValue','title'=>"Set or Disable $id (empty string disables)",
            'href'=>$href.'/members/value','method'=>'PATCH','contentType'=>'application/json',
            'fields'=>[['name'=>'value','type'=>'string','required'=>true,'example'=>$symbol['value']]]]]];
}

function rule_node(array $rule, array $rules, stdClass $workspace, string $prefix): array {
    $name = $rule['name']; $href = $prefix.'/api/nodes/rule/'.rawurlencode($name);
    $members = grammar_rule_members($rule, $rules, $workspace, $prefix);
    $mutable = count(array_filter($members, fn($member) => $member['mutable']));
    $resource = $prefix.'/api/rules/'.rawurlencode($name);
    return ['kind'=>'rule','id'=>$name,'label'=>"<$name>",'href'=>$href,'mutableCount'=>$mutable,
        'immutableCount'=>count($members)-$mutable,'members'=>$members,
        '_links'=>['self'=>['href'=>$href,'method'=>'GET','title'=>"Inspect rule node <$name>"],
            'members'=>['href'=>$href.'/members','method'=>'GET','title'=>'All mutable & immutable members'],
            'ruleResource'=>['href'=>$resource,'method'=>'GET','title'=>'Rule CRUD resource'],
            'evaluate'=>['href'=>$prefix.'/api/evaluate','method'=>'POST','title'=>"Evaluate payload starting at <$name>"],
            'collection'=>['href'=>$prefix.'/api/nodes','method'=>'GET','title'=>'All addressable nodes'],
            'pretty'=>['href'=>$prefix.'/nodes/rule/'.rawurlencode($name),'method'=>'GET','title'=>'Pretty node URL']],
        '_actions'=>['patchExpression'=>['name'=>'patchExpression','title'=>"Update <$name> expression",
            'href'=>$href.'/members/expression','method'=>'PATCH','contentType'=>'application/json',
            'fields'=>[['name'=>'value','type'=>'string','required'=>true,'example'=>$rule['expression']]]],
            'deleteRule'=>['name'=>'deleteRule','title'=>"Delete rule <$name>",'href'=>$resource,'method'=>'DELETE']]];
}

function dialect_node(stdClass $workspace, string $prefix): array {
    $href = $prefix.'/api/nodes/dialect/active'; $dialect = $workspace->dialect;
    $members = describe_node_members([
        'preset'=>[$dialect->preset,true,''], 'ruleOperator'=>[$dialect->ruleOperator,true,''],
        'choiceDelimiter'=>[$dialect->choiceDelimiter,true,''], 'commentPrefix'=>[$dialect->commentPrefix,true,''],
        'symbols'=>[$dialect->symbols,true,''],
        'enabledSymbolCount'=>[count(array_filter(grammar_symbols($workspace), fn($symbol) => $symbol['enabled'])),false,'Computed count of enabled Extended DAG symbols'],
    ], 'dialect', 'active', $prefix);
    return ['kind'=>'dialect','id'=>'active','label'=>'Dialect ('.$dialect->preset.')','href'=>$href,'mutableCount'=>5,'immutableCount'=>1,'members'=>$members,
        '_links'=>['self'=>['href'=>$href,'method'=>'GET','title'=>'Active Dialect Node'],'members'=>['href'=>$href.'/members','method'=>'GET'],
            'symbols'=>['href'=>$prefix.'/api/symbols','method'=>'GET','title'=>'Extended DAG Symbols'],
            'pretty'=>['href'=>$prefix.'/nodes/dialect/active','method'=>'GET','title'=>'Pretty node URL']],
        '_actions'=>['updateRuleOperator'=>['name'=>'updateRuleOperator','title'=>'Update Rule Operator',
            'href'=>$href.'/members/ruleOperator','method'=>'PATCH','contentType'=>'application/json',
            'fields'=>[['name'=>'value','type'=>'string','required'=>true,'example'=>$dialect->ruleOperator]]]]];
}

function logic_node(array $state, string $prefix): array {
    $href = $prefix.'/api/nodes/logic/active';
    $evaluation = evaluate_statement($state['statement'], $state['labels']);
    $sequence = evaluate_cauchy((object)$state['cauchyConfig'], $state['labels']);
    $members = describe_node_members([
        'statement'=>[$state['statement'],true,''], 'labels'=>[$state['labels'],true,''],
        'cauchyConfig'=>[(object)$state['cauchyConfig'],true,''],
        'evaluatedValue'=>[$evaluation['displayValue'],false,'Computed evaluation result'],
        'valueType'=>[$evaluation['valueType'],false,'Computed evaluation type'],
        'cauchyConverged'=>[$sequence['converged'],false,'Computed Cauchy convergence verdict'],
        'cauchyLimit'=>[$sequence['limitEstimate'],false,'Computed Cauchy limit estimate'],
        'cauchyIndexN'=>[$sequence['cauchyIndexN'],false,'Computed Cauchy index N(ε)'],
    ], 'logic', 'active', $prefix);
    return ['kind'=>'logic','id'=>'active','label'=>'Logic, Lambda & Cauchy Engine','href'=>$href,'mutableCount'=>3,'immutableCount'=>5,'members'=>$members,
        '_links'=>['self'=>['href'=>$href,'method'=>'GET'],'members'=>['href'=>$href.'/members','method'=>'GET'],
            'logicResource'=>['href'=>$prefix.'/api/logic','method'=>'GET'],'evaluateCauchy'=>['href'=>$prefix.'/api/logic/cauchy','method'=>'POST'],
            'pretty'=>['href'=>$prefix.'/nodes/logic/active','method'=>'GET','title'=>'Pretty node URL']],
        '_actions'=>['updateStatement'=>['name'=>'updateStatement','title'=>'Update LOGIC_STATEMENT','href'=>$href.'/members/statement',
            'method'=>'PATCH','contentType'=>'application/json','fields'=>[['name'=>'value','type'=>'string','required'=>true,'example'=>$state['statement']]]]]];
}

function callback_node(array $callback, string $prefix): array {
    $id = $callback['id']; $href = $prefix.'/api/nodes/callback/'.rawurlencode($id);
    $signature = $callback['name'].'('.implode(', ', $callback['params']).')';
    $members = describe_node_members([
        'name'=>[$callback['name'],true,''], 'lambdaExpr'=>[$callback['lambdaExpr'],true,''],
        'description'=>[$callback['description'] ?? null,true,''], 'id'=>[$id,false,'Immutable callback identifier'],
        'params'=>[$callback['params'],false,'Parsed from lambdaExpr'], 'signature'=>[$signature,false,'Derived from name and params'],
        'savedAt'=>[$callback['savedAt'],false,'System-managed timestamp'],
    ], 'callback', $id, $prefix);
    $resource = $prefix.'/api/callbacks/'.rawurlencode($id);
    return ['kind'=>'callback','id'=>$id,'label'=>'λ '.$signature,'href'=>$href,'mutableCount'=>3,'immutableCount'=>4,'members'=>$members,
        '_links'=>['self'=>['href'=>$href,'method'=>'GET'],'members'=>['href'=>$href.'/members','method'=>'GET'],
            'callbackResource'=>['href'=>$resource,'method'=>'GET'],'pretty'=>['href'=>$prefix.'/nodes/callback/'.rawurlencode($id),'method'=>'GET','title'=>'Pretty node URL']],
        '_actions'=>['updateLambdaExpr'=>['name'=>'updateLambdaExpr','title'=>'Update '.$callback['name'].' lambdaExpr',
            'href'=>$href.'/members/lambdaExpr','method'=>'PATCH','contentType'=>'application/json',
            'fields'=>[['name'=>'value','type'=>'string','required'=>true,'example'=>$callback['lambdaExpr']]]],
            'deleteCallback'=>['name'=>'deleteCallback','title'=>'Delete '.$callback['name'],'href'=>$resource,'method'=>'DELETE']]];
}

function history_node(stdClass $entry, string $prefix): array {
    $id = (string)$entry->generation; $href = $prefix.'/api/nodes/histolog/'.$id;
    $restore = $prefix.'/api/histolog/'.$id.'/restore';
    $members = describe_node_members([
        'summary'=>[$entry->summary,true,''], 'generation'=>[$entry->generation,false,'Immutable generation index'],
        'fingerprint'=>[$entry->fingerprint,false,'Immutable FNV-1a snapshot hash'],
        'timestamp'=>[$entry->timestamp,false,'Immutable creation timestamp'],
        'changedFields'=>[$entry->changedFields,false,'Computed diff fields'],
        'touchedSymbols'=>[$entry->touchedSymbols,false,'Computed symbol index'],
    ], 'histolog', $id, $prefix);
    return ['kind'=>'histolog','id'=>$id,'label'=>"Gen G$id: $entry->summary",'href'=>$href,'mutableCount'=>1,'immutableCount'=>5,'members'=>$members,
        '_links'=>['self'=>['href'=>$href,'method'=>'GET'],'members'=>['href'=>$href.'/members','method'=>'GET'],
            'restore'=>['href'=>$restore,'method'=>'POST'],'pretty'=>['href'=>$prefix.'/nodes/histolog/'.$id,'method'=>'GET','title'=>'Pretty node URL']],
        '_actions'=>['restoreGeneration'=>['name'=>'restoreGeneration','title'=>"Restore Engine or Section to G$id",
            'href'=>$restore,'method'=>'POST','contentType'=>'application/json',
            'fields'=>[['name'=>'section','type'=>'string','required'=>false,'example'=>'all']]]]];
}

function find_grammar_node(string $kind, string $id, stdClass $workspace, string $prefix): ?array {
    if ($kind === 'rule') {
        $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
        foreach ($rules as $rule) if ($rule['name'] === $id) return rule_node($rule, $rules, $workspace, $prefix);
    } elseif ($kind === 'symbol') {
        foreach (grammar_symbols($workspace) as $symbol) if ($symbol['key'] === $id) return symbol_node($symbol, $prefix);
    } elseif ($kind === 'dialect' && $id === 'active') return dialect_node($workspace, $prefix);
    return null;
}

function find_php_node(string $kind, string $id, array $state, string $prefix): ?array {
    if ($kind === 'logic' && $id === 'active') return logic_node($state, $prefix);
    if ($kind === 'callback') foreach ($state['callbacks'] as $callback) if ($callback['id'] === $id) return callback_node($callback, $prefix);
    if ($kind === 'histolog') foreach (array_slice(history_available($state), -8) as $entry) {
        if ((string)$entry->generation === $id) return history_node($entry, $prefix);
    }
    return find_grammar_node($kind, $id, workspace_default($state), $prefix);
}

function serve_grammar_nodes(string $method): never {
    if (!in_array($method, ['GET','HEAD'], true)) {
        header('Allow: GET, HEAD, OPTIONS');
        api_json(405, ['error'=>'Method not allowed.'], true);
    }
    $kind = $_GET['kind'] ?? '';
    if (!is_string($kind)) api_json(400, ['error'=>'Node kind must be text.'], true);
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    try {
        $state = logic_state(logic_store());
        $workspace = workspace_default($state);
        $nodes = [];
        if ($kind === '' || $kind === 'rule') {
            $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
            foreach ($rules as $rule) $nodes[] = rule_node($rule, $rules, $workspace, $prefix);
        }
        if ($kind === '' || $kind === 'dialect') $nodes[] = dialect_node($workspace, $prefix);
        if ($kind === '' || $kind === 'symbol') {
            foreach (grammar_symbols($workspace) as $symbol) $nodes[] = symbol_node($symbol, $prefix);
        }
        if ($kind === '' || $kind === 'logic') $nodes[] = logic_node($state, $prefix);
        if ($kind === '' || $kind === 'callback') foreach ($state['callbacks'] as $callback) $nodes[] = callback_node($callback, $prefix);
        if ($kind === '' || $kind === 'histolog') foreach (array_slice(history_available($state), -8) as $entry) $nodes[] = history_node($entry, $prefix);
        $items = [];
        foreach ($nodes as $node) $items[] = ['kind'=>$node['kind'],'id'=>$node['id'],'label'=>$node['label'],
            'mutableCount'=>$node['mutableCount'],'immutableCount'=>$node['immutableCount'],
            'memberNames'=>array_keys($node['members']),'_links'=>$node['_links'],'_actions'=>$node['_actions']];
        $kinds = [];
        if (parse_grammar($workspace->grammarText, $workspace->dialect)) $kinds[] = 'rule';
        array_push($kinds, 'dialect', 'symbol', 'logic');
        if ($state['callbacks']) $kinds[] = 'callback';
        $kinds[] = 'histolog';
        api_json(200, ['count'=>count($items),'kinds'=>$kinds,'_embedded'=>['nodes'=>$items],
            '_links'=>['self'=>['href'=>$prefix.'/api/nodes','method'=>'GET'],
                'root'=>['href'=>$prefix.'/api','method'=>'GET']]], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage()], true);
    } catch (UnsupportedLogic $error) {
        api_json(503, ['error'=>'PHP logic evaluator cannot handle this input: '.$error->getMessage()], true);
    }
}

function serve_grammar_export(string $method, string $language = 'grammar'): never {
    if (!in_array($method, ['GET','HEAD'], true)) {
        header('Allow: GET, HEAD, OPTIONS');
        api_json(405, ['error'=>'Method not allowed.'], true);
    }
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    try {
        $workspace = workspace_default(logic_state(logic_store()));
        $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
        usort($rules, function ($a, $b) use ($workspace) {
            $pa = $workspace->ruleConfigs->{$a['name']}->precedence ?? $a['lineNumber'];
            $pb = $workspace->ruleConfigs->{$b['name']}->precedence ?? $b['lineNumber'];
            return ($pa <=> $pb) ?: ($a['lineNumber'] <=> $b['lineNumber']);
        });
        $schemaName = $workspace->schemaConfig->schemaName;
        $slug = preg_replace('/[^A-Za-z0-9_-]/', '_', $schemaName !== '' ? $schemaName : 'grammar_schema');
        if ($language === 'jsonld') {
            api_json(200, ['language'=>'jsonld','content'=>grammar_schema_json($rules, $workspace),
                'filename'=>"$slug.schema.jsonld",'mime'=>'application/ld+json','label'=>'Schema.org JSON-LD',
                '_links'=>['self'=>['href'=>$prefix.'/api/export/jsonld','method'=>'GET'],
                    'languages'=>['href'=>$prefix.'/api/languages','method'=>'GET'],'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET']]], true);
        }
        if (in_array($language, ['python','rust','wat'], true)) {
            [$content, $extension, $mime, $label] = match ($language) {
                'python'=>[workspace_python_source($rules, $workspace), 'py', 'text/x-python', 'Python (.py)'],
                'rust'=>[workspace_rust_source($rules, $workspace), 'rs', 'text/plain', 'Rust (.rs)'],
                'wat'=>[workspace_wat_source($rules, $workspace), 'wat', 'text/plain', 'WABT / WAT (.wat)'],
            };
            api_json(200, ['language'=>$language,'content'=>$content,'filename'=>"$slug.$extension",'mime'=>$mime,'label'=>$label,
                '_links'=>['self'=>['href'=>$prefix.'/api/export/'.$language,'method'=>'GET'],
                    'languages'=>['href'=>$prefix.'/api/languages','method'=>'GET'],'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET']]], true);
        }
        if ($language !== 'grammar') {
            $export = workspace_other_export($language, $rules, $workspace, $slug);
            if ($export === null) api_json(503, ['error'=>'This workspace export language is not implemented.'], true);
            api_json(200, ['language'=>$language, ...$export,
                '_links'=>['self'=>['href'=>$prefix.'/api/export/'.rawurlencode($language),'method'=>'GET'],
                    'languages'=>['href'=>$prefix.'/api/languages','method'=>'GET'],'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET']]], true);
        }
        $dialect = $workspace->dialect;
        $ext = $dialect->preset === 'bnf' ? 'bnf' : (in_array($dialect->preset, ['peg','python_peg'], true) ? 'peg' : 'ebnf');
        $comment = $dialect->commentPrefix !== '' ? $dialect->commentPrefix : '//';
        $lines = ["$comment Exported Grammar ($dialect->preset) — $slug", "$comment Ordered by precedence (Order of Operations)"];
        foreach ($rules as $rule) {
            $config = $workspace->ruleConfigs->{$rule['name']} ?? null;
            $precedence = $config->precedence ?? $rule['lineNumber'];
            $assoc = $config->associativity ?? 'left';
            $properties = $config->properties ?? [];
            if (!is_array($properties)) throw new LogicStorageError('Rule properties are invalid.');
            $props = [];
            foreach ($properties as $property) {
                if (!$property instanceof stdClass || !is_string($property->name ?? null) || !is_string($property->value ?? null)) throw new LogicStorageError('Rule properties are invalid.');
                $props[] = $property->name.'='.$property->value;
            }
            $lines[] = "$comment [op #$precedence | assoc=$assoc".($props ? ' | props: '.implode(', ', $props) : '').']';
            $operator = trim($dialect->ruleOperator);
            $lines[] = $rule['name'].($operator === '' ? '' : ' '.$operator).' '.grammar_normalize_expression($rule['expression']);
        }
        api_json(200, ['language'=>'grammar','content'=>implode("\n", $lines)."\n",'filename'=>"$slug.$ext",
            'mime'=>'text/plain','label'=>'Grammar ('.strtoupper($dialect->preset).')',
            '_links'=>['self'=>['href'=>$prefix.'/api/export/grammar','method'=>'GET'],
                'languages'=>['href'=>$prefix.'/api/languages','method'=>'GET'],'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET']]], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage()], true);
    }
}

function serve_grammar_evaluation(string $method): never {
    if ($method !== 'POST') {
        header('Allow: POST, OPTIONS');
        api_json(405, ['error'=>'Method not allowed.'], true);
    }
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    $links = ['self'=>['href'=>$prefix.'/api/evaluate','method'=>'POST'],
        'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET'],
        'symbols'=>['href'=>$prefix.'/api/symbols','method'=>'GET']];
    try {
        $input = logic_request_object(true);
        $workspace = workspace_default(logic_state(logic_store()));
        $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
        $rule = is_string($input->rule ?? null) ? $input->rule : $workspace->evalRule;
        if ($rule === '') $rule = $rules[0]['name'] ?? '';
        $payload = is_string($input->payload ?? null) ? $input->payload : $workspace->evalPayload;
        $result = (new GrammarPayloadEvaluator($rules, $workspace, $payload))->evaluate($rule);
        api_json(200, [...$result, '_links'=>$links], true);
    } catch (InputError $error) {
        api_json(400, ['error'=>$error->getMessage(), '_links'=>$links], true);
    } catch (LogicStorageError|UnsupportedLogic $error) {
        api_json(503, ['error'=>$error->getMessage(), '_links'=>$links], true);
    }
}

function serve_grammar_node(string $route, string $method): never {
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    $parts = explode('/', $route);
    $kind = $parts[2]; $id = rawurldecode($parts[3]);
    $memberName = isset($parts[5]) ? rawurldecode($parts[5]) : null;
    $membersPath = isset($parts[4]);
    try {
        $db = logic_store();
        $state = logic_state($db);
        $node = find_php_node($kind, $id, $state, $prefix);
        if ($node === null) throw new InputError("Node '$kind/$id' not found.", 404);
        if (in_array($method, ['GET','HEAD'], true)) {
            if (!$membersPath) api_json(200, $node, true);
            if ($memberName === null) api_json(200, ['node'=>"$kind/$id",'label'=>$node['label'],
                'mutableCount'=>$node['mutableCount'],'immutableCount'=>$node['immutableCount'],'members'=>$node['members'],
                '_links'=>['self'=>['href'=>$node['href'].'/members','method'=>'GET'],
                    'node'=>['href'=>$node['href'],'method'=>'GET'],'nodes'=>['href'=>$prefix.'/api/nodes','method'=>'GET']]], true);
            if (!isset($node['members'][$memberName])) throw new InputError("Member '$memberName' not found on '$kind/$id'.", 404);
            $member = $node['members'][$memberName];
            header('Allow: '.implode(', ', $member['allowedMethods']));
            api_json(200, ['node'=>"$kind/$id", ...$member], true);
        }
        if ($memberName !== null && in_array($method, ['PUT','PATCH','DELETE'], true)) {
            $input = $method === 'DELETE' ? null : logic_request_object();
            $value = $input !== null && property_exists($input, 'value') ? $input->value : $input;
            $updated = logic_mutate($db, function (array $state) use ($kind, $id, $memberName, $method, $value, $prefix): array {
                $node = find_php_node($kind, $id, $state, $prefix);
                if ($node === null) throw new InputError("Node '$kind/$id' not found.", 404);
                $member = $node['members'][$memberName] ?? null;
                if ($member === null) throw new InputError("Member '$memberName' not found on '$kind/$id'.", 404);
                if (!$member['mutable']) {
                    $status = str_contains($member['readOnlyReason'] ?? '', 'x-mutation-policy') ? 423 : 405;
                    throw new InputError("Member '$memberName' on '$kind/$id' is non-mutable.", $status);
                }
                if ($kind === 'histolog') {
                    if ($method !== 'DELETE' && !is_string($value)) throw new InputError('Summary must be text.');
                    $entries = history_entries($state);
                    foreach ($entries as $i=>$entry) if ((string)$entry->generation === $id) {
                        $entry->summary = $method === 'DELETE' ? 'Generation G'.$id : $value;
                        $state['histolog'][$i] = json_encode($entry, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS);
                        break;
                    }
                } elseif ($kind === 'logic') {
                    $patch = new stdClass();
                    $patch->$memberName = $method === 'DELETE'
                        ? ($memberName === 'statement' ? '' : ($memberName === 'labels' ? [] : (object)[...DEFAULT_CAUCHY, 'enabled'=>false])) : $value;
                    update_logic_state($state, $patch);
                } elseif ($kind === 'callback') {
                    $index = null;
                    foreach ($state['callbacks'] as $i=>$callback) if ($callback['id'] === $id) { $index = $i; break; }
                    if ($index === null) throw new InputError("Callback '$id' not found.", 404);
                    $callback = $state['callbacks'][$index];
                    if ($method === 'DELETE' && $memberName === 'name') throw new InputError('A callback name cannot be cleared.');
                    if ($method !== 'DELETE' && !is_string($value)) throw new InputError('Callback value must be text.');
                    $nextName = $memberName === 'name' ? $value : $callback['name'];
                    $expression = $memberName === 'lambdaExpr' ? ($method === 'DELETE' ? 'λx. x' : $value) : $callback['lambdaExpr'];
                    $description = $memberName === 'description' ? ($method === 'DELETE' ? '' : $value) : ($callback['description'] ?? '');
                    foreach ($state['callbacks'] as $i=>$other) if ($i !== $index && $other['name'] === $nextName) throw new InputError('A callback with that name already exists.');
                    $updated = callback_binding($nextName, $expression, $description, $id);
                    $updated['source'] = $callback['source'];
                    $state['callbacks'][$index] = $updated;
                } else {
                    $workspace = workspace_default($state);
                    if ($kind === 'symbol') {
                    if ($method !== 'DELETE' && !is_string($value)) throw new InputError('Symbol value must be text.');
                    $workspace->dialect->symbols->$id = $method === 'DELETE' ? '' : $value;
                    } elseif ($kind === 'dialect') {
                    if ($memberName === 'preset') {
                        if ($method !== 'DELETE' && !is_string($value)) throw new InputError('Dialect preset must be text.');
                        $workspace->dialect = dialect_preset($method === 'DELETE' ? 'ebnf' : $value);
                    } elseif ($memberName === 'symbols') {
                        if ($method !== 'DELETE' && !$value instanceof stdClass) throw new InputError('Symbols must be an object.');
                        $symbols = $method === 'DELETE' ? new stdClass() : $value;
                        foreach (get_object_vars($symbols) as $key=>$part) {
                            if (!array_key_exists($key, GRAMMAR_SYMBOL_LABELS) || !is_string($part)) throw new InputError('Symbols must contain known text values.');
                        }
                        $workspace->dialect->symbols = $symbols;
                        } else {
                        if ($method !== 'DELETE' && !is_string($value)) throw new InputError('Dialect value must be text.');
                        $defaults = ['ruleOperator'=>'','choiceDelimiter'=>'|','commentPrefix'=>'//'];
                        $workspace->dialect->$memberName = $method === 'DELETE' ? $defaults[$memberName] : $value;
                    }
                } else {
                    $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
                    $config = $workspace->ruleConfigs->$id ?? (object)['precedence'=>1,'associativity'=>'left','properties'=>[]];
                    if ($memberName === 'expression') {
                        if ($method !== 'DELETE' && (!is_string($value) || trim($value) === '')) throw new InputError('Rule value expression cannot be empty.');
                        foreach ($rules as &$rule) if ($rule['name'] === $id) $rule['expression'] = $method === 'DELETE' ? "''" : grammar_normalize_expression(trim($value));
                        unset($rule);
                        $workspace->grammarText = grammar_serialize($workspace->grammarText, $rules, $workspace->dialect);
                    } elseif ($memberName === 'locked') {
                        if ($method !== 'DELETE' && !is_bool($value)) throw new InputError('Locked value must be boolean.');
                        $locked = array_values(array_filter($workspace->mutationPolicy->lockedRules, fn($name) => $name !== $id));
                        if ($method !== 'DELETE' && $value) $locked[] = $id;
                        $workspace->mutationPolicy->lockedRules = $locked;
                    } elseif ($memberName === 'precedence') {
                        if ($method !== 'DELETE' && (!is_int($value) && !is_float($value) || !is_finite((float)$value))) throw new InputError('Precedence must be a finite number.');
                        $config->precedence = $method === 'DELETE' ? 1 : max(1, $value);
                        $workspace->ruleConfigs->$id = $config;
                    } elseif ($memberName === 'associativity') {
                        if ($method !== 'DELETE' && !in_array($value, ['left','right','none'], true)) throw new InputError('Associativity must be left, right, or none.');
                        $config->associativity = $method === 'DELETE' ? 'left' : $value;
                        $workspace->ruleConfigs->$id = $config;
                    } elseif ($memberName === 'properties') {
                        if ($method !== 'DELETE' && !is_array($value)) throw new InputError('Properties must be an array.');
                        $config->properties = $method === 'DELETE' ? [] : $value;
                        $workspace->ruleConfigs->$id = $config;
                    } elseif ($memberName === 'mutation') {
                        if ($method === 'DELETE') unset($workspace->mutations->$id);
                        else {
                            if (!$value instanceof stdClass) throw new InputError('Mutation must be an object.');
                            $mutation = $workspace->mutations->$id ?? (object)['ruleName'=>$id,'targetProperty'=>$id,'jsonType'=>'string','patternOverride'=>'','description'=>"Rule $id",'enabled'=>true];
                            foreach (get_object_vars($value) as $key=>$part) $mutation->$key = $part;
                            $workspace->mutations->$id = $mutation;
                        }
                    }
                    }
                    save_active_workspace($state, $workspace);
                }
                $node = find_php_node($kind, $id, $state, $prefix);
                return [$state, ['ok'=>true,'node'=>"$kind/$id",'member'=>$node['members'][$memberName],'_links'=>$node['_links']]];
            }, function () use ($kind, $id, $memberName, $method): ?array {
                if ($kind === 'callback' || $kind === 'histolog') return null;
                $summary = match ($kind) {
                    'rule'=>($method === 'DELETE' ? 'Reset' : 'Updated')." rule.$id.$memberName",
                    'dialect'=>"Updated dialect.$memberName",
                    'symbol'=>($method === 'DELETE' ? 'Disabled' : 'Updated')." symbol.$id",
                    'logic'=>"Updated logic.$memberName",
                };
                return ['rest_node_member', $summary];
            });
            api_json(200, $updated, true);
        }
        header('Allow: GET, HEAD, OPTIONS');
        api_json(405, ['error'=>'Method not allowed.'], true);
    } catch (InputError $error) {
        $status = in_array($error->getCode(), [404,405,423], true) ? $error->getCode() : 400;
        if (in_array($status, [405,423], true)) header('Allow: GET, HEAD, OPTIONS');
        api_json($status, ['error'=>$error->getMessage()], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage()], true);
    } catch (UnsupportedLogic $error) {
        api_json(503, ['error'=>'PHP logic evaluator cannot handle this input: '.$error->getMessage()], true);
    }
}

function serve_symbols(string $route, string $method): never {
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    $collection = ['href'=>$prefix.'/api/symbols','method'=>'GET'];
    $key = $route === 'api/symbols' ? null : rawurldecode(substr($route, strlen('api/symbols/')));
    try {
        $db = logic_store();
        if (in_array($method, ['GET','HEAD'], true)) {
            $symbols = grammar_symbols(workspace_default(logic_state($db)));
            if ($key === null) {
                $items = [];
                foreach ($symbols as $symbol) {
                    $id = rawurlencode($symbol['key']); $self = $collection['href'].'/'.$id;
                    $items[] = [...$symbol, '_links'=>['self'=>['href'=>$self,'method'=>'GET'],
                        'node'=>['href'=>$prefix.'/api/nodes/symbol/'.$id,'method'=>'GET'],
                        'update'=>['href'=>$self,'method'=>'PUT'], 'disable'=>['href'=>$self,'method'=>'DELETE']]];
                }
                api_json(200, ['count'=>count($items),'enabledCount'=>count(array_filter($symbols, fn($s) => $s['enabled'])),
                    '_embedded'=>['symbols'=>$items], '_links'=>['self'=>$collection,'root'=>['href'=>$prefix.'/api','method'=>'GET']]], true);
            }
            foreach ($symbols as $symbol) if ($symbol['key'] === $key) {
                api_json(200, [...$symbol, '_links'=>['self'=>['href'=>$collection['href'].'/'.rawurlencode($key),'method'=>'GET'],
                    'node'=>['href'=>$prefix.'/api/nodes/symbol/'.rawurlencode($key),'method'=>'GET'],'collection'=>$collection]], true);
            }
            throw new InputError("Symbol '$key' not found.", 404);
        }
        if ($key !== null && in_array($method, ['PUT','DELETE'], true)) {
            if (!array_key_exists($key, GRAMMAR_SYMBOL_LABELS)) throw new InputError("Symbol '$key' not found.", 404);
            $input = $method === 'DELETE' ? new stdClass() : logic_request_object();
            $value = $method === 'DELETE' ? '' : ($input->value ?? '');
            if (!is_string($value)) throw new InputError('Symbol value must be text.');
            $updated = logic_mutate($db, function (array $state) use ($key, $value, $prefix): array {
                $workspace = workspace_default($state);
                $workspace->dialect->symbols->$key = $value;
                save_active_workspace($state, $workspace);
                foreach (grammar_symbols($workspace) as $symbol) if ($symbol['key'] === $key) {
                    $node = symbol_node($symbol, $prefix);
                    return [$state, ['ok'=>true,'node'=>'symbol/'.$key,'member'=>$node['members']['value'],'_links'=>$node['_links']]];
                }
                throw new LogicStorageError('Updated symbol cannot be resolved.');
            }, fn() => ['rest_node_member', ($method === 'DELETE' ? 'Disabled' : 'Updated')." symbol.$key"]);
            api_json(200, $updated, true);
        }
        header('Allow: '.($key === null ? 'GET, HEAD, OPTIONS' : 'GET, HEAD, PUT, DELETE, OPTIONS'));
        api_json(405, ['error'=>'Method not allowed.'], true);
    } catch (InputError $error) {
        api_json($error->getCode() === 404 ? 404 : 400, ['error'=>$error->getMessage(),'_links'=>['collection'=>$collection]], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage(),'_links'=>['collection'=>$collection]], true);
    }
}

function serve_rules(string $route, string $method): never {
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    $collection = ['href'=>$prefix.'/api/rules','method'=>'GET'];
    $name = $route === 'api/rules' ? null : rawurldecode(substr($route, strlen('api/rules/')));
    try {
        $db = logic_store();
        if (in_array($method, ['GET','HEAD'], true)) {
            $workspace = workspace_default(logic_state($db));
            $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
            if ($name === null) {
                $items = [];
                foreach ($rules as $rule) {
                    $id = rawurlencode($rule['name']); $self = $collection['href'].'/'.$id; $node = $prefix.'/api/nodes/rule/'.$id;
                    $items[] = [...$rule, 'usedOperators'=>grammar_operators($rule['expression'], $workspace->dialect),
                        'config'=>$workspace->ruleConfigs->{$rule['name']} ?? null, 'mutation'=>$workspace->mutations->{$rule['name']} ?? null,
                        '_links'=>['self'=>['href'=>$self,'method'=>'GET'], 'node'=>['href'=>$node,'method'=>'GET'],
                            'members'=>['href'=>$node.'/members','method'=>'GET'], 'update'=>['href'=>$self,'method'=>'PUT'], 'delete'=>['href'=>$self,'method'=>'DELETE']]];
                }
                api_json(200, ['count'=>count($rules),'dialect'=>$workspace->dialect,'_embedded'=>['rules'=>$items],
                    '_links'=>['self'=>$collection,'root'=>['href'=>$prefix.'/api','method'=>'GET'],
                        'symbols'=>['href'=>$prefix.'/api/symbols','method'=>'GET'], 'evaluate'=>['href'=>$prefix.'/api/evaluate','method'=>'POST']],
                    '_actions'=>['create'=>['name'=>'create','title'=>'Create Grammar Rule','href'=>$collection['href'],'method'=>'POST',
                        'contentType'=>'application/json','fields'=>[['name'=>'name','type'=>'string','required'=>true,'example'=>'promo_code'],
                            ['name'=>'expression','type'=>'string','required'=>true,'example'=>"'PROMO-' digit+"]]]]], true);
            }
            foreach ($rules as $rule) if ($rule['name'] === $name) {
                $self = $collection['href'].'/'.rawurlencode($name); $node = $prefix.'/api/nodes/rule/'.rawurlencode($name);
                api_json(200, [...$rule, 'config'=>$workspace->ruleConfigs->$name ?? null, 'mutation'=>$workspace->mutations->$name ?? null,
                    'members'=>grammar_rule_members($rule, $rules, $workspace, $prefix),
                    '_links'=>['self'=>['href'=>$self,'method'=>'GET'],'collection'=>$collection,'node'=>['href'=>$node,'method'=>'GET'],'members'=>['href'=>$node.'/members','method'=>'GET']],
                    '_actions'=>['update'=>['name'=>'update','title'=>"Update <$name>",'href'=>$self,'method'=>'PUT','contentType'=>'application/json',
                        'fields'=>[['name'=>'expression','type'=>'string','required'=>true,'example'=>$rule['expression']]]],
                        'delete'=>['name'=>'delete','title'=>"Delete <$name>",'href'=>$self,'method'=>'DELETE']]], true);
            }
            throw new InputError("Rule '$name' not found.", 404);
        }
        if (($name === null && $method === 'POST') || ($name !== null && in_array($method, ['PUT','PATCH','DELETE'], true))) {
            $input = $method === 'DELETE' ? new stdClass() : logic_request_object();
            $result = logic_mutate($db, function (array $state) use ($name, $method, $input): array {
                $workspace = workspace_default($state); $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
                $index = null;
                foreach ($rules as $i=>$rule) if ($rule['name'] === $name) { $index = $i; break; }
                if ($name !== null && $index === null) throw new InputError("Rule \"$name\" not found.", $method === 'DELETE' ? 404 : 400);
                if ($name === null) {
                    if (!is_string($input->name ?? null) || !is_string($input->expression ?? null) || trim($input->name) === '' || trim($input->expression) === '') throw new InputError('Both "name" and "expression" are required to create a grammar rule.');
                    $nextName = trim($input->name);
                    if (!preg_match('/^[A-Za-z_][A-Za-z0-9_-]*$/D', $nextName)) throw new InputError('Provide a valid identifier for the new rule name.');
                    foreach ($rules as $rule) if ($rule['name'] === $nextName) throw new InputError("Rule \"$nextName\" already exists.");
                    $rules[] = ['name'=>$nextName,'expression'=>grammar_normalize_expression(trim($input->expression))];
                } elseif ($method === 'DELETE') {
                    array_splice($rules, $index, 1);
                    unset($workspace->mutations->$name, $workspace->ruleConfigs->$name);
                    $nextName = $name;
                } else {
                    $nextName = is_string($input->name ?? null) ? trim($input->name) : $name;
                    if (!preg_match('/^[A-Za-z_][A-Za-z0-9_-]*$/D', $nextName)) throw new InputError('Rule name must start with a letter or underscore and contain only letters, digits, _ or -.');
                    foreach ($rules as $i=>$rule) if ($i !== $index && $rule['name'] === $nextName) throw new InputError("A rule named \"$nextName\" already exists.");
                    if (is_string($input->expression ?? null)) {
                        $expression = trim($input->expression);
                        if ($expression === '') throw new InputError('Rule value expression cannot be empty.');
                        $rules[$index]['expression'] = grammar_normalize_expression($expression);
                    }
                    if ($nextName !== $name) foreach ($rules as &$rule) $rule['expression'] = grammar_rename_references($rule['expression'], $name, $nextName);
                    unset($rule);
                    $rules[$index]['name'] = $nextName;
                }
                $workspace->grammarText = grammar_serialize($workspace->grammarText, $rules, $workspace->dialect);
                $workspace->updatedAt = gmdate('Y-m-d\TH:i:s').'.000Z';
                save_active_workspace($state, $workspace);
                return [$state, ['name'=>$nextName,'grammarText'=>$workspace->grammarText]];
            }, fn($saved) => match ($method) {
                'POST'=>['rest_create_rule', 'Created rule <'.$saved['name'].'>'],
                'DELETE'=>['rest_delete_rule', 'Deleted rule <'.$saved['name'].'>'],
                default=>['rest_update_rule', 'Updated rule <'.$saved['name'].'>'],
            });
            if ($method === 'DELETE') api_json(200, ['ok'=>true,'deleted'=>$result['name'],'grammarText'=>$result['grammarText'],
                '_links'=>['collection'=>$collection,'root'=>['href'=>$prefix.'/api','method'=>'GET']]], true);
            $self = $collection['href'].'/'.rawurlencode($result['name']);
            if ($method === 'POST') header('Location: '.$self);
            api_json($method === 'POST' ? 201 : 200, ['ok'=>true,'name'=>$result['name'],
                ...($method === 'POST' ? ['expression'=>trim($input->expression)] : []), 'grammarText'=>$result['grammarText'],
                '_links'=>['self'=>['href'=>$self,'method'=>'GET'],'node'=>['href'=>$prefix.'/api/nodes/rule/'.rawurlencode($result['name']),'method'=>'GET'],'collection'=>$collection]], true);
        }
        header('Allow: '.($name === null ? 'GET, HEAD, POST, OPTIONS' : 'GET, HEAD, PUT, PATCH, DELETE, OPTIONS'));
        api_json(405, ['error'=>'Method not allowed.'], true);
    } catch (InputError $error) {
        api_json($error->getCode() === 404 ? 404 : 400, ['error'=>$error->getMessage(),'_links'=>['collection'=>$collection]], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage(),'_links'=>['collection'=>$collection]], true);
    }
}

function workspace_entries(array $state): array {
    $entries = $state['workspaces'] ?? [];
    if (!is_array($entries)) throw new LogicStorageError('Stored workspace collection is invalid.');
    $result = [];
    foreach ($entries as $entry) {
        try { $workspace = is_string($entry) ? json_decode($entry, false, 64, JSON_THROW_ON_ERROR) : null; }
        catch (JsonException $error) { throw new LogicStorageError('Stored workspace is invalid.'); }
        if (!$workspace instanceof stdClass || !is_string($workspace->id ?? null)
            || !is_string($workspace->name ?? null) || !is_string($workspace->updatedAt ?? null)
            || !($workspace->dialect ?? null) instanceof stdClass || !is_string($workspace->dialect->preset ?? null)) {
            throw new LogicStorageError('Stored workspace is invalid.');
        }
        $result[] = $workspace;
    }
    return $result;
}

function serve_history(string $route, string $method): never {
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    $collection = ['href'=>$prefix.'/api/histolog','method'=>'GET'];
    try {
        $db = logic_store();
        if ($method === 'POST' && ($route === 'api/engine/clear' || $route === 'api/histolog'
            || preg_match('~^api/histolog/\d+/restore$~', $route))) {
            $input = logic_request_object(true);
            if ($route === 'api/histolog') {
                if (isset($input->summary) && !is_string($input->summary)) throw new InputError('Summary must be text.');
                $summary = ($input->summary ?? '') !== '' ? $input->summary : 'Manual API checkpoint';
                $result = logic_mutate($db, function (array $state) use ($summary): array {
                    $entry = history_record($state, 'api_checkpoint', $summary);
                    return [$state, ['ok'=>true,'generation'=>$entry->generation,'fingerprint'=>$entry->fingerprint,'summary'=>$entry->summary]];
                });
                api_json(201, [...$result, '_links'=>['self'=>['href'=>$collection['href'].'/'.$result['generation'],'method'=>'GET']]], true);
            }
            $section = $input->section ?? 'all';
            if (!is_string($section) || !in_array($section, ['all','grammar','mutations','jsonld','logic','evaluator','dsl','python','rust','wat','callbacks'], true)) {
                throw new InputError('Unknown engine section.');
            }
            if ($route === 'api/engine/clear') {
                $result = logic_mutate($db, function (array $state) use ($section): array {
                    $entry = history_clear($state, $section);
                    return [$state, ['ok'=>true,'cleared'=>$section,'generation'=>$entry->generation]];
                });
                api_json(200, [...$result, '_links'=>['root'=>['href'=>$prefix.'/api','method'=>'GET'],'histolog'=>$collection]], true);
            }
            preg_match('~^api/histolog/(\d+)/restore$~', $route, $match); $generation = (int)$match[1];
            $result = logic_mutate($db, function (array $state) use ($generation, $section): array {
                $entry = history_restore($state, $generation, $section);
                return [$state, ['ok'=>true,'restoredFrom'=>$generation,'section'=>$section,'newGeneration'=>$entry->generation]];
            });
            api_json(200, [...$result, '_links'=>['histolog'=>$collection,'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET']]], true);
        }
        if (in_array($method, ['GET','HEAD'], true) && $route !== 'api/engine/clear') {
            $entries = history_available(logic_state($db));
            if ($route === 'api/histolog') {
                $items = [];
                foreach ($entries as $entry) {
                    $href = $collection['href'].'/'.$entry->generation;
                    $items[] = ['generation'=>$entry->generation,'parentGeneration'=>$entry->parentGeneration,
                        'timestamp'=>$entry->timestamp,'source'=>$entry->source,'summary'=>$entry->summary,
                        'fingerprint'=>$entry->fingerprint,'changedFields'=>$entry->changedFields,'touchedSymbols'=>$entry->touchedSymbols,
                        'additions'=>$entry->additions,'deletions'=>$entry->deletions,
                        '_links'=>['self'=>['href'=>$href,'method'=>'GET'],'restore'=>['href'=>$href.'/restore','method'=>'POST'],
                            'node'=>['href'=>$prefix.'/api/nodes/histolog/'.$entry->generation,'method'=>'GET']]];
                }
                $last = $entries[count($entries)-1]->generation;
                api_json(200, ['index'=>history_index($entries),'_embedded'=>['generations'=>$items],
                    '_links'=>['self'=>$collection,'diff'=>['href'=>$collection['href'].'/diff?from=0&to='.$last,'method'=>'GET'],
                        'root'=>['href'=>$prefix.'/api','method'=>'GET']]], true);
            }
            if ($route === 'api/histolog/diff') {
                $from = filter_var($_GET['from'] ?? '0', FILTER_VALIDATE_INT);
                $to = filter_var($_GET['to'] ?? (string)$entries[count($entries)-1]->generation, FILTER_VALIDATE_INT);
                if ($from === false || $to === false) throw new InputError('History generations must be integers.');
                $first = history_find($entries, $from) ?? $entries[0];
                $last = history_find($entries, $to) ?? $entries[count($entries)-1];
                api_json(200, ['fromGen'=>$first->generation,'toGen'=>$last->generation,
                    'diffs'=>history_diff($first->snapshot, $last->snapshot),
                    '_links'=>['self'=>['href'=>$collection['href'].'/diff?from='.$first->generation.'&to='.$last->generation,'method'=>'GET'],
                        'collection'=>$collection]], true);
            }
            if (preg_match('~^api/histolog/(\d+)$~', $route, $match)) {
                $generation = (int)$match[1]; $entry = history_find($entries, $generation);
                if ($entry === null) throw new InputError("Generation G$generation not found.", 404);
                $href = $collection['href'].'/'.$generation;
                api_json(200, [...get_object_vars($entry),'_links'=>['self'=>['href'=>$href,'method'=>'GET'],
                    'restore'=>['href'=>$href.'/restore','method'=>'POST'],'collection'=>$collection]], true);
            }
        }
        header('Allow: '.($route === 'api/histolog' ? 'GET, HEAD, POST, OPTIONS' : 'POST, OPTIONS'));
        api_json(405, ['error'=>'Method not allowed.'], true);
    } catch (InputError $error) {
        api_json($error->getCode() === 404 ? 404 : 400, ['error'=>$error->getMessage()], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage()], true);
    }
}

function serve_workspaces(string $route, string $method): never {
    $prefix = substr(api_links('/api')['self']['href'], 0, -4);
    $collection = ['href'=>$prefix.'/api/workspaces', 'method'=>'GET'];
    $id = $route === 'api/workspaces' ? null : rawurldecode(substr($route, strlen('api/workspaces/')));
    try {
        $db = logic_store();
        if (in_array($method, ['GET','HEAD'], true)) {
            $state = logic_state($db);
            $entries = workspace_entries($state);
            $default = workspace_default($state);
            foreach ($entries as $index=>$workspace) if ($workspace->id === 'default') {
                $default = $workspace;
                unset($entries[$index]);
                break;
            }
            array_unshift($entries, $default);
            if ($id === null) {
                $list = [];
                foreach ($entries as $workspace) $list[] = [
                    'id'=>$workspace->id, 'name'=>$workspace->name, 'updatedAt'=>$workspace->updatedAt,
                    'dialectPreset'=>$workspace->dialect->preset,
                    '_links'=>['self'=>['href'=>$collection['href'].'/'.rawurlencode($workspace->id),'method'=>'GET'],
                        'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET']],
                ];
                api_json(200, ['count'=>count($list), '_embedded'=>['workspaces'=>$list],
                    '_links'=>['self'=>$collection,'root'=>['href'=>$prefix.'/api','method'=>'GET']]], true);
            }
            foreach ($entries as $workspace) if ($workspace->id === $id) {
                api_json(200, [...get_object_vars($workspace), '_links'=>[
                    'self'=>['href'=>$collection['href'].'/'.rawurlencode($id),'method'=>'GET'],
                    'collection'=>$collection, 'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET'],
                ]], true);
            }
            throw new InputError("Workspace '$id' not found.", 404);
        }
        if ($id === null && $method === 'POST') {
            $input = logic_request_object();
            $saved = logic_mutate($db, function (array $state) use ($input): array {
                $id = $input->id ?? ('ws_'.bin2hex(random_bytes(12)));
                if (!is_string($id) || trim($id) === '' || strlen($id) > 200 || in_array(trim($id), ['.', '..'], true)
                    || preg_match('~[/%\\\\\x00-\x1f\x7f]~', $id)) throw new InputError('Workspace id must be a routable path segment.');
                $id = trim($id);
                $workspace = workspace_default($state);
                foreach (get_object_vars($input) as $key=>$value) $workspace->$key = $value;
                $workspace->id = $id;
                $workspace->name = ($input->name ?? '') === '' ? $id : $input->name;
                $workspace->updatedAt = gmdate('Y-m-d\TH:i:s').'.000Z';
                if (!is_string($workspace->name) || !($workspace->dialect ?? null) instanceof stdClass || !is_string($workspace->dialect->preset ?? null)) throw new InputError('Workspace name and dialect preset must be text.');
                $encoded = json_encode($workspace, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                $existing = workspace_entries($state);
                $state['workspaces'] = [];
                $replaced = false;
                foreach ($existing as $entry) {
                    if ($entry->id === $id) { $state['workspaces'][] = $encoded; $replaced = true; }
                    else $state['workspaces'][] = json_encode($entry, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                }
                if (!$replaced) $state['workspaces'][] = $encoded;
                return [$state, ['workspace'=>$workspace]];
            });
            $self = ['href'=>$collection['href'].'/'.rawurlencode($saved['workspace']->id),'method'=>'GET'];
            header('Location: '.$self['href']);
            api_json(201, ['ok'=>true, 'workspace'=>$saved['workspace'], '_links'=>['self'=>$self]], true);
        }
        if ($id !== null && $method === 'DELETE') {
            if ($id === 'default') {
                $result = logic_mutate($db, function (array $state): array {
                    $entry = history_clear($state, 'all');
                    return [$state, ['ok'=>true,'clearedDefault'=>true,'cleared'=>'all','generation'=>$entry->generation]];
                });
                api_json(200, [...$result, '_links'=>['collection'=>$collection]], true);
            }
            $result = logic_mutate($db, function (array $state) use ($id): array {
                $entries = workspace_entries($state);
                $state['workspaces'] = [];
                $found = false;
                foreach ($entries as $entry) {
                    if ($entry->id === $id) { $found = true; continue; }
                    $state['workspaces'][] = json_encode($entry, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                }
                if (!$found) throw new InputError("Workspace '$id' not found.", 404);
                return [$state, ['ok'=>true, 'deleted'=>$id]];
            });
            api_json(200, [...$result, '_links'=>['collection'=>$collection]], true);
        }
        header('Allow: '.($id === null ? 'GET, HEAD, POST, OPTIONS' : 'GET, HEAD, DELETE, OPTIONS'));
        api_json(405, ['error'=>'Method not allowed.'], true);
    } catch (InputError $error) {
        api_json($error->getCode() === 404 ? 404 : 400, ['error'=>$error->getMessage()], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['error'=>$error->getMessage()], true);
    }
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
            'rules'=>['href'=>$prefix.'/api/rules','method'=>'GET'],
            'symbols'=>['href'=>$prefix.'/api/symbols','method'=>'GET'],
            'nodes'=>['href'=>$prefix.'/api/nodes','method'=>'GET'],
            'grammarExport'=>['href'=>$prefix.'/api/export/grammar','method'=>'GET'],
            'jsonldExport'=>['href'=>$prefix.'/api/export/jsonld','method'=>'GET'],
            'grammarEvaluate'=>['href'=>$prefix.'/api/evaluate','method'=>'POST'],
            'histolog'=>['href'=>$prefix.'/api/histolog','method'=>'GET'],
            'logicLabels'=>['href'=>$prefix.'/api/logic/labels','method'=>'GET'],
            'evaluate'=>['href'=>$prefix.'/api/logic/evaluate','method'=>'POST'],
            'cauchy'=>['href'=>$prefix.'/api/logic/cauchy','method'=>'POST'],
            'callbacks'=>['href'=>$prefix.'/api/callbacks','method'=>'GET'],
            'workspaces'=>['href'=>$prefix.'/api/workspaces','method'=>'GET'],
            'mcp'=>['href'=>$prefix.'/api/mcp','method'=>'POST'],
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
                'exportWorkspace'=>['href'=>$prefix.'/api/export/'.rawurlencode($exportId),'method'=>'GET','available'=>true],
                'exportLogic'=>['href'=>$prefix.'/api/logic/export/'.rawurlencode($exportId),'method'=>'GET','available'=>false],
            ],
        ];
    }
    api_json(200, ['count'=>count($languages), 'languages'=>$languages, '_links'=>[
        'self'=>['href'=>$prefix.'/api/languages','method'=>'GET'], 'root'=>['href'=>$prefix.'/api','method'=>'GET'],
    ]], true);
}

function update_logic_state(array &$state, stdClass $input): void {
    if (isset($input->statement)) {
        if (!is_string($input->statement)) throw new InputError('Statement must be text.');
        if (trim($input->statement) !== '') parse_logic($input->statement);
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
                update_logic_state($state, $input);
                $evaluation = evaluate_statement($state['statement'], $state['labels']);
                return [$state, ['ok'=>true, 'statement'=>$state['statement'], 'labels'=>$state['labels'], 'displayValue'=>$evaluation['displayValue']]];
            }, fn() => ['rest_logic_update', 'Updated logic / Cauchy configuration']);
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
    if ($route === 'api/rules' || preg_match('~^api/rules/[^/]+$~', $route)) serve_rules($route, $method);
    if ($route === 'api/symbols' || preg_match('~^api/symbols/[^/]+$~', $route)) serve_symbols($route, $method);
    if ($route === 'api/nodes') serve_grammar_nodes($method);
    if ($route === 'api/evaluate') serve_grammar_evaluation($method);
    if ($route === 'api/engine/clear' || $route === 'api/histolog' || $route === 'api/histolog/diff'
        || preg_match('~^api/histolog/\d+(?:/restore)?$~', $route)) serve_history($route, $method);
    if (preg_match('~^api/export/[a-z]+$~', $route)) serve_grammar_export($method, substr($route, strlen('api/export/')));
    if (preg_match('~^api/nodes/(rule|symbol|dialect|logic|callback|histolog)/[^/]+(?:/members(?:/[^/]+)?)?$~', $route)) serve_grammar_node($route, $method);
    if (in_array($route, ['api/mcp','api/mcp/logic_calc'], true)) serve_logic_mcp($route, $method);
    if ($route === 'api/workspaces' || preg_match('~^api/workspaces/[^/]+$~', $route)) serve_workspaces($route, $method);
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
