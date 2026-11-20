import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, cpSync, readFileSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import vm from 'node:vm';
import { LOGIC_CALCULATOR_PRESETS, DEFAULT_CAUCHY_CONFIG, evaluateLogicStatement, evaluateCauchySequence, getLogicBindingDiagnostics } from '../src/engine/logicLambdaEngine.ts';
import { normalizeLogicEvaluationInput, logicInputDiagnostic } from '../src/engine/logicInputNormalizer.ts';
import { SUPPORTED_LANGUAGES } from '../src/types/studio.ts';
import { RestHateoasEngineStore } from '../src/engine/hateoasEngine.ts';
import { McpLazyServerRegistry } from '../src/engine/mcpServerEngine.ts';

const project = process.cwd();
const php = (...args) => spawnSync('php', args, { encoding: 'utf8' });

test('installer validates build, base and empty target; PHP routes SPA and rejects API', async () => {
  const work = mkdtempSync(`${project}/tests/.pwa-check-`);
  const source = `${work}/source`, target = `${work}/target`, state = `${work}/state`;
  let server;
  try {
    mkdirSync(`${source}/dist/assets`, { recursive: true });
    mkdirSync(target);
    mkdirSync(state, { mode: 0o700 });
    for (const file of ['index.php', 'install.php', 'api.php', 'slug_controller.php']) copyFileSync(`${project}/${file}`, `${source}/${file}`);
    cpSync(`${project}/public`, `${source}/dist`, { recursive: true });
    writeFileSync(`${source}/dist/index.html`, '<!doctype html><script type="module" src="/studio/assets/app-abcdefgh.js"></script>');
    writeFileSync(`${source}/dist/assets/app-abcdefgh.js`, '/* fixture */');
    assert.notEqual(php(`${source}/install.php`, target, '/wrong/').status, 0);
    assert.notEqual(php(`${source}/install.php`, target, '/../').status, 0);
    assert.equal(php(`${source}/install.php`, target, '/studio/').status, 0);
    assert.equal(php(`${source}/install.php`, target, '/studio/').status, 0);
    assert.match(readFileSync(`${target}/.htaccess`, 'utf8'), /RewriteRule \^\(\[a-z0-9\]\[a-z0-9-\]\*\)\/\?\$ index\.php\?slug=\$1/);
    const rewriteRules = readFileSync(`${target}/.htaccess`, 'utf8');
    assert.match(rewriteRules, /RewriteRule \^nodes\/\(\[\^\/\]\+\)\/\(\[\^\/\]\+\)\/members\/\(\[\^\/\]\+\)\/\?\$ index\.php\?slug=nodes/);
    assert.match(rewriteRules, /RewriteRule \^members\/\(\[\^\/\]\+\)\/\?\$ index\.php\?slug=members/);
    assert.match(rewriteRules, /RewriteRule \^template\/\(\[\^\/\]\+\)\/\(\[\^\/\]\+\)\/\?\$ index\.php\?template_route=/);
    writeFileSync(`${target}/assets/app-abcdefgh.js`, 'modified installation');
    assert.notEqual(php(`${source}/install.php`, target, '/studio/').status, 0);
    assert.equal(readFileSync(`${target}/assets/app-abcdefgh.js`, 'utf8'), 'modified installation');
    copyFileSync(`${source}/dist/assets/app-abcdefgh.js`, `${target}/assets/app-abcdefgh.js`);
    const port = await new Promise((resolve, reject) => {
      const listener = createServer();
      listener.on('error', reject);
      listener.listen(0, '127.0.0.1', () => { const p = listener.address().port; listener.close(() => resolve(p)); });
    });
    server = spawn('php', ['-S', `127.0.0.1:${port}`, `${target}/index.php`], {
      cwd: target, stdio: 'ignore', env: { ...process.env, GRAMMAR2JSON_STATE_DIR: state },
    });
    const root = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) {
      try { await fetch(`${root}/studio/`); break; } catch (error) { if (i === 50) throw error; await new Promise(r => setTimeout(r, 20)); }
    }
    let response = await fetch(`${root}/studio/deep/link`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /app-abcdefgh/);
    response = await fetch(`${root}/studio/?slug=help`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Guided help/);
    response = await fetch(`${root}/studio/?slug=unknown`);
    assert.equal(response.status, 404);
    response = await fetch(`${root}/studio/?slug=nodes/rule/quantity/members/expression`, { redirect: 'manual' });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), '/api/nodes/rule/quantity/members/expression');
    response = await fetch(`${root}/studio/?slug=members/expression&node=rule%2Fquantity`, { redirect: 'manual' });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), '/api/nodes/rule/quantity/members/expression');
    response = await fetch(`${root}/studio/?slug=members/expression`, { redirect: 'manual' });
    assert.equal(response.status, 400);
    response = await fetch(`${root}/studio/?template=unknown`);
    assert.equal(response.status, 400);
    response = await fetch(`${root}/studio/assets/app-abcdefgh.js`);
    assert.match(response.headers.get('content-type'), /javascript/);
    response = await fetch(`${root}/studio/api/evaluate`, { method: 'POST' });
    assert.equal(response.status, 200);
    const { _links: evalLinks, ...defaultEvaluation } = await response.json();
    assert.deepEqual(defaultEvaluation, new RestHateoasEngineStore().evaluatePayload());
    response = await fetch(`${root}/studio/api/evaluate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule: 'digit', payload: '123x' }),
    });
    const { _links: digitLinks, ...digitEvaluation } = await response.json();
    assert.deepEqual(digitEvaluation, new RestHateoasEngineStore().evaluatePayload('digit', '123x'));
    response = await fetch(`${root}/studio/api/evaluate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: '日本語' }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).matched, false);
    response = await fetch(`${root}/studio/api/rules`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const nodeStore = new RestHateoasEngineStore();
    const graph = nodeStore.getGraph();
    const phpRules = (await response.json())._embedded.rules.map(({ _links, ...rule }) => rule);
    const nodeRules = nodeStore.getRules().map(rule => ({
      ...rule, usedOperators: graph.nodes.find(node => node.name === rule.name)?.usedOperators || [],
      config: nodeStore.workspace.ruleConfigs[rule.name] || null,
      mutation: nodeStore.workspace.mutations[rule.name] || null,
    }));
    assert.deepEqual(phpRules, nodeRules);
    response = await fetch(`${root}/studio/api/rules`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'scratch', expression: "scratch | digit+ | 'scratch'" }),
    });
    assert.equal(response.status, 201);
    const createdRule = nodeStore.createRule('scratch', "scratch | digit+ | 'scratch'");
    assert.equal((await response.json()).grammarText, createdRule.grammar);
    response = await fetch(`${root}/studio/api/histolog`);
    const historyAfterCreate = await response.json();
    assert.equal(historyAfterCreate.index.totalGenerations, 2);
    assert.deepEqual(historyAfterCreate._embedded.generations.map(({ fingerprint, changedFields, touchedSymbols, additions, deletions }) =>
      ({ fingerprint, changedFields, touchedSymbols, additions, deletions })),
    nodeStore.histolog.map(({ fingerprint, changedFields, touchedSymbols, additions, deletions }) =>
      ({ fingerprint, changedFields, touchedSymbols, additions, deletions })));
    response = await fetch(`${root}/studio/api/rules/scratch`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'renamed' }),
    });
    assert.equal(response.status, 200);
    const updatedRule = nodeStore.updateRule('scratch', { name: 'renamed' });
    assert.equal((await response.json()).grammarText, updatedRule.grammar);
    response = await fetch(`${root}/studio/api/rules/renamed`);
    const renamedRule = await response.json();
    assert.deepEqual(renamedRule.referencedRules, ['renamed', 'digit']);
    assert.equal(renamedRule.members.expression.value, "renamed | digit+ | 'scratch'");
    response = await fetch(`${root}/studio/api/nodes?kind=rule`);
    const ruleNodes = await response.json();
    assert.equal(ruleNodes.count, 6);
    assert(ruleNodes._embedded.nodes.some(node => node.id === 'renamed'));
    response = await fetch(`${root}/studio/api/nodes`);
    assert.equal(response.status, 200);
    assert((await response.json()).kinds.includes('histolog'));
    response = await fetch(`${root}/studio/api/nodes/rule/renamed/members/locked`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"value":true}',
    });
    assert.equal(response.status, 200);
    response = await fetch(`${root}/studio/api/nodes/rule/renamed/members/expression`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"value":"digit"}',
    });
    assert.equal(response.status, 423);
    response = await fetch(`${root}/studio/api/nodes/rule/renamed/members/locked`, { method: 'DELETE' });
    assert.equal(response.status, 200);
    response = await fetch(`${root}/studio/api/nodes/rule/renamed/members/name`, { method: 'DELETE' });
    assert.equal(response.status, 405);
    response = await fetch(`${root}/studio/api/nodes/rule/renamed/members/precedence`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"value":4}',
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).member.value, 4);
    nodeStore.mutateNodeMember('rule', 'renamed', 'precedence', 'update', 4);
    response = await fetch(`${root}/studio/api/export/grammar`);
    const { language: grammarLanguage, _links: grammarLinks, ...grammarExport } = await response.json();
    assert.equal(grammarLanguage, 'grammar');
    assert.deepEqual(grammarExport, nodeStore.exportWorkspace('grammar'));
    response = await fetch(`${root}/studio/api/export/jsonld`);
    const { language: jsonldLanguage, _links: jsonldLinks, ...jsonldExport } = await response.json();
    assert.equal(jsonldLanguage, 'jsonld');
    assert.deepEqual(jsonldExport, nodeStore.exportWorkspace('jsonld'));
    for (const language of SUPPORTED_LANGUAGES.map(item => item.exportId).filter(id => id !== 'jsonld')) {
      response = await fetch(`${root}/studio/api/export/${language}`);
      const { language: actualLanguage, _links, ...exported } = await response.json();
      assert.equal(actualLanguage, language);
      assert.deepEqual(exported, nodeStore.exportWorkspace(language));
    }
    response = await fetch(`${root}/studio/api/nodes/dialect/active/members/preset`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"value":"peg"}',
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).member.value, 'peg');
    response = await fetch(`${root}/studio/api/nodes/dialect/active/members/preset`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"value":"ebnf"}',
    });
    assert.equal(response.status, 200);
    response = await fetch(`${root}/studio/api/rules`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"digit","expression":"x"}',
    });
    assert.equal(response.status, 400);
    response = await fetch(`${root}/studio/api/symbols`);
    const phpSymbols = (await response.json())._embedded.symbols.map(({ _links, ...symbol }) => symbol);
    assert.deepEqual(phpSymbols, nodeStore.getGraph().symbolRegistry);
    response = await fetch(`${root}/studio/api/symbols/oneOrMore`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"value":"#"}',
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).member.value, '#');
    assert.equal(nodeStore.mutateNodeMember('symbol', 'oneOrMore', 'value', 'update', '#').status, 200);
    response = await fetch(`${root}/studio/api/nodes/symbol/oneOrMore/members/value`);
    assert.equal((await response.json()).value, '#');
    response = await fetch(`${root}/studio/api/symbols/missing`);
    assert.equal(response.status, 404);
    response = await fetch(`${root}/studio/healthz`);
    assert.deepEqual(await response.json(), { ok: true, service: 'grammar2json-studio' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    response = await fetch(`${root}/studio/api`);
    const discovery = await response.json();
    assert.equal(discovery.partial, true);
    assert.equal(discovery._links.languages.href, `${root}/studio/api/languages`);
    assert.equal(discovery._links.workspaces.href, `${root}/studio/api/workspaces`);
    response = await fetch(`${root}/studio/api/workspaces/default`);
    const { _links: defaultLinks, updatedAt: defaultTimestamp, ...phpDefault } = await response.json();
    const { updatedAt: nodeTimestamp, ...nodeDefault } = nodeStore.workspace;
    assert.deepEqual(phpDefault, nodeDefault);
    response = await fetch(`${root}/studio/api/workspaces/default`);
    assert.equal((await response.json()).updatedAt, defaultTimestamp);
    response = await fetch(`${root}/studio/api/workspaces`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'my workspace', name: 'Example', grammarText: 'custom ::= "x"', extra: {} }),
    });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('location'), `${root}/studio/api/workspaces/my%20workspace`);
    assert.equal((await response.json()).workspace.grammarText, 'custom ::= "x"');
    response = await fetch(`${root}/studio/api/workspaces`);
    assert.equal((await response.json()).count, 2);
    response = await fetch(`${root}/studio/api/workspaces`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"id":"second","name":""}',
    });
    assert.equal((await response.json()).workspace.name, 'second');
    response = await fetch(`${root}/studio/api/workspaces`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'my workspace', name: 'Updated', grammarText: 'custom ::= "x"', extra: {} }),
    });
    assert.equal(response.status, 201);
    response = await fetch(`${root}/studio/api/workspaces`);
    assert.deepEqual((await response.json())._embedded.workspaces.map(workspace => workspace.id), ['default', 'my workspace', 'second']);
    response = await fetch(`${root}/studio/api/workspaces/second`, { method: 'DELETE' });
    assert.equal(response.status, 200);
    for (const id of ['bad/id', '..', '%', 'bad\\id']) {
      response = await fetch(`${root}/studio/api/workspaces`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      });
      assert.equal(response.status, 400);
    }
    response = await fetch(`${root}/studio/api/workspaces`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"id":"bad","dialect":null}',
    });
    assert.equal(response.status, 400);
    response = await fetch(`${root}/studio/api/workspaces`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
    const mcpCall = (route, body) => fetch(`${root}/studio/${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    response = await fetch(`${root}/studio/api/mcp/logic_calc`);
    assert.equal(response.status, 503);
    response = await mcpCall('api/mcp/logic_calc', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    assert.deepEqual((await response.json()).result.tools.map(tool => tool.name), ['evaluate_logic_lambda']);
    response = await mcpCall('api/mcp/logic_calc', { jsonrpc: '2.0', id: 1, method: 'resources/list' });
    const resource = (await response.json()).result.resources[0];
    assert.equal(resource.uri, 'grammar2json://logic_calc/artifact');
    response = await mcpCall('api/mcp/logic_calc', { jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: resource.uri } });
    const artifact = JSON.parse((await response.json()).result.contents[0].text);
    response = await fetch(`${root}/studio/api/logic`);
    const liveLogic = await response.json();
    assert.equal(artifact.statement, liveLogic.statement);
    assert.deepEqual(artifact.labels, liveLogic.labels);
    response = await fetch(`${root}/studio/api/logic/export/jsonld`);
    const { language: logicLanguage, _links: logicLinks, ...logicExport } = await response.json();
    assert.equal(response.status, 200);
    assert.equal(logicLanguage, 'jsonld');
    assert.equal(JSON.parse(logicExport.content)['@type'], 'MathSolver');
    response = await fetch(`${root}/studio/api/logic/export/notarealtarget`);
    assert.equal(response.status, 404);
    response = await fetch(`${root}/studio/api/logic/export/php`);
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, 'unsupported_cauchy_export');
    response = await mcpCall('api/mcp/logic_calc', { jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: 'grammar2json://logic_calc/missing' } });
    assert.equal((await response.json()).error.code, -32002);
    const registry = new McpLazyServerRegistry();
    for (const args of [
      { logic_statement: 'offset(x, hours) > 100' },
      { logic_statement: 'offset(x, hours) > 100', logic_labels: JSON.stringify({ offset: { kind: 'lambda', value: 'λx. λhours. x + hours' }, x: 99, hours: 2 }) },
      { logic_statement: 'p and q', logic_labels: JSON.stringify({ p: true, q: false }) },
      { statement: 'x', logic_statement: 'hours' },
    ]) {
      const request = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'evaluate_logic_lambda', arguments: args } };
      response = await mcpCall('api/mcp/logic_calc', request);
      assert.equal(response.status, 200);
      const actual = (await response.json()).result;
      const expected = (await registry.handleJsonRpc('logic_calc', request)).result;
      assert.equal(actual.isError, expected.isError);
      assert.equal(actual.structuredContent.ok, expected.structuredContent.ok);
      assert.equal(actual.structuredContent.displayValue, expected.structuredContent.displayValue);
      assert.deepEqual(actual.structuredContent.diagnostics, expected.structuredContent.diagnostics);
      if (expected.structuredContent.ok) assert.deepEqual(actual.structuredContent.truthTable, expected.structuredContent.truthTable);
    }
    response = await mcpCall('api/mcp', { jsonrpc: '2.0', id: 3, method: 'tools/list' });
    assert.deepEqual((await response.json()).result.tools.map(tool => tool.name), ['logic_calc__evaluate_logic_lambda']);
    response = await mcpCall('api/mcp', { jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'logic_calc__evaluate_logic_lambda', arguments: { logic_statement: '1 + 2' } } });
    assert.equal((await response.json()).result.structuredContent.displayValue, '3');
    response = await mcpCall('api/mcp', { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'logic_calc__unported', arguments: {} } });
    assert.equal((await response.json()).error.code, -32601);
    response = await mcpCall('api/mcp/logic_calc', { jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'evaluate_logic_lambda', arguments: { statement: '1 @ 2' } } });
    assert.equal((await response.json()).result.isError, true);
    response = await mcpCall('api/mcp', { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'logic_calc__evaluate_logic_lambda', arguments: [] } });
    assert.equal((await response.json()).error.code, -32602);
    response = await mcpCall('api/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.equal(response.status, 202);
    assert.equal(await response.text(), '');
    response = await fetch(`${root}/studio/api/languages`);
    const languages = await response.json();
    assert.equal(languages.count, SUPPORTED_LANGUAGES.length);
    assert.deepEqual(languages.languages.map(({ _links, ...language }) => language), SUPPORTED_LANGUAGES);
    assert(languages.languages.every(language => language._links.exportLogic.available === (language.exportId === 'jsonld') &&
      language._links.exportWorkspace.available === true));
    response = await fetch(`${root}/studio/api`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
    response = await fetch(`${root}/studio/api/templates`);
    assert.deepEqual((await response.json()).templates, ['studio', 'compact']);
    response = await fetch(`${root}/studio/api/templates/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: 'compact', fragment: 'notice', values: { title: '<script>', message: '<img src=x>' } }),
    });
    const renderedNotice = await response.text();
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(renderedNotice, /&lt;script&gt;/);
    assert.match(renderedNotice, /&lt;img src=x&gt;/);
    response = await fetch(`${root}/studio/api/templates/render`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: 'missing', fragment: 'notice', values: {} }),
    });
    assert.equal(response.status, 400);
    response = await fetch(`${root}/studio/?template_route=studio/notice`, { headers: { Accept: 'text/plain' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(await response.text(), '<aside role="status"><strong data-template-text="title">Notice</strong><p data-template-text="message"></p></aside>');
    response = await fetch(`${root}/studio/?template_route=studio/notice&title=%3Cimg%3E&message=hello`, { headers: { Accept: 'text/html' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(await response.text(), /&lt;img&gt;/);
    response = await fetch(`${root}/studio/?template_route=compact/notice`, {
      method: 'POST', headers: { Accept: 'text/html', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'From JSON', message: '<b>safe</b>' }),
    });
    const dynamicTemplate = await response.text();
    assert.match(dynamicTemplate, /From JSON/);
    assert.match(dynamicTemplate, /&lt;b&gt;safe&lt;\/b&gt;/);
    response = await fetch(`${root}/studio/?template_route=studio/notice`, { headers: { Accept: 'application/json' } });
    assert.equal(response.status, 406);
    response = await fetch(`${root}/studio/api/logic/evaluate`, { method: 'OPTIONS' });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    const defaults = LOGIC_CALCULATOR_PRESETS[0];
    const cases = [
      [null, 'application/json'],
      ['price=60 tax=9', 'text/plain'],
      [[60, 9], 'application/json'],
      [[60, 9, 3], 'application/json'],
      [{ logic_statement: '_3 + price', logic_labels: '10 4 3' }, 'application/json'],
      [{ values: [50, 8] }, 'application/json'],
      [{ logic_statement: 'price * 2 + tax', logic_labels: '10 4' }, 'application/json'],
      [['price + tax', 'price=12 tax=7'], 'application/json'],
      [{ input: JSON.stringify({ statement: 'double(price) / tax', labels: { price: 18, tax: 3 } }) }, 'application/json'],
      [{ statement: '∀x. x ∨ ¬x', labels: [{ id: 'b', name: 'b', kind: 'boolean', value: 'false' }] }, 'application/json'],
      [{ statement: '(λx. x * x)(5)', labels: [] }, 'application/json'],
      [{ statement: '(8 - 3 - 1) + 2 ^ 3 ^ 2' }, 'application/json'],
      [{ statement: '(true implies false implies false) iff true' }, 'application/json'],
      [{ statement: 'inc(square(price))', labels: { inc: { kind: 'lambda', value: 'λx. x + 1' }, square: { kind: 'lambda', value: 'λx. x * x' }, price: 4 } }, 'application/json'],
      [{ statement: 'enabled and (derived > 4)', labels: [{ id: 'a', name: 'n', kind: 'number', value: '3' }, { id: 'b', name: 'derived', kind: 'number', value: 'n * 2' }, { id: 'c', name: 'enabled', kind: 'boolean', value: 'derived > 4' }] }, 'application/json'],
      [{ statement: '7 / 3' }, 'application/json'],
      [{ statement: '-7 % 4' }, 'application/json'],
      [{ statement: 'price + 1', labels: { price: 0.0000001 } }, 'application/json'],
      [{ statement: 'price', labels: { price: 100000000000000.1 } }, 'application/json'],
      [{ statement: 'price / 0' }, 'application/json'],
      [{ statement: 'unknown + 1' }, 'application/json'],
      [{ statement: 'offset(x, hours) > 100' }, 'application/json'],
      [{ statement: 'price', logic_statement: 'tax' }, 'application/json'],
      [{ labels: { price: 'bad' } }, 'application/json'],
    ];
    for (const [input, type] of cases) {
      const expected = normalizeLogicEvaluationInput(input, { statement: defaults.statement, labels: defaults.labels });
      response = await fetch(`${root}/studio/api/logic/evaluate`, {
        method: 'POST', headers: { 'Content-Type': type }, body: type === 'text/plain' ? input : JSON.stringify(input),
      });
      const actual = await response.json();
      assert.equal(response.status, expected.ok ? 200 : 400, JSON.stringify(actual));
      assert.match(response.headers.get('content-type'), /application\/hal\+json/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.match(response.headers.get('link'), /rel="self"/);
      if (!expected.ok) {
        assert.equal(actual.error, expected.error);
        assert.deepEqual(actual.diagnostics, [logicInputDiagnostic(expected.error)]);
      }
      else {
        const oracle = evaluateLogicStatement(expected.input.statement, expected.input.labels);
        assert.deepEqual({ statement: actual.statement, ok: actual.ok, displayValue: actual.displayValue, valueType: actual.valueType, trace: actual.trace, error: actual.error },
          { statement: expected.input.statement, ok: oracle.ok, displayValue: oracle.displayValue, valueType: oracle.valueType, trace: oracle.trace, error: oracle.error });
        assert.deepEqual(actual.diagnostics, getLogicBindingDiagnostics(oracle, expected.input.labels));
      }
    }
    for (const input of [{}, { seedValues: '1', recurrenceExpr: '(_1 + 2 / _1) / 2', maxIterations: 6 }, { seedValues: '' }, { recurrenceExpr: '' }, { recurrenceExpr: 'unknown + 1' }]) {
      response = await fetch(`${root}/studio/api/logic/cauchy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const actual = await response.json();
      assert.equal(response.status, 200, JSON.stringify(actual));
      const config = { ...DEFAULT_CAUCHY_CONFIG, enabled: true, ...input };
      assert.deepEqual(actual.config, config);
      delete actual.config;
      delete actual._links;
      assert.deepEqual(actual, evaluateCauchySequence(config, defaults.labels));
    }
    response = await fetch(`${root}/studio/api/logic/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(response.status, 400);
    response = await fetch(`${root}/studio/api/logic/evaluate`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '1 @ 2' });
    assert.equal(response.status, 503);
    response = await fetch(`${root}/studio/api/logic/evaluate`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '(-1) ^ 0.5' });
    assert.equal(response.status, 503);
    response = await fetch(`${root}/studio/api/logic`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statement: 'price + extra', cauchyConfig: { seedValues: 'price', recurrenceExpr: 'right', maxIterations: 1 } }) });
    assert.equal(response.status, 200);
    response = await fetch(`${root}/studio/api/workspaces/default`);
    assert.equal((await response.json()).logicStatement, 'price + extra');
    response = await fetch(`${root}/studio/api/logic/labels`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'extra', kind: 'number', value: '7' }) });
    assert.equal(response.status, 201);
    const newLabel = (await response.json()).label;
    response = await fetch(`${root}/studio/api/logic/labels/${newLabel.id}`);
    assert.equal((await response.json()).label.name, 'extra');
    response = await fetch(`${root}/studio/api/callbacks`);
    assert.equal((await response.json()).count, 3);
    response = await fetch(`${root}/studio/api/callbacks`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'combine', lambdaExpr: 'λx. λy. x + y', description: 'Combine values' }) });
    assert.equal(response.status, 201);
    const callback = (await response.json()).callback;
    assert.deepEqual(callback.params, ['x', 'y']);
    assert.equal(callback.body, 'x + y');
    response = await fetch(`${root}/studio/api/callbacks/${callback.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lambdaExpr: 'λx. x * 3' }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).callback.id, callback.id);
    response = await fetch(`${root}/studio/api/nodes/callback/${callback.id}/members/description`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"value":"Updated description"}',
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).member.value, 'Updated description');
    response = await fetch(`${root}/studio/api/nodes/logic/active/members/statement`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"value":"price + extra + 1"}',
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).member.value, 'price + extra + 1');
    response = await fetch(`${root}/studio/api/nodes/logic/active/members/statement`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"value":"price + extra"}',
    });
    assert.equal(response.status, 200);
    response = await fetch(`${root}/studio/api/nodes?kind=callback`);
    assert.equal((await response.json()).count, 4);
    response = await fetch(`${root}/studio/api/callbacks`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bad', lambdaExpr: '42' }) });
    assert.equal(response.status, 400);
    response = await fetch(`${root}/studio/api/logic/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null' });
    assert.equal((await response.json()).displayValue, '52');
    response = await fetch(`${root}/studio/api/logic/cauchy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal((await response.json()).steps[0].value, 45);
    response = await fetch(`${root}/studio/api/logic`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"labels":[1]}' });
    assert.equal(response.status, 400);
    response = await fetch(`${root}/studio/api/logic`);
    const persisted = await response.json();
    assert.equal(persisted.statement, 'price + extra');
    assert(persisted.labels.some(label => label.id === newLabel.id));
    response = await fetch(`${root}/studio/api/histolog`);
    const historyBeforeRestart = await response.json();
    server.kill();
    await new Promise(resolve => server.once('exit', resolve));
    server = spawn('php', ['-S', `127.0.0.1:${port}`, `${target}/index.php`], {
      cwd: target, stdio: 'ignore', env: { ...process.env, GRAMMAR2JSON_STATE_DIR: state },
    });
    for (let i = 0; ; i++) {
      try { response = await fetch(`${root}/studio/api/logic`); break; }
      catch (error) { if (i === 50) throw error; await new Promise(r => setTimeout(r, 20)); }
    }
    assert.equal((await response.json()).statement, 'price + extra');
    response = await fetch(`${root}/studio/api/histolog`);
    const historyAfterRestart = await response.json();
    assert.deepEqual(historyAfterRestart.index, historyBeforeRestart.index);
    response = await fetch(`${root}/studio/api/symbols/oneOrMore`);
    assert.equal((await response.json()).value, '#');
    response = await fetch(`${root}/studio/api/symbols/oneOrMore`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"value":"+"}',
    });
    assert.equal(response.status, 200);
    nodeStore.mutateNodeMember('symbol', 'oneOrMore', 'value', 'update', '+');
    response = await fetch(`${root}/studio/api/rules/renamed`);
    assert.equal(response.status, 200);
    response = await fetch(`${root}/studio/api/rules/renamed`, { method: 'DELETE' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).grammarText, nodeStore.deleteRule('renamed').grammar);
    response = await fetch(`${root}/studio/api/workspaces/my%20workspace`);
    const savedWorkspace = await response.json();
    assert.equal(savedWorkspace.grammarText, 'custom ::= "x"');
    assert.deepEqual(savedWorkspace.extra, {});
    response = await fetch(`${root}/studio/api/workspaces/my%20workspace`, { method: 'DELETE' });
    assert.equal(response.status, 200);
    response = await fetch(`${root}/studio/api/workspaces/my%20workspace`, { method: 'GET' });
    assert.equal(response.status, 404);
    response = await fetch(`${root}/studio/api/callbacks/${callback.id}`);
    assert.equal((await response.json()).lambdaExpr, 'λx. x * 3');
    response = await fetch(`${root}/studio/api/callbacks/${callback.id}`, { method: 'DELETE' });
    assert.equal(response.status, 200);
    response = await fetch(`${root}/studio/api/callbacks/${callback.id}`, { method: 'GET' });
    assert.equal(response.status, 404);
    response = await fetch(`${root}/studio/api/logic/labels/${newLabel.id}`, { method: 'DELETE' });
    assert.equal(response.status, 200);
    response = await fetch(`${root}/studio/api/logic/labels/${newLabel.id}`, { method: 'DELETE' });
    assert.equal(response.status, 404);
    response = await fetch(`${root}/studio/api/logic/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null' });
    assert.equal((await response.json()).diagnostics[0].label, 'extra');
    response = await fetch(`${root}/studio/api/logic`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statement: '1', labels: [{ id: 'a', name: 'a', kind: 'number', value: '1' }, { id: 'a', name: 'b', kind: 'number', value: '2' }] }) });
    assert.equal(response.status, 400);
    response = await fetch(`${root}/studio/api/logic`);
    assert.equal((await response.json()).statement, 'price + extra');
    response = await fetch(`${root}/studio/api/histolog`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"summary":"Before clear"}',
    });
    const checkpoint = await response.json();
    response = await fetch(`${root}/studio/api/workspaces/default`, { method: 'DELETE' });
    assert.equal(response.status, 200);
    const cleared = await response.json();
    assert.equal(cleared.clearedDefault, true);
    assert(cleared.generation > checkpoint.generation);
    response = await fetch(`${root}/studio/api/logic`);
    const emptyLogic = await response.json();
    assert.equal(emptyLogic.statement, '');
    assert.equal(emptyLogic.evaluation.error, 'Expression is empty.');
    response = await fetch(`${root}/studio/api/rules`);
    assert.equal((await response.json()).count, 0);
    response = await fetch(`${root}/studio/api/histolog/diff?from=${checkpoint.generation}&to=${cleared.generation}`);
    const diff = await response.json();
    assert(diff.diffs.some(field => field.field === 'grammar' && field.changed));
    response = await fetch(`${root}/studio/api/nodes/histolog/${cleared.generation}/members/summary`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"value":"Cleared workspace"}',
    });
    assert.equal((await response.json()).member.value, 'Cleared workspace');
    response = await fetch(`${root}/studio/api/histolog/${checkpoint.generation}/restore`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"section":"all"}',
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).restoredFrom, checkpoint.generation);
    response = await fetch(`${root}/studio/api/logic`);
    assert.equal((await response.json()).statement, 'price + extra');
    response = await fetch(`${root}/studio/api/rules`);
    assert((await response.json()).count > 0);
    assert.equal((await fetch(`${root}/studio/api.php`)).status, 404);
    assert.equal((await fetch(`${root}/studio/missing.js`)).status, 404);
    assert.equal((await fetch(`${root}/studio/%252eenv`)).status, 400);
    assert.equal((await fetch(`${root}/other/`)).status, 404);
    server.kill();
    await new Promise(resolve => server.once('exit', resolve));
    server = spawn('php', ['-S', `127.0.0.1:${port}`, `${target}/index.php`], {
      cwd: target, stdio: 'ignore', env: { ...process.env, GRAMMAR2JSON_STATE_DIR: '' },
    });
    for (let i = 0; ; i++) {
      try { response = await fetch(`${root}/studio/api/logic`); break; }
      catch (error) { if (i === 50) throw error; await new Promise(r => setTimeout(r, 20)); }
    }
    assert.equal((await response.json()).statement, defaults.statement);
    response = await fetch(`${root}/studio/api/logic`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"statement":"1"}' });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /GRAMMAR2JSON_STATE_DIR/);
    response = await fetch(`${root}/studio/api/workspaces`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"id":"unsaved"}',
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /GRAMMAR2JSON_STATE_DIR/);
  } finally {
    if (server) { server.kill(); await new Promise(resolve => server.once('exit', resolve)); }
    rmSync(work, { recursive: true, force: true });
  }
});

