import katex from "katex";
import type { RichText, TextAnnotation } from "../lib/blocks";
import {
  applyInlineTextColor,
  blockPlainText,
  createEditorBlock,
  createRichText,
  escapeHtml,
  getRichTextPlainText,
  isRichTextBlock,
  mergeRichText,
  normalizeRichText,
  normalizeTableRows,
  rangeHasMark,
  rangeTextColor,
  richTextToHtml,
  sliceRichText,
  toggleInlineMark,
  type EditorBlock,
  type EditorBlockType,
  type EditorDocument,
  type EditorMeta,
  type EditorPageAppearance,
  type InlineMark,
} from "../lib/editor-document";

const STORAGE_KEY = "dgddgd314.post-editor.v2";

type Command = {
  target: string;
  title: string;
  hint: string;
  aliases: string[];
};

type SelectionSnapshot = {
  blockId: string;
  field: "richText" | "table-cell";
  row?: number;
  col?: number;
  start: number;
  end: number;
};

type ColorOption = {
  value: string;
  label: string;
  text: string;
  background: string;
};

type EmojiRecord = {
  annotation: string;
  emoji: string;
  tags?: string[];
  group: number;
};

const EMOJI_GROUPS = [
  { id: 0, label: "표정", icon: "😀" },
  { id: 1, label: "사람", icon: "👋" },
  { id: 2, label: "동물", icon: "🐾" },
  { id: 3, label: "음식", icon: "🍜" },
  { id: 4, label: "여행", icon: "✈️" },
  { id: 5, label: "활동", icon: "⚽" },
  { id: 6, label: "사물", icon: "💡" },
  { id: 7, label: "기호", icon: "💬" },
  { id: 8, label: "깃발", icon: "🏳️" },
] as const;

const EMOJI_RECENT_KEY = "dgddgd314.post-editor.emoji-recents";
const COMMANDS: Command[] = [
  { target: "paragraph", title: "텍스트", hint: "기본 문단", aliases: ["text", "p", "텍스트", "문단"] },
  { target: "heading:1", title: "제목 1", hint: "큰 대목차", aliases: ["h1", "제목1"] },
  { target: "heading:2", title: "제목 2", hint: "중간 제목", aliases: ["h2", "제목2"] },
  { target: "heading:3", title: "제목 3", hint: "작은 제목", aliases: ["h3", "제목3"] },
  { target: "bulleted_list", title: "글머리 기호", hint: "점 목록", aliases: ["bullet", "ul", "글머리", "목록"] },
  { target: "numbered_list", title: "번호 목록", hint: "순서가 있는 목록", aliases: ["number", "ol", "번호"] },
  { target: "todo", title: "할 일", hint: "체크박스", aliases: ["todo", "check", "할일", "체크"] },
  { target: "quote", title: "인용", hint: "인용문", aliases: ["quote", "인용"] },
  { target: "callout", title: "콜아웃", hint: "강조 메모", aliases: ["callout", "note", "콜아웃", "메모"] },
  { target: "code", title: "코드", hint: "코드 블록", aliases: ["code", "코드"] },
  { target: "divider", title: "구분선", hint: "수평선", aliases: ["divider", "hr", "구분선"] },
  { target: "image", title: "이미지", hint: "이미지 URL", aliases: ["image", "img", "이미지"] },
  { target: "bookmark", title: "북마크", hint: "링크 미리보기", aliases: ["bookmark", "link", "북마크", "링크"] },
  { target: "equation", title: "수식", hint: "LaTeX 수식 블록", aliases: ["math", "equation", "latex", "수식"] },
  { target: "table", title: "표", hint: "3 x 3 편집 표", aliases: ["table", "표", "테이블"] },
  { target: "context", title: "맥락", hint: "배경과 전제 정리", aliases: ["context", "맥락", "컨텍스트"] },
  { target: "emoji-menu", title: "이모지", hint: "이모지 검색 및 삽입", aliases: ["emoji", "icon", "이모지", "아이콘"] },
  { target: "background-menu", title: "색", hint: "현재 블록의 배경색", aliases: ["color", "background", "색", "배경", "배경색"] },
];

const COLOR_OPTIONS: ColorOption[] = [
  { value: "default", label: "기본", text: "#45474b", background: "#ffffff" },
  { value: "gray", label: "회색", text: "#5f6368", background: "#f1f3f4" },
  { value: "brown", label: "갈색", text: "#7a5c4f", background: "#f4eeee" },
  { value: "red", label: "빨간색", text: "#a4473f", background: "#faeceb" },
  { value: "orange", label: "주황색", text: "#a85f16", background: "#fbecdd" },
  { value: "yellow", label: "노란색", text: "#80620b", background: "#fff4cc" },
  { value: "green", label: "초록색", text: "#2f6f4e", background: "#edf3ec" },
  { value: "blue", label: "파란색", text: "#27679b", background: "#eaf4ff" },
  { value: "purple", label: "보라색", text: "#72549a", background: "#f3eefd" },
  { value: "pink", label: "분홍색", text: "#9a4d70", background: "#fbeaf2" },
  { value: "teal", label: "청록색", text: "#1f6f68", background: "#e7f6f4" },
];

const COVER_PRESETS = [
  { value: "#eaf4ff", label: "blue" },
  { value: "#e7f6f4", label: "teal" },
  { value: "#edf3ec", label: "green" },
  { value: "#fff4cc", label: "yellow" },
  { value: "#faeceb", label: "red" },
  { value: "#f3eefd", label: "purple" },
  { value: "#f1f3f4", label: "gray" },
];

const RICH_TYPES: EditorBlockType[] = [
  "paragraph",
  "heading",
  "bulleted_list",
  "numbered_list",
  "todo",
  "quote",
  "callout",
  "context",
];

function asElement(node: Node | null): HTMLElement | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
}

function clampHeadingLevel(value: unknown): 1 | 2 | 3 {
  const level = Number(value);
  return level === 2 || level === 3 ? level : 1;
}

function normalizeText(value = ""): string {
  return value.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n");
}

function canonicalCssColor(value: string): string {
  if (!value) return "";
  const probe = document.createElement("span");
  probe.style.color = value;
  return probe.style.color.replace(/\s/g, "").toLowerCase();
}

function paletteColorName(value: string, mode: "text" | "background"): string {
  const canonical = canonicalCssColor(value);
  const option = COLOR_OPTIONS.find((item) =>
    canonicalCssColor(mode === "text" ? item.text : item.background) === canonical
  );
  return option?.value ?? value;
}

