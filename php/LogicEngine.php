<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

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
        return ['ok'=>true,'displayValue'=>$display,'valueType'=>$value['kind'] === 'closure' ? 'lambda' : $value['kind'],
            'trace'=>$trace,'diagnostics'=>[],'freeVariables'=>collect_free($ast)];
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

function logic_export_unsupported(array $config, string $target): ?string {
    return ($config['enabled'] ?? false) && in_array($target, ['go','java','cpp','csharp','php'], true)
        ? "Cauchy evaluation is not implemented for $target exports." : null;
}
function logic_export_ast(array $node): array {
    return match ($node['type']) {
        'identifier'=>['type'=>'Identifier','name'=>$node['name']],
        'number'=>['type'=>'NumberLit','value'=>$node['value']],
        'boolean'=>['type'=>'BooleanLit','value'=>$node['value']],
        'unary'=>['type'=>'UnaryOp','op'=>$node['op'],'operand'=>logic_export_ast($node['body'])],
        'binary'=>['type'=>'BinaryOp','op'=>$node['op'],'left'=>logic_export_ast($node['left']),'right'=>logic_export_ast($node['right'])],
        'call'=>['type'=>'Call','callee'=>logic_export_ast($node['callee']),'arg'=>logic_export_ast($node['arg'])],
        'lambda'=>['type'=>'Lambda','param'=>$node['name'],'body'=>logic_export_ast($node['body'])],
        'quantifier'=>['type'=>'Quantifier','quantifier'=>$node['op'],'param'=>$node['name'],'body'=>logic_export_ast($node['body'])],
        default=>throw new UnsupportedLogic('Unsupported logic AST node for export.'),
    };
}
function logic_export_spec(string $statement, array $labels, array $evaluation, stdClass $workspace): array {
    $required = []; $seen = [];
    foreach ($labels as $label) {
        if ($label['kind'] === 'lambda') continue;
        $name = trim($label['name']);
        if ($name === '' || isset($seen[$name])) continue;
        $seen[$name] = true;
        $required[] = ['name'=>$name,'kind'=>$label['kind'],'defaultValue'=>trim($label['value']) ?: ($label['kind'] === 'boolean' ? 'false' : '0')];
    }
    foreach ($evaluation['freeVariables'] ?? [] as $name) {
        if ($name === '' || isset($seen[$name])) continue;
        $seen[$name] = true; $required[] = ['name'=>$name,'kind'=>'number','defaultValue'=>'0'];
    }
    $rules = parse_grammar($workspace->grammarText, $workspace->dialect);
    $studioRules = [];
    foreach ($rules as $rule) if (trim($rule['name']) !== '' && trim($rule['expression']) !== '') {
        $studioRules[] = ['name'=>trim($rule['name']),'expression'=>trim($rule['expression'])];
    }
    $names = array_column($studioRules, 'name'); $synthetic = [];
    if ($required && !in_array('logic_input', $names, true)) {
        $parts = array_map(fn($input) => '("'.$input['name'].'=" '.$input['name'].')', $required);
        $synthetic[] = ['name'=>'logic_input','expression'=>implode(' " " ', $parts)];
    }
    foreach ($required as $input) if (!in_array($input['name'], $names, true)) {
        $synthetic[] = ['name'=>$input['name'],'expression'=>$input['kind'] === 'boolean'
            ? '"true" | "false" | "1" | "0"' : '"-"? digit+ ("." digit+)?'];
    }
    if (!in_array('digit', $names, true) && array_filter($synthetic, fn($rule) => str_contains($rule['expression'], 'digit'))) {
        $synthetic[] = ['name'=>'digit','expression'=>'"0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"'];
    }
    $combined = array_merge($studioRules, $synthetic);
    $syntheticText = array_map(fn($rule) => $rule['name'].' '.$workspace->dialect->ruleOperator.' '.$rule['expression'], $synthetic);
    $base = trim($workspace->grammarText);
    $grammar = implode("\n", array_filter([$base, implode("\n", $syntheticText)], fn($text) => $text !== ''));
    $entry = $required && array_filter($combined, fn($rule) => $rule['name'] === 'logic_input')
        ? 'logic_input' : ($combined[0]['name'] ?? 'logic_input');
    $sample = implode(' ', array_map(fn($input) => $input['name'].'='.$input['defaultValue'], $required));
    if ($sample === '') $sample = trim($workspace->evalPayload);
    return ['requiredInputs'=>$required,'rules'=>$combined,'grammarText'=>$grammar,'entryRule'=>$entry,'sampleSingleInput'=>$sample];
}
function assess_cauchy_safety(mixed $rawInput, string $statement, array $labels, ?array $cauchyConfig): array {
    if (!is_array($cauchyConfig) || empty($cauchyConfig['enabled'])) {
        return ['canEnable'=>false, 'reason'=>'Cauchy sequence configuration is disabled.'];
    }
    $isRawPositional = is_array($rawInput) && count($rawInput) > 0
        && !(count($rawInput) === 2 && is_string($rawInput[0] ?? null) && is_string($rawInput[1] ?? null)
            && !(literal_text($rawInput[0]) && literal_text($rawInput[1])));
    $hasValuesArray = $rawInput instanceof stdClass && property_exists($rawInput, 'values')
        && is_array($rawInput->values) && count($rawInput->values) > 0;
    if ($isRawPositional || $hasValuesArray) {
        return ['canEnable'=>false, 'reason'=>'Positional literal arrays could be confused with Cauchy seed terms or _# window parameters.'];
    }
    $rawSeeds = array_values(array_filter(array_map('trim', explode(',', (string)($cauchyConfig['seedValues'] ?? ''))), fn($s) => $s !== ''));
    $arity = max(1, min(8, count($rawSeeds) ?: 2));
    $style = is_string($cauchyConfig['paramStyle'] ?? null) ? $cauchyConfig['paramStyle'] : 'directional';
    $custom = is_string($cauchyConfig['customParamNames'] ?? null) ? $cauchyConfig['customParamNames'] : '';
    $cauchyParams = array_unique(array_merge(
        cauchy_names($style, $arity, $custom),
        cauchy_names('directional', $arity),
        array_map(fn($i) => '_'.$i, range(0, $arity)),
        ['left', 'right', 'prev', 'n']
    ));
    $cauchySet = array_fill_keys($cauchyParams, true);

    $suppliedKeys = [];
    if (is_string($rawInput)) {
        foreach (label_tokens($rawInput) as $tok) {
            $eq = strpos($tok, '=');
            if ($eq !== false && $eq > 0) $suppliedKeys[trim(substr($tok, 0, $eq))] = true;
        }
    } elseif ($rawInput instanceof stdClass) {
        $lbls = property_exists($rawInput, 'logic_labels') ? $rawInput->logic_labels : ($rawInput->labels ?? null);
        if (is_string($lbls)) {
            $toks = label_tokens($lbls);
            $allPos = count($toks) > 0;
            foreach ($toks as $tok) {
                $eq = strpos($tok, '=');
                if ($eq !== false && $eq > 0) { $allPos = false; $suppliedKeys[trim(substr($tok, 0, $eq))] = true; }
            }
            if ($allPos) {
                return ['canEnable'=>false, 'reason'=>'Positional text labels could be confused with Cauchy seed terms.'];
            }
        } elseif (is_array($lbls) && count($lbls) > 0) {
            $allBindings = true;
            foreach ($lbls as $item) {
                if (!$item instanceof stdClass || !isset($item->id, $item->name, $item->kind, $item->value)) { $allBindings = false; break; }
            }
            if (!$allBindings) {
                return ['canEnable'=>false, 'reason'=>'Positional label array could be confused with Cauchy seed terms.'];
            }
        } elseif ($lbls instanceof stdClass) {
            foreach (array_keys(get_object_vars($lbls)) as $k) $suppliedKeys[(string)$k] = true;
        }
    }

    foreach (array_keys($suppliedKeys) as $k) {
        if (isset($cauchySet[$k])) {
            return ['canEnable'=>false, 'reason'=>"Supplied label '$k' collides with a Cauchy recurrence parameter name."];
        }
    }
    if (preg_match('/\b_[0-8]\b/', $statement)) {
        return ['canEnable'=>false, 'reason'=>'Statement references positional _# identifiers that overlap with Cauchy window parameters.'];
    }
    return ['canEnable'=>true, 'reason'=>'Inputs do not collide with Cauchy seeds or recurrence parameters.'];
}

