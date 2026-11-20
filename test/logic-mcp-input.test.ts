import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { McpLazyServerRegistry } from '../src/engine/mcpServerEngine.ts';

test('MCP evaluates explicitly defined callback and arguments', async () => {
  const registry = new McpLazyServerRegistry({ logicLabels: [] });
  const response = await registry.handleJsonRpc('logic_calc', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'evaluate_logic_lambda',
      arguments: {
        logic_statement: 'offset(x, hours) > 100',
        logic_labels: JSON.stringify({
          offset: { kind: 'lambda', value: 'λx. λhours. x + hours' },
          x: 99,
          hours: 2,
        }),
      },
    },
  });
  const result = response.result as { structuredContent: { ok: boolean; displayValue: string } };
  assert.equal(result.structuredContent.ok, true);
  assert.equal(result.structuredContent.displayValue, '⊤ (true)');
});

test('MCP reports missing bindings as an error', async () => {
  const registry = new McpLazyServerRegistry({ logicLabels: [] });
  const response = await registry.handleJsonRpc('logic_calc', {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'evaluate_logic_lambda', arguments: { logic_statement: 'x > 100' } },
  });
  const result = response.result as { isError: boolean; structuredContent: { error: string } };
  assert.equal(result.isError, true);
  assert.match(result.structuredContent.error, /Unbound label "x"/);
});
