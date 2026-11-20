<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

function grammar_split_alternatives(string $expression, string $delimiter, ?stdClass $dialect = null): array {
    if ($delimiter === '') return [trim($expression)];
    $chars = preg_split('//u', $expression, -1, PREG_SPLIT_NO_EMPTY);
    if ($chars === false) return [trim($expression)];
    $openers = ['('=>0, '['=>0, '{'=>0];
    $closers = [')'=>'(', ']'=>'[', '}'=>'{'];
    if ($dialect && isset($dialect->symbols)) {
        foreach (['groupParens', 'charClassBrackets', 'repeatBraces'] as $k) {
            $sym = (string)($dialect->symbols->$k ?? '');
            $sLen = mb_strlen($sym, 'UTF-8');
            if ($sLen >= 2) {
                $op = mb_substr($sym, 0, 1, 'UTF-8');
                $cl = mb_substr($sym, $sLen - 1, 1, 'UTF-8');
                if ($op !== $cl) { $openers[$op] = 0; $closers[$cl] = $op; }
            }
        }
    }
    $delimChars = preg_split('//u', $delimiter, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $dLen = count($delimChars);
    $result = []; $current = ''; $quote = ''; $n = count($chars);
    for ($i = 0; $i < $n;) {
        $ch = $chars[$i];
        if ($quote !== '') {
            $current .= $ch;
            if ($ch === $quote && ($i === 0 || $chars[$i - 1] !== '\\')) $quote = '';
            ++$i; continue;
        }
        if ($ch === '"' || $ch === "'") { $quote = $ch; $current .= $ch; ++$i; continue; }
        if ($ch === '/' && $delimiter !== '/') {
            for ($j = $i + 1; $j < $n; ++$j) {
                if ($chars[$j] === '\\') { ++$j; continue; }
                if ($chars[$j] === '/') { $current .= implode('', array_slice($chars, $i, $j + 1 - $i)); $i = $j + 1; continue 2; }
            }
        }
        if (isset($openers[$ch])) ++$openers[$ch];
        elseif (isset($closers[$ch]) && $openers[$closers[$ch]] > 0) --$openers[$closers[$ch]];
        if (array_sum($openers) === 0 && $dLen > 0 && array_slice($chars, $i, $dLen) === $delimChars) {
            if (trim($current) !== '') $result[] = trim($current);
            $current = ''; $i += $dLen; continue;
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
            if (!preg_match('/^(\S+)(\s+)(.+)$/su', $clean, $parts)) continue;
            $name = preg_replace('/^<|>$/u', '', trim($parts[1]));
            if (!preg_match('/^[\p{L}_][\p{L}\p{N}_.-]*$/Du', $name)) continue;
            $expression = trim($parts[3]);
        } else {
            $position = strpos($clean, $operator);
            if ($position === false || $position === 0) continue;
            $name = preg_replace('/^<|>$/u', '', trim(substr($clean, 0, $position)));
            $expression = trim(substr($clean, $position + strlen($operator)));
        }
        if ($name === '' || $expression === '') continue;
        $raw[] = ['lineNumber'=>$index+1, 'name'=>$name, 'expression'=>$expression, 'rawLine'=>$clean];
        $names[$name] = true;
    }
    $result = [];
    foreach ($raw as $rule) {
        $literals = []; $stripped = grammar_literal_segments($rule['expression'], $literals);
        if ($delimiter !== '/') $stripped = preg_replace('~/(?:\\\\.|[^/\\\\])+/~u', ' ', $stripped);
        $stripped = preg_replace_callback('/\[[^\]]*\]/u', function ($match) use ($names) {
            $inner = trim(substr($match[0], 1, -1));
            preg_match_all('/[\p{L}_][\p{L}\p{N}_-]*/u', $inner, $words);
            foreach ($words[0] as $word) if (isset($names[$word])) return ' '.$inner.' ';
            return ' ';
        }, $stripped);
        preg_match_all('/[\p{L}_][\p{L}\p{N}_-]*/u', $stripped, $matches);
        $tokens = array_values(array_unique($matches[0]));
        $result[] = ['id'=>'rule_'.$rule['name'].'_'.$rule['lineNumber'], ...$rule,
            'alternatives'=>grammar_split_alternatives($rule['expression'], $delimiter, $dialect),
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

function grammar_unicode_chars(string $value): array {
    if (!mb_check_encoding($value, 'UTF-8')) {
        throw new UnsupportedLogic('Grammar text or input is not valid UTF-8.');
    }
    $chars = preg_split('//u', $value, -1, PREG_SPLIT_NO_EMPTY);
    if ($chars === false) throw new UnsupportedLogic('Grammar text or input is not valid UTF-8.');
    return $chars;
}
function grammar_unicode_length(string $value): int {
    if (!mb_check_encoding($value, 'UTF-8')) {
        throw new UnsupportedLogic('Grammar text or input is not valid UTF-8.');
    }
    return mb_strlen($value, 'UTF-8');
}
function grammar_unicode_substr(string $value, int $start, ?int $length = null): string {
    if (!mb_check_encoding($value, 'UTF-8')) {
        throw new UnsupportedLogic('Grammar text or input is not valid UTF-8.');
    }
    return mb_substr($value, $start, $length, 'UTF-8');
}

final class GrammarExpressionParser {
    private array $chars = [];
    private int $len = 0;
    private int $pos = 0;
    private array $symbols;
    private array $names;
    private string $choice;
    private int $depth = 0;

    public function __construct(string $source, array $names, stdClass $dialect) {
        $trimmed = trim($source);
        $this->chars = grammar_unicode_chars($trimmed);
        $this->len = count($this->chars);
        $this->names = array_fill_keys($names, true);
        $this->symbols = array_merge(GRAMMAR_DEFAULT_SYMBOLS, (array)($dialect->symbols ?? new stdClass()));
        $this->choice = trim($dialect->choiceDelimiter ?? '') ?: '|';
    }

    private function slice(int $start, ?int $length = null): string {
        return implode('', array_slice($this->chars, $start, $length));
    }
    private function isSpace(string $ch): bool {
        return $ch === ',' || (bool)preg_match('/^\s$/u', $ch);
    }
    private function skip(): void {
        while ($this->pos < $this->len && $this->isSpace($this->chars[$this->pos])) ++$this->pos;
    }
    private function starts(string $text): bool {
        if ($text === '') return false;
        $tLen = mb_strlen($text, 'UTF-8');
        if ($this->pos + $tLen > $this->len) return false;
        return $this->slice($this->pos, $tLen) === $text;
    }
    private function pair(string $key): ?array {
        $symbol = (string)($this->symbols[$key] ?? '');
        $sLen = mb_strlen($symbol, 'UTF-8');
        return $sLen >= 2
            ? [mb_substr($symbol, 0, 1, 'UTF-8'), mb_substr($symbol, $sLen - 1, 1, 'UTF-8')]
            : null;
    }
    private function atChoice(): bool {
        if ($this->choice !== '/' && $this->starts($this->choice)) return true;
        if ($this->starts('|')) return true;
        return $this->starts('/')
            && ($this->pos === 0 || (bool)preg_match('/^\s$/u', $this->chars[$this->pos - 1]))
            && ($this->pos + 1 >= $this->len || (bool)preg_match('/^\s$/u', $this->chars[$this->pos + 1]));
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
                $this->pos += $this->choice !== '/' && $this->starts($this->choice) ? mb_strlen($this->choice, 'UTF-8') : 1;
                $next = $this->sequence();
                if ($next !== null) $branches[] = $next;
            }
            return count($branches) === 1 ? $branches[0] : ['type'=>'choice', 'items'=>$branches];
        } finally { --$this->depth; }
    }
    private function sequence(): ?array {
        $items = [];
        while ($this->pos < $this->len) {
            $this->skip();
            if ($this->pos >= $this->len) break;
            $ch = $this->chars[$this->pos];
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
            $symbol = (string)($this->symbols[$key] ?? '');
            if ($this->starts($symbol)) {
                $start = $this->pos;
                $this->pos += mb_strlen($symbol, 'UTF-8');
                $node = $this->postfix();
                return $node === null ? null : ['type'=>'lookahead', 'node'=>$node, 'positive'=>$positive,
                    'raw'=>trim($this->slice($start, $this->pos - $start))];
            }
        }
        return $this->postfix();
    }
    private function postfix(): ?array {
        $node = $this->atom();
        if ($node === null) return null;
        $candidates = [];
        foreach (['oneOrMore'=>[1,128], 'zeroOrMore'=>[0,128], 'optional'=>[0,1]] as $key=>$bounds) {
            $symbol = (string)($this->symbols[$key] ?? '');
            if ($symbol !== '') $candidates[] = [$symbol, ...$bounds];
        }
        usort($candidates, fn($a, $b) => mb_strlen($b[0], 'UTF-8') <=> mb_strlen($a[0], 'UTF-8'));
        while ($this->pos < $this->len) {
            $found = false;
            foreach ($candidates as [$token, $min, $max]) {
                if (!$this->starts($token)) continue;
                $this->pos += mb_strlen($token, 'UTF-8');
                $optional = (string)($this->symbols['optional'] ?? '');
                $lazy = $this->starts($optional);
                if ($lazy) $this->pos += mb_strlen($optional, 'UTF-8');
                $node = ['type'=>'repeat', 'node'=>$node, 'min'=>$min, 'max'=>$max, 'lazy'=>$lazy];
                $found = true;
                break;
            }
            if ($found) continue;
            $pair = $this->pair('repeatBraces');
            if ($pair !== null && $this->starts($pair[0])) {
                $pattern = '/^'.preg_quote($pair[0], '/').'\s*(\d+)(?:\s*,\s*(\d*))?\s*'.preg_quote($pair[1], '/').'(\?)?/u';
                if (preg_match($pattern, $this->slice($this->pos), $m, PREG_UNMATCHED_AS_NULL)) {
                    $this->pos += mb_strlen($m[0], 'UTF-8');
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
        if ($this->pos >= $this->len) return null;
        $ch = $this->chars[$this->pos];
        if ($ch === "'" || $ch === '"') {
            ++$this->pos; $value = '';
            while ($this->pos < $this->len && $this->chars[$this->pos] !== $ch) {
                $c = $this->chars[$this->pos++];
                if ($c === '\\' && $this->pos < $this->len) {
                    $next = $this->chars[$this->pos++];
                    $value .= match ($next) {
                        'n'=>"\n", 'r'=>"\r", 't'=>"\t", 'b'=>"\x08", 'f'=>"\x0c", 'v'=>"\x0b",
                        '\\','"', "'" => $next, default => '\\'.$next,
                    };
                } else $value .= $c;
            }
            if ($this->pos < $this->len) ++$this->pos;
            return ['type'=>'literal', 'value'=>$value];
        }
        foreach (['posLookbehind'=>true, 'negLookbehind'=>false] as $key=>$positive) {
            $symbol = (string)($this->symbols[$key] ?? '');
            if ($this->starts($symbol)) {
                $start = $this->pos; $this->pos += mb_strlen($symbol, 'UTF-8');
                $inner = $this->parse(); $this->skip();
                if ($this->starts(')')) ++$this->pos;
                return $inner === null ? null : ['type'=>'lookbehind', 'node'=>$inner, 'positive'=>$positive,
                    'raw'=>$this->slice($start, $this->pos - $start)];
            }
        }
        foreach (['(?='=>true, '(?!'=>false] as $op=>$positive) {
            if (($this->symbols[$positive ? 'posLookahead' : 'negLookahead'] ?? '') !== '' && $this->starts($op)) {
                $start = $this->pos; $this->pos += 3;
                $inner = $this->parse(); $this->skip();
                if ($this->starts(')')) ++$this->pos;
                return $inner === null ? null : ['type'=>'lookahead', 'node'=>$inner, 'positive'=>$positive,
                    'raw'=>$this->slice($start, $this->pos - $start)];
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
            while ($end < $this->len) {
                $c = $this->chars[$end];
                if ($c === '\\') { $end += 2; continue; }
                if ($quote !== '') { if ($c === $quote) $quote = ''; }
                elseif ($c === '"' || $c === "'") $quote = $c;
                elseif ($c === $pair[1]) break;
                ++$end;
            }
            if ($end < $this->len) {
                $inside = $this->slice($this->pos + 1, $end - $this->pos - 1);
                $trimmed = trim($inside);
                preg_match_all('/[\p{L}_][\p{L}\p{N}_-]*/u', $trimmed, $words);
                $optional = str_contains($inside, '"') || str_contains($inside, "'") || isset($this->names[$trimmed])
                    || (str_contains($trimmed, ' ') && count(array_intersect($words[0], array_keys($this->names))) > 0);
                if ($optional) {
                    ++$this->pos; $inner = $this->parse(); $this->skip();
                    if ($this->starts($pair[1])) ++$this->pos;
                    return $inner === null ? null : ['type'=>'repeat', 'node'=>$inner, 'min'=>0, 'max'=>1, 'lazy'=>false];
                }
                $raw = $this->slice($this->pos, $end - $this->pos + 1); $this->pos = $end + 1;
                return ['type'=>'class', 'raw'=>$raw, 'pattern'=>$raw];
            }
        }
        $pair = $this->pair('repeatBraces');
        if ($pair !== null && $ch === $pair[0]) {
            ++$this->pos; $inner = $this->parse(); $this->skip();
            if ($this->starts($pair[1])) ++$this->pos;
            return $inner === null ? null : ['type'=>'repeat', 'node'=>$inner, 'min'=>0, 'max'=>128, 'lazy'=>false];
        }
        $delimiter = (string)($this->symbols['regexDelimiter'] ?? '');
        $delimLen = mb_strlen($delimiter, 'UTF-8');
        if ($delimLen > 0 && $this->starts($delimiter)) {
            $end = $this->pos + $delimLen;
            while ($end < $this->len && $this->slice($end, $delimLen) !== $delimiter) {
                $end += $this->chars[$end] === '\\' ? 2 : 1;
            }
            if ($end < $this->len) {
                $pattern = $this->slice($this->pos + $delimLen, $end - $this->pos - $delimLen);
                $raw = $this->slice($this->pos, $end - $this->pos + $delimLen); $this->pos = $end + $delimLen;
                if (str_starts_with($pattern, '^')) $pattern = substr($pattern, 1);
                return ['type'=>'regex', 'raw'=>$raw, 'pattern'=>$pattern];
            }
        }
        $wildcard = (string)($this->symbols['wildcard'] ?? '');
        if ($this->starts($wildcard)) { $this->pos += mb_strlen($wildcard, 'UTF-8'); return ['type'=>'wildcard']; }
        if ($ch === '^' || $ch === '$') { ++$this->pos; return ['type'=>'anchor', 'kind'=>$ch]; }
        if ($ch === '<') {
            $end = $this->pos + 1;
            while ($end < $this->len && $this->chars[$end] !== '>') ++$end;
            if ($end < $this->len) {
                $name = trim($this->slice($this->pos + 1, $end - $this->pos - 1)); $this->pos = $end + 1;
                return $name === '' ? null : ['type'=>'ref', 'name'=>$name];
            }
        }
        if (preg_match('/^[\p{L}_][\p{L}\p{N}_-]*/u', $this->slice($this->pos), $m)) {
            $this->pos += mb_strlen($m[0], 'UTF-8'); return ['type'=>'ref', 'name'=>$m[0]];
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
        if (grammar_unicode_length($payload) > 16384) throw new UnsupportedLogic('Grammar payload exceeds 16 KiB.');
        $this->payload = $payload;
        $this->mutations = $workspace->mutations;
        $names = array_column($rules, 'name');
        foreach ($rules as $rule) {
            grammar_unicode_chars($rule['expression']);
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
        if (preg_match('/\\\\[1-9]|\\(\\?<[A-Za-z]|\\(\\?P|\\(\\?#|\\(\\*|\\\\K/', $pattern)) {
            throw new UnsupportedLogic('The grammar regular expression uses syntax not supported by the PHP evaluator.');
        }
        $pattern = '~(*LIMIT_MATCH=100000)(*LIMIT_DEPTH=1000)^(?:'.str_replace('~', '\\~', $pattern).')~u';
        set_error_handler(static function (int $severity, string $message): never {
            throw new UnsupportedLogic('Invalid grammar regular expression: '.$message);
        });
        try { $matched = preg_match($pattern, grammar_unicode_substr($this->payload, $pos), $matches); }
        finally { restore_error_handler(); }
        if ($matched === false) throw new UnsupportedLogic('Grammar regular expression failed: '.preg_last_error_msg());
        return $matched === 1 && $matches[0] !== '' ? $matches[0] : null;
    }
    private function outcome(int $end, array $trace = []): array { return ['endPos'=>$end, 'trace'=>$trace]; }
    private function step(int $depth, string $rule, int $pos, string $consumed, string $note, int $preview = 16): array {
        return ['depth'=>$depth, 'rule'=>$rule, 'inputSlice'=>grammar_unicode_substr($this->payload, $pos, $preview),
            'matched'=>true, 'consumed'=>$consumed, 'note'=>$note];
    }
    private function expression(array $node, int $pos, int $depth, bool $inRepeat = false): array {
        $this->tick();
        if ($depth > 32) return [];
        $type = $node['type'];
        if ($type === 'literal') {
            $value = $node['value'];
            $length = grammar_unicode_length($value);
            if (grammar_unicode_substr($this->payload, $pos, $length) !== $value) return [];
            return [$this->outcome($pos + $length, [$this->step($depth, '"'.$value.'"', $pos, $value, 'Terminal literal matched')])];
        }
        if ($type === 'wildcard') {
            if ($pos >= grammar_unicode_length($this->payload)) return [];
            $value = grammar_unicode_substr($this->payload, $pos, 1);
            return [$this->outcome($pos + 1, [$this->step($depth, '.', $pos, $value, 'Wildcard matched single char')])];
        }
        if ($type === 'anchor') {
            if (($node['kind'] === '^' && $pos !== 0) || ($node['kind'] === '$' && $pos !== grammar_unicode_length($this->payload))) return [];
            return [$this->outcome($pos, [$this->step($depth, $node['kind'], $pos, '',
                $node['kind'] === '^' ? 'Start anchor matched' : 'End anchor matched', 12)])];
        }
        if ($type === 'class' || $type === 'regex') {
            $value = $this->regex($node['pattern'], $pos);
            return $value === null ? [] : [$this->outcome($pos + grammar_unicode_length($value), [
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
            $preview = $probe ? grammar_unicode_substr($this->payload, $pos, $probe[0]['endPos'] - $pos) : '';
            $note = $node['positive'] ? 'Positive lookahead matched "'.$preview.'" (zero-width)' : 'Negative lookahead satisfied (zero-width)';
            return [$this->outcome($pos, [$this->step($depth, $node['raw'], $pos, '', $note)])];
        }
        if ($type === 'lookbehind') {
            $matched = null;
            for ($start = $pos; $start >= max(0, $pos - 64); --$start) {
                foreach ($this->expression($node['node'], $start, $depth + 1) as $out) {
                    if ($out['endPos'] === $pos) { $matched = grammar_unicode_substr($this->payload, $start, $pos - $start); break 2; }
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
            if ($value !== null) for ($length = grammar_unicode_length($value); $length >= 1; --$length) $add(grammar_unicode_substr($value, 0, $length));
        }
        if ($pattern !== '') $add($this->regex($pattern, $pos));
        elseif ($mutation->jsonType === 'number') $add($this->regex('-?\d+(?:\.\d+)?', $pos));
        elseif ($mutation->jsonType === 'boolean') $add($this->regex('(?i:true|false)', $pos));
        usort($matches, fn($a, $b) => grammar_unicode_length($b) <=> grammar_unicode_length($a));
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
                    $end = $pos + grammar_unicode_length($value);
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
                    $header = $this->step($depth, $name, $pos, grammar_unicode_substr($this->payload, $pos, $end - $pos), 'Matched branch: '.$entry['raw'], 20);
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
        $length = grammar_unicode_length($this->payload);
        foreach ($outcomes as $out) if ($out['endPos'] === $length) {
            return ['matched'=>true, 'consumedLength'=>$length, 'remaining'=>'',
                'summary'=>"Valid match for <$start> ($length/$length chars)",
                'detail'=>'Consumed all '.$length.' characters across '.count($out['trace']).' expansion steps.',
                'trace'=>array_slice($out['trace'], 0, 140)];
        }
        $best = $outcomes[0] ?? null;
        if ($best && $best['endPos'] > 0) {
            $consumed = $best['endPos']; $remaining = grammar_unicode_substr($this->payload, $consumed);
            return ['matched'=>false, 'consumedLength'=>$consumed, 'remaining'=>$remaining,
                'summary'=>"Partial match ($consumed/$length chars)",
                'detail'=>"Rule <$start> matched prefix \"".grammar_unicode_substr($this->payload, 0, $consumed)."\", trailing \"$remaining\" unconsumed.",
                'trace'=>array_slice($best['trace'], 0, 140)];
        }
        $input = $this->payload !== '' ? $this->payload : '(empty)';
        return ['matched'=>false, 'consumedLength'=>0, 'remaining'=>$this->payload,
            'summary'=>"No match for <$start>", 'detail'=>"Input \"$input\" did not satisfy any branch of <$start>.",
            'trace'=>[['depth'=>0, 'rule'=>$start, 'inputSlice'=>grammar_unicode_substr($this->payload, 0, 20),
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

def _split_ebnf_alts(expr: str):
    parts, buf, depth, quote, i = [], [], 0, None, 0
    while i < len(expr):
        ch = expr[i]
        if quote:
            buf.append(ch)
            if ch == '\\' and i + 1 < len(expr):
                i += 1
                buf.append(expr[i])
            elif ch == quote:
                quote = None
        elif ch in ('"', "'"):
            quote = ch
            buf.append(ch)
        elif ch in ('(', '['):
            depth += 1
            buf.append(ch)
        elif ch in (')', ']') and depth > 0:
            depth -= 1
            buf.append(ch)
        elif ch == '|' and depth == 0:
            seg = ''.join(buf).strip()
            if seg:
                parts.append(seg)
            buf = []
        else:
            buf.append(ch)
        i += 1
    seg = ''.join(buf).strip()
    if seg:
        parts.append(seg)
    return parts

def _strip_ebnf_comments(expr: str) -> str:
    import re
    cleaned = re.sub(r'\(\*.*?\*\)', '', expr).strip()
    return cleaned[:-1].strip() if cleaned.endswith(';') else cleaned

def _compile_ebnf_expr(expr: str, rules=GRAMMAR_RULES, depth: int = 0, capture_names=None) -> str:
    import re
    alts = _split_ebnf_alts(expr)
    compiled = []
    for alt in alts:
        tokens = re.findall(r"""(?:"[^"]*"|'[^']*'|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*[+*?]?|[()+*?])""", alt)
        seq = []
        for tok in tokens:
            if (tok.startswith('"') and tok.endswith('"')) or (tok.startswith("'") and tok.endswith("'")):
                seq.append(re.escape(tok[1:-1]))
            elif tok.startswith('[') and tok.endswith(']'):
                inner = tok[1:-1].strip()
                if inner in rules or "'" in inner or '"' in inner:
                    seq.append(f'(?:{_compile_ebnf_expr(inner, rules, depth + 1, capture_names)})?')
                else:
                    seq.append(tok)
            elif tok in ('(', ')', '+', '*', '?'):
                seq.append(tok)
            else:
                q = tok[-1] if tok[-1] in '+*?' else ''
                ref = tok[:-1] if q else tok
                if ref in rules:
                    sub = _compile_ebnf_regex(ref, rules, depth + 1, capture_names)
                    if capture_names is not None and ref not in capture_names and depth == 0:
                        capture_names.add(ref)
                        seq.append(f'(?P<{ref}>{sub}){q}')
                    else:
                        seq.append(f'(?:{sub}){q}')
                else:
                    seq.append(re.escape(ref) + q)
        compiled.append(''.join(seq))
    return '(?:' + '|'.join(compiled) + ')' if len(compiled) > 1 else (compiled[0] if compiled else '')

def _compile_ebnf_regex(rule_name: str, rules=GRAMMAR_RULES, depth: int = 0, capture_names=None) -> str:
    if depth > 12:
        return r'[^,}\s]+'
    raw_expr = rules.get(rule_name)
    if not raw_expr:
        return r'[^,}\s]+'
    return _compile_ebnf_expr(_strip_ebnf_comments(raw_expr), rules, depth, capture_names)

def _check_rule_constraints(name: str, raw_value: str, raw_expr: str):
    import re
    errors = []
    val = raw_value.strip()
    unquoted = val[1:-1] if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'") else val
    for body in re.findall(r'\(\*(.*?)\*\)', raw_expr):
        for clause in [c.strip() for c in re.split(r'[,;]', body) if c.strip()]:
            m_re = re.match(r'^/(.+)/$', clause)
            if m_re:
                if not re.search(m_re.group(1), unquoted):
                    errors.append(f"{name}: constraint ({clause}) failed for {raw_value!r}")
                continue
            m_num = re.match(r'^(minLength|maxLength|min|minimum|max|maximum)\s*(>=|<=|>|<|=)\s*([+-]?\d+(?:\.\d+)?)$', clause, re.I)
            if m_num:
                key, op, num = m_num.group(1).lower(), m_num.group(2), float(m_num.group(3))
                if key == 'minlength' and len(unquoted) < int(num + (1 if op == '>' else 0)):
                    errors.append(f"{name}: constraint ({clause}) failed: length {len(unquoted)} < {int(num)}")
                elif key == 'maxlength' and len(unquoted) > int(num - (1 if op == '<' else 0)):
                    errors.append(f"{name}: constraint ({clause}) failed: length {len(unquoted)} > {int(num)}")
                elif key in ('min', 'minimum'):
                    n = float(unquoted)
                    if (op == '>' and n <= num) or (op != '>' and n < num):
                        errors.append(f"{name}: constraint ({clause}) failed: {unquoted} < {num:g}")
                elif key in ('max', 'maximum'):
                    n = float(unquoted)
                    if (op == '<' and n >= num) or (op != '<' and n > num):
                        errors.append(f"{name}: constraint ({clause}) failed: {unquoted} > {num:g}")
    return errors

def validate_payload(payload: str, start_rule: str = None, rules=GRAMMAR_RULES):
    """Validates an input payload against the compiled EBNF grammar and (* constraint *) comments."""
    import re
    entry = start_rule or (next(iter(rules)) if rules else '')
    captured_names = set()
    pattern = _compile_ebnf_regex(entry, rules, 0, captured_names)
    m = re.fullmatch(pattern, payload.strip())
    if not m:
        return {"matched": False, "startRule": entry, "captured": {}, "errors": [f"Payload did not match <{entry}>"]}
    captured = {k: v for k, v in m.groupdict().items() if v is not None}
    errors = []
    errors.extend(_check_rule_constraints(entry, payload.strip(), rules.get(entry, '')))
    for k, v in captured.items():
        errors.extend(_check_rule_constraints(k, v, rules.get(k, '')))
    return {"matched": len(errors) == 0, "startRule": entry, "captured": captured, "errors": errors}

def run_workspace_cli(argv=None):
    """Exposes named rule properties as literal CLI options, allows editing strings, or validates --input payloads."""
    import argparse, json, sys
    parser = argparse.ArgumentParser(description=f"Grammar2JSON Workspace CLI ({SCHEMA_NAME})")
    parser.add_argument("payload", nargs="?", default=None, help="Optional payload string to validate against the start rule")
    parser.add_argument("--input", dest="input_payload", default=None, help="Payload string to validate against the grammar")
    parser.add_argument("--start-rule", default=None, help="Start rule name (defaults to first rule)")
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
    raw_payload = args.input_payload if args.input_payload is not None else args.payload
    if raw_payload is not None:
        result = validate_payload(raw_payload, args.start_rule, edited_rules)
        print(json.dumps(result, indent=2))
        if not result["matched"]:
            sys.exit(1)
        return
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
