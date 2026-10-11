import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIATION_ANSWERS, validInitiationAnswers } from '../src/features/Portal/initiation.ts';
import {
  canCorrectQuiz, evaluateQuiz, failQuiz, loadQuizProgress, newQuizProgress,
  parseQuizProgress, quizOwner, quizStorageKey, retryQuiz, saveQuizProgress,
} from '../src/features/Quiz/progress.ts';
import { quizFeedback } from '../src/features/Quiz/feedback.ts';
import { readFileSync } from 'node:fs';

const complete = Object.fromEntries(INITIATION_ANSWERS.map((answer, index) => [index, answer]));
const nineCorrect = { ...complete, 6: 0 };
function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}
function failedAttempt(progress, id) {
  const next = retryQuiz(progress, id);
  return failQuiz({ ...next, answers: { ...nineCorrect } });
}

test('only the third complete failure permits correction; first two require a fresh attempt', () => {
  let progress = newQuizProgress('guest', 'attempt-1');
  for (let attempt = 1; attempt <= 3; attempt++) {
    progress = failedAttempt(progress, `attempt-${attempt}`);
    assert.equal(progress.failures.length, attempt);
    assert.equal(canCorrectQuiz(progress), attempt === 3);
    if (attempt < 3) assert.equal(retryQuiz(progress, 'correction', true), progress);
  }
  const corrected = retryQuiz(progress, 'correction', true);
  assert.deepEqual(corrected.answers, nineCorrect);
  assert.deepEqual(corrected.correcting, [6]);
  assert.equal(corrected.review, false);
  assert.equal(evaluateQuiz(corrected.answers).score, 9);
  assert.equal(validInitiationAnswers(Object.values(corrected.answers)), false);
  assert.equal(validInitiationAnswers(Object.values({ ...corrected.answers, 6: 1 })), true);
});

test('empty, incomplete, duplicate and successful submissions do not add failed attempts', () => {
  const initial = newQuizProgress('guest', 'attempt-1');
  assert.equal(evaluateQuiz({}), null);
  assert.equal(failQuiz(initial), initial);
  const partial = { ...initial, answers: { 0: 0, 1: 1 } };
  assert.equal(failQuiz(partial), partial);
  const success = { ...initial, answers: complete };
  assert.equal(failQuiz(success), success);
  const failure = failQuiz({ ...initial, answers: nineCorrect });
  assert.equal(failQuiz(failure), failure);
  assert.deepEqual(failure.failures, ['attempt-1']);
  for (const bad of [-1, 4, '1', null, 1.5]) assert.equal(evaluateQuiz({ ...complete, 0: bad }), null);
});

test('a reviewed failure survives reload without counting the same attempt twice', () => {
  const storage = memoryStorage();
  const failure = failQuiz({ ...newQuizProgress('guest', 'attempt-1'), answers: nineCorrect });
  saveQuizProgress(storage, failure);
  const restored = loadQuizProgress(storage, 'guest', 'unused');
  assert.deepEqual(restored, failure);
  assert.equal(failQuiz(restored), restored);
  const fresh = retryQuiz(restored, 'attempt-2');
  assert.deepEqual(fresh.answers, {});
  assert.equal(fresh.review, false);
  assert.deepEqual(fresh.failures, ['attempt-1']);
});

test('partial drafts, completed answers awaiting the server and correction drafts round-trip', () => {
  const storage = memoryStorage();
  const initial = newQuizProgress('guest', 'attempt-1');
  for (const answers of [{ 0: 2, 4: 1 }, complete]) {
    const draft = { ...initial, answers };
    saveQuizProgress(storage, draft);
    assert.deepEqual(loadQuizProgress(storage, 'guest', 'unused').answers, answers);
    assert.equal(loadQuizProgress(storage, 'guest', 'unused').failures.length, 0);
  }
  let failed = initial;
  for (let i = 1; i <= 3; i++) failed = failedAttempt(failed, `failure-${i}`);
  const correcting = retryQuiz(failed, 'correction', true);
  saveQuizProgress(storage, correcting);
  assert.deepEqual(loadQuizProgress(storage, 'guest', 'unused'), correcting);
});

