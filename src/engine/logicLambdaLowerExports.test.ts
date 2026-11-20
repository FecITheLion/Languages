import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { evaluateLogicStatement, exportLogicStatement } from './logicLambdaEngine.ts';
import type { LogicExportTarget, LogicLabelBinding } from './logicLambdaEngine.ts';

const labels: LogicLabelBinding[] = [
  { id: 'x', name: 'x', kind: 'number', value: '2' },
  { id: 'flag', name: 'flag', kind: 'boolean', value: 'true' },
];

function artifact(target: LogicExportTarget, statement: string, bindings = labels) {
  return exportLogicStatement(target, statement, bindings, evaluateLogicStatement(statement, bindings)).content;
}

function ruby(statement: string, args: string[] = [], bindings = labels) {
  return spawnSync('ruby', ['-e', artifact('ruby', statement, bindings), '--', ...args], { encoding: 'utf8' });
}

function hasRuntime(cmd: string, args: string[] = ['-v']): boolean {
  const check = spawnSync(cmd, args, { encoding: 'utf8' });
  return !(check.error && 'code' in check.error && check.error.code === 'ENOENT');
}

const rubyAvailable = hasRuntime('ruby', ['-v']);

test('Ruby evaluates current input in named, positional, JSON and CLI forms', (t) => {
  if (!rubyAvailable && !process.env.CI) {
    t.skip('[optional-runtime] ruby is not installed locally (enabled in CI)');
    return;
  }
  const cases: Array<[string[], string]> = [
    [[], '3.0'],
    [['x=5'], '6.0'],
    [['5', 'false'], '6.0'],
    [['[7,false]'], '8.0'],
    [['{"logic_labels":{"x":8}}'], '9.0'],
    [['--input', 'x=3', '--x=10'], '11.0'],
  ];
  for (const [args, expected] of cases) {
    const result = ruby('x + 1', args);
    assert.equal(result.status, 0, result.stderr || String(result.error));
    assert.equal(result.stdout.trim(), `Result: ${expected}`);
  }
});

test('Ruby evaluates lambda closures, dependent labels, quantifiers and boolean coercion', (t) => {
  if (!rubyAvailable && !process.env.CI) {
    t.skip('[optional-runtime] ruby is not installed locally (enabled in CI)');
    return;
  }
  const bindings: LogicLabelBinding[] = [
    { id: 'x', name: 'x', kind: 'number', value: '2' },
    { id: 'y', name: 'y', kind: 'number', value: 'x + 1' },
    { id: 'f', name: 'f', kind: 'lambda', value: 'λz. z + y' },
  ];
  const result = ruby('f(x) = 7 ∧ (∀p. (p ∨ ¬p))', ['--x', '3'], bindings);
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.match(result.stdout, /Result: true/);
  const invalidOverride = ruby('f(x)', ['f=3'], bindings);
  assert.notEqual(invalidOverride.status, 0);
  assert.match(invalidOverride.stderr, /Lambda label cannot be overridden/);
});

test('Ruby reports malformed or unsupported inputs and evaluation failures', (t) => {
  if (!rubyAvailable && !process.env.CI) {
    t.skip('[optional-runtime] ruby is not installed locally (enabled in CI)');
    return;
  }
  for (const [statement, args, message] of [
    ['x + 1', ['--x=oops'], /Invalid numeric/],
    ['x + 1', ['x=3 trailing'], /Invalid input/],
    ['x + 1', ['--statement', 'x*2'], /not supported/],
    ['x + 1', ['{"logic_statement":"x*2"}'], /not supported/],
    ['x / 0', [], /Division by zero/],
    ['missing + 1', [], /Unbound label/],
    ['x +', [], /token|input/i],
  ] as Array<[string, string[], RegExp]>) {
    const result = ruby(statement, args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr || '', message);
    assert.doesNotMatch(result.stdout || '', /Result:/);
  }
});

