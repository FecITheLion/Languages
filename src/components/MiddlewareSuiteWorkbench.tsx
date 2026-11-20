import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Cloud,
  Copy,
  Download,
  LayoutTemplate,
  Link2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sliders,
  Trash2,
} from 'lucide-react';
import {
  buildAwsDeploymentBundle,
  buildAzureDeploymentBundle,
  createDefaultMiddlewareConfig,
  DEFAULT_SLUG_PATTERNS,
  DEFAULT_SLUG_ROUTES,
  DEFAULT_TEMPLATE_FRAGMENTS,
  DEFAULT_TEMPLATE_THEMES,
  formatPrettySlugFromPattern,
  isValidSlugName,
  isValidTemplateIdentifier,
  mergeMiddlewareConfigPatch,
  renderFragmentHtmlSafe,
} from '../engine/middlewareConfigEngine';
import { generateMcpExportForClient, generateOpenAiApiToolsManifest } from '../engine/mcpServerEngine';
import { resolveApiUrl } from '../engine/runtimePaths';
import type { MiddlewareConfigState } from '../types/studio';
import { GuidedHelp } from './GuidedHelp';

const STORAGE_KEY = 'g2j.middlewareConfig.v1';

interface MiddlewareSuiteWorkbenchProps {
  onDownloadFile: (content: string, filename: string, mime: string) => void;
  onNotify: (msg: string) => void;
  onFrontendConfigChange?: (config: MiddlewareConfigState['frontend']) => void;
}

type MiddlewareBranch = 'templates' | 'slugs' | 'frontend';

