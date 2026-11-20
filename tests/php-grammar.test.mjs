import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { evaluateGrammarPayload, grammarToSchemaJson, parseGrammar } from '../src/engine/bidirectionalEngine.ts';
import { DIALECT_PRESETS } from '../src/data/openapiAndDsl.ts';
import { RestHateoasEngineStore } from '../src/engine/hateoasEngine.ts';
import { computeSnapshotFingerprint, diffHistologSnapshots, extractTouchedSymbols } from '../src/engine/histologEngine.ts';
import { evaluateLogicStatement, exportLogicStatement } from '../src/engine/logicLambdaEngine.ts';

test('PHP grammar parser agrees with the shared parser', () => {
  const dialect = DIALECT_PRESETS.ebnf.config;
  const cases = [
    DIALECT_PRESETS.ebnf.sampleGrammar,
    `// header
root ::= (part | 'x|y') [part] /[a-z]+/ // trailing comment
part ::= 'a\\'b' | "b c" | missing
digits ::= [0-9] | part+`,
    `root ::= 'https://example' | (item | other)
item ::= "a\\\"b"
other ::= item?`,
  ];
  const php = spawnSync('php', ['-r', `
    define('PHP_API_ENTRY', true);
    require 'api.php';
    $input = json_decode(stream_get_contents(STDIN), false, 32, JSON_THROW_ON_ERROR);
    echo json_encode(array_map(fn($text) => parse_grammar($text, $input->dialect), $input->cases), JSON_THROW_ON_ERROR);
  `], { input: JSON.stringify({ dialect, cases }), encoding: 'utf8' });
  assert.equal(php.status, 0, php.stderr);
  assert.deepEqual(JSON.parse(php.stdout), cases.map(text => parseGrammar(text, dialect)));
});

test('PHP dialect presets match the shared configurations', () => {
  const php = spawnSync('php', ['-r', `
    define('PHP_API_ENTRY', true);
    require 'api.php';
    $names = json_decode(stream_get_contents(STDIN), false, 8, JSON_THROW_ON_ERROR);
    echo json_encode(array_map('dialect_preset', $names), JSON_THROW_ON_ERROR);
  `], { input: JSON.stringify(Object.keys(DIALECT_PRESETS)), encoding: 'utf8' });
  assert.equal(php.status, 0, php.stderr);
  assert.deepEqual(JSON.parse(php.stdout), Object.values(DIALECT_PRESETS).map(preset => preset.config));
});

test('PHP grammar parser handles every built-in dialect sample', () => {
  const presets = Object.values(DIALECT_PRESETS);
  const php = spawnSync('php', ['-r', `
    define('PHP_API_ENTRY', true);
    require 'api.php';
    $presets = json_decode(stream_get_contents(STDIN), false, 32, JSON_THROW_ON_ERROR);
    echo json_encode(array_map(fn($p) => parse_grammar($p->sampleGrammar, $p->config), $presets), JSON_THROW_ON_ERROR);
  `], { input: JSON.stringify(presets), encoding: 'utf8' });
  assert.equal(php.status, 0, php.stderr);
  assert.deepEqual(JSON.parse(php.stdout), presets.map(p => parseGrammar(p.sampleGrammar, p.config)));
});

