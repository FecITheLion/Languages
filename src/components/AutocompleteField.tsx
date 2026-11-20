import { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, Check, Plus, Sparkles, X } from 'lucide-react';
import {
  BUILTIN_REFERENCED_MODULES,
  filterSuggestions,
  parseCustomReferencedModule,
  type AutocompleteSuggestion,
  type ReferencedModule,
  type ReferencedModuleExport,
} from '../engine/moduleAutocompleteEngine';
import {
  getTokenColorClass,
  tokenizeLineForSyntaxColor,
  type SyntaxLanguageMode,
} from '../engine/syntaxColorEngine';

interface AutocompleteFieldProps {
  value: string;
  onChange: (nextValue: string) => void;
  suggestions: AutocompleteSuggestion[];
  onRippleModuleExport?: (exp: ReferencedModuleExport, moduleName?: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  ariaLabel?: string;
  syntaxMode?: SyntaxLanguageMode;
  commentPrefix?: string;
  darkSurface?: boolean;
  className?: string;
  inputId?: string;
  /** Optional module loader controls right in the field header */
  showModuleLoader?: boolean;
  loadedModules?: ReferencedModule[];
  allAvailableModules?: ReferencedModule[];
  onToggleModule?: (moduleId: string) => void;
  onAddCustomModule?: (mod: ReferencedModule) => void;
}

const KIND_LABELS: Record<AutocompleteSuggestion['kind'], string> = {
  rule: 'RULE',
  lambda: 'LAMBDA',
  label: 'LABEL',
  module_rule: 'MOD RULE',
  module_callback: 'MOD λ',
  module_snippet: 'MOD',
  dag_symbol: 'DAG OP',
  cauchy: 'CAUCHY',
  keyword: 'KW',
};

function getTokenAtCaret(text: string, caretPos: number): { token: string; start: number; end: number } {
  const safeCaret = Math.max(0, Math.min(text.length, caretPos));
  let start = safeCaret;
  while (start > 0 && /[A-Za-z0-9_@/-]/.test(text[start - 1])) {
    start -= 1;
  }
  return {
    token: text.slice(start, safeCaret),
    start,
    end: safeCaret,
  };
}

export function AutocompleteField({
  value,
  onChange,
  suggestions,
  onRippleModuleExport,
  multiline = false,
  rows = 8,
  placeholder,
  ariaLabel,
  syntaxMode = 'plain',
  commentPrefix = '//',
  darkSurface = true,
  className = '',
  inputId,
  showModuleLoader = false,
  loadedModules = [],
  allAvailableModules = BUILTIN_REFERENCED_MODULES,
  onToggleModule,
  onAddCustomModule,
}: AutocompleteFieldProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hasNavigated, setHasNavigated] = useState(false);
  const [caretPos, setCaretPos] = useState(0);
  const [moduleDrawerOpen, setModuleDrawerOpen] = useState(false);
  const [customModName, setCustomModName] = useState('@custom/helpers');
  const [customModRaw, setCustomModRaw] = useState('');
  const [customModError, setCustomModError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);

  const tokenInfo = useMemo(() => getTokenAtCaret(value, caretPos), [value, caretPos]);

  const filtered = useMemo(
    () => filterSuggestions(suggestions, tokenInfo.token, 10),
    [suggestions, tokenInfo.token]
  );

  useEffect(() => {
    setActiveIndex(0);
    setHasNavigated(false);
  }, [tokenInfo.token, filtered.length]);

