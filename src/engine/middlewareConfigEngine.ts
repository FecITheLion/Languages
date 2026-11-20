import type {
  AwsSupportConfig,
  AzureSupportConfig,
  FrontendMiddlewareConfig,
  MiddlewareConfigState,
  SlugRouteConfig,
  SlugTemplatePatternConfig,
  TemplateFragmentConfig,
  TemplateThemeConfig,
} from '../types/studio.ts';

export const TEMPLATE_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const SLUG_IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PRETTY_BASE_PATH_PATTERN = /^\/(?:[A-Za-z0-9_-]+\/)*$/;

/** Hardcoded default templates — overridable and mutatable at runtime via Middleware Management Suite. */
export const DEFAULT_TEMPLATE_THEMES: Readonly<Record<string, TemplateThemeConfig>> = Object.freeze({
  studio: {
    name: 'studio',
    title: 'Grammar2JSON Studio',
    themeColor: '#2563eb',
    hardcodedDefault: true,
  },
  compact: {
    name: 'compact',
    title: 'Grammar Studio',
    themeColor: '#0f766e',
    hardcodedDefault: true,
  },
});

/** Hardcoded default HTML fragments — overridable and mutatable at runtime. */
export const DEFAULT_TEMPLATE_FRAGMENTS: Readonly<Record<string, TemplateFragmentConfig>> = Object.freeze({
  error: {
    name: 'error',
    markup: '<main><h1 data-template-text="title">Request error</h1><p data-template-text="message"></p></main>',
    hardcodedDefault: true,
  },
  notice: {
    name: 'notice',
    markup: '<aside role="status"><strong data-template-text="title">Notice</strong><p data-template-text="message"></p></aside>',
    hardcodedDefault: true,
  },
  status: {
    name: 'status',
    markup: '<main><h1 data-template-text="title">Status</h1><p data-template-text="message"></p></main>',
    hardcodedDefault: true,
  },
});

/** Hardcoded default route slugs — overridable, mutatable, and extensible at runtime. */
export const DEFAULT_SLUG_ROUTES: Readonly<Record<string, SlugRouteConfig>> = Object.freeze({
  home: {
    slug: 'home',
    template: 'studio',
    fragment: 'document',
    enabled: true,
    hardcodedDefault: true,
  },
  studio: {
    slug: 'studio',
    template: 'studio',
    fragment: 'document',
    enabled: true,
    hardcodedDefault: true,
  },
  compact: {
    slug: 'compact',
    template: 'compact',
    fragment: 'document',
    enabled: true,
    hardcodedDefault: true,
  },
  help: {
    slug: 'help',
    template: 'studio',
    fragment: 'status',
    title: 'Guided help',
    message: 'Choose a workbench and open its guided tour for illustrated steps.',
    enabled: true,
    hardcodedDefault: true,
  },
});

/** Hardcoded default pretty-slug templates — overridable/mutatable in the Slug Manager. */
export const DEFAULT_SLUG_PATTERNS: Readonly<Record<string, SlugTemplatePatternConfig>> = Object.freeze({
  extended_node: {
    id: 'extended_node',
    label: 'Extended Node Slug',
    pattern: '/nodes/{kind}/{nodeId}',
    targetTemplate: '/api/nodes/{kind}/{nodeId}',
    description: 'Canonical pretty route for any addressable grammar, symbol, dialect, logic, callback, or histolog node.',
    enabled: true,
    hardcodedDefault: true,
  },
  extended_member: {
    id: 'extended_member',
    label: 'Extended Node Member Slug',
    pattern: '/nodes/{kind}/{nodeId}/members/{member}',
    targetTemplate: '/api/nodes/{kind}/{nodeId}/members/{member}',
    description: 'Nested pretty route addressing an individual mutable or immutable member on a node.',
    enabled: true,
    hardcodedDefault: true,
  },
  short_member: {
    id: 'short_member',
    label: 'Short Isolated Member Slug',
    pattern: '/members/{member}?node={kind}/{nodeId}',
    targetTemplate: '/api/nodes/{kind}/{nodeId}/members/{member}',
    description: 'Compact isolated member link carrying parent node identity in the ?node= query parameter.',
    enabled: true,
    hardcodedDefault: true,
  },
  template_fragment: {
    id: 'template_fragment',
    label: 'Template Fragment Route',
    pattern: '/template/{template}/{fragment}',
    targetTemplate: '/api/templates/render?template={template}&fragment={fragment}',
    description: 'Content-negotiated (text/plain & text/html) template fragment route with ETag caching.',
    enabled: true,
    hardcodedDefault: true,
  },
});

