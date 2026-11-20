import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildMultilineTruthTables,
  CALCULATOR_LABEL_CONVENTIONS,
  evaluateMultilineBooleanProgram,
  generateStandaloneBooleanCalculatorHtml,
  LOGIC_SYSTEM_CATEGORIES,
  parsePreInputLiterals,
  segmentMultilineBlocks,
} from '../src/engine/multilineBooleanEngine.ts';

test('evaluates reference multiline callable + assignment + entrypoint with pointer annotations', () => {
  const preInput = 'e=true';
  const program = 'a(b,c)=b & c \r\nd=false\r\n a(e,d)';
  const res = evaluateMultilineBooleanProgram(preInput, program);

  assert.equal(res.ok, true);
  assert.equal(res.alignedOutputText, 'true or false\r\nfalse\r\nfalse');
  assert.equal(res.pointerOutputText, 'false\r\na(e,d[line#1])=false');

  assert.equal(res.alignedLines.length, 3);
  assert.equal(res.alignedLines[0].kind, 'definition');
  assert.equal(res.alignedLines[0].referenceable, false);
  assert.equal(res.alignedLines[0].pointerLineNumber, null);

  assert.equal(res.alignedLines[1].kind, 'assignment');
  assert.equal(res.alignedLines[1].referenceable, true);
  assert.equal(res.alignedLines[1].referenceName, 'd');
  assert.equal(res.alignedLines[1].pointerLineNumber, 1);

  assert.equal(res.alignedLines[2].kind, 'expression');
  assert.equal(res.alignedLines[2].annotatedText, 'a(e,d[line#1])=false');
  assert.deepEqual(res.alignedLines[2].referencedPointers, [
    { name: 'e', targetOutputLine: null, targetInputBlockIndex: null, fromPreInput: true },
    { name: 'd', targetOutputLine: 1, targetInputBlockIndex: 1, fromPreInput: false },
  ]);

  assert.equal(res.postOutput.ok, true);
  assert.equal(res.postOutput.displayValue, 'false');
  assert.equal(res.postOutput.value, false);
});

test('prevents referencing callable definitions as scalar values', () => {
  const res = evaluateMultilineBooleanProgram('e=true', 'a(b,c)=b & c\na & e');
  assert.equal(res.ok, false);
  assert.match(res.errors[0], /may not be referenced/i);
});

test('treats multi-line whitespace-broken statements as single logical blocks with full line spans', () => {
  const program = 'a(b,c) =\n  b &\n  c\nd =\n  false\na(\n  e,\n  d\n)';
  const blocks = segmentMultilineBlocks(program);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].startLine, 1);
  assert.equal(blocks[0].endLine, 3);
  assert.equal(blocks[1].startLine, 4);
  assert.equal(blocks[1].endLine, 5);
  assert.equal(blocks[2].startLine, 6);
  assert.equal(blocks[2].endLine, 9);

  const res = evaluateMultilineBooleanProgram('e=true', program);
  assert.equal(res.ok, true);
  assert.equal(res.alignedOutputText, 'true or false\r\nfalse\r\nfalse');
  assert.equal(res.pointerOutputText, 'false\r\na(e,d[line#1])=false');
});

test('pre-input rejects compound expressions and callable definitions', () => {
  const valid = parsePreInputLiterals('e=true\nx = ⊥\ny = 1');
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.values, { e: true, x: false, y: true });

  const invalidCompound = parsePreInputLiterals('e = a & b');
  assert.equal(invalidCompound.ok, false);
  assert.equal(invalidCompound.errors[0].line, 1);

  const invalidCallable = parsePreInputLiterals('f(x) = x');
  assert.equal(invalidCallable.ok, false);
});

test('live truth table enumerates entrypoint valuation and per-callable truth table', () => {
  const preInput = 'e=true';
  const program = 'a(b,c)=b & c\nd=false\na(e,d)';
  const res = evaluateMultilineBooleanProgram(preInput, program);
  const { programTable, callableTables } = buildMultilineTruthTables(preInput, program, res);

  assert.deepEqual(programTable.headers, ['e']);
  assert.equal(programTable.rows.length, 2);
  const activeRow = programTable.rows.find((r) => r.isActiveRow);
  assert.ok(activeRow);
  assert.deepEqual(activeRow.inputs, [true]);
  assert.equal(activeRow.outputs[1].value, 'false');

  assert.equal(callableTables.length, 1);
  assert.equal(callableTables[0].rows.length, 4);
  const allTrueRow = callableTables[0].rows.find((r) => r.inputs[0] && r.inputs[1]);
  assert.equal(allTrueRow?.outputs[0].value, 'true');
});

test('covers formal and informal logic categories with industry-standard naming tooltips and Unicode specs', () => {
  assert.ok(LOGIC_SYSTEM_CATEGORIES.length >= 8);
  assert.ok(LOGIC_SYSTEM_CATEGORIES.some((c) => c.tradition === 'formal'));
  assert.ok(LOGIC_SYSTEM_CATEGORIES.some((c) => c.tradition === 'informal'));
  for (const cat of LOGIC_SYSTEM_CATEGORIES) {
    assert.ok(cat.items.length > 0);
    for (const item of cat.items) {
      assert.ok(item.unicode.trim());
      assert.ok(item.textRepresentation.trim());
      assert.ok(item.outputEffect.trim());
    }
  }
  for (const key of ['preInput', 'programInput', 'pointerOutput', 'alignedOutput', 'postOutput', 'truthTable', 'symbolPalette']) {
    assert.ok(CALCULATOR_LABEL_CONVENTIONS[key].tooltip.length > 20);
    assert.ok(CALCULATOR_LABEL_CONVENTIONS[key].standardRef.length > 5);
  }
});

test('generates self-contained single HTML with preview synchronized with public/boolean-logic-calculator.html', () => {
  const html = generateStandaloneBooleanCalculatorHtml('e=true', 'a(b,c)=b & c\nd=false\na(e,d)');
  assert.match(html, /^<!doctype html>/i);
  assert.doesNotMatch(html, /<script\s+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet["']/i);
  assert.match(html, /evaluateProgram/);
  const disk = readFileSync(new URL('../public/boolean-logic-calculator.html', import.meta.url), 'utf8');
  assert.equal(disk, html);
});
