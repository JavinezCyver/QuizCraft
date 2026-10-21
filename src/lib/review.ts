export type ReviewRating = "unrated" | "bad" | "good" | "satisfied";

// After each pass, repeat unanswered, incorrect, and unsatisfied cards.
export function pendingReviewIds(
  ids: string[],
  ratings: Record<string, ReviewRating>,
  answeredIds: string[],
  correctIds: string[] = answeredIds,
): string[] {
  const answered = new Set(answeredIds);
  const correct = new Set(correctIds);
  return ids.filter(
    (id) =>
      !answered.has(id) || !correct.has(id) || ratings[id] !== "satisfied",
  );
}