export function createDefaultAzureConfig(env?: Record<string, string | undefined>): AzureSupportConfig {
  const flag = (env?.ENABLE_AZURE_SUPPORT ?? '').toLowerCase();
  return {
    enabled: flag === 'true' || flag === '1',
    foundryProjectEndpoint: env?.AZURE_FOUNDRY_PROJECT_ENDPOINT ?? '',
    foundryApiVersion: env?.AZURE_FOUNDRY_API_VERSION ?? '2025-05-01-preview',
    proprietaryModelDeployment: env?.AZURE_FOUNDRY_PROPRIETARY_MODEL ?? 'gpt-4.1',
    openModelDeployment: env?.AZURE_FOUNDRY_OPEN_MODEL ?? 'Llama-3.3-70B-Instruct',
    authMode: 'managed_identity',
    region: env?.AZURE_REGION ?? 'eastus2',
    resourceGroup: env?.AZURE_RESOURCE_GROUP ?? '',
  };
}

export function createDefaultAwsConfig(env?: Record<string, string | undefined>): AwsSupportConfig {
  const flag = (env?.ENABLE_AWS_SUPPORT ?? '').toLowerCase();
  return {
    enabled: flag === 'true' || flag === '1',
    region: env?.AWS_REGION ?? 'us-east-1',
    bedrockProprietaryModelId: env?.AWS_BEDROCK_PROPRIETARY_MODEL ?? 'anthropic.claude-3-7-sonnet-20250219-v1:0',
    bedrockOpenModelId: env?.AWS_BEDROCK_OPEN_MODEL ?? 'meta.llama3-3-70b-instruct-v1:0',
    agentCoreEndpoint: env?.AWS_AGENTCORE_ENDPOINT ?? '',
    s3Bucket: env?.AWS_S3_BUCKET ?? '',
    authMode: 'iam_role',
  };
}

export function createDefaultFrontendConfig(env?: Record<string, string | undefined>): FrontendMiddlewareConfig {
  const basePath = env?.PRETTY_BASE_PATH && PRETTY_BASE_PATH_PATTERN.test(env.PRETTY_BASE_PATH)
    ? env.PRETTY_BASE_PATH
    : '/';
  return {
    prettyBasePath: basePath,
    defaultTemplate: 'studio',
    defaultTopView: 'workbench',
    enableOfflineBanner: true,
    enableProgressiveDisclosure: true,
    lazyLoadGuideMedia: true,
    cacheBustVersion: 'v3',
    azure: createDefaultAzureConfig(env),
    aws: createDefaultAwsConfig(env),
  };
}

export function createDefaultMiddlewareConfig(
  env?: Record<string, string | undefined>
): MiddlewareConfigState {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    templates: Object.fromEntries(
      Object.entries(DEFAULT_TEMPLATE_THEMES).map(([k, v]) => [k, { ...v }])
    ),
    fragments: Object.fromEntries(
      Object.entries(DEFAULT_TEMPLATE_FRAGMENTS).map(([k, v]) => [k, { ...v }])
    ),
    slugRoutes: Object.fromEntries(
      Object.entries(DEFAULT_SLUG_ROUTES).map(([k, v]) => [k, { ...v }])
    ),
    slugPatterns: Object.fromEntries(
      Object.entries(DEFAULT_SLUG_PATTERNS).map(([k, v]) => [k, { ...v }])
    ),
    frontend: createDefaultFrontendConfig(env),
  };
}

export function isValidTemplateIdentifier(name: string): boolean {
  return (
    typeof name === 'string' &&
    TEMPLATE_IDENTIFIER_PATTERN.test(name) &&
    !name.includes('..') &&
    !name.includes('/') &&
    !name.includes('\\')
  );
}

