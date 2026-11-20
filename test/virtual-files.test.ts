import assert from 'node:assert/strict';
import test from 'node:test';
import { applyVirtualSubmission, buildVirtualTree, editVirtualFile, hasVirtualConflict, mergeVirtualFiles, parseVirtualFiles, readVirtualFiles, resolveVirtualFile, restoreAutoSavedVirtualEdits, restoreVirtualEdits, serializeVaultListing, submitVirtualFiles, validVirtualPath, virtualEditAllowed, virtualEdits, workbenchVirtualFiles } from '../src/engine/virtualFiles.ts';
import type { HistologSnapshotState } from '../src/engine/histologEngine.ts';

const submit = (content: string) => submitVirtualFiles({}, 'engine', [{ path: 'engine/output.txt', content }]);

test('workbench submissions survive autosave with edits and their source', () => {
  let files = submitVirtualFiles({}, 'workbench-dialect', [{ path: 'workbench/dialect/grammar.txt', content: 'source' }]);
  files = editVirtualFile(files, 'workbench/dialect/grammar.txt', 'edited');
  files = submitVirtualFiles(files, 'engine', [{ path: 'engine/output.txt', content: 'generated' }]);
  const saved = readVirtualFiles(JSON.parse(JSON.stringify(workbenchVirtualFiles(files))));
  const restored = mergeVirtualFiles(saved, restoreAutoSavedVirtualEdits(virtualEdits(files)));
  assert.equal(restored['workbench/dialect/grammar.txt'].source, 'source');
  assert.equal(restored['workbench/dialect/grammar.txt'].edit, 'edited');
  assert.equal(restored['engine/output.txt'], undefined);
});

test('versioned submissions reject malformed batches without changing existing files', () => {
  const original = submit('original');
  const accepted = applyVirtualSubmission(original, { version: 1, owner: 'engine', files: [{ path: 'engine/output.txt', content: 'updated' }] });
  assert.equal(accepted['engine/output.txt'].source, 'updated');
  for (const payload of [
    { version: 2, owner: 'engine', files: [] },
    { version: 1, owner: 'engine', files: [{ path: 'engine/output.txt', content: 3 }] },
    { version: 1, owner: 'engine', files: [{ path: 'engine/output.txt', content: 'bad', target: 'unknown' }] },
    { version: 1, owner: 'engine', files: [{ path: 'engine/output.txt', content: 'bad', filename: '../bad' }] },
    { version: 1, owner: '__proto__', files: [] },
  ]) assert.throws(() => applyVirtualSubmission(original, payload), /Invalid artifact/);
  assert.equal(original['engine/output.txt'].source, 'original');
});

test('regeneration preserves edits and latches conflicts until explicit resolution', () => {
  let files = editVirtualFile(submit('one'), 'engine/output.txt', 'mine');
  files = submitVirtualFiles(files, 'engine', [{ path: 'engine/output.txt', content: 'two' }]);
  assert.equal(files['engine/output.txt'].edit, 'mine');
  assert.equal(files['engine/output.txt'].source, 'two');
  assert.ok(hasVirtualConflict(files['engine/output.txt']));
  files = submitVirtualFiles(files, 'engine', [{ path: 'engine/output.txt', content: 'one' }]);
  files = editVirtualFile(files, 'engine/output.txt', 'one');
  assert.ok(hasVirtualConflict(files['engine/output.txt']));
  files = resolveVirtualFile(files, 'engine/output.txt', 'edit');
  assert.equal(hasVirtualConflict(files['engine/output.txt']), false);
  assert.equal(files['engine/output.txt'].edit, 'one');
  files = submitVirtualFiles(files, 'engine', [{ path: 'engine/output.txt', content: 'three' }]);
  assert.ok(hasVirtualConflict(files['engine/output.txt']));
  files = resolveVirtualFile(files, 'engine/output.txt', 'source');
  assert.equal(files['engine/output.txt'].edit, null);
  assert.equal(files['engine/output.txt'].source, 'three');
});

