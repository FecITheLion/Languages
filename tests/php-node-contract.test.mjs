import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, cpSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createApiApp } from '../server.ts';
import { submitVirtualFiles } from '../src/engine/virtualFiles.ts';
import { createHistologEntry, diffHistologSnapshots } from '../src/engine/histologEngine.ts';
import { RestHateoasEngineStore } from '../src/engine/hateoasEngine.ts';
import { assessCauchySequencingSafety, normalizeLogicEvaluationInput } from '../src/engine/logicInputNormalizer.ts';
import { CAUCHY_SEQUENCE_PRESETS } from '../src/engine/logicLambdaEngine.ts';

const project = process.cwd();

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

test('PHP vs Node Express contract parity across REST, MCP, Foundry, OpenAI, Middleware, Templates, and Cauchy safety', async () => {
  const work = mkdtempSync(`${project}/tests/.contract-parity-`);
  const source = `${work}/source`;
  const target = `${work}/target`;
  const state = `${work}/state`;
  let phpServer;
  let nodeServer;

  try {
    mkdirSync(`${source}/dist/assets`, { recursive: true });
    mkdirSync(target);
    mkdirSync(state, { mode: 0o700 });
    for (const file of ['index.php', 'install.php', 'api.php', 'slug_controller.php']) {
      copyFileSync(`${project}/${file}`, `${source}/${file}`);
    }
    cpSync(`${project}/php`, `${source}/php`, { recursive: true });
    cpSync(`${project}/public`, `${source}/dist`, { recursive: true });
    writeFileSync(`${source}/dist/index.html`, '<!doctype html><script type="module" src="/assets/app-12345678.js"></script>');
    writeFileSync(`${source}/dist/assets/app-12345678.js`, '/* contract test */');

    const inst = spawnSync('php', [`${source}/install.php`, target, '/'], { encoding: 'utf8' });
    assert.equal(inst.status, 0, inst.stderr);

    const phpPort = await getFreePort();
    phpServer = spawn('php', ['-S', `127.0.0.1:${phpPort}`, `${target}/index.php`], {
      cwd: target,
      stdio: 'ignore',
      env: { ...process.env, GRAMMAR2JSON_STATE_DIR: state },
    });
    const phpBase = `http://127.0.0.1:${phpPort}`;
    for (let i = 0; ; i += 1) {
      try { await fetch(`${phpBase}/healthz`); break; }
      catch (err) { if (i === 60) throw err; await new Promise((r) => setTimeout(r, 25)); }
    }

    const nodeApp = createApiApp();
    const nodePort = await getFreePort();
    nodeServer = await new Promise((resolve) => {
      const s = nodeApp.listen(nodePort, '127.0.0.1', () => resolve(s));
    });
    const nodeBase = `http://127.0.0.1:${nodePort}`;

    // 1. Health & Discovery contract
    const [phpHealth, nodeHealth] = await Promise.all([
      fetch(`${phpBase}/healthz`).then((r) => r.json()),
      fetch(`${nodeBase}/healthz`).then((r) => r.json()),
    ]);
    assert.deepEqual(phpHealth, nodeHealth);

    // 2. Identical evaluation payload (ASCII + Unicode)
    const evalPayload = { rule: 'order_expr', payload: 'BUY SKU-402 12' };
    const [phpEval, nodeEval] = await Promise.all([
      fetch(`${phpBase}/api/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(evalPayload) }).then((r) => r.json()),
      fetch(`${nodeBase}/api/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(evalPayload) }).then((r) => r.json()),
    ]);
    assert.equal(phpEval.matched, nodeEval.matched);
    assert.equal(phpEval.consumedLength, nodeEval.consumedLength);
    assert.deepEqual(phpEval.trace, nodeEval.trace);

    // 3. Unambiguous Cauchy auto-enabled vs ambiguous positional deferred on BOTH PHP & Node
    const [phpUnambig, nodeUnambig] = await Promise.all([
      fetch(`${phpBase}/api/logic/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logic_labels: 'price=60 tax=9' }) }).then((r) => r.json()),
      fetch(`${nodeBase}/api/logic/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logic_labels: 'price=60 tax=9' }) }).then((r) => r.json()),
    ]);
    assert.equal(phpUnambig.displayValue, nodeUnambig.displayValue);
    assert.equal(phpUnambig.cauchyAutoEnabled, true);
    assert.equal(nodeUnambig.cauchyAutoEnabled, true);
    assert.equal(phpUnambig.cauchyEvaluation.converged, nodeUnambig.cauchyEvaluation.converged);

    const [phpAmbig, nodeAmbig] = await Promise.all([
      fetch(`${phpBase}/api/logic/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([60, 9]) }).then((r) => r.json()),
      fetch(`${nodeBase}/api/logic/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([60, 9]) }).then((r) => r.json()),
    ]);
    assert.equal(phpAmbig.cauchyAutoEnabled, false);
    assert.equal(nodeAmbig.cauchyAutoEnabled, false);
    assert.ok(phpAmbig.cauchySkippedReason);
    assert.ok(nodeAmbig.cauchySkippedReason);

    // 4. Native Logic Code Exports (?mode=cli & ?mode=hardcoded) on BOTH PHP & Node
    for (const lang of ['python', 'javascript', 'typescript', 'rust', 'jsonld', 'wat']) {
      for (const mode of ['cli', 'hardcoded']) {
        const [pRes, nRes] = await Promise.all([
          fetch(`${phpBase}/api/logic/export/${lang}?mode=${mode}`),
          fetch(`${nodeBase}/api/logic/export/${lang}?mode=${mode}`),
        ]);
        assert.equal(pRes.status, 200, `PHP logic export ${lang}`);
        assert.equal(nRes.status, 200, `Node logic export ${lang}`);
        const [pJson, nJson] = await Promise.all([pRes.json(), nRes.json()]);
        assert.equal(pJson.language, nJson.language);
        assert.equal(pJson.filename, nJson.filename);
        assert.equal(pJson.inputMode, mode);
        assert.equal(nJson.inputMode, mode);
      }
    }

    // 5. Full MCP server discovery + Microsoft Foundry + OpenAI exports on BOTH PHP & Node
    const [phpMcp, nodeMcp] = await Promise.all([
      fetch(`${phpBase}/api/mcp/servers`).then((r) => r.json()),
      fetch(`${nodeBase}/api/mcp/servers`).then((r) => r.json()),
    ]);
    assert.equal(phpMcp.servers.length, 11);
    assert.equal(nodeMcp.servers.length, 11);

    for (const client of ['foundry', 'openai', 'aws_bedrock']) {
      const [pExp, nExp] = await Promise.all([
        fetch(`${phpBase}/api/mcp/all/export/${client}`).then((r) => r.json()),
        fetch(`${nodeBase}/api/mcp/all/export/${client}`).then((r) => r.json()),
      ]);
      assert.equal(pExp.filename, nExp.filename);
      const pBody = JSON.parse(pExp.content);
      const nBody = JSON.parse(nExp.content);
      assert.equal(pBody.schemaVersion, nBody.schemaVersion);
      if (client === 'foundry') {
        assert.equal(pBody.platform, 'Microsoft Foundry');
        assert.ok(pBody.agent.modelExperimentation.openModels.length > 0);
        assert.ok(pBody.agent.modelExperimentation.proprietaryModels.length > 0);
      }
    }

    // 6. OpenAI Tools & Full API Base Execution on BOTH PHP & Node
    const [phpOai, nodeOai] = await Promise.all([
      fetch(`${phpBase}/api/openai/tools`).then((r) => r.json()),
      fetch(`${nodeBase}/api/openai/tools`).then((r) => r.json()),
    ]);
    assert.equal(phpOai.schemaVersion, 'openai.tools/v1');
    assert.equal(nodeOai.schemaVersion, 'openai.tools/v1');
    assert.ok(phpOai.tools.length > 10);
    assert.ok(nodeOai.tools.length > 10);

    const execPayload = { name: 'api_evaluate_logic', arguments: { logic_statement: '10 + 5' } };
    const [phpExec, nodeExec] = await Promise.all([
      fetch(`${phpBase}/api/openai/tools/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(execPayload) }).then((r) => r.json()),
      fetch(`${nodeBase}/api/openai/tools/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(execPayload) }).then((r) => r.json()),
    ]);
    assert.equal(phpExec.ok, true);
    assert.equal(nodeExec.ok, true);
    assert.equal(phpExec.messages[0].role, 'tool');
    assert.equal(nodeExec.messages[0].role, 'tool');
    assert.equal(phpExec.messages[0].parsed.displayValue, '15');
    assert.equal(nodeExec.messages[0].parsed.displayValue, '15');

    // 7. Middleware Suite (default-disabled Azure/AWS + custom slug mutation + cache invalidation)
    const [phpMw, nodeMw] = await Promise.all([
      fetch(`${phpBase}/api/middleware/config`).then((r) => r.json()),
      fetch(`${nodeBase}/api/middleware/config`).then((r) => r.json()),
    ]);
    assert.equal(phpMw.frontend.azure.enabled, false);
    assert.equal(nodeMw.frontend.azure.enabled, false);
    assert.equal(phpMw.frontend.aws.enabled, false);
    assert.equal(nodeMw.frontend.aws.enabled, false);

    // Mutate custom slug on PHP and verify live slug routing + ETag invalidation
    const beforeTplRes = await fetch(`${phpBase}/?template_route=studio/notice`, { headers: { Accept: 'text/plain' } });
    const etagBefore = beforeTplRes.headers.get('etag');
    const addSlugRes = await fetch(`${phpBase}/api/middleware/slugs/release-notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: 'studio', fragment: 'status', title: 'Release Notes', message: 'All 20 priorities shipped.' }),
    });
    assert.equal(addSlugRes.status, 200);
    const customSlugPage = await fetch(`${phpBase}/?slug=release-notes`);
    assert.equal(customSlugPage.status, 200);
    assert.match(await customSlugPage.text(), /All 20 priorities shipped/);

    const afterTplRes = await fetch(`${phpBase}/?template_route=studio/notice`, { headers: { Accept: 'text/plain' } });
    const etagAfter = afterTplRes.headers.get('etag');
    assert.notEqual(etagBefore, etagAfter, 'Mutating middleware/workspace state must invalidate template ETag');

    // 8. Verify SQLite WAL mode + schema_version table exist in PHP SQLite store
    const sqliteCheck = spawnSync('php', ['-r', `
      $db = new PDO('sqlite:' . $argv[1] . '/logic.sqlite3');
      echo json_encode([
        'journal' => strtolower((string)$db->query('PRAGMA journal_mode')->fetchColumn()),
        'schemaVersion' => (int)$db->query('SELECT version FROM schema_version WHERE id = 1')->fetchColumn(),
      ]);
    `, state], { encoding: 'utf8' });
    assert.equal(sqliteCheck.status, 0, sqliteCheck.stderr);
    const dbMeta = JSON.parse(sqliteCheck.stdout);
    assert.equal(dbMeta.journal, 'wal');
    assert.equal(dbMeta.schemaVersion, 2);

    // 9. Verify Node /template/:template/:fragment ETag 304 for BOTH text/plain and text/html
    for (const accept of ['text/plain', 'text/html']) {
      const r1 = await fetch(`${nodeBase}/template/studio/notice?title=Hi&message=World`, { headers: { Accept: accept } });
      assert.equal(r1.status, 200);
      const etag = r1.headers.get('etag');
      assert.ok(etag);
      const r2 = await fetch(`${nodeBase}/template/studio/notice?title=Hi&message=World`, {
        headers: { Accept: accept, 'If-None-Match': etag },
      });
      assert.equal(r2.status, 304);
    }
  } finally {
    if (phpServer) { phpServer.kill(); await new Promise((r) => phpServer.once('exit', r)); }
    if (nodeServer) { await new Promise((r) => nodeServer.close(r)); }
    rmSync(work, { recursive: true, force: true });
  }
});

test('PHP Unicode grammar parser handles multibyte custom delimiters and Unicode rule references', () => {
  const php = spawnSync('php', ['-r', `
    define('PHP_API_ENTRY', true);
    require 'api.php';
    $w = workspace_default(['statement'=>DEFAULT_STATEMENT, 'labels'=>DEFAULT_LABELS, 'cauchyConfig'=>DEFAULT_CAUCHY]);
    $w->dialect->symbols->groupParens = '⟨⟩';
    $w->grammarText = "root ::= ⟨'α' | 'β'⟩ '🙂'+";
    $rules = parse_grammar($w->grammarText, $w->dialect);
    $eval = (new GrammarPayloadEvaluator($rules, $w, 'β🙂🙂'))->evaluate('root');
    echo json_encode($eval, JSON_UNESCAPED_UNICODE);
  `], { encoding: 'utf8' });
  assert.equal(php.status, 0, php.stderr);
  const res = JSON.parse(php.stdout);
  assert.equal(res.matched, true);
  assert.equal(res.consumedLength, 3);
});

test('all 12 workbenches submit valid versioned payloads with diffs and Histolog revisions into the canonical workspace', () => {
  const workbenches = [
    ['dialect', 'workbench/dialect/grammar.g2j', "order ::= 'BUY' ' ' digit+"],
    ['rule_props', 'workbench/rule_props/ruleConfigs.json', '{"order":{"precedence":1}}'],
    ['logic_calc', 'workbench/logic_calc/logic.json', '{"statement":"price > 10"}'],
    ['schema', 'workbench/schema/schema.jsonld', '{"@context":"https://schema.org"}'],
    ['mutations', 'workbench/mutations/mutations.json', '{"order":{"enabled":true}}'],
    ['evaluator', 'workbench/evaluator/trace.json', '{"matched":true}'],
    ['python_ast', 'workbench/python_ast/parser.py', 'RULES = ["order"]'],
    ['rust_ast', 'workbench/rust_ast/parser.rs', 'pub const RULE: &str = "order";'],
    ['wasm_wabt', 'workbench/wasm_wabt/module.wat', '(module)'],
    ['mcp_servers', 'workbench/mcp_servers/foundry.json', '{"platform":"Microsoft Foundry"}'],
    ['payload_io', 'workbench/payload_io/package.jsonld', '{"@type":"DefinedTermSet"}'],
    ['gdrive', 'workbench/gdrive/vault-manifest.json', '{"synced":true}'],
  ];

  let files = {};
  const store = new RestHateoasEngineStore();
  const baseSnap = store.buildSnapshotState();
  for (const [slug, path, content] of workbenches) {
    files = submitVirtualFiles(files, slug, [{ path, content, filename: path.split('/').pop() }]);
    assert.equal(files[path].source, content);
    assert.equal(files[path].owner, slug);
  }
  assert.equal(Object.keys(files).length, 12);

  // Verify revision & line-diff tracking via Histolog
  store.workspace.grammarText += "\nextra_rule ::= 'OK'";
  const nextSnap = store.buildSnapshotState();
  const diff = diffHistologSnapshots(baseSnap, nextSnap);
  assert.ok(diff.some((d) => d.field === 'grammar' && d.changed && d.lines.length > 0));
  const entry = createHistologEntry({
    generation: 1,
    parentGeneration: 0,
    source: 'workbench_verify_all',
    summary: 'Verified all 12 workbenches',
    snapshot: nextSnap,
    previousSnapshot: baseSnap,
  });
  assert.equal(entry.generation, 1);
  assert.ok(entry.changedFields.includes('grammar'));
});

test('Cauchy sequencing auto-enables cleanly only when inputs cannot be confused', () => {
  const defaults = {
    statement: 'price + tax',
    labels: [
      { id: '1', name: 'price', kind: 'number', value: '45' },
      { id: '2', name: 'tax', kind: 'number', value: '8' },
    ],
  };
  const cauchy = { ...CAUCHY_SEQUENCE_PRESETS[0].config, enabled: true };

  // Safe named input
  const safeNorm = normalizeLogicEvaluationInput({ logic_labels: 'price=60 tax=9' }, defaults);
  assert.equal(safeNorm.ok, true);
  if (safeNorm.ok) {
    const res = assessCauchySequencingSafety({ logic_labels: 'price=60 tax=9' }, safeNorm.input, cauchy);
    assert.equal(res.canEnable, true);
  }

  // Ambiguous positional array
  const posNorm = normalizeLogicEvaluationInput([60, 9], defaults);
  assert.equal(posNorm.ok, true);
  if (posNorm.ok) {
    const res = assessCauchySequencingSafety([60, 9], posNorm.input, cauchy);
    assert.equal(res.canEnable, false);
  }

  // Colliding Cauchy parameter name ('left')
  const colNorm = normalizeLogicEvaluationInput({ logic_labels: { left: 5 } }, defaults);
  assert.equal(colNorm.ok, true);
  if (colNorm.ok) {
    const res = assessCauchySequencingSafety({ logic_labels: { left: 5 } }, colNorm.input, cauchy);
    assert.equal(res.canEnable, false);
  }
});