export function initPostEditor(): void {
  const root = document.querySelector<HTMLElement>("[data-editor]");
  if (!root) return;

  const blocksRoot = root.querySelector<HTMLElement>("[data-blocks]");
  const slashMenu = root.querySelector<HTMLElement>("[data-slash-menu]");
  const inlineToolbar = root.querySelector<HTMLElement>("[data-inline-toolbar]");
  const colorMenu = root.querySelector<HTMLElement>("[data-color-menu]");
  const emojiMenu = root.querySelector<HTMLElement>("[data-emoji-menu]");
  const coverMenu = root.querySelector<HTMLElement>("[data-cover-menu]");
  const editorPage = root.querySelector<HTMLElement>("[data-editor-page]");
  const pageCover = root.querySelector<HTMLElement>("[data-page-cover]");
  const coverMedia = root.querySelector<HTMLElement>("[data-cover-media]");
  const pageIconWrap = root.querySelector<HTMLElement>("[data-page-icon-wrap]");
  const pageIcon = root.querySelector<HTMLButtonElement>("[data-page-icon]");
  if (!blocksRoot || !slashMenu || !inlineToolbar || !colorMenu || !emojiMenu || !coverMenu || !editorPage || !pageCover || !coverMedia || !pageIconWrap || !pageIcon) return;

  const metaInputs = Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-meta]"));
  const saveState = root.querySelector<HTMLElement>("[data-save-state]");
  const blockCount = root.querySelector<HTMLElement>("[data-block-count]");
  const slugPreview = root.querySelector<HTMLElement>("[data-derived-slug]");
  const datePreview = root.querySelector<HTMLElement>("[data-derived-date]");
  const jsonPreview = root.querySelector<HTMLElement>("[data-json-preview]");
  const jsonSize = root.querySelector<HTMLElement>("[data-json-size]");
  const toast = root.querySelector<HTMLElement>("[data-toast]");

  const today = new Date().toISOString().slice(0, 10);
  let blocks: EditorBlock[] = [];
  let pageAppearance: EditorPageAppearance = {};
  let emojiData: EmojiRecord[] | null = null;
  let emojiGroup = 0;
  let emojiTarget: { mode: "page" | "block" | ""; blockId: string } = { mode: "", blockId: "" };
  let selectedId = "";
  let saveTimer = 0;
  let slashState: { blockId: string; index: number; items: Command[] } = {
    blockId: "",
    index: 0,
    items: [],
  };
  let savedSelection: SelectionSnapshot | null = null;
  let colorTarget: { mode: "block" | "text" | ""; blockId: string } = {
    mode: "",
    blockId: "",
  };

  function sampleDocument(): EditorDocument {
    return {
      version: 2,
      meta: {
        title: "제목 없는 engineering note",
        slug: "untitled-engineering-note",
        description: "로컬 블록 에디터에서 작성한 기술 노트입니다.",
        pubDate: today,
        category: "engineering",
        tags: "astro, notion, editor",
        badge: "draft",
      },
      page: {
        icon: "🧠",
        cover: { type: "color", value: "#eaf4ff", position: 50 },
      },
      blocks: [
        createEditorBlock("heading", "문제 정의", { level: 1 }),
        createEditorBlock("paragraph", "먼저 맥락을 적고, 한 블록에는 한 가지 생각만 넣습니다."),
        createEditorBlock("callout", "이 에디터는 리치 텍스트와 블록 속성을 JSON v2로 저장합니다.", {
          backgroundColor: "teal",
        }),
        createEditorBlock("heading", "구현 메모", { level: 2 }),
        createEditorBlock("bulleted_list", "/를 입력하면 블록 명령 메뉴를 검색할 수 있습니다."),
        createEditorBlock("todo", "JSON으로 저장해 게시 파이프라인에 전달하기"),
        createEditorBlock("equation", "E = mc^2"),
        createEditorBlock("table", "", {
          rows: normalizeTableRows([
            ["항목", "상태", "메모"],
            ["수식", "완료", "LaTeX"],
            ["표", "완료", "리치 텍스트 셀"],
          ]),
        }),
        createEditorBlock("code", "npm run build", { language: "bash" }),
      ],
    };
  }

  function getMeta(): EditorMeta {
    return Object.fromEntries(
      metaInputs.map((input) => [input.dataset.meta ?? "", input.value.trim()]),
    ) as EditorMeta;
  }

  function setMeta(meta: Partial<EditorMeta>): void {
    metaInputs.forEach((input) => {
      input.value = meta[input.dataset.meta as keyof EditorMeta] ?? "";
    });
  }

  function slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "")
      .replace(/^-+|-+$/g, "") || "untitled";
  }

  function renderPageAppearance(): void {
    const cover = pageAppearance.cover;
    const hasCover = Boolean(cover?.value);
    pageCover.hidden = !hasCover;
    editorPage.classList.toggle("editor-page--has-cover", hasCover);
    coverMedia.style.background = "";
    coverMedia.style.backgroundImage = "";
    coverMedia.style.backgroundPosition = "";
    if (cover?.type === "color") coverMedia.style.background = cover.value;
    if (cover?.type === "image") {
      coverMedia.style.backgroundImage = `url(${JSON.stringify(cover.value)})`;
      coverMedia.style.backgroundPosition = `center ${cover.position ?? 50}%`;
    }

    const hasIcon = Boolean(pageAppearance.icon);
    pageIconWrap.hidden = !hasIcon;
    pageIcon.textContent = pageAppearance.icon ?? "";
    root.querySelectorAll<HTMLElement>("[data-page-action='add-icon']").forEach((button) => {
      button.hidden = hasIcon;
    });
    root.querySelectorAll<HTMLElement>("[data-page-action='add-cover']").forEach((button) => {
      button.hidden = hasCover;
    });
  }

  function blockBackgroundClass(block: EditorBlock): string {
    return block.backgroundColor ? ` editor-block--background-${block.backgroundColor}` : "";
  }

  function selectedClass(block: EditorBlock): string {
    return selectedId === block.id ? " editor-block--selected" : "";
  }

  function richRootMarkup(block: EditorBlock, placeholder: string): string {
    return `<div
      class="editor-text"
      contenteditable="true"
      spellcheck="true"
      data-rich-root
      data-field="richText"
      data-placeholder="${escapeHtml(placeholder)}"
    >${richTextToHtml(block.richText)}</div>`;
  }

  function renderControls(): string {
    return `<div class="editor-block__controls" aria-label="블록 작업">
      <button type="button" data-block-action="add-after" title="아래에 블록 추가" aria-label="아래에 블록 추가">+</button>
      <button type="button" data-block-action="remove" title="블록 삭제" aria-label="블록 삭제">×</button>
    </div>`;
  }

  function renderTable(block: EditorBlock): string {
    const rows = normalizeTableRows(block.rows);
    return `<div class="editor-table-wrap">
      <table class="editor-table">
        <tbody>
          ${rows.map((row, rowIndex) => `<tr>${row.map((cell, colIndex) => `
            <td>
              <div
                contenteditable="true"
                spellcheck="true"
                data-rich-root
                data-field="table-cell"
                data-row="${rowIndex}"
                data-col="${colIndex}"
              >${richTextToHtml(cell.richText)}</div>
            </td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
      <div class="editor-table-actions">
        <button type="button" data-table-action="add-row">행 추가</button>
        <button type="button" data-table-action="add-col">열 추가</button>
        <button type="button" data-table-action="remove-row">행 삭제</button>
        <button type="button" data-table-action="remove-col">열 삭제</button>
      </div>
    </div>`;
  }

  function renderEquationHtml(expression: string): string {
    return katex.renderToString(expression || "\\square", {
      displayMode: true,
      throwOnError: false,
      errorColor: "#a4473f",
      output: "htmlAndMathml",
      strict: "warn",
    });
  }

  function renderBlock(block: EditorBlock): string {
    const shellClass = `${blockBackgroundClass(block)}${selectedClass(block)}`;
    if (block.type === "divider") {
      return `<section class="editor-block editor-block--divider${shellClass}" data-id="${block.id}">
        ${renderControls()}<hr />
      </section>`;
    }

    if (block.type === "image") {
      return `<section class="editor-block editor-block--image${shellClass}" data-id="${block.id}">
        ${renderControls()}
        <label><span>이미지 URL</span><input data-field="src" value="${escapeHtml(block.src ?? "")}" placeholder="/image.webp" /></label>
        <label><span>대체 텍스트</span><input data-field="alt" value="${escapeHtml(block.alt ?? "")}" placeholder="이미지 설명" /></label>
        <label><span>캡션</span><input data-field="caption" value="${escapeHtml(getRichTextPlainText(block.caption))}" placeholder="선택 사항" /></label>
      </section>`;
    }

    if (block.type === "bookmark") {
      return `<section class="editor-block editor-block--bookmark${shellClass}" data-id="${block.id}">
        ${renderControls()}
        <label><span>URL</span><input data-field="url" value="${escapeHtml(block.url ?? "")}" /></label>
        <label><span>제목</span><input data-field="title" value="${escapeHtml(block.title ?? "Bookmark")}" /></label>
        <label><span>설명</span><input data-field="description" value="${escapeHtml(block.description ?? "")}" /></label>
      </section>`;
    }

    if (block.type === "equation") {
      const equation = block.equation ?? "";
      return `<section class="editor-block editor-block--equation${shellClass}" data-id="${block.id}">
        ${renderControls()}
        <textarea class="editor-equation-input" data-field="equation" rows="3" spellcheck="false" placeholder="E = mc^2">${escapeHtml(equation)}</textarea>
        <div class="editor-equation-preview" data-equation-preview aria-label="수식 미리보기">${renderEquationHtml(equation)}</div>
      </section>`;
    }

    if (block.type === "table") {
      return `<section class="editor-block editor-block--table${shellClass}" data-id="${block.id}">
        ${renderControls()}${renderTable(block)}
      </section>`;
    }

    if (block.type === "context") {
      return `<section class="editor-block editor-block--context${shellClass}" data-id="${block.id}">
        ${renderControls()}
        <input class="editor-context-title" data-field="title" value="${escapeHtml(block.title ?? "맥락")}" aria-label="맥락 제목" />
        ${richRootMarkup(block, "배경, 전제, 참고 맥락을 적습니다.")}
      </section>`;
    }

    if (block.type === "code") {
      return `<section class="editor-block editor-block--code${shellClass}" data-id="${block.id}">
        ${renderControls()}
        <input class="editor-code-lang" data-field="language" value="${escapeHtml(block.language ?? "text")}" aria-label="코드 언어" />
        <textarea data-field="code" rows="5" spellcheck="false">${escapeHtml(block.code ?? "")}</textarea>
      </section>`;
    }

    const tag = block.type === "heading" ? `h${block.level ?? 1}` : "div";
    const checkbox = block.type === "todo"
      ? `<input type="checkbox" data-field="checked" ${block.checked ? "checked" : ""} aria-label="완료" />`
      : "";
    return `<section class="editor-block editor-block--${block.type}${shellClass}" data-id="${block.id}">
      ${renderControls()}
      <div class="editor-line">
        ${checkbox}
        <${tag}
          class="editor-text"
          contenteditable="true"
          spellcheck="true"
          data-rich-root
          data-field="richText"
          data-placeholder="/ 입력으로 블록 추가"
        >${richTextToHtml(block.richText)}</${tag}>
      </div>
    </section>`;
  }

  function render(): void {
    renderPageAppearance();
    blocksRoot.innerHTML = blocks.map(renderBlock).join("");
    bindBlocks();
    syncOutput();
  }

  function parseEditable(editable: HTMLElement): RichText[] {
    const parts: RichText[] = [];

    function append(text: string, template: Omit<RichText, "text">): void {
      if (!text) return;
      parts.push({ text: normalizeText(text), ...template });
    }

    function walk(node: Node, inherited: Omit<RichText, "text"> = {}): void {
      if (node.nodeType === Node.TEXT_NODE) {
        append(node.nodeValue ?? "", inherited);
        return;
      }
      if (!(node instanceof HTMLElement)) return;
      if (node.tagName === "BR") {
        append("\n", inherited);
        return;
      }

      const annotations: TextAnnotation = { ...(inherited.annotations ?? {}) };
      const tag = node.tagName;
      if (tag === "B" || tag === "STRONG" || node.classList.contains("is-bold")) annotations.bold = true;
      if (tag === "I" || tag === "EM" || node.classList.contains("is-italic")) annotations.italic = true;
      if (tag === "U" || node.classList.contains("is-underline")) annotations.underline = true;
      if (tag === "S" || tag === "STRIKE" || node.classList.contains("is-strike")) annotations.strike = true;
      if (tag === "CODE" || node.classList.contains("is-code")) annotations.code = true;
      const next: Omit<RichText, "text"> = {
        ...inherited,
        annotations: Object.keys(annotations).length ? annotations : undefined,
      };
      const sourceTextColor = node.dataset.textColor || node.style.color || node.getAttribute("color") || "";
      const sourceBackground = node.dataset.backgroundColor || node.style.backgroundColor || "";
      const sourceHref = node.dataset.href || (node instanceof HTMLAnchorElement ? node.href : "");
      if (sourceTextColor) next.textColor = paletteColorName(sourceTextColor, "text");
      if (sourceBackground) next.backgroundColor = paletteColorName(sourceBackground, "background");
      if (sourceHref) next.href = sourceHref;

      const before = parts.length;
      Array.from(node.childNodes).forEach((child) => walk(child, next));
      if (
        (tag === "DIV" || tag === "P") &&
        node.nextSibling &&
        parts.length > before &&
        !parts.at(-1)?.text.endsWith("\n")
      ) {
        append("\n", next);
      }
    }

    Array.from(editable.childNodes).forEach((child) => walk(child));
    return mergeRichText(parts);
  }


  function normalizeStoredBlock(rawValue: unknown): EditorBlock | null {
    if (!rawValue || typeof rawValue !== "object") return null;
    const raw = rawValue as Record<string, unknown>;
    const rawType = String(raw.type ?? "paragraph") as EditorBlockType;
    const type = RICH_TYPES.includes(rawType) || [
      "code",
      "divider",
      "image",
      "bookmark",
      "equation",
      "table",
    ].includes(rawType)
      ? rawType
      : "paragraph";
    const richText = Array.isArray(raw.richText)
      ? normalizeRichText(raw.richText)
      : [];
    const backgroundColor = typeof raw.backgroundColor === "string"
      ? raw.backgroundColor
      : undefined;
    const options: Partial<EditorBlock> = {
      backgroundColor,
      textColor: typeof raw.textColor === "string" ? raw.textColor : undefined,
    };

    if (isRichTextBlock(type)) options.richText = richText;
    if (type === "heading") options.level = clampHeadingLevel(raw.level);
    if (type === "todo") options.checked = Boolean(raw.checked);
    if (type === "callout") options.icon = String(raw.icon ?? "i");
    if (type === "code") {
      options.code = String(raw.code ?? "");
      options.language = String(raw.language ?? "text");
    }
    if (type === "equation") options.equation = String(raw.equation ?? "E = mc^2");
    if (type === "image") {
      options.src = String(raw.src ?? "");
      options.alt = String(raw.alt ?? "");
      options.caption = normalizeRichText(raw.caption, typeof raw.caption === "string" ? raw.caption : "");
    }
    if (type === "bookmark") {
      options.url = String(raw.url ?? "https://example.com");
      options.title = String(raw.title ?? "Bookmark");
      options.description = String(raw.description ?? "");
    }
    if (type === "table") {
      options.rows = normalizeTableRows(raw.rows);
      options.hasHeaderRow = raw.hasHeaderRow !== false;
    }
    if (type === "context") options.title = String(raw.title ?? "맥락");

    const block = createEditorBlock(type, "", options);
    block.id = typeof raw.id === "string" && raw.id ? raw.id : block.id;
    if (isRichTextBlock(type)) block.richText = richText;
    if (backgroundColor) block.backgroundColor = backgroundColor;
    return block;
  }

  function normalizePageAppearance(value: unknown): EditorPageAppearance {
    if (!value || typeof value !== "object") return {};
    const raw = value as Record<string, unknown>;
    const appearance: EditorPageAppearance = {};
    if (typeof raw.icon === "string" && raw.icon) appearance.icon = raw.icon;
    if (raw.cover && typeof raw.cover === "object") {
      const cover = raw.cover as Record<string, unknown>;
      const type = cover.type === "image" ? "image" : "color";
      const coverValue = typeof cover.value === "string" ? cover.value : "";
      if (coverValue) {
        appearance.cover = {
          type,
          value: coverValue,
          position: Math.max(0, Math.min(100, Number(cover.position ?? 50))),
        };
      }
    }
    return appearance;
  }

  function normalizeStoredDocument(rawValue: unknown): EditorDocument {
    const fallback = sampleDocument();
    if (!rawValue || typeof rawValue !== "object") return fallback;
    const raw = rawValue as Record<string, unknown>;
    const rawMeta = raw.meta && typeof raw.meta === "object"
      ? raw.meta as Record<string, unknown>
      : {};
    const storedBlocks = Array.isArray(raw.blocks)
      ? raw.blocks.map(normalizeStoredBlock).filter((block): block is EditorBlock => Boolean(block))
      : [];
    return {
      version: 2,
      meta: {
        title: String(rawMeta.title ?? fallback.meta.title),
        slug: String(rawMeta.slug ?? ""),
        description: String(rawMeta.description ?? ""),
        pubDate: String(rawMeta.pubDate ?? today),
        category: String(rawMeta.category ?? ""),
        tags: String(rawMeta.tags ?? ""),
        badge: String(rawMeta.badge ?? ""),
      },
      page: normalizePageAppearance(raw.page),
      blocks: storedBlocks.length ? storedBlocks : fallback.blocks,
    };
  }

  function loadDocument(): EditorDocument {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return sampleDocument();
    try {
      return normalizeStoredDocument(JSON.parse(stored));
    } catch {
      return sampleDocument();
    }
  }

  function getBlock(id: string): EditorBlock | undefined {
    return blocks.find((block) => block.id === id);
  }

  function getSnapshotRichText(snapshot: SelectionSnapshot): RichText[] {
    const block = getBlock(snapshot.blockId);
    if (!block) return [];
    if (snapshot.field === "table-cell") {
      const rows = normalizeTableRows(block.rows);
      return rows[snapshot.row ?? -1]?.[snapshot.col ?? -1]?.richText ?? [];
    }
    return block.richText ?? [];
  }

  function setSnapshotRichText(snapshot: SelectionSnapshot, value: RichText[]): void {
    const block = getBlock(snapshot.blockId);
    if (!block) return;
    if (snapshot.field === "table-cell") {
      const rows = normalizeTableRows(block.rows);
      const cell = rows[snapshot.row ?? -1]?.[snapshot.col ?? -1];
      if (cell) cell.richText = mergeRichText(value);
      block.rows = rows;
      return;
    }
    block.richText = mergeRichText(value);
  }

  function rootSelector(snapshot: SelectionSnapshot): string {
    if (snapshot.field === "table-cell") {
      return `[data-id="${snapshot.blockId}"] [data-rich-root][data-row="${snapshot.row}"][data-col="${snapshot.col}"]`;
    }
    return `[data-id="${snapshot.blockId}"] [data-rich-root][data-field="richText"]`;
  }

  function findSnapshotRoot(snapshot: SelectionSnapshot): HTMLElement | null {
    return blocksRoot.querySelector<HTMLElement>(rootSelector(snapshot));
  }

  function pointOffset(container: HTMLElement, node: Node, offset: number): number {
    const range = document.createRange();
    range.setStart(container, 0);
    try {
      range.setEnd(node, offset);
      return range.toString().length;
    } catch {
      return 0;
    }
  }

  function captureSelection(allowCollapsed = false): SelectionSnapshot | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || (!allowCollapsed && selection.isCollapsed)) return null;
    const anchorRoot = asElement(selection.anchorNode)?.closest<HTMLElement>("[data-rich-root]");
    const focusRoot = asElement(selection.focusNode)?.closest<HTMLElement>("[data-rich-root]");
    if (!anchorRoot || anchorRoot !== focusRoot || !root.contains(anchorRoot)) return null;
    const blockElement = anchorRoot.closest<HTMLElement>("[data-id]");
    if (!blockElement?.dataset.id || !selection.anchorNode || !selection.focusNode) return null;
    const anchorOffset = pointOffset(anchorRoot, selection.anchorNode, selection.anchorOffset);
    const focusOffset = pointOffset(anchorRoot, selection.focusNode, selection.focusOffset);
    const field = anchorRoot.dataset.field === "table-cell" ? "table-cell" : "richText";
    return {
      blockId: blockElement.dataset.id,
      field,
      row: field === "table-cell" ? Number(anchorRoot.dataset.row) : undefined,
      col: field === "table-cell" ? Number(anchorRoot.dataset.col) : undefined,
      start: Math.min(anchorOffset, focusOffset),
      end: Math.max(anchorOffset, focusOffset),
    };
  }

  function textPoint(container: HTMLElement, offset: number): { node: Node; offset: number } {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, offset);
    let current = walker.nextNode();
    let last: Node | null = null;
    while (current) {
      last = current;
      const length = current.nodeValue?.length ?? 0;
      if (remaining <= length) return { node: current, offset: remaining };
      remaining -= length;
      current = walker.nextNode();
    }
    if (last) return { node: last, offset: last.nodeValue?.length ?? 0 };
    return { node: container, offset: 0 };
  }

  function restoreSelection(snapshot: SelectionSnapshot): boolean {
    const editable = findSnapshotRoot(snapshot);
    if (!editable) return false;
    const start = textPoint(editable, snapshot.start);
    const end = textPoint(editable, snapshot.end);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editable.focus();
    return true;
  }

  function updateToolbarState(snapshot: SelectionSnapshot): void {
    const value = getSnapshotRichText(snapshot);
    inlineToolbar.querySelectorAll<HTMLButtonElement>("[data-inline-mark]").forEach((button) => {
      const mark = button.dataset.inlineMark as InlineMark;
      const active = rangeHasMark(value, snapshot.start, snapshot.end, mark);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const color = rangeTextColor(value, snapshot.start, snapshot.end);
    inlineToolbar.style.setProperty("--active-text-color", colorOption(color).text);
  }

  function positionFloating(element: HTMLElement, rect: DOMRect, placement: "above" | "below"): void {
    element.hidden = false;
    const gap = 8;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const preferredTop = placement === "above" ? rect.top - height - gap : rect.bottom + gap;
    const alternateTop = placement === "above" ? rect.bottom + gap : rect.top - height - gap;
    const top = preferredTop >= 10 && preferredTop + height <= window.innerHeight - 10
      ? preferredTop
      : alternateTop;
    const centeredLeft = rect.left + rect.width / 2 - width / 2;
    element.style.left = `${Math.max(10, Math.min(centeredLeft, window.innerWidth - width - 10))}px`;
    element.style.top = `${Math.max(10, Math.min(top, window.innerHeight - height - 10))}px`;
  }

  function showInlineToolbar(rectOverride?: DOMRect): boolean {
    const snapshot = captureSelection();
    const selection = window.getSelection();
    if (!snapshot || !selection || selection.rangeCount === 0) {
      hideInlineToolbar();
      return false;
    }
    savedSelection = snapshot;
    updateToolbarState(snapshot);
    positionFloating(inlineToolbar, rectOverride ?? selection.getRangeAt(0).getBoundingClientRect(), "above");
    return true;
  }

  function hideInlineToolbar(): void {
    inlineToolbar.hidden = true;
  }

  function hideColorMenu(): void {
    colorMenu.hidden = true;
    colorTarget = { mode: "", blockId: "" };
  }

  function hideEmojiMenu(): void {
    emojiMenu.hidden = true;
    emojiTarget = { mode: "", blockId: "" };
  }

  function hideCoverMenu(): void {
    coverMenu.hidden = true;
  }

  function getRecentEmojis(): string[] {
    try {
      const stored = JSON.parse(localStorage.getItem(EMOJI_RECENT_KEY) ?? "[]");
      return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string").slice(0, 24) : [];
    } catch {
      return [];
    }
  }

  function rememberEmoji(unicode: string): void {
    const next = [unicode, ...getRecentEmojis().filter((item) => item !== unicode)].slice(0, 24);
    localStorage.setItem(EMOJI_RECENT_KEY, JSON.stringify(next));
  }

  function emojiMatches(record: EmojiRecord, query: string): boolean {
    if (!query) return true;
    const haystack = [record.annotation, ...(record.tags ?? [])].join(" ").toLowerCase();
    return haystack.includes(query.toLowerCase());
  }

  function visibleEmojis(query: string): EmojiRecord[] {
    if (!emojiData) return [];
    if (query) return emojiData.filter((record) => emojiMatches(record, query)).slice(0, 240);
    if (emojiGroup === -1) {
      const recent = getRecentEmojis();
      return recent.map((emoji) => emojiData.find((record) => record.emoji === emoji)).filter((record): record is EmojiRecord => Boolean(record));
    }
    return emojiData.filter((record) => record.group === emojiGroup).slice(0, 240);
  }

  function renderEmojiPicker(query = ""): void {
    const records = visibleEmojis(query);
    const emptyLabel = query ? "검색 결과가 없습니다." : "최근 사용한 이모지가 없습니다.";
    emojiMenu.innerHTML = `<section class="emoji-picker" aria-label="이모지 선택기">
      <div class="emoji-picker__search-row">
        <input type="search" data-emoji-search value="${escapeHtml(query)}" placeholder="이모지 검색" aria-label="이모지 검색" autocomplete="off" />
      </div>
      <div class="emoji-picker__tabs" role="tablist" aria-label="이모지 분류">
        <button type="button" class="emoji-picker__tab${emojiGroup === -1 && !query ? " is-active" : ""}" data-emoji-group="-1" title="최근 사용">◷</button>
        ${EMOJI_GROUPS.map((group) => `<button type="button" class="emoji-picker__tab${emojiGroup === group.id && !query ? " is-active" : ""}" data-emoji-group="${group.id}" title="${group.label}">${group.icon}</button>`).join("")}
      </div>
      <div class="emoji-picker__grid" role="grid">
        ${records.length ? records.map((record) => `<button type="button" class="emoji-picker__emoji" data-emoji-value="${encodeURIComponent(record.emoji)}" title="${escapeHtml(record.annotation)}" aria-label="${escapeHtml(record.annotation)}">${record.emoji}</button>`).join("") : `<p class="emoji-picker__empty">${emptyLabel}</p>`}
      </div>
    </section>`;

    emojiMenu.querySelector<HTMLInputElement>("[data-emoji-search]")?.addEventListener("input", (event) => {
      const input = event.currentTarget;
      renderEmojiPicker(input.value);
      window.requestAnimationFrame(() => {
        const nextInput = emojiMenu.querySelector<HTMLInputElement>("[data-emoji-search]");
        nextInput?.focus();
        nextInput?.setSelectionRange(input.value.length, input.value.length);
      });
    });
    emojiMenu.querySelectorAll<HTMLButtonElement>("[data-emoji-group]").forEach((button) => {
      button.addEventListener("click", () => {
        emojiGroup = Number(button.dataset.emojiGroup);
        renderEmojiPicker();
      });
    });
    emojiMenu.querySelectorAll<HTMLButtonElement>("[data-emoji-value]").forEach((button) => {
      button.addEventListener("click", () => applyEmoji(decodeURIComponent(button.dataset.emojiValue ?? "")));
    });
  }

  async function ensureEmojiPicker(): Promise<void> {
    if (!emojiData) {
      emojiMenu.innerHTML = `<div class="emoji-popover__loading">이모지 데이터를 불러오는 중입니다.</div>`;
      const response = await fetch("/data/emoji-ko.json");
      if (!response.ok) throw new Error(`Emoji data request failed: ${response.status}`);
      const source: unknown = await response.json();
      if (!Array.isArray(source)) throw new Error("Emoji data is not an array");
      emojiData = source.filter((item): item is EmojiRecord =>
        Boolean(item) && typeof item === "object" && typeof (item as EmojiRecord).emoji === "string" && typeof (item as EmojiRecord).annotation === "string"
      );
      if (!emojiData.length) throw new Error("Emoji data is empty");
    }
    renderEmojiPicker();
  }

  async function openEmojiMenu(mode: "page" | "block", blockId: string, anchor: HTMLElement): Promise<void> {
    hideColorMenu();
    hideCoverMenu();
    emojiTarget = { mode, blockId };
    emojiMenu.hidden = false;
    positionFloating(emojiMenu, anchor.getBoundingClientRect(), "below");
    try {
      await ensureEmojiPicker();
      positionFloating(emojiMenu, anchor.getBoundingClientRect(), "below");
      emojiMenu.querySelector<HTMLInputElement>("[data-emoji-search]")?.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      emojiMenu.innerHTML = `<div class="emoji-popover__error">이모지 데이터를 불러오지 못했습니다.<br />${escapeHtml(message)}</div>`;
      positionFloating(emojiMenu, anchor.getBoundingClientRect(), "below");
    }
  }

  function applyEmoji(unicode: string): void {
    if (!unicode) return;
    rememberEmoji(unicode);
    if (emojiTarget.mode === "page") {
      pageAppearance.icon = unicode;
      renderPageAppearance();
      syncOutput();
      scheduleSave();
    }
    if (emojiTarget.mode === "block") {
      const block = getBlock(emojiTarget.blockId);
      if (block && isRichTextBlock(block.type)) {
        block.richText = createRichText(unicode);
        selectedId = block.id;
        render();
        window.requestAnimationFrame(() => focusBlock(block.id, true));
        scheduleSave();
      }
    }
    hideEmojiMenu();
  }

  function coverMenuMarkup(): string {
    const cover = pageAppearance.cover;
    const position = cover?.position ?? 50;
    return `<div class="cover-menu__title">커버</div>
      <div class="cover-menu__section">
        <span class="cover-menu__label">색상</span>
        <div class="cover-menu__swatches">
          ${COVER_PRESETS.map((preset) => `<button class="cover-menu__swatch${cover?.type === "color" && cover.value === preset.value ? " is-active" : ""}" type="button" data-cover-color="${preset.value}" title="${preset.label}" style="background:${preset.value}"></button>`).join("")}
        </div>
      </div>
      <form class="cover-menu__section" data-cover-url-form>
        <label class="cover-menu__label" for="cover-url">이미지 링크</label>
        <div class="cover-menu__url-row">
          <input id="cover-url" name="coverUrl" type="url" placeholder="https://..." value="${cover?.type === "image" && !cover.value.startsWith("data:") ? escapeHtml(cover.value) : ""}" />
          <button type="submit">적용</button>
        </div>
      </form>
      <label class="cover-menu__upload">
        <span>파일 업로드</span>
        <input type="file" accept="image/*" data-cover-file hidden />
      </label>
      ${cover?.type === "image" ? `<label class="cover-menu__position">
        <span>세로 위치</span>
        <input type="range" min="0" max="100" value="${position}" data-cover-position />
      </label>` : ""}
      ${cover ? `<button type="button" class="cover-menu__remove" data-cover-remove>커버 제거</button>` : ""}`;
  }

  function openCoverMenu(anchor: HTMLElement): void {
    hideColorMenu();
    hideEmojiMenu();
    coverMenu.innerHTML = coverMenuMarkup();
    bindCoverMenu();
    positionFloating(coverMenu, anchor.getBoundingClientRect(), "below");
  }

  function bindCoverMenu(): void {
    coverMenu.querySelectorAll<HTMLButtonElement>("[data-cover-color]").forEach((button) => {
      button.addEventListener("click", () => {
        pageAppearance.cover = { type: "color", value: button.dataset.coverColor ?? "#eaf4ff", position: 50 };
        renderPageAppearance();
        syncOutput();
        scheduleSave();
        hideCoverMenu();
      });
    });
    coverMenu.querySelector<HTMLFormElement>("[data-cover-url-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const value = String(data.get("coverUrl") ?? "").trim();
      if (!value) return;
      pageAppearance.cover = { type: "image", value, position: 50 };
      renderPageAppearance();
      syncOutput();
      scheduleSave();
      hideCoverMenu();
    });
    coverMenu.querySelector<HTMLInputElement>("[data-cover-file]")?.addEventListener("change", async (event) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        showToast("이미지 파일만 사용할 수 있습니다.");
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        showToast("12MB 이하 이미지를 선택해 주세요.");
        return;
      }
      try {
        const value = await coverFileToDataUrl(file);
        pageAppearance.cover = { type: "image", value, position: 50 };
        renderPageAppearance();
        syncOutput();
        scheduleSave();
        hideCoverMenu();
      } catch {
        showToast("커버 이미지를 처리하지 못했습니다.");
      }
    });
    coverMenu.querySelector<HTMLInputElement>("[data-cover-position]")?.addEventListener("input", (event) => {
      if (!pageAppearance.cover) return;
      pageAppearance.cover.position = Number(event.currentTarget.value);
      renderPageAppearance();
      syncOutput();
      scheduleSave();
    });
    coverMenu.querySelector<HTMLButtonElement>("[data-cover-remove]")?.addEventListener("click", () => {
      delete pageAppearance.cover;
      renderPageAppearance();
      syncOutput();
      scheduleSave();
      hideCoverMenu();
    });
  }

  async function coverFileToDataUrl(file: File): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const width = 1400;
    const height = 350;
    const scale = Math.max(width / bitmap.width, height / bitmap.height);
    const drawWidth = bitmap.width * scale;
    const drawHeight = bitmap.height * scale;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(bitmap, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  function colorOption(value = "default"): ColorOption {
    return COLOR_OPTIONS.find((option) => option.value === value) ?? COLOR_OPTIONS[0];
  }

  function renderColorMenu(mode: "block" | "text", activeValue = "default"): string {
    const title = mode === "text" ? "텍스트 색" : "블록 배경색";
    return `<div class="color-menu__title">${title}</div>
      <div class="color-menu__options">
        ${COLOR_OPTIONS.map((option) => {
          const active = option.value === activeValue ? " color-menu__item--active" : "";
          const background = mode === "text" ? "#ffffff" : option.background;
          const glyph = mode === "text" ? "A" : "";
          return `<button type="button" class="color-menu__item${active}" data-color-value="${option.value}">
            <span class="color-menu__swatch" style="color:${option.text};background:${background}">${glyph}</span>
            <span>${option.label}</span>
            <span class="color-menu__check" aria-hidden="true">${active ? "✓" : ""}</span>
          </button>`;
        }).join("")}
      </div>`;
  }

  function bindColorMenu(): void {
    colorMenu.querySelectorAll<HTMLButtonElement>("[data-color-value]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        applyColor(button.dataset.colorValue ?? "default");
      });
    });
  }

  function openBlockColorMenu(blockId: string): void {
    const block = getBlock(blockId);
    const element = blocksRoot.querySelector<HTMLElement>(`[data-id="${blockId}"]`);
    if (!block || !element) return;
    colorTarget = { mode: "block", blockId };
    colorMenu.innerHTML = renderColorMenu("block", block.backgroundColor ?? "default");
    bindColorMenu();
    positionFloating(colorMenu, element.getBoundingClientRect(), "below");
  }

  function openInlineColorMenu(): void {
    if (!savedSelection) return;
    const activeColor = rangeTextColor(
      getSnapshotRichText(savedSelection),
      savedSelection.start,
      savedSelection.end,
    );
    colorTarget = { mode: "text", blockId: savedSelection.blockId };
    colorMenu.innerHTML = renderColorMenu("text", activeColor || "default");
    bindColorMenu();
    positionFloating(colorMenu, inlineToolbar.getBoundingClientRect(), "below");
  }

  function renderSnapshotRoot(snapshot: SelectionSnapshot): void {
    const editable = findSnapshotRoot(snapshot);
    if (editable) editable.innerHTML = richTextToHtml(getSnapshotRichText(snapshot));
  }

  function applyColor(value: string): void {
    if (colorTarget.mode === "block") {
      const block = getBlock(colorTarget.blockId);
      if (!block) return;
      if (value === "default") delete block.backgroundColor;
      else block.backgroundColor = value;
      hideColorMenu();
      render();
      scheduleSave();
      return;
    }
    if (colorTarget.mode === "text" && savedSelection) {
      const snapshot = { ...savedSelection };
      const next = applyInlineTextColor(
        getSnapshotRichText(snapshot),
        snapshot.start,
        snapshot.end,
        value,
      );
      setSnapshotRichText(snapshot, next);
      renderSnapshotRoot(snapshot);
      restoreSelection(snapshot);
      syncOutput();
      scheduleSave();
      hideColorMenu();
      window.setTimeout(() => showInlineToolbar(), 0);
    }
  }

  function runInlineMark(mark: InlineMark): void {
    if (!savedSelection) return;
    const snapshot = { ...savedSelection };
    const next = toggleInlineMark(
      getSnapshotRichText(snapshot),
      snapshot.start,
      snapshot.end,
      mark,
    );
    setSnapshotRichText(snapshot, next);
    renderSnapshotRoot(snapshot);
    restoreSelection(snapshot);
    syncOutput();
    scheduleSave();
    hideColorMenu();
    window.setTimeout(() => showInlineToolbar(), 0);
  }

  function updateRichTextFromEditable(blockId: string, editable: HTMLElement): void {
    const block = getBlock(blockId);
    if (!block) return;
    const value = parseEditable(editable);
    if (editable.dataset.field === "table-cell") {
      const rows = normalizeTableRows(block.rows);
      const cell = rows[Number(editable.dataset.row)]?.[Number(editable.dataset.col)];
      if (cell) cell.richText = value;
      block.rows = rows;
    } else {
      block.richText = value;
    }
    syncOutput();
    scheduleSave();
  }

  function updatePlainField(blockId: string, field: HTMLInputElement | HTMLTextAreaElement): void {
    const block = getBlock(blockId);
    const key = field.dataset.field;
    if (!block || !key) return;
    if (key === "checked" && field instanceof HTMLInputElement) {
      block.checked = field.checked;
    } else if (key === "caption") {
      block.caption = createRichText(field.value);
    } else {
      (block as Record<string, unknown>)[key] = field.value;
    }
    if (key === "equation") {
      const preview = field.closest<HTMLElement>("[data-id]")?.querySelector<HTMLElement>("[data-equation-preview]");
      if (preview) preview.innerHTML = renderEquationHtml(field.value);
    }
    syncOutput();
    scheduleSave();
  }

  function replaceBlockType(block: EditorBlock, target: string, text = blockPlainText(block)): EditorBlock {
    const [rawType, rawLevel] = target.split(":");
    const type = rawType as EditorBlockType;
    const options: Partial<EditorBlock> = {
      backgroundColor: block.backgroundColor,
      textColor: block.textColor,
    };
    if (type === "heading") options.level = clampHeadingLevel(rawLevel);
    if (isRichTextBlock(type)) options.richText = createRichText(text);
    const replacement = createEditorBlock(type, text, options);
    replacement.id = block.id;
    return replacement;
  }

  function applyCommandTarget(blockId: string, target: string): "block" | "color-menu" | "emoji-menu" {
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index < 0) return "block";
    const block = blocks[index];
    if (target === "background-menu" || target === "emoji-menu") {
      if (isRichTextBlock(block.type)) block.richText = [];
      return target === "emoji-menu" ? "emoji-menu" : "color-menu";
    }
    blocks[index] = replaceBlockType(block, target, "");
    return "block";
  }

  function getSlashItems(query: string): Command[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return COMMANDS;
    return COMMANDS.filter((command) =>
      command.title.toLowerCase().includes(normalized) ||
      command.hint.toLowerCase().includes(normalized) ||
      command.aliases.some((alias) => alias.toLowerCase().includes(normalized))
    );
  }

  function hideSlashMenu(): void {
    slashMenu.hidden = true;
  }

  function renderSlashMenu(anchor?: HTMLElement): void {
    slashMenu.innerHTML = slashState.items.length
      ? slashState.items.map((command, index) => `
          <button type="button" class="slash-menu__item${index === slashState.index ? " slash-menu__item--active" : ""}" data-command-index="${index}">
            <strong>${command.title}</strong>
            <span>${command.hint}</span>
          </button>
        `).join("")
      : `<div class="slash-menu__empty">일치하는 명령이 없습니다.</div>`;
    const activeAnchor = anchor ?? blocksRoot.querySelector<HTMLElement>(`[data-id="${slashState.blockId}"] [data-rich-root]`);
    if (activeAnchor) positionFloating(slashMenu, activeAnchor.getBoundingClientRect(), "below");
    slashMenu.querySelectorAll<HTMLButtonElement>("[data-command-index]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        chooseSlashCommand(slashState.items[Number(button.dataset.commandIndex)]);
      });
    });
  }

  function updateSlashMenu(blockId: string, editable: HTMLElement): void {
    if (editable.dataset.field !== "richText") {
      hideSlashMenu();
      return;
    }
    const block = getBlock(blockId);
    const text = block ? blockPlainText(block) : "";
    if (!text.startsWith("/")) {
      hideSlashMenu();
      return;
    }
    slashState = { blockId, index: 0, items: getSlashItems(text.slice(1)) };
    renderSlashMenu(editable);
  }

  function chooseSlashCommand(command: Command | undefined): void {
    if (!command) return;
    const blockId = slashState.blockId;
    hideSlashMenu();
    const action = applyCommandTarget(blockId, command.target);
    selectedId = blockId;
    render();
    window.requestAnimationFrame(() => {
      if (action === "color-menu") openBlockColorMenu(blockId);
      else if (action === "emoji-menu") {
        const anchor = blocksRoot.querySelector<HTMLElement>(`[data-id="${blockId}"]`);
        if (anchor) void openEmojiMenu("block", blockId, anchor);
      } else focusBlock(blockId);
    });
    scheduleSave();
  }

  function exactSlashCommand(text: string): Command | undefined {
    const query = text.replace(/^\//, "").trim().toLowerCase();
    return COMMANDS.find((command) =>
      command.aliases.some((alias) => alias.toLowerCase() === query) ||
      command.title.toLowerCase() === query
    );
  }

  function splitBlockAtSelection(blockId: string): void {
    const block = getBlock(blockId);
    const index = blocks.findIndex((item) => item.id === blockId);
    const snapshot = captureSelection(true);
    if (!block || index < 0 || !snapshot || snapshot.field !== "richText") return;
    const value = block.richText ?? [];
    const before = sliceRichText(value, 0, snapshot.start);
    const after = sliceRichText(value, snapshot.end);

    if (!getRichTextPlainText(value) && block.type !== "paragraph") {
      blocks[index] = replaceBlockType(block, "paragraph", "");
      render();
      window.requestAnimationFrame(() => focusBlock(blockId));
      scheduleSave();
      return;
    }

    block.richText = before;
    const nextType = ["bulleted_list", "numbered_list", "todo"].includes(block.type)
      ? block.type
      : "paragraph";
    const next = createEditorBlock(nextType, "", {
      richText: after,
      checked: nextType === "todo" ? false : undefined,
    });
    blocks.splice(index + 1, 0, next);
    selectedId = next.id;
    render();
    window.requestAnimationFrame(() => focusBlock(next.id, false));
    scheduleSave();
  }

  function removeOrMergeAtStart(blockId: string): boolean {
    const block = getBlock(blockId);
    const index = blocks.findIndex((item) => item.id === blockId);
    const snapshot = captureSelection(true);
    if (!block || index < 0 || !snapshot || snapshot.start !== 0 || snapshot.end !== 0) return false;
    const text = blockPlainText(block);

    if (!text && block.type !== "paragraph") {
      blocks[index] = replaceBlockType(block, "paragraph", "");
      render();
      window.requestAnimationFrame(() => focusBlock(blockId, false));
      scheduleSave();
      return true;
    }

    if (!text && blocks.length > 1) {
      blocks.splice(index, 1);
      const previous = blocks[Math.max(0, index - 1)];
      selectedId = previous.id;
      render();
      window.requestAnimationFrame(() => focusBlock(previous.id, true));
      scheduleSave();
      return true;
    }

    const previous = blocks[index - 1];
    if (index > 0 && previous && isRichTextBlock(previous.type) && isRichTextBlock(block.type)) {
      const previousLength = getRichTextPlainText(previous.richText).length;
      previous.richText = mergeRichText([...(previous.richText ?? []), ...(block.richText ?? [])]);
      blocks.splice(index, 1);
      selectedId = previous.id;
      render();
      window.requestAnimationFrame(() => {
        restoreSelection({
          blockId: previous.id,
          field: "richText",
          start: previousLength,
          end: previousLength,
        });
      });
      scheduleSave();
      return true;
    }
    return false;
  }
  function focusTableCell(blockId: string, row: number, col: number): void {
    const cell = blocksRoot.querySelector<HTMLElement>(
      `[data-id="${blockId}"] [data-rich-root][data-row="${row}"][data-col="${col}"]`,
    );
    cell?.focus();
  }

  function handleTableTab(event: KeyboardEvent, blockId: string, editable: HTMLElement): void {
    const block = getBlock(blockId);
    if (!block || block.type !== "table") return;
    event.preventDefault();
    const rows = normalizeTableRows(block.rows);
    const row = Number(editable.dataset.row);
    const col = Number(editable.dataset.col);
    const width = rows[0]?.length ?? 1;
    let flatIndex = row * width + col + (event.shiftKey ? -1 : 1);
    if (flatIndex >= rows.length * width) {
      rows.push(Array.from({ length: width }, () => ({ richText: [] })));
      block.rows = rows;
      render();
    }
    flatIndex = Math.max(0, flatIndex);
    window.requestAnimationFrame(() => focusTableCell(blockId, Math.floor(flatIndex / width), flatIndex % width));
  }

  function handleRichKeydown(event: KeyboardEvent, blockId: string, editable: HTMLElement): void {
    if (event.isComposing || event.keyCode === 229) return;

    if (slashState.blockId === blockId && !slashMenu.hidden) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        slashState.index = Math.max(0, Math.min(slashState.index + delta, slashState.items.length - 1));
        renderSlashMenu(editable);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        chooseSlashCommand(slashState.items[slashState.index]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        hideSlashMenu();
        return;
      }
    }

    if (editable.dataset.field === "table-cell") {
      if (event.key === "Tab") handleTableTab(event, blockId, editable);
      return;
    }

    const block = getBlock(blockId);
    if (!block) return;
    if (event.key === " " && blockPlainText(block).startsWith("/")) {
      const command = exactSlashCommand(blockPlainText(block));
      if (command) {
        event.preventDefault();
        chooseSlashCommand(command);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      hideSlashMenu();
      splitBlockAtSelection(blockId);
      return;
    }
    if (event.key === "Backspace" && removeOrMergeAtStart(blockId)) event.preventDefault();
  }

  function handleBlockAction(blockId: string, action: string): void {
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index < 0) return;
    if (action === "add-after") {
      const next = createEditorBlock("paragraph");
      blocks.splice(index + 1, 0, next);
      selectedId = next.id;
    }
    if (action === "remove") {
      blocks.splice(index, 1);
      if (!blocks.length) blocks.push(createEditorBlock("paragraph"));
      selectedId = blocks[Math.min(index, blocks.length - 1)].id;
    }
    render();
    window.requestAnimationFrame(() => focusBlock(selectedId));
    scheduleSave();
  }

  function handleTableAction(blockId: string, action: string): void {
    const block = getBlock(blockId);
    if (!block || block.type !== "table") return;
    const rows = normalizeTableRows(block.rows);
    const width = rows[0]?.length ?? 1;
    if (action === "add-row") rows.push(Array.from({ length: width }, () => ({ richText: [] })));
    if (action === "add-col") rows.forEach((row) => row.push({ richText: [] }));
    if (action === "remove-row" && rows.length > 1) rows.pop();
    if (action === "remove-col" && width > 1) rows.forEach((row) => row.pop());
    block.rows = rows;
    render();
    scheduleSave();
  }

  function bindBlocks(): void {
    blocksRoot.querySelectorAll<HTMLElement>("[data-id]").forEach((element) => {
      const blockId = element.dataset.id;
      if (!blockId) return;
      element.addEventListener("pointerdown", () => {
        selectedId = blockId;
      });
      element.querySelectorAll<HTMLButtonElement>("[data-block-action]").forEach((button) => {
        button.addEventListener("click", () => handleBlockAction(blockId, button.dataset.blockAction ?? ""));
      });
      element.querySelectorAll<HTMLButtonElement>("[data-table-action]").forEach((button) => {
        button.addEventListener("click", () => handleTableAction(blockId, button.dataset.tableAction ?? ""));
      });
      element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[data-field], textarea[data-field]").forEach((field) => {
        const eventName = field.type === "checkbox" ? "change" : "input";
        field.addEventListener(eventName, () => updatePlainField(blockId, field));
      });
      element.querySelectorAll<HTMLElement>("[data-rich-root]").forEach((editable) => {
        editable.addEventListener("input", () => {
          updateRichTextFromEditable(blockId, editable);
          updateSlashMenu(blockId, editable);
        });
        editable.addEventListener("keydown", (event) => handleRichKeydown(event, blockId, editable));
        editable.addEventListener("blur", () => window.setTimeout(hideSlashMenu, 120));
      });
    });
  }

  function focusBlock(blockId: string, atEnd = false): void {
    const editable = blocksRoot.querySelector<HTMLElement>(`[data-id="${blockId}"] [data-rich-root]`);
    const fallback = blocksRoot.querySelector<HTMLElement>(
      `[data-id="${blockId}"] textarea, [data-id="${blockId}"] input`,
    );
    if (!editable) {
      fallback?.focus();
      return;
    }
    const length = editable.textContent?.length ?? 0;
    const snapshot: SelectionSnapshot = {
      blockId,
      field: editable.dataset.field === "table-cell" ? "table-cell" : "richText",
      row: editable.dataset.field === "table-cell" ? Number(editable.dataset.row) : undefined,
      col: editable.dataset.field === "table-cell" ? Number(editable.dataset.col) : undefined,
      start: atEnd ? length : 0,
      end: atEnd ? length : 0,
    };
    restoreSelection(snapshot);
  }

  function addBlockFromPalette(target: string): void {
    const [rawType, rawLevel] = target.split(":");
    const type = rawType as EditorBlockType;
    const block = createEditorBlock(type, "", {
      level: type === "heading" ? clampHeadingLevel(rawLevel) : undefined,
    });
    const currentIndex = selectedId ? blocks.findIndex((item) => item.id === selectedId) : blocks.length - 1;
    blocks.splice(Math.max(0, currentIndex) + 1, 0, block);
    selectedId = block.id;
    render();
    window.requestAnimationFrame(() => focusBlock(block.id));
    scheduleSave();
  }

  function serializedBlock(block: EditorBlock): Record<string, unknown> {
    const base: Record<string, unknown> = { id: block.id, type: block.type };
    if (block.backgroundColor) base.backgroundColor = block.backgroundColor;
    if (block.textColor) base.textColor = block.textColor;
    if (isRichTextBlock(block.type)) base.richText = normalizeRichText(block.richText);
    if (block.type === "heading") base.level = block.level ?? 1;
    if (block.type === "todo") base.checked = Boolean(block.checked);
    if (block.type === "callout") base.icon = block.icon ?? "i";
    if (block.type === "context") base.title = block.title ?? "맥락";
    if (block.type === "code") {
      base.language = block.language ?? "text";
      base.code = block.code ?? "";
    }
    if (block.type === "equation") base.equation = block.equation ?? "";
    if (block.type === "image") {
      base.src = block.src ?? "";
      base.alt = block.alt ?? "";
      if (block.caption?.length) base.caption = normalizeRichText(block.caption);
    }
    if (block.type === "bookmark") {
      base.url = block.url ?? "";
      base.title = block.title ?? "Bookmark";
      if (block.description) base.description = block.description;
    }
    if (block.type === "table") {
      base.hasHeaderRow = block.hasHeaderRow !== false;
      base.rows = normalizeTableRows(block.rows);
    }
    return base;
  }

  function getDocument(): EditorDocument {
    return {
      version: 2,
      meta: getMeta(),
      page: structuredClone(pageAppearance),
      blocks: blocks.map((block) => serializedBlock(block) as EditorBlock),
    };
  }

  function getJson(): string {
    return JSON.stringify(getDocument(), null, 2);
  }

  function syncOutput(): void {
    const meta = getMeta();
    const title = meta.title || "제목 없음";
    const slug = meta.slug || slugify(title);
    const json = getJson();
    if (slugPreview) slugPreview.textContent = slug;
    if (datePreview) datePreview.textContent = meta.pubDate || today;
    if (blockCount) blockCount.textContent = String(blocks.length);
    if (jsonPreview) jsonPreview.textContent = json;
    if (jsonSize) jsonSize.textContent = `${json.length} chars`;
  }
  function persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getDocument()));
    if (saveState) saveState.textContent = "저장됨";
  }

  function scheduleSave(): void {
    if (saveState) saveState.textContent = "저장 중";
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persist, 180);
  }

  async function copyText(value: string, label: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    showToast(`${label} 복사됨`);
  }

  function downloadFallback(value: string, filename: string): void {
    const blob = new Blob([value], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast(`${filename} 다운로드 완료`);
  }

  async function saveJson(value: string, filename: string): Promise<void> {
    const pickerWindow = window as Window & {
      showSaveFilePicker?: (options: Record<string, unknown>) => Promise<{
        createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
      }>;
    };
    if (!pickerWindow.showSaveFilePicker) {
      downloadFallback(value, filename);
      return;
    }
    try {
      const handle = await pickerWindow.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: "Post JSON",
          accept: { "application/json": [".json"] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(value);
      await writable.close();
      showToast(`${filename} 저장 완료`);
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "AbortError") throw error;
    }
  }
  function showToast(message: string): void {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.setTimeout(() => {
      toast.hidden = true;
    }, 1800);
  }

  metaInputs.forEach((input) => {
    input.addEventListener("input", () => {
      syncOutput();
      scheduleSave();
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-page-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.pageAction;
      if (action === "add-icon") void openEmojiMenu("page", "", button);
      if (action === "add-cover" || action === "change-cover") openCoverMenu(button);
      if (action === "remove-icon") {
        delete pageAppearance.icon;
        renderPageAppearance();
        syncOutput();
        scheduleSave();
      }
      if (action === "remove-cover") {
        delete pageAppearance.cover;
        renderPageAppearance();
        syncOutput();
        scheduleSave();
        hideCoverMenu();
      }
    });
  });

  pageIcon.addEventListener("click", () => {
    void openEmojiMenu("page", "", pageIcon);
  });

  root.querySelectorAll<HTMLButtonElement>("[data-add-block]").forEach((button) => {
    button.addEventListener("click", () => addBlockFromPalette(button.dataset.addBlock ?? "paragraph"));
  });

  root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const meta = getMeta();
      const slug = meta.slug || slugify(meta.title || "untitled");
      const json = getJson();
      if (button.dataset.action === "copy-json") await copyText(json, "JSON");
      if (button.dataset.action === "save-json") await saveJson(json, `${slug}.post.json`);
      if (button.dataset.action === "reset-sample") {
        const sample = sampleDocument();
        setMeta(sample.meta);
        pageAppearance = structuredClone(sample.page);
        blocks = structuredClone(sample.blocks);
        selectedId = blocks[0]?.id ?? "";
        render();
        scheduleSave();
      }
      if (button.dataset.action === "clear-document") {
        setMeta({
          title: "",
          slug: "",
          description: "",
          pubDate: today,
          category: "",
          tags: "",
          badge: "",
        });
        pageAppearance = {};
        blocks = [createEditorBlock("paragraph")];
        selectedId = blocks[0].id;
        render();
        scheduleSave();
      }
    });
  });
  inlineToolbar.querySelectorAll<HTMLButtonElement>("[data-inline-mark]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      runInlineMark(button.dataset.inlineMark as InlineMark);
    });
  });

  inlineToolbar.querySelector<HTMLButtonElement>("[data-inline-action='text-color']")?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    openInlineColorMenu();
  });

  root.addEventListener("mouseup", () => window.setTimeout(() => showInlineToolbar(), 0));
  root.addEventListener("keyup", () => {
    window.setTimeout(() => showInlineToolbar(), 0);
  });
  root.addEventListener("contextmenu", (event) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !captureSelection()) return;
    event.preventDefault();
    const rect = new DOMRect(event.clientX, event.clientY, 1, 1);
    showInlineToolbar(rect);
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (inlineToolbar.contains(target) || colorMenu.contains(target) || slashMenu.contains(target) || emojiMenu.contains(target) || coverMenu.contains(target)) return;
    if (!target.closest("[data-rich-root]")) hideInlineToolbar();
    hideColorMenu();
    hideEmojiMenu();
    hideCoverMenu();
  });
  window.addEventListener("beforeunload", persist);

  const state = loadDocument();
  setMeta({ ...state.meta, pubDate: state.meta.pubDate || today });
  pageAppearance = state.page ?? {};
  blocks = state.blocks.length ? state.blocks : [createEditorBlock("paragraph")];
  selectedId = blocks[0]?.id ?? "";
  render();
  persist();
}

