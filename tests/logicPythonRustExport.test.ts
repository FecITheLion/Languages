import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { evaluateLogicStatement, exportLogicStatement } from '../src/engine/logicLambdaEngine.ts';
import type { LogicLabelBinding } from '../src/engine/logicLambdaEngine.ts';

const stem = `.logic-export-test-${process.pid}`;
const binExt = process.platform === 'win32' ? '.exe' : '';
const paths = [stem + '.py', stem + '.rs', stem + binExt];
const label = (name: string, value: string, kind: LogicLabelBinding['kind'] = 'number'): LogicLabelBinding =>
  ({ id: name, name, value, kind });

function command(program: string, args: string[]) {
  return spawnSync(program, args, { encoding: 'utf8', env: { ...process.env, TMPDIR: process.cwd(), PYTHONDONTWRITEBYTECODE: '1' } });
}

const pythonCmd = command('python3', ['--version']).status === 0 ? 'python3' : 'python';
const hasRustc = command('rustc', ['--version']).status === 0;
const activeTargets: Array<'python' | 'rust'> = hasRustc ? ['python', 'rust'] : ['python'];

function generate(statement: string, labels: LogicLabelBinding[], cauchy?: Parameters<typeof exportLogicStatement>[4]) {
  const result = evaluateLogicStatement(statement, labels);
  for (const [target, path] of [['python', paths[0]], ['rust', paths[1]]] as const) {
    writeFileSync(path, exportLogicStatement(target, statement, labels, result, cauchy).content);
  }
  if (hasRustc) {
    const compiled = command('rustc', ['-Awarnings', '--crate-name', 'logic_export_test', paths[1], '-o', paths[2]]);
    assert.equal(compiled.status, 0, compiled.stderr || String(compiled.error));
  }
}

function run(target: 'python' | 'rust', args: string[] = []) {
  return target === 'python' ? command(pythonCmd, [paths[0], ...args]) : command('./' + paths[2], args);
}

function result(target: 'python' | 'rust', args: string[], expected: string) {
  const proc = run(target, args);
  assert.equal(proc.status, 0, proc.stderr || String(proc.error));
  assert.match(proc.stdout, new RegExp(`Result: ${expected}(?:\\.0)?(?:\\r?\\n|$)`));
}

test('generated Python and Rust input handling', () => {
  try {
    generate('a - b', [label('a', '7'), label('b', '3')]);
    for (const target of activeTargets) {
      result(target, [], '4');
      result(target, ['10 2'], '8');
      result(target, ['10', '2'], '8');
      result(target, ['a=10 2'], '8');
      result(target, ['a = 10 b = 2'], '8');
      result(target, ['--a', '12'], '9');
      result(target, ['a + b', 'a=4 b=5'], '9');
      result(target, ['a + b'], '10');
      result(target, ['--statement', 'a + x', '--labels', 'a=4 x=9'], '13');
      const bad = run(target, ['--a', 'bad']);
      assert.notEqual(bad.status, 0);
    }
    result('python', ['--input', 'a=10', '--grammar', 'a ::= digit+'], '7');
    assert.notEqual(run('python', ['--input', 'a=10', '--grammar', 'a ::= "5"']).status, 0);
    if (hasRustc) assert.notEqual(run('rust', ['--grammar', 'x ::= "x"']).status, 0);
    const api = command(pythonCmd, ['-c', `import runpy; m=runpy.run_path(${JSON.stringify(paths[0])}); print(m['evaluate_logic']('a + b', 'a=4 b=5'))`]);
    assert.equal(api.status, 0, api.stderr || String(api.error));
    assert.equal(api.stdout.trim(), '9');

    generate('x + 1', []);
    for (const target of activeTargets) {
      const missing = run(target);
      assert.notEqual(missing.status, 0);
      assert.match(missing.stderr, /[Uu]nresolved|[Nn]ame.*x/);
      result(target, ['x=4'], '5');
      result(target, ['--statement', '2 + 3'], '5');
    }

    generate('x ∧ y', []);
    for (const target of activeTargets) {
      result(target, ['true false'], target === 'python' ? 'False' : 'false');
      result(target, ['true', 'false'], target === 'python' ? 'False' : 'false');
      assert.notEqual(run(target, ['x=maybe y=true']).status, 0);
    }

    generate('a + b', [label('a', '4'), label('b', 'a * 2')]);
    for (const target of activeTargets) {
      result(target, [], '12');
      result(target, ['--a', '5'], '15');
    }

    generate('f(3)', [label('f', 'λx. x', 'lambda')]);
    for (const target of activeTargets) {
      result(target, [], '3');
      result(target, ['--statement', '4 + 2'], '6');
    }
    if (hasRustc) assert.notEqual(run('rust', ['--statement', 'f(4)']).status, 0);

    generate('a', [label('a', '2')], {
      enabled: true, paramStyle: 'positional', customParamNames: '', seedValues: '1, 2',
      recurrenceExpr: '(_1 + _2) / 2', maxIterations: 2, epsilon: 0.1,
    });
    for (const target of activeTargets) result(target, [], '2');
    assert.match(run('python').stdout, /Cauchy Limit:/);

    generate('1 +', []);
    for (const target of activeTargets) {
      assert.notEqual(run(target).status, 0);
    }
  } finally {
    for (const path of paths) rmSync(path, { force: true });
  }
});
