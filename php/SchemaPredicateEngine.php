<?php
declare(strict_types=1);
if (!defined('PHP_API_ENTRY') && !defined('PHP_RENDER_ENTRY')) { http_response_code(404); exit; }

const DEFAULT_JSON_SCHEMA_SAMPLE = <<<'JSON'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "username": { "type": "string", "minLength": 3 },
    "age": { "type": "integer", "minimum": 18 },
    "active": { "type": "boolean" }
  },
  "required": ["username", "age"]
}
JSON;

const DEFAULT_TEST_INSTANCE_SAMPLE = <<<'JSON'
{
  "username": "alex_dev",
  "age": 25,
  "active": true
}
JSON;

const DEFAULT_SCHEMA_EBNF_GRAMMAR = <<<'EBNF'
(* EBNF Grammar for JSON Schema Subset *)
Schema        ::= ObjectSchema | PrimitiveSchema ;
ObjectSchema  ::= "{" TypeProp "," PropertiesProp "," RequiredProp "}" ;
TypeProp      ::= '"type"' ":" '"object"' | '"string"' | '"integer"' | '"boolean"' ;
PropertiesProp::= '"properties"' ":" "{" PropertyDef { "," PropertyDef } "}" ;
PropertyDef   ::= Identifier ":" SchemaNode ;
SchemaNode    ::= "{" [ ConstraintList ] "}" ;
ConstraintList::= Constraint { "," Constraint } ;
Constraint    ::= TypeConstraint | MinLengthConstraint | MinValConstraint ;
EBNF;

function schema_is_assoc_object(mixed $val): bool {
    if ($val instanceof stdClass) return true;
    if (!is_array($val)) return false;
    if ($val === []) return false;
    return !array_is_list($val);
}

function schema_as_assoc(mixed $val): array {
    if ($val instanceof stdClass) return get_object_vars($val);
    return is_array($val) ? $val : [];
}

function schema_predicate_compile(array $schemaObj, string $key = 'Root', string $path = '$', bool $isRequired = false): array {
    $type = is_string($schemaObj['type'] ?? null) && trim($schemaObj['type']) !== ''
        ? trim($schemaObj['type'])
        : (isset($schemaObj['properties']) && schema_is_assoc_object($schemaObj['properties']) ? 'object' : 'any');

    $requiredList = [];
    if (isset($schemaObj['required']) && is_array($schemaObj['required'])) {
        foreach ($schemaObj['required'] as $req) {
            if (is_string($req)) $requiredList[] = $req;
        }
    }

    $predicates = [];
    if (is_string($schemaObj['type'] ?? null) && trim($schemaObj['type']) !== '') {
        $predicates[] = 'type == ' . trim($schemaObj['type']);
    }
    if (isset($schemaObj['minLength']) && (is_int($schemaObj['minLength']) || is_float($schemaObj['minLength']))) {
        $predicates[] = 'length >= ' . $schemaObj['minLength'];
    }
    if (isset($schemaObj['maxLength']) && (is_int($schemaObj['maxLength']) || is_float($schemaObj['maxLength']))) {
        $predicates[] = 'length <= ' . $schemaObj['maxLength'];
    }
    if (isset($schemaObj['minimum']) && (is_int($schemaObj['minimum']) || is_float($schemaObj['minimum']))) {
        $predicates[] = 'value >= ' . $schemaObj['minimum'];
    }
    if (isset($schemaObj['maximum']) && (is_int($schemaObj['maximum']) || is_float($schemaObj['maximum']))) {
        $predicates[] = 'value <= ' . $schemaObj['maximum'];
    }
    if (is_string($schemaObj['pattern'] ?? null)) {
        $predicates[] = 'pattern /' . $schemaObj['pattern'] . '/';
    }
    if (isset($schemaObj['enum']) && is_array($schemaObj['enum'])) {
        $items = array_map(fn($v) => json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $schemaObj['enum']);
        $predicates[] = 'enum in [' . implode(', ', $items) . ']';
    }
    if (count($requiredList) > 0) {
        $predicates[] = 'required_fields: [' . implode(', ', $requiredList) . ']';
    }

    $node = [
        'name' => $key,
        'path' => $path,
        'type' => $type,
        'predicates' => $predicates,
        'requiredFields' => $requiredList,
        'minLength' => $schemaObj['minLength'] ?? null,
        'maxLength' => $schemaObj['maxLength'] ?? null,
        'minimum' => $schemaObj['minimum'] ?? null,
        'maximum' => $schemaObj['maximum'] ?? null,
        'pattern' => is_string($schemaObj['pattern'] ?? null) ? $schemaObj['pattern'] : null,
        'enumValues' => isset($schemaObj['enum']) && is_array($schemaObj['enum']) ? $schemaObj['enum'] : null,
        'isRequired' => $isRequired,
        'children' => [],
    ];

    $reqSet = array_flip($requiredList);
    if (isset($schemaObj['properties']) && schema_is_assoc_object($schemaObj['properties'])) {
        foreach (schema_as_assoc($schemaObj['properties']) as $propKey => $propVal) {
            if (schema_is_assoc_object($propVal) || (is_array($propVal) && $propVal === [])) {
                $node['children'][] = schema_predicate_compile(
                    schema_as_assoc($propVal),
                    (string)$propKey,
                    $path . '.' . $propKey,
                    isset($reqSet[(string)$propKey])
                );
            }
        }
    } elseif ($key === 'Root' && isset($schemaObj['$defs']) && schema_is_assoc_object($schemaObj['$defs'])) {
        foreach (schema_as_assoc($schemaObj['$defs']) as $defKey => $defVal) {
            if (schema_is_assoc_object($defVal)) {
                $node['children'][] = schema_predicate_compile(
                    schema_as_assoc($defVal),
                    (string)$defKey,
                    $path . '.' . $defKey,
                    false
                );
            }
        }
    }

    if (isset($schemaObj['items']) && schema_is_assoc_object($schemaObj['items'])) {
        $node['children'][] = schema_predicate_compile(
            schema_as_assoc($schemaObj['items']),
            '[items]',
            $path . '[]',
            false
        );
    }

    return $node;
}

