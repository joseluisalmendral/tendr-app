import sanitizeHtml from "sanitize-html";

/**
 * Sanitizes model-generated HTML before it is persisted or previewed
 * (F7c PR-F7C-4a, decision #777 security contract, plan-beautify #778).
 *
 * The beautify_email feature asks an LLM for a full HTML email document. That
 * output is UNTRUSTED, so it never reaches `dangerouslySetInnerHTML` or the DB
 * raw. This pass:
 *   - STRIPS <script>, every `on*` event handler attribute, and `javascript:`
 *     URLs (sanitize-html drops unknown tags/attrs and rejects schemes outside
 *     the allowlist by default);
 *   - STRIPS external non-image resources by restricting URL schemes to
 *     https / mailto (no http, no protocol-relative, no javascript:/data: on
 *     links). Images are limited to https (remote tracking pixels over http are
 *     blocked; image-less design is preferred per #778);
 *   - PRESERVES the email-client-safe surface: inline `style` attributes (Gmail
 *     strips <link>, so inline CSS is mandatory), table layout
 *     (table/thead/tbody/tr/td/th + width/cellpadding/cellspacing), the
 *     preheader span, and the document <head>/<meta>/<style> needed for
 *     color-scheme + media queries.
 *
 * Defense-in-depth: sanitize-html does NOT deep-parse CSS inside <style>
 * blocks, so the PREVIEW renders this HTML inside a `sandbox=""` iframe (no
 * allow-scripts, no allow-same-origin) in PR-F7C-4b — any CSS-only payload is
 * inert there. This sanitizer is the persist-time guarantee; the sandbox is the
 * render-time guarantee.
 *
 * Pure + synchronous (htmlparser2 under the hood, NO jsdom) so it is
 * import-testable and cheap to run before every persist.
 */

/** Style-property value matchers — allow only safe, email-relevant CSS values. */
const HEX_OR_RGB = [
  /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
  /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/,
  /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)$/,
];
const LENGTH = [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)$/];
const LENGTH_LIST = [/^(?:-?\d+(?:\.\d+)?(?:px|em|rem|%)\s*){1,4}$/];

const ALLOWED_STYLES: sanitizeHtml.IOptions["allowedStyles"] = {
  "*": {
    color: HEX_OR_RGB,
    "background-color": HEX_OR_RGB,
    background: HEX_OR_RGB,
    "font-size": LENGTH,
    "font-family": [/^[\w\s,'"-]+$/],
    "font-weight": [/^(?:normal|bold|[1-9]00)$/],
    "font-style": [/^(?:normal|italic)$/],
    "line-height": [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/],
    "text-align": [/^(?:left|right|center|justify)$/],
    "text-decoration": [/^(?:none|underline)$/],
    "vertical-align": [/^(?:top|middle|bottom|baseline)$/],
    padding: LENGTH_LIST,
    "padding-top": LENGTH,
    "padding-right": LENGTH,
    "padding-bottom": LENGTH,
    "padding-left": LENGTH,
    margin: [/^(?:0|auto|(?:-?\d+(?:\.\d+)?(?:px|em|rem|%)\s*){1,4})$/],
    "margin-top": LENGTH,
    "margin-bottom": LENGTH,
    width: LENGTH,
    "max-width": LENGTH,
    "min-width": LENGTH,
    height: LENGTH,
    border: [/^[\w\s#().,%-]+$/],
    "border-radius": LENGTH,
    "border-collapse": [/^(?:collapse|separate)$/],
    display: [/^(?:block|inline|inline-block|none|table|table-cell)$/],
    overflow: [/^(?:hidden|visible|auto)$/],
    "max-height": LENGTH,
    "mso-hide": [/^all$/],
  },
};

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  // Keep the full HTML-document subset an email needs; everything else is dropped.
  allowedTags: [
    "html",
    "head",
    "meta",
    "title",
    "style",
    "body",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
    "div",
    "span",
    "p",
    "br",
    "hr",
    "a",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "h1",
    "h2",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "img",
  ],
  allowedAttributes: {
    "*": ["style", "class", "align", "valign", "width", "height", "bgcolor"],
    a: ["href", "target"],
    img: ["src", "alt", "width", "height"],
    meta: ["name", "content", "charset"],
    table: ["cellpadding", "cellspacing", "role", "width", "border"],
  },
  allowedStyles: ALLOWED_STYLES,
  // No http (insecure remote + most tracking), no javascript:, no data: links.
  allowedSchemes: ["https", "mailto"],
  // Images: https only (remote http tracking pixels blocked; data: denied to
  // favor the image-less design #778 recommends).
  allowedSchemesByTag: { img: ["https"] },
  // Keep the <head>, <meta> and <style> needed for color-scheme + media queries.
  allowVulnerableTags: false,
  parser: { lowerCaseTags: true, lowerCaseAttributeNames: true },
  // Preserve the whole document structure (sanitize-html otherwise drops
  // html/head/body framing in fragment mode).
  enforceHtmlBoundary: true,
};

/**
 * Returns a sanitized copy of `html` safe to persist and preview. Never throws
 * on malformed input — sanitize-html best-effort parses and drops anything
 * outside the allowlist.
 */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}
