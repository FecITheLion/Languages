import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLogicEvaluationInput } from '../src/engine/logicInputNormalizer.ts';
import { DEFAULT_DSL_SOURCE, OPENAPI_SPEC, parseDslFlows } from '../src/data/openapiAndDsl.ts';
import type { LogicLabelBinding } from '../src/engine/logicLambdaEngine.ts';

const configuredLabels: LogicLabelBinding[] = [
  { id: 'a', name: 'left', kind: 'number', value: '2' },
  { id: 'b', name: 'right', kind: 'number', value: '3' },
  { id: 'd', name: 'enabled', kind: 'boolean', value: 'false' },
  { id: 'c', name: 'predicate', kind: 'lambda', value: 'λx. x > 0' },
];
const defaults = { statement: 'left + right', labels: configuredLabels };

function normalize(input?: unknown, configuredDefaults = defaults) {
  return normalizeLogicEvaluationInput(input, configuredDefaults);
}

test('omitted and empty input use configured statement and labels', () => {
  const omitted = normalize();
  const emptyObject = normalize({});
  const emptyString = normalize('');
  const emptyLabels = normalize({ logic_labels: '' });
  const emptyArray = normalize({ logic_labels: [] });
  const emptyInputArray = normalize([]);
  assert.deepEqual(omitted.ok && omitted.input, defaults);
  assert.deepEqual(emptyObject.ok && emptyObject.input, defaults);
  assert.deepEqual(emptyString.ok && emptyString.input, defaults);
  assert.deepEqual(emptyLabels.ok && emptyLabels.input, defaults);
  assert.deepEqual(emptyArray.ok && emptyArray.input, defaults);
  assert.deepEqual(emptyInputArray.ok && emptyInputArray.input, defaults);
});

test('accepts a single statement string and a statement/label string pair', () => {
  const statementOnly = normalize('left * right');
  assert.equal(statementOnly.ok && statementOnly.input.statement, 'left * right');

  const pair = normalize(['left + right', '10, 20']);
  assert.equal(pair.ok, true);
  if (pair.ok) assert.deepEqual(pair.input.labels.slice(0, 2).map((label) => label.value), ['10', '20']);

  const numericStrings = normalize(['1', '2']);
  assert.equal(numericStrings.ok, true);
  if (numericStrings.ok) {
    assert.equal(numericStrings.input.statement, defaults.statement);
    assert.deepEqual(numericStrings.input.labels.slice(0, 2).map((label) => label.value), ['1', '2']);
  }
});

test('recognizes known name=value text as labels while named fields remain explicit statements', () => {
  const scopedDefaults = {
    statement: 'x + 1',
    labels: [{ id: 'x', name: 'x', kind: 'number' as const, value: '2' }],
  };
  const inputLabel = normalize('x=3', scopedDefaults);
  const explicitStatement = normalize({ logic_statement: 'x=3' }, scopedDefaults);
  assert.equal(inputLabel.ok && inputLabel.input.statement, scopedDefaults.statement);
  assert.equal(inputLabel.ok && inputLabel.input.labels[0].value, '3');
  assert.equal(explicitStatement.ok && explicitStatement.input.statement, 'x=3');
});

test('named string inputs bind positional literals without changing lambda labels', () => {
  const result = normalize({ logic_statement: 'left - right', logic_labels: '7 4' });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.input.statement, 'left - right');
    assert.deepEqual(result.input.labels.map((label) => label.value), ['7', '4', 'false', 'λx. x > 0']);
  }
});

test('named label text accepts explicit assignments and JSON objects', () => {
  const named = normalize({ logic_labels: 'right=9' });
  const json = normalize({ logic_labels: '{"left": 8}' });
  const newLabel = normalize({ logic_labels: 'newValue=12' });
  assert.equal(named.ok && named.input.labels[1].value, '9');
  assert.equal(json.ok && json.input.labels[0].value, '8');
  assert.equal(newLabel.ok && newLabel.input.labels.at(-1)?.name, 'newValue');
  assert.equal(newLabel.ok && newLabel.input.labels.at(-1)?.kind, 'number');
});

test('accepts literal arrays and maps them to configured non-lambda labels', () => {
  const topLevel = normalize([7, 8, true]);
  const namedField = normalize({ logic_labels: [9, 10, false] });
  assert.equal(topLevel.ok, true);
  assert.equal(namedField.ok, true);
  if (topLevel.ok) {
    assert.deepEqual(
      topLevel.input.labels.filter((label) => label.kind !== 'lambda').map((label) => label.value),
      ['7', '8', 'true']
    );
  }
  if (namedField.ok) {
    assert.deepEqual(
      namedField.input.labels.filter((label) => label.kind !== 'lambda').map((label) => label.value),
      ['9', '10', 'false']
    );
  }
});

