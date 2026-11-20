import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GUIDED_HELP_CONTEXTS, GUIDED_HELP_TOURS, getGuidedHelpTour } from '../src/components/guidedHelpContent.ts';

test('guided help includes a complete three-step tour for every workbench and Studio view', () => {
  assert.equal(new Set(GUIDED_HELP_CONTEXTS).size, GUIDED_HELP_CONTEXTS.length);
  const targets = new Set<string>();
  for (const context of GUIDED_HELP_CONTEXTS) {
    const content = GUIDED_HELP_TOURS[context];
    assert.ok(content, `missing tour for ${context}`);
    assert.equal(content.steps.length, 3, `${context} should have three steps`);
    assert.ok(content.title.trim());
    assert.ok(content.summary.trim());
    for (const entry of content.steps) {
      assert.ok(entry.title.trim(), `${context} step title`);
      assert.ok(entry.description.trim(), `${context} step description`);
      assert.ok(entry.target.startsWith('home.') || entry.target.startsWith('workbench.') || entry.target.startsWith('view.'));
      assert.ok(entry.diagram.every((label) => label.trim()), `${context} image diagram labels`);
      assert.ok(!targets.has(entry.target), `duplicate live-tour target: ${entry.target}`);
      targets.add(entry.target);
    }
  }
});

test('unknown or absent context falls back to the Studio home tour', () => {
  assert.equal(getGuidedHelpTour(undefined), GUIDED_HELP_TOURS.home);
  assert.equal(getGuidedHelpTour('unknown'), GUIDED_HELP_TOURS.home);
  assert.equal(getGuidedHelpTour('dialect'), GUIDED_HELP_TOURS.dialect);
});

test('the available tours cover all workbench workflow slugs', () => {
  const workbenches = [
    'dialect',
    'rule_props',
    'logic_calc',
    'schema',
    'mutations',
    'evaluator',
    'payload_io',
    'gdrive',
    'python_ast',
    'rust_ast',
    'wasm_wabt',
    'mcp_servers',
  ];
  for (const workbench of workbenches) {
    assert.ok(GUIDED_HELP_CONTEXTS.includes(workbench as (typeof GUIDED_HELP_CONTEXTS)[number]));
  }
});

test('every guided-tour target is attached to an application control or region', () => {
  const sourceFiles = [
    '../src/App.tsx',
    '../src/components/ApiStudioWorkbench.tsx',
    '../src/components/HistologWorkbench.tsx',
    '../src/components/InspectorViews.tsx',
    '../src/components/LogicLambdaWorkbench.tsx',
    '../src/components/McpServersWorkbench.tsx',
    '../src/components/PipelineGrid.tsx',
    '../src/components/RuleDependencyGraph.tsx',
    '../src/components/RulePropertiesWorkbench.tsx',
    '../src/components/StepViews.tsx',
    '../src/components/VirtualFilesWorkbench.tsx',
  ];
  const source = sourceFiles
    .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
    .join('\n');

  for (const context of GUIDED_HELP_CONTEXTS) {
    for (const tourStep of GUIDED_HELP_TOURS[context].steps) {
      assert.ok(
        source.includes(`data-tour-id="${tourStep.target}"`) ||
          source.includes(`'${tourStep.target}'`) ||
          source.includes(tourStep.target),
        `missing application anchor for ${context}: ${tourStep.target}`
      );
    }
  }
});
