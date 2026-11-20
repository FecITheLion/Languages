/**
 * Shared abstract file structure. Every workbench submits its output here; the
 * engine merges (mutates) it into one virtual file tree and records a diff.
 *
 *   src/engine/*  generated engines (python / rust / wat ...)
 *   src/data/*    grammar, schema, rule + payload data
 *   module/*      vault + MCP manifests
 *   diff/*        one patch per submission
 */

export interface VfsFile {
  path: string;
  content: string;
  source: string;
  revision: number;
  updatedAt: string;
}

export interface VfsSubmissionFile {
  path: string;
  content: string;
}

export type VfsChangeKind = 'added' | 'modified' | 'unchanged';

export interface VfsChange {
  path: string;
  kind: VfsChangeKind;
  added: number;
  removed: number;
  patch: string;
}

export interface VfsSubmission {
  id: number;
  workbench: string;
  label: string;
  at: string;
  changes: VfsChange[];
}

export interface VfsState {
  files: Record<string, VfsFile>;
  submissions: VfsSubmission[];
  seq: number;
}

export const VFS_STORAGE_KEY = 'g2j.sharedTree.v1';
const MAX_SUBMISSIONS = 200;
const MAX_FILE_BYTES = 512 * 1024;

export function createEmptyVfs(): VfsState {
  return { files: {}, submissions: [], seq: 0 };
}

export function normalizeVfsPath(raw: string): string | null {
  const p = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!p || p.length > 200 || p.split('/').some((s) => s === '..' || s === '.' || s === '')) return null;
  return /^[A-Za-z0-9_.\-/]+$/.test(p) ? p : null;
}

type DiffOp = { op: ' ' | '+' | '-'; line: string };

export function diffLines(before: string, after: string): DiffOp[] {
  const a = before === '' ? [] : before.split('\n');
  const b = after === '' ? [] : after.split('\n');
  // Trim shared prefix/suffix so the LCS table stays small for typical edits.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const out: DiffOp[] = a.slice(0, start).map((line) => ({ op: ' ', line }));

  if (midA.length * midB.length > 4_000_000) {
    midA.forEach((line) => out.push({ op: '-', line }));
    midB.forEach((line) => out.push({ op: '+', line }));
  } else {
    const n = midA.length;
    const m = midB.length;
    const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        t[i][j] = midA[i] === midB[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        out.push({ op: ' ', line: midA[i] });
        i++;
        j++;
      } else if (t[i + 1][j] >= t[i][j + 1]) {
        out.push({ op: '-', line: midA[i++] });
      } else {
        out.push({ op: '+', line: midB[j++] });
      }
    }
    while (i < n) out.push({ op: '-', line: midA[i++] });
    while (j < m) out.push({ op: '+', line: midB[j++] });
  }
  a.slice(endA).forEach((line) => out.push({ op: ' ', line }));
  return out;
}

export function formatPatch(path: string, before: string | null, after: string): string {
  const ops = diffLines(before ?? '', after);
  const header = `--- ${before === null ? '/dev/null' : `a/${path}`}\n+++ b/${path}\n`;
  return header + ops.map((o) => `${o.op}${o.line}`).join('\n');
}

export function submitToTree(
  state: VfsState,
  workbench: string,
  label: string,
  files: VfsSubmissionFile[],
  now: Date = new Date()
): { state: VfsState; submission: VfsSubmission } {
  const at = now.toISOString();
  const nextFiles = { ...state.files };
  const changes: VfsChange[] = [];

  for (const f of files) {
    const path = normalizeVfsPath(f.path);
    if (!path || f.content.length > MAX_FILE_BYTES) continue;
    const prev = nextFiles[path];
    if (prev && prev.content === f.content) {
      changes.push({ path, kind: 'unchanged', added: 0, removed: 0, patch: '' });
      continue;
    }
    const ops = diffLines(prev?.content ?? '', f.content);
    changes.push({
      path,
      kind: prev ? 'modified' : 'added',
      added: ops.filter((o) => o.op === '+').length,
      removed: ops.filter((o) => o.op === '-').length,
      patch: formatPatch(path, prev ? prev.content : null, f.content),
    });
    nextFiles[path] = {
      path,
      content: f.content,
      source: workbench,
      revision: (prev?.revision ?? 0) + 1,
      updatedAt: at,
    };
  }

  const id = state.seq + 1;
  const submission: VfsSubmission = { id, workbench, label, at, changes };
  const patch = changes
    .filter((c) => c.kind !== 'unchanged')
    .map((c) => c.patch)
    .join('\n\n');
  if (patch) {
    const diffPath = `diff/${String(id).padStart(4, '0')}-${workbench}.patch`;
    nextFiles[diffPath] = { path: diffPath, content: patch, source: workbench, revision: 1, updatedAt: at };
  }

  return {
    state: {
      files: nextFiles,
      submissions: [submission, ...state.submissions].slice(0, MAX_SUBMISSIONS),
      seq: id,
    },
    submission,
  };
}

export interface VfsTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: VfsTreeNode[];
}

export function buildTree(files: Record<string, VfsFile>): VfsTreeNode {
  const root: VfsTreeNode = { name: '', path: '', isDir: true, children: [] };
  for (const path of Object.keys(files).sort()) {
    let cur = root;
    const parts = path.split('/');
    parts.forEach((name, idx) => {
      const isDir = idx < parts.length - 1;
      const childPath = parts.slice(0, idx + 1).join('/');
      let next = cur.children.find((c) => c.name === name && c.isDir === isDir);
      if (!next) {
        next = { name, path: childPath, isDir, children: [] };
        cur.children.push(next);
      }
      cur = next;
    });
  }
  const sort = (n: VfsTreeNode) => {
    n.children.sort((x, y) => (x.isDir === y.isDir ? x.name.localeCompare(y.name) : x.isDir ? -1 : 1));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

export function loadVfs(): VfsState {
  try {
    const raw = localStorage.getItem(VFS_STORAGE_KEY);
    if (!raw) return createEmptyVfs();
    const parsed = JSON.parse(raw) as VfsState;
    if (parsed && typeof parsed === 'object' && parsed.files && Array.isArray(parsed.submissions)) return parsed;
  } catch {
    /* ignore corrupt storage */
  }
  return createEmptyVfs();
}

export function saveVfs(state: VfsState): void {
  try {
    localStorage.setItem(VFS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable */
  }
}

/** Best-effort mirror to the PHP core (public/api.php). Silently no-ops when PHP is absent. */
export async function mirrorToPhp(workbench: string, files: VfsSubmissionFile[]): Promise<boolean> {
  try {
    const res = await fetch('api.php?action=submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'g2j' },
      body: JSON.stringify({ workbench, files }),
    });
    return res.ok && (res.headers.get('content-type') || '').includes('json');
  } catch {
    return false;
  }
}
