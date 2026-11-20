/**
 * Resolve API and static asset URLs against optional runtime base attributes injected by index.php.
 * Keeps root ("/") deployments and Vite dev server unchanged while enabling subpath and direct checkout deployments.
 */

function readDocDataset(key: 'apiBase' | 'assetBase' | 'appBase'): string {
  if (typeof document === 'undefined') return '';
  return document.documentElement?.dataset?.[key] || '';
}

export function resolveApiUrl(url: string): string {
  const trimmed = url.trim();
  if (!/^\/(?:api|healthz)(?:\/|\?|$)/i.test(trimmed)) {
    return trimmed;
  }
  const apiBase = readDocDataset('apiBase').replace(/\/+$/, '');
  if (!apiBase) {
    return trimmed;
  }
  if (trimmed === apiBase || trimmed.startsWith(`${apiBase}/`) || trimmed.startsWith(`${apiBase}?`)) {
    return trimmed;
  }
  return `${apiBase}${trimmed}`;
}

export function resolveAssetUrl(assetPath: string): string {
  const trimmed = assetPath.trim();
  if (!trimmed || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(trimmed)) {
    return trimmed;
  }
  const assetBase = readDocDataset('assetBase');
  if (!assetBase) {
    return trimmed;
  }
  const normalizedBase = assetBase.endsWith('/') ? assetBase : `${assetBase}/`;
  return `${normalizedBase}${trimmed.replace(/^\.\//, '')}`;
}