test('removed output retains edited copy, while unedited output disappears', () => {
  let files = submitVirtualFiles({}, 'engine', [{ path: 'out/a', content: 'a' }, { path: 'out/b', content: 'b' }]);
  files = editVirtualFile(files, 'out/a', 'edited');
  files = submitVirtualFiles(files, 'engine', []);
  assert.equal(files['out/a'].source, null);
  assert.equal(files['out/a'].edit, 'edited');
  assert.ok(hasVirtualConflict(files['out/a']));
  assert.equal(files['out/b'], undefined);
  files = resolveVirtualFile(files, 'out/a', 'edit');
  assert.equal(hasVirtualConflict(files['out/a']), false);
  files = submitVirtualFiles(files, 'engine', []);
  assert.equal(hasVirtualConflict(files['out/a']), false);
  files = submitVirtualFiles(files, 'engine', [{ path: 'out/a', content: 'returned' }]);
  assert.ok(hasVirtualConflict(files['out/a']));
  files = submitVirtualFiles(files, 'engine', []);
  files = resolveVirtualFile(files, 'out/a', 'source');
  assert.equal(files['out/a'], undefined);
});

test('changing output identity also requires resolution', () => {
  let files = submitVirtualFiles({}, 'engine', [{ path: 'out/current', filename: 'a.py', target: 'python', content: 'same' }]);
  files = editVirtualFile(files, 'out/current', 'edited');
  files = submitVirtualFiles(files, 'engine', [{ path: 'out/current', filename: 'a.rs', target: 'rust', content: 'same' }]);
  assert.ok(hasVirtualConflict(files['out/current']));
  assert.equal(files['out/current'].edit, 'edited');
});

test('paths are safe, deterministic and ownership cannot overwrite another workbench', () => {
  for (const path of ['/abs', '../out', 'a/../b', 'a//b', 'a\\b', '__proto__', 'a/constructor']) assert.equal(validVirtualPath(path), false);
  const files = submitVirtualFiles({}, 'one', [{ path: 'z/y.txt', content: 'y' }, { path: 'a/x.txt', content: 'x' }]);
  assert.throws(() => submitVirtualFiles(files, 'one', [{ path: '../bad', content: 'bad' }]), /Invalid path/);
  assert.throws(() => submitVirtualFiles(files, 'two', [{ path: 'z/y.txt', content: 'wrong' }]), /Owned by/);
  assert.throws(() => submitVirtualFiles(files, 'two', [{ path: 'z/y.txt/child', content: 'wrong' }]), /collision/);
  assert.equal(files['z/y.txt'].source, 'y');
  assert.equal(files['z/y.txt/child'], undefined);
  assert.deepEqual(buildVirtualTree(files).map(n => [n.name, n.children?.[0].name]), [['a', 'x.txt'], ['z', 'y.txt']]);
});

test('snapshot merge preserves both divergent edits and history restores edits against live source', () => {
  const local = editVirtualFile(submit('base'), 'engine/output.txt', 'local');
  const incoming = editVirtualFile(submit('base'), 'engine/output.txt', 'incoming');
  const merged = mergeVirtualFiles(local, readVirtualFiles(JSON.parse(JSON.stringify(incoming))));
  assert.equal(merged['engine/output.txt'].edit, 'local');
  assert.equal(merged['recovered/engine/output.txt'].edit, 'incoming');
  assert.ok(hasVirtualConflict(merged['recovered/engine/output.txt']));
  const occupied = submitVirtualFiles(local, 'other', [{ path: 'recovered', content: 'occupied' }]);
  const recovered = mergeVirtualFiles(occupied, incoming);
  assert.equal(recovered['recovered-file-2.txt'].edit, 'incoming');
  const live = submit('new source');
  const restored = restoreVirtualEdits(live, virtualEdits(local));
  assert.equal(restored['engine/output.txt'].edit, 'local');
  assert.equal(restored['engine/output.txt'].source, 'new source');
  assert.ok(hasVirtualConflict(restored['engine/output.txt']));
});

test('mutation policy blocks virtual edits for locked rules and disallowed targets', async () => {
  const python = { target: 'python' as const };
  assert.equal(virtualEditAllowed(python, { lockedRules: [], allowedTargets: ['python'] }), true);
  assert.equal(virtualEditAllowed(python, { lockedRules: ['rule'], allowedTargets: ['python'] }), false);
  assert.equal(virtualEditAllowed(python, { lockedRules: [], allowedTargets: ['rust'] }), false);
  assert.equal(virtualEditAllowed({ target: 'rust', editTarget: 'python' }, { lockedRules: [], allowedTargets: ['rust'] }), false);
  assert.equal(virtualEditAllowed({}, { lockedRules: [], allowedTargets: [] }), true);
});

