export type InlinePart =
  | { type: "text"; text: string }
  | { type: "bold" | "italic" | "underline"; children: InlinePart[] };

export function parseQuestionText(text: string, depth = 0): InlinePart[] {
  if (depth >= 20) return [{ type: "text", text }];
  const pattern =
    /\*\*([\s\S]+?)\*\*|(?<![\p{L}\p{N}])_([^_]+?)_(?![\p{L}\p{N}])|<u>([\s\S]+?)<\/u>/gu;
  const parts: InlinePart[] = [];
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > end)
      parts.push({ type: "text", text: text.slice(end, match.index) });
    parts.push({
      type:
        match[1] !== undefined
          ? "bold"
          : match[2] !== undefined
            ? "italic"
            : "underline",
      children: parseQuestionText(match[1] ?? match[2] ?? match[3], depth + 1),
    });
    end = match.index! + match[0].length;
  }
  if (end < text.length) parts.push({ type: "text", text: text.slice(end) });
  return parts;
}
export function plainQuestionText(text: string): string {
  const plain = (parts: InlinePart[]): string =>
    parts
      .map((part) => (part.type === "text" ? part.text : plain(part.children)))
      .join("");
  return plain(parseQuestionText(text));
}
