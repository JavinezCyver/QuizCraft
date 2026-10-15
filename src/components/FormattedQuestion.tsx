import { Fragment } from "react";
import { parseQuestionText, type InlinePart } from "../lib/question-format";

function renderParts(parts: InlinePart[]) {
  return parts.map((part, index) =>
    part.type === "text" ? (
      <Fragment key={index}>{part.text}</Fragment>
    ) : part.type === "bold" ? (
      <strong key={index}>{renderParts(part.children)}</strong>
    ) : part.type === "italic" ? (
      <em key={index}>{renderParts(part.children)}</em>
    ) : (
      <u key={index}>{renderParts(part.children)}</u>
    ),
  );
}
export function FormattedQuestion({ text }: { text: string }) {
  return <>{renderParts(parseQuestionText(text))}</>;
}
