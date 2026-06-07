import { describe, expect, it } from "vitest";

import { sanitizeEmailHtml } from "../sanitize-email-html";

/**
 * Sanitizer contract (decision #777 security + plan-beautify #778):
 *   STRIPS  — <script>, on* event handlers, javascript: URLs, http/external
 *             non-image resources.
 *   KEEPS   — inline style attributes, table layout (+ width/cellpadding),
 *             https <img>, mailto links.
 *
 * sanitize-html is pure (no jsdom), so these run in the default node env.
 */

describe("sanitizeEmailHtml — strips dangerous content", () => {
  it("removes <script> tags and their content", () => {
    const out = sanitizeEmailHtml(
      '<div>Hola<script>alert("xss")</script></div>',
    );
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
    expect(out).toContain("Hola");
  });

  it("strips on* event handler attributes", () => {
    const out = sanitizeEmailHtml(
      '<div onclick="steal()" onmouseover="x()">Texto</div>',
    );
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onmouseover");
    expect(out).toContain("Texto");
  });

  it("drops javascript: URLs on anchors", () => {
    const out = sanitizeEmailHtml(
      '<a href="javascript:alert(1)">click</a>',
    );
    expect(out).not.toContain("javascript:");
    // The link text survives even though the href is rejected.
    expect(out).toContain("click");
  });

  it("strips http (insecure/external) image sources", () => {
    const out = sanitizeEmailHtml(
      '<img src="http://tracker.example.com/pixel.gif" alt="x" />',
    );
    expect(out).not.toContain("http://tracker.example.com");
  });

  it("strips data: image sources (image-less design)", () => {
    const out = sanitizeEmailHtml(
      '<img src="data:image/png;base64,AAAA" alt="x" />',
    );
    expect(out).not.toContain("data:image");
  });

  it("removes disallowed tags like <iframe> and <object>", () => {
    const out = sanitizeEmailHtml(
      '<div><iframe src="https://evil.test"></iframe><object></object>ok</div>',
    );
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<object");
    expect(out).toContain("ok");
  });
});

describe("sanitizeEmailHtml — preserves email-safe content", () => {
  it("keeps inline style attributes", () => {
    const out = sanitizeEmailHtml(
      '<td style="padding:16px;background-color:#2563eb;color:#ffffff">Hi</td>',
    );
    expect(out).toContain("padding:16px");
    expect(out).toContain("background-color:#2563eb");
    expect(out).toContain("color:#ffffff");
  });

  it("keeps table layout with width and cellpadding", () => {
    const html =
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td>cell</td></tr></table>';
    const out = sanitizeEmailHtml(html);
    expect(out).toContain("<table");
    expect(out).toContain('width="600"');
    expect(out).toContain('cellpadding="0"');
    expect(out).toContain("<td");
    expect(out).toContain("cell");
  });

  it("keeps https <img> and mailto links", () => {
    const out = sanitizeEmailHtml(
      '<a href="mailto:hola@tendr.test">Escribir</a>' +
        '<img src="https://cdn.tendr.test/logo.png" alt="logo" />',
    );
    expect(out).toContain("mailto:hola@tendr.test");
    expect(out).toContain("https://cdn.tendr.test/logo.png");
  });

  it("preserves the document head, meta and style needed for dark mode", () => {
    const html =
      '<html><head><meta name="color-scheme" content="light dark" />' +
      "<style>@media (prefers-color-scheme: dark){body{background:#1a1a1a}}</style>" +
      "</head><body><p>Hola</p></body></html>";
    const out = sanitizeEmailHtml(html);
    expect(out).toContain("color-scheme");
    expect(out).toContain("prefers-color-scheme: dark");
    expect(out).toContain("Hola");
  });

  it("keeps a hidden preheader span", () => {
    const out = sanitizeEmailHtml(
      '<span style="display:none;max-height:0;overflow:hidden;mso-hide:all">Vista previa</span>',
    );
    expect(out).toContain("display:none");
    expect(out).toContain("Vista previa");
  });

  it("strips protocol-relative URLs in img src and anchor href", () => {
    const out = sanitizeEmailHtml(
      '<a href="//evil.test/phish">x</a>' +
        '<img src="//evil.test/pixel.gif" alt="p" />',
    );
    expect(out).not.toContain("//evil.test/phish");
    expect(out).not.toContain("//evil.test/pixel.gif");
  });

  it("empties a <style> block carrying @import / url() / expression()", () => {
    const out = sanitizeEmailHtml(
      "<style>@import url('https://evil.test/x.css');" +
        "body{background:url('https://evil.test/beacon.gif')}" +
        "p{width:expression(alert(1))}</style><p>Hola</p>",
    );
    expect(out).not.toContain("@import");
    expect(out).not.toContain("evil.test");
    expect(out).not.toMatch(/expression\s*\(/);
    expect(out).toContain("removed: unsafe css");
    expect(out).toContain("Hola");
  });

  it("keeps a safe <style> block untouched", () => {
    const out = sanitizeEmailHtml(
      "<style>@media (prefers-color-scheme: dark){body{background:#1a1a1a}}</style>" +
        "<p>Hola</p>",
    );
    expect(out).toContain("prefers-color-scheme: dark");
    expect(out).not.toContain("removed: unsafe css");
  });
});