  useEffect(() => {
    if (!open && !moduleDrawerOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setModuleDrawerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open, moduleDrawerOpen]);

  const highlightedLines = useMemo(() => {
    if (syntaxMode === 'plain') return null;
    return value.split('\n').map((line) => tokenizeLineForSyntaxColor(line, syntaxMode, commentPrefix));
  }, [value, syntaxMode, commentPrefix]);

  const applySuggestion = (item: AutocompleteSuggestion) => {
    const { start, end } = tokenInfo;
    const nextValue = value.slice(0, start) + item.insertText + value.slice(end);
    onChange(nextValue);
    if (item.rippleExport && onRippleModuleExport) {
      onRippleModuleExport(item.rippleExport, item.moduleName);
    }
    setOpen(false);
    const nextCaret = start + item.insertText.length;
    setCaretPos(nextCaret);
    window.requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
      e.preventDefault();
      setCaretPos(e.currentTarget.selectionStart ?? value.length);
      setHasNavigated(true);
      setOpen(true);
      return;
    }
    if (!open || filtered.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHasNavigated(true);
      setActiveIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHasNavigated(true);
      setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const chosen = filtered[activeIndex] || filtered[0];
      if (chosen) applySuggestion(chosen);
    } else if (e.key === 'Enter') {
      // Never hijack Enter in multiline editors unless the user explicitly navigated the popup (or pressed Ctrl+Space)
      if (multiline && !hasNavigated) {
        setOpen(false);
        return;
      }
      e.preventDefault();
      const chosen = filtered[activeIndex] || filtered[0];
      if (chosen) applySuggestion(chosen);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setHasNavigated(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const nextVal = e.target.value;
    const nextCaret = e.target.selectionStart ?? nextVal.length;
    onChange(nextVal);
    setCaretPos(nextCaret);
    const tok = getTokenAtCaret(nextVal, nextCaret).token;
    if (tok.length >= 1 || nextVal.slice(Math.max(0, nextCaret - 2), nextCaret) === '{{') {
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const handleSyncScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (backdropRef.current) {
      backdropRef.current.scrollTop = e.currentTarget.scrollTop;
      backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const loadedSet = useMemo(() => new Set(loadedModules.map((m) => m.id)), [loadedModules]);

  const handleLoadCustomModule = () => {
    const parsed = parseCustomReferencedModule(customModRaw, customModName.trim() || '@custom/module');
    if (!parsed.ok) {
      setCustomModError(parsed.error);
      return;
    }
    setCustomModError(null);
    onAddCustomModule?.(parsed.module);
    setCustomModRaw('');
  };

  const useSyntaxOverlay = multiline && syntaxMode !== 'plain';

  return (
    <div ref={containerRef} className="relative w-full">
      {showModuleLoader && (
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <Sparkles className="h-3 w-3 text-blue-500" />
            <span>
              Type or press <kbd className="rounded border border-slate-300 px-1 font-mono text-[10px] dark:border-slate-700">Ctrl+Space</kbd> for live scope &amp; module autocomplete
            </span>
          </div>
          <button
            type="button"
            onClick={() => setModuleDrawerOpen((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
              moduleDrawerOpen
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            <Boxes className="h-3 w-3" />
            Modules ({loadedModules.length})
          </button>
        </div>
      )}

      {/* Referenced Module Loader Popover */}
      {showModuleLoader && moduleDrawerOpen && (
        <div className="mb-2 space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-950">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              Load Referenced Modules (Live Scope Autocomplete &amp; Ripple)
            </span>
            <button
              type="button"
              onClick={() => setModuleDrawerOpen(false)}
              className="rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Close module loader"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {allAvailableModules.map((mod) => {
              const isLoaded = loadedSet.has(mod.id);
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => onToggleModule?.(mod.id)}
                  className={`flex items-start justify-between gap-2 rounded-md border p-2 text-left transition-colors ${
                    isLoaded
                      ? 'border-blue-500 bg-blue-50/70 dark:border-blue-600 dark:bg-blue-950/40'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] font-semibold text-slate-900 dark:text-slate-100">
                      {mod.name} <span className="font-normal text-slate-400">v{mod.version}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                      {mod.exports.length} exports: {mod.exports.map((e) => e.name).join(', ')}
                    </div>
                  </div>
                  <span
                    className={`mt-0.5 inline-flex shrink-0 items-center gap-0.5 font-mono text-[10px] font-semibold ${
                      isLoaded ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                    }`}
                  >
                    {isLoaded ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    {isLoaded ? 'Loaded' : 'Load'}
                  </span>
                </button>
              );
            })}
          </div>

          {onAddCustomModule && (
            <div className="space-y-1.5 border-t border-slate-200 pt-2 dark:border-slate-800">
              <div className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                Load Custom Referenced Module (EBNF rules, <code className="font-mono">fn = λx. ...</code>, or JSON manifest)
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="text"
                  value={customModName}
                  onChange={(e) => setCustomModName(e.target.value)}
                  placeholder="@custom/module"
                  className="w-40 rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleLoadCustomModule}
                  className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
                >
                  <Plus className="h-3 w-3" />
                  Load Module into Scope
                </button>
              </div>
              <textarea
                rows={3}
                value={customModRaw}
                onChange={(e) => setCustomModRaw(e.target.value)}
                placeholder={'currency ::= "USD" | "EUR"\nwith_margin = λx. x * 1.15'}
                spellCheck={false}
                className="w-full rounded border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              {customModError && (
                <div className="text-[11px] text-red-600 dark:text-red-400">{customModError}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modifiable Input or Syntax-Colored Overlay Textarea */}
      {multiline ? (
        useSyntaxOverlay ? (
          <div
            className={`relative overflow-hidden rounded-lg border border-slate-200 focus-within:border-blue-500 dark:border-slate-800 ${
              darkSurface ? 'bg-slate-950' : 'bg-white dark:bg-slate-950'
            }`}
          >
            <div
              ref={backdropRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words p-3.5 font-mono text-xs leading-5"
            >
              {highlightedLines?.map((lineToks, lineIdx) => (
                <span key={lineIdx}>
                  {lineToks.map((tok, tokIdx) => (
                    <span key={tokIdx} className={getTokenColorClass(tok.kind, darkSurface)}>
                      {tok.text}
                    </span>
                  ))}
                  {lineIdx < highlightedLines.length - 1 ? '\n' : '\n'}
                </span>
              ))}
            </div>
            <textarea
              ref={(el) => {
                inputRef.current = el;
              }}
              id={inputId}
              rows={rows}
              value={value}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onKeyUp={(e) => setCaretPos(e.currentTarget.selectionStart ?? value.length)}
              onSelect={(e) => setCaretPos(e.currentTarget.selectionStart ?? value.length)}
              onScroll={handleSyncScroll}
              onClick={(e) => setCaretPos(e.currentTarget.selectionStart ?? value.length)}
              spellCheck={false}
              placeholder={placeholder}
              aria-label={ariaLabel}
              className={`relative z-10 block w-full resize-y bg-transparent p-3.5 font-mono text-xs leading-5 text-transparent focus:outline-none ${
                darkSurface ? 'caret-blue-400' : 'caret-blue-600 dark:caret-blue-400'
              } ${className}`}
            />
          </div>
        ) : (
          <textarea
            ref={(el) => {
              inputRef.current = el;
            }}
            id={inputId}
            rows={rows}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onClick={(e) => setCaretPos(e.currentTarget.selectionStart ?? value.length)}
            spellCheck={false}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className={className}
          />
        )
      ) : (
        <input
          ref={(el) => {
            inputRef.current = el;
          }}
          id={inputId}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onClick={(e) => setCaretPos(e.currentTarget.selectionStart ?? value.length)}
          spellCheck={false}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className={className}
        />
      )}

      {/* Autocomplete Suggestions Popover */}
      {open && filtered.length > 0 && (
        <div
          role="listbox"
          aria-label="Live scope and referenced module suggestions"
          className="absolute top-full left-0 z-50 mt-1 max-h-64 w-full min-w-[260px] max-w-[460px] overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-2 py-1 text-[10px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>Suggestions ({filtered.length}) · Tab/Enter to apply &amp; ripple</span>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
              className="text-slate-400 hover:text-slate-700"
            >
              Esc
            </button>
          </div>
          {filtered.map((item, idx) => {
            const isSelected = idx === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(item);
                }}
                className={`flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors ${
                  isSelected
                    ? 'bg-blue-50 text-slate-900 dark:bg-blue-950/60 dark:text-slate-100'
                    : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs font-semibold text-blue-700 dark:text-blue-300">
                    {item.label}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] font-medium text-slate-400">
                    {KIND_LABELS[item.kind]}
                    {item.rippleExport ? ' · Ripples' : ''}
                  </span>
                </div>
                <div className="truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">
                  {item.detail}
                </div>
                <div className="line-clamp-1 text-[10px] text-slate-500 dark:text-slate-400">
                  {item.documentation}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
