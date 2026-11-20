import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  getWorkbenchPitch,
  STANDALONE_PITCHES,
  STUDIO_HOME_PITCH,
  WORKBENCH_PITCHES,
} from '../src/data/workflowPitch.ts';
import type { WorkflowSlug } from '../src/types/studio.ts';

const workflowPages: WorkflowSlug[] = [
  'dialect',
  'rule_props',
  'logic_calc',
  'schema',
  'mutations',
  'evaluator',
  'python_ast',
  'rust_ast',
  'wasm_wabt',
  'mcp_servers',
  'payload_io',
  'gdrive',
];

test('every workbench and standalone view has concise purpose and value copy', () => {
  assert.deepEqual(Object.keys(WORKBENCH_PITCHES).sort(), workflowPages.slice().sort());
  assert.deepEqual(Object.keys(STANDALONE_PITCHES).sort(), ['api', 'graph', 'histolog', 'specs']);

  const allCopy = [
    STUDIO_HOME_PITCH,
    ...Object.values(WORKBENCH_PITCHES),
    ...Object.values(STANDALONE_PITCHES),
  ];
  for (const copy of allCopy) {
    assert.ok(copy.purpose.trim());
    assert.ok(copy.value.trim());
  }
});

test('workbench next-step copy follows the active DSL workflow order', () => {
  const pitch = getWorkbenchPitch('dialect', '1. Grammar & DAG', '2. Rule Properties');
  assert.equal(pitch.title, '1. Grammar & DAG');
  assert.match(pitch.nextStep, /Complete & Verify Step/);
  assert.match(pitch.nextStep, /continue to 2\. Rule Properties/);
});

test('studio home pitch gives a beginner an actionable first step', () => {
  assert.match(STUDIO_HOME_PITCH.nextStep, /Grammar & DAG/);
  assert.match(STUDIO_HOME_PITCH.nextStep, /load the example/i);
  assert.match(STUDIO_HOME_PITCH.nextStep, /Guided help/);
});
