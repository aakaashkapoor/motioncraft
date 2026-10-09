// Syntax highlighting for code shown on screen: Prism (MIT, pinned) tokenizes
// synchronously at render time with no network, and the tokens are reduced to
// a few roles that the theme colors (see `syntaxColors`).

import Prism from "prismjs";
// Prism's main build has markup, css, clike and javascript; these add the rest.
// Order matters: a language must load after the ones it extends.
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-jsx.js";
import "prismjs/components/prism-tsx.js";
import "prismjs/components/prism-json.js";
import "prismjs/components/prism-bash.js";
import "prismjs/components/prism-python.js";
import "prismjs/components/prism-yaml.js";
import "prismjs/components/prism-rust.js";
import "prismjs/components/prism-go.js";
import "prismjs/components/prism-sql.js";
import "prismjs/components/prism-diff.js";

export const SYNTAX_ROLES = ["plain", "keyword", "string", "number", "comment", "function", "type", "punctuation"] as const;
export type SyntaxRole = (typeof SYNTAX_ROLES)[number];

export interface CodeToken {
  text: string;
  role: SyntaxRole;
}

/** Prism token types (and aliases) by the role they take. Anything else inherits its parent's role. */
const ROLE_OF: Record<string, SyntaxRole> = {
  keyword: "keyword",
  tag: "keyword",
  atrule: "keyword",
  important: "keyword",
  deleted: "keyword",
  string: "string",
  "template-string": "string",
  char: "string",
  regex: "string",
  "attr-value": "string",
  url: "string",
  inserted: "string",
  number: "number",
  boolean: "number",
  constant: "number",
  symbol: "number",
  comment: "comment",
  prolog: "comment",
  doctype: "comment",
  cdata: "comment",
  function: "function",
  "function-variable": "function",
  method: "function",
  "attr-name": "function",
  property: "function",
  selector: "function",
  "class-name": "type",
  builtin: "type",
  namespace: "type",
  punctuation: "punctuation",
  operator: "punctuation",
};

/** Language names Prism knows, plus a few common short names. */
const ALIASES: Record<string, string> = { js: "javascript", ts: "typescript", sh: "bash", shell: "bash", py: "python", yml: "yaml", rs: "rust" };

function roleOf(token: Prism.Token, inherited: SyntaxRole): SyntaxRole {
  const aliases = token.alias === undefined ? [] : Array.isArray(token.alias) ? token.alias : [token.alias];
  for (const name of [token.type, ...aliases]) {
    const role = ROLE_OF[name];
    if (role !== undefined) return role;
  }
  return inherited;
}

function flatten(stream: Prism.TokenStream, role: SyntaxRole, out: CodeToken[]): void {
  if (typeof stream === "string") {
    if (stream !== "") out.push({ text: stream, role });
  } else if (Array.isArray(stream)) {
    for (const part of stream) flatten(part, role, out);
  } else {
    flatten(stream.content, roleOf(stream, role), out);
  }
}

/**
 * `code` split into lines of role-tagged tokens. Each line's tokens join back
 * to exactly that line. An unknown `language` gives plain text.
 */
export function highlightCode(code: string, language: string): CodeToken[][] {
  const grammar = Prism.languages[ALIASES[language] ?? language];
  const flat: CodeToken[] = [];
  if (grammar === undefined) flat.push({ text: code, role: "plain" });
  else flatten(Prism.tokenize(code, grammar), "plain", flat);

  const lines: CodeToken[][] = [[]];
  for (const token of flat) {
    token.text.split("\n").forEach((text, i) => {
      if (i > 0) lines.push([]);
      if (text !== "") lines.at(-1)!.push({ text, role: token.role });
    });
  }
  return lines;
}