test('worker caches only public shell and hashed assets, never API or private responses', async () => {
  const handlers = {}, saved = new Map(), calls = [];
  let offline = false, privateAsset = false, htmlAsset = false;
  const basic = (body, options = {}) => {
    const response = new Response(body, options);
    Object.defineProperty(response, 'type', { value: 'basic' });
    const clone = response.clone.bind(response);
    response.clone = () => { const copy = clone(); Object.defineProperty(copy, 'type', { value: 'basic' }); return copy; };
    return response;
  };
  const cache = {
    match: async key => saved.get(typeof key === 'string' ? key : key.url),
    put: async (key, value) => saved.set(typeof key === 'string' ? key : key.url, value),
    keys: async () => [...saved.keys()].map(url => ({ url })),
    delete: async key => saved.delete(key.url),
  };
  const scope = 'https://example.test/studio/';
  const cacheNames = ['grammar2json-shell-v1:/studio/', 'grammar2json-shell-v1:/other/', 'unrelated:/studio/'];
  const context = {
    URL, Response, caches: {
      open: async () => cache,
      keys: async () => cacheNames,
      delete: async name => { cacheNames.splice(cacheNames.indexOf(name), 1); return true; },
    },
    self: { registration: { scope }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    fetch: async (input, options) => {
      const url = typeof input === 'string' ? input : input.url;
      calls.push([url, options]);
      if (offline) throw Error('offline');
      if (url.endsWith('index.html')) return basic('<script src="/studio/assets/app-abcdefgh.js"></script>', { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' } });
      return basic('asset', { headers: htmlAsset ? { 'Content-Type': 'text/html' } : privateAsset ? { 'Cache-Control': 'private' } : {} });
    },
  };
  vm.runInNewContext(readFileSync(`${project}/public/sw.js`, 'utf8'), context);
  let install;
  handlers.install({ waitUntil: p => { install = p; } });
  await install;
  let activation;
  handlers.activate({ waitUntil: p => { activation = p; } });
  await activation;
  assert.deepEqual(cacheNames, ['grammar2json-shell-v1:/other/', 'unrelated:/studio/']);
  assert(saved.has(`${scope}index.html`));
  assert(saved.has(`${scope}assets/app-abcdefgh.js`));
  const dispatch = (url, mode = 'navigate', method = 'GET') => {
    let result, pending;
    handlers.fetch({ request: { url, mode, method, headers: new Headers() }, respondWith: p => { result = p; }, waitUntil: p => { pending = p; } });
    return { result, pending };
  };
  assert.equal(dispatch(`${scope}api/rules`).result, undefined);
  assert.equal(dispatch('https://example.test/api/rules').result, undefined);
  assert.equal(dispatch(`${scope}api%2Frules`).result, undefined);
  assert.equal(dispatch(`${scope}api/rules`, 'cors', 'POST').result, undefined);
  offline = true;
  const nav = dispatch(`${scope}deep`);
  assert.match(await (await nav.result).text(), /app-abcdefgh/);
  await nav.pending;
  saved.delete(`${scope}index.html`);
  const missingShell = dispatch(`${scope}deep`);
  assert.equal((await missingShell.result).type, 'error');
  await missingShell.pending;
  offline = false; privateAsset = true;
  const asset = dispatch(`${scope}assets/other-abcdefgh.js`, 'cors');
  await asset.result;
  assert(!saved.has(`${scope}assets/other-abcdefgh.js`));
  assert.equal(calls.at(-1)[1].credentials, 'omit');
  privateAsset = false; htmlAsset = true;
  await dispatch(`${scope}assets/missing-abcdefgh.js`, 'cors').result;
  assert(!saved.has(`${scope}assets/missing-abcdefgh.js`));
});
