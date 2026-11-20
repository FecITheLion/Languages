export type ModuleConditionValue = string | number | boolean | null;

export interface ModuleActivationConfig {
  routes?: string[];
  methods?: string[];
  workbenchSlugs?: string[];
  blockScopes?: string[];
  callNames?: string[];
  properties?: Record<string, ModuleConditionValue>;
}

export interface ModuleCallDescriptor {
  route?: string;
  method?: string;
  workbenchSlug?: string;
  blockScopes?: string[];
  callName?: string;
  [key: string]: unknown;
}

export interface ModuleProcessingContext {
  input: unknown;
  environment: Record<string, unknown>;
  scope: Record<string, unknown>;
  call: ModuleCallDescriptor;
  output: ModuleOutputBuffer;
}

export class ModuleOutputBuffer {
  private content = '';

  public write(value: string): void {
    this.content += value;
  }

  public replace(value: string): void {
    this.content = value;
  }

  public clear(): void {
    this.content = '';
  }

  public read(): string {
    return this.content;
  }
}

export interface ModuleProcessingHooks {
  preProcess?: (context: ModuleProcessingContext) => void | Promise<void>;
  process?: (
    context: ModuleProcessingContext,
    next: () => Promise<unknown>
  ) => unknown | Promise<unknown>;
  after?: (context: ModuleProcessingContext, result: unknown) => void | Promise<void>;
  postProcess?: (
    context: ModuleProcessingContext,
    output: unknown,
    result: unknown
  ) => unknown | Promise<unknown>;
}

export interface RuntimeModuleDefinition {
  id: string;
  priority?: number;
  activation?: ModuleActivationConfig;
  hooks: ModuleProcessingHooks;
}

export interface ModuleProcessingResult {
  moduleIds: string[];
  result: unknown;
  output: string;
  translatedOutput: unknown;
  context: ModuleProcessingContext;
}

export class NoMatchingModuleError extends Error {
  constructor() {
    super('No registered module matches this processing context.');
    this.name = 'NoMatchingModuleError';
  }
}

function readPath(root: unknown, path: string): unknown {
  let value = root;
  for (const key of path.split('.')) {
    if (!key || key === '__proto__' || key === 'prototype' || key === 'constructor' ||
      typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function matchesAny(configured: string[] | undefined, actual: string | undefined): boolean {
  return !configured?.length || (actual !== undefined && configured.includes(actual));
}

function matchesActivation(config: ModuleActivationConfig | undefined, context: ModuleProcessingContext): boolean {
  if (!config) return true;
  if (!matchesAny(config.routes, context.call.route)) return false;
  if (!matchesAny(config.methods?.map((method) => method.toUpperCase()), context.call.method?.toUpperCase())) return false;
  if (!matchesAny(config.workbenchSlugs, context.call.workbenchSlug)) return false;
  if (config.blockScopes?.length && !config.blockScopes.some((scope) => context.call.blockScopes?.includes(scope))) return false;
  if (!matchesAny(config.callNames, context.call.callName)) return false;
  for (const [path, expected] of Object.entries(config.properties ?? {})) {
    const [rootName, ...segments] = path.split('.');
    if (!['input', 'environment', 'scope', 'call'].includes(rootName) || segments.length === 0) return false;
    const actual = readPath(rootName === 'input' ? context.input
      : rootName === 'environment' ? context.environment
        : rootName === 'scope' ? context.scope : context.call, segments.join('.'));
    if (actual !== expected) return false;
  }
  return true;
}

function matchesRouteContext(config: ModuleActivationConfig | undefined, context: ModuleProcessingContext): boolean {
  if (!config) return true;
  return matchesAny(config.routes, context.call.route) &&
    matchesAny(config.methods?.map((method) => method.toUpperCase()), context.call.method?.toUpperCase()) &&
    matchesAny(config.workbenchSlugs, context.call.workbenchSlug) &&
    (!config.blockScopes?.length || config.blockScopes.some((scope) => context.call.blockScopes?.includes(scope))) &&
    matchesAny(config.callNames, context.call.callName);
}

export class ModuleProcessingEngine {
  private readonly modules = new Map<string, RuntimeModuleDefinition>();

  public register(module: RuntimeModuleDefinition): void {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(module.id)) {
      throw new Error(`Invalid runtime module id '${module.id}'.`);
    }
    if (this.modules.has(module.id)) throw new Error(`Runtime module '${module.id}' is already registered.`);
    if (!module.hooks.process && !module.hooks.preProcess && !module.hooks.after && !module.hooks.postProcess) {
      throw new Error(`Runtime module '${module.id}' must register at least one processing hook.`);
    }
    this.modules.set(module.id, module);
  }

  public unregister(id: string): boolean {
    return this.modules.delete(id);
  }

  public registerPackage(
    manifest: { id: string; processing?: ModuleActivationConfig },
    hooks: ModuleProcessingHooks,
    priority = 0
  ): void {
    this.register({ id: manifest.id, activation: manifest.processing, hooks, priority });
  }

  public find(context: ModuleProcessingContext): RuntimeModuleDefinition[] {
    return [...this.modules.values()]
      .filter((module) => matchesActivation(module.activation, context))
      .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.id.localeCompare(right.id));
  }

  public async run(context: ModuleProcessingContext): Promise<ModuleProcessingResult> {
    const candidates = [...this.modules.values()]
      .filter((module) => matchesRouteContext(module.activation, context))
      .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.id.localeCompare(right.id));
    if (!candidates.length) throw new NoMatchingModuleError();
    const preProcessed = new Set<string>();
    let progressed: boolean;
    do {
      progressed = false;
      for (const module of candidates) {
        if (preProcessed.has(module.id) || !module.hooks.preProcess ||
          !matchesActivation(module.activation, context)) continue;
        await module.hooks.preProcess(context);
        preProcessed.add(module.id);
        progressed = true;
      }
    } while (progressed);
    const modules = candidates.filter((module) => matchesActivation(module.activation, context));
    if (!modules.length) throw new NoMatchingModuleError();

    let processHookCalled = false;
    const dispatch = async (index: number): Promise<unknown> => {
      if (index >= modules.length) return undefined;
      const current = modules[index];
      if (!current.hooks.process) return dispatch(index + 1);
      processHookCalled = true;
      let nextCalled = false;
      const next = async (): Promise<unknown> => {
        if (nextCalled) throw new Error(`Module '${current.id}' called next more than once.`);
        nextCalled = true;
        return dispatch(index + 1);
      };
      return current.hooks.process(context, next);
    };

    const result = await dispatch(0);
    if (!processHookCalled) throw new Error('Matched modules did not provide a processing handler.');
    for (const module of [...modules].reverse()) await module.hooks.after?.(context, result);

    const output = context.output.read();
    let translatedOutput: unknown = output;
    for (const module of [...modules].reverse()) {
      if (module.hooks.postProcess) {
        translatedOutput = await module.hooks.postProcess(context, translatedOutput, result);
      }
    }
    return { moduleIds: modules.map((module) => module.id), result, output, translatedOutput, context };
  }
}

export function createModuleProcessingContext(input: {
  input: unknown;
  environment?: Record<string, unknown>;
  scope?: Record<string, unknown>;
  call?: ModuleCallDescriptor;
}): ModuleProcessingContext {
  return {
    input: input.input,
    environment: input.environment ?? {},
    scope: input.scope ?? {},
    call: input.call ?? {},
    output: new ModuleOutputBuffer(),
  };
}
