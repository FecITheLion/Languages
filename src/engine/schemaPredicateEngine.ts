export interface SchemaPredicateNode {
  name: string;
  path: string;
  type: string;
  predicates: string[];
  requiredFields: string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  enumValues?: unknown[];
  isRequired?: boolean;
  children: SchemaPredicateNode[];
}

export interface PredicateValidationError {
  path: string;
  field: string;
  predicate: string;
  message: string;
}

export interface PredicateNodeEvaluation {
  path: string;
  name: string;
  valid: boolean;
  checkedCount: number;
  passedCount: number;
  errors: PredicateValidationError[];
}

export interface PredicateEvaluationResult {
  valid: boolean;
  errors: PredicateValidationError[];
  checkedPredicates: number;
  passedPredicates: number;
  nodeResults: Record<string, PredicateNodeEvaluation>;
}

export interface SchemaPredicateStudioResult {
  ok: boolean;
  parseError?: string;
  schema?: Record<string, unknown>;
  ebnfSubset: string;
  generatedEbnf: string;
  predicateTree?: SchemaPredicateNode;
  predicateTreeText: string;
  validation?: PredicateEvaluationResult;
}

export const DEFAULT_JSON_SCHEMA_SAMPLE = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "username": { "type": "string", "minLength": 3 },
    "age": { "type": "integer", "minimum": 18 },
    "active": { "type": "boolean" }
  },
  "required": ["username", "age"]
}`;

export const DEFAULT_TEST_INSTANCE_SAMPLE = `{
  "username": "alex_dev",
  "age": 25,
  "active": true
}`;

export const DEFAULT_SCHEMA_EBNF_GRAMMAR = `(* EBNF Grammar for JSON Schema Subset *)
Schema        ::= ObjectSchema | PrimitiveSchema ;
ObjectSchema  ::= "{" TypeProp "," PropertiesProp "," RequiredProp "}" ;
TypeProp      ::= '"type"' ":" '"object"' | '"string"' | '"integer"' | '"boolean"' ;
PropertiesProp::= '"properties"' ":" "{" PropertyDef { "," PropertyDef } "}" ;
PropertyDef   ::= Identifier ":" SchemaNode ;
SchemaNode    ::= "{" [ ConstraintList ] "}" ;
ConstraintList::= Constraint { "," Constraint } ;
Constraint    ::= TypeConstraint | MinLengthConstraint | MinValConstraint ;`;

export interface SchemaPredicatePreset {
  id: string;
  label: string;
  description: string;
  schemaText: string;
  instanceText: string;
}

export const SCHEMA_PREDICATE_PRESETS: SchemaPredicatePreset[] = [
  {
    id: 'default_user',
    label: 'Default User Schema',
    description: 'Reference JSON Schema EBNF PWA example (username, age >= 18, active)',
    schemaText: DEFAULT_JSON_SCHEMA_SAMPLE,
    instanceText: DEFAULT_TEST_INSTANCE_SAMPLE,
  },
  {
    id: 'nested_order',
    label: 'Nested Order Schema',
    description: 'Hierarchical object & array constraints with pattern, enum, and bounds',
    schemaText: JSON.stringify(
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          orderId: { type: 'string', pattern: '^ORD-[0-9]{4}$' },
          status: { type: 'string', enum: ['pending', 'verified', 'shipped'] },
          customer: {
            type: 'object',
            properties: {
              handle: { type: 'string', minLength: 2, maxLength: 32 },
              priority: { type: 'integer', minimum: 1, maximum: 5 },
            },
            required: ['handle'],
          },
          tags: {
            type: 'array',
            items: { type: 'string', minLength: 2 },
          },
        },
        required: ['orderId', 'status', 'customer'],
      },
      null,
      2
    ),
    instanceText: JSON.stringify(
      {
        orderId: 'ORD-2048',
        status: 'verified',
        customer: {
          handle: 'feci_dev',
          priority: 3,
        },
        tags: ['ebnf', 'ast'],
      },
      null,
      2
    ),
  },
  {
    id: 'failing_demo',
    label: 'Failing Validation Demo',
    description: 'Demonstrates missing required fields, type mismatch, and threshold violations',
    schemaText: DEFAULT_JSON_SCHEMA_SAMPLE,
    instanceText: JSON.stringify(
      {
        username: 'al',
        age: 16,
        active: 'yes',
      },
      null,
      2
    ),
  },
];

export class SchemaTokenizer {
  input: string;
  pos: number;

  constructor(input: string) {
    this.input = input;
    this.pos = 0;
  }

  tokenize(): Record<string, unknown> {
    try {
      const parsed = JSON.parse(this.input) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('JSON Schema root must be a JSON object.');
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('Invalid JSON Schema Syntax:')) throw err;
      throw new Error(`Invalid JSON Schema Syntax: ${msg}`);
    }
  }
}

export function tokenizeJsonSchema(input: string): Record<string, unknown> {
  return new SchemaTokenizer(input).tokenize();
}

export class SchemaPredicateCompiler {
  static compile(
    schemaObj: Record<string, unknown>,
    key = 'Root',
    path = '$',
    isRequired = false
  ): SchemaPredicateNode {
    const type =
      typeof schemaObj.type === 'string' && schemaObj.type.trim()
        ? schemaObj.type.trim()
        : schemaObj.properties && typeof schemaObj.properties === 'object'
          ? 'object'
          : 'any';
    const requiredList = Array.isArray(schemaObj.required)
      ? schemaObj.required.filter((r): r is string => typeof r === 'string')
      : [];

    const predicates: string[] = [];
    if (typeof schemaObj.type === 'string' && schemaObj.type.trim()) {
      predicates.push(`type == ${schemaObj.type.trim()}`);
    }
    if (typeof schemaObj.minLength === 'number') {
      predicates.push(`length >= ${schemaObj.minLength}`);
    }
    if (typeof schemaObj.maxLength === 'number') {
      predicates.push(`length <= ${schemaObj.maxLength}`);
    }
    if (typeof schemaObj.minimum === 'number') {
      predicates.push(`value >= ${schemaObj.minimum}`);
    }
    if (typeof schemaObj.maximum === 'number') {
      predicates.push(`value <= ${schemaObj.maximum}`);
    }
    if (typeof schemaObj.pattern === 'string') {
      predicates.push(`pattern /${schemaObj.pattern}/`);
    }
    if (Array.isArray(schemaObj.enum)) {
      predicates.push(`enum in [${schemaObj.enum.map((v) => JSON.stringify(v)).join(', ')}]`);
    }
    if (requiredList.length > 0) {
      predicates.push(`required_fields: [${requiredList.join(', ')}]`);
    }

    const node: SchemaPredicateNode = {
      name: key,
      path,
      type,
      predicates,
      requiredFields: requiredList,
      minLength: typeof schemaObj.minLength === 'number' ? schemaObj.minLength : undefined,
      maxLength: typeof schemaObj.maxLength === 'number' ? schemaObj.maxLength : undefined,
      minimum: typeof schemaObj.minimum === 'number' ? schemaObj.minimum : undefined,
      maximum: typeof schemaObj.maximum === 'number' ? schemaObj.maximum : undefined,
      pattern: typeof schemaObj.pattern === 'string' ? schemaObj.pattern : undefined,
      enumValues: Array.isArray(schemaObj.enum) ? schemaObj.enum : undefined,
      isRequired,
      children: [],
    };

    const reqSet = new Set(requiredList);
    const props =
      schemaObj.properties && typeof schemaObj.properties === 'object' && !Array.isArray(schemaObj.properties)
        ? (schemaObj.properties as Record<string, unknown>)
        : null;

    if (props) {
      for (const [propKey, propVal] of Object.entries(props)) {
        if (propVal && typeof propVal === 'object' && !Array.isArray(propVal)) {
          node.children.push(
            this.compile(
              propVal as Record<string, unknown>,
              propKey,
              `${path}.${propKey}`,
              reqSet.has(propKey)
            )
          );
        }
      }
    } else if (
      key === 'Root' &&
      schemaObj.$defs &&
      typeof schemaObj.$defs === 'object' &&
      !Array.isArray(schemaObj.$defs)
    ) {
      for (const [defKey, defVal] of Object.entries(schemaObj.$defs as Record<string, unknown>)) {
        if (defVal && typeof defVal === 'object' && !Array.isArray(defVal)) {
          node.children.push(
            this.compile(defVal as Record<string, unknown>, defKey, `${path}.${defKey}`, false)
          );
        }
      }
    }

    if (schemaObj.items && typeof schemaObj.items === 'object' && !Array.isArray(schemaObj.items)) {
      node.children.push(
        this.compile(schemaObj.items as Record<string, unknown>, '[items]', `${path}[]`, false)
      );
    }

    return node;
  }
}

export class PredicateEvaluator {
  static evaluate(node: SchemaPredicateNode, instance: unknown): PredicateEvaluationResult {
    const errors: PredicateValidationError[] = [];
    const nodeResults: Record<string, PredicateNodeEvaluation> = {};
    let totalChecked = 0;
    let totalPassed = 0;

    const recordNode = (
      path: string,
      name: string,
      checked: number,
      passed: number,
      nodeErrs: PredicateValidationError[]
    ) => {
      totalChecked += checked;
      totalPassed += passed;
      errors.push(...nodeErrs);
      nodeResults[path] = {
        path,
        name,
        valid: nodeErrs.length === 0,
        checkedCount: checked,
        passedCount: passed,
        errors: nodeErrs,
      };
    };

    const visit = (curNode: SchemaPredicateNode, val: unknown): boolean => {
      const nodeErrs: PredicateValidationError[] = [];
      let checked = 0;
      let passed = 0;
      const isRoot = curNode.path === '$';

      // Type check
      if (curNode.type && curNode.type !== 'any') {
        checked += 1;
        let typeOk = true;
        if (curNode.type === 'string') typeOk = typeof val === 'string';
        else if (curNode.type === 'integer') typeOk = typeof val === 'number' && Number.isInteger(val);
        else if (curNode.type === 'number') typeOk = typeof val === 'number' && Number.isFinite(val);
        else if (curNode.type === 'boolean') typeOk = typeof val === 'boolean';
        else if (curNode.type === 'object') {
          typeOk = Boolean(val) && typeof val === 'object' && !Array.isArray(val);
        } else if (curNode.type === 'array') typeOk = Array.isArray(val);
        else if (curNode.type === 'null') typeOk = val === null;

        if (typeOk) {
          passed += 1;
        } else {
          nodeErrs.push({
            path: curNode.path,
            field: curNode.name,
            predicate: `type == ${curNode.type}`,
            message: isRoot
              ? `Root instance must be ${curNode.type}`
              : `Field '${curNode.name}' must be ${curNode.type}`,
          });
        }
      }

      // String constraints
      if (curNode.minLength !== undefined && typeof val === 'string') {
        checked += 1;
        if (val.length >= curNode.minLength) passed += 1;
        else {
          nodeErrs.push({
            path: curNode.path,
            field: curNode.name,
            predicate: `length >= ${curNode.minLength}`,
            message: `Field '${curNode.name}' length must be >= ${curNode.minLength}`,
          });
        }
      }
      if (curNode.maxLength !== undefined && typeof val === 'string') {
        checked += 1;
        if (val.length <= curNode.maxLength) passed += 1;
        else {
          nodeErrs.push({
            path: curNode.path,
            field: curNode.name,
            predicate: `length <= ${curNode.maxLength}`,
            message: `Field '${curNode.name}' length must be <= ${curNode.maxLength}`,
          });
        }
      }
      if (curNode.pattern !== undefined && typeof val === 'string') {
        checked += 1;
        let patOk = true;
        try {
          patOk = new RegExp(curNode.pattern).test(val);
        } catch {
          patOk = false;
        }
        if (patOk) passed += 1;
        else {
          nodeErrs.push({
            path: curNode.path,
            field: curNode.name,
            predicate: `pattern /${curNode.pattern}/`,
            message: `Field '${curNode.name}' does not match /${curNode.pattern}/`,
          });
        }
      }

      // Numeric bounds
      if (curNode.minimum !== undefined && typeof val === 'number') {
        checked += 1;
        if (val >= curNode.minimum) passed += 1;
        else {
          nodeErrs.push({
            path: curNode.path,
            field: curNode.name,
            predicate: `value >= ${curNode.minimum}`,
            message: `Field '${curNode.name}' value must be >= ${curNode.minimum}`,
          });
        }
      }
      if (curNode.maximum !== undefined && typeof val === 'number') {
        checked += 1;
        if (val <= curNode.maximum) passed += 1;
        else {
          nodeErrs.push({
            path: curNode.path,
            field: curNode.name,
            predicate: `value <= ${curNode.maximum}`,
            message: `Field '${curNode.name}' value must be <= ${curNode.maximum}`,
          });
        }
      }

      // Enum constraint
      if (curNode.enumValues !== undefined && val !== undefined) {
        checked += 1;
        if (curNode.enumValues.some((e) => JSON.stringify(e) === JSON.stringify(val))) {
          passed += 1;
        } else {
          nodeErrs.push({
            path: curNode.path,
            field: curNode.name,
            predicate: `enum in [${curNode.enumValues.map((v) => JSON.stringify(v)).join(', ')}]`,
            message: `Field '${curNode.name}' must be one of ${curNode.enumValues.map((v) => JSON.stringify(v)).join(', ')}`,
          });
        }
      }

      // Object required fields & properties
      const objVal =
        val && typeof val === 'object' && !Array.isArray(val) ? (val as Record<string, unknown>) : null;
      if (objVal !== null && curNode.requiredFields.length > 0) {
        for (const reqField of curNode.requiredFields) {
          checked += 1;
          if (Object.prototype.hasOwnProperty.call(objVal, reqField) && objVal[reqField] !== undefined) {
            passed += 1;
          } else {
            nodeErrs.push({
              path: `${curNode.path}.${reqField}`,
              field: reqField,
              predicate: `required(${reqField})`,
              message: `Missing required field: '${reqField}'`,
            });
          }
        }
      }

      let childrenValid = true;
      for (const child of curNode.children) {
        if (child.name === '[items]' && Array.isArray(val)) {
          val.forEach((itemVal, idx) => {
            const itemChild: SchemaPredicateNode = {
              ...child,
              name: `${curNode.name}[${idx}]`,
              path: `${curNode.path}[${idx}]`,
            };
            if (!visit(itemChild, itemVal)) childrenValid = false;
          });
        } else if (objVal && Object.prototype.hasOwnProperty.call(objVal, child.name) && objVal[child.name] !== undefined) {
          if (!visit(child, objVal[child.name])) childrenValid = false;
        } else if (child.path !== '$[]' && child.name !== '[items]') {
          // Record neutral node status when optional field omitted
          if (!nodeResults[child.path]) {
            nodeResults[child.path] = {
              path: child.path,
              name: child.name,
              valid: !curNode.requiredFields.includes(child.name),
              checkedCount: 0,
              passedCount: 0,
              errors: [],
            };
          }
        }
      }

      recordNode(curNode.path, curNode.name, checked, passed, nodeErrs);
      return nodeErrs.length === 0 && childrenValid;
    };

    visit(node, instance);
    return {
      valid: errors.length === 0,
      errors,
      checkedPredicates: totalChecked,
      passedPredicates: totalPassed,
      nodeResults,
    };
  }
}

function sanitizeEbnfSymbol(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!clean) return 'node';
  return /^[A-Za-z_]/.test(clean) ? clean : `r_${clean}`;
}

/** Generates EBNF production rules describing the compiled JSON Schema structure. */
export function generateEbnfFromJsonSchema(schemaObj: Record<string, unknown>): string {
  const root = SchemaPredicateCompiler.compile(schemaObj);
  const rules: string[] = [
    '(* Compiled EBNF Productions from JSON Schema *)',
  ];

  const emitNode = (node: SchemaPredicateNode, symName: string): void => {
    const props = node.children.filter((c) => c.name !== '[items]');
    const itemsChild = node.children.find((c) => c.name === '[items]');

    if (props.length > 0) {
      const reqSet = new Set(node.requiredFields);
      const terms = props.map((c) => {
        const childSym = sanitizeEbnfSymbol(c.name);
        return reqSet.has(c.name) ? childSym : `[ ${childSym} ]`;
      });
      rules.push(`${symName} ::= '{' ${terms.join(" ',' ")} '}' ;`);
      for (const c of props) {
        emitNode(c, sanitizeEbnfSymbol(c.name));
      }
      return;
    }

    if (node.type === 'array' || itemsChild) {
      const itemSym = itemsChild ? sanitizeEbnfSymbol(itemsChild.type || 'value') : 'json_value';
      rules.push(`${symName} ::= '[' [ ${itemSym} { ',' ${itemSym} } ] ']' ;`);
      return;
    }

    if (node.enumValues && node.enumValues.length > 0) {
      const alts = node.enumValues.map((v) => `'${JSON.stringify(v).replace(/'/g, "\\'")}'`);
      rules.push(`${symName} ::= ${alts.join(' | ')} ;`);
      return;
    }

    if (node.type === 'string') {
      const comment = node.minLength !== undefined || node.maxLength !== undefined || node.pattern
        ? ` (* ${[
            node.minLength !== undefined ? `minLength>=${node.minLength}` : '',
            node.maxLength !== undefined ? `maxLength<=${node.maxLength}` : '',
            node.pattern ? `/${node.pattern}/` : '',
          ]
            .filter(Boolean)
            .join(', ')} *)`
        : '';
      rules.push(`${symName} ::= '"' char+ '"' ;${comment}`);
      return;
    }

    if (node.type === 'integer' || node.type === 'number') {
      const comment = node.minimum !== undefined || node.maximum !== undefined
        ? ` (* ${[
            node.minimum !== undefined ? `min>=${node.minimum}` : '',
            node.maximum !== undefined ? `max<=${node.maximum}` : '',
          ]
            .filter(Boolean)
            .join(', ')} *)`
        : '';
      rules.push(
        `${symName} ::= ${node.type === 'integer' ? "['-'] digit+" : "['-'] digit+ [ '.' digit+ ]"} ;${comment}`
      );
      return;
    }

    if (node.type === 'boolean') {
      rules.push(`${symName} ::= 'true' | 'false' ;`);
      return;
    }

    rules.push(`${symName} ::= json_value ;`);
  };

  emitNode(root, 'schema_root');
  if (!rules.some((r) => r.startsWith('char ::='))) {
    rules.push("char ::= [a-zA-Z0-9_ .:-] ;");
  }
  if (!rules.some((r) => r.startsWith('digit ::='))) {
    rules.push("digit ::= '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' ;");
  }
  return rules.join('\n');
}

