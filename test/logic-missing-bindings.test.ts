import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { analyzeLabelSuggestions, evaluateLogicStatement } from '../src/engine/logicLambdaEngine.ts';

test('missing callback and arguments can be defined without guessed values', () => {
  const statement = 'offset(x, hours) > 100';
  const suggestions = analyzeLabelSuggestions(statement, []);
  assert.deepEqual(
    Object.fromEntries(suggestions.map(({ name, inferredKind }) => [name, inferredKind])),
    { offset: 'lambda', x: 'number', hours: 'number' },
  );
  const result = evaluateLogicStatement(statement, [
    { id: 'offset', name: 'offset', kind: 'lambda', value: 'λx. λhours. x + hours' },
    { id: 'x', name: 'x', kind: 'number', value: '99' },
    { id: 'hours', name: 'hours', kind: 'number', value: '2' },
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { kind: 'boolean', value: true });
});
