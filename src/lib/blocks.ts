export type TextAlign = "left" | "center" | "right";
export type HeadingLevel = 1 | 2 | 3;

export type TextAnnotation = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
};

export type RichText = {
  text: string;
  href?: string;
  annotations?: TextAnnotation;
  textColor?: string;
  backgroundColor?: string;
};

export type BaseBlock = {
  id: string;
  type: string;
  children?: Block[];
  textColor?: string;
  backgroundColor?: string;
  align?: TextAlign;
  metadata?: Record<string, unknown>;
};

export type ParagraphBlock = BaseBlock & {
  type: "paragraph";
  richText: RichText[];
};

export type HeadingBlock = BaseBlock & {
  type: "heading";
  level: HeadingLevel;
  richText: RichText[];
};

export type ListBlock = BaseBlock & {
  type: "bulleted_list" | "numbered_list";
  richText: RichText[];
};

export type TodoBlock = BaseBlock & {
  type: "todo";
  checked: boolean;
  richText: RichText[];
};

export type QuoteBlock = BaseBlock & {
  type: "quote";
  richText: RichText[];
};

export type CalloutBlock = BaseBlock & {
  type: "callout";
  icon?: string;
  richText: RichText[];
};

export type ToggleBlock = BaseBlock & {
  type: "toggle";
  richText: RichText[];
};

export type CodeBlock = BaseBlock & {
  type: "code";
  language?: string;
  code: string;
};

export type DividerBlock = BaseBlock & {
  type: "divider";
};

export type ImageBlock = BaseBlock & {
  type: "image";
  src: string;
  alt: string;
  caption?: RichText[];
};

export type BookmarkBlock = BaseBlock & {
  type: "bookmark";
  url: string;
  title: string;
  description?: string;
};

export type EquationBlock = BaseBlock & {
  type: "equation";
  equation: string;
};

export type ContextBlock = BaseBlock & {
  type: "context";
  title: string;
  richText: RichText[];
};

export type TableCell = {
  richText: RichText[];
  align?: TextAlign;
};

export type TableBlock = BaseBlock & {
  type: "table";
  hasHeaderRow?: boolean;
  rows: TableCell[][];
};

export type Block =
  | ParagraphBlock
  | HeadingBlock
  | ListBlock
  | TodoBlock
  | QuoteBlock
  | CalloutBlock
  | ToggleBlock
  | CodeBlock
  | DividerBlock
  | ImageBlock
  | BookmarkBlock
  | EquationBlock
  | ContextBlock
  | TableBlock;

export function getRichTextPlainText(richText: RichText[] = []): string {
  return richText.map((part) => part.text).join("");
}

export function getBlockText(block: Block): string {
  switch (block.type) {
    case "code":
      return block.code;
    case "divider":
      return "";
    case "equation":
      return block.equation;
    case "image":
      return block.caption ? getRichTextPlainText(block.caption) : block.alt;
    case "bookmark":
      return [block.title, block.description, block.url].filter(Boolean).join(" ");
    case "table":
      return block.rows
        .map((row) => row.map((cell) => getRichTextPlainText(cell.richText)).join(" "))
        .join(" ");
    default: {
      const ownText = "richText" in block ? getRichTextPlainText(block.richText) : "";
      const childText = block.children?.map(getBlockText).join(" ") ?? "";
      return [ownText, childText].filter(Boolean).join(" ");
    }
  }
}

export function resolveTextColor(color?: string): string | undefined {
  const colors: Record<string, string> = {
    default: "inherit",
    gray: "#5f6368",
    brown: "#7a5c4f",
    red: "#a4473f",
    orange: "#a85f16",
    yellow: "#80620b",
    green: "#2f6f4e",
    blue: "#27679b",
    purple: "#72549a",
    pink: "#9a4d70",
    teal: "#1f6f68",
  };
  return color ? colors[color] ?? color : undefined;
}

export function resolveBackgroundColor(color?: string): string | undefined {
  const colors: Record<string, string> = {
    default: "transparent",
    gray: "#f1f3f4",
    brown: "#f4eeee",
    red: "#faeceb",
    orange: "#fbecdd",
    yellow: "#fff4cc",
    green: "#edf3ec",
    blue: "#eaf4ff",
    purple: "#f3eefd",
    pink: "#fbeaf2",
    teal: "#e7f6f4",
  };
  return color ? colors[color] ?? color : undefined;
}

export function resolveBlockColor(color?: string): string | undefined {
  return resolveTextColor(color);
}
