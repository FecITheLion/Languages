/** In-memory artifacts; paths are identifiers, never filesystem destinations. */
export interface VirtualSubmission {
  path: string;
  content: string;
  target?: 'jsonld' | 'python' | 'rust' | 'wasm';
  targets?: Array<'jsonld' | 'python' | 'rust' | 'wasm'>;
  filename?: string;
}
export interface VirtualFile extends VirtualSubmission {
  owner: string;
  source: string | null;
  edit: string | null;
  base: string | null;
  conflict: boolean;
  editTarget?: VirtualSubmission['target'];
  editTargets?: VirtualSubmission['targets'];
  sourcePending?: boolean;
}
export type VirtualFiles = Record<string, VirtualFile>;
export class VirtualFilesError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(issues.join('; '));
    this.name = 'VirtualFilesError';
    this.issues = issues;
  }
}
export function virtualEditAllowed(file: Pick<VirtualFile, 'target' | 'editTarget' | 'targets' | 'editTargets'>, policy: { lockedRules: string[]; allowedTargets: string[] }): boolean {
  return policy.lockedRules.length === 0 && (!file.target || policy.allowedTargets.includes(file.target)) &&
    (!file.editTarget || policy.allowedTargets.includes(file.editTarget)) &&
    [...(file.targets ?? []), ...(file.editTargets ?? [])].every(target => policy.allowedTargets.includes(target));
}

export function validVirtualPath(path: string): boolean {
  return path.length > 0 && path.length <= 240 && !path.startsWith('/') && !path.includes('\\') &&
    path.split('/').every(part => !!part && !['.', '..', '__proto__', 'constructor', 'prototype'].includes(part) && !/[\x00-\x1f]/.test(part));
}

export function submitVirtualFiles(files: VirtualFiles, owner: string, submissions: VirtualSubmission[]): VirtualFiles {
  const next: VirtualFiles = Object.assign(Object.create(null), files);
  const seen = new Set<string>();
  const issues: string[] = [];
  for (const item of submissions) {
    if (!validVirtualPath(item.path)) { issues.push(`Invalid path: ${item.path}`); continue; }
    if (seen.has(item.path)) { issues.push(`Duplicate path: ${item.path}`); continue; }
    seen.add(item.path);
    if (Object.keys(next).some(path => path !== item.path && (path.startsWith(`${item.path}/`) || item.path.startsWith(`${path}/`)))) {
      issues.push(`File/directory collision: ${item.path}`); continue;
    }
    const old = next[item.path];
    if (old && old.owner !== owner) { issues.push(`Owned by ${old.owner}: ${item.path}`); continue; }
    const filename = item.filename && validVirtualPath(item.filename) && !item.filename.includes('/') ? item.filename : undefined;
    next[item.path] = { ...item, filename, owner, source: item.content, edit: old?.edit ?? null, base: old?.base ?? null, editTarget: old?.editTarget, editTargets: old?.editTargets,
      conflict: old?.conflict ?? false };
    if (old && old.edit !== null && (old.source !== item.content || old.target !== item.target || old.filename !== filename || JSON.stringify(old.targets ?? []) !== JSON.stringify(item.targets ?? []))) next[item.path].conflict = true;
  }
  if (issues.length) throw new VirtualFilesError(issues);
  for (const [path, file] of Object.entries(next)) {
    if (file.owner !== owner || seen.has(path)) continue;
    if (file.edit !== null) next[path] = { ...file, source: null, sourcePending: false, conflict: file.conflict || file.source !== null };
    else delete next[path];
  }
  return JSON.stringify(next) === JSON.stringify(files) ? files : next;
}

