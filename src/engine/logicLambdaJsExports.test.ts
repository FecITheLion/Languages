import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { spawnSync } from 'node:child_process';
import { evaluateLogicStatement, exportLogicStatement, CAUCHY_SEQUENCE_PRESETS } from './logicLambdaEngine.ts';

const labels = [
  { id: 'x', name: 'x', kind: 'number' as const, value: '2' },
  { id: 'flag', name: 'flag', kind: 'boolean' as const, value: 'true' },
];

async function generated(target: 'javascript' | 'typescript', statement = 'x + 1', cauchy = false) {
  const result = evaluateLogicStatement(statement, labels);
  const content = exportLogicStatement(target, statement, labels, result, cauchy ? CAUCHY_SEQUENCE_PRESETS[1].config : undefined).content;
  const code = target === 'typescript' ? stripTypeScriptTypes(content) : content;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

for (const target of ['javascript', 'typescript'] as const) {
  test(`${target}: normalize CLI inputs and honor supplied labels`, async () => {
    const mod = await generated(target);
    const run = (args: string[]) => {
      const p = mod.parseCliArgs(args);
      return mod.evaluateFromInput(p.rawInput, p.statement, undefined, p.overrides, p.labels).result;
    };
    assert.equal(run([]), 3);
    assert.equal(run(['x * 3']), 6);
    assert.equal(run(['x * 3', 'x=4']), 12);
    assert.equal(run(['x * 3; x=4']), 12);
    assert.equal(run(['x=4']), 5);
    assert.equal(run(['--statement', 'x * 2', '--x=5']), 10);
    assert.equal(run(['{"logic_statement":"x * 2","logic_labels":{"x":7}}']), 14);
    assert.equal(run(['--input', '{"logic_statement":"x * 2","logic_labels":"x=7"}']), 14);
    assert.equal(run(['[8,false]']), 9);
    assert.equal(run(['8', 'false']), 9);
    assert.equal(mod.evaluateLogic('x + 1', [['x', 'number', '9']]), 10);
    assert.deepEqual(mod.parseInputsFromString('x=5'), { x: 5, flag: true });
    assert.throws(() => run(['--flag=maybe']), /Invalid boolean/);
    assert.throws(() => run(['--x=nope']), /Invalid numeric/);
    assert.throws(() => run(['--unknown=3']), /Unknown option/);
    assert.throws(() => run(['[1,true,3]']), /Too many/);
    assert.throws(() => run(['x=3 trailing']), /Invalid input|Unbound|Unexpected/);
    assert.throws(() => run(['missing + 1']), /Unbound label "missing"/);
    assert.throws(() => run(['x +']), /Unexpected/);
  });

  test(`${target}: unbound exported variables require a definition`, async () => {
    const mod = await generated(target, 'missing + 1');
    assert.throws(() => mod.evaluateFromInput(), /Unbound label "missing"/);
    assert.equal(mod.evaluateFromInput('missing=4').result, 5);
    assert.equal(mod.evaluateLogic('missing + 1', [['missing', 'number', '8']]), 9);
  });

  test(`${target}: recompute configured Cauchy sequence with current labels`, async () => {
    const mod = await generated(target, 'x + 1', true);
    const sequence = mod.evaluateCauchySequence();
    assert.ok(sequence.converged);
    assert.ok(Math.abs(sequence.limitEstimate - Math.SQRT2) < 1e-8);
  });
}

test('CLI reports errors rather than stale results', () => {
  const content = exportLogicStatement('javascript', 'x + 1', labels, evaluateLogicStatement('x + 1', labels)).content;
  const url = `data:text/javascript;base64,${Buffer.from(content).toString('base64')}`;
  const execute = (args: string[]) => spawnSync(process.execPath, [
    '--input-type=module', '-e', `const m = await import(${JSON.stringify(url)}); m.runCli(process.argv.slice(1));`, '--', ...args,
  ], { encoding: 'utf8' });
  const valid = execute(['{"logic_statement":"x * 2","logic_labels":"x=4"}']);
  assert.equal(valid.status, 0);
  assert.match(valid.stdout, /Result: 8/);
  const invalid = execute(['unknown + 1']);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Unbound label "unknown"/);
  assert.doesNotMatch(invalid.stdout, /Result:/);
  assert.match(execute(['--grammar', 'x ::= "anything"']).stderr, /Custom grammar is not supported/);
});

test('Cauchy seeds use the supplied labels', async () => {
  const config = { ...CAUCHY_SEQUENCE_PRESETS[1].config, seedValues: 'x', recurrenceExpr: '_1 / 2', maxIterations: 2 };
  const content = exportLogicStatement('javascript', 'x', labels, evaluateLogicStatement('x', labels), config).content;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(content).toString('base64')}`);
  assert.deepEqual(mod.evaluateCauchySequence([['x', 'number', '8']]).terms, [8, 4, 2]);
});

test('label overrides remain visible to dependent lambdas', async () => {
  const bindings = [
    labels[0],
    { id: 'f', name: 'f', kind: 'lambda' as const, value: 'λy. x + y' },
  ];
  const content = exportLogicStatement('javascript', 'f(3)', bindings, evaluateLogicStatement('f(3)', bindings)).content;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(content).toString('base64')}`);
  const p = mod.parseCliArgs(['f(3)', 'x=10']);
  assert.equal(mod.evaluateFromInput(p.rawInput, p.statement, undefined, p.overrides, p.labels).result, 13);
  assert.throws(() => mod.evaluateFromInput('f=2'), /Cannot replace lambda/);
});

