export const INITIATION_ANSWERS = [1, 2, 1, 1, 1, 1, 1, 2, 1, 2] as const;
export function validInitiationAnswers(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === INITIATION_ANSWERS.length && value.every((answer, i) => answer === INITIATION_ANSWERS[i]);
}