export function isValidSlugName(slug: string): boolean {
  return typeof slug === 'string' && slug.length <= 64 && SLUG_IDENTIFIER_PATTERN.test(slug);
}

export function isValidPrettyBasePath(basePath: string): boolean {
  return typeof basePath === 'string' && PRETTY_BASE_PATH_PATTERN.test(basePath);
}

export function isValidSlugPattern(pattern: string): boolean {
  if (typeof pattern !== 'string') return false;
  const trimmed = pattern.trim();
  if (!trimmed.startsWith('/') || trimmed.length > 240) return false;
  if (trimmed.includes('..') || trimmed.includes('\\') || trimmed.includes('\0')) return false;
  return true;
}

export function formatPrettySlugFromPattern(
  pattern: string,
  basePath: string,
  params: Record<string, string>
): string {
  const prefix = basePath === '/' ? '' : basePath.replace(/\/+$/, '');
  const filled = pattern.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key: string) => {
    const val = params[key] ?? '';
    return encodeURIComponent(val);
  });
  return `${prefix}${filled.startsWith('/') ? filled : `/${filled}`}`;
}

export function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Safe text-only substitution for template fragments (mirrors PHP DOMDocument textContent escaping). */
export function renderFragmentHtmlSafe(
  markup: string,
  values: Record<string, string> = {}
): string {
  return markup.replace(
    /(<[a-zA-Z0-9-]+\b[^>]*\bdata-template-text="([A-Za-z0-9_-]+)"[^>]*>)([\s\S]*?)(<\/[a-zA-Z0-9-]+>)/g,
    (full, openTag: string, key: string, inner: string, closeTag: string) => {
      if (!Object.prototype.hasOwnProperty.call(values, key)) return full;
      return `${openTag}${escapeHtmlText(String(values[key]))}${closeTag}`;
    }
  );
}