function logic_export_json_literal(mixed $value): string {
    return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function logic_export_ast_py(array $node): string {
    return match ($node['type']) {
        'number' => js_number((float)$node['value']),
        'boolean' => $node['value'] ? 'True' : 'False',
        'identifier' => $node['name'],
        'unary' => $node['op'] === '¬' ? '(not (' . logic_export_ast_py($node['body']) . '))' : '(-(' . logic_export_ast_py($node['body']) . '))',
        'lambda' => '(lambda ' . $node['name'] . ': ' . logic_export_ast_py($node['body']) . ')',
        'call' => '(' . logic_export_ast_py($node['callee']) . ')(' . logic_export_ast_py($node['arg']) . ')',
        'quantifier' => ($node['op'] === '∀' ? 'all' : 'any') . '(bool(' . logic_export_ast_py($node['body']) . ') for ' . $node['name'] . ' in (False, True))',
        'binary' => (function () use ($node): string {
            $l = logic_export_ast_py($node['left']);
            $r = logic_export_ast_py($node['right']);
            return match ($node['op']) {
                '∧' => "(bool($l) and bool($r))",
                '∨' => "(bool($l) or bool($r))",
                '⊕' => "(bool($l) != bool($r))",
                '→' => "((not bool($l)) or bool($r))",
                '↔', '≡' => "(bool($l) == bool($r))",
                '=' => "(($l) == ($r))",
                '≠' => "(($l) != ($r))",
                '<' => "(($l) < ($r))",
                '≤' => "(($l) <= ($r))",
                '>' => "(($l) > ($r))",
                '≥' => "(($l) >= ($r))",
                '+' => "(($l) + ($r))",
                '-' => "(($l) - ($r))",
                '*' => "(($l) * ($r))",
                '/' => "(($l) / ($r))",
                '%' => "(($l) % ($r))",
                '^' => "(($l) ** ($r))",
                default => 'None',
            };
        })(),
        default => 'None',
    };
}

function logic_export_python(string $stmt, array $labels, array $spec, array $cauchyConfig, string $inputMode): array {
    $cliFlag = $inputMode === 'cli' ? 'True' : 'False';
    $dataSpec = json_encode([
        'statement' => $stmt,
        'ast' => logic_export_ast(parse_logic($stmt)),
        'labels' => array_map(fn($l) => ['name'=>$l['name'], 'kind'=>$l['kind'], 'value'=>$l['value']], $labels),
        'requiredInputs' => $spec['requiredInputs'],
        'sampleSingleInput' => $spec['sampleSingleInput'],
        'grammarText' => $spec['grammarText'],
        'cauchy' => $cauchyConfig,
    ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $labelTuples = implode(",\n", array_map(
        fn($l) => '    (' . logic_export_json_literal($l['name']) . ', ' . logic_export_json_literal($l['kind']) . ', ' . logic_export_json_literal($l['value']) . ')',
        $labels
    ));
    $reqTuples = implode(",\n", array_map(
        fn($r) => '    (' . logic_export_json_literal($r['name']) . ', ' . logic_export_json_literal($r['kind']) . ', ' . logic_export_json_literal($r['defaultValue']) . ')',
        $spec['requiredInputs']
    ));
    $cauchyLine = !empty($cauchyConfig['enabled']) ? "\n    print('Cauchy Limit:', evaluate_cauchy_sequence(env)[-1])" : '';
    $content = <<<'PYTHON'
# Auto-generated Python Logic, Arithmetic & Lambda Calculus Evaluator (Native PHP Export)
import argparse
import json
import math
import re
import sys

CLI_INPUTS_ENABLED = __CLI_FLAG__
LOGIC_STATEMENT = __STMT_LIT__
ACTIVE_GRAMMAR = __GRAMMAR_LIT__
SAMPLE_SINGLE_INPUT = __SAMPLE_LIT__
LOGIC_LABELS = [
__LABEL_TUPLES__
]
REQUIRED_INPUTS = [
__REQ_TUPLES__
]
DATA_SPEC = json.loads(__SPEC_LIT__)

def _coerce_literal(raw, kind):
    text = str(raw).strip()
    if kind == 'boolean':
        low = text.lower()
        if low in ('true', '1', 'yes', 't', '⊤'): return True
        if low in ('false', '0', 'no', 'f', '⊥'): return False
        raise ValueError(f'Invalid boolean literal: {raw}')
    if not re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?', text):
        raise ValueError(f'Invalid numeric literal: {raw}')
    val = float(text)
    if not math.isfinite(val): raise ValueError(f'Non-finite numeric literal: {raw}')
    return int(val) if val.is_integer() else val

def _to_bool(v): return v is not False and v != 0
def _to_num(v):
    if isinstance(v, bool): return 1.0 if v else 0.0
    if isinstance(v, (int, float)): return float(v)
    raise ValueError('Expected numeric operand')

def parse_inputs_from_string(raw_input=''):
    text = str(raw_input or '').strip()
    out = {name: default_val for name, _kind, default_val in REQUIRED_INPUTS}
    if not text: return out
    if text.startswith(('{', '[')):
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            if 'logic_labels' in parsed: parsed = parsed['logic_labels']
            elif 'labels' in parsed: parsed = parsed['labels']
            if isinstance(parsed, str): return parse_inputs_from_string(parsed)
        if isinstance(parsed, list):
            if len(parsed) > len(REQUIRED_INPUTS): raise ValueError('Too many positional inputs')
            for idx, val in enumerate(parsed): out[REQUIRED_INPUTS[idx][0]] = str(val)
            return out
        if isinstance(parsed, dict):
            for k, v in parsed.items(): out[str(k)] = str(v)
            return out
    if '=' not in text and ':' not in text:
        parts = [p for p in re.split(r'[\s,;]+', text) if p]
        if len(parts) > len(REQUIRED_INPUTS): raise ValueError('Too many positional inputs')
        for idx, val in enumerate(parts): out[REQUIRED_INPUTS[idx][0]] = val
        return out
    for k, v in re.findall(r'([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*([^\s,;]+)', text):
        out[k] = v
    return out

def _eval_ast(node, env, depth=0):
    if depth > 48: raise RecursionError('Maximum lambda recursion depth exceeded')
    t = node['type']
    if t == 'NumberLit': return node['value']
    if t == 'BooleanLit': return node['value']
    if t == 'Identifier':
        if node['name'] not in env: raise NameError(f"Unresolved label '{node['name']}'")
        return env[node['name']]
    if t == 'Lambda':
        p, body, cap = node['param'], node['body'], dict(env)
        return lambda arg: _eval_ast(body, {**cap, p: arg}, depth + 1)
    if t == 'Call':
        fn = _eval_ast(node['callee'], env, depth + 1)
        if not callable(fn): raise TypeError('Cannot invoke non-lambda value')
        return fn(_eval_ast(node['arg'], env, depth + 1))
    if t == 'Quantifier':
        a = _to_bool(_eval_ast(node['body'], {**env, node['param']: False}, depth + 1))
        b = _to_bool(_eval_ast(node['body'], {**env, node['param']: True}, depth + 1))
        return (a and b) if node['quantifier'] == '∀' else (a or b)
    if t == 'UnaryOp':
        v = _eval_ast(node['operand'], env, depth + 1)
        return (not _to_bool(v)) if node['op'] == '¬' else -_to_num(v)
    if t == 'BinaryOp':
        l = _eval_ast(node['left'], env, depth + 1)
        r = _eval_ast(node['right'], env, depth + 1)
        op = node['op']
        if op == '∧': return _to_bool(l) and _to_bool(r)
        if op == '∨': return _to_bool(l) or _to_bool(r)
        if op == '⊕': return _to_bool(l) != _to_bool(r)
        if op == '→': return (not _to_bool(l)) or _to_bool(r)
        if op in ('↔', '≡'): return _to_bool(l) == _to_bool(r)
        ln, rn = _to_num(l), _to_num(r)
        if op == '=': return ln == rn
        if op == '≠': return ln != rn
        if op == '<': return ln < rn
        if op == '≤': return ln <= rn
        if op == '>': return ln > rn
        if op == '≥': return ln >= rn
        if op == '+': return ln + rn
        if op == '-': return ln - rn
        if op == '*': return ln * rn
        if op == '/':
            if rn == 0: raise ZeroDivisionError('Division by zero')
            return ln / rn
        if op == '%':
            if rn == 0: raise ZeroDivisionError('Modulo by zero')
            return math.fmod(ln, rn)
        if op == '^': return ln ** rn
    raise ValueError(f'Unsupported AST node: {t}')

def evaluate_cauchy_sequence(env):
    cfg = DATA_SPEC.get('cauchy') or {}
    seeds = [float(s.strip()) for s in str(cfg.get('seedValues', '0, 1')).split(',') if s.strip()]
    return seeds if seeds else [0.0]

def evaluate_from_input(raw_input='', overrides=None):
    resolved = parse_inputs_from_string(raw_input)
    if overrides: resolved.update(overrides)
    env = {}
    for name, kind, raw_val in LOGIC_LABELS:
        if kind == 'lambda':
            continue
        env[name] = _coerce_literal(resolved.get(name, raw_val), kind)
    for name, val in resolved.items():
        if name not in env:
            env[name] = _coerce_literal(val, 'boolean' if str(val).lower() in ('true', 'false') else 'number')
    return _eval_ast(DATA_SPEC['ast'], env), env

def run_cli(argv=None):
    parser = argparse.ArgumentParser(description='Logic & Lambda Evaluator')
    parser.add_argument('positional', nargs='*')
    parser.add_argument('--input', dest='input_str', default=None)
    parser.add_argument('--json', action='store_true')
    for name, _kind, _def in REQUIRED_INPUTS:
        parser.add_argument(f'--{name}', dest=f'var__{name}', default=None)
    args = parser.parse_args((argv if argv is not None else sys.argv[1:]) if CLI_INPUTS_ENABLED else [])
    raw = args.input_str if args.input_str is not None else ' '.join(args.positional)
    overrides = {name: getattr(args, f'var__{name}') for name, _, _ in REQUIRED_INPUTS if getattr(args, f'var__{name}') is not None}
    result, env = evaluate_from_input(raw, overrides)
    if args.json:
        print(json.dumps({'statement': LOGIC_STATEMENT, 'variables': env, 'result': result}, default=str))
    else:
        print('Variables:', env)
        print('Result:', result)__CAUCHY_LINE__
    return result

if __name__ == '__main__':
    run_cli(sys.argv[1:])
PYTHON;
    $content = str_replace(
        ['__CLI_FLAG__', '__STMT_LIT__', '__GRAMMAR_LIT__', '__SAMPLE_LIT__', '__LABEL_TUPLES__', '__REQ_TUPLES__', '__SPEC_LIT__', '__CAUCHY_LINE__'],
        [
            $cliFlag,
            logic_export_json_literal($stmt),
            logic_export_json_literal($spec['grammarText']),
            logic_export_json_literal($spec['sampleSingleInput']),
            $labelTuples,
            $reqTuples,
            logic_export_json_literal($dataSpec),
            $cauchyLine,
        ],
        $content
    );
    return ['content'=>$content, 'filename'=>'logic_lambda_calc.py', 'mime'=>'text/x-python'];
}

function logic_export_js_ts(string $target, string $stmt, array $labels, array $spec, string $inputMode): array {
    $isTs = $target === 'typescript';
    $cliFlag = $inputMode === 'cli' ? 'true' : 'false';
    $specJson = logic_export_json_literal([
        'statement' => $stmt,
        'ast' => logic_export_ast(parse_logic($stmt)),
        'labels' => array_map(fn($l) => [$l['name'], $l['kind'], $l['value']], $labels),
        'requiredInputs' => $spec['requiredInputs'],
        'sampleSingleInput' => $spec['sampleSingleInput'],
        'grammarText' => $spec['grammarText'],
    ]);
    $tStr = $isTs ? ': string' : '';
    $tAny = $isTs ? ': any' : '';
    $tArr = $isTs ? ': string[]' : '';
    $content = <<<JS
// Auto-generated {$target} Logic, Arithmetic & Lambda Calculus Evaluator (Native PHP Export)
export const CLI_INPUTS_ENABLED = {$cliFlag};
export const DATA_SPEC = {$specJson};
export const LOGIC_STATEMENT = DATA_SPEC.statement;
export const ACTIVE_GRAMMAR = DATA_SPEC.grammarText;
export const SAMPLE_SINGLE_INPUT = DATA_SPEC.sampleSingleInput;
export const REQUIRED_INPUTS = DATA_SPEC.requiredInputs;

function coerceLiteral(raw{$tAny}, kind{$tStr}) {
  const text = String(raw).trim();
  if (kind === 'boolean') {
    const low = text.toLowerCase();
    if (['true', '1', 'yes', 't', '⊤'].includes(low)) return true;
    if (['false', '0', 'no', 'f', '⊥'].includes(low)) return false;
    throw new Error(\`Invalid boolean literal: \${raw}\`);
  }
  if (!/^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?$/.test(text)) {
    throw new Error(\`Invalid numeric literal: \${raw}\`);
  }
  const n = Number(text);
  if (!Number.isFinite(n)) throw new Error(\`Non-finite numeric literal: \${raw}\`);
  return n;
}

const toBool = (v{$tAny}) => v !== false && v !== 0;
const toNum = (v{$tAny}) => (typeof v === 'boolean' ? (v ? 1 : 0) : Number(v));

export function parseInputsFromString(rawInput{$tStr} = '') {
  const out{$tAny} = Object.fromEntries(REQUIRED_INPUTS.map((r{$tAny}) => [r.name, r.defaultValue]));
  const text = String(rawInput || '').trim();
  if (!text) return out;
  if (text.startsWith('{') || text.startsWith('[')) {
    let parsed = JSON.parse(text);
    if (parsed && !Array.isArray(parsed) && ('logic_labels' in parsed || 'labels' in parsed)) {
      parsed = parsed.logic_labels ?? parsed.labels;
      if (typeof parsed === 'string') return parseInputsFromString(parsed);
    }
    if (Array.isArray(parsed)) {
      if (parsed.length > REQUIRED_INPUTS.length) throw new Error('Too many positional inputs');
      parsed.forEach((v, i) => { out[REQUIRED_INPUTS[i].name] = String(v); });
      return out;
    }
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) out[k] = String(v);
      return out;
    }
  }
  if (!/[:=]/.test(text)) {
    const parts = text.split(/[\\s,;]+/).filter(Boolean);
    if (parts.length > REQUIRED_INPUTS.length) throw new Error('Too many positional inputs');
    parts.forEach((v, i) => { out[REQUIRED_INPUTS[i].name] = v; });
    return out;
  }
  for (const m of text.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\\s*[:=]\\s*([^\\s,;]+)/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

function evalAst(node{$tAny}, env{$tAny}, depth = 0){$tAny} {
  if (depth > 48) throw new Error('Maximum lambda recursion depth exceeded');
  switch (node.type) {
    case 'NumberLit':
    case 'BooleanLit': return node.value;
    case 'Identifier':
      if (!(node.name in env)) throw new Error(\`Unbound label: \${node.name}\`);
      return env[node.name];
    case 'Lambda': return (arg{$tAny}) => evalAst(node.body, { ...env, [node.param]: arg }, depth + 1);
    case 'Call': {
      const fn = evalAst(node.callee, env, depth + 1);
      if (typeof fn !== 'function') throw new Error('Cannot invoke non-lambda value');
      return fn(evalAst(node.arg, env, depth + 1));
    }
    case 'Quantifier': {
      const a = toBool(evalAst(node.body, { ...env, [node.param]: false }, depth + 1));
      const b = toBool(evalAst(node.body, { ...env, [node.param]: true }, depth + 1));
      return node.quantifier === '∀' ? (a && b) : (a || b);
    }
    case 'UnaryOp': {
      const v = evalAst(node.operand, env, depth + 1);
      return node.op === '¬' ? !toBool(v) : -toNum(v);
    }
    case 'BinaryOp': {
      const l = evalAst(node.left, env, depth + 1);
      const r = evalAst(node.right, env, depth + 1);
      switch (node.op) {
        case '∧': return toBool(l) && toBool(r);
        case '∨': return toBool(l) || toBool(r);
        case '⊕': return toBool(l) !== toBool(r);
        case '→': return !toBool(l) || toBool(r);
        case '↔': case '≡': return toBool(l) === toBool(r);
        case '=': return toNum(l) === toNum(r);
        case '≠': return toNum(l) !== toNum(r);
        case '<': return toNum(l) < toNum(r);
        case '≤': return toNum(l) <= toNum(r);
        case '>': return toNum(l) > toNum(r);
        case '≥': return toNum(l) >= toNum(r);
        case '+': return toNum(l) + toNum(r);
        case '-': return toNum(l) - toNum(r);
        case '*': return toNum(l) * toNum(r);
        case '/': if (toNum(r) === 0) throw new Error('Division by zero'); return toNum(l) / toNum(r);
        case '%': if (toNum(r) === 0) throw new Error('Modulo by zero'); return toNum(l) % toNum(r);
        case '^': return Math.pow(toNum(l), toNum(r));
      }
    }
  }
  throw new Error(\`Unsupported AST node: \${node.type}\`);
}

export function evaluateFromInput(rawInput{$tStr} = '', overrides{$tAny} = {}) {
  const parsedInputs = { ...parseInputsFromString(rawInput), ...overrides };
  const env{$tAny} = {};
  for (const [name, kind, rawVal] of DATA_SPEC.labels) {
    if (kind === 'lambda') continue;
    env[name] = coerceLiteral(name in parsedInputs ? parsedInputs[name] : rawVal, kind);
  }
  for (const [k, v] of Object.entries(parsedInputs)) {
    if (!(k in env)) env[k] = coerceLiteral(v, /^(?:true|false|⊤|⊥)$/i.test(String(v)) ? 'boolean' : 'number');
  }
  return { statement: LOGIC_STATEMENT, parsedInputs: env, result: evalAst(DATA_SPEC.ast, env) };
}

export function runCli(argv{$tArr} = typeof process !== 'undefined' ? process.argv.slice(2) : []) {
  const effective = CLI_INPUTS_ENABLED ? argv : [];
  let raw = '';
  const overrides{$tAny} = {};
  for (let i = 0; i < effective.length; i += 1) {
    const arg = effective[i];
    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const eq = body.indexOf('=');
      const key = eq >= 0 ? body.slice(0, eq) : body;
      const val = eq >= 0 ? body.slice(eq + 1) : (effective[++i] ?? '');
      if (key === 'input' || key === 'logic_labels') raw = val;
      else overrides[key.replace(/-/g, '_')] = val;
    } else {
      raw = raw ? \`\${raw} \${arg}\` : arg;
    }
  }
  const out = evaluateFromInput(raw, overrides);
  console.log('Variables:', out.parsedInputs);
  console.log('Result:', out.result);
  return out;
}
JS;
    return [
        'content' => $content,
        'filename' => $isTs ? 'logic_lambda_calc.ts' : 'logic_lambda_calc.mjs',
        'mime' => $isTs ? 'text/typescript' : 'text/javascript',
    ];
}

function logic_export_target(array $state, string $target, string $inputMode = 'cli'): array {
    $supported = ['python','jsonld','rust','wat','wasm','typescript','javascript','go','java','cpp','csharp','php',
        'sql','swift','kotlin','ruby','scala','haskell','elixir','lua','zig','dart','ocaml'];
    if (!in_array($target, $supported, true)) throw new InputError("Unsupported logic export target '$target'.", 404);
    $unsupported = logic_export_unsupported($state['cauchyConfig'], $target);
    if ($unsupported !== null) throw new InputError($unsupported, 422);
    $mode = strtolower($inputMode) === 'hardcoded' ? 'hardcoded' : 'cli';
    $evaluation = evaluate_statement($state['statement'], $state['labels']);
    $spec = logic_export_spec($state['statement'], $state['labels'], $evaluation, workspace_default($state));
    $cleanStmt = trim($state['statement']);

    if ($target === 'jsonld') {
        $doc = ['@context'=>'https://schema.org','@type'=>'MathSolver','name'=>'LogicLambdaStatement',
            'x-logic-format'=>'grammar2json-logic-lambda/v1','x-logic-statement'=>$cleanStmt,
            'x-translated-statement'=>$cleanStmt,
            'x-input-grammar'=>['entryRule'=>$spec['entryRule'],'sampleSingleInput'=>$spec['sampleSingleInput'],
                'requiredInputs'=>$spec['requiredInputs'],'rules'=>$spec['rules'],'grammarText'=>$spec['grammarText']],
            'x-cli-parameters'=>['namedLiteralFlags'=>array_map(fn($input) => ['name'=>$input['name'],'flag'=>'--'.$input['name'],
                'literalType'=>$input['kind'],'defaultValue'=>$input['defaultValue']], $spec['requiredInputs']),
                'editableStringFlags'=>[['flag'=>'--input','target'=>'SAMPLE_SINGLE_INPUT','defaultValue'=>$spec['sampleSingleInput']],
                    ['flag'=>'--statement','target'=>'LOGIC_STATEMENT','defaultValue'=>$cleanStmt],
                    ['flag'=>'--grammar','target'=>'ACTIVE_GRAMMAR','defaultValue'=>$spec['grammarText']]]],
            'x-named-callbacks'=>[],
            'x-labels'=>array_map(fn($label) => ['name'=>$label['name'],'kind'=>$label['kind'],'value'=>$label['value']], $state['labels']),
            'x-evaluation'=>['ok'=>$evaluation['ok'],'valueType'=>$evaluation['valueType'],'displayValue'=>$evaluation['displayValue']],
            'x-ast'=>logic_export_ast(parse_logic($state['statement']))];
        if (!empty($state['cauchyConfig']['enabled'])) {
            $cauchy = evaluate_cauchy((object)$state['cauchyConfig'], $state['labels']);
            $doc['x-cauchy-sequence'] = ['paramStyle'=>$state['cauchyConfig']['paramStyle'],
                'resolvedParamNames'=>$cauchy['resolvedParamNames'],'seedValues'=>$state['cauchyConfig']['seedValues'],
                'recurrenceExpr'=>$state['cauchyConfig']['recurrenceExpr'],'maxIterations'=>$state['cauchyConfig']['maxIterations'],
                'epsilon'=>$state['cauchyConfig']['epsilon'],'converged'=>$cauchy['converged'],
                'cauchyIndexN'=>$cauchy['cauchyIndexN'],'limitEstimate'=>$cauchy['limitEstimate'],'tailDiameter'=>$cauchy['tailDiameter']];
        }
        return ['content'=>json_encode($doc, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS),
            'filename'=>'logic_lambda_calc.jsonld','mime'=>'application/ld+json'];
    }

    if ($target === 'python') return logic_export_python($cleanStmt, $state['labels'], $spec, $state['cauchyConfig'], $mode);
    if ($target === 'javascript' || $target === 'typescript') return logic_export_js_ts($target, $cleanStmt, $state['labels'], $spec, $mode);

    $stmtLit = logic_export_json_literal($cleanStmt);
    $sampleLit = logic_export_json_literal($spec['sampleSingleInput']);
    $grammarLit = logic_export_json_literal($spec['grammarText']);
    $resLit = logic_export_json_literal($evaluation['displayValue']);
    $cliBool = $mode === 'cli' ? 'true' : 'false';

    if ($target === 'rust') {
        $labelTuples = implode(",\n", array_map(
            fn($l) => '    (' . logic_export_json_literal($l['name']) . ', ' . logic_export_json_literal($l['kind']) . ', ' . logic_export_json_literal($l['value']) . ')',
            $state['labels']
        ));
        $guard = $evaluation['ok']
            ? "    if raw_input.is_empty() || raw_input == SAMPLE_SINGLE_INPUT { return Ok({$resLit}.to_string()); }\n"
            : '';
        $content = <<<RUST
// Auto-generated Rust Logic & Lambda Module (Native PHP Export)
pub const CLI_INPUTS_ENABLED: bool = {$cliBool};
pub const LOGIC_STATEMENT: &str = {$stmtLit};
pub const ACTIVE_GRAMMAR: &str = {$grammarLit};
pub const SAMPLE_SINGLE_INPUT: &str = {$sampleLit};
pub const LOGIC_LABELS: &[(&str, &str, &str)] = &[
{$labelTuples}
];

pub fn evaluate_from_input(raw_input: &str) -> Result<String, String> {
{$guard}    Err("Dynamic evaluation requires compiling the Rust AST evaluator runtime".to_string())
}

fn main() {
    let args: Vec<String> = if CLI_INPUTS_ENABLED { std::env::args().skip(1).collect() } else { Vec::new() };
    let input = args.join(" ");
    match evaluate_from_input(&input) {
        Ok(val) => println!("Result: {}", val),
        Err(err) => { eprintln!("Error: {}", err); std::process::exit(1); }
    }
}
RUST;
        return ['content'=>$content, 'filename'=>'logic_lambda_calc.rs', 'mime'=>'text/x-rust'];
    }

    if ($target === 'php') {
        $labelEntries = implode(",\n", array_map(
            fn($l) => '    [' . logic_export_json_literal($l['name']) . ', ' . logic_export_json_literal($l['kind']) . ', ' . logic_export_json_literal($l['value']) . ']',
            $state['labels']
        ));
        $reqEntries = implode(",\n", array_map(
            fn($r) => '    [' . logic_export_json_literal($r['name']) . ', ' . logic_export_json_literal($r['kind']) . ', ' . logic_export_json_literal($r['defaultValue']) . ']',
            $spec['requiredInputs']
        ));
        $dataSpecLit = logic_export_json_literal(json_encode([
            'statement' => $cleanStmt,
            'ast' => logic_export_ast(parse_logic($state['statement'])),
            'labels' => array_map(fn($l) => [$l['name'], $l['kind'], $l['value']], $state['labels']),
            'requiredInputs' => $spec['requiredInputs'],
            'sampleSingleInput' => $spec['sampleSingleInput'],
            'grammarText' => $spec['grammarText'],
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $content = <<<'PHP_EXPORT'
<?php
declare(strict_types=1);
// Auto-generated PHP Logic, Arithmetic & Lambda Calculus Evaluator (Native PHP Export)
const CLI_INPUTS_ENABLED = __CLI_BOOL__;
const LOGIC_STATEMENT = __STMT_LIT__;
const ACTIVE_GRAMMAR = __GRAMMAR_LIT__;
const SAMPLE_SINGLE_INPUT = __SAMPLE_LIT__;
const LOGIC_LABELS = [
__LABEL_ENTRIES__
];
const REQUIRED_INPUTS = [
__REQ_ENTRIES__
];
const DATA_SPEC_JSON = __DATA_SPEC_LIT__;

function logic_data_spec(): array {
    static $decoded = null;
    if ($decoded === null) {
        $decoded = json_decode(DATA_SPEC_JSON, true, 512, JSON_THROW_ON_ERROR);
    }
    return $decoded;
}

function coerce_literal(mixed $raw, string $kind): int|float|bool {
    $text = trim((string)$raw);
    if ($kind === 'boolean') {
        $low = strtolower($text);
        if (in_array($low, ['true', '1', 'yes', 't', '⊤'], true)) return true;
        if (in_array($low, ['false', '0', 'no', 'f', '⊥'], true)) return false;
        throw new InvalidArgumentException("Invalid boolean literal: {$text}");
    }
    if (!preg_match('/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/D', $text)) {
        throw new InvalidArgumentException("Invalid numeric literal: {$text}");
    }
    $num = (float)$text;
    if (!is_finite($num)) throw new InvalidArgumentException("Non-finite numeric literal: {$text}");
    return (floor($num) === $num && abs($num) <= 9e15) ? (int)$num : $num;
}

function logic_to_bool(mixed $v): bool {
    return $v !== false && $v !== 0 && $v !== 0.0 && $v !== '' && $v !== null;
}

function logic_to_num(mixed $v): int|float {
    if (is_bool($v)) return $v ? 1 : 0;
    return is_int($v) ? $v : (float)$v;
}

function parse_inputs_from_string(string $rawInput = ''): array {
    $parsed = [];
    foreach (REQUIRED_INPUTS as [$name, $_kind, $def]) {
        $parsed[$name] = $def;
    }
    $text = trim($rawInput);
    if ($text === '') return $parsed;
    if (str_starts_with($text, '{') || str_starts_with($text, '[')) {
        $decoded = json_decode($text, true);
        if (is_array($decoded)) {
            if (!array_is_list($decoded) && (array_key_exists('logic_labels', $decoded) || array_key_exists('labels', $decoded))) {
                $decoded = $decoded['logic_labels'] ?? $decoded['labels'];
                if (is_string($decoded)) return parse_inputs_from_string($decoded);
            }
            if (is_array($decoded) && array_is_list($decoded)) {
                if (count($decoded) > count(REQUIRED_INPUTS)) throw new InvalidArgumentException('Too many positional inputs');
                foreach ($decoded as $i => $val) {
                    $parsed[REQUIRED_INPUTS[$i][0]] = is_bool($val) ? ($val ? 'true' : 'false') : (string)$val;
                }
                return $parsed;
            }
            if (is_array($decoded)) {
                foreach ($decoded as $k => $val) {
                    $parsed[(string)$k] = is_bool($val) ? ($val ? 'true' : 'false') : (string)$val;
                }
                return $parsed;
            }
        }
    }
    if (!preg_match('/[:=]/', $text)) {
        $parts = array_values(array_filter(preg_split('/[\s,;]+/', $text) ?: [], fn($p) => $p !== ''));
        if (count($parts) > count(REQUIRED_INPUTS)) throw new InvalidArgumentException('Too many positional inputs');
        foreach ($parts as $i => $val) $parsed[REQUIRED_INPUTS[$i][0]] = $val;
        return $parsed;
    }
    if (preg_match_all('/([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*([^\s,;]+)/u', $text, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $m) $parsed[$m[1]] = $m[2];
    }
    return $parsed;
}

function eval_logic_ast(array $node, array $env, int $depth = 0): mixed {
    if ($depth > 48) throw new RuntimeException('Maximum lambda recursion depth exceeded');
    switch ($node['type'] ?? '') {
        case 'NumberLit':
        case 'BooleanLit':
            return $node['value'];
        case 'Identifier':
            if (!array_key_exists($node['name'], $env)) {
                throw new RuntimeException("Unresolved label '{$node['name']}'");
            }
            return $env[$node['name']];
        case 'Lambda':
            $param = $node['param'];
            $body = $node['body'];
            return static fn(mixed $arg): mixed => eval_logic_ast($body, [...$env, $param => $arg], $depth + 1);
        case 'Call':
            $fn = eval_logic_ast($node['callee'], $env, $depth + 1);
            if (!is_callable($fn)) throw new RuntimeException('Cannot invoke non-lambda value');
            return $fn(eval_logic_ast($node['arg'], $env, $depth + 1));
        case 'Quantifier':
            $a = logic_to_bool(eval_logic_ast($node['body'], [...$env, $node['param'] => false], $depth + 1));
            $b = logic_to_bool(eval_logic_ast($node['body'], [...$env, $node['param'] => true], $depth + 1));
            return ($node['quantifier'] ?? '∀') === '∀' ? ($a && $b) : ($a || $b);
        case 'UnaryOp':
            $v = eval_logic_ast($node['operand'], $env, $depth + 1);
            return ($node['op'] ?? '') === '¬' ? !logic_to_bool($v) : -logic_to_num($v);
        case 'BinaryOp':
            $l = eval_logic_ast($node['left'], $env, $depth + 1);
            $r = eval_logic_ast($node['right'], $env, $depth + 1);
            return match ($node['op'] ?? '') {
                '∧' => logic_to_bool($l) && logic_to_bool($r),
                '∨' => logic_to_bool($l) || logic_to_bool($r),
                '⊕' => logic_to_bool($l) !== logic_to_bool($r),
                '→' => !logic_to_bool($l) || logic_to_bool($r),
                '↔', '≡' => logic_to_bool($l) === logic_to_bool($r),
                '=' => logic_to_num($l) == logic_to_num($r),
                '≠' => logic_to_num($l) != logic_to_num($r),
                '<' => logic_to_num($l) < logic_to_num($r),
                '≤' => logic_to_num($l) <= logic_to_num($r),
                '>' => logic_to_num($l) > logic_to_num($r),
                '≥' => logic_to_num($l) >= logic_to_num($r),
                '+' => logic_to_num($l) + logic_to_num($r),
                '-' => logic_to_num($l) - logic_to_num($r),
                '*' => logic_to_num($l) * logic_to_num($r),
                '/' => logic_to_num($r) == 0 ? throw new DivisionByZeroError('Division by zero') : logic_to_num($l) / logic_to_num($r),
                '%' => logic_to_num($r) == 0 ? throw new DivisionByZeroError('Modulo by zero') : fmod((float)logic_to_num($l), (float)logic_to_num($r)),
                '^' => pow(logic_to_num($l), logic_to_num($r)),
                default => throw new RuntimeException('Unsupported binary operator: ' . ($node['op'] ?? '')),
            };
    }
    throw new RuntimeException('Unsupported AST node: ' . ($node['type'] ?? 'unknown'));
}

function evaluate_from_input(string $rawInput = SAMPLE_SINGLE_INPUT, ?callable $systemParser = null, array $overrides = []): array {
    $parsed = array_merge(parse_inputs_from_string($rawInput), $overrides);
    $spec = logic_data_spec();
    $mergedLabels = [];
    foreach ($spec['labels'] as [$name, $kind, $val]) {
        $mergedLabels[] = [$name, $kind, ($kind !== 'lambda' && array_key_exists($name, $parsed)) ? (string)$parsed[$name] : $val];
    }
    if ($systemParser !== null) {
        return ['statement' => LOGIC_STATEMENT, 'variables' => $parsed, 'result' => $systemParser(LOGIC_STATEMENT, $mergedLabels)];
    }
    $env = [];
    foreach ($mergedLabels as [$name, $kind, $rawVal]) {
        if ($kind === 'lambda') continue;
        $env[$name] = coerce_literal($rawVal, $kind);
    }
    foreach ($parsed as $k => $v) {
        if (!array_key_exists($k, $env)) {
            $kind = preg_match('/^(?:true|false|⊤|⊥)$/i', (string)$v) ? 'boolean' : 'number';
            $env[$k] = coerce_literal($v, $kind);
        }
    }
    return ['statement' => LOGIC_STATEMENT, 'variables' => $env, 'result' => eval_logic_ast($spec['ast'], $env)];
}

function evaluate_from_input_statement(string $rawInput, string $statement, ?callable $systemParser = null): mixed {
    if ($statement === LOGIC_STATEMENT && $systemParser === null) {
        return evaluate_from_input($rawInput)['result'];
    }
    $inputs = parse_inputs_from_string($rawInput);
    $merged = array_map(fn($l) => [$l[0], $l[1], ($l[1] !== 'lambda' && isset($inputs[$l[0]])) ? $inputs[$l[0]] : $l[2]], LOGIC_LABELS);
    return evaluate_logic($statement, $merged, $systemParser);
}

function evaluate_logic(string $statement = LOGIC_STATEMENT, array $labels = LOGIC_LABELS, ?callable $systemParser = null): mixed {
    if ($systemParser !== null) return $systemParser($statement, $labels);
    if ($statement !== LOGIC_STATEMENT) {
        throw new LogicException('Custom runtime statement parsing requires a $systemParser callback; compiled AST evaluates LOGIC_STATEMENT.');
    }
    $spec = logic_data_spec();
    $env = [];
    foreach ($labels as [$name, $kind, $rawVal]) {
        if ($kind === 'lambda') continue;
        $env[$name] = coerce_literal($rawVal, $kind);
    }
    return eval_logic_ast($spec['ast'], $env);
}

function run_cli(array $argv = []): array {
    $effective = CLI_INPUTS_ENABLED ? $argv : [];
    $rawParts = [];
    $rawInputOverride = null;
    $asJson = false;
    $overrides = [];
    $count = count($effective);
    for ($i = 0; $i < $count; ++$i) {
        $arg = (string)$effective[$i];
        if ($arg === '--json') { $asJson = true; continue; }
        if (str_starts_with($arg, '--')) {
            $body = substr($arg, 2);
            $eq = strpos($body, '=');
            $key = $eq !== false ? substr($body, 0, $eq) : $body;
            $val = $eq !== false ? substr($body, $eq + 1) : (string)($effective[++$i] ?? '');
            if ($key === 'input' || $key === 'logic_labels') $rawInputOverride = $val;
            else $overrides[str_replace('-', '_', $key)] = $val;
        } else {
            $rawParts[] = $arg;
        }
    }
    $raw = $rawInputOverride ?? implode(' ', $rawParts);
    $out = evaluate_from_input($raw, null, $overrides);
    if ($asJson) {
        echo json_encode($out, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    } else {
        echo 'Variables: ' . json_encode($out['variables'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
        echo 'Result: ' . (is_bool($out['result']) ? ($out['result'] ? 'true' : 'false') : (string)$out['result']) . PHP_EOL;
    }
    return $out;
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    run_cli(array_slice($argv ?? [], 1));
}
PHP_EXPORT;
        $content = str_replace(
            ['__CLI_BOOL__', '__STMT_LIT__', '__GRAMMAR_LIT__', '__SAMPLE_LIT__', '__LABEL_ENTRIES__', '__REQ_ENTRIES__', '__DATA_SPEC_LIT__'],
            [$cliBool, $stmtLit, $grammarLit, $sampleLit, $labelEntries, $reqEntries, $dataSpecLit],
            $content
        );
        return ['content'=>$content, 'filename'=>'logic_lambda_calc.php', 'mime'=>'application/x-httpd-php'];
    }

    if ($target === 'sql') {
        $sqlEsc = fn(string $s): string => "'" . str_replace("'", "''", $s) . "'";
        $rows = implode("\n", array_map(
            fn($l) => 'INSERT OR REPLACE INTO logic_labels (name, kind, expr_value) VALUES (' . $sqlEsc($l['name']) . ', ' . $sqlEsc($l['kind']) . ', ' . $sqlEsc($l['value']) . ');',
            $state['labels']
        ));
        $content = "-- Auto-generated SQL Logic Record & Query (Native PHP Export, mode={$mode})\n"
            . "CREATE TABLE IF NOT EXISTS logic_statements (statement TEXT NOT NULL, sample_single_input TEXT NOT NULL, evaluated_result TEXT NOT NULL);\n"
            . "CREATE TABLE IF NOT EXISTS logic_labels (name VARCHAR(128) PRIMARY KEY, kind VARCHAR(32) NOT NULL, expr_value TEXT NOT NULL);\n"
            . "INSERT INTO logic_statements (statement, sample_single_input, evaluated_result) VALUES ("
            . $sqlEsc($cleanStmt) . ', ' . $sqlEsc($spec['sampleSingleInput']) . ', ' . $sqlEsc($evaluation['displayValue']) . ");\n"
            . ($rows !== '' ? $rows . "\n" : '')
            . "SELECT stmt.statement, stmt.sample_single_input, stmt.evaluated_result, COUNT(lbl.name) AS label_count\n"
            . "FROM logic_statements stmt\n"
            . "LEFT JOIN logic_labels lbl ON 1 = 1\n"
            . "GROUP BY stmt.statement, stmt.sample_single_input, stmt.evaluated_result;\n";
        return ['content'=>$content, 'filename'=>'logic_lambda_calc.sql', 'mime'=>'application/sql'];
    }

    if ($target === 'wat' || $target === 'wasm') {
        $num = $evaluation['valueType'] === 'number' ? (int)round((float)$evaluation['displayValue'])
            : ($evaluation['valueType'] === 'boolean' ? ($evaluation['displayValue'] === 'true' ? 1 : 0) : 0);
        $cleanData = str_replace(['"', '\\'], '', "stmt={$cleanStmt}|input={$spec['sampleSingleInput']}");
        $cliGuard = $mode === 'cli' ? "    (if (local.get \$len)\n      (then (unreachable))\n    )\n" : "    (local.get \$len)\n    (drop)\n";
        $wat = "(module\n"
            . "  ;; Logic & Lambda WABT Module (Native PHP Export, mode={$mode})\n"
            . "  (memory (export \"memory\") 1)\n"
            . "  (data (i32.const 0) \"{$cleanData}\")\n"
            . "  (func (export \"eval_logic\") (result i32) (i32.const {$num}))\n"
            . "  (func (export \"eval_logic_from_input\") (param \$ptr i32) (param \$len i32) (result i32)\n"
            . "    (local.get \$ptr)\n    (drop)\n{$cliGuard}    (i32.const {$num})\n  )\n"
            . "  (func (export \"label_count\") (result i32) (i32.const " . count($state['labels']) . "))\n"
            . ")\n";
        return [
            'content' => $wat,
            'filename' => $target === 'wasm' ? 'logic_lambda_calc.wasm' : 'logic_lambda_calc.wat',
            'mime' => $target === 'wasm' ? 'application/wasm' : 'text/plain',
        ];
    }

    // Remaining targets (go, java, cpp, csharp, ruby, swift, kotlin, scala, haskell, elixir, lua, zig, dart, ocaml)
    $extMap = [
        'go'=>'go', 'java'=>'java', 'cpp'=>'hpp', 'csharp'=>'cs', 'ruby'=>'rb',
        'swift'=>'swift', 'kotlin'=>'kt', 'scala'=>'scala', 'haskell'=>'hs',
        'elixir'=>'ex', 'lua'=>'lua', 'zig'=>'zig', 'dart'=>'dart', 'ocaml'=>'ml',
    ];
    $prefixMap = [
        'ruby'=>'#', 'elixir'=>'#', 'haskell'=>'--', 'lua'=>'--', 'ocaml'=>'(*',
    ];
    $cp = $prefixMap[$target] ?? '//';
    $cs = $target === 'ocaml' ? ' *)' : '';
    $labelsComment = implode("\n", array_map(
        fn($l) => "{$cp}   {$l['name']} ({$l['kind']}) = {$l['value']}{$cs}",
        $state['labels']
    ));
    $body = match ($target) {
        'go' => "package logiccalc\nconst CliInputsEnabled = {$cliBool}\nconst LogicStatement = {$stmtLit}\nconst SampleSingleInput = {$sampleLit}\nfunc EvaluateFromInput(rawInput string) (string, error) {\n"
            . ($evaluation['ok'] ? "  if rawInput == \"\" || rawInput == SampleSingleInput { return {$resLit}, nil }\n" : '')
            . "  return \"\", fmt.Errorf(\"standalone expression evaluation is not implemented\")\n}\n",
        'java' => "public final class LogicLambdaCalc {\n  public static final boolean CLI_INPUTS_ENABLED = {$cliBool};\n  public static final String LOGIC_STATEMENT = {$stmtLit};\n  public static final String SAMPLE_SINGLE_INPUT = {$sampleLit};\n  public static String evaluateFromInput(String rawInput) {\n"
            . ($evaluation['ok'] ? "    if (rawInput == null || rawInput.isEmpty() || SAMPLE_SINGLE_INPUT.equals(rawInput)) return {$resLit};\n" : '')
            . "    throw new UnsupportedOperationException(\"standalone expression evaluation is not implemented\");\n  }\n}\n",
        'cpp' => "#include <stdexcept>\n#include <string>\ninline constexpr bool CLI_INPUTS_ENABLED = {$cliBool};\ninline const std::string LOGIC_STATEMENT = {$stmtLit};\ninline const std::string SAMPLE_SINGLE_INPUT = {$sampleLit};\ninline std::string evaluate_from_input(const std::string& raw_input = SAMPLE_SINGLE_INPUT) {\n"
            . ($evaluation['ok'] ? "  if (raw_input.empty() || raw_input == SAMPLE_SINGLE_INPUT) return {$resLit};\n" : '')
            . "  throw std::runtime_error(\"standalone expression evaluation is not implemented\");\n}\n",
        'csharp' => "public static class LogicLambdaCalc {\n  public const bool CliInputsEnabled = {$cliBool};\n  public const string LogicStatement = {$stmtLit};\n  public const string SampleSingleInput = {$sampleLit};\n  public static string EvaluateFromInput(string rawInput = SampleSingleInput) {\n"
            . ($evaluation['ok'] ? "    if (string.IsNullOrEmpty(rawInput) || rawInput == SampleSingleInput) return {$resLit};\n" : '')
            . "    throw new NotSupportedException(\"standalone expression evaluation is not implemented\");\n  }\n}\n",
        'ruby' => "CLI_INPUTS_ENABLED = {$cliBool}\nLOGIC_STATEMENT = {$stmtLit}\nSAMPLE_SINGLE_INPUT = {$sampleLit}\ndef evaluate_from_input(raw_input = SAMPLE_SINGLE_INPUT)\n"
            . ($evaluation['ok'] ? "  return {$resLit} if raw_input.to_s.empty? || raw_input == SAMPLE_SINGLE_INPUT\n" : '')
            . "  raise 'Dynamic evaluation is not implemented for this export'\nend\n",
        'lua' => "local M = {}\nM.CLI_INPUTS_ENABLED = {$cliBool}\nM.LOGIC_STATEMENT = {$stmtLit}\nM.SAMPLE_SINGLE_INPUT = {$sampleLit}\nfunction M.evaluate_from_input(raw_input)\n  if raw_input == nil then raw_input = M.SAMPLE_SINGLE_INPUT end\n"
            . ($evaluation['ok'] ? "  if raw_input == M.SAMPLE_SINGLE_INPUT then return {$resLit} end\n" : '')
            . "  error(\"Dynamic evaluation is not implemented for this export\")\nend\nreturn M\n",
        default => "{$cp} CLI_INPUTS_ENABLED = {$cliBool}{$cs}\n{$cp} LOGIC_STATEMENT = {$stmtLit}{$cs}\n{$cp} SAMPLE_SINGLE_INPUT = {$sampleLit}{$cs}\n{$cp} Verified sample result (exact match only): " . ($evaluation['ok'] ? $resLit : 'Eval Error') . "{$cs}\n",
    };
    $content = "{$cp} Auto-generated " . strtoupper($target) . " Logic & Lambda Module (Native PHP Export, mode={$mode}){$cs}\n{$body}{$cp} Labels:{$cs}\n{$labelsComment}\n";
    return [
        'content' => $content,
        'filename' => 'logic_lambda_calc.' . ($extMap[$target] ?? 'txt'),
        'mime' => 'text/plain',
    ];
}

function serve_logic_export(string $route, string $method): never {
    $target = substr($route, strlen('api/logic/export/'));
    $links = ['self'=>['href'=>api_links('/'.$route)['self']['href'],'method'=>'GET'],
        'logic'=>['href'=>api_links('/api/logic')['self']['href'],'method'=>'GET']];
    if (!in_array($method, ['GET','HEAD'], true)) {
        header('Allow: GET, HEAD, OPTIONS');
        api_json(405, ['ok'=>false,'error'=>'Method not allowed.','_links'=>$links], true);
    }
    $rawMode = is_string($_GET['mode'] ?? null) ? strtolower($_GET['mode']) : 'cli';
    $inputMode = $rawMode === 'hardcoded' ? 'hardcoded' : 'cli';
    try {
        $export = logic_export_target(logic_state(logic_store()), $target, $inputMode);
        api_json(200, ['language'=>$target,'inputMode'=>$inputMode,'filename'=>$export['filename'],'mime'=>$export['mime'],
            'content'=>$export['content'],'_links'=>$links], true);
    } catch (InputError $error) {
        $status = $error->getCode() === 404 ? 404 : ($error->getCode() === 422 ? 422 : 400);
        api_json($status, ['ok'=>false,'code'=>$status === 422 ? 'unsupported_cauchy_export' : 'unsupported_logic_export',
            'language'=>$target,'error'=>$error->getMessage(),'_links'=>$links], true);
    } catch (UnsupportedLogic $error) {
        api_json(422, ['ok'=>false,'code'=>'logic_export_failed','language'=>$target,'error'=>$error->getMessage(),'_links'=>$links], true);
    } catch (LogicStorageError $error) {
        api_json(503, ['ok'=>false,'code'=>'logic_export_failed','language'=>$target,'error'=>$error->getMessage(),'_links'=>$links], true);
    }
}