test('guest and account histories are isolated; normalized RU/EN account identity is shared', () => {
  const storage = memoryStorage();
  const guest = quizOwner({ name: 'Visitor', registered: false });
  const alpha = quizOwner({ name: 'Alpha', registered: true });
  const beta = quizOwner({ name: 'Beta', registered: true });
  assert.equal(quizOwner(null), null);
  assert.equal(alpha, quizOwner({ name: 'ALPHA', registered: true }));
  assert.equal(alpha, quizOwner({ name: 'Ａｌｐｈａ', registered: true }));
  for (const owner of [guest, alpha]) saveQuizProgress(storage, failedAttempt(newQuizProgress(owner, 'first'), `${owner === guest ? 'guest' : 'alpha'}-failed`));
  assert.equal(loadQuizProgress(storage, guest, 'new').failures.length, 1);
  assert.equal(loadQuizProgress(storage, alpha, 'new').failures.length, 1);
  assert.equal(loadQuizProgress(storage, beta, 'new').failures.length, 0);
  const raw = storage.getItem(quizStorageKey(alpha));
  assert.equal(parseQuizProgress(raw, beta), null);
  assert.notEqual(quizStorageKey(guest), quizStorageKey(alpha));
});

test('independent failure receipts preserve simultaneous tabs and are idempotent', () => {
  const storage = memoryStorage();
  const first = failedAttempt(newQuizProgress('guest', 'a'), 'a');
  const second = failedAttempt(newQuizProgress('guest', 'b'), 'b');
  saveQuizProgress(storage, first);
  saveQuizProgress(storage, second);
  saveQuizProgress(storage, first); // An old tab must not erase the other failure.
  assert.deepEqual(new Set(loadQuizProgress(storage, 'guest', 'unused').failures), new Set(['a', 'b']));
  const third = failedAttempt(newQuizProgress('guest', 'c'), 'c');
  assert.equal(canCorrectQuiz(saveQuizProgress(storage, third)), true);
  assert.equal(loadQuizProgress(storage, 'guest', 'unused').failures.length, 3);
});

test('malformed storage is ignored and blocked storage retains a usable current attempt', () => {
  const initial = newQuizProgress('guest', 'attempt-1');
  for (const invalid of [null, '{', 'null', '{}', JSON.stringify({ ...initial, owner: 'account:alpha' }),
    JSON.stringify({ ...initial, version: 2 }), JSON.stringify({ ...initial, answers: { 10: 1 } }),
    JSON.stringify({ ...initial, answers: { 0: 4 } }), JSON.stringify({ ...initial, review: true }),
    JSON.stringify({ ...initial, correcting: [6], answers: nineCorrect }),
    JSON.stringify({ ...initial, failures: ['a', 'a'] })]) {
    assert.equal(parseQuizProgress(invalid, 'guest'), null);
  }
  const blocked = {
    get length() { throw new Error('blocked'); }, key() { throw new Error('blocked'); },
    getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); },
  };
  assert.deepEqual(loadQuizProgress(blocked, 'guest', 'attempt-1'), initial);
  const failure = failQuiz({ ...initial, answers: nineCorrect });
  assert.deepEqual(saveQuizProgress(blocked, failure), failure);
});

test('each question has bilingual feedback and an existing glossary destination', () => {
  const guide = readFileSync(new URL('../src/pages/[lang]/guide.astro', import.meta.url), 'utf8');
  assert.equal(quizFeedback.length, INITIATION_ANSWERS.length);
  for (const feedback of quizFeedback) {
    assert.ok(feedback.ru.trim());
    assert.ok(feedback.en.trim());
    assert.ok(guide.includes(`id: "${feedback.anchor}"`), feedback.anchor);
  }
});