test('history captures, diffs and imports virtual edits', async () => {
  const { createHistologEntry, buildHistologIndex, exportHistologCustom, importHistologCustom } = await import('../src/engine/histologEngine.ts');
  const state: HistologSnapshotState = { grammarText: '', dialect: { preset: 'ebnf', ruleOperator: '=', choiceDelimiter: '|', commentPrefix: '#' }, jsonText: '{}', mutations: {}, ruleConfigs: {}, evalRule: '', evalPayload: '', pythonSource: '', rustSource: '', watSource: '', logicStatement: '', logicLabels: [], dslSource: '' };
  const initial = createHistologEntry({ generation: 0, parentGeneration: null, source: 'init', summary: 'initial', snapshot: state, previousSnapshot: null });
  const next = { ...state, virtualFiles: virtualEdits(editVirtualFile(submit('base'), 'engine/output.txt', 'edited')) };
  const changed = createHistologEntry({ generation: 1, parentGeneration: 0, source: 'edit', summary: 'edit', snapshot: next, previousSnapshot: state });
  assert.ok(changed.changedFields.includes('virtualFiles'));
  const entries = [initial, changed];
  const archive = exportHistologCustom(entries, buildHistologIndex(entries), 'test', 'histolog-json');
  const imported = importHistologCustom(archive.content, 'replace', []);
  assert.ok(imported.ok);
  assert.equal(imported.entries[1].snapshot.virtualFiles?.['engine/output.txt'].edit, 'edited');
});

test('autosave keeps edits and bases only, then reconciles restored sources', () => {
  let live = submitVirtualFiles({}, 'api', [
    { path: 'api/edited', content: 'base' },
    { path: 'api/response', content: 'private unedited response' },
  ]);
  live = editVirtualFile(live, 'api/edited', 'my copy');
  live = submitVirtualFiles(live, 'api', [
    { path: 'api/edited', content: 'new source' },
    { path: 'api/response', content: 'private unedited response' },
  ]);
  const stored = JSON.parse(JSON.stringify(virtualEdits(live)));
  assert.deepEqual(Object.keys(stored), ['api/edited']);
  assert.equal(stored['api/edited'].base, 'base');
  assert.ok(!JSON.stringify(stored).includes('private unedited response'));
  let restored = restoreAutoSavedVirtualEdits(stored);
  assert.equal(restored['api/edited'].edit, 'my copy');
  assert.equal(restored['api/edited'].sourcePending, true);
  restored = submitVirtualFiles(restored, 'api', [{ path: 'api/edited', content: 'new source' }]);
  assert.equal(restored['api/edited'].edit, 'my copy');
  assert.equal(restored['api/edited'].source, 'new source');
  assert.ok(hasVirtualConflict(restored['api/edited']));
  const legacy = restoreAutoSavedVirtualEdits(live);
  assert.equal(Object.keys(legacy).length, 1);
});

test('prototype-named paths are ordinary files and malformed imports are reported', () => {
  let files = submitVirtualFiles({}, 'one', [{ path: 'toString', content: 'source' }]);
  files = editVirtualFile(files, 'toString', 'edited');
  assert.equal(Object.entries(files).find(([path]) => path === 'toString')?.[1].edit, 'edited');
  const parsed = parseVirtualFiles({ bad: { path: 'bad', edit: 'incomplete' } });
  assert.equal(parsed.issues.length, 1);
  assert.throws(() => readVirtualFiles({ bad: { path: 'bad', edit: 'incomplete' } }), /Malformed virtual file/);
});

test('vault listing excludes embedded snapshots and package target policy includes all targets', () => {
  const record = { id: '1', name: 'workspace', updatedAt: 'now', sizeBytes: 10, source: 'demo', snapshot: { secret: 'private' } };
  assert.ok(!serializeVaultListing('demo', [record]).includes('private'));
  assert.equal(virtualEditAllowed({ targets: ['jsonld', 'python'] }, { lockedRules: [], allowedTargets: ['jsonld'] }), false);
});
