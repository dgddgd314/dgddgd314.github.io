import katex from "katex";
import type { Block, RichText } from "../lib/blocks";
import { resolveBackgroundColor, resolveTextColor } from "../lib/blocks";
import { decryptBlocks, type EncryptedBlocks } from "../lib/encrypted-blocks";
import { toEmbeddableImageUrl } from "../lib/image-url";
import { generateToc, type TocItem } from "../lib/toc";

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function renderRichText(value: RichText[] = []): DocumentFragment {
  const fragment = document.createDocumentFragment();
  value.forEach((part) => {
    const textNode = part.annotations?.code ? element("code") : element("span");
    const classes = [
      part.annotations?.bold && "rt-bold",
      part.annotations?.italic && "rt-italic",
      part.annotations?.underline && "rt-underline",
      part.annotations?.strike && "rt-strike",
      part.annotations?.code && "rt-code",
    ].filter(Boolean) as string[];
    textNode.classList.add(...classes);
    const textColor = resolveTextColor(part.textColor);
    const backgroundColor = resolveBackgroundColor(part.backgroundColor);
    if (textColor) textNode.style.color = textColor;
    if (backgroundColor) textNode.style.background = backgroundColor;
    textNode.textContent = part.text;

    if (part.href) {
      const anchor = element("a", "rt-link");
      anchor.href = part.href;
      anchor.append(textNode);
      fragment.append(anchor);
    } else {
      fragment.append(textNode);
    }
  });
  return fragment;
}

function appendTocBlock(parent: HTMLElement, tocItems: TocItem[]): void {
  const items = tocItems.filter((item) => item.level === 1);
  const section = element("section", "block-bento notion-table-of-contents");
  section.setAttribute("aria-label", "Contents");
  const header = element("div", "block-bento__header");
  const title = element("h2");
  title.textContent = "Contents";
  const count = element("span");
  count.textContent = `${items.length} sections`;
  header.append(title, count);
  section.append(header);

  if (!items.length) {
    const empty = element("p", "notion-table-of-contents__empty");
    empty.textContent = "제목 1 블록을 추가하면 목차가 표시됩니다.";
    section.append(empty);
  } else {
    const grid = element("div", "block-bento__grid");
    items.forEach((item, index) => {
      const anchor = element("a", `block-bento__card${index === 0 ? " block-bento__card--wide" : ""}`);
      anchor.href = `#${item.id}`;
      const number = element("span", "block-bento__index");
      number.textContent = String(index + 1).padStart(2, "0");
      const label = element("strong");
      label.textContent = item.text;
      anchor.append(number, label);
      grid.append(anchor);
    });
    section.append(grid);
  }
  parent.append(section);
}

