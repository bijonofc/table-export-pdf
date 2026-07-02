// Syntax highlighting for the code snippets (dev-only; highlight.js is a devDependency).
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import 'highlight.js/styles/github.css';

hljs.registerLanguage('javascript', javascript);

export function highlight(code) {
    return hljs.highlight(code, { language: 'javascript' }).value;
}
