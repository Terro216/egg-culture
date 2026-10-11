import { INITIATION_ANSWERS } from "../Portal/initiation.ts";

export const QUIZ_PROGRESS_KEY = "egg_initiation_progress_v1";
export const CORRECTION_FAILURES = 3;
export type QuizAnswers = Record<number, number>;
export interface QuizResult { score: number; mistakes: number[] }
export interface QuizProgress {
  version: 1;
  owner: string;
  attemptId: string;
  answers: QuizAnswers;
  review: boolean;
  correcting: number[];
  failures: string[];
}

type QuizStorage = Pick<Storage, "getItem" | "setItem" | "key" | "length">;
const validId = (id: unknown): id is string => typeof id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(id);
export const quizOwner = (account: { name: string; registered: boolean } | null) =>
  account ? account.registered ? `account:${account.name.normalize("NFKC").toLowerCase()}` : "guest" : null;
export const quizStorageKey = (owner: string) => `${QUIZ_PROGRESS_KEY}:${encodeURIComponent(owner)}`;

export function newQuizProgress(owner: string, attemptId: string): QuizProgress {
  return { version: 1, owner, attemptId, answers: {}, review: false, correcting: [], failures: [] };
}

export function evaluateQuiz(answers: QuizAnswers): QuizResult | null {
  if (INITIATION_ANSWERS.some((_, i) => !Number.isInteger(answers[i]) || answers[i] < 0 || answers[i] > 3)) return null;
  const mistakes = INITIATION_ANSWERS.flatMap((correct, i) => answers[i] === correct ? [] : [i]);
  return { score: INITIATION_ANSWERS.length - mistakes.length, mistakes };
}

export const canCorrectQuiz = (progress: QuizProgress) => progress.failures.length >= CORRECTION_FAILURES;
const mergeFailures = (...groups: string[][]) => [...new Set(groups.flat())].slice(0, CORRECTION_FAILURES);

export function failQuiz(progress: QuizProgress): QuizProgress {
  const result = evaluateQuiz(progress.answers);
  if (progress.review || !result || result.mistakes.length === 0) return progress;
  return { ...progress, review: true, correcting: [], failures: mergeFailures(progress.failures, [progress.attemptId]) };
}

export function retryQuiz(progress: QuizProgress, attemptId: string, correctOnly = false): QuizProgress {
  const result = evaluateQuiz(progress.answers);
  if (correctOnly && (!progress.review || !canCorrectQuiz(progress) || !result?.mistakes.length)) return progress;
  return {
    ...progress,
    attemptId,
    answers: correctOnly ? { ...progress.answers } : {},
    review: false,
    correcting: correctOnly ? result!.mistakes : [],
  };
}

export function parseQuizProgress(raw: string | null, owner: string): QuizProgress | null {
  try {
    const value = JSON.parse(raw ?? "null") as QuizProgress | null;
    if (!value || value.version !== 1 || value.owner !== owner || !validId(value.attemptId) ||
      typeof value.review !== "boolean" || !value.answers || typeof value.answers !== "object" || Array.isArray(value.answers) ||
      Object.entries(value.answers).some(([key, answer]) => !/^[0-9]$/.test(key) || !Number.isInteger(answer) || answer < 0 || answer > 3) ||
      !Array.isArray(value.failures) || value.failures.length > CORRECTION_FAILURES || value.failures.some(id => !validId(id)) ||
      new Set(value.failures).size !== value.failures.length ||
      !Array.isArray(value.correcting) || value.correcting.some(i => !Number.isInteger(i) || i < 0 || i >= INITIATION_ANSWERS.length) ||
      new Set(value.correcting).size !== value.correcting.length) return null;
    const result = evaluateQuiz(value.answers);
    if (value.review && (!result?.mistakes.length || value.correcting.length > 0 || !value.failures.length)) return null;
    if (value.correcting.length > 0 && (!canCorrectQuiz(value) || !result ||
      result.mistakes.some(i => !value.correcting.includes(i)))) return null;
    return value;
  } catch { return null; }
}

// Separate receipts avoid losing a failed attempt when two tabs submit together.
// Only the three receipts needed to unlock correction are retained in a draft.
function storedFailures(storage: QuizStorage, owner: string): string[] {
  const prefix = `${quizStorageKey(owner)}:failure:`;
  const failures: string[] = [];
  for (let i = 0; i < storage.length && failures.length < CORRECTION_FAILURES; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    if (validId(id) && storage.getItem(key) === "1") failures.push(id);
  }
  return failures;
}

export function loadQuizProgress(storage: QuizStorage, owner: string, attemptId: string): QuizProgress {
  try {
    const progress = parseQuizProgress(storage.getItem(quizStorageKey(owner)), owner) ?? newQuizProgress(owner, attemptId);
    return { ...progress, failures: mergeFailures(progress.failures, storedFailures(storage, owner)) };
  } catch { return newQuizProgress(owner, attemptId); }
}

export function saveQuizProgress(storage: QuizStorage, progress: QuizProgress): QuizProgress {
  let merged = progress;
  try {
    merged = { ...progress, failures: mergeFailures(progress.failures, storedFailures(storage, progress.owner)) };
    for (const id of merged.failures) storage.setItem(`${quizStorageKey(progress.owner)}:failure:${id}`, "1");
    storage.setItem(quizStorageKey(progress.owner), JSON.stringify(merged));
  } catch { /* The current tab retains its progress if storage is unavailable. */ }
  return merged;
}
