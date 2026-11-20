import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { evaluateLogicStatement, exportLogicStatement } from '../src/engine/logicLambdaEngine.ts';

function exportPython(statement: string) {
  const labels = [
    { id: 'a', name: 'a', kind: 'number' as const, value: '2' },
    { id: 'b', name: 'b', kind: 'number' as const, value: '3' },
  ];
  return exportLogicStatement('python', statement, labels, evaluateLogicStatement(statement, labels)).content;
}

test('source-only: every Python eval is behind the DSL AST whitelist', () => {
  const source = exportPython('a + b');
  const allowed = source.match(/_ALLOWED_DSL_NODES = \(([\s\S]*?)\n\)/)?.[1];
  assert.ok(allowed);
  for (const node of ['Expression', 'Constant', 'Name', 'BinOp', 'BoolOp', 'Compare', 'Lambda', 'Call']) {
    assert.match(allowed, new RegExp(`\\bast\\.${node}\\b`));
  }
  for (const node of ['Attribute', 'Subscript', 'List', 'Tuple', 'Dict', 'ListComp', 'GeneratorExp', 'IfExp', 'NamedExpr']) {
    assert.doesNotMatch(allowed, new RegExp(`\\bast\\.${node}\\b`));
  }
  assert.equal((source.match(/\beval\(/g) || []).length, 1);
  assert.match(source, /ast\.walk\(tree\)[\s\S]*?type\(node\) not in _ALLOWED_DSL_NODES[\s\S]*?return eval\(compile\(tree/);
  assert.match(source, /type\(node\.value\) not in \(bool, int, float\)/);
  assert.match(source, /node\.id == '__builtins__'/);
  assert.match(source, /isinstance\(node, ast\.Call\) and \(not node\.args or node\.keywords\)/);
  assert.match(source, /node\.kwarg or node\.defaults or node\.kw_defaults/);
  assert.match(source, /_eval_dsl_expr\(_normalize_to_python_expr\(val_str\), env, '<label>'\)/);
  assert.match(source, /_eval_dsl_expr\(_normalize_to_python_expr\(val_str\), env, '<callback>'\)/);
  assert.match(source, /_eval_dsl_expr\(py_expr, env, '<LOGIC_STATEMENT>'\)/);

  const quantified = exportPython('∀x. x ∨ ¬x');
  assert.doesNotMatch(quantified, /for x in \(False, True\)/);
});

test('Python whitelist rejects non-DSL syntax in statements and labels', () => {
  const path = `.logic-python-whitelist-${process.pid}.py`;
  try {
    writeFileSync(path, exportPython('a + b'));
    const script = `
import runpy, sys
m = runpy.run_path(sys.argv[1])
parse = m["parse_logic_call"]
labels = [("a", "number", "2"), ("b", "number", "3")]
assert parse("a + b", labels) == 5
assert parse("a < b and True", labels) is True
assert parse("(lambda x: x + 1)(a)", labels) == 3
assert parse("f(a)", labels + [("f", "lambda", "lambda x: x + 1")]) == 3
for source in ("(1).__class__", "a[0]", "[x for x in (1, 2)]",
               "{1: 2}", "a if True else b", "a is b", "'text'",
               "(lambda x=1: x)(2)", "(lambda *x: 1)(2)"):
    try:
        parse(source, labels)
    except (ValueError, SyntaxError, NameError):
        pass
    else:
        raise AssertionError("accepted statement: " + source)
for kind, source in (("number", "(1).__class__"),
                     ("boolean", "True or (1).__class__"),
                     ("lambda", "lambda x: x.__class__")):
    try:
        parse("a", [("a", kind, source)])
    except (ValueError, SyntaxError, NameError):
        pass
    else:
        raise AssertionError("accepted label: " + source)
`;
    const result = spawnSync('python3', ['-c', script, path], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(path, { force: true });
  }
});

test('generated quantified defaults remain evaluable without comprehensions', () => {
  const path = `.logic-python-quantifier-${process.pid}.py`;
  try {
    writeFileSync(path, exportPython('∀x. x ∨ ¬x'));
    const result = spawnSync('python3', [path], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Result: True/);
  } finally {
    rmSync(path, { force: true });
  }
});
