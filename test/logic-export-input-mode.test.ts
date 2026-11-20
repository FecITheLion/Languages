import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { evaluateLogicStatement, exportLogicStatement, type LogicExportInputMode } from '../src/engine/logicLambdaEngine.ts';

const labels = [
  { id: 'price', name: 'price', kind: 'number' as const, value: '45' },
  { id: 'tax', name: 'tax', kind: 'number' as const, value: '8' },
];
const statement = 'price + tax';
const result = evaluateLogicStatement(statement, labels);

function exportSource(target: 'python' | 'javascript', mode: LogicExportInputMode): string {
  return exportLogicStatement(target, statement, labels, result, undefined, undefined, mode).content;
}

for (const target of ['python', 'javascript'] as const) {
  test(`${target} CLI mode reads flags, while hardcoded mode ignores command-line inputs`, () => {
    const extension = target === 'python' ? 'py' : 'mjs';
    const command = target === 'python' ? 'python3' : process.execPath;
    const path = `.logic-input-mode-${target}-${process.pid}.${extension}`;
    try {
      writeFileSync(path, exportSource(target, 'cli'));
      const cli = spawnSync(command, [path, '--price=10', '--tax=2'], { encoding: 'utf8' });
      assert.equal(cli.status, 0, cli.stderr);
      assert.match(cli.stdout, /Result: 12(?:\.0)?/);

      writeFileSync(path, exportSource(target, 'hardcoded'));
      const hardcoded = spawnSync(command, [path, '--price=10', '--tax=2'], { encoding: 'utf8' });
      assert.equal(hardcoded.status, 0, hardcoded.stderr);
      assert.match(hardcoded.stdout, /Result: 53(?:\.0)?/);
    } finally {
      rmSync(path, { force: true });
    }
  });
}