test('PHP JSON-LD generator follows live schema configuration and mutations', () => {
  const original = new RestHateoasEngineStore().workspace;
  const changed = structuredClone(original);
  changed.schemaConfig.schemaName = "Order (alpha)!' *";
  changed.schemaConfig.preset = 'softwareSource';
  changed.schemaConfig.includePotentialActions = false;
  changed.mutationPolicy.lockedRules = ['digit'];
  changed.mutations.action_verb.targetProperty = 'operation';
  changed.mutations.action_verb.patternOverride = '';
  changed.ruleConfigs.action_verb.properties = [{ name: ' priority ', value: 'high' }];
  const empty = structuredClone(original);
  empty.grammarText = '';
  const zero = structuredClone(original);
  zero.schemaConfig.schemaName = '0';
  zero.schemaConfig.schemaOrgType = '0';
  zero.mutations.digit.description = '0';
  const cases = [original, changed, empty, zero];
  const php = spawnSync('php', ['-r', `
    define('PHP_API_ENTRY', true);
    require 'api.php';
    $cases = json_decode(stream_get_contents(STDIN), false, 64, JSON_THROW_ON_ERROR);
    echo json_encode(array_map(fn($w) => grammar_schema_json(parse_grammar($w->grammarText, $w->dialect), $w), $cases), JSON_THROW_ON_ERROR);
  `], { input: JSON.stringify(cases), encoding: 'utf8' });
  assert.equal(php.status, 0, php.stderr);
  assert.deepEqual(JSON.parse(php.stdout), cases.map(w =>
    grammarToSchemaJson(parseGrammar(w.grammarText, w.dialect), w.dialect, w.schemaConfig,
      w.mutations, w.mutationPolicy, w.ruleConfigs)));
});

test('PHP grammar evaluator matches shared traces for grammar operators and mutations', () => {
  const workspace = new RestHateoasEngineStore().workspace;
  const cases = [
    { grammar: workspace.grammarText, rule: 'order_expr', payload: 'BUY SKU-402 12', mutations: workspace.mutations },
    { grammar: workspace.grammarText, rule: 'order_expr', payload: 'BUY SKU-402 12 extra', mutations: workspace.mutations },
    { grammar: workspace.grammarText, rule: 'order_expr', payload: 'oops', mutations: workspace.mutations },
    { grammar: "start ::= ('a' | 'b')+ ['c'] 'd'", rule: 'start', payload: 'abbcd', mutations: {} },
    { grammar: "start ::= &'a' 'a' !'b' [0-9]{2}", rule: 'start', payload: 'a42', mutations: {} },
    { grammar: "start ::= 'a' (?<='a') /[0-9]+/ $", rule: 'start', payload: 'a123', mutations: {} },
    { grammar: "start ::= 'éλ'", rule: 'start', payload: 'éλ', mutations: {} },
    { grammar: "start ::= [éλ]+", rule: 'start', payload: 'éλ', mutations: {} },
    { grammar: '', rule: '', payload: 'a', mutations: {} },
  ];
  const php = spawnSync('php', ['-r', `
    define('PHP_API_ENTRY', true);
    require 'api.php';
    $input = json_decode(stream_get_contents(STDIN), false, 64, JSON_THROW_ON_ERROR);
    $results = [];
    foreach ($input->cases as $c) {
      $w = clone $input->workspace;
      $w->grammarText = $c->grammar;
      $w->mutations = $c->mutations;
      $results[] = (new GrammarPayloadEvaluator(parse_grammar($c->grammar, $w->dialect), $w, $c->payload))->evaluate($c->rule);
    }
    echo json_encode($results, JSON_THROW_ON_ERROR);
  `], { input: JSON.stringify({ workspace, cases }), encoding: 'utf8' });
  assert.equal(php.status, 0, php.stderr);
  assert.deepEqual(JSON.parse(php.stdout), cases.map(c =>
    evaluateGrammarPayload(parseGrammar(c.grammar, workspace.dialect), c.rule, c.payload, c.mutations, workspace.dialect)));
});

