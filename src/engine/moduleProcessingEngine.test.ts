import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createModuleProcessingContext,
  ModuleProcessingEngine,
  NoMatchingModuleError,
} from './moduleProcessingEngine.ts';

test('module processing matches route, scope, call and property conditions in phase order', async () => {
  const engine = new ModuleProcessingEngine();
  const events: string[] = [];
  engine.registerPackage({
    id: 'outer-module',
    processing: {
      routes: ['/api/orders'],
      methods: ['post'],
      blockScopes: ['request-handler'],
      callNames: ['submit'],
      properties: { 'scope.mode': 'safe' },
    },
  }, {
    preProcess(context) {
      events.push('pre:outer');
      context.environment.authorized = true;
      context.scope.normalized = true;
      context.output.write('raw:');
    },
    async process(context, next) {
      events.push('process:outer:before');
      const result = await next();
      events.push('process:outer:after');
      context.output.write(':wrapped');
      return result;
    },
    after() {
      events.push('after:outer');
    },
    postProcess(_context, output) {
      events.push('post:outer');
      return String(output).toUpperCase();
    },
  }, 10);
  engine.register({
    id: 'inner-module',
    activation: { routes: ['/api/orders'], properties: { 'environment.authorized': true } },
    hooks: {
      preProcess() {
        events.push('pre:inner');
      },
      process(context) {
        events.push('process:inner');
        assert.equal(context.scope.normalized, true);
        context.output.write('body');
        return { status: 201 };
      },
      after() {
        events.push('after:inner');
      },
      postProcess(_context, output) {
        events.push('post:inner');
        return `${String(output)}!`;
      },
    },
  });

  const context = createModuleProcessingContext({
    input: { orderId: 'o-1' },
    scope: { mode: 'safe' },
    call: { route: '/api/orders', method: 'POST', blockScopes: ['request-handler'], callName: 'submit' },
  });
  const result = await engine.run(context);
  assert.deepEqual(result.moduleIds, ['outer-module', 'inner-module']);
  assert.deepEqual(result.result, { status: 201 });
  assert.equal(result.output, 'raw:body:wrapped');
  assert.equal(result.translatedOutput, 'RAW:BODY:WRAPPED!');
  assert.deepEqual(events, [
    'pre:outer', 'pre:inner', 'process:outer:before', 'process:inner', 'process:outer:after',
    'after:inner', 'after:outer', 'post:inner', 'post:outer',
  ]);
});

test('module processing skips nonmatching modules and reports a missing implementation', async () => {
  const engine = new ModuleProcessingEngine();
  engine.register({
    id: 'conditional',
    activation: { workbenchSlugs: ['logic_calc'], properties: { 'call.intent': 'evaluate' } },
    hooks: { process: () => 'ok' },
  });
  const context = createModuleProcessingContext({
    input: null,
    call: { route: '/api/logic/evaluate', workbenchSlug: 'grammar' },
  });
  assert.deepEqual(engine.find(context), []);
  await assert.rejects(engine.run(context), NoMatchingModuleError);
});

test('runtime registry rejects duplicate ids and repeated next calls', async () => {
  const engine = new ModuleProcessingEngine();
  engine.register({ id: 'single', hooks: { process: async (_context, next) => {
    await next();
    return next();
  } } });
  assert.throws(() => engine.register({ id: 'single', hooks: { process: () => null } }), /already registered/);
  await assert.rejects(engine.run(createModuleProcessingContext({ input: null })), /called next more than once/);
});
