import type { Question } from "./api";

export function allowsMultipleSelections(question: Question): boolean {
  return question.type === "multiple" && correctIndices(question).length > 1;
}

export function hasCompleteAnswer(
  question: Question,
  selected: number[] = [],
  typed = "",
): boolean {
  if (!["multiple", "boolean"].includes(question.type)) return !!typed.trim();
  const required = correctIndices(question).length;
  return (
    required > 0 &&
    new Set(selected).size >= required &&
    selected.every(
      (index) =>
        Number.isInteger(index) &&
        index >= 0 &&
        index < question.options.length,
    )
  );
}

export function optionIndices(question: Question, options: string[]): number[] {
  const available = question.options.map((_, index) => index);
  return options.map((option) => {
    const position = available.findIndex(
      (index) => question.options[index] === option,
    );
    return available.splice(position, 1)[0];
  });
}

export function isStudyAnswerCorrect(
  question: Question,
  selected: number[] = [],
  typed = "",
): boolean {
  if (!hasCompleteAnswer(question, selected, typed)) return false;
  if (["multiple", "boolean"].includes(question.type))
    return matchesSelectedOptions(question, selected);
  // Free-response questions without an answer key are self-assessed.
  if (
    question.type === "short" &&
    !question.accepted.some((value) => value.trim())
  )
    return true;
  return matchesAnswer(question, typed);
}

export function reorderOptions(question: Question, order: number[]): Question {
  const correct = new Set(correctIndices(question));
  return {
    ...question,
    options: order.map((index) => question.options[index]),
    correctOption: null,
    correctOptions: order.flatMap((original, index) =>
      correct.has(original) ? [index] : [],
    ),
  };
}

export function matchesSelectedOptions(
  question: Question,
  selected: number[],
): boolean {
  const expected = new Set(correctIndices(question));
  const actual = new Set(selected);
  return (
    expected.size > 0 &&
    expected.size === actual.size &&
    [...expected].every((index) => actual.has(index))
  );
}

export function hasDuplicateOptions(question: Question): boolean {
  const options = question.options
    .map((option) => option.trim().toLocaleLowerCase().replace(/\s+/g, " "))
    .filter(Boolean);
  return new Set(options).size !== options.length;
}

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