function schema_predicate_evaluate(array $node, mixed $instance): array {
    $errors = [];
    $nodeResults = [];
    $totalChecked = 0;
    $totalPassed = 0;

    $visit = null;
    $visit = function (array $curNode, mixed $val, bool $valProvided) use (&$visit, &$errors, &$nodeResults, &$totalChecked, &$totalPassed): bool {
        $nodeErrs = [];
        $checked = 0;
        $passed = 0;
        $isRoot = ($curNode['path'] === '$');
        $type = (string)($curNode['type'] ?? 'any');

        if ($type !== '' && $type !== 'any') {
            $checked++;
            $typeOk = match ($type) {
                'string' => is_string($val),
                'integer' => is_int($val),
                'number' => (is_int($val) || is_float($val)) && is_finite((float)$val),
                'boolean' => is_bool($val),
                'object' => ($val instanceof stdClass) || (is_array($val) && ($val === [] || !array_is_list($val))),
                'array' => is_array($val) && array_is_list($val),
                'null' => $val === null,
                default => true,
            };
            if ($typeOk) {
                $passed++;
            } else {
                $nodeErrs[] = [
                    'path' => $curNode['path'],
                    'field' => $curNode['name'],
                    'predicate' => 'type == ' . $type,
                    'message' => $isRoot ? "Root instance must be {$type}" : "Field '{$curNode['name']}' must be {$type}",
                ];
            }
        }

        if ($curNode['minLength'] !== null && is_string($val)) {
            $checked++;
            $len = mb_strlen($val, 'UTF-8');
            if ($len >= $curNode['minLength']) $passed++;
            else {
                $nodeErrs[] = [
                    'path' => $curNode['path'],
                    'field' => $curNode['name'],
                    'predicate' => 'length >= ' . $curNode['minLength'],
                    'message' => "Field '{$curNode['name']}' length must be >= {$curNode['minLength']}",
                ];
            }
        }
        if ($curNode['maxLength'] !== null && is_string($val)) {
            $checked++;
            $len = mb_strlen($val, 'UTF-8');
            if ($len <= $curNode['maxLength']) $passed++;
            else {
                $nodeErrs[] = [
                    'path' => $curNode['path'],
                    'field' => $curNode['name'],
                    'predicate' => 'length <= ' . $curNode['maxLength'],
                    'message' => "Field '{$curNode['name']}' length must be <= {$curNode['maxLength']}",
                ];
            }
        }
        if ($curNode['pattern'] !== null && is_string($val)) {
            $checked++;
            $delim = '~';
            $pat = str_replace('~', '\~', $curNode['pattern']);
            $ok = @preg_match("{$delim}{$pat}{$delim}u", $val) === 1;
            if ($ok) $passed++;
            else {
                $nodeErrs[] = [
                    'path' => $curNode['path'],
                    'field' => $curNode['name'],
                    'predicate' => 'pattern /' . $curNode['pattern'] . '/',
                    'message' => "Field '{$curNode['name']}' does not match /{$curNode['pattern']}/",
                ];
            }
        }
        if ($curNode['minimum'] !== null && (is_int($val) || is_float($val))) {
            $checked++;
            if ($val >= $curNode['minimum']) $passed++;
            else {
                $nodeErrs[] = [
                    'path' => $curNode['path'],
                    'field' => $curNode['name'],
                    'predicate' => 'value >= ' . $curNode['minimum'],
                    'message' => "Field '{$curNode['name']}' value must be >= {$curNode['minimum']}",
                ];
            }
        }
        if ($curNode['maximum'] !== null && (is_int($val) || is_float($val))) {
            $checked++;
            if ($val <= $curNode['maximum']) $passed++;
            else {
                $nodeErrs[] = [
                    'path' => $curNode['path'],
                    'field' => $curNode['name'],
                    'predicate' => 'value <= ' . $curNode['maximum'],
                    'message' => "Field '{$curNode['name']}' value must be <= {$curNode['maximum']}",
                ];
            }
        }
        if ($curNode['enumValues'] !== null && $valProvided) {
            $checked++;
            $valEnc = json_encode($val, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $matchedEnum = false;
            foreach ($curNode['enumValues'] as $ev) {
                if (json_encode($ev, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) === $valEnc) {
                    $matchedEnum = true;
                    break;
                }
            }
            if ($matchedEnum) $passed++;
            else {
                $enumList = implode(', ', array_map(fn($v) => json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $curNode['enumValues']));
                $nodeErrs[] = [
                    'path' => $curNode['path'],
                    'field' => $curNode['name'],
                    'predicate' => "enum in [{$enumList}]",
                    'message' => "Field '{$curNode['name']}' must be one of {$enumList}",
                ];
            }
        }

        $isObjVal = ($val instanceof stdClass) || (is_array($val) && ($val === [] || !array_is_list($val)));
        $objArr = $isObjVal ? schema_as_assoc($val) : null;
        if ($objArr !== null && count($curNode['requiredFields']) > 0) {
            foreach ($curNode['requiredFields'] as $reqField) {
                $checked++;
                if (array_key_exists($reqField, $objArr)) {
                    $passed++;
                } else {
                    $nodeErrs[] = [
                        'path' => $curNode['path'] . '.' . $reqField,
                        'field' => $reqField,
                        'predicate' => "required({$reqField})",
                        'message' => "Missing required field: '{$reqField}'",
                    ];
                }
            }
        }

        $childrenValid = true;
        foreach ($curNode['children'] as $child) {
            if ($child['name'] === '[items]' && is_array($val) && array_is_list($val)) {
                foreach ($val as $idx => $itemVal) {
                    $itemChild = $child;
                    $itemChild['name'] = $curNode['name'] . "[{$idx}]";
                    $itemChild['path'] = $curNode['path'] . "[{$idx}]";
                    if (!$visit($itemChild, $itemVal, true)) $childrenValid = false;
                }
            } elseif ($objArr !== null && array_key_exists($child['name'], $objArr)) {
                if (!$visit($child, $objArr[$child['name']], true)) $childrenValid = false;
            } elseif ($child['path'] !== '$[]' && $child['name'] !== '[items]') {
                if (!isset($nodeResults[$child['path']])) {
                    $nodeResults[$child['path']] = [
                        'path' => $child['path'],
                        'name' => $child['name'],
                        'valid' => !in_array($child['name'], $curNode['requiredFields'], true),
                        'checkedCount' => 0,
                        'passedCount' => 0,
                        'errors' => [],
                    ];
                }
            }
        }

        $totalChecked += $checked;
        $totalPassed += $passed;
        foreach ($nodeErrs as $e) $errors[] = $e;
        $nodeResults[$curNode['path']] = [
            'path' => $curNode['path'],
            'name' => $curNode['name'],
            'valid' => count($nodeErrs) === 0,
            'checkedCount' => $checked,
            'passedCount' => $passed,
            'errors' => $nodeErrs,
        ];
        return count($nodeErrs) === 0 && $childrenValid;
    };

    $visit($node, $instance, true);
    return [
        'valid' => count($errors) === 0,
        'errors' => $errors,
        'checkedPredicates' => $totalChecked,
        'passedPredicates' => $totalPassed,
        'nodeResults' => $nodeResults,
    ];
}

function schema_sanitize_ebnf_symbol(string $name): string {
    $clean = trim(preg_replace('/[^A-Za-z0-9_]+/', '_', $name) ?? '', '_');
    if ($clean === '') return 'node';
    return preg_match('/^[A-Za-z_]/', $clean) ? $clean : 'r_' . $clean;
}

function schema_generate_ebnf(array $schemaObj): string {
    $root = schema_predicate_compile($schemaObj);
    $rules = ['(* Compiled EBNF Productions from JSON Schema *)'];
    $emit = null;
    $emit = function (array $node, string $symName) use (&$emit, &$rules): void {
        $props = array_values(array_filter($node['children'], fn($c) => $c['name'] !== '[items]'));
        $itemsChild = null;
        foreach ($node['children'] as $c) {
            if ($c['name'] === '[items]') { $itemsChild = $c; break; }
        }
        if (count($props) > 0) {
            $reqSet = array_flip($node['requiredFields']);
            $terms = array_map(function ($c) use ($reqSet) {
                $s = schema_sanitize_ebnf_symbol($c['name']);
                return isset($reqSet[$c['name']]) ? $s : "[ {$s} ]";
            }, $props);
            $rules[] = "{$symName} ::= '{' " . implode(" ',' ", $terms) . " '}' ;";
            foreach ($props as $c) $emit($c, schema_sanitize_ebnf_symbol($c['name']));
            return;
        }
        if ($node['type'] === 'array' || $itemsChild !== null) {
            $itemSym = schema_sanitize_ebnf_symbol($itemsChild ? (string)($itemsChild['type'] ?? 'value') : 'json_value');
            $rules[] = "{$symName} ::= '[' [ {$itemSym} { ',' {$itemSym} } ] ']' ;";
            return;
        }
        if ($node['enumValues'] !== null && count($node['enumValues']) > 0) {
            $alts = array_map(fn($v) => "'" . str_replace("'", "\\'", (string)json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) . "'", $node['enumValues']);
            $rules[] = "{$symName} ::= " . implode(' | ', $alts) . " ;";
            return;
        }
        if ($node['type'] === 'string') {
            $rules[] = "{$symName} ::= '\"' char+ '\"' ;";
            return;
        }
        if ($node['type'] === 'integer' || $node['type'] === 'number') {
            $body = $node['type'] === 'integer' ? "['-'] digit+" : "['-'] digit+ [ '.' digit+ ]";
            $rules[] = "{$symName} ::= {$body} ;";
            return;
        }
        if ($node['type'] === 'boolean') {
            $rules[] = "{$symName} ::= 'true' | 'false' ;";
            return;
        }
        $rules[] = "{$symName} ::= json_value ;";
    };
    $emit($root, 'schema_root');
    $rules[] = "char ::= [a-zA-Z0-9_ .:-] ;";
    $rules[] = "digit ::= '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' ;";
    return implode("\n", $rules);
}

function schema_render_tree_text(array $node, string $prefix = '', bool $isLast = true, bool $isRoot = true): string {
    $connector = $isRoot ? '' : ($isLast ? '└─ ' : '├─ ');
    $preds = count($node['predicates']) > 0
        ? ' { predicates: ' . json_encode($node['predicates'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . ' }'
        : '';
    $line = "{$prefix}{$connector}{$node['name']}: [{$node['type']}]{$preds}";
    $childPrefix = $isRoot ? '' : $prefix . ($isLast ? '    ' : '│   ');
    $lines = [$line];
    $count = count($node['children']);
    foreach ($node['children'] as $idx => $child) {
        $lines[] = schema_render_tree_text($child, $childPrefix, $idx === $count - 1, false);
    }
    return implode("\n", $lines);
}

function evaluate_schema_predicate_studio(mixed $schemaRaw, mixed $instanceRaw = null): array {
    try {
        if (is_string($schemaRaw)) {
            $decodedSchema = json_decode($schemaRaw, false, 32, JSON_THROW_ON_ERROR);
            if (!schema_is_assoc_object($decodedSchema)) {
                throw new InputError('Invalid JSON Schema Syntax: Root must be a JSON object.');
            }
            $schemaObj = schema_as_assoc($decodedSchema);
        } elseif (schema_is_assoc_object($schemaRaw)) {
            $schemaObj = schema_as_assoc($schemaRaw);
        } else {
            throw new InputError('Invalid JSON Schema Syntax: Root must be a JSON object.');
        }
    } catch (JsonException $e) {
        return [
            'ok' => false,
            'parseError' => 'Invalid JSON Schema Syntax: ' . $e->getMessage(),
            'ebnfSubset' => DEFAULT_SCHEMA_EBNF_GRAMMAR,
            'generatedEbnf' => DEFAULT_SCHEMA_EBNF_GRAMMAR,
            'predicateTreeText' => '',
        ];
    } catch (InputError $e) {
        return [
            'ok' => false,
            'parseError' => $e->getMessage(),
            'ebnfSubset' => DEFAULT_SCHEMA_EBNF_GRAMMAR,
            'generatedEbnf' => DEFAULT_SCHEMA_EBNF_GRAMMAR,
            'predicateTreeText' => '',
        ];
    }

    $predicateTree = schema_predicate_compile($schemaObj);
    $generatedEbnf = schema_generate_ebnf($schemaObj);
    $predicateTreeText = schema_render_tree_text($predicateTree);

    if ($instanceRaw === null || (is_string($instanceRaw) && trim($instanceRaw) === '')) {
        return [
            'ok' => true,
            'schema' => $schemaObj,
            'ebnfSubset' => DEFAULT_SCHEMA_EBNF_GRAMMAR,
            'generatedEbnf' => $generatedEbnf,
            'predicateTree' => $predicateTree,
            'predicateTreeText' => $predicateTreeText,
        ];
    }

    try {
        $decodedInstance = is_string($instanceRaw)
            ? json_decode($instanceRaw, false, 32, JSON_THROW_ON_ERROR)
            : $instanceRaw;
    } catch (JsonException $e) {
        return [
            'ok' => false,
            'parseError' => 'Invalid Test JSON Instance: ' . $e->getMessage(),
            'schema' => $schemaObj,
            'ebnfSubset' => DEFAULT_SCHEMA_EBNF_GRAMMAR,
            'generatedEbnf' => $generatedEbnf,
            'predicateTree' => $predicateTree,
            'predicateTreeText' => $predicateTreeText,
        ];
    }

    $validation = schema_predicate_evaluate($predicateTree, $decodedInstance);
    return [
        'ok' => true,
        'schema' => $schemaObj,
        'ebnfSubset' => DEFAULT_SCHEMA_EBNF_GRAMMAR,
        'generatedEbnf' => $generatedEbnf,
        'predicateTree' => $predicateTree,
        'predicateTreeText' => $predicateTreeText,
        'validation' => $validation,
    ];
}
