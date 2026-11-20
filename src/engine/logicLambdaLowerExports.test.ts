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

const compiledTargets: LogicExportTarget[] = [
  'go',
  'java',
  'cpp',
  'csharp',
  'php',
  'sql',
  'swift',
  'kotlin',
  'scala',
  'haskell',
  'elixir',
  'lua',
  'zig',
  'dart',
  'ocaml',
];

test('all language exports compile parsed logic into executable code without unsupported stubs', () => {
  for (const target of compiledTargets) {
    const content = artifact(target, 'x + 1');
    assert.doesNotMatch(
      content,
      /Dynamic evaluation is not implemented|standalone expression evaluation is not implemented|error\.UnsupportedEvaluation/,
      `${target} should not contain dynamic evaluation stub`
    );
    assert.match(content, /v_x|inputs\.x/, `${target} should reference compiled variable x`);
    const emptySample = artifact(target, '1 + 1', []);
    assert.doesNotMatch(emptySample, /Dynamic evaluation is not implemented/, `${target} empty sample`);
  }
  assert.match(artifact('zig', 'x + 1'), /pub const EVALUATED_RESULT: \[\]const u8 = "3";/);
  assert.match(artifact('zig', 'x / 0'), /pub const EVALUATED_RESULT: \[\]const u8 = "Eval Error";/);
  assert.match(artifact('kotlin', '1 + 1', []), /val LOGIC_LABELS: Map<String, String> = mapOf\(/);
  assert.match(artifact('ocaml', '1 + 1', []), /\(\* Bound labels summary: \*\)/);
});

test('PHP export executes compiled logic dynamically on modified inputs', (t) => {
  if (!hasRuntime('php', ['-v'])) {
    t.skip('PHP is not installed');
    return;
  }
  const code = artifact('php', 'x + 1');
  const script = code.replace(/^<\?php\s*/, '') + '\necho evaluate_from_input("x=5");\n';
  const res = spawnSync('php', ['-r', script], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr || String(res.error));
  assert.match(res.stdout, /Result: 3/);
  assert.equal(res.stdout.trim().split(/\r?\n/).pop(), '6');

  const complexBindings: LogicLabelBinding[] = [
    { id: 'price', name: 'price', kind: 'number', value: '50' },
    { id: 'tax', name: 'tax', kind: 'number', value: '10' },
    { id: 'double', name: 'double', kind: 'lambda', value: 'λx. x * 2' },
    { id: 'apply_discount', name: 'apply_discount', kind: 'lambda', value: 'λcb. λv. cb(v) - 10' },
  ];
  const complexCode = artifact('php', '(apply_discount(double)(price) ≥ 80) ∧ ¬(tax > 15)', complexBindings);
  const complexScript = complexCode.replace(/^<\?php\s*/, '') + '\necho json_encode([evaluate_from_input("price=50 tax=10"), evaluate_from_input("price=30 tax=10")]);\n';
  const complexRes = spawnSync('php', ['-r', complexScript], { encoding: 'utf8' });
  assert.equal(complexRes.status, 0, complexRes.stderr || String(complexRes.error));
  assert.equal(complexRes.stdout.trim().split(/\r?\n/).pop(), '[true,false]');
});

test('Lua evaluates compiled logic dynamically for default and modified inputs when available', (t) => {
  const check = spawnSync('lua', ['-v'], { encoding: 'utf8' });
  if (check.error && 'code' in check.error && check.error.code === 'ENOENT') {
    t.skip('Lua is not installed');
    return;
  }
  const script = `local function module()\n${artifact('lua', 'x + 1')}\nend
local m = module()
local ok1, r1 = pcall(m.evaluate_from_input, m.SAMPLE_SINGLE_INPUT)
assert(ok1 and tonumber(r1) == 3)
local ok2, r2 = pcall(m.evaluate_from_input, "x=9")
assert(ok2 and tonumber(r2) == 10)
`;
  const result = spawnSync('lua', ['-'], { input: script, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
