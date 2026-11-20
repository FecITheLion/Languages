export interface SchemaStoreCatalogEntry {
  name: string;
  description: string;
  url: string;
  fileMatch?: string[];
}

export const POPULAR_SCHEMASTORE_ENTRIES: SchemaStoreCatalogEntry[] = [
  {
    name: 'package.json',
    description: 'NPM configuration file',
    url: 'https://json.schemastore.org/package.json',
    fileMatch: ['package.json'],
  },
  {
    name: 'tsconfig.json',
    description: 'TypeScript compiler configuration file',
    url: 'https://json.schemastore.org/tsconfig.json',
    fileMatch: ['tsconfig.json'],
  },
  {
    name: 'GitHub Workflow',
    description: 'GitHub Actions workflow YAML/JSON schema',
    url: 'https://json.schemastore.org/github-workflow.json',
    fileMatch: ['.github/workflows/*.yml'],
  },
  {
    name: 'composer.json',
    description: 'PHP Composer dependency manager configuration',
    url: 'https://getcomposer.org/schema.json',
    fileMatch: ['composer.json'],
  },
  {
    name: 'Prettier',
    description: 'Prettier code formatter configuration',
    url: 'https://json.schemastore.org/prettierrc.json',
    fileMatch: ['.prettierrc', '.prettierrc.json'],
  },
  {
    name: 'ESLint',
    description: 'ESLint linter configuration',
    url: 'https://json.schemastore.org/eslintrc.json',
    fileMatch: ['.eslintrc.json'],
  },
  {
    name: 'OpenAPI 3.1',
    description: 'OpenAPI Specification v3.1 schema',
    url: 'https://spec.openapis.org/oas/3.1/schema/2022-10-07',
    fileMatch: ['openapi.json'],
  },
];

function getAppBaseUrl(): string {
  if (typeof document !== 'undefined') {
    const raw = document.documentElement.dataset.appBase;
    if (raw) return raw.endsWith('/') ? raw : `${raw}/`;
  }
  return './';
}

export async function fetchSchemaStoreCatalog(): Promise<{
  ok: true;
  schemas: SchemaStoreCatalogEntry[];
  source: 'proxy' | 'direct';
} | { ok: false; error: string }> {
  const base = getAppBaseUrl();
  // 1. Try local PHP API proxy (avoids browser CORS issues)
  try {
    const resp = await fetch(`${base}api/schemastore/catalog`, {
      headers: { Accept: 'application/json' },
    });
    if (resp.ok) {
      const json = (await resp.json()) as { ok?: boolean; schemas?: SchemaStoreCatalogEntry[]; error?: string };
      if (json.ok && Array.isArray(json.schemas) && json.schemas.length > 0) {
        return { ok: true, schemas: json.schemas, source: 'proxy' };
      }
    }
  } catch {
    // Fall through to direct fetch
  }

  // 2. Fallback to direct SchemaStore catalog fetch
  try {
    const resp = await fetch('https://www.schemastore.org/api/json/catalog.json', {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) {
      return { ok: false, error: `SchemaStore catalog returned HTTP ${resp.status}.` };
    }
    const json = (await resp.json()) as { schemas?: SchemaStoreCatalogEntry[] };
    const schemas = (json.schemas || []).filter((s) => Boolean(s?.name && s?.url));
    return { ok: true, schemas, source: 'direct' };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to fetch SchemaStore catalog: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function fetchSchemaStoreDocument(url: string): Promise<
  | { ok: true; schema: Record<string, unknown>; source: 'proxy' | 'direct' }
  | { ok: false; error: string }
> {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, error: 'Schema URL cannot be empty.' };
  const base = getAppBaseUrl();

  // 1. Try local PHP API proxy
  try {
    const resp = await fetch(
      `${base}api/schemastore/schema?url=${encodeURIComponent(trimmed)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (resp.ok) {
      const json = (await resp.json()) as { ok?: boolean; schema?: Record<string, unknown>; error?: string };
      if (json.ok && json.schema && typeof json.schema === 'object') {
        return { ok: true, schema: json.schema, source: 'proxy' };
      }
    }
  } catch {
    // Fall through to direct fetch
  }

  // 2. Fallback to direct fetch
  try {
    const resp = await fetch(trimmed, { headers: { Accept: 'application/json' } });
    if (!resp.ok) {
      return { ok: false, error: `Schema URL returned HTTP ${resp.status}.` };
    }
    const parsed = (await resp.json()) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Remote URL did not return a JSON Schema object.' };
    }
    return { ok: true, schema: parsed as Record<string, unknown>, source: 'direct' };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to fetch schema: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Synthesizes a minimal valid sample JSON instance from a loaded JSON Schema object. */
export function synthesizeSampleInstanceFromSchema(
  schema: Record<string, unknown>,
  depth = 0
): unknown {
  if (depth > 4) return {};
  if ('const' in schema) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if ('default' in schema) return schema.default;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];

  const rawType = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  const props =
    schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, Record<string, unknown>>)
      : null;

  if (rawType === 'object' || props) {
    const out: Record<string, unknown> = {};
    if (props) {
      const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
      const keys = Object.keys(props);
      // Include all required keys plus up to 4 optional keys so the sample stays concise
      const selected = [
        ...keys.filter((k) => required.has(k)),
        ...keys.filter((k) => !required.has(k)).slice(0, 4),
      ].slice(0, 8);
      for (const k of selected) {
        const sub = props[k];
        if (sub && typeof sub === 'object') {
          out[k] = synthesizeSampleInstanceFromSchema(sub, depth + 1);
        }
      }
    }
    return out;
  }

  if (rawType === 'array') {
    const items =
      schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)
        ? (schema.items as Record<string, unknown>)
        : null;
    return items ? [synthesizeSampleInstanceFromSchema(items, depth + 1)] : [];
  }

  if (rawType === 'integer' || rawType === 'number') {
    const min = typeof schema.minimum === 'number' ? schema.minimum : 0;
    const exclMin = typeof schema.exclusiveMinimum === 'number' ? schema.exclusiveMinimum + 1 : min;
    return Math.max(min, exclMin);
  }

  if (rawType === 'boolean') return true;
  if (rawType === 'null') return null;

  // String fallback honoring minLength
  const minLen = typeof schema.minLength === 'number' ? Math.max(1, schema.minLength) : 4;
  return 'sample'.length >= minLen ? 'sample' : 'a'.repeat(minLen);
}
