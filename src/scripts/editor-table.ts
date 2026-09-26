import type { RichText } from "../lib/blocks";
import {
  escapeHtml, mergeRichText, normalizeTableRows, richTextToHtml, sliceRichText,
  type EditorBlock,
} from "../lib/editor-document";
import {
  changeTableStructure, clampTableSelection, sameTableContent, TableHistory,
  type TableSelection, type TableSnapshot, type TableStructureAction,
} from "../lib/editor-table";

export function renderEditorTable(block: EditorBlock): string {
  const rows = normalizeTableRows(block.rows);
  return `<div class="editor-table-wrap">
    <div class="editor-table-scroll"><table class="editor-table" style="min-width:${rows[0].length * 100}px"><tbody>
      ${rows.map((row, rowIndex) => `<tr>${row.map((cell, colIndex) => {
        const tag = block.hasHeaderRow !== false && rowIndex === 0 ? "th" : "td";
        return `<${tag}${tag === "th" ? ' scope="col"' : ""} style="text-align:${cell.align ?? "left"}">
          <div contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true"
            aria-label="${rowIndex + 1}행 ${colIndex + 1}열" data-rich-root data-owner-id="${escapeHtml(block.id)}"
            data-field="table-cell" data-row="${rowIndex}" data-col="${colIndex}"
          >${richTextToHtml(cell.richText)}</div></${tag}>`;
      }).join("")}</tr>`).join("")}
    </tbody></table></div>
    <div class="editor-table-actions" role="group" aria-label="표 편집">
      <output data-table-selection>1행 1열 선택</output>
      <button type="button" data-table-action="add-row">아래에 행 추가</button>
      <button type="button" data-table-action="add-col">오른쪽에 열 추가</button>
      <button type="button" data-table-action="remove-row"${rows.length === 1 ? " disabled" : ""}>선택 행 삭제</button>
      <button type="button" data-table-action="remove-col"${rows[0].length === 1 ? " disabled" : ""}>선택 열 삭제</button>
      <button type="button" data-table-action="header" aria-pressed="${block.hasHeaderRow !== false}">첫 행 제목</button>
      <label>셀 정렬 <select data-table-align aria-label="선택 셀 정렬">
        <option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option>
      </select></label>
      <button type="button" data-table-action="undo" disabled>실행 취소</button>
      <button type="button" data-table-action="redo" disabled>다시 실행</button>
    </div>
  </div>`;
}

type TableEditorOptions = {
  root: HTMLElement;
  getBlock: (id: string) => EditorBlock | undefined;
  parseCell: (element: HTMLElement) => RichText[];
  captureSelection: (blockId: string) => TableSelection | null;
  restoreSelection: (blockId: string, selection: TableSelection) => void;
  onChange: () => void;
  onSelect: (blockId: string) => void;
  onBeforeRender: () => void;
};

