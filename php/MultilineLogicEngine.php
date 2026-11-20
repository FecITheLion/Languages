<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

final class MultilineLogicParseError extends Exception {
    public bool $incomplete;
    public function __construct(string $message, bool $incomplete = false) {
        parent::__construct($message);
        $this->incomplete = $incomplete;
    }
}

function ml_parse_pre_input(string $raw): array {
    $lines = preg_split('/\r?\n/', $raw) ?: [];
    $values = [];
    $rawValues = [];
    $entries = [];
    $errors = [];

    foreach ($lines as $idx => $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || str_starts_with($trimmed, '//') || str_starts_with($trimmed, '#')) continue;
        if (!preg_match('/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|:=|≜)\s*(true|false|⊤|⊥|-?\d+(?:\.\d+)?)$/iu', $trimmed, $m)) {
            $errors[] = [
                'line' => $idx + 1,
                'message' => 'Line ' . ($idx + 1) . ": Pre-input only allows boolean or numeric literals (not \"{$trimmed}\").",
            ];
            continue;
        }
        $name = $m[1];
        $lit = mb_strtolower(trim($m[2]), 'UTF-8');
        if ($lit === 'true' || $lit === '⊤') {
            $values[$name] = true;
            $rawValues[$name] = true;
            $entries[] = ['line' => $idx + 1, 'name' => $name, 'value' => true, 'raw' => $trimmed];
        } elseif ($lit === 'false' || $lit === '⊥') {
            $values[$name] = false;
            $rawValues[$name] = false;
            $entries[] = ['line' => $idx + 1, 'name' => $name, 'value' => false, 'raw' => $trimmed];
        } else {
            $num = str_contains($lit, '.') ? (float)$lit : (int)$lit;
            $boolVal = ((float)$num) != 0.0;
            $values[$name] = $boolVal;
            $rawValues[$name] = $num;
            $entries[] = ['line' => $idx + 1, 'name' => $name, 'value' => $boolVal, 'raw' => $trimmed];
        }
    }
    return [
        'ok' => count($errors) === 0,
        'values' => $values,
        'rawValues' => $rawValues,
        'entries' => $entries,
        'errors' => $errors,
    ];
}