export function editVirtualFile(files: VirtualFiles, path: string, content: string): VirtualFiles {
  const file = Object.hasOwn(files, path) ? files[path] : undefined;
  if (!file) return files;
  const edit = content === file.source && !file.sourcePending && !hasVirtualConflict(file) ? null : content;
  return { ...files, [path]: { ...file, edit, base: edit === null ? null : file.edit === null ? file.source : file.base, editTarget: edit === null ? undefined : file.edit === null ? file.target : file.editTarget, editTargets: edit === null ? undefined : file.edit === null ? file.targets : file.editTargets, conflict: edit === null ? false : file.conflict } };
}
export function hasVirtualConflict(file: VirtualFile): boolean {
  return file.edit !== null && file.conflict;
}
export function resolveVirtualFile(files: VirtualFiles, path: string, choice: 'source' | 'edit'): VirtualFiles {
  const file = Object.hasOwn(files, path) ? files[path] : undefined;
  if (!file) return files;
  if (file.sourcePending) {
    if (choice === 'edit') return files;
    const next = { ...files }; delete next[path]; return next;
  }
  if (choice === 'source' && file.source === null) {
    const next = { ...files }; delete next[path]; return next;
  }
  return { ...files, [path]: choice === 'source'
    ? { ...file, edit: null, base: null, editTarget: undefined, editTargets: undefined, conflict: false }
    : { ...file, base: file.source, editTarget: file.target, editTargets: file.targets, conflict: false } };
}
export function parseVirtualFiles(value: unknown): { files: VirtualFiles; issues: string[] } {
  const result: VirtualFiles = Object.create(null);
  const issues: string[] = [];
  if (value === undefined) return { files: result, issues };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { files: result, issues: ['Virtual files must be an object.'] };
  for (const [path, item] of Object.entries(value)) {
    if (!validVirtualPath(path) || !item || typeof item !== 'object' || Array.isArray(item)) {
      issues.push(`Invalid virtual file: ${path}`); continue;
    }
    const f = item as VirtualFile;
    if (f.path !== path || typeof f.owner !== 'string' || typeof f.content !== 'string' ||
      !(typeof f.source === 'string' || f.source === null) || !(typeof f.edit === 'string' || f.edit === null) ||
      !(typeof f.base === 'string' || f.base === null) ||
      (f.target !== undefined && !['jsonld', 'python', 'rust', 'wasm'].includes(f.target)) ||
      (f.editTarget !== undefined && !['jsonld', 'python', 'rust', 'wasm'].includes(f.editTarget)) ||
      (f.targets !== undefined && (!Array.isArray(f.targets) || !f.targets.every(t => ['jsonld', 'python', 'rust', 'wasm'].includes(t)))) ||
      (f.editTargets !== undefined && (!Array.isArray(f.editTargets) || !f.editTargets.every(t => ['jsonld', 'python', 'rust', 'wasm'].includes(t)))) ||
      (f.filename !== undefined && (typeof f.filename !== 'string' || !validVirtualPath(f.filename) || f.filename.includes('/')))) {
      issues.push(`Malformed virtual file: ${path}`); continue;
    }
    if (Object.keys(result).some(existing => existing.startsWith(`${path}/`) || path.startsWith(`${existing}/`))) {
      issues.push(`File/directory collision: ${path}`); continue;
    }
    result[path] = { path, owner: f.owner, content: f.content, source: f.source, edit: f.edit, base: f.base, conflict: typeof f.conflict === 'boolean' ? f.conflict : f.edit !== null && f.base !== f.source, ...(f.target ? { target: f.target } : {}), ...(f.targets ? { targets: f.targets } : {}), ...((f.editTarget || (f.edit !== null && f.target)) ? { editTarget: f.editTarget ?? f.target } : {}), ...((f.editTargets || (f.edit !== null && f.targets)) ? { editTargets: f.editTargets ?? f.targets } : {}), ...(f.filename ? { filename: f.filename } : {}), ...(f.sourcePending === true ? { sourcePending: true } : {}) };
  }
  return { files: result, issues };
}
export function readVirtualFiles(value: unknown): VirtualFiles {
  const { files, issues } = parseVirtualFiles(value);
  if (issues.length) throw new VirtualFilesError(issues);
  return files;
}
export function mergeVirtualFiles(current: VirtualFiles, imported: VirtualFiles): VirtualFiles {
  const next: VirtualFiles = Object.assign(Object.create(null), current);
  const available = (path: string) => validVirtualPath(path) && !Object.keys(next).some(existing =>
    existing === path || existing.startsWith(`${path}/`) || path.startsWith(`${existing}/`));
  for (const [path, file] of Object.entries(imported)) {
    const existing = next[path];
    if ((!existing && available(path)) || (existing && existing.edit === null)) {
      next[path] = file;
    } else if (file.edit !== null && (!existing || file.edit !== existing.edit)) {
      let recovered = `recovered/${path}`;
      let index = 2;
      while (!available(recovered)) recovered = `recovered-file-${index++}.txt`;
      next[recovered] = { ...file, path: recovered, owner: 'recovered', source: null, conflict: true };
    }
  }
  return next;
}
export function virtualEdits(files: VirtualFiles): VirtualFiles {
  const result: VirtualFiles = Object.create(null);
  for (const [path, file] of Object.entries(files)) {
    if (file.edit !== null) {
      const { sourcePending: _sourcePending, ...saved } = file;
      result[path] = { ...saved, source: file.base, content: file.base ?? '' };
    }
  }
  return result;
}
export function restoreAutoSavedVirtualEdits(value: unknown): VirtualFiles {
  const result = virtualEdits(readVirtualFiles(value));
  for (const [path, file] of Object.entries(result)) {
    result[path] = file.owner === 'recovered'
      ? { ...file, source: null }
      : { ...file, sourcePending: true };
  }
  return result;
}
export function serializeVaultListing(mode: 'drive' | 'demo', records: Array<{ id: string; name: string; updatedAt: string; sizeBytes: number; source: string }>): string {
  return JSON.stringify({ mode, files: records.map(({ id, name, updatedAt, sizeBytes, source }) => ({ id, name, updatedAt, sizeBytes, source })) }, null, 2);
}
export function restoreVirtualEdits(files: VirtualFiles, edits: VirtualFiles): VirtualFiles {
  const next: VirtualFiles = Object.create(null);
  for (const [path, file] of Object.entries(files)) {
    if (file.source !== null) next[path] = { ...file, edit: null, base: null, editTarget: undefined, editTargets: undefined, conflict: false };
  }
  for (const [path, saved] of Object.entries(readVirtualFiles(edits))) {
    if (saved.edit === null) continue;
    const live = next[path];
    next[path] = live && live.owner === saved.owner
      ? { ...live, edit: saved.edit, base: saved.base, editTarget: saved.editTarget, editTargets: saved.editTargets, conflict: saved.conflict || live.source !== saved.base }
      : { ...saved, source: null, conflict: saved.conflict || saved.base !== null };
  }
  return next;
}
export interface VirtualTreeNode { name: string; path: string; children?: VirtualTreeNode[] }
export function buildVirtualTree(files: VirtualFiles): VirtualTreeNode[] {
  const root: VirtualTreeNode[] = [];
  for (const path of Object.keys(files).filter(validVirtualPath).sort()) {
    const parts = path.split('/'); let children = root;
    parts.forEach((name, i) => {
      const nodePath = parts.slice(0, i + 1).join('/');
      let node = children.find(n => n.name === name && Boolean(n.children) === (i < parts.length - 1));
      if (!node) { node = { name, path: nodePath, ...(i < parts.length - 1 ? { children: [] } : {}) }; children.push(node); }
      if (node.children) children = node.children;
    });
  }
  return root;
}
