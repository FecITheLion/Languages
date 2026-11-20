import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  DEFAULT_CAUCHY_CONFIG,
  getLogicExportUnsupportedReason,
  type LogicExportTarget,
} from '../src/engine/logicLambdaEngine.ts';

const foreignTargets: LogicExportTarget[] = ['go', 'java', 'cpp', 'csharp', 'php'];

test('unsupported Cauchy exports are identified without throwing', () => {
  const enabled = { ...DEFAULT_CAUCHY_CONFIG, enabled: true };
  for (const target of foreignTargets) {
    assert.match(getLogicExportUnsupportedReason(target, enabled) ?? '', /Cauchy evaluation is not implemented/);
  }
  assert.equal(getLogicExportUnsupportedReason('go', DEFAULT_CAUCHY_CONFIG), null);
  assert.equal(getLogicExportUnsupportedReason('python', enabled), null);
});
