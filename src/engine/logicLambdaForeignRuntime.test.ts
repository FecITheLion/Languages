import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAUCHY_SEQUENCE_PRESETS, evaluateLogicStatement, exportLogicStatement } from './logicLambdaEngine.ts';

const labels = [
  { id: 'x', name: 'x', kind: 'number' as const, value: '2' },
  { id: 'flag', name: 'flag', kind: 'boolean' as const, value: 'true' },
];

const targets = ['go', 'java', 'cpp', 'csharp', 'php'] as const;

test('foreign exports parse defaults, named and positional literals without stale evaluation results', () => {
  const statement = 'x + 1';
  const result = evaluateLogicStatement(statement, labels);
  const defaultGuards = {
    go: 'systemParser == nil && (rawInput == "" || rawInput == SampleSingleInput) && statement == LogicStatement',
    java: 'systemParser == null && (rawInput == null || rawInput.isEmpty() || SAMPLE_SINGLE_INPUT.equals(rawInput)) && statement.equals(LOGIC_STATEMENT)',
    cpp: '!system_parser && (raw_input.empty() || raw_input == SAMPLE_SINGLE_INPUT) && statement == LOGIC_STATEMENT',
    csharp: 'systemParser is null && (string.IsNullOrEmpty(rawInput) || rawInput == SampleSingleInput) && statement == LogicStatement',
    php: "$systemParser === null && ($rawInput === '' || $rawInput === SAMPLE_SINGLE_INPUT) && $statement === LOGIC_STATEMENT",
  } as const;
  const publicApis = {
    go: 'func EvaluateFromInput(rawInput string, systemParser',
    java: 'evaluateFromInput(String rawInput, BiFunction',
    cpp: 'evaluate_from_input(',
    csharp: 'EvaluateFromInput(',
    php: 'function evaluate_from_input(',
  } as const;
  for (const target of targets) {
    const { content } = exportLogicStatement(target, statement, labels, result);
    assert.match(content, /parse_inputs_from_string|ParseInputsFromString|parseInputsFromString/);
    assert.match(content, /unknown input name|Unknown input name|Unknown input name/i);
    assert.match(content, /too many positional inputs|Too many positional inputs/i);
    assert.match(content, /Invalid numeric literal|invalid numeric literal/i);
    assert.match(content, /Invalid boolean literal|invalid boolean literal/i);
    assert.match(content, /systemParser|system_parser/);
    assert.match(content, /standalone expression evaluation is not implemented/);
    assert.ok(content.includes(defaultGuards[target]), `${target} should guard the default result`);
    assert.match(content, /return ["']3["'];?/);
    assert.ok(content.includes(publicApis[target]), `${target} should retain its prior public API`);

    const failedResult = evaluateLogicStatement('x +', labels);
    const failedExport = exportLogicStatement(target, statement, labels, failedResult).content;
    assert.doesNotMatch(failedExport, /return ["']3["'];?/);
  }
});

test('foreign exports pass the requested statement and parsed labels to a runtime evaluator', () => {
  const statement = 'x * 4';
  const result = evaluateLogicStatement(statement, labels);
  const expected = {
    go: 'EvaluateLogic(statement, merged, systemParser)',
    java: 'evaluateLogic(statement, merged, systemParser)',
    cpp: 'evaluate_logic(statement, merged, system_parser)',
    csharp: 'EvaluateLogic(statement, merged, systemParser)',
    php: 'evaluate_logic($statement, $merged, $systemParser)',
  } as const;
  for (const target of targets) {
    const { content } = exportLogicStatement(target, statement, labels, result);
    assert.ok(content.includes(expected[target]), `${target} should forward current statement and labels`);
  }
});

test('foreign exports reject configured Cauchy evaluation instead of omitting or caching it', () => {
  const statement = 'x + 1';
  const result = evaluateLogicStatement(statement, labels);
  for (const target of targets) {
    assert.throws(
      () => exportLogicStatement(target, statement, labels, result, CAUCHY_SEQUENCE_PRESETS[1].config),
      /Cauchy evaluation is not implemented/
    );
  }
});