const sampleGuards: Partial<Record<LogicExportTarget, RegExp>> = {
  swift: /if rawInput == SAMPLE_SINGLE_INPUT \{ return "3" \}/,
  kotlin: /if \(rawInput == SAMPLE_SINGLE_INPUT\) return "3"/,
  scala: /if rawInput == SAMPLE_SINGLE_INPUT then return "3"/,
  haskell: /if raw == sampleSingleInput then "3" else error/,
  elixir: /if raw_input == @sample_single_input do[\s\S]*?result: "3"[\s\S]*?else[\s\S]*?raise/,
  lua: /if raw_input == M.SAMPLE_SINGLE_INPUT then return "3" end/,
  zig: /if \(@import\("std"\)\.mem\.eql\(u8, raw_input, SAMPLE_SINGLE_INPUT\)\) return EVALUATED_RESULT;/,
  dart: /if \(rawInput == sampleSingleInput\) return "3";/,
  ocaml: /if raw_input = sample_single_input then "3" else failwith/,
};

const anySampleGuard: Partial<Record<LogicExportTarget, RegExp>> = {
  swift: /if rawInput == SAMPLE_SINGLE_INPUT/,
  kotlin: /if \(rawInput == SAMPLE_SINGLE_INPUT\)/,
  scala: /if rawInput == SAMPLE_SINGLE_INPUT/,
  haskell: /if raw == sampleSingleInput/,
  elixir: /if raw_input == @sample_single_input/,
  lua: /if raw_input == M.SAMPLE_SINGLE_INPUT/,
  zig: /mem\.eql\(u8, raw_input, SAMPLE_SINGLE_INPUT\)/,
  dart: /if \(rawInput == sampleSingleInput\)/,
  ocaml: /if raw_input = sample_single_input/,
};

test('lower target templates return only a verified exact sample and reject dynamic input', () => {
  for (const [name, guard] of Object.entries(sampleGuards)) {
    const target = name as LogicExportTarget;
    const content = artifact(target, 'x + 1');
    assert.match(content, guard!, target);
    assert.match(content, /Dynamic evaluation is not implemented|error\.UnsupportedEvaluation/, target);
    const failed = artifact(target, 'x / 0');
    assert.doesNotMatch(failed, anySampleGuard[target]!, target);
    assert.match(failed, /Dynamic evaluation is not implemented|error\.UnsupportedEvaluation/, target);
    const emptySample = artifact(target, '1 + 1', []);
    assert.match(emptySample, anySampleGuard[target]!, target);
    assert.match(emptySample, /"2"/, target);
  }
  assert.match(artifact('zig', 'x + 1'), /pub const EVALUATED_RESULT: \[\]const u8 = "3";/);
  assert.match(artifact('zig', 'x / 0'), /pub const EVALUATED_RESULT: \[\]const u8 = "Eval Error";/);
  assert.match(artifact('kotlin', '1 + 1', []), /val LOGIC_LABELS: Map<String, String> = mapOf\(/);
  assert.match(artifact('ocaml', '1 + 1', []), /\(\* Bound labels summary: \*\)/);
});

test('Lua returns the default and rejects modified or failed inputs when available', (t) => {
  const check = spawnSync('lua', ['-v'], { encoding: 'utf8' });
  if (check.error && 'code' in check.error && check.error.code === 'ENOENT') {
    t.skip('Lua is not installed');
    return;
  }
  for (const [statement, expected] of [['x + 1', '3'], ['x / 0', null]] as const) {
    const script = `local function module()\n${artifact('lua', statement)}\nend
local m = module()
local ok, result = pcall(m.evaluate_from_input, m.SAMPLE_SINGLE_INPUT)
assert(ok == ${expected === null ? 'false' : 'true'})
${expected === null ? '' : `assert(result == ${JSON.stringify(expected)})`}
assert(not pcall(m.evaluate_from_input, m.SAMPLE_SINGLE_INPUT .. " "))
`;
    const result = spawnSync('lua', ['-'], { input: script, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});