test('excess positional values use their _# positions and reject collisions', () => {
  const empty = normalize([4, 5], { statement: '_1 + _2', labels: [] });
  assert.deepEqual(empty.ok && empty.input.labels.map(({ name, value }) => [name, value]), [['_1', '4'], ['_2', '5']]);
  const extra = normalize([7, 8, true, 9]);
  assert.equal(extra.ok && extra.input.labels.at(-1)?.name, '_4');
  const conflict = normalize([7, 8], {
    statement: '_2', labels: [
      { id: 'a', name: 'left', kind: 'number', value: '1' },
      { id: 'b', name: '_2', kind: 'lambda', value: 'λx. x' },
    ],
  });
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.match(conflict.error, /fallback '_2' conflicts/);
});

test('accepts combined JSON strings and creates typed bindings including lambda callbacks', () => {
  const payload = JSON.stringify({
      logic_statement: 'offset(x, hours) > 100',
      logic_labels: JSON.stringify({
        offset: { kind: 'lambda', value: 'λx. λhours. x + hours' },
        x: 99,
        hours: 2,
      }),
    });
  const combined = normalize(payload, { statement: 'left + right', labels: [] });
  const encodedCombined = normalize(JSON.stringify(payload), { statement: 'left + right', labels: [] });
  assert.equal(combined.ok, true);
  assert.equal(encodedCombined.ok, true);
  if (combined.ok) {
    assert.deepEqual(combined.input.labels.map(({ name, kind, value }) => ({ name, kind, value })), [
      { name: 'offset', kind: 'lambda', value: 'λx. λhours. x + hours' },
      { name: 'x', kind: 'number', value: '99' },
      { name: 'hours', kind: 'number', value: '2' },
    ]);
  }
});

test('retains the legacy statement and full label-binding array contract', () => {
  const override = configuredLabels.map((label) => ({
    ...label,
    value:
      label.kind === 'lambda'
        ? 'λx. x'
        : label.kind === 'boolean'
          ? 'true || false'
          : label.name === 'left'
            ? 'left + 1'
            : '11',
  }));
  const result = normalize({ statement: 'left', labels: override });
  assert.equal(result.ok && result.input.statement, 'left');
  assert.deepEqual(result.ok && result.input.labels, override);
});

test('rejects missing statements, malformed pairs, and ambiguous fields', () => {
  assert.equal(normalizeLogicEvaluationInput(undefined, { statement: '', labels: configuredLabels }).ok, false);
  assert.equal(normalize({ statement: '   ' }).ok, true);
  assert.equal(normalize(['only one']).ok, false);
  assert.equal(normalize({ statement: 'left', logic_statement: 'right' }).ok, false);
  assert.equal(normalize({ labels: configuredLabels, logic_labels: '1' }).ok, false);
});

test('validates names, literal kinds, lambda forms, and positional arity', () => {
  assert.equal(normalize({ logic_labels: 'unknown=1' }).ok, true);
  const newOne = normalize({ logic_labels: 'newOne=1' }, { statement: 'newOne', labels: [] });
  assert.equal(newOne.ok && newOne.input.labels[0].kind, 'number');
  assert.equal(normalize({ logic_labels: 'predicate=1' }).ok, false);
  assert.equal(normalize({ logic_labels: '1 2 3' }).ok, false);
  assert.equal(normalize({ logic_labels: '"unfinished' }).ok, false);
  assert.equal(normalize({ unexpected: 'value' }).ok, false);
  assert.equal(normalize({ logic_labels: { newCallback: { kind: 'lambda', value: 'not lambda' } } }).ok, false);
  assert.equal(normalize({ logic_labels: { newCallback: { kind: 'unknown', value: 'λx. x' } } }).ok, false);
  assert.equal(normalize(null).ok, true);
});

test('documents the implemented REST input contract in OpenAPI and DSL', () => {
  const operation = OPENAPI_SPEC.paths['/api/logic/evaluate'].post;
  assert.equal(operation.operationId, 'evaluateLogic');
  assert.equal(operation.requestBody?.required, false);
  assert.ok(operation.requestBody?.content['text/plain']);
  assert.ok(operation.responses['400']);
  const responseSchema = operation.responses['200'].content?.['application/hal+json'].schema as {
    properties?: Record<string, unknown>;
  };
  const traceSchema = responseSchema.properties?.trace as {
    items: { properties: Record<string, unknown> };
  };
  assert.deepEqual(
    Object.keys(traceSchema.items.properties),
    ['step', 'kind', 'expression', 'result']
  );
  assert.match(
    JSON.stringify(operation.requestBody?.content['application/json'].schema),
    /numeric\/boolean literals, which are positional values/
  );
  assert.match(DEFAULT_DSL_SOURCE, /POST \/api\/logic\/evaluate/);
  assert.equal(parseDslFlows(DEFAULT_DSL_SOURCE).flows.length, 12);
});