for (const target of ['javascript', 'typescript'] as const) {
  test(`${target}: JSON callbacks and curried DSL evaluation`, async () => {
    const statement = 'offset(x,hours)';
    const content = exportLogicStatement(target, statement, [], evaluateLogicStatement(statement, [])).content;
    const code = target === 'typescript' ? stripTypeScriptTypes(content) : content;
    const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    const p = mod.parseCliArgs([JSON.stringify({
      logic_labels: { offset: { kind: 'lambda', value: 'λx. λhours. x + hours' }, x: 10, hours: 3 },
    })]);
    assert.equal(mod.evaluateFromInput(p.rawInput, p.statement, undefined, p.overrides, p.labels).result, 13);
    const named = mod.parseCliArgs([JSON.stringify({
      logic_statement: statement,
      logic_labels: { offset: { kind: 'lambda', value: 'λx. λhours. x + hours' } },
      x: 10,
      hours: 3,
    })]);
    assert.equal(mod.evaluateFromInput(named.rawInput, named.statement, undefined, named.overrides, named.labels).result, 13);
    assert.throws(() => mod.evaluateFromInput(), /Unbound label "offset"/);
    const missing = mod.parseCliArgs([JSON.stringify({ logic_labels: { offset: { kind: 'lambda', value: 'λx. λhours. x + hours' } } })]);
    assert.throws(() => mod.evaluateFromInput(missing.rawInput, missing.statement, undefined, missing.overrides, missing.labels), /Unbound label "x"/);
    assert.equal(mod.evaluateLogic('(λx. λy. x + y)(2)(3)', []), 5);
    assert.equal(mod.evaluateLogic('(λx y. x * y)(2, 4)', []), 8);
    assert.equal(mod.evaluateLogic('(λx. (λy. x + y))(7)(3)', []), 10);
    assert.equal(mod.evaluateLogic('true → false ∨ true', []), true);
    assert.equal(mod.evaluateLogic('2 ^ 3 ^ 2', []), 512);
    assert.equal(mod.evaluateLogic('∀p. p ∨ ¬p', []), true);
    assert.throws(() => mod.evaluateLogic('false ∧ missing', []), /Unbound label "missing"/);
    assert.throws(() => mod.evaluateLogic('1 / 0', []), /Division by zero/);
    const captures = mod.parseCliArgs([JSON.stringify({
      logic_statement: 'add(4)',
      logic_labels: { x: 6, add: { kind: 'lambda', value: 'λy. x + y' } },
    })]);
    assert.equal(mod.evaluateFromInput(captures.rawInput, captures.statement, undefined, captures.overrides, captures.labels).result, 10);
    assert.equal(mod.evaluateLogic('constructor + __proto__', [['constructor', 'number', '2'], ['__proto__', 'number', '3']]), 5);
  });

  test(`${target}: rejects JavaScript injection in statements and labels`, async () => {
    const mod = await generated(target);
    const host = globalThis as typeof globalThis & { __logicInjection?: number };
    delete host.__logicInjection;
    const injection = '(globalThis.__logicInjection = 123)';
    assert.throws(() => mod.evaluateLogic(injection, []), /Unexpected|Expected/);
    assert.throws(() => mod.evaluateLogic('x', [['x', 'number', injection]]), /Unexpected|Expected/);
    assert.throws(() => mod.evaluateLogic('f(1)', [['f', 'lambda', `λx. ${injection}`]]), /Unexpected|Expected/);
    assert.throws(() => mod.evaluateLogic('process.exit(0)', []), /Unexpected|Expected/);
    assert.equal(host.__logicInjection, undefined);
  });
}

test('DSL operator behavior agrees with the engine', async () => {
  const mod = await generated('javascript');
  for (const statement of [
    '2 + 3 * 4', '-2 ^ 2', '2 ^ 3 ^ 2', '1 = true', '2 ↔ 3',
    'true xor false', 'false → true → false', '3 ≠ 4 ∧ 4 ≥ 4',
    'exists p. p', '(λx. λy. x + y)(2, 3)', '(λf. f(3))(λx. x ^ 2)',
  ]) {
    const expected = evaluateLogicStatement(statement, []);
    assert.equal(expected.ok, true, `${statement}: ${expected.error}`);
    assert.ok(expected.value && expected.value.kind !== 'closure');
    assert.equal(mod.evaluateLogic(statement, []), expected.value.value, statement);
  }
});

test('default export preserves anonymous lexical captures', async () => {
  const statement = '(λx. (λy. x + y)(3))(4)';
  const content = exportLogicStatement('javascript', statement, [], evaluateLogicStatement(statement, [])).content;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(content).toString('base64')}`);
  assert.equal(mod.evaluateFromInput().result, 7);
});