export function MiddlewareSuiteWorkbench({
  onDownloadFile,
  onNotify,
  onFrontendConfigChange,
}: MiddlewareSuiteWorkbenchProps) {
  const [branch, setBranch] = useState<MiddlewareBranch>('slugs');
  const [config, setConfig] = useState<MiddlewareConfigState>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as MiddlewareConfigState;
    } catch {
      // ignore storage errors
    }
    return createDefaultMiddlewareConfig();
  });
  const [serverSynced, setServerSynced] = useState<'unknown' | 'synced' | 'local'>('unknown');
  const [busy, setBusy] = useState(false);

  // Slug editor state
  const [newSlugName, setNewSlugName] = useState('');
  const [newSlugTemplate, setNewSlugTemplate] = useState('studio');
  const [newSlugFragment, setNewSlugFragment] = useState('status');
  const [newSlugTitle, setNewSlugTitle] = useState('');
  const [newSlugMessage, setNewSlugMessage] = useState('');
  const [previewKind, setPreviewKind] = useState('rule');
  const [previewNodeId, setPreviewNodeId] = useState('order_expr');
  const [previewMember, setPreviewMember] = useState('expression');

  // Template editor state
  const [newTplName, setNewTplName] = useState('');
  const [newTplTitle, setNewTplTitle] = useState('');
  const [newTplColor, setNewTplColor] = useState('#2563eb');
  const [newFragName, setNewFragName] = useState('');
  const [newFragMarkup, setNewFragMarkup] = useState(
    '<section><h2 data-template-text="title">Banner</h2><p data-template-text="message"></p></section>'
  );
  const [previewFragKey, setPreviewFragKey] = useState('notice');
  const [previewTitle, setPreviewTitle] = useState('Live Preview');
  const [previewMsg, setPreviewMsg] = useState('Rendered safely with text-node escaping.');

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const persistLocal = useCallback(
    (next: MiddlewareConfigState) => {
      setConfig(next);
      onFrontendConfigChange?.(next.frontend);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
    },
    [onFrontendConfigChange]
  );

  const loadFromServer = useCallback(async () => {
    try {
      const res = await fetch(resolveApiUrl('/api/middleware/config'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Partial<MiddlewareConfigState>;
      if (data.templates && data.slugRoutes && data.frontend) {
        const merged = mergeMiddlewareConfigPatch(createDefaultMiddlewareConfig(), data);
        if (merged.ok) {
          persistLocal(merged.state);
          setServerSynced('synced');
          return;
        }
      }
    } catch {
      setServerSynced('local');
    }
  }, [persistLocal]);

  useEffect(() => {
    void loadFromServer();
  }, [loadFromServer]);

  const applyAndSync = async (patch: Partial<MiddlewareConfigState>, successMessage: string) => {
    const merged = mergeMiddlewareConfigPatch(config, patch);
    if (!merged.ok) {
      onNotify(merged.error);
      return;
    }
    persistLocal(merged.state);
    setBusy(true);
    try {
      const res = await fetch(resolveApiUrl('/api/middleware/config'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setServerSynced('synced');
        onNotify(`${successMessage} (synced to server & invalidated template cache)`);
      } else {
        setServerSynced('local');
        onNotify(`${successMessage} (saved locally; server write returned ${res.status})`);
      }
    } catch {
      setServerSynced('local');
      onNotify(`${successMessage} (saved locally — offline or static host)`);
    } finally {
      setBusy(false);
    }
  };

  const handleResetBranch = async (targetBranch: 'all' | 'slugs' | 'templates' | 'frontend') => {
    const defaults = createDefaultMiddlewareConfig();
    const patch: Partial<MiddlewareConfigState> =
      targetBranch === 'slugs'
        ? { slugRoutes: defaults.slugRoutes, slugPatterns: defaults.slugPatterns }
        : targetBranch === 'templates'
          ? { templates: defaults.templates, fragments: defaults.fragments }
          : targetBranch === 'frontend'
            ? { frontend: defaults.frontend }
            : defaults;
    await applyAndSync(patch, `Reset ${targetBranch} middleware settings to hardcoded defaults`);
  };

  const renderedPreviewHtml = useMemo(() => {
    const frag = config.fragments[previewFragKey];
    if (!frag) return '';
    return renderFragmentHtmlSafe(frag.markup, { title: previewTitle, message: previewMsg });
  }, [config.fragments, previewFragKey, previewTitle, previewMsg]);

  const azureBundle = useMemo(
    () => buildAzureDeploymentBundle(config.frontend.azure, origin),
    [config.frontend.azure, origin]
  );
  const awsBundle = useMemo(
    () => buildAwsDeploymentBundle(config.frontend.aws, origin),
    [config.frontend.aws, origin]
  );
  const openAiManifest = useMemo(
    () => generateOpenAiApiToolsManifest(origin, { scope: 'all', format: 'responses' }),
    [origin]
  );

  const handleAddSlug = () => {
    const slug = newSlugName.trim().toLowerCase();
    if (!isValidSlugName(slug)) {
      onNotify('Slug must use lowercase letters, digits, and hyphens (e.g. docs-guide).');
      return;
    }
    void applyAndSync(
      {
        slugRoutes: {
          [slug]: {
            slug,
            template: newSlugTemplate,
            fragment: newSlugFragment,
            title: newSlugTitle.trim() || slug,
            message: newSlugMessage.trim() || undefined,
            enabled: true,
          },
        },
      },
      `Saved route slug /${slug}`
    );
    setNewSlugName('');
    setNewSlugTitle('');
    setNewSlugMessage('');
  };

  const handleAddTemplate = () => {
    const name = newTplName.trim().toLowerCase();
    if (!isValidTemplateIdentifier(name)) {
      onNotify('Template name must start with a lowercase letter/digit and use only a-z, 0-9, -, _.');
      return;
    }
    void applyAndSync(
      {
        templates: {
          [name]: {
            name,
            title: newTplTitle.trim() || name,
            themeColor: newTplColor,
          },
        },
      },
      `Saved template '${name}'`
    );
    setNewTplName('');
    setNewTplTitle('');
  };

  const handleAddFragment = () => {
    const name = newFragName.trim().toLowerCase();
    if (!isValidTemplateIdentifier(name)) {
      onNotify('Fragment name must start with a lowercase letter/digit and use only a-z, 0-9, -, _.');
      return;
    }
    void applyAndSync(
      {
        fragments: {
          [name]: { name, markup: newFragMarkup },
        },
      },
      `Saved fragment '${name}'`
    );
    setNewFragName('');
  };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Middleware Management Suite
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Hardcoded defaults that remain overridable and mutatable at runtime across Templates, Slugs, and Front-End &amp; Cloud Integrations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                serverSynced === 'synced'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
              }`}
            >
              {serverSynced === 'synced' ? 'API Synced' : 'Local / Static Fallback'} · v{config.version}
            </span>
            <button
              type="button"
              onClick={() => void loadFromServer()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleResetBranch('all')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset All Defaults
            </button>
            <GuidedHelp context="middleware" />
          </div>
        </div>

        {/* 3-Branch Navigation */}
        <div
          data-tour-id="view.middleware.branches"
          role="tablist"
          aria-label="Middleware management branches"
          className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-800"
        >
          {(
            [
              ['slugs', 'Slug Management & Patterns', Link2],
              ['templates', 'Template & Fragment Engine', LayoutTemplate],
              ['frontend', 'Front-End, OpenAI & Optional Cloud (Azure / AWS)', Sliders],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={branch === id}
              onClick={() => setBranch(id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                branch === id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* BRANCH 1: SLUG MANAGEMENT */}
      {branch === 'slugs' && (
        <div data-tour-id="view.middleware.slugs" className="grid gap-4 lg:grid-cols-2">
          {/* Route Slugs */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Route Slugs (Hardcoded Defaults + Custom Overrides)
              </h3>
              <button
                type="button"
                onClick={() => void handleResetBranch('slugs')}
                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Reset Slugs
              </button>
            </div>

            <div className="space-y-2">
              {Object.values(config.slugRoutes).map((route) => {
                const isDefault = Boolean(DEFAULT_SLUG_ROUTES[route.slug]);
                return (
                  <div
                    key={route.slug}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/60"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <code className="font-mono font-bold text-blue-700 dark:text-blue-300">
                          {config.frontend.prettyBasePath === '/' ? '' : config.frontend.prettyBasePath.slice(0, -1)}/{route.slug}
                        </code>
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {isDefault ? 'Hardcoded default (overridable)' : 'Custom slug'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1 text-[11px]">
                          <input
                            type="checkbox"
                            checked={route.enabled}
                            onChange={(e) =>
                              void applyAndSync(
                                { slugRoutes: { [route.slug]: { ...route, enabled: e.target.checked } } },
                                `${e.target.checked ? 'Enabled' : 'Disabled'} slug /${route.slug}`
                              )
                            }
                          />
                          Active
                        </label>
                        {!isDefault && (
                          <button
                            type="button"
                            aria-label={`Delete slug ${route.slug}`}
                            onClick={() =>
                              void applyAndSync(
                                { slugRoutes: { [route.slug]: undefined as unknown as typeof route } },
                                `Removed custom slug /${route.slug}`
                              )
                            }
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[10px] text-slate-500">Template</span>
                        <select
                          value={route.template}
                          onChange={(e) =>
                            void applyAndSync(
                              { slugRoutes: { [route.slug]: { ...route, template: e.target.value } } },
                              `Updated template for /${route.slug}`
                            )
                          }
                          className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                        >
                          {Object.keys(config.templates).map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-slate-500">Fragment</span>
                        <select
                          value={route.fragment}
                          onChange={(e) =>
                            void applyAndSync(
                              { slugRoutes: { [route.slug]: { ...route, fragment: e.target.value } } },
                              `Updated fragment for /${route.slug}`
                            )
                          }
                          className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                        >
                          <option value="document">document (Full SPA)</option>
                          {Object.keys(config.fragments).map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add / Override Slug Form */}
            <div className="rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
              <div className="mb-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                Add or Override Route Slug
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newSlugName}
                  onChange={(e) => setNewSlugName(e.target.value)}
                  placeholder="slug-name (e.g. docs)"
                  className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <input
                  type="text"
                  value={newSlugTitle}
                  onChange={(e) => setNewSlugTitle(e.target.value)}
                  placeholder="Page / Fragment Title"
                  className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <select
                  value={newSlugTemplate}
                  onChange={(e) => setNewSlugTemplate(e.target.value)}
                  className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                >
                  {Object.keys(config.templates).map((t) => (
                    <option key={t} value={t}>
                      Template: {t}
                    </option>
                  ))}
                </select>
                <select
                  value={newSlugFragment}
                  onChange={(e) => setNewSlugFragment(e.target.value)}
                  className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="document">document (SPA)</option>
                  {Object.keys(config.fragments).map((f) => (
                    <option key={f} value={f}>
                      Fragment: {f}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                value={newSlugMessage}
                onChange={(e) => setNewSlugMessage(e.target.value)}
                placeholder="Optional fragment message"
                className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                type="button"
                disabled={busy}
                onClick={handleAddSlug}
                className="mt-2 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" /> Save Slug Route
              </button>
            </div>
          </div>

          {/* Slug Templates / Patterns + Live URL Tester */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Slug Template Patterns (Overridable) &amp; Live Resolver
            </h3>
            <div className="space-y-2">
              {Object.values(config.slugPatterns).map((pat) => (
                <div
                  key={pat.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{pat.label}</span>
                    {DEFAULT_SLUG_PATTERNS[pat.id] && (
                      <button
                        type="button"
                        onClick={() =>
                          void applyAndSync(
                            { slugPatterns: { [pat.id]: { ...DEFAULT_SLUG_PATTERNS[pat.id] } } },
                            `Restored hardcoded pattern for ${pat.id}`
                          )
                        }
                        className="text-[11px] text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Reset default
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">{pat.description}</p>
                  <div className="mt-2 space-y-1.5">
                    <label className="block">
                      <span className="text-[10px] text-slate-500">Pretty URL Pattern</span>
                      <input
                        type="text"
                        value={pat.pattern}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            slugPatterns: {
                              ...prev.slugPatterns,
                              [pat.id]: { ...pat, pattern: e.target.value },
                            },
                          }))
                        }
                        onBlur={(e) =>
                          void applyAndSync(
                            { slugPatterns: { [pat.id]: { ...pat, pattern: e.target.value } } },
                            `Updated slug pattern '${pat.id}'`
                          )
                        }
                        className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
                      />
                    </label>
                    <div className="rounded bg-slate-900 px-2 py-1 font-mono text-[11px] text-emerald-300">
                      Preview:{' '}
                      {formatPrettySlugFromPattern(pat.pattern, config.frontend.prettyBasePath, {
                        kind: previewKind,
                        nodeId: previewNodeId,
                        member: previewMember,
                        template: config.frontend.defaultTemplate,
                        fragment: previewFragKey,
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800">
              <div className="mb-1.5 font-semibold text-slate-700 dark:text-slate-300">
                Live Slug Pattern Preview Variables
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={previewKind}
                  onChange={(e) => setPreviewKind(e.target.value)}
                  placeholder="kind"
                  className="rounded border border-slate-200 px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <input
                  value={previewNodeId}
                  onChange={(e) => setPreviewNodeId(e.target.value)}
                  placeholder="nodeId"
                  className="rounded border border-slate-200 px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <input
                  value={previewMember}
                  onChange={(e) => setPreviewMember(e.target.value)}
                  placeholder="member"
                  className="rounded border border-slate-200 px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BRANCH 2: TEMPLATE & FRAGMENT MANAGEMENT */}
      {branch === 'templates' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                HTML Document Templates
              </h3>
              <button
                type="button"
                onClick={() => void handleResetBranch('templates')}
                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Reset Templates
              </button>
            </div>
            {Object.values(config.templates).map((tpl) => (
              <div
                key={tpl.name}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-950/60"
              >
                <div>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{tpl.name}</span>
                  <span className="ml-2 text-slate-600 dark:text-slate-400">{tpl.title}</span>
                  {DEFAULT_TEMPLATE_THEMES[tpl.name] && (
                    <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      default
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-4 w-4 rounded-full border border-slate-300"
                    style={{ backgroundColor: tpl.themeColor }}
                    title={tpl.themeColor}
                  />
                  <code className="font-mono text-[11px]">{tpl.themeColor}</code>
                </div>
              </div>
            ))}
            <div className="rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
              <div className="mb-2 text-xs font-semibold">Add / Override Template Theme</div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={newTplName}
                  onChange={(e) => setNewTplName(e.target.value)}
                  placeholder="name (e.g. docs)"
                  className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <input
                  value={newTplTitle}
                  onChange={(e) => setNewTplTitle(e.target.value)}
                  placeholder="Document <title>"
                  className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <input
                  type="color"
                  value={newTplColor}
                  onChange={(e) => setNewTplColor(e.target.value)}
                  className="h-8 w-full rounded border border-slate-200 bg-white px-1 dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <button
                type="button"
                onClick={handleAddTemplate}
                className="mt-2 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Save className="h-3.5 w-3.5" /> Save Template
              </button>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Fragments (/template/{'{template}'}/{'{fragment}'}) &amp; Safe Preview
            </h3>
            <div className="space-y-2">
              {Object.values(config.fragments).map((frag) => (
                <div
                  key={frag.name}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setPreviewFragKey(frag.name)}
                      className="font-mono font-bold text-blue-700 hover:underline dark:text-blue-300"
                    >
                      {frag.name}
                    </button>
                    {DEFAULT_TEMPLATE_FRAGMENTS[frag.name] && (
                      <span className="text-[10px] text-slate-500">Hardcoded default</span>
                    )}
                  </div>
                  <code className="mt-1 block truncate font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    {frag.markup}
                  </code>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800">
              <div className="mb-1.5 font-semibold">
                Safe Text-Node Escaping Preview ({previewFragKey})
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={previewTitle}
                  onChange={(e) => setPreviewTitle(e.target.value)}
                  placeholder="title"
                  className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <input
                  value={previewMsg}
                  onChange={(e) => setPreviewMsg(e.target.value)}
                  placeholder="message"
                  className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <pre className="mt-2 overflow-x-auto rounded bg-slate-950 p-2 font-mono text-[11px] text-emerald-300">
                {renderedPreviewHtml}
              </pre>
            </div>
            <div className="rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
              <div className="mb-1.5 text-xs font-semibold">Add / Override Fragment</div>
              <input
                value={newFragName}
                onChange={(e) => setNewFragName(e.target.value)}
                placeholder="fragment name (e.g. banner)"
                className="w-full rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <textarea
                rows={2}
                value={newFragMarkup}
                onChange={(e) => setNewFragMarkup(e.target.value)}
                className="mt-2 w-full rounded border border-slate-200 p-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                type="button"
                onClick={handleAddFragment}
                className="mt-2 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Save className="h-3.5 w-3.5" /> Save Fragment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BRANCH 3: FRONT-END, OPENAI & OPTIONAL AZURE / AWS SUPPORT */}
      {branch === 'frontend' && (
        <div data-tour-id="view.middleware.cloud" className="grid gap-4 lg:grid-cols-2">
          {/* Front-End Runtime & OpenAI Full API Base */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Front-End Runtime Configuration
              </h3>
              <button
                type="button"
                onClick={() => void handleResetBranch('frontend')}
                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Reset Front-End
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="block">
                <span className="font-medium text-slate-700 dark:text-slate-300">PRETTY_BASE_PATH</span>
                <input
                  value={config.frontend.prettyBasePath}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      frontend: { ...prev.frontend, prettyBasePath: e.target.value },
                    }))
                  }
                  onBlur={(e) =>
                    void applyAndSync(
                      { frontend: { ...config.frontend, prettyBasePath: e.target.value } },
                      'Updated PRETTY_BASE_PATH'
                    )
                  }
                  placeholder="/ or /studio/"
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <label className="block">
                <span className="font-medium text-slate-700 dark:text-slate-300">Default Template</span>
                <select
                  value={config.frontend.defaultTemplate}
                  onChange={(e) =>
                    void applyAndSync(
                      { frontend: { ...config.frontend, defaultTemplate: e.target.value } },
                      'Updated default template'
                    )
                  }
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                >
                  {Object.keys(config.templates).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="space-y-2 text-xs">
              {(
                [
                  ['enableOfflineBanner', 'Show PWA offline resilience banner when connectivity drops'],
                  ['enableProgressiveDisclosure', 'Keep beginner hero pitches collapsible so inputs stay visible'],
                  ['lazyLoadGuideMedia', 'Lazy-load workbench walkthrough frames and videos'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.frontend[key]}
                    onChange={(e) =>
                      void applyAndSync(
                        { frontend: { ...config.frontend, [key]: e.target.checked } },
                        `Updated ${key}`
                      )
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            {/* OpenAI Tools & Entire API Base */}
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                    OpenAI Tools &amp; Full API Base Support (Enabled)
                  </h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Exposes {openAiManifest.counts.totalFunctionTools} function tools ({openAiManifest.counts.mcpTools} MCP +{' '}
                    {openAiManifest.counts.restApiTools} REST API) and {openAiManifest.counts.mcpServers} Responses API MCP servers.
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const exp = generateMcpExportForClient('openai', origin);
                      onDownloadFile(exp.content, exp.filename, exp.mime);
                    }}
                    className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-700"
                  >
                    <Download className="h-3 w-3" /> OpenAI Tools JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(generateMcpExportForClient('openai', origin).content);
                      onNotify('Copied OpenAI Tools & Full API Base manifest.');
                    }}
                    className="inline-flex items-center gap-1 rounded border border-indigo-300 px-2 py-1 text-[11px] font-medium text-indigo-800 dark:border-indigo-700 dark:text-indigo-200"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                </div>
              </div>
              <div className="mt-2 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                GET /api/openai/tools · POST /api/openai/tools/execute
              </div>
            </div>
          </div>

          {/* Optional (Default Disabled) Azure & AWS Support */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Optional Cloud Providers (Default Disabled)
              </h3>
            </div>

            {/* Azure / Microsoft Foundry */}
            <div className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label className="inline-flex cursor-pointer items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                  <input
                    type="checkbox"
                    checked={config.frontend.azure.enabled}
                    onChange={(e) =>
                      void applyAndSync(
                        {
                          frontend: {
                            ...config.frontend,
                            azure: { ...config.frontend.azure, enabled: e.target.checked },
                          },
                        },
                        `${e.target.checked ? 'Enabled' : 'Disabled'} optional Azure / Microsoft Foundry support`
                      )
                    }
                  />
                  <span>Azure &amp; Microsoft Foundry Support</span>
                </label>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {config.frontend.azure.enabled ? 'Enabled' : 'Disabled (Default)'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Build AI agents and workflows in Microsoft Foundry, experiment with open or proprietary models.
              </p>
              {config.frontend.azure.enabled && (
                <div className="mt-2.5 space-y-2 border-t border-slate-200 pt-2.5 dark:border-slate-800">
                  <input
                    value={config.frontend.azure.foundryProjectEndpoint}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        frontend: {
                          ...p.frontend,
                          azure: { ...p.frontend.azure, foundryProjectEndpoint: e.target.value },
                        },
                      }))
                    }
                    placeholder="https://<resource>.services.ai.azure.com/api/projects/<project>"
                    className="w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={config.frontend.azure.proprietaryModelDeployment}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          frontend: {
                            ...p.frontend,
                            azure: { ...p.frontend.azure, proprietaryModelDeployment: e.target.value },
                          },
                        }))
                      }
                      placeholder="Proprietary model (gpt-4.1)"
                      className="rounded border border-slate-200 px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <input
                      value={config.frontend.azure.openModelDeployment}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          frontend: {
                            ...p.frontend,
                            azure: { ...p.frontend.azure, openModelDeployment: e.target.value },
                          },
                        }))
                      }
                      placeholder="Open model (Llama-3.3-70B-Instruct)"
                      className="rounded border border-slate-200 px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const exp = generateMcpExportForClient('foundry', origin);
                        onDownloadFile(exp.content, exp.filename, exp.mime);
                      }}
                      className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
                    >
                      <Download className="h-3 w-3" /> Export Microsoft Foundry MCP &amp; Workflow
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onDownloadFile(
                          JSON.stringify(azureBundle, null, 2),
                          'azure-foundry-deployment.json',
                          'application/json'
                        )
                      }
                      className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-[11px] font-medium dark:border-slate-700"
                    >
                      <Download className="h-3 w-3" /> Azure Config JSON
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* AWS / Bedrock */}
            <div className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label className="inline-flex cursor-pointer items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                  <input
                    type="checkbox"
                    checked={config.frontend.aws.enabled}
                    onChange={(e) =>
                      void applyAndSync(
                        {
                          frontend: {
                            ...config.frontend,
                            aws: { ...config.frontend.aws, enabled: e.target.checked },
                          },
                        },
                        `${e.target.checked ? 'Enabled' : 'Disabled'} optional AWS Bedrock / AgentCore support`
                      )
                    }
                  />
                  <span>AWS Bedrock &amp; AgentCore Support</span>
                </label>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {config.frontend.aws.enabled ? 'Enabled' : 'Disabled (Default)'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Optional AWS Bedrock Agents, AgentCore MCP Gateway, and S3 artifact export integration.
              </p>
              {config.frontend.aws.enabled && (
                <div className="mt-2.5 space-y-2 border-t border-slate-200 pt-2.5 dark:border-slate-800">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={config.frontend.aws.region}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          frontend: { ...p.frontend, aws: { ...p.frontend.aws, region: e.target.value } },
                        }))
                      }
                      placeholder="Region (us-east-1)"
                      className="rounded border border-slate-200 px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <input
                      value={config.frontend.aws.s3Bucket}
                      onChange={(e) =>
                        setConfig((p) => ({
                          ...p,
                          frontend: { ...p.frontend, aws: { ...p.frontend.aws, s3Bucket: e.target.value } },
                        }))
                      }
                      placeholder="S3 bucket (optional)"
                      className="rounded border border-slate-200 px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const exp = generateMcpExportForClient('aws_bedrock', origin);
                        onDownloadFile(exp.content, exp.filename, exp.mime);
                      }}
                      className="inline-flex items-center gap-1 rounded bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700"
                    >
                      <Download className="h-3 w-3" /> Export AWS Bedrock MCP
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onDownloadFile(
                          JSON.stringify(awsBundle, null, 2),
                          'aws-bedrock-deployment.json',
                          'application/json'
                        )
                      }
                      className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-[11px] font-medium dark:border-slate-700"
                    >
                      <Download className="h-3 w-3" /> AWS Config JSON
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