// Delegation keeps table events attached when only the table surface is replaced.
export function createTableEditor(options: TableEditorOptions) {
  const { root, getBlock } = options;
  const selections = new Map<string, TableSelection>();
  const histories = new Map<string, TableHistory>();
  let pendingInput: { id: string; before: TableSnapshot } | null = null;
  let composition: { cell: HTMLElement; id: string; before: TableSnapshot } | null = null;
  let deferredAction: (() => void) | null = null;

  const tableElement = (id: string) => root.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
  const history = (id: string) => {
    if (!histories.has(id)) histories.set(id, new TableHistory());
    return histories.get(id)!;
  };
  const snapshot = (block: EditorBlock): TableSnapshot => {
    const rows = normalizeTableRows(block.rows);
    return {
      rows, hasHeaderRow: block.hasHeaderRow !== false,
      selection: clampTableSelection(rows, options.captureSelection(block.id) ?? selections.get(block.id)),
    };
  };
  const cellTarget = (target: EventTarget | null) => {
    const cell = target instanceof Element ? target.closest<HTMLElement>('[data-field="table-cell"]') : null;
    const id = cell?.dataset.ownerId;
    if (!cell || !root.contains(cell) || !id || cell.closest<HTMLElement>("[data-id]")?.dataset.id !== id) return null;
    const block = getBlock(id);
    return block?.type === "table" ? { cell, block } : null;
  };

  function refreshControls(block: EditorBlock): void {
    const element = tableElement(block.id);
    if (!element) return;
    const rows = block.rows ?? normalizeTableRows(undefined);
    const selection = clampTableSelection(rows, selections.get(block.id));
    const output = element.querySelector<HTMLOutputElement>("[data-table-selection]");
    if (output) output.textContent = `${selection.row + 1}행 ${selection.col + 1}열 선택`;
    element.querySelectorAll<HTMLElement>('[data-field="table-cell"]').forEach((cell) => {
      cell.parentElement?.classList.toggle("is-current-cell", Number(cell.dataset.row) === selection.row && Number(cell.dataset.col) === selection.col);
    });
    const align = element.querySelector<HTMLSelectElement>("[data-table-align]");
    if (align) align.value = rows[selection.row][selection.col].align ?? "left";
    const undo = element.querySelector<HTMLButtonElement>('[data-table-action="undo"]');
    const redo = element.querySelector<HTMLButtonElement>('[data-table-action="redo"]');
    if (undo) undo.disabled = !histories.get(block.id)?.canUndo;
    if (redo) redo.disabled = !histories.get(block.id)?.canRedo;
  }

  function record(block: EditorBlock, before: TableSnapshot): void {
    history(block.id).record(before, snapshot(block));
    refreshControls(block);
  }

  function readCell(cell: HTMLElement, block: EditorBlock, before?: TableSnapshot): boolean {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const current = block.rows?.[row]?.[col];
    if (!current) return false;
    const selection = options.captureSelection(block.id);
    if (selection?.row === row && selection.col === col) selections.set(block.id, selection);
    else if (!selections.has(block.id)) selections.set(block.id, { row, col, start: 0, end: 0 });
    const value = options.parseCell(cell);
    // Saving and focus changes also flush the cell; do not clone the entire table for a no-op.
    if (JSON.stringify(current.richText) === JSON.stringify(value)) return false;
    const previous = before ?? snapshot(block);
    current.richText = value;
    if (composition?.id !== block.id) record(block, previous);
    return true;
  }

  function flush(): void {
    const target = cellTarget(document.activeElement);
    if (target) readCell(target.cell, target.block);
  }

  function renderTable(block: EditorBlock, selection: TableSelection): void {
    const surface = tableElement(block.id)?.querySelector<HTMLElement>(".editor-table-wrap");
    if (!surface) return;
    options.onBeforeRender();
    surface.outerHTML = renderEditorTable(block);
    selections.set(block.id, selection);
    refreshControls(block);
    options.restoreSelection(block.id, selection);
    selections.set(block.id, selection);
  }

  function apply(block: EditorBlock, next: TableSnapshot, before?: TableSnapshot): void {
    block.rows = next.rows;
    block.hasHeaderRow = next.hasHeaderRow;
    selections.set(block.id, next.selection);
    if (before) history(block.id).record(before, next);
    renderTable(block, next.selection);
    options.onChange();
  }

  function action(id: string, name: string): void {
    if (composition) {
      deferredAction = () => action(id, name);
      return;
    }
    flush();
    const block = getBlock(id);
    if (!block || block.type !== "table") return;
    const before = snapshot(block);
    if (name === "undo" || name === "redo") {
      const next = history(id)[name](before);
      if (next) apply(block, next);
      return;
    }
    let next: TableSnapshot;
    if (name === "header") next = { ...before, hasHeaderRow: !before.hasHeaderRow };
    else if (["align-left", "align-center", "align-right"].includes(name)) {
      next = structuredClone(before);
      const cell = next.rows[next.selection.row][next.selection.col];
      if (name === "align-left") delete cell.align;
      else cell.align = name === "align-center" ? "center" : "right";
    } else if (["add-row", "add-col", "remove-row", "remove-col"].includes(name)) {
      next = changeTableStructure(before, name as TableStructureAction);
    } else return;
    if (!sameTableContent(before, next)) apply(block, next, before);
  }

  // Shared inline toolbar edits enter the same history as cell typing and structure changes.
  function setCell(id: string, selection: TableSelection, value: RichText[]): void {
    const block = getBlock(id);
    if (!block || block.type !== "table") return;
    const before = snapshot(block);
    const cell = block.rows?.[selection.row]?.[selection.col];
    if (!cell) return;
    before.selection = selection;
    cell.richText = mergeRichText(value);
    selections.set(id, selection);
    record(block, before);
  }

  function insert(cell: HTMLElement, block: EditorBlock, value: RichText[]): void {
    const before = snapshot(block);
    const selection = before.selection;
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const current = before.rows[row][col].richText;
    const next = structuredClone(before);
    next.rows[row][col].richText = mergeRichText([
      ...sliceRichText(current, 0, selection.start), ...value, ...sliceRichText(current, selection.end),
    ]);
    const end = selection.start + value.reduce((length, part) => length + part.text.length, 0);
    next.selection = { row, col, start: end, end };
    apply(block, next, before);
  }

  root.addEventListener("focusin", (event) => {
    const target = cellTarget(event.target);
    if (!target) return;
    const { cell, block } = target;
    selections.set(block.id, { row: Number(cell.dataset.row), col: Number(cell.dataset.col), start: 0, end: 0 });
    options.onSelect(block.id);
    refreshControls(block);
  });
  root.addEventListener("beforeinput", (event: InputEvent) => {
    const target = cellTarget(event.target);
    if (!target || composition || event.isComposing) return;
    if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
      event.preventDefault();
      action(target.block.id, event.inputType === "historyUndo" ? "undo" : "redo");
    } else if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
      event.preventDefault();
      insert(target.cell, target.block, [{ text: "\n" }]);
    } else pendingInput = { id: target.block.id, before: snapshot(target.block) };
  });
  root.addEventListener("input", (event) => {
    const target = cellTarget(event.target);
    if (!target) return;
    const before = pendingInput?.id === target.block.id ? pendingInput.before : undefined;
    pendingInput = null;
    if (readCell(target.cell, target.block, before)) options.onChange();
  });
  root.addEventListener("focusout", (event) => {
    const target = cellTarget(event.target);
    if (target && readCell(target.cell, target.block)) options.onChange();
  });
  root.addEventListener("compositionstart", (event) => {
    const target = cellTarget(event.target);
    if (!target) return;
    composition = { cell: target.cell, id: target.block.id, before: snapshot(target.block) };
    pendingInput = null;
  });
  root.addEventListener("compositionend", () => {
    if (!composition) return;
    const { cell, id, before } = composition;
    const block = getBlock(id);
    if (block?.type === "table") readCell(cell, block);
    composition = null;
    if (block?.type === "table") {
      record(block, before);
      options.onChange();
    }
    const deferred = deferredAction;
    deferredAction = null;
    if (deferred) queueMicrotask(deferred);
  });
  root.addEventListener("keydown", (event) => {
    const target = cellTarget(event.target);
    if (!target || composition || event.isComposing || event.keyCode === 229) return;
    const { cell, block } = target;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === "z" || key === "y")) {
      event.preventDefault();
      action(block.id, key === "y" || event.shiftKey ? "redo" : "undo");
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      insert(cell, block, [{ text: "\n" }]);
    } else if (event.key === "Tab") {
      flush();
      const before = snapshot(block);
      const width = before.rows[0].length;
      const index = Number(cell.dataset.row) * width + Number(cell.dataset.col) + (event.shiftKey ? -1 : 1);
      if (index < 0) return; // Let Shift+Tab leave the first cell.
      event.preventDefault();
      if (index >= before.rows.length * width) {
        const next = changeTableStructure(before, "add-row");
        next.selection.col = 0;
        apply(block, next, before);
      } else options.restoreSelection(block.id, { row: Math.floor(index / width), col: index % width, start: 0, end: 0 });
    }
  });
  root.addEventListener("paste", (event) => {
    const target = cellTarget(event.target);
    if (!target || composition || !event.clipboardData) return;
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    let value: RichText[];
    if (html) {
      const parsed = new DOMParser().parseFromString(html, "text/html");
      value = options.parseCell(parsed.body);
    } else value = [{ text: event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n") }];
    insert(target.cell, target.block, value);
  });
  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-table-action]") : null;
    const id = button?.closest<HTMLElement>("[data-id]")?.dataset.id;
    if (button && !button.disabled && id) action(id, button.dataset.tableAction ?? "");
  });
  root.addEventListener("change", (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || !select.matches("[data-table-align]")) return;
    const id = select.closest<HTMLElement>("[data-id]")?.dataset.id;
    if (id) action(id, `align-${select.value}`);
  });

  return {
    flush, setCell,
    refresh: () => {
      root.querySelectorAll<HTMLElement>(".editor-block--table[data-id]").forEach((element) => {
        const block = getBlock(element.dataset.id!);
        if (block) refreshControls(block);
      });
    },
    reset: () => {
      histories.clear(); selections.clear(); pendingInput = null; composition = null; deferredAction = null;
    },
  };
}