export function renderPredicateTreeText(
  node: SchemaPredicateNode,
  prefix = '',
  isLast = true,
  isRoot = true
): string {
  const connector = isRoot ? '' : isLast ? '└─ ' : '├─ ';
  const preds = node.predicates.length > 0 ? ` { predicates: ${JSON.stringify(node.predicates)} }` : '';
  const line = `${prefix}${connector}${node.name}: [${node.type}]${preds}`;
  const childPrefix = isRoot ? '' : `${prefix}${isLast ? '    ' : '│   '}`;
  const childLines = node.children.map((child, idx) =>
    renderPredicateTreeText(child, childPrefix, idx === node.children.length - 1, false)
  );
  return [line, ...childLines].join('\n');
}

export function evaluateSchemaPredicateStudio(
  schemaText: string,
  instanceText?: string
): SchemaPredicateStudioResult {
  try {
    const schemaObj = new SchemaTokenizer(schemaText).tokenize();
    const predicateTree = SchemaPredicateCompiler.compile(schemaObj);
    const generatedEbnf = generateEbnfFromJsonSchema(schemaObj);
    const predicateTreeText = renderPredicateTreeText(predicateTree);

    if (typeof instanceText !== 'string' || !instanceText.trim()) {
      return {
        ok: true,
        schema: schemaObj,
        ebnfSubset: DEFAULT_SCHEMA_EBNF_GRAMMAR,
        generatedEbnf,
        predicateTree,
        predicateTreeText,
      };
    }

    let instanceObj: unknown;
    try {
      instanceObj = JSON.parse(instanceText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        parseError: `Invalid Test JSON Instance: ${msg}`,
        schema: schemaObj,
        ebnfSubset: DEFAULT_SCHEMA_EBNF_GRAMMAR,
        generatedEbnf,
        predicateTree,
        predicateTreeText,
      };
    }

    const validation = PredicateEvaluator.evaluate(predicateTree, instanceObj);
    return {
      ok: true,
      schema: schemaObj,
      ebnfSubset: DEFAULT_SCHEMA_EBNF_GRAMMAR,
      generatedEbnf,
      predicateTree,
      predicateTreeText,
      validation,
    };
  } catch (err) {
    return {
      ok: false,
      parseError: err instanceof Error ? err.message : String(err),
      ebnfSubset: DEFAULT_SCHEMA_EBNF_GRAMMAR,
      generatedEbnf: DEFAULT_SCHEMA_EBNF_GRAMMAR,
      predicateTreeText: '',
    };
  }
}

