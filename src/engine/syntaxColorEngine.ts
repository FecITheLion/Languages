export type SyntaxLanguageMode =
  | 'grammar'
  | 'json'
  | 'logic'
  | 'dsl'
  | 'code'
  | 'plain';

export interface HighlightToken {
  text: string;
  kind:
    | 'plain'
    | 'comment'
    | 'string'
    | 'keyword'
    | 'operator'
    | 'number'
    | 'rule'
    | 'lambda'
    | 'property'
    | 'template';
}

const CODE_KEYWORDS = new Set([
  'def',
  'return',
  'import',
  'from',
  'export',
  'const',
  'let',
  'var',
  'function',
  'async',
  'await',
  'if',
  'else',
  'for',
  'while',
  'pub',
  'fn',
  'struct',
  'enum',
  'impl',
  'match',
  'package',
  'type',
  'interface',
  'class',
  'public',
  'private',
  'static',
  'final',
  'SELECT',
  'INSERT',
  'INTO',
  'VALUES',
  'CREATE',
  'TABLE',
  'PRIMARY',
  'KEY',
  'NOT',
  'NULL',
  'module',
  'func',
  'param',
  'result',
  'true',
  'false',
  'null',
  'True',
  'False',
  'None',
  'flow',
  'edge',
  'step',
  'verify',
  'next',
  'stage',
]);

export function tokenizeLineForSyntaxColor(
  line: string,
  mode: SyntaxLanguageMode,
  commentPrefix = '//'
): HighlightToken[] {
  if (!line) return [];
  if (mode === 'plain') return [{ text: line, kind: 'plain' }];

  const tokens: HighlightToken[] = [];
  const trimmedComment = commentPrefix.trim();

  // Whole-line comment check
  if (
    (trimmedComment && line.trimStart().startsWith(trimmedComment)) ||
    line.trimStart().startsWith('//') ||
    line.trimStart().startsWith('--') ||
    line.trimStart().startsWith(';;') ||
    (mode !== 'json' && line.trimStart().startsWith('#'))
  ) {
    return [{ text: line, kind: 'comment' }];
  }

  // Grammar LHS rule name detection
  let startIdx = 0;
  if (mode === 'grammar') {
    const lhs = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*)(::=|:=|<-|->|=|\s)/);
    if (lhs) {
      if (lhs[1]) tokens.push({ text: lhs[1], kind: 'plain' });
      tokens.push({ text: lhs[2], kind: 'rule' });
      if (lhs[3]) tokens.push({ text: lhs[3], kind: 'plain' });
      tokens.push({ text: lhs[4], kind: lhs[4].trim() ? 'operator' : 'plain' });
      startIdx = lhs[0].length;
    }
  }

  let i = startIdx;
  while (i < line.length) {
    const rest = line.slice(i);

    // Inline comment
    if (
      (trimmedComment && rest.startsWith(trimmedComment)) ||
      (mode === 'code' && (rest.startsWith('//') || rest.startsWith(';;')))
    ) {
      tokens.push({ text: rest, kind: 'comment' });
      break;
    }

    // Template interpolation {{...}}
    const tmpl = rest.match(/^\{\{[^}]+\}\}/);
    if (tmpl) {
      tokens.push({ text: tmpl[0], kind: 'template' });
      i += tmpl[0].length;
      continue;
    }

    // Quoted string
    if (rest[0] === '"' || rest[0] === "'" || rest[0] === '`') {
      const quote = rest[0];
      let j = 1;
      while (j < rest.length) {
        if (rest[j] === '\\') {
          j += 2;
          continue;
        }
        if (rest[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      const strTok = rest.slice(0, j);
      const after = rest.slice(j).trimStart();
      tokens.push({
        text: strTok,
        kind: mode === 'json' && after.startsWith(':') ? 'property' : 'string',
      });
      i += j;
      continue;
    }

    // Lambda / logical symbols
    const logicOp = rest.match(/^(λ|¬|∧|∨|⊕|→|↔|≡|∀|∃|⊤|⊥|≠|≤|≥|::=|:=|<-|->|\(\?<=|\(\?<!|\|\||&&|=>)/);
    if (logicOp) {
      tokens.push({
        text: logicOp[0],
        kind: logicOp[0] === 'λ' ? 'lambda' : 'operator',
      });
      i += logicOp[0].length;
      continue;
    }

    // Numbers
    const num = rest.match(/^\b\d+(?:\.\d+)?\b/);
    if (num) {
      tokens.push({ text: num[0], kind: 'number' });
      i += num[0].length;
      continue;
    }

    // Identifiers / keywords
    const ident = rest.match(/^[A-Za-z_@][A-Za-z0-9_/-]*/);
    if (ident) {
      const word = ident[0];
      const nextChar = rest[word.length];
      let kind: HighlightToken['kind'] = 'plain';
      if (word.startsWith('@')) kind = 'template';
      else if (CODE_KEYWORDS.has(word)) kind = 'keyword';
      else if (nextChar === '(') kind = 'lambda';
      else if (mode === 'grammar' || mode === 'dsl') kind = 'rule';
      else if (mode === 'logic') kind = 'property';
      tokens.push({ text: word, kind });
      i += word.length;
      continue;
    }

    // Single-char operators / punctuation
    if ('+*?{}()[]|&!./=<>%^-'.includes(rest[0])) {
      tokens.push({ text: rest[0], kind: 'operator' });
      i += 1;
      continue;
    }

    tokens.push({ text: rest[0], kind: 'plain' });
    i += 1;
  }

  return tokens;
}

export function getTokenColorClass(kind: HighlightToken['kind'], darkSurface = true): string {
  if (darkSurface) {
    switch (kind) {
      case 'comment':
        return 'text-slate-500 italic';
      case 'string':
        return 'text-emerald-300';
      case 'keyword':
        return 'text-violet-300 font-semibold';
      case 'operator':
        return 'text-amber-300 font-semibold';
      case 'number':
        return 'text-cyan-300';
      case 'rule':
        return 'text-sky-300';
      case 'lambda':
        return 'text-fuchsia-300 font-semibold';
      case 'property':
        return 'text-blue-300';
      case 'template':
        return 'text-teal-300 font-semibold';
      default:
        return 'text-slate-100';
    }
  }
  switch (kind) {
    case 'comment':
      return 'text-slate-400 italic';
    case 'string':
      return 'text-emerald-700 dark:text-emerald-300';
    case 'keyword':
      return 'text-violet-700 font-semibold dark:text-violet-300';
    case 'operator':
      return 'text-amber-700 font-semibold dark:text-amber-300';
    case 'number':
      return 'text-cyan-700 dark:text-cyan-300';
    case 'rule':
      return 'text-blue-700 dark:text-sky-300';
    case 'lambda':
      return 'text-fuchsia-700 font-semibold dark:text-fuchsia-300';
    case 'property':
      return 'text-indigo-700 dark:text-blue-300';
    case 'template':
      return 'text-teal-700 font-semibold dark:text-teal-300';
    default:
      return 'text-slate-900 dark:text-slate-100';
  }
}
