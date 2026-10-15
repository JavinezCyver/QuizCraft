import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Bold, Italic, Underline } from "lucide-react";
import { Button } from "./ui/button";
import { parseQuestionText, type InlinePart } from "../lib/question-format";

function appendParts(parent: Node, parts: InlinePart[]) {
  for (const part of parts) {
    if (part.type === "text")
      parent.appendChild(document.createTextNode(part.text));
    else {
      const element = document.createElement(
        part.type === "bold" ? "strong" : part.type === "italic" ? "em" : "u",
      );
      appendParts(element, part.children);
      parent.appendChild(element);
    }
  }
}
function wrap(content: string, marker: string, closingMarker = marker) {
  const match = content.match(/^(\s*)([\s\S]*?\S)(\s*)$/);
  return match
    ? `${match[1]}${marker}${match[2]}${closingMarker}${match[3]}`
    : content;
}
function serialize(parent: Node): string {
  let text = "";
  for (const node of parent.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += (node.textContent || "").replace(/\u00a0/g, " ");
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    if (node.tagName === "BR") {
      const placeholder =
        node === parent.lastChild &&
        (parent.childNodes.length === 1 ||
          (node.previousSibling instanceof HTMLElement &&
            node.previousSibling.tagName === "BR"));
      if (!placeholder) text += "\n";
      continue;
    }
    const block = ["DIV", "P", "LI"].includes(node.tagName);
    if (block && text && !text.endsWith("\n")) text += "\n";
    let content = serialize(node);
    if (
      content &&
      (["B", "STRONG"].includes(node.tagName) ||
        Number(node.style.fontWeight) >= 600 ||
        node.style.fontWeight === "bold")
    )
      content = wrap(content, "**");
    if (
      content &&
      (["I", "EM"].includes(node.tagName) || node.style.fontStyle === "italic")
    )
      content = wrap(content, "_");
    if (
      content &&
      (node.tagName === "U" ||
        node.style.textDecorationLine.includes("underline") ||
        node.style.textDecoration.includes("underline"))
    )
      content = wrap(content, "<u>", "</u>");
    text += content;
    if (block && node.nextSibling && !text.endsWith("\n")) text += "\n";
  }
  return text;
}

export function QuestionEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const field = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const lastValue = useRef<string | null>(null);
  const [format, setFormat] = useState({
    bold: false,
    italic: false,
    underline: false,
  });
  const currentFormat = useRef({
    bold: false,
    italic: false,
    underline: false,
  });
  const id = useId();
  function selectionChanged() {
    const selection = window.getSelection();
    if (
      !field.current ||
      document.activeElement !== field.current ||
      !selection?.rangeCount ||
      !field.current.contains(selection.anchorNode) ||
      !field.current.contains(selection.focusNode)
    )
      return;
    savedRange.current = selection.getRangeAt(0).cloneRange();
    const next = {
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
    };
    currentFormat.current = next;
    setFormat(next);
  }
  function sync() {
    if (!field.current) return;
    const next = field.current.textContent ? serialize(field.current) : "";
    if (next !== lastValue.current) {
      lastValue.current = next;
      onChange(next);
    }
    selectionChanged();
  }
  useLayoutEffect(() => {
    if (!field.current || lastValue.current === value) return;
    field.current.replaceChildren();
    appendParts(field.current, parseQuestionText(value));
    lastValue.current = value;
    savedRange.current = null;
  }, [value]);
  useEffect(() => {
    document.addEventListener("selectionchange", selectionChanged);
    return () =>
      document.removeEventListener("selectionchange", selectionChanged);
  }, []);
  function focus() {
    const editor = field.current;
    if (!editor) return;
    editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    const range =
      savedRange.current &&
      editor.contains(savedRange.current.commonAncestorContainer)
        ? savedRange.current
        : document.createRange();
    if (range !== savedRange.current) {
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    const existing = selection?.rangeCount ? selection.getRangeAt(0) : null;
    // Replacing an identical caret range discards pending formatting in an empty editor.
    if (
      existing &&
      existing.startContainer === range.startContainer &&
      existing.startOffset === range.startOffset &&
      existing.endContainer === range.endContainer &&
      existing.endOffset === range.endOffset
    )
      return;
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  function toggle(style: "bold" | "italic" | "underline") {
    selectionChanged();
    const enabled = !currentFormat.current[style];
    focus();
    if (enabled) {
      for (const other of ["bold", "italic", "underline"]) {
        if (other === style) continue;
        // Normalize a mixed selection before clearing other styles.
        if (
          document.queryCommandIndeterm(other) &&
          !document.queryCommandState(other)
        )
          document.execCommand(other);
        if (document.queryCommandState(other)) document.execCommand(other);
      }
    }
    if (document.queryCommandState(style) !== enabled)
      document.execCommand(style);
    sync();
  }
  function insertPlainText(text: string) {
    focus();
    document.execCommand("insertText", false, text);
    sync();
  }
  return (
    <div className="question-prompt-field">
      <label id={`${id}-label`} htmlFor={id} onClick={focus}>
        Your question
      </label>
      <div
        className="question-format-toolbar"
        role="toolbar"
        aria-label="Question formatting"
      >
        <Button
          type="button"
          variant="outline"
          aria-label="Bold"
          aria-pressed={format.bold}
          title="Bold (Ctrl+B)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggle("bold")}
        >
          <Bold size={16} /> Bold
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-label="Italic"
          aria-pressed={format.italic}
          title="Italic (Ctrl+I)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggle("italic")}
        >
          <Italic size={16} /> Italic
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-label="Underline"
          aria-pressed={format.underline}
          title="Underline (Ctrl+U)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggle("underline")}
        >
          <Underline size={16} /> Underline
        </Button>
      </div>
      <div
        ref={field}
        id={id}
        className="question-text-editor"
        role="textbox"
        aria-multiline="true"
        aria-labelledby={`${id}-label`}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Ask something interesting..."
        onInput={sync}
        onKeyDown={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "a"
          ) {
            event.preventDefault();
            const editor = field.current;
            if (editor?.textContent) {
              const range = document.createRange();
              range.selectNodeContents(editor);
              const selection = window.getSelection();
              selection?.removeAllRanges();
              selection?.addRange(range);
              selectionChanged();
            }
            return;
          }
          if (
            (event.ctrlKey || event.metaKey) &&
            ["b", "i", "u"].includes(event.key.toLowerCase())
          ) {
            event.preventDefault();
            const key = event.key.toLowerCase();
            toggle(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
          }
        }}
        onPaste={(event) => {
          event.preventDefault();
          insertPlainText(event.clipboardData.getData("text/plain"));
        }}
        onDrop={(event) => {
          event.preventDefault();
          insertPlainText(event.dataTransfer.getData("text/plain"));
        }}
      />
    </div>
  );
}
