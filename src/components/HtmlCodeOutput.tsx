import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Code2, Copy, Download, Info, XCircle } from 'lucide-react';
import {
  formatCodeAsHtmlDocument,
  type StudioLintIssue,
} from '../engine/htmlOutputFormatter';

interface HtmlCodeOutputProps {
  title: string;
  language: string;
  code: string;
  filename?: string;
  issues?: StudioLintIssue[];
  lintIssues?: StudioLintIssue[];
  maxHeightClass?: string;
  onDownloadHtml?: (content: string, filename: string, mime: string) => void;
}

function tokenizeLineToSpans(line: string): Array<{ text: string; cls: string }> {
  if (!line) return [{ text: ' ', cls: '' }];
  const trimmed = line.trim();
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith(';;') ||
    trimmed.startsWith('--')
  ) {
    return [{ text: line, cls: 'text-slate-500 italic' }];
  }

  const tokens: Array<{ text: string; cls: string }> = [];
  const regex =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:def|return|pub|const|fn|let|struct|record|export|import|function|class|if|else|for|in|true|false|True|False|NULL|CREATE|TABLE|INSERT|INTO|VALUES|package|func|namespace|inline|declare)\b|\b\d+(?:\.\d+)?\b|::=|:=|<-|->|=>|[λ∧∨⊕→↔≡¬∀∃≤≥≠])/g;

  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIdx) {
      tokens.push({ text: line.slice(lastIdx, match.index), cls: 'text-slate-200' });
    }
    const tok = match[0];
    let cls = 'text-slate-200';
    if (tok.startsWith('"') || tok.startsWith("'")) {
      cls = 'text-emerald-300';
    } else if (/^\d/.test(tok)) {
      cls = 'text-amber-300';
    } else if (/^(::=|:=|<-|->|=>|[λ∧∨⊕→↔≡¬∀∃≤≥≠])$/.test(tok)) {
      cls = 'text-sky-400 font-semibold';
    } else {
      cls = 'text-blue-300 font-medium';
    }
    tokens.push({ text: tok, cls });
    lastIdx = match.index + tok.length;
  }
  if (lastIdx < line.length) {
    tokens.push({ text: line.slice(lastIdx), cls: 'text-slate-200' });
  }
  return tokens;
}

/**
 * Renders any Studio output in semantic HTML format with syntax highlighting,
 * line numbers, inline unused-call & lint highlights with hover tooltips, and Copy/Download HTML.
 */
