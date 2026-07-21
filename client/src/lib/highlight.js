// Syntax highlighting for snippets, backed by highlight.js.
// We register only a curated set of languages to keep the bundle lean.
import hljs from 'highlight.js/lib/core';
import 'highlight.js/styles/github-dark.css';

import bash from 'highlight.js/lib/languages/bash';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import java from 'highlight.js/lib/languages/java';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import markdown from 'highlight.js/lib/languages/markdown';
import dockerfile from 'highlight.js/lib/languages/dockerfile';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('java', java);
hljs.registerLanguage('python', python);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('php', php);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('dockerfile', dockerfile);

// Options shown in the snippet language dropdown.
// `value` is stored on the snippet; 'plaintext' means "no coloring, plain text".
export const LANGUAGES = [
  { value: 'plaintext', label: 'Plain text' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'python', label: 'Python' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'sql', label: 'SQL' },
  { value: 'xml', label: 'HTML / XML' },
  { value: 'css', label: 'CSS' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'dockerfile', label: 'Dockerfile' },
];

// Common aliases mapped onto our registered language ids, so legacy snippets
// (whose language was free text, e.g. "js", "sh") still colorize correctly.
const ALIASES = {
  js: 'javascript',
  jsx: 'javascript',
  react: 'javascript',
  vue: 'javascript',
  node: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  py: 'python',
  yml: 'yaml',
  html: 'xml',
  'c++': 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  md: 'markdown',
  docker: 'dockerfile',
  text: 'plaintext',
  plain: 'plaintext',
  none: 'plaintext',
  '': 'plaintext',
};

function resolveLanguage(language) {
  const key = (language || '').trim().toLowerCase();
  if (ALIASES[key]) return ALIASES[key];
  if (hljs.getLanguage(key)) return key;
  return 'plaintext';
}

const LABELS = new Map(LANGUAGES.map((l) => [l.value, l.label]));

// Friendly display label for a stored language value (resolving aliases).
// Falls back to the raw value for anything we don't recognize.
export function languageLabel(language) {
  const resolved = resolveLanguage(language);
  return LABELS.get(resolved) || language || 'Plain text';
}

// Returns highlighted HTML for `code` in the given language.
// Falls back to escaped plain text when the language is unknown or 'plaintext'.
export function highlight(code, language) {
  const lang = resolveLanguage(language);
  if (lang === 'plaintext') return escapeHtml(code);
  try {
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