function renderBlock(block: Block, tocItems: TocItem[], depth: number, numberedListStart: number): HTMLElement {
  const section = element("section", `notion-block notion-block--${block.type}${depth > 0 ? " notion-block--nested" : ""}`);
  section.id = block.id;
  section.dataset.blockId = block.id;
  if (block.type === "heading") section.dataset.headingBlock = "true";
  const textColor = resolveTextColor(block.textColor);
  const backgroundColor = resolveBackgroundColor(block.backgroundColor);
  if (textColor) section.style.setProperty("--block-local-text", textColor);
  if (backgroundColor) section.style.setProperty("--block-local-bg", backgroundColor);
  if (block.align) section.style.textAlign = block.align;
  const content = element("div", "notion-block__content");
  section.append(content);

  switch (block.type) {
    case "paragraph": {
      const paragraph = element("p");
      paragraph.append(renderRichText(block.richText));
      content.append(paragraph);
      break;
    }
    case "heading": {
      const heading = element(`h${block.level}` as "h1" | "h2" | "h3", `notion-heading notion-heading--${block.level}`);
      heading.append(renderRichText(block.richText));
      content.append(heading);
      break;
    }
    case "bulleted_list":
    case "numbered_list": {
      const list = element(block.type === "bulleted_list" ? "ul" : "ol", "notion-list");
      if (list instanceof HTMLOListElement) list.start = numberedListStart;
      const item = element("li");
      item.append(renderRichText(block.richText));
      list.append(item);
      content.append(list);
      break;
    }
    case "todo": {
      const label = element("label", "notion-todo");
      const input = element("input");
      input.type = "checkbox";
      input.checked = block.checked;
      input.disabled = true;
      const text = element("span");
      text.append(renderRichText(block.richText));
      label.append(input, text);
      content.append(label);
      break;
    }
    case "quote": {
      const quote = element("blockquote");
      quote.append(renderRichText(block.richText));
      content.append(quote);
      break;
    }
    case "callout": {
      const callout = element("aside", "notion-callout");
      const icon = element("span", "notion-callout__icon");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = block.icon ?? "i";
      const text = element("div");
      text.append(renderRichText(block.richText));
      callout.append(icon, text);
      content.append(callout);
      break;
    }
    case "table_of_contents":
      appendTocBlock(content, tocItems);
      break;
    case "context": {
      const context = element("aside", "notion-context");
      const title = element("strong");
      title.textContent = block.title;
      const text = element("div");
      text.append(renderRichText(block.richText));
      context.append(title, text);
      content.append(context);
      break;
    }
    case "equation": {
      const figure = element("figure", "notion-equation");
      figure.setAttribute("aria-label", "Equation");
      const equation = element("div", "notion-equation__content");
      equation.innerHTML = katex.renderToString(block.equation || "\\square", {
        displayMode: true,
        throwOnError: false,
        errorColor: "#a4473f",
        output: "htmlAndMathml",
        strict: "warn",
      });
      figure.append(equation);
      content.append(figure);
      break;
    }
    case "toggle": {
      const details = element("details", "notion-toggle");
      details.open = block.isOpen === true;
      const summary = element("summary");
      summary.append(renderRichText(block.richText));
      details.append(summary);
      if (block.children?.length) {
        const children = element("div", "notion-children");
        children.append(renderBlockList(block.children, tocItems, depth + 1));
        details.append(children);
      }
      content.append(details);
      break;
    }
    case "code": {
      const figure = element("figure", "notion-code");
      if (block.language) {
        const caption = element("figcaption");
        caption.textContent = block.language;
        figure.append(caption);
      }
      const pre = element("pre");
      const code = element("code");
      code.textContent = block.code;
      pre.append(code);
      figure.append(pre);
      content.append(figure);
      break;
    }
    case "divider":
      content.append(element("hr", "notion-divider"));
      break;
    case "image": {
      const figure = element("figure", "notion-image");
      const width = Number(block.displayWidth);
      if (Number.isFinite(width) && width > 0) {
        figure.style.setProperty("--image-display-width", `${Math.round(Math.max(120, Math.min(760, width)))}px`);
      }
      const image = element("img");
      image.src = toEmbeddableImageUrl(block.src);
      image.alt = block.alt;
      image.loading = "lazy";
      figure.append(image);
      if (block.caption) {
        const caption = element("figcaption");
        caption.append(renderRichText(block.caption));
        figure.append(caption);
      }
      content.append(figure);
      break;
    }
    case "bookmark": {
      const anchor = element("a", "notion-bookmark");
      anchor.href = block.url;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      const text = element("span");
      const title = element("strong");
      title.textContent = block.title;
      text.append(title);
      if (block.description) {
        const description = element("small");
        description.textContent = block.description;
        text.append(description);
      }
      const hostname = element("em");
      try {
        hostname.textContent = new URL(block.url).hostname;
      } catch {
        hostname.textContent = block.url;
      }
      anchor.append(text, hostname);
      content.append(anchor);
      break;
    }
    case "table": {
      const wrap = element("div", "notion-table-wrap");
      const table = element("table", "notion-table");
      const body = element("tbody");
      block.rows.forEach((row, rowIndex) => {
        const tableRow = element("tr");
        row.forEach((cell) => {
          const tableCell = element(block.hasHeaderRow !== false && rowIndex === 0 ? "th" : "td");
          if (cell.align) tableCell.style.textAlign = cell.align;
          tableCell.append(renderRichText(cell.richText));
          tableRow.append(tableCell);
        });
        body.append(tableRow);
      });
      table.append(body);
      wrap.append(table);
      content.append(wrap);
      break;
    }
  }

  if (block.type !== "toggle" && block.children?.length) {
    const children = element("div", "notion-children");
    children.append(renderBlockList(block.children, tocItems, depth + 1));
    content.append(children);
  }
  return section;
}