test('PHP grammar evaluator matches Unicode literals, classes and code-point offsets', () => {
  const workspace = new RestHateoasEngineStore().workspace;
  const cases = [
    { grammar: "start ::= '🙂éλ'", payload: '🙂éλ' },
    { grammar: 'start ::= [🙂éλ]+', payload: '🙂éλ🙂' },
    { grammar: "start ::= '🙂' 'é' 'x'", payload: '🙂éx!' },
    { grammar: "start ::= 'ø' | '🦊'", payload: '🦊' },
  ];
  const php = spawnSync('php', ['-r', `
    define('PHP_API_ENTRY', true);
    require 'api.php';
    $input = json_decode(stream_get_contents(STDIN), false, 32, JSON_THROW_ON_ERROR);
    $out = [];
    foreach ($input->cases as $c) {
      $w = $input->workspace;
      $rules = parse_grammar($c->grammar, $w->dialect);
      $out[] = (new GrammarPayloadEvaluator($rules, $w, $c->payload))->evaluate('start');
    }
    echo json_encode($out, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
  `], { input: JSON.stringify({ workspace, cases }), encoding: 'utf8' });
  assert.equal(php.status, 0, php.stderr);
  const results = JSON.parse(php.stdout);
  assert.equal(results[0].matched, true);
  assert.equal(results[0].consumedLength, 3);
  assert.deepEqual(results[1].trace.find(step => step.rule === 'start').consumed, '🙂éλ🙂');
  assert.equal(results[2].consumedLength, 3);
  assert.equal(results[2].remaining, '!');
  assert.equal(results[3].matched, true);
});

test('PHP workspace code generation matches dynamic shared exports', () => {
  const store = new RestHateoasEngineStore();
  const original = structuredClone(store.workspace);
  const changed = structuredClone(original);
  changed.schemaConfig.schemaName = 'Sample schema';
  changed.mutationPolicy.allowImportMutation = false;
  changed.mutations.action_verb.targetProperty = 'actionKind';
  changed.ruleConfigs.action_verb.properties = [{ name: 'priority', value: 'high' }];
  const empty = structuredClone(original);
  empty.grammarText = '';
  const cases = [original, changed, empty];
  const php = spawnSync('php', ['-r', `
    define('PHP_API_ENTRY', true);
    require 'api.php';
    $cases = json_decode(stream_get_contents(STDIN), false, 64, JSON_THROW_ON_ERROR);
    $results = [];
    foreach ($cases as $w) {
      $rules = parse_grammar($w->grammarText, $w->dialect);
      usort($rules, fn($a, $b) => (($w->ruleConfigs->{$a['name']}->precedence ?? $a['lineNumber']) <=> ($w->ruleConfigs->{$b['name']}->precedence ?? $b['lineNumber'])) ?: ($a['lineNumber'] <=> $b['lineNumber']));
      $results[] = [workspace_python_source($rules, $w), workspace_rust_source($rules, $w), workspace_wat_source($rules, $w)];
    }
    echo json_encode($results, JSON_THROW_ON_ERROR);
  `], { input: JSON.stringify(cases), encoding: 'utf8' });
  assert.equal(php.status, 0, php.stderr);
  const expected = cases.map(w => {
    store.workspace = w;
    return ['python', 'rust', 'wat'].map(lang => store.exportWorkspace(lang).content);
  });
  assert.deepEqual(JSON.parse(php.stdout), expected);
});

test('PHP history snapshots, fingerprints and diffs agree with the shared engine', () => {
    const store = new RestHateoasEngineStore();
    const original = store.buildSnapshotState();
    store.workspace.grammarText += "\nextra ::= 'x' | digit";
    store.workspace.logicStatement = 'value + 1';
    store.workspace.logicLabels = [{ id: 'emoji', name: 'value', kind: 'number', value: '2' }];
    store.workspace.dslSource += '\n# emoji 😀';
    const changed = store.buildSnapshotState();
    const state = {
      statement: store.workspace.logicStatement, labels: store.workspace.logicLabels,
      cauchyConfig: store.workspace.cauchyConfig, callbacks: store.callbacks,
      activeWorkspace: JSON.stringify(store.workspace),
    };
    const php = spawnSync('php', ['-r', `
      define('PHP_API_ENTRY', true);
      require 'api.php';
      $input = json_decode(stream_get_contents(STDIN), false, 64, JSON_THROW_ON_ERROR);
      $snapshot = history_snapshot((array)$input->state);
      echo json_encode(['snapshot'=>$snapshot, 'fingerprint'=>history_fingerprint($snapshot),
        'diff'=>history_diff($input->original, $snapshot), 'symbols'=>history_symbols($input->original, $snapshot)], JSON_THROW_ON_ERROR);
    `], { input: JSON.stringify({ state, original }), encoding: 'utf8' });
    assert.equal(php.status, 0, php.stderr);
    const result = JSON.parse(php.stdout);
    assert.deepEqual(result.snapshot, changed);
    assert.equal(result.fingerprint, computeSnapshotFingerprint(changed));
    assert.deepEqual(result.diff, diffHistologSnapshots(original, changed));
    assert.deepEqual(result.symbols, extractTouchedSymbols(original, changed));
});

