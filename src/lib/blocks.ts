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

export function resolveBlockColor(color?: string): string | undefined {
  const colors: Record<string, string> = {
    default: "inherit",
    gray: "var(--block-gray)",
    brown: "var(--block-brown)",
    red: "var(--block-red)",
    orange: "var(--block-orange)",
    yellow: "var(--block-yellow)",
    green: "var(--block-green)",
    blue: "var(--block-blue)",
    purple: "var(--block-purple)",
    pink: "var(--block-pink)",
  };

  return color ? colors[color] ?? color : undefined;
}