export function HtmlCodeOutput({
  title,
  language,
  code,
  filename,
  issues,
  lintIssues,
  maxHeightClass = 'max-h-[360px]',
  onDownloadHtml,
}: HtmlCodeOutputProps) {
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const resolvedIssues = useMemo(
    () => (issues && issues.length > 0 ? issues : lintIssues ?? []),
    [issues, lintIssues]
  );

  const lines = useMemo(() => code.split(/\r?\n/), [code]);

  const htmlDoc = useMemo(
    () => formatCodeAsHtmlDocument(code, title, language, resolvedIssues),
    [code, title, language, resolvedIssues]
  );

  const lineIssuesMap = useMemo(() => {
    const map = new Map<number, StudioLintIssue[]>();
    lines.forEach((line, idx) => {
      const ln = idx + 1;
      const matched: StudioLintIssue[] = [];
      for (const issue of resolvedIssues) {
        if (issue.lineNumber === ln) {
          matched.push(issue);
        } else if (
          !issue.lineNumber &&
          issue.symbol &&
          new RegExp(`\\b${issue.symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(line)
        ) {
          matched.push(issue);
        }
      }
      if (matched.length > 0) map.set(ln, matched);
    });
    return map;
  }, [lines, resolvedIssues]);

  const handleCopyHtml = async () => {
    try {
      await navigator.clipboard.writeText(htmlDoc);
      setCopiedHtml(true);
      window.setTimeout(() => setCopiedHtml(false), 1600);
    } catch {
      // Ignore restricted clipboard
    }
  };

  const slug = (filename || title).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'output';

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3 py-1.5 text-[11px]">
        <div className="flex items-center gap-2 font-mono text-slate-300">
          <Code2 className="h-3.5 w-3.5 text-sky-400" />
          <span className="font-semibold text-slate-100">{title}</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400">HTML ({language})</span>
          <span className="text-slate-500">·</span>
          <span className="tabular-nums text-slate-400">{lines.length}L</span>
          {resolvedIssues.length > 0 && (
            <>
              <span className="text-slate-500">·</span>
              <span className="tabular-nums text-amber-400">
                {resolvedIssues.length} lint
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleCopyHtml()}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-200 hover:bg-slate-700"
          >
            {copiedHtml ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copiedHtml ? 'Copied HTML' : 'Copy HTML'}
          </button>
          {onDownloadHtml && (
            <button
              type="button"
              onClick={() => onDownloadHtml(htmlDoc, filename ? `${filename}.html` : `${slug}.html`, 'text/html')}
              className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 font-mono text-[10px] text-white hover:bg-blue-700"
            >
              <Download className="h-3 w-3" />
              .html
            </button>
          )}
        </div>
      </div>

      <div className={`${maxHeightClass} overflow-auto font-mono text-[11px] leading-5`}>
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => {
              const ln = idx + 1;
              const lineIssues = lineIssuesMap.get(ln) || [];
              const primaryIssue = lineIssues[0];
              const rowBg = primaryIssue
                ? primaryIssue.severity === 'error'
                  ? 'bg-red-950/45'
                  : primaryIssue.severity === 'warning'
                    ? 'bg-amber-950/35'
                    : 'bg-blue-950/30'
                : '';
              const spans = tokenizeLineToSpans(line);

              return (
                <tr key={ln} className={`${rowBg} hover:bg-slate-900/70`}>
                  <td className="w-9 select-none border-r border-slate-800/80 px-2 text-right align-top tabular-nums text-slate-500">
                    {ln}
                  </td>
                  <td className="relative px-2.5 whitespace-pre">
                    <span
                      className={
                        primaryIssue
                          ? primaryIssue.severity === 'error'
                            ? 'underline decoration-red-400 decoration-wavy underline-offset-2'
                            : primaryIssue.severity === 'warning'
                              ? 'underline decoration-amber-400 decoration-wavy underline-offset-2'
                              : 'underline decoration-sky-400 decoration-dotted underline-offset-2'
                          : ''
                      }
                      title={
                        primaryIssue
                          ? `[${primaryIssue.code}] ${primaryIssue.message} — ${primaryIssue.suggestion}`
                          : undefined
                      }
                    >
                      {spans.map((sp, si) => (
                        <span key={si} className={sp.cls}>
                          {sp.text}
                        </span>
                      ))}
                    </span>

                    {primaryIssue && (
                      <button
                        type="button"
                        onClick={() =>
                          setActiveIssueId((prev) => (prev === `${ln}:${primaryIssue.id}` ? null : `${ln}:${primaryIssue.id}`))
                        }
                        title={`[${primaryIssue.code}] ${primaryIssue.message}`}
                        className={`ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0 font-sans text-[10px] font-medium ${
                          primaryIssue.severity === 'error'
                            ? 'bg-red-950/90 text-red-300'
                            : primaryIssue.severity === 'warning'
                              ? 'bg-amber-950/90 text-amber-300'
                              : 'bg-blue-950/90 text-sky-300'
                        }`}
                      >
                        {primaryIssue.severity === 'error' ? (
                          <XCircle className="h-2.5 w-2.5" />
                        ) : primaryIssue.severity === 'warning' ? (
                          <AlertTriangle className="h-2.5 w-2.5" />
                        ) : (
                          <Info className="h-2.5 w-2.5" />
                        )}
                        {primaryIssue.code}
                      </button>
                    )}

                    {primaryIssue && activeIssueId === `${ln}:${primaryIssue.id}` && (
                      <div className="my-1 whitespace-normal rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-sans text-[11px] text-slate-200 shadow-lg">
                        <div className="font-semibold text-amber-300">
                          {primaryIssue.code}: {primaryIssue.symbol}
                        </div>
                        <div className="mt-0.5 text-slate-300">{primaryIssue.message}</div>
                        <div className="mt-0.5 text-slate-400">Fix: {primaryIssue.suggestion}</div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
