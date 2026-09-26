import type { RichText, TextAnnotation } from "./blocks";
import { mergeRichText } from "./editor-document";

export function parseEditable(
  editable: HTMLElement,
  resolveColor: (value: string, mode: "text" | "background") => string = (value) => value,
): RichText[] {
  const parts: RichText[] = [];
  const append = (text: string, style: Omit<RichText, "text">) => {
    if (text) parts.push({ text: text.replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n"), ...style });
  };
  const lineBreak = (style: Omit<RichText, "text">) => {
    if (parts.length && !parts.at(-1)!.text.endsWith("\n")) append("\n", style);
  };

  function walk(node: Node, inherited: Omit<RichText, "text"> = {}): void {
    if (node.nodeType === Node.TEXT_NODE) {
      append(node.nodeValue ?? "", inherited);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName;
    if (["SCRIPT", "STYLE", "TEMPLATE"].includes(tag)) return;
    if (tag === "BR") {
      append("\n", inherited);
      return;
    }

    const annotations: TextAnnotation = { ...(inherited.annotations ?? {}) };
    if (["B", "STRONG"].includes(tag) || node.classList.contains("is-bold")) annotations.bold = true;
    if (["I", "EM"].includes(tag) || node.classList.contains("is-italic")) annotations.italic = true;
    if (tag === "U" || node.classList.contains("is-underline")) annotations.underline = true;
    if (["S", "STRIKE", "DEL"].includes(tag) || node.classList.contains("is-strike")) annotations.strike = true;
    if (tag === "CODE" || node.classList.contains("is-code")) annotations.code = true;
    const next: Omit<RichText, "text"> = {
      ...inherited,
      annotations: Object.keys(annotations).length ? annotations : undefined,
    };
    const color = node.dataset.textColor || node.style.color || node.getAttribute("color");
    const background = node.dataset.backgroundColor || node.style.backgroundColor;
    const href = node.dataset.href || (tag === "A" ? node.getAttribute("href") : "");
    if (color) next.textColor = resolveColor(color, "text");
    if (background) next.backgroundColor = resolveColor(background, "background");
    if (href && !/^(?:javascript|data|vbscript):/i.test(href.replace(/[\s\u0000-\u001f]/g, ""))) next.href = href;

    const isLine = ["DIV", "P", "LI", "PRE", "BLOCKQUOTE", "TR", "H1", "H2", "H3"].includes(tag);
    if (isLine) lineBreak(inherited);
    // A lone BR in a browser-created block is an empty-line placeholder.
    // Its boundary supplies the newline; counting the BR as well doubles it.
    const placeholder = isLine && node.childNodes.length === 1 && node.firstChild instanceof HTMLElement && node.firstChild.tagName === "BR";
    if (!placeholder) Array.from(node.childNodes).forEach((child) => walk(child, next));
    if (isLine && node.nextSibling) {
      if (placeholder) append("\n", next);
      else lineBreak(next);
    }
  }

  const emptyPlaceholder = editable.childNodes.length === 1 && editable.firstChild instanceof HTMLElement && editable.firstChild.tagName === "BR";
  if (!emptyPlaceholder) Array.from(editable.childNodes).forEach((child) => walk(child));
  return mergeRichText(parts);
}
