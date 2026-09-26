import type { TableCell } from "./blocks";
import { normalizeTableRows } from "./editor-document";

export type TableSelection = { row: number; col: number; start: number; end: number };
export type TableSnapshot = {
  rows: TableCell[][];
  hasHeaderRow: boolean;
  selection: TableSelection;
};
export type TableStructureAction = "add-row" | "add-col" | "remove-row" | "remove-col";

export function clampTableSelection(rows: TableCell[][], selection?: Partial<TableSelection>): TableSelection {
  const index = (value: number | undefined, maximum: number) =>
    Math.max(0, Math.min(Number.isFinite(value) ? Math.trunc(value!) : 0, maximum));
  const row = index(selection?.row, rows.length - 1);
  const col = index(selection?.col, (rows[row]?.length ?? 1) - 1);
  const length = rows[row]?.[col]?.richText.reduce((sum, part) => sum + part.text.length, 0) ?? 0;
  const start = index(selection?.start, length);
  return { row, col, start, end: Math.max(start, index(selection?.end ?? start, length)) };
}

// Work on a copy so history snapshots and neighboring cells cannot be mutated by an edit.
export function changeTableStructure(
  source: TableSnapshot,
  action: TableStructureAction,
): TableSnapshot {
  const rows = normalizeTableRows(source.rows);
  let { row, col } = clampTableSelection(rows, source.selection);
  const width = rows[0].length;
  switch (action) {
    case "add-row":
      rows.splice(++row, 0, Array.from({ length: width }, () => ({ richText: [] })));
      break;
    case "add-col":
      rows.forEach((cells) => cells.splice(col + 1, 0, { richText: [] }));
      col++;
      break;
    case "remove-row":
      if (rows.length === 1) return source;
      rows.splice(row, 1);
      row = Math.min(row, rows.length - 1);
      break;
    case "remove-col":
      if (width === 1) return source;
      rows.forEach((cells) => cells.splice(col, 1));
      col = Math.min(col, width - 2);
      break;
  }
  return { rows, hasHeaderRow: source.hasHeaderRow, selection: { row, col, start: 0, end: 0 } };
}

export function sameTableContent(a: TableSnapshot, b: TableSnapshot): boolean {
  return a.hasHeaderRow === b.hasHeaderRow && JSON.stringify(a.rows) === JSON.stringify(b.rows);
}

export class TableHistory {
  private past: TableSnapshot[] = [];
  private future: TableSnapshot[] = [];

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  record(before: TableSnapshot, after: TableSnapshot): void {
    if (sameTableContent(before, after)) return;
    this.past.push(structuredClone(before));
    if (this.past.length > 100) this.past.shift();
    this.future = [];
  }

  undo(current: TableSnapshot): TableSnapshot | undefined {
    const previous = this.past.pop();
    if (previous) this.future.push(structuredClone(current));
    return previous;
  }

  redo(current: TableSnapshot): TableSnapshot | undefined {
    const next = this.future.pop();
    if (next) this.past.push(structuredClone(current));
    return next;
  }
}