export function computeMiddlewareEtag(parts: Array<string | number>): string {
  // Deterministic FNV-1a 64-bit hex ETag (fast, browser+Node+PHP compatible)
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const input = parts.join('\u001f');
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x01000193);
  }
  const hex = `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
  return `"mw-${hex}"`;
}

export function mergeMiddlewareConfigPatch(
  current: MiddlewareConfigState,
  patch: Partial<MiddlewareConfigState>
): { ok: true; state: MiddlewareConfigState } | { ok: false; error: string } {
  const next: MiddlewareConfigState = {
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
    templates: { ...current.templates },
    fragments: { ...current.fragments },
    slugRoutes: { ...current.slugRoutes },
    slugPatterns: { ...current.slugPatterns },
    frontend: {
      ...current.frontend,
      azure: { ...current.frontend.azure },
      aws: { ...current.frontend.aws },
    },
  };

  if (patch.templates) {
    for (const [key, cfg] of Object.entries(patch.templates)) {
      if (!isValidTemplateIdentifier(key)) {
        return { ok: false, error: `Invalid template identifier '${key}'. Use lowercase letters, digits, hyphens, or underscores.` };
      }
      if (!cfg) {
        if (DEFAULT_TEMPLATE_THEMES[key]) {
          next.templates[key] = { ...DEFAULT_TEMPLATE_THEMES[key] };
        } else {
          delete next.templates[key];
        }
        continue;
      }
      next.templates[key] = {
        name: key,
        title: String(cfg.title || key).slice(0, 120),
        themeColor: /^#[0-9a-fA-F]{3,8}$/.test(String(cfg.themeColor || '')) ? String(cfg.themeColor) : '#2563eb',
        hardcodedDefault: Boolean(DEFAULT_TEMPLATE_THEMES[key]),
      };
    }
  }

  if (patch.fragments) {
    for (const [key, cfg] of Object.entries(patch.fragments)) {
      if (!isValidTemplateIdentifier(key)) {
        return { ok: false, error: `Invalid fragment identifier '${key}'. Use lowercase letters, digits, hyphens, or underscores.` };
      }
      if (!cfg) {
        if (DEFAULT_TEMPLATE_FRAGMENTS[key]) {
          next.fragments[key] = { ...DEFAULT_TEMPLATE_FRAGMENTS[key] };
        } else {
          delete next.fragments[key];
        }
        continue;
      }
      const markup = String(cfg.markup || '').trim();
      if (!markup || markup.length > 65536) {
        return { ok: false, error: `Fragment '${key}' markup must be between 1 and 65536 characters.` };
      }
      if (/<script\b|javascript:|on[a-z]+\s*=/i.test(markup)) {
        return { ok: false, error: `Fragment '${key}' cannot contain inline scripts or event handlers.` };
      }
      next.fragments[key] = {
        name: key,
        markup,
        hardcodedDefault: Boolean(DEFAULT_TEMPLATE_FRAGMENTS[key]),
      };
    }
  }

  if (patch.slugRoutes) {
    for (const [slug, cfg] of Object.entries(patch.slugRoutes)) {
      if (!isValidSlugName(slug)) {
        return { ok: false, error: `Invalid route slug '${slug}'. Use lowercase letters, digits, and hyphens.` };
      }
      if (!cfg) {
        delete next.slugRoutes[slug];
        continue;
      }
      const template = String(cfg.template || 'studio');
      const fragment = String(cfg.fragment || 'document');
      if (!isValidTemplateIdentifier(template) || !next.templates[template]) {
        return { ok: false, error: `Slug '${slug}' references unknown template '${template}'.` };
      }
      if (fragment !== 'document' && (!isValidTemplateIdentifier(fragment) || !next.fragments[fragment])) {
        return { ok: false, error: `Slug '${slug}' references unknown fragment '${fragment}'.` };
      }
      next.slugRoutes[slug] = {
        slug,
        template,
        fragment,
        title: typeof cfg.title === 'string' ? cfg.title.slice(0, 160) : undefined,
        message: typeof cfg.message === 'string' ? cfg.message.slice(0, 500) : undefined,
        enabled: cfg.enabled !== false,
        hardcodedDefault: Boolean(DEFAULT_SLUG_ROUTES[slug]),
      };
    }
  }

  if (patch.slugPatterns) {
    for (const [id, cfg] of Object.entries(patch.slugPatterns)) {
      if (!isValidTemplateIdentifier(id)) {
        return { ok: false, error: `Invalid slug pattern ID '${id}'.` };
      }
      if (!cfg) {
        if (DEFAULT_SLUG_PATTERNS[id]) {
          next.slugPatterns[id] = { ...DEFAULT_SLUG_PATTERNS[id] };
        } else {
          delete next.slugPatterns[id];
        }
        continue;
      }
      if (!isValidSlugPattern(cfg.pattern)) {
        return { ok: false, error: `Slug pattern '${id}' must start with '/' and not contain '..' or backslashes.` };
      }
      if (!isValidSlugPattern(cfg.targetTemplate)) {
        return { ok: false, error: `Slug pattern '${id}' target template must start with '/' and be safe.` };
      }
      next.slugPatterns[id] = {
        id,
        label: String(cfg.label || id).slice(0, 80),
        pattern: cfg.pattern.trim(),
        targetTemplate: cfg.targetTemplate.trim(),
        description: String(cfg.description || '').slice(0, 300),
        enabled: cfg.enabled !== false,
        hardcodedDefault: Boolean(DEFAULT_SLUG_PATTERNS[id]),
      };
    }
  }

  if (patch.frontend) {
    const f = patch.frontend;
    if (typeof f.prettyBasePath === 'string') {
      if (!isValidPrettyBasePath(f.prettyBasePath)) {
        return { ok: false, error: 'PRETTY_BASE_PATH must be / or a slash-terminated path of letters, digits, hyphens, and underscores.' };
      }
      next.frontend.prettyBasePath = f.prettyBasePath;
    }
    if (typeof f.defaultTemplate === 'string') {
      if (!next.templates[f.defaultTemplate]) {
        return { ok: false, error: `Unknown default template '${f.defaultTemplate}'.` };
      }
      next.frontend.defaultTemplate = f.defaultTemplate;
    }
    if (typeof f.defaultTopView === 'string') next.frontend.defaultTopView = f.defaultTopView;
    if (typeof f.enableOfflineBanner === 'boolean') next.frontend.enableOfflineBanner = f.enableOfflineBanner;
    if (typeof f.enableProgressiveDisclosure === 'boolean') next.frontend.enableProgressiveDisclosure = f.enableProgressiveDisclosure;
    if (typeof f.lazyLoadGuideMedia === 'boolean') next.frontend.lazyLoadGuideMedia = f.lazyLoadGuideMedia;
    if (typeof f.cacheBustVersion === 'string' && /^[a-zA-Z0-9._-]{1,32}$/.test(f.cacheBustVersion)) {
      next.frontend.cacheBustVersion = f.cacheBustVersion;
    }
    if (f.azure) {
      next.frontend.azure = { ...next.frontend.azure, ...f.azure };
    }
    if (f.aws) {
      next.frontend.aws = { ...next.frontend.aws, ...f.aws };
    }
  }

  return { ok: true, state: next };
}

/** Generate optional Azure / Microsoft Foundry deployment & MCP bridge manifest (only active when azure.enabled). */
export function buildAzureDeploymentBundle(
  config: AzureSupportConfig,
  origin: string
): Record<string, unknown> {
  const cleanOrigin = origin.replace(/\/+$/, '');
  return {
    provider: 'azure',
    enabled: config.enabled,
    product: 'Microsoft Foundry — AI Agents & Workflows',
    projectEndpoint: config.foundryProjectEndpoint || 'https://<resource>.services.ai.azure.com/api/projects/<project>',
    apiVersion: config.foundryApiVersion,
    region: config.region,
    resourceGroup: config.resourceGroup || 'rg-grammar2json-foundry',
    authMode: config.authMode,
    models: {
      proprietary: {
        deploymentName: config.proprietaryModelDeployment,
        family: 'proprietary',
        exampleProviders: ['Azure OpenAI (GPT-4.1 / o4-mini)', 'Anthropic Claude on Foundry'],
      },
      open: {
        deploymentName: config.openModelDeployment,
        family: 'open',
        exampleProviders: ['Meta Llama 3.3', 'Mistral Large / Small', 'DeepSeek-R1', 'Phi-4'],
      },
    },
    mcpEndpoints: {
      unified: `${cleanOrigin}/api/mcp`,
      serversDiscovery: `${cleanOrigin}/api/mcp/servers`,
      foundryExport: `${cleanOrigin}/api/mcp/all/export/foundry`,
    },
    envFlags: {
      ENABLE_AZURE_SUPPORT: config.enabled ? 'true' : 'false',
      AZURE_FOUNDRY_PROJECT_ENDPOINT: config.foundryProjectEndpoint,
      AZURE_FOUNDRY_PROPRIETARY_MODEL: config.proprietaryModelDeployment,
      AZURE_FOUNDRY_OPEN_MODEL: config.openModelDeployment,
    },
  };
}

/** Generate optional AWS Bedrock / AgentCore deployment & MCP bridge manifest (only active when aws.enabled). */
export function buildAwsDeploymentBundle(
  config: AwsSupportConfig,
  origin: string
): Record<string, unknown> {
  const cleanOrigin = origin.replace(/\/+$/, '');
  return {
    provider: 'aws',
    enabled: config.enabled,
    product: 'AWS Bedrock Agents & AgentCore MCP Gateway',
    region: config.region,
    authMode: config.authMode,
    s3Bucket: config.s3Bucket || 'grammar2json-studio-artifacts',
    agentCoreEndpoint: config.agentCoreEndpoint || `https://bedrock-agentcore.${config.region}.amazonaws.com`,
    models: {
      proprietary: {
        modelId: config.bedrockProprietaryModelId,
        family: 'proprietary',
      },
      open: {
        modelId: config.bedrockOpenModelId,
        family: 'open',
      },
    },
    mcpEndpoints: {
      unified: `${cleanOrigin}/api/mcp`,
      serversDiscovery: `${cleanOrigin}/api/mcp/servers`,
      bedrockExport: `${cleanOrigin}/api/mcp/all/export/aws_bedrock`,
    },
    envFlags: {
      ENABLE_AWS_SUPPORT: config.enabled ? 'true' : 'false',
      AWS_REGION: config.region,
      AWS_BEDROCK_PROPRIETARY_MODEL: config.bedrockProprietaryModelId,
      AWS_BEDROCK_OPEN_MODEL: config.bedrockOpenModelId,
    },
  };
}