test('PHP workspace language templates match shared exporters', () => {
  const store = new RestHateoasEngineStore();
  store.workspace.ruleConfigs.action_verb.properties = [
    { id: '1', name: 'priority', value: 'high' }, { id: '2', name: 'quote', value: "a'b" },
  ];
  const languages = ['javascript', 'typescript', 'go', 'java', 'cpp', 'csharp', 'php', 'sql',
    'swift', 'kotlin', 'ruby', 'scala', 'haskell', 'elixir', 'lua', 'zig', 'dart', 'ocaml'];
  const php = spawnSync('php', ['-r', `
    define('PHP_API_ENTRY', true);
    require 'api.php';
    $input = json_decode(stream_get_contents(STDIN), false, 64, JSON_THROW_ON_ERROR);
    $w = $input->workspace;
    $rules = parse_grammar($w->grammarText, $w->dialect);
    usort($rules, fn($a, $b) => (($w->ruleConfigs->{$a['name']}->precedence ?? $a['lineNumber']) <=> ($w->ruleConfigs->{$b['name']}->precedence ?? $b['lineNumber'])) ?: ($a['lineNumber'] <=> $b['lineNumber']));
    $results = [];
    foreach ($input->languages as $language) $results[] = workspace_other_export($language, $rules, $w, 'OrderActionGrammar');
    echo json_encode($results, JSON_THROW_ON_ERROR);
  `], { input: JSON.stringify({ workspace: store.workspace, languages }), encoding: 'utf8' });
  assert.equal(php.status, 0, php.stderr);
  const actual = JSON.parse(php.stdout);
  for (let i = 0; i < languages.length; i++) assert.deepEqual(actual[i], store.exportWorkspace(languages[i]), languages[i]);
});

test('PHP JSON-LD logic export matches the shared exporter', () => {
  const store = new RestHateoasEngineStore();
  store.workspace.cauchyConfig.enabled = false;
  const statement = 'price > 20';
  const labels = [{ id: 'price', name: 'price', kind: 'number', value: '45' }];
  const input = {
    statement, labels, cauchyConfig: store.workspace.cauchyConfig,
    workspace: store.workspace,
  };
  const php = spawnSync('php', ['-r', `
    define('PHP_API_ENTRY', true);
    require 'api.php';
    $input = json_decode(stream_get_contents(STDIN), true, 64, JSON_THROW_ON_ERROR);
    $state = ['statement'=>$input['statement'], 'labels'=>$input['labels'], 'cauchyConfig'=>$input['cauchyConfig']];
    $result = logic_export_target($state, 'jsonld');
    echo $result['content'];
  `], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(php.status, 0, php.stderr);
  const expected = exportLogicStatement('jsonld', statement, labels,
    evaluateLogicStatement(statement, labels), store.workspace.cauchyConfig, {
      grammarText: store.workspace.grammarText,
      rules: parseGrammar(store.workspace.grammarText, store.workspace.dialect),
      dialect: store.workspace.dialect,
      sampleInput: store.workspace.evalPayload,
    });
  assert.deepEqual(JSON.parse(php.stdout), JSON.parse(expected.content));
});
