export type ReviewRating = "bad" | "good" | "satisfied";

// Build the next pass only after the current pass has ended.
export function pendingReviewIds(
  ids: string[],
  ratings: Record<string, ReviewRating>,
  answeredIds: string[],
): string[] {
  const answered = new Set(answeredIds);
  return ids.filter((id) => !answered.has(id) || ratings[id] !== "satisfied");
}
