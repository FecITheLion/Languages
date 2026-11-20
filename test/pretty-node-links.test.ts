import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RestHateoasEngineStore } from '../src/engine/hateoasEngine.ts';

test('addressable nodes expose extended and short pretty member links', () => {
  const store = new RestHateoasEngineStore();
  const origin = 'https://example.test';
  const node = store.listAddressableNodes(origin).find((candidate) => candidate.kind === 'rule');
  assert.ok(node);

  const member = node.members.expression;
  assert.ok(member);
  assert.equal(node._links.pretty.href, `${origin}/nodes/rule/${encodeURIComponent(node.id)}`);
  assert.equal(
    member._links.pretty.href,
    `${origin}/nodes/rule/${encodeURIComponent(node.id)}/members/expression`
  );
  assert.equal(
    member._links.short.href,
    `${origin}/members/expression?node=${encodeURIComponent(`rule/${node.id}`)}`
  );
  assert.equal(member._links.self.href, `${node.href}/members/expression`);
});