export function generateStandaloneSchemaPredicateHtml(
  initialSchema = DEFAULT_JSON_SCHEMA_SAMPLE,
  initialInstance = DEFAULT_TEST_INSTANCE_SAMPLE
): string {
  const escHtml = (s: string) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const schemaEsc = escHtml(initialSchema);
  const instanceEsc = escHtml(initialInstance);
  const ebnfEsc = escHtml(DEFAULT_SCHEMA_EBNF_GRAMMAR);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JSON Schema EBNF Parser & Predicate Tree Studio</title>
    <link rel="manifest" href="data:application/manifest+json,{
        &quot;name&quot;: &quot;JSON Schema EBNF PWA&quot;,
        &quot;short_name&quot;: &quot;SchemaPWA&quot;,
        &quot;start_url&quot;: &quot;/&quot;,
        &quot;display&quot;: &quot;standalone&quot;,
        &quot;background_color&quot;: &quot;#0f172a&quot;,
        &quot;theme_color&quot;: &quot;#3b82f6&quot;
    }">
    <style>
        :root {
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --bg-tertiary: #334155;
            --accent: #3b82f6;
            --accent-hover: #2563eb;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --border: #475569;
            --success: #22c55e;
            --error: #ef4444;
        }
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        body {
            background-color: var(--bg-primary);
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        header {
            background-color: var(--bg-secondary);
            padding: 1rem 2rem;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
        }
        header h1 {
            font-size: 1.25rem;
            font-weight: 600;
            color: var(--text-main);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .badge {
            background-color: var(--accent);
            color: white;
            font-size: 0.75rem;
            padding: 0.2rem 0.5rem;
            border-radius: 9999px;
            font-weight: 500;
        }
        main {
            flex: 1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
            gap: 1rem;
            padding: 1rem;
            height: calc(100vh - 70px);
        }
        @media (max-width: 1024px) {
            main {
                grid-template-columns: 1fr;
                grid-template-rows: repeat(4, 380px);
                height: auto;
            }
        }
        .panel {
            background-color: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 0.5rem;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .panel-header {
            background-color: var(--bg-tertiary);
            padding: 0.75rem 1rem;
            font-size: 0.875rem;
            font-weight: 600;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border);
        }
        .panel-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            padding: 0.75rem;
            overflow: hidden;
        }
        textarea {
            flex: 1;
            background-color: var(--bg-primary);
            color: var(--text-main);
            border: 1px solid var(--border);
            border-radius: 0.375rem;
            padding: 0.75rem;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 0.875rem;
            resize: none;
            outline: none;
        }
        textarea:focus { border-color: var(--accent); }
        .tree-view {
            flex: 1;
            background-color: var(--bg-primary);
            border: 1px solid var(--border);
            border-radius: 0.375rem;
            padding: 0.75rem;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 0.85rem;
            overflow-y: auto;
            white-space: pre-wrap;
        }
        .node-key { color: #60a5fa; font-weight: bold; }
        .node-type { color: #f472b6; }
        .node-val { color: #34d399; }
        .status-badge {
            padding: 0.2rem 0.6rem;
            border-radius: 0.25rem;
            font-size: 0.75rem;
            font-weight: 600;
        }
        .status-valid {
            background-color: rgba(34, 197, 94, 0.2);
            color: var(--success);
            border: 1px solid var(--success);
        }
        .status-invalid {
            background-color: rgba(239, 68, 68, 0.2);
            color: var(--error);
            border: 1px solid var(--error);
        }
        button {
            background-color: var(--accent);
            color: white;
            border: none;
            padding: 0.35rem 0.75rem;
            border-radius: 0.25rem;
            cursor: pointer;
            font-size: 0.75rem;
            font-weight: 600;
            transition: background-color 0.2s;
        }
        button:hover { background-color: var(--accent-hover); }
    </style>
</head>
<body>
    <header>
        <h1>
            JSON Schema EBNF Studio
            <span class="badge">PWA Ready</span>
        </h1>
        <div id="validation-status" class="status-badge status-valid">System Ready</div>
    </header>

    <main>
        <div class="panel">
            <div class="panel-header">
                <span>1. JSON Schema Input</span>
                <button id="parseBtn" type="button">Parse &amp; Validate</button>
            </div>
            <div class="panel-content">
                <textarea id="schema-input" spellcheck="false">${schemaEsc}</textarea>
            </div>
        </div>

        <div class="panel">
            <div class="panel-header">
                <span>2. EBNF Grammar Specification</span>
            </div>
            <div class="panel-content">
                <textarea id="ebnf-input" readonly style="color: var(--text-muted); font-size: 0.8rem;">${ebnfEsc}</textarea>
            </div>
        </div>

        <div class="panel">
            <div class="panel-header">
                <span>3. Compiled Predicate Tree (AST)</span>
            </div>
            <div class="panel-content">
                <div id="tree-output" class="tree-view"></div>
            </div>
        </div>

        <div class="panel">
            <div class="panel-header">
                <span>4. Test JSON Instance</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">Auto-evaluates against predicate tree</span>
            </div>
            <div class="panel-content">
                <textarea id="instance-input" spellcheck="false">${instanceEsc}</textarea>
            </div>
        </div>
    </main>

    <script>
        function escHtml(s) {
            return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }

        class SchemaTokenizer {
            constructor(input) { this.input = input; this.pos = 0; }
            tokenize() {
                try { return JSON.parse(this.input); }
                catch (e) { throw new Error("Invalid JSON Schema Syntax: " + e.message); }
            }
        }

        class SchemaPredicateCompiler {
            static compile(schemaObj, key = "Root") {
                const node = {
                    name: key,
                    type: schemaObj.type || "any",
                    predicates: [],
                    requiredFields: Array.isArray(schemaObj.required) ? schemaObj.required : [],
                    minLength: schemaObj.minLength,
                    maxLength: schemaObj.maxLength,
                    minimum: schemaObj.minimum,
                    maximum: schemaObj.maximum,
                    pattern: schemaObj.pattern,
                    enumValues: schemaObj.enum,
                    children: []
                };
                if (schemaObj.type) node.predicates.push("type == " + schemaObj.type);
                if (schemaObj.minLength !== undefined) node.predicates.push("length >= " + schemaObj.minLength);
                if (schemaObj.maxLength !== undefined) node.predicates.push("length <= " + schemaObj.maxLength);
                if (schemaObj.minimum !== undefined) node.predicates.push("value >= " + schemaObj.minimum);
                if (schemaObj.maximum !== undefined) node.predicates.push("value <= " + schemaObj.maximum);
                if (schemaObj.pattern !== undefined) node.predicates.push("pattern /" + schemaObj.pattern + "/");
                if (Array.isArray(schemaObj.required)) node.predicates.push("required_fields: [" + schemaObj.required.join(", ") + "]");
                if (schemaObj.properties && typeof schemaObj.properties === "object") {
                    for (const [propKey, propVal] of Object.entries(schemaObj.properties)) {
                        if (propVal && typeof propVal === "object") node.children.push(this.compile(propVal, propKey));
                    }
                }
                if (schemaObj.items && typeof schemaObj.items === "object") {
                    node.children.push(this.compile(schemaObj.items, "[items]"));
                }
                return node;
            }
        }

        class PredicateEvaluator {
            static evaluate(node, instance) {
                const errors = [];
                if (node.name === "Root") {
                    if (node.type === "object" && (!instance || typeof instance !== "object" || Array.isArray(instance))) {
                        errors.push("Root instance must be object");
                        return { valid: false, errors };
                    }
                    if (instance && typeof instance === "object" && !Array.isArray(instance)) {
                        node.requiredFields.forEach(req => {
                            if (instance[req] === undefined) errors.push("Missing required field: '" + req + "'");
                        });
                        for (const child of node.children) {
                            if (child.name !== "[items]" && instance[child.name] !== undefined) {
                                errors.push(...this.evaluate(child, instance[child.name]).errors);
                            }
                        }
                    }
                    return { valid: errors.length === 0, errors };
                }

                const val = instance;
                if (val === undefined) return { valid: true, errors: [] };
                if (node.type === "string" && typeof val !== "string") errors.push("Field '" + node.name + "' must be string");
                if (node.type === "integer" && (typeof val !== "number" || !Number.isInteger(val))) errors.push("Field '" + node.name + "' must be integer");
                if (node.type === "number" && (typeof val !== "number" || !Number.isFinite(val))) errors.push("Field '" + node.name + "' must be number");
                if (node.type === "boolean" && typeof val !== "boolean") errors.push("Field '" + node.name + "' must be boolean");
                if (node.type === "object" && (!val || typeof val !== "object" || Array.isArray(val))) errors.push("Field '" + node.name + "' must be object");
                if (node.type === "array" && !Array.isArray(val)) errors.push("Field '" + node.name + "' must be array");

                if (node.minLength !== undefined && typeof val === "string" && val.length < node.minLength) {
                    errors.push("Field '" + node.name + "' length must be >= " + node.minLength);
                }
                if (node.maxLength !== undefined && typeof val === "string" && val.length > node.maxLength) {
                    errors.push("Field '" + node.name + "' length must be <= " + node.maxLength);
                }
                if (node.minimum !== undefined && typeof val === "number" && val < node.minimum) {
                    errors.push("Field '" + node.name + "' value must be >= " + node.minimum);
                }
                if (node.maximum !== undefined && typeof val === "number" && val > node.maximum) {
                    errors.push("Field '" + node.name + "' value must be <= " + node.maximum);
                }
                if (node.pattern !== undefined && typeof val === "string" && !(new RegExp(node.pattern).test(val))) {
                    errors.push("Field '" + node.name + "' does not match /" + node.pattern + "/");
                }
                if (node.requiredFields.length > 0 && val && typeof val === "object" && !Array.isArray(val)) {
                    node.requiredFields.forEach(req => {
                        if (val[req] === undefined) errors.push("Missing required field: '" + req + "'");
                    });
                }
                if (val && typeof val === "object" && !Array.isArray(val)) {
                    node.children.forEach(child => {
                        if (child.name !== "[items]" && val[child.name] !== undefined) {
                            errors.push(...this.evaluate(child, val[child.name]).errors);
                        }
                    });
                }
                if (Array.isArray(val)) {
                    const itemChild = node.children.find(c => c.name === "[items]");
                    if (itemChild) val.forEach(iv => errors.push(...this.evaluate(itemChild, iv).errors));
                }
                return { valid: errors.length === 0, errors };
            }
        }

        function renderTreeHtml(node, depth = 0) {
            const indent = "&nbsp;".repeat(depth * 4);
            let html = "<div>" + indent + "<span class=\\"node-key\\">" + escHtml(node.name) + "</span>: <span class=\\"node-type\\">[" + escHtml(node.type) + "]</span>";
            if (node.predicates.length > 0) {
                html += " <span class=\\"node-val\\">{ predicates: " + escHtml(JSON.stringify(node.predicates)) + " }</span>";
            }
            html += "</div>";
            if (node.children && node.children.length > 0) {
                node.children.forEach(child => { html += renderTreeHtml(child, depth + 1); });
            }
            return html;
        }

        function runParser() {
            const schemaText = document.getElementById("schema-input").value;
            const instanceText = document.getElementById("instance-input").value;
            const treeOutput = document.getElementById("tree-output");
            const statusBadge = document.getElementById("validation-status");
            try {
                const tokenizer = new SchemaTokenizer(schemaText);
                const schemaObj = tokenizer.tokenize();
                const predicateTree = SchemaPredicateCompiler.compile(schemaObj);
                treeOutput.innerHTML = renderTreeHtml(predicateTree);
                const instanceObj = JSON.parse(instanceText);
                const evalResult = PredicateEvaluator.evaluate(predicateTree, instanceObj);
                if (evalResult.valid) {
                    statusBadge.className = "status-badge status-valid";
                    statusBadge.textContent = "Validation Passed ✓";
                } else {
                    statusBadge.className = "status-badge status-invalid";
                    statusBadge.textContent = "Validation Failed: " + evalResult.errors[0];
                }
            } catch (err) {
                treeOutput.innerHTML = "<span style=\\"color: var(--error);\\">" + escHtml(err.message) + "</span>";
                statusBadge.className = "status-badge status-invalid";
                statusBadge.textContent = "Parse Error";
            }
        }

        document.getElementById("parseBtn").addEventListener("click", runParser);
        document.getElementById("schema-input").addEventListener("input", runParser);
        document.getElementById("instance-input").addEventListener("input", runParser);
        window.addEventListener("load", runParser);
        runParser();

        if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
            const swCode = "self.addEventListener('install', e => self.skipWaiting()); self.addEventListener('activate', e => self.clients.claim());";
            const blob = new Blob([swCode], { type: "text/javascript" });
            const swUrl = URL.createObjectURL(blob);
            navigator.serviceWorker.register(swUrl).catch(() => {});
        }
    </script>
</body>
</html>`;
}
