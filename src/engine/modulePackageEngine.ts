import JSZip from 'jszip';
import type { ModuleActivationConfig } from './moduleProcessingEngine.ts';

export type StudioModuleKind = 'workbench' | 'endpoint' | 'website';

export interface StudioModuleManifest {
  id: string;
  name: string;
  version: string;
  kind: StudioModuleKind;
  entrypoint: string;
  workbenchSlug?: string;
  routes?: string[];
  description?: string;
  processing?: ModuleActivationConfig;
}

export interface StudioModulePackage {
  manifest: StudioModuleManifest;
  files: Record<string, string>;
}

const MAX_FILES = 128;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
const VALID_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALID_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function assertSafePath(path: string): void {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some((part) => !part || part === '.' || part === '..') ||
    !/^(?:scripts|templates|styles|assets)\/[A-Za-z0-9._/-]+$/.test(path)
  ) {
    throw new Error(`Invalid module file path '${path}'.`);
  }
}

export function validateModule(pkg: StudioModulePackage): void {
  const { manifest, files } = pkg;
  if (!manifest || typeof manifest !== 'object' ||
    typeof manifest.id !== 'string' || !VALID_ID.test(manifest.id) ||
    typeof manifest.name !== 'string' || !manifest.name.trim() ||
    typeof manifest.version !== 'string' || typeof manifest.kind !== 'string' ||
    typeof manifest.entrypoint !== 'string') {
    throw new Error('Module manifest requires a safe id and a name.');
  }
  if (!VALID_VERSION.test(manifest.version)) throw new Error('Module version must use semver syntax.');
  if (!['workbench', 'endpoint', 'website'].includes(manifest.kind)) throw new Error('Unsupported module kind.');
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    throw new Error('Module files must be a path-to-text object.');
  }
  if (!manifest.entrypoint || !Object.hasOwn(files, manifest.entrypoint)) {
    throw new Error('Module entrypoint must reference an included file.');
  }
  if (manifest.kind === 'workbench' &&
    (typeof manifest.workbenchSlug !== 'string' || !/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(manifest.workbenchSlug))) {
    throw new Error('Workbench modules require a workbench slug.');
  }
  if (manifest.kind === 'endpoint' && !manifest.routes?.length) {
    throw new Error('Endpoint modules require at least one route.');
  }
  if (!files || Object.keys(files).length === 0 || Object.keys(files).length > MAX_FILES) {
    throw new Error(`Module must contain between 1 and ${MAX_FILES} files.`);
  }
  let totalBytes = 0;
  for (const [path, content] of Object.entries(files)) {
    assertSafePath(path);
    if (typeof content !== 'string') throw new Error(`Module file '${path}' must contain text.`);
    const bytes = new TextEncoder().encode(content).byteLength;
    if (bytes > MAX_FILE_BYTES) throw new Error(`Module file '${path}' exceeds the 1 MiB limit.`);
    totalBytes += bytes;
  }
  if (totalBytes > MAX_ARCHIVE_BYTES) throw new Error('Module content exceeds the 8 MiB limit.');
  if (manifest.routes !== undefined && (!Array.isArray(manifest.routes) ||
    manifest.routes.some((route) => typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//')))) {
    throw new Error('Module routes must be origin-relative paths.');
  }
  const activation = manifest.processing;
  if (activation) {
    if (typeof activation !== 'object' || Array.isArray(activation)) throw new Error('Module processing conditions must be an object.');
    for (const selector of [activation.routes, activation.methods, activation.workbenchSlugs, activation.blockScopes, activation.callNames]) {
      if (selector && (!Array.isArray(selector) || selector.some((value) => typeof value !== 'string' || value.length === 0))) {
        throw new Error('Module processing selectors must be arrays of non-empty strings.');
      }
    }
    if (activation.methods?.some((method) => !/^[A-Za-z]+$/.test(method))) {
      throw new Error('Module processing methods must be HTTP method names.');
    }
    if (activation.properties !== undefined &&
      (!activation.properties || typeof activation.properties !== 'object' || Array.isArray(activation.properties))) {
      throw new Error('Module processing property conditions must be an object.');
    }
    for (const [path, value] of Object.entries(activation.properties ?? {})) {
      if (!/^(?:input|environment|scope|call)(?:\.[A-Za-z0-9_-]+)+$/.test(path) ||
        path.split('.').some((segment) => ['__proto__', 'prototype', 'constructor'].includes(segment)) ||
        !['string', 'number', 'boolean'].includes(typeof value) && value !== null) {
        throw new Error(`Invalid module processing property condition '${path}'.`);
      }
    }
  }
}

export function updateModuleFile(
  pkg: StudioModulePackage,
  path: string,
  content: string
): StudioModulePackage {
  assertSafePath(path);
  const updated = { manifest: structuredClone(pkg.manifest), files: { ...pkg.files, [path]: content } };
  validateModule(updated);
  return updated;
}

export async function exportModuleZip(pkg: StudioModulePackage): Promise<Uint8Array> {
  validateModule(pkg);
  const zip = new JSZip();
  const root = zip.folder(pkg.manifest.id);
  if (!root) throw new Error('Could not create module archive folder.');
  root.file('module.json', JSON.stringify(pkg.manifest, null, 2));
  for (const [path, content] of Object.entries(pkg.files)) root.file(path, content);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error('Module archive exceeds the 8 MiB limit.');
  return bytes;
}

export async function importModuleZip(input: Blob | ArrayBuffer | Uint8Array): Promise<StudioModulePackage> {
  const bytes = input instanceof Blob
    ? new Uint8Array(await input.arrayBuffer())
    : input instanceof Uint8Array
      ? input
      : new Uint8Array(input);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error('Module archive must be non-empty and no larger than 8 MiB.');
  }
  const zip = await JSZip.loadAsync(bytes);
  const paths = Object.keys(zip.files).filter((path) => !zip.files[path].dir);
  if (paths.length < 2 || paths.length > MAX_FILES + 1) throw new Error('Module archive has an invalid file count.');
  const manifests = paths.filter((path) => /^[a-z0-9-]+\/module\.json$/.test(path));
  if (manifests.length !== 1) throw new Error('Module archive must contain exactly one root module.json.');
  const [manifestPath] = manifests;
  const root = manifestPath.slice(0, -'module.json'.length);
  const manifestEntry = zip.files[manifestPath] as typeof zip.files[string] & {
    unsafeOriginalName?: string;
    _data?: { uncompressedSize?: number };
  };
  if (manifestEntry.unsafeOriginalName && manifestEntry.unsafeOriginalName !== manifestPath) {
    throw new Error('Module archive contains an unsafe path.');
  }
  if ((manifestEntry._data?.uncompressedSize ?? MAX_FILE_BYTES + 1) > MAX_FILE_BYTES) {
    throw new Error('Module manifest exceeds the 1 MiB limit.');
  }
  const manifestFile = zip.file(manifestPath);
  if (!manifestFile) throw new Error('Module manifest is missing.');
  const manifest = JSON.parse(await manifestFile.async('string')) as StudioModuleManifest;
  const files: Record<string, string> = {};
  let totalBytes = 0;
  for (const path of paths) {
    if (path === manifestPath) continue;
    if (!path.startsWith(root)) throw new Error('Module archive contains files outside its module folder.');
    const relativePath = path.slice(root.length);
    assertSafePath(relativePath);
    const entry = zip.files[path] as typeof zip.files[string] & {
      unsafeOriginalName?: string;
      _data?: { uncompressedSize?: number };
    };
    if (entry.unsafeOriginalName && entry.unsafeOriginalName !== path) {
      throw new Error(`Module archive contains an unsafe path '${path}'.`);
    }
    if ((entry._data?.uncompressedSize ?? MAX_FILE_BYTES + 1) > MAX_FILE_BYTES) {
      throw new Error(`Module file '${relativePath}' exceeds the 1 MiB limit.`);
    }
    const file = zip.file(path);
    if (!file) throw new Error(`Module file '${relativePath}' is missing.`);
    const content = await file.async('uint8array');
    if (content.byteLength > MAX_FILE_BYTES) throw new Error(`Module file '${relativePath}' exceeds the 1 MiB limit.`);
    totalBytes += content.byteLength;
    if (totalBytes > MAX_ARCHIVE_BYTES) throw new Error('Module content exceeds the 8 MiB limit.');
    files[relativePath] = new TextDecoder('utf-8', { fatal: true }).decode(content);
  }
  const pkg = { manifest, files };
  validateModule(pkg);
  if (root !== `${manifest.id}/`) throw new Error('Archive folder must match the module id.');
  return pkg;
}