function renderBlockList(blocks: Block[], tocItems: TocItem[], depth = 0): DocumentFragment {
  const fragment = document.createDocumentFragment();
  let numberedListStart = 0;
  blocks.forEach((block) => {
    numberedListStart = block.type === "numbered_list" ? numberedListStart + 1 : 0;
    fragment.append(renderBlock(block, tocItems, depth, numberedListStart || 1));
  });
  return fragment;
}

function renderOutline(outline: HTMLElement, tocItems: TocItem[]): void {
  const navigation = outline.querySelector("nav");
  if (!navigation || !tocItems.length) {
    outline.hidden = true;
    return;
  }
  navigation.replaceChildren(...tocItems.map((item) => {
    const link = element("a", `block-toc__link block-toc__link--${item.level}`);
    link.href = `#${item.id}`;
    link.dataset.tocLink = item.id;
    link.textContent = item.text;
    return link;
  }));
  outline.hidden = false;
}

function observeHeadings(root: HTMLElement): void {
  const headings = Array.from(root.querySelectorAll<HTMLElement>("[data-heading-block='true']"));
  const links = new Map(
    Array.from(document.querySelectorAll<HTMLElement>("[data-toc-link]"))
      .map((link) => [link.dataset.tocLink ?? "", link] as const),
  );
  if (!("IntersectionObserver" in window) || !headings.length) return;
  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!visible) return;
    links.forEach((link) => link.removeAttribute("aria-current"));
    links.get((visible.target as HTMLElement).id)?.setAttribute("aria-current", "true");
  }, { rootMargin: "-20% 0px -65% 0px", threshold: 0.01 });
  headings.forEach((heading) => observer.observe(heading));
}

export function initEncryptedPost(): void {
  const root = document.querySelector<HTMLElement>("[data-encrypted-document]");
  if (!root) return;
  const form = root.querySelector<HTMLFormElement>("[data-encrypted-form]");
  const input = root.querySelector<HTMLInputElement>("[data-encrypted-key]");
  const submit = root.querySelector<HTMLButtonElement>("[data-encrypted-submit]");
  const error = root.querySelector<HTMLElement>("[data-encrypted-error]");
  const payloadNode = root.querySelector<HTMLScriptElement>("[data-encrypted-payload]");
  const documentRoot = root.querySelector<HTMLElement>("[data-encrypted-content]");
  const outline = document.querySelector<HTMLElement>("[data-encrypted-outline]");
  if (!form || !input || !submit || !error || !payloadNode || !documentRoot) return;

  let payload: EncryptedBlocks;
  try {
    payload = JSON.parse(payloadNode.textContent ?? "") as EncryptedBlocks;
  } catch {
    error.textContent = "암호화 본문 데이터를 읽을 수 없습니다.";
    error.hidden = false;
    submit.disabled = true;
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!input.value) return;
    submit.disabled = true;
    input.disabled = true;
    error.hidden = true;
    submit.textContent = "복호화 중…";
    try {
      const blocks = await decryptBlocks(payload, input.value) as Block[];
      const tocItems = generateToc(blocks);
      documentRoot.replaceChildren(renderBlockList(blocks, tocItems));
      form.remove();
      payloadNode.remove();
      root.classList.add("is-unlocked");
      if (outline) renderOutline(outline, tocItems);
      observeHeadings(documentRoot);
    } catch {
      error.textContent = "키가 올바르지 않거나 본문 데이터가 손상되었습니다.";
      error.hidden = false;
      input.value = "";
      input.disabled = false;
      submit.disabled = false;
      submit.textContent = "본문 열기";
      input.focus();
    }
  });
}
