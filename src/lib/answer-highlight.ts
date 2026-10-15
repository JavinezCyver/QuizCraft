export type AnswerPart = { text: string; matched: boolean };
const words = (value: string) => value.match(/[\p{L}\p{N}\p{M}]+/gu) || [];
const normalize = (value: string) => value.normalize("NFKC").toLowerCase();
const commonWords = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "at",
  "for",
  "is",
  "are",
]);

export function highlightAnswer(
  answer: string,
  accepted: string[],
): AnswerPart[] {
  const submittedWords = words(answer).map(normalize);
  const alternatives = accepted.map((value) => words(value).map(normalize));
  const completeMatch =
    submittedWords.length > 0 &&
    alternatives.some(
      (alternative) =>
        alternative.length === submittedWords.length &&
        alternative.every((word, i) => word === submittedWords[i]),
    );
  const expected = new Set(alternatives.flat());
  return answer
    .split(/([\p{L}\p{N}\p{M}]+)/u)
    .filter(Boolean)
    .map((text) => ({
      text,
      matched:
        expected.has(normalize(text)) &&
        (completeMatch || !commonWords.has(normalize(text))),
    }));
}