function ml_tokenize_expr(string $src): array {
    $kwMap = [
        'true'=>['bool', true], 'false'=>['bool', false],
        'not'=>['op','¬'], 'and'=>['op','∧'], 'or'=>['op','∨'], 'xor'=>['op','⊕'],
        'nand'=>['op','↑'], 'nor'=>['op','↓'], 'implies'=>['op','→'], 'imp'=>['op','→'],
        'iff'=>['op','↔'], 'xnor'=>['op','↔'], 'equiv'=>['op','≡'],
        'forall'=>['op','∀'], 'exists'=>['op','∃'],
        'box'=>['op','□'], 'nec'=>['op','□'], 'dia'=>['op','◇'], 'pos'=>['op','◇'],
        'knows'=>['op','𝐊'], 'obligatory'=>['op','𝐎'], 'forbidden'=>['op','𝐅'],
        'next'=>['op','◯'], 'until'=>['op','𝒰'], 'release'=>['op','ℛ'], 'weak_until'=>['op','𝒲'],
        'proves'=>['op','⊢'], 'entails'=>['op','⊨'], 'lolli'=>['op','⊸'], 'tensor'=>['op','⊗'], 'par'=>['op','⅋'],
        'defaults_to'=>['op','⇝'], 'forces'=>['op','⊩'], 'rel_equiv'=>['op','≊'],
        'therefore'=>['op','∴'], 'because'=>['op','∵'], 'rebut'=>['op','⊘'],
        'warrant'=>['op','⊕ᵥ'], 'inductively'=>['op','⇒ᵢ'], 'indeterminate'=>['bool', false],
    ];
    $multi = [
        ['<->','↔'], ['<=>','↔'], ['||-','⊩'], ['->','→'], ['-/->','⊘'], ['!&','↑'], ['!|','↓'],
        ['**','**'], ['==','=='], ['!=','!='], ['<>','!='], ['<=','<='], ['>=','>='],
        ['&&','∧'], ['||','∨'], ['/\\','∧'], ['\\/','∨'], ['|-','⊢'], ['|=','⊨'],
        ['-o','⊸'], ['-<','⥽'], ['~>','⇝'], ['∃!','∃!'], ['[]','□'],
        ['⊗ₗ','⊗ₗ'], ['→ₗ','→ₗ'], ['⊕ᵥ','⊕ᵥ'], ['⇒ᵢ','⇒ᵢ'],
    ];
    $singleMap = [
        '!'=>'¬','~'=>'¬','∼'=>'¬','¬'=>'¬',
        '&'=>'∧','∧'=>'∧','⊗'=>'⊗',
        '|'=>'∨','∨'=>'∨','⅋'=>'⅋',
        '^'=>'⊕','⊕'=>'⊕',
        '='=>'≡','≡'=>'≡',
        '≠'=>'!=','≤'=>'<=','≥'=>'>=',
        '×'=>'*','÷'=>'/','−'=>'-',
        '⊼'=>'↑','↑'=>'↑','⊽'=>'↓','↓'=>'↓',
    ];
    $singleKeep = array_flip(['∀','∃','□','◇','⥽','𝐊','𝐎','𝐅','◯','𝒰','ℛ','𝒲','⊢','⊨','⊸','⇝','⊩','≊','∴','∵','⊘','+','-','*','/','%','<','>','→','↔']);

    $chars = preg_split('//u', $src, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $len = count($chars);
    $i = 0;
    $tokens = [];

    $sliceFrom = static function (int $start, int $count) use ($chars, $len): string {
        if ($start + $count > $len) return '';
        return implode('', array_slice($chars, $start, $count));
    };

    while ($i < $len) {
        $ch = $chars[$i];
        if (preg_match('/^\s$/u', $ch)) { $i++; continue; }
        if ($ch === '(' || $ch === ')') { $tokens[] = ['kind'=>'paren', 'value'=>$ch]; $i++; continue; }
        if ($ch === ',') { $tokens[] = ['kind'=>'comma', 'value'=>',']; $i++; continue; }
        if ($ch === '.') { $tokens[] = ['kind'=>'dot', 'value'=>'.']; $i++; continue; }
        if ($ch === '⊤') { $tokens[] = ['kind'=>'bool', 'value'=>true]; $i++; continue; }
        if ($ch === '⊥' || $ch === '½') { $tokens[] = ['kind'=>'bool', 'value'=>false]; $i++; continue; }
        if ($ch === 'λ' || $ch === '\\') {
            if ($sliceFrom($i, 2) === '\\/') { $tokens[] = ['kind'=>'op', 'value'=>'∨']; $i += 2; continue; }
            $tokens[] = ['kind'=>'lambda', 'value'=>'λ']; $i++; continue;
        }
        if ($sliceFrom($i, 2) === '=>') {
            $tokens[] = ['kind'=>'arrow', 'value'=>'=>']; $i += 2; continue;
        }
        if (preg_match('/^[0-9]$/', $ch) || ($ch === '.' && $i + 1 < $len && preg_match('/^[0-9]$/', $chars[$i + 1]))) {
            $j = $i;
            while ($j < $len && preg_match('/^[0-9.]$/', $chars[$j])) $j++;
            $numStr = $sliceFrom($i, $j - $i);
            $tokens[] = ['kind'=>'num', 'value'=>str_contains($numStr, '.') ? (float)$numStr : (int)$numStr];
            $i = $j;
            continue;
        }
        $matchedMulti = false;
        foreach ($multi as [$pat, $mapped]) {
            $patLen = mb_strlen($pat, 'UTF-8');
            if ($sliceFrom($i, $patLen) === $pat) {
                $tokens[] = ['kind'=>'op', 'value'=>$mapped];
                $i += $patLen;
                $matchedMulti = true;
                break;
            }
        }
        if ($matchedMulti) continue;
        if (isset($singleMap[$ch])) {
            $tokens[] = ['kind'=>'op', 'value'=>$singleMap[$ch]];
            $i++;
            continue;
        }
        if (isset($singleKeep[$ch])) {
            $tokens[] = ['kind'=>'op', 'value'=>$ch];
            $i++;
            continue;
        }
        if (strtolower($sliceFrom($i, 7)) === 'exists!') {
            $tokens[] = ['kind'=>'op', 'value'=>'∃!'];
            $i += 7;
            continue;
        }
        if (preg_match('/^[A-Za-z_]$/', $ch)) {
            $j = $i + 1;
            while ($j < $len && preg_match('/^[A-Za-z0-9_]$/', $chars[$j])) $j++;
            $word = $sliceFrom($i, $j - $i);
            $low = strtolower($word);
            if (isset($kwMap[$low])) {
                $tokens[] = ['kind'=>$kwMap[$low][0], 'value'=>$kwMap[$low][1]];
            } else {
                $tokens[] = ['kind'=>'id', 'value'=>$word];
            }
            $i = $j;
            continue;
        }
        throw new MultilineLogicParseError("Unsupported symbol \"{$ch}\" in expression.");
    }
    $tokens[] = ['kind'=>'eof', 'value'=>''];
    return $tokens;
}

function ml_parse_ast(string $src): array {
    $tokens = ml_tokenize_expr($src);
    $pos = 0;
    $peek = static function (int $offset = 0) use (&$tokens, &$pos): array {
        return $tokens[$pos + $offset] ?? ['kind'=>'eof', 'value'=>''];
    };
    $take = static function () use (&$tokens, &$pos): array {
        $t = $tokens[$pos] ?? ['kind'=>'eof', 'value'=>''];
        $pos++;
        return $t;
    };

    $precTable = [
        '∴'=>1,'∵'=>1,'↔'=>2,'≡'=>2,'≊'=>2,'⊢'=>3,'⊨'=>3,'⊩'=>3,'⇝'=>3,'⇒ᵢ'=>3,
        '→'=>4,'⥽'=>4,'→ₗ'=>4,'⊸'=>4,'∨'=>5,'↓'=>5,'⅋'=>5,'𝒲'=>5,'ℛ'=>5,'⊕'=>6,
        '∧'=>7,'↑'=>7,'⊗'=>7,'⊗ₗ'=>7,'⊕ᵥ'=>7,'𝒰'=>7,'⊘'=>8,
        '=='=>9,'!='=>9,'<'=>9,'<='=>9,'>'=>9,'>='=>9,
        '+'=>10,'-'=>10,'*'=>11,'/'=>11,'%'=>11,'**'=>12,
    ];
    $rightAssoc = array_flip(['→','⥽','→ₗ','⊸','⇒ᵢ','⇝','**']);
    $unaries = array_flip(['¬','+','-','□','◇','𝐊','𝐎','𝐅','◯']);

    $parseLambdaOrExpr = null;
    $parseExpr = null;
    $parseUnaryOrCall = null;

    $tryArrowLambda = static function () use (&$pos, $peek, $take, &$parseLambdaOrExpr): ?array {
        $saved = $pos;
        if ($peek()['kind'] === 'id' && $peek(1)['kind'] === 'arrow') {
            $p = (string)$take()['value'];
            $take();
            return ['type'=>'Lambda', 'params'=>[$p], 'body'=>$parseLambdaOrExpr()];
        }
        if ($peek()['kind'] === 'paren' && $peek()['value'] === '(') {
            $take();
            $params = [];
            $valid = true;
            if (!($peek()['kind'] === 'paren' && $peek()['value'] === ')')) {
                while (true) {
                    if ($peek()['kind'] !== 'id') { $valid = false; break; }
                    $params[] = (string)$take()['value'];
                    if ($peek()['kind'] === 'comma') { $take(); continue; }
                    break;
                }
            }
            if ($valid && $peek()['kind'] === 'paren' && $peek()['value'] === ')' && $peek(1)['kind'] === 'arrow') {
                $take(); $take();
                return ['type'=>'Lambda', 'params'=>$params, 'body'=>$parseLambdaOrExpr()];
            }
        }
        $pos = $saved;
        return null;
    };

    $parsePrimary = static function () use ($peek, $take, &$parseLambdaOrExpr, &$parseUnaryOrCall, $unaries): array {
        $tok = $peek();
        if ($tok['kind'] === 'eof') throw new MultilineLogicParseError('Unexpected end of expression.', true);
        if ($tok['kind'] === 'op' && in_array($tok['value'], ['∀','∃','∃!'], true)) {
            $take();
            $vt = $take();
            if ($vt['kind'] !== 'id') throw new MultilineLogicParseError("Expected quantified variable after {$tok['value']}.");
            if ($peek()['kind'] === 'dot') $take();
            return ['type'=>'Quantifier', 'q'=>$tok['value'], 'variable'=>$vt['value'], 'body'=>$parseLambdaOrExpr()];
        }
        if ($tok['kind'] === 'op' && isset($unaries[$tok['value']])) {
            $take();
            return ['type'=>'Unary', 'op'=>$tok['value'], 'arg'=>$parseUnaryOrCall()];
        }
        if ($tok['kind'] === 'paren' && $tok['value'] === '(') {
            $take();
            $inner = $parseLambdaOrExpr();
            $close = $take();
            if ($close['kind'] !== 'paren' || $close['value'] !== ')') {
                throw new MultilineLogicParseError('Expected closing ")".', true);
            }
            return $inner;
        }
        if ($tok['kind'] === 'bool') { $take(); return ['type'=>'Bool', 'value'=>(bool)$tok['value']]; }
        if ($tok['kind'] === 'num') { $take(); return ['type'=>'Number', 'value'=>$tok['value']]; }
        if ($tok['kind'] === 'id') { $take(); return ['type'=>'Var', 'name'=>(string)$tok['value']]; }
        throw new MultilineLogicParseError("Unexpected token \"{$tok['value']}\".");
    };

    $parseUnaryOrCall = static function () use ($peek, $take, &$parsePrimary, &$parseLambdaOrExpr): array {
        $node = $parsePrimary();
        while ($peek()['kind'] === 'paren' && $peek()['value'] === '(') {
            $take();
            $args = [];
            if (!($peek()['kind'] === 'paren' && $peek()['value'] === ')')) {
                $args[] = $parseLambdaOrExpr();
                while ($peek()['kind'] === 'comma') {
                    $take();
                    $args[] = $parseLambdaOrExpr();
                }
            }
            $close = $take();
            if ($close['kind'] !== 'paren' || $close['value'] !== ')') {
                throw new MultilineLogicParseError('Expected ")" to close call arguments.', true);
            }
            $node = ['type'=>'Call', 'name'=>$node['type'] === 'Var' ? $node['name'] : null, 'callee'=>$node, 'args'=>$args];
        }
        return $node;
    };

    $parseExpr = static function (int $minPrec) use ($peek, $take, &$parseUnaryOrCall, &$parseLambdaOrExpr, &$parseExpr, $precTable, $rightAssoc): array {
        $left = $parseUnaryOrCall();
        while (true) {
            $tok = $peek();
            $rawOp = $tok['kind'] === 'arrow' ? '→' : ($tok['kind'] === 'op' ? (string)$tok['value'] : null);
            if ($rawOp === null || !isset($precTable[$rawOp])) break;
            $prec = $precTable[$rawOp];
            if ($prec < $minPrec) break;
            $take();
            $nextMin = isset($rightAssoc[$rawOp]) ? $prec : $prec + 1;
            $right = $rawOp === '→' ? $parseLambdaOrExpr() : $parseExpr($nextMin);
            $left = ['type'=>'Binary', 'op'=>$rawOp, 'left'=>$left, 'right'=>$right];
        }
        return $left;
    };

    $parseLambdaOrExpr = static function () use ($peek, $take, &$tryArrowLambda, &$parseLambdaOrExpr, &$parseExpr): array {
        $tok = $peek();
        if ($tok['kind'] === 'lambda') {
            $take();
            $params = [];
            if ($peek()['kind'] === 'paren' && $peek()['value'] === '(') {
                $take();
                if (!($peek()['kind'] === 'paren' && $peek()['value'] === ')')) {
                    while (true) {
                        if ($peek()['kind'] !== 'id') throw new MultilineLogicParseError('Expected parameter name in λ(...).');
                        $params[] = (string)$take()['value'];
                        if ($peek()['kind'] === 'comma') { $take(); continue; }
                        break;
                    }
                }
                $close = $take();
                if ($close['kind'] !== 'paren' || $close['value'] !== ')') {
                    throw new MultilineLogicParseError('Expected closing ")" in lambda.', true);
                }
            } else {
                if ($peek()['kind'] !== 'id') throw new MultilineLogicParseError('Expected parameter name after λ.', true);
                $params[] = (string)$take()['value'];
            }
            if ($peek()['kind'] === 'dot' || $peek()['kind'] === 'arrow') $take();
            else throw new MultilineLogicParseError('Expected "." or "=>" after lambda parameters.', $peek()['kind'] === 'eof');
            return ['type'=>'Lambda', 'params'=>$params, 'body'=>$parseLambdaOrExpr()];
        }
        $arrowLam = $tryArrowLambda();
        if ($arrowLam !== null) return $arrowLam;
        return $parseExpr(0);
    };

    $ast = $parseLambdaOrExpr();
    if ($peek()['kind'] !== 'eof') {
        throw new MultilineLogicParseError("Unexpected trailing token \"{$peek()['value']}\".");
    }
    return $ast;
}

function ml_segment_blocks(string $rawProgram): array {
    $normalized = str_replace("\r\n", "\n", $rawProgram);
    $lines = explode("\n", $normalized);
    $lineOffsets = [];
    $cursor = 0;
    foreach ($lines as $l) {
        $lineOffsets[] = $cursor;
        $cursor += strlen($l) + 1;
    }

    $trailRe = '/(?:=|:=|≜|->|=>|<->|<=>|\|\||&&|\/\\\\|\\\\\/|!&|!\|[ \t]*|\*\*|==|!=|<=|>=|[¬!~∼&∧|∨⊕→↔≡≠⊼⊽↑↓⊸⊗⅋⊢⊨⇝⊩∴∵⊘+\-*\/%<>.,(λ\\\\])[ \t]*$/u';
    $leadRe = '/^(?:[)&|∧∨⊕→↔≡≠⊼⊽↑↓⊸⊗⅋⊢⊨⇝⊩∴∵⊘+\-*\/%<>]|\*\*|==|!=|<=|>=|->|=>|<->|and\b|or\b|xor\b|implies\b|iff\b|therefore\b|because\b)/iu';

    $pDelta = static fn(string $t): int => substr_count($t, '(') - substr_count($t, ')');
    $tryStatus = static function (string $t): array {
        $stmt = $t;
        if (preg_match('/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:=(?![=>])|:=|≜)\s*(.+)$/su', $t, $m)) {
            $stmt = trim($m[3]);
        } elseif (preg_match('/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:=(?![=>])|:=|≜)\s*(.+)$/su', $t, $m)) {
            $stmt = trim($m[2]);
        } elseif (preg_match('/^([A-Za-z_][A-Za-z0-9_]*(?:\s*\([^)]*\))?)\s*(?:=(?![=>])|:=|≜)\s*$/su', $t)) {
            return ['valid' => false, 'incomplete' => true];
        }
        try {
            ml_parse_ast($stmt);
            return ['valid' => true, 'incomplete' => false];
        } catch (MultilineLogicParseError $e) {
            return ['valid' => false, 'incomplete' => $e->incomplete];
        }
    };

    $blocks = [];
    $i = 0;
    $count = count($lines);
    while ($i < $count) {
        $first = trim($lines[$i]);
        if ($first === '' || str_starts_with($first, '//') || str_starts_with($first, '#')) {
            $i++;
            continue;
        }
        $startLine = $i + 1;
        $endIdx = $i;
        $combined = $first;
        $depth = $pDelta($first);

        while ($endIdx + 1 < $count) {
            $nextTrimmed = trim($lines[$endIdx + 1]);
            if ($nextTrimmed === '' || str_starts_with($nextTrimmed, '//') || str_starts_with($nextTrimmed, '#')) break;
            $curStatus = $tryStatus($combined);
            $shouldJoin = $depth > 0 || preg_match($trailRe, $combined) || preg_match($leadRe, $nextTrimmed) || $curStatus['incomplete'];
            if (!$shouldJoin) break;

            $combined .= ' ' . $nextTrimmed;
            $depth += $pDelta($nextTrimmed);
            $endIdx++;
            if ($depth <= 0 && !preg_match($trailRe, $combined) && $tryStatus($combined)['valid']) {
                $afterNext = trim($lines[$endIdx + 1] ?? '');
                if ($afterNext === '' || !preg_match($leadRe, $afterNext)) break;
            }
        }

        $startOffset = $lineOffsets[$i];
        $endOffset = $lineOffsets[$endIdx] + strlen($lines[$endIdx]);
        $rawText = substr($normalized, $startOffset, $endOffset - $startOffset);
        $blocks[] = [
            'blockIndex' => count($blocks),
            'startLine' => $startLine,
            'endLine' => $endIdx + 1,
            'startOffset' => $startOffset,
            'endOffset' => $endOffset,
            'rawText' => $rawText,
            'compactText' => trim((string)preg_replace('/\s+/u', ' ', $rawText)),
        ];
        $i = $endIdx + 1;
    }
    return $blocks;
}

function ml_is_callable(mixed $v): bool {
    return is_array($v) && ($v['__callable'] ?? false) === true;
}

function ml_to_bool(mixed $v): bool {
    if (is_bool($v)) return $v;
    if (is_int($v) || is_float($v)) return ((float)$v) != 0.0 && !is_nan((float)$v);
    return true;
}

function ml_to_num(mixed $v): float|int {
    if (is_int($v) || is_float($v)) return $v;
    if (is_bool($v)) return $v ? 1 : 0;
    throw new RuntimeException('Cannot coerce callable to number.');
}

function ml_cross_eq(mixed $a, mixed $b): bool {
    if (is_bool($a) && (is_int($b) || is_float($b))) return ($a ? 1 : 0) == $b;
    if ((is_int($a) || is_float($a)) && is_bool($b)) return $a == ($b ? 1 : 0);
    return $a === $b;
}

function ml_eval_ast(array $node, array $env, array $callables = [], int $depth = 0): mixed {
    if ($depth > 64) throw new RuntimeException('Maximum recursion depth exceeded.');
    switch ($node['type']) {
        case 'Bool':
        case 'Number':
            return $node['value'];
        case 'Var': {
            $name = $node['name'];
            if (array_key_exists($name, $env)) return $env[$name];
            if (isset($callables[$name])) {
                if (!empty($callables[$name]['isNamedDefinition'])) {
                    throw new RuntimeException("Definition \"{$name}\" outputs \"true or false\" and may not be referenced as a value; invoke it as {$name}(...).");
                }
                return $callables[$name];
            }
            throw new RuntimeException("Unbound variable \"{$name}\". Define it in Pre-Input or assign it above.");
        }
        case 'Lambda':
            return ['__callable'=>true, 'params'=>$node['params'], 'body'=>$node['body'], 'closureEnv'=>$env, 'isNamedDefinition'=>false];
        case 'Unary': {
            $v = ml_eval_ast($node['arg'], $env, $callables, $depth + 1);
            return match ($node['op']) {
                '¬', '𝐅' => !ml_to_bool($v),
                '-' => -ml_to_num($v),
                '+' => +ml_to_num($v),
                default => ml_to_bool($v),
            };
        }
        case 'Binary': {
            $a = ml_eval_ast($node['left'], $env, $callables, $depth + 1);
            $b = ml_eval_ast($node['right'], $env, $callables, $depth + 1);
            $op = $node['op'];
            return match ($op) {
                '∧','⊗','⊗ₗ','⊕ᵥ','𝒰' => ml_to_bool($a) && ml_to_bool($b),
                '∨','⅋','𝒲' => ml_to_bool($a) || ml_to_bool($b),
                '⊕' => ml_to_bool($a) !== ml_to_bool($b),
                '→','⥽','→ₗ','⊸','⊢','⊨','⊩','⇝','⇒ᵢ','∴' => !ml_to_bool($a) || ml_to_bool($b),
                '∵' => !ml_to_bool($b) || ml_to_bool($a),
                '↔','≡','≊' => ml_to_bool($a) === ml_to_bool($b),
                '↑','⊼' => !(ml_to_bool($a) && ml_to_bool($b)),
                '↓','⊽' => !(ml_to_bool($a) || ml_to_bool($b)),
                'ℛ' => ml_to_bool($b),
                '⊘' => ml_to_bool($a) && !ml_to_bool($b),
                '+' => ml_to_num($a) + ml_to_num($b),
                '-' => ml_to_num($a) - ml_to_num($b),
                '*' => ml_to_num($a) * ml_to_num($b),
                '/' => ((float)ml_to_num($b) == 0.0) ? throw new RuntimeException('Division by zero.') : ml_to_num($a) / ml_to_num($b),
                '%' => ((int)ml_to_num($b) === 0) ? throw new RuntimeException('Modulo by zero.') : (int)ml_to_num($a) % (int)ml_to_num($b),
                '**' => ml_to_num($a) ** ml_to_num($b),
                '==' => ml_cross_eq($a, $b),
                '!=', '≠' => !ml_cross_eq($a, $b),
                '<' => ml_to_num($a) < ml_to_num($b),
                '<=', '≤' => ml_to_num($a) <= ml_to_num($b),
                '>' => ml_to_num($a) > ml_to_num($b),
                '>=', '≥' => ml_to_num($a) >= ml_to_num($b),
                default => throw new RuntimeException("Unsupported operator {$op}"),
            };
        }
        case 'Quantifier': {
            $fEnv = $env; $fEnv[$node['variable']] = false;
            $tEnv = $env; $tEnv[$node['variable']] = true;
            $f = ml_to_bool(ml_eval_ast($node['body'], $fEnv, $callables, $depth + 1));
            $t = ml_to_bool(ml_eval_ast($node['body'], $tEnv, $callables, $depth + 1));
            return $node['q'] === '∀' ? ($f && $t) : ($node['q'] === '∃' ? ($f || $t) : ($f !== $t));
        }
        case 'Call': {
            $callee = $node['callee'];
            if ($callee['type'] === 'Var' && isset($callables[$callee['name']])) {
                $fn = $callables[$callee['name']];
            } else {
                $fn = ml_eval_ast($callee, $env, $callables, $depth + 1);
            }
            if (!ml_is_callable($fn)) throw new RuntimeException('Target is not callable.');
            if (count($node['args']) !== count($fn['params'])) {
                throw new RuntimeException('Callable expects ' . count($fn['params']) . ' args, got ' . count($node['args']) . '.');
            }
            $loc = $fn['closureEnv'];
            if (!empty($fn['name'])) $loc[$fn['name']] = $fn;
            foreach ($fn['params'] as $i => $p) {
                $loc[$p] = ml_eval_ast($node['args'][$i], $env, $callables, $depth + 1);
            }
            return ml_eval_ast($fn['body'], $loc, $callables, $depth + 1);
        }
    }
    return false;
}

function ml_collect_free(array $node, array $bound, array &$out): void {
    switch ($node['type']) {
        case 'Var':
            if (!isset($bound[$node['name']])) $out[$node['name']] = true;
            return;
        case 'Unary':
            ml_collect_free($node['arg'], $bound, $out);
            return;
        case 'Binary':
            ml_collect_free($node['left'], $bound, $out);
            ml_collect_free($node['right'], $bound, $out);
            return;
        case 'Quantifier':
            $bound[$node['variable']] = true;
            ml_collect_free($node['body'], $bound, $out);
            return;
        case 'Lambda':
            foreach ($node['params'] as $p) $bound[$p] = true;
            ml_collect_free($node['body'], $bound, $out);
            return;
        case 'Call':
            if ($node['callee']['type'] !== 'Var') ml_collect_free($node['callee'], $bound, $out);
            foreach ($node['args'] as $a) ml_collect_free($a, $bound, $out);
    }
}

function ml_node_range(array $node, array $env): array {
    $free = [];
    ml_collect_free($node, [], $free);
    $vars = array_values(array_filter(array_keys($free), fn($v) => !array_key_exists($v, $env)));
    if (count($vars) > 8) return ['type'=>'bool', 'val'=>'both'];
    $seenTrue = false; $seenFalse = false; $seenNum = false; $seenCallable = false;
    $nums = [];
    $total = 1 << count($vars);
    for ($m = 0; $m < $total; $m++) {
        $le = $env;
        foreach ($vars as $i => $v) $le[$v] = (bool)(($m >> $i) & 1);
        try {
            $res = ml_eval_ast($node, $le);
        } catch (Throwable) {
            return ['type'=>'unknown'];
        }
        if (is_bool($res)) {
            if ($res) $seenTrue = true; else $seenFalse = true;
        } elseif (is_int($res) || is_float($res)) {
            $seenNum = true;
            $nums[(string)$res] = $res;
        } elseif (ml_is_callable($res)) {
            $seenCallable = true;
        }
        if ($seenTrue && $seenFalse && !$seenNum && !$seenCallable) return ['type'=>'bool', 'val'=>'both'];
    }
    if ($seenCallable) return ['type'=>'callable'];
    if ($seenNum && !$seenTrue && !$seenFalse) {
        return ['type'=>'num', 'val'=>count($nums) === 1 ? (string)array_values($nums)[0] : 'number'];
    }
    if ($seenTrue && $seenFalse) return ['type'=>'bool', 'val'=>'both'];
    if ($seenTrue) return ['type'=>'bool', 'val'=>'true'];
    if ($seenFalse) return ['type'=>'bool', 'val'=>'false'];
    return ['type'=>'unknown'];
}

function ml_first_def_bool(array $node, array $env): ?string {
    $r = ml_node_range($node, $env);
    if ($r['type'] === 'bool' && in_array($r['val'], ['true', 'false'], true)) return $r['val'];
    if ($node['type'] === 'Unary') return ml_first_def_bool($node['arg'], $env);
    if ($node['type'] === 'Binary') return ml_first_def_bool($node['left'], $env) ?? ml_first_def_bool($node['right'], $env);
    if ($node['type'] === 'Call') {
        foreach ($node['args'] as $arg) {
            $found = ml_first_def_bool($arg, $env);
            if ($found !== null) return $found;
        }
    }
    return null;
}

function ml_format_range(array $fn): string {
    $baseEnv = $fn['closureEnv'];
    foreach ($fn['params'] as $p) unset($baseEnv[$p]);
    $overall = ml_node_range($fn['body'], $baseEnv);
    if ($overall['type'] === 'callable') return 'callable';
    if ($overall['type'] === 'num') return (string)$overall['val'];
    if ($overall['type'] === 'bool') {
        if ($overall['val'] === 'true') return 'true';
        if ($overall['val'] === 'false') return 'false';
        return ml_first_def_bool($fn['body'], $baseEnv) === 'false' ? 'false or true' : 'true or false';
    }
    return 'true or false';
}

function ml_format_value(mixed $val): string {
    if (is_bool($val)) return $val ? 'true' : 'false';
    if (is_int($val)) return (string)$val;
    if (is_float($val)) return (floor($val) == $val) ? (string)(int)$val : (string)round($val, 6);
    if (ml_is_callable($val)) return ml_format_range($val);
    return (string)$val;
}

function ml_format_pointer_ast(array $node, array $ptrMeta, array &$refsOut): string {
    switch ($node['type']) {
        case 'Bool': return $node['value'] ? 'true' : 'false';
        case 'Number': return (string)$node['value'];
        case 'Var': {
            $name = $node['name'];
            if (isset($ptrMeta[$name]) && empty($ptrMeta[$name]['fromPre']) && $ptrMeta[$name]['ptr'] !== null) {
                $refsOut[] = [
                    'name' => $name,
                    'targetOutputLine' => $ptrMeta[$name]['ptr'],
                    'targetInputBlockIndex' => $ptrMeta[$name]['blockIndex'],
                    'fromPreInput' => false,
                ];
                return $name . '[line#' . $ptrMeta[$name]['ptr'] . ']';
            }
            if (isset($ptrMeta[$name]) && !empty($ptrMeta[$name]['fromPre'])) {
                $refsOut[] = [
                    'name' => $name,
                    'targetOutputLine' => null,
                    'targetInputBlockIndex' => null,
                    'fromPreInput' => true,
                ];
            }
            return $name;
        }
        case 'Unary': return $node['op'] . ml_format_pointer_ast($node['arg'], $ptrMeta, $refsOut);
        case 'Binary': return ml_format_pointer_ast($node['left'], $ptrMeta, $refsOut) . ' ' . $node['op'] . ' ' . ml_format_pointer_ast($node['right'], $ptrMeta, $refsOut);
        case 'Quantifier': return $node['q'] . $node['variable'] . '. ' . ml_format_pointer_ast($node['body'], $ptrMeta, $refsOut);
        case 'Lambda': return 'λ(' . implode(',', $node['params']) . '). ' . ml_format_pointer_ast($node['body'], $ptrMeta, $refsOut);
        case 'Call': {
            $calleeStr = $node['callee']['type'] === 'Var'
                ? $node['callee']['name']
                : ml_format_pointer_ast($node['callee'], $ptrMeta, $refsOut);
            $args = array_map(fn($a) => ml_format_pointer_ast($a, $ptrMeta, $refsOut), $node['args']);
            return $calleeStr . '(' . implode(',', $args) . ')';
        }
    }
    return '';
}

function evaluate_multiline_logic_program(string $preInputRaw, string $programRaw): array {
    $pre = ml_parse_pre_input($preInputRaw);
    $blocks = ml_segment_blocks($programRaw);
    $env = $pre['rawValues'];
    $ptrMeta = [];
    foreach ($pre['rawValues'] as $k => $_v) {
        $ptrMeta[$k] = ['ptr'=>null, 'blockIndex'=>null, 'fromPre'=>true];
    }

    $callables = [];
    $alignedLines = [];
    $condensedLines = [];
    $errors = array_map(fn($e) => $e['message'], $pre['errors']);
    $ptrCounter = 0;

    foreach ($blocks as $block) {
        $text = $block['compactText'];
        if (preg_match('/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:=(?![=>])|:=|≜)\s*(.+)$/u', $text, $dm)) {
            $fnName = $dm[1];
            $rawParams = trim($dm[2]);
            $params = $rawParams !== '' ? array_values(array_filter(array_map('trim', explode(',', $rawParams)), fn($p) => $p !== '')) : [];
            try {
                $bodyAst = ml_parse_ast(trim($dm[3]));
                $fnObj = ['__callable'=>true, 'name'=>$fnName, 'params'=>$params, 'body'=>$bodyAst, 'closureEnv'=>$env, 'isNamedDefinition'=>true];
                $callables[$fnName] = $fnObj;
                $rangeText = ml_format_range($fnObj);
                $alignedLines[] = [
                    'blockIndex' => $block['blockIndex'],
                    'startLine' => $block['startLine'],
                    'endLine' => $block['endLine'],
                    'kind' => 'definition',
                    'referenceable' => false,
                    'referenceName' => $fnName,
                    'pointerLineNumber' => null,
                    'outputText' => $rangeText,
                    'annotatedText' => "def {$fnName}(" . implode(',', $params) . ') · unreferenceable',
                    'referencedPointers' => [],
                ];
            } catch (Throwable $e) {
                $errors[] = $e->getMessage();
                $alignedLines[] = [
                    'blockIndex' => $block['blockIndex'],
                    'startLine' => $block['startLine'],
                    'endLine' => $block['endLine'],
                    'kind' => 'error',
                    'referenceable' => false,
                    'pointerLineNumber' => null,
                    'outputText' => 'Error: ' . $e->getMessage(),
                    'annotatedText' => 'Error: ' . $e->getMessage(),
                    'error' => $e->getMessage(),
                    'referencedPointers' => [],
                ];
            }
            continue;
        }

        if (preg_match('/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:=(?![=>])|:=|≜)\s*(.+)$/u', $text, $am)) {
            $varName = $am[1];
            $rhsRaw = trim($am[2]);
            try {
                $ast = ml_parse_ast($rhsRaw);
                $refs = [];
                ml_format_pointer_ast($ast, $ptrMeta, $refs);
                $val = ml_eval_ast($ast, $env, $callables);
                if (ml_is_callable($val)) {
                    $val['name'] = $varName;
                    $val['isNamedDefinition'] = false;
                }
                $ptrCounter++;
                $ptrMeta[$varName] = ['ptr'=>$ptrCounter, 'blockIndex'=>$block['blockIndex'], 'fromPre'=>false];
                $env[$varName] = $val;
                $valText = ml_format_value($val);
                $alignedLines[] = [
                    'blockIndex' => $block['blockIndex'],
                    'startLine' => $block['startLine'],
                    'endLine' => $block['endLine'],
                    'kind' => 'assignment',
                    'referenceable' => true,
                    'referenceName' => $varName,
                    'pointerLineNumber' => $ptrCounter,
                    'outputText' => $valText,
                    'annotatedText' => ml_is_callable($val) ? 'λ ' . $varName . '(' . implode(',', $val['params']) . ')' : $valText,
                    'value' => is_bool($val) ? $val : (is_int($val) || is_float($val) ? ml_to_bool($val) : null),
                    'referencedPointers' => $refs,
                ];
                $condensedLines[] = [
                    'pointerLineNumber' => $ptrCounter,
                    'blockIndex' => $block['blockIndex'],
                    'startLine' => $block['startLine'],
                    'endLine' => $block['endLine'],
                    'kind' => 'assignment',
                    'text' => $valText,
                    'valueText' => $valText,
                    'referencedPointers' => $refs,
                ];
            } catch (Throwable $e) {
                $errors[] = $e->getMessage();
                $alignedLines[] = [
                    'blockIndex' => $block['blockIndex'],
                    'startLine' => $block['startLine'],
                    'endLine' => $block['endLine'],
                    'kind' => 'error',
                    'referenceable' => false,
                    'pointerLineNumber' => null,
                    'outputText' => 'Error: ' . $e->getMessage(),
                    'annotatedText' => 'Error: ' . $e->getMessage(),
                    'error' => $e->getMessage(),
                    'referencedPointers' => [],
                ];
            }
            continue;
        }

        try {
            $ast = ml_parse_ast($text);
            $refs = [];
            $annotatedExpr = ml_format_pointer_ast($ast, $ptrMeta, $refs);
            $val = ml_eval_ast($ast, $env, $callables);
            $ptrCounter++;
            $valText = ml_format_value($val);
            $annotatedText = $annotatedExpr . '=' . $valText;
            $alignedLines[] = [
                'blockIndex' => $block['blockIndex'],
                'startLine' => $block['startLine'],
                'endLine' => $block['endLine'],
                'kind' => 'expression',
                'referenceable' => false,
                'pointerLineNumber' => $ptrCounter,
                'outputText' => $valText,
                'annotatedText' => $annotatedText,
                'value' => is_bool($val) ? $val : (is_int($val) || is_float($val) ? ml_to_bool($val) : null),
                'referencedPointers' => $refs,
            ];
            $condensedLines[] = [
                'pointerLineNumber' => $ptrCounter,
                'blockIndex' => $block['blockIndex'],
                'startLine' => $block['startLine'],
                'endLine' => $block['endLine'],
                'kind' => 'expression',
                'text' => $annotatedText,
                'valueText' => $valText,
                'referencedPointers' => $refs,
            ];
        } catch (Throwable $e) {
            $errors[] = $e->getMessage();
            $alignedLines[] = [
                'blockIndex' => $block['blockIndex'],
                'startLine' => $block['startLine'],
                'endLine' => $block['endLine'],
                'kind' => 'error',
                'referenceable' => false,
                'pointerLineNumber' => null,
                'outputText' => 'Error: ' . $e->getMessage(),
                'annotatedText' => 'Error: ' . $e->getMessage(),
                'error' => $e->getMessage(),
                'referencedPointers' => [],
            ];
        }
    }

    $exprLines = array_values(array_filter($alignedLines, fn($l) => $l['kind'] === 'expression'));
    $assignLines = array_values(array_filter($alignedLines, fn($l) => $l['kind'] === 'assignment'));
    $terminal = count($exprLines) > 0 ? $exprLines[count($exprLines) - 1] : (count($assignLines) > 0 ? $assignLines[count($assignLines) - 1] : null);

    return [
        'ok' => count($errors) === 0 && $terminal !== null,
        'preInput' => $pre,
        'blocks' => $blocks,
        'alignedLines' => $alignedLines,
        'condensedLines' => $condensedLines,
        'alignedOutputText' => implode("\r\n", array_map(fn($l) => $l['outputText'], $alignedLines)),
        'pointerOutputText' => implode("\r\n", array_map(fn($l) => $l['text'], $condensedLines)),
        'postOutput' => $terminal ? [
            'ok' => true,
            'displayValue' => $terminal['outputText'],
            'value' => $terminal['value'] ?? null,
            'annotatedExpression' => $terminal['annotatedText'],
            'blockIndex' => $terminal['blockIndex'],
        ] : [
            'ok' => false,
            'displayValue' => isset($errors[0]) ? 'Error: ' . $errors[0] : 'No output',
            'value' => null,
            'annotatedExpression' => '',
            'blockIndex' => null,
            'error' => $errors[0] ?? 'No expression evaluated.',
        ],
        'errors' => $errors,
    ];
}
