import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  exportModuleZip,
  importModuleZip,
  updateModuleFile,
  type StudioModulePackage,
} from './modulePackageEngine.ts';

const sample: StudioModulePackage = {
  manifest: {
    id: 'logic-workbench',
    name: 'Logic Workbench',
    version: '1.0.0',
    kind: 'workbench',
    workbenchSlug: 'logic_calc',
    entrypoint: 'scripts/index.ts',
    routes: ['/api/logic'],
    processing: { workbenchSlugs: ['logic_calc'], properties: { 'scope.mode': 'edit' } },
  },
  files: {
    'scripts/index.ts': 'export const page = "logic_calc";',
    'templates/index.html': '<main data-module="logic-workbench"></main>',
  },
};

test('module zip round-trips named module scripts and templates', async () => {
  const zip = await exportModuleZip(sample);
  assert.deepEqual(await importModuleZip(zip), sample);
});

test('module edits validate paths and keep the original package immutable', () => {
  const changed = updateModuleFile(sample, 'templates/index.html', '<main>Changed</main>');
  assert.equal(changed.files['templates/index.html'], '<main>Changed</main>');
  assert.equal(sample.files['templates/index.html'], '<main data-module="logic-workbench"></main>');
  assert.throws(() => updateModuleFile(sample, '../outside.php', 'unsafe'), /Invalid module file path/);
});

test('module importer rejects archives whose folder does not match the manifest id', async () => {
  const zip = new JSZip();
  zip.file('other/module.json', JSON.stringify(sample.manifest));
  zip.file('other/scripts/index.ts', sample.files['scripts/index.ts']);
  await assert.rejects(importModuleZip(await zip.generateAsync({ type: 'uint8array' })), /folder must match/);
});

test('endpoint modules require an origin-relative route contract', async () => {
  const endpoint: StudioModulePackage = {
    manifest: {
      id: 'health-endpoint',
      name: 'Health Endpoint',
      version: '1.0.0',
      kind: 'endpoint',
      entrypoint: 'scripts/handler.php',
      routes: ['/api/health'],
    },
    files: { 'scripts/handler.php': '<?php return ["ok" => true];' },
  };
  assert.ok((await exportModuleZip(endpoint)).byteLength > 0);
  await assert.rejects(exportModuleZip({
    ...endpoint,
    manifest: { ...endpoint.manifest, routes: ['//evil.example/api'] },
  }), /origin-relative/);
});
