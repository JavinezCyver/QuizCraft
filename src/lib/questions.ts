import type { Question } from "./api";

export function correctIndices(question: Question): number[] {
  const indices =
    (Array.isArray(question.correctOptions)
      ? question.correctOptions
      : undefined) ??
    (Number.isInteger(question.correctOption) && question.correctOption != null
      ? [question.correctOption]
      : question.options.flatMap((option, i) =>
          question.accepted.includes(option) ? [i] : [],
        ));
  return [...new Set(indices)].filter(
    (i) => Number.isInteger(i) && i >= 0 && i < question.options.length,
  );
}

export function matchesAnswer(question: Question, answer: string): boolean {
  const normalize = (value: string) =>
    value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  if (question.type !== "multiple")
    return question.accepted.some(
      (value) => normalize(value) === normalize(answer),
    );
  let selected: unknown = [answer];
  try {
    const parsed: unknown = JSON.parse(answer);
    if (Array.isArray(parsed)) selected = parsed;
  } catch {
    /* Older attempts store a single choice as plain text. */
  }
  if (
    !Array.isArray(selected) ||
    !selected.every((value) => typeof value === "string")
  )
    return false;
  const actual = new Set(selected.map(normalize));
  const expected = new Set(question.accepted.map(normalize));
  return (
    expected.size > 0 &&
    actual.size === expected.size &&
    [...expected].every((value) => actual.has(value))
  );
}
