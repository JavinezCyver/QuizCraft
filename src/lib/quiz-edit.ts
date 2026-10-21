import type { Quiz } from "./api";

// Compare against the version the editor actually displayed, inside the save
// transaction. An unchanged field must never replace another tab's newer edit.
export function mergeQuizEdits(
  current: Quiz,
  edited: Quiz,
  base: Quiz,
  preferEdited = false,
): Quiz {
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  const merge = <T>(before: T, next: T, stored: T, field: string): T => {
    if (same(before, next)) return stored;
    if (preferEdited || same(before, stored) || same(next, stored)) return next;
    throw new Error(
      `The ${field} changed in another tab. Your edits are still here. Copy them before reopening this quiz to use the latest version.`,
    );
  };
  const result = { ...current };
  for (const field of [
    "title",
    "description",
    "category",
    "difficulty",
    "theme",
    "cover",
    "status",
    "visibility",
    "questions",
  ] as const) {
    Object.assign(result, {
      [field]: merge(base[field], edited[field], current[field], field),
    });
  }
  result.settings = { ...current.settings };
  for (const field of Object.keys(
    edited.settings,
  ) as (keyof Quiz["settings"])[]) {
    Object.assign(result.settings, {
      [field]: merge(
        base.settings[field],
        edited.settings[field],
        current.settings[field],
        "study settings",
      ),
    });
  }
  return result;
}
