import React, { useState, useEffect, useRef } from "react";
import "./Quiz.css";
import { useAdept } from "../Portal/useAdept.ts";
import { usePortal } from "../Portal/PortalPresence.tsx";
import { refreshPortal, portalIdentityReady, portalState } from "../Portal/client.ts";
import { INITIATION_ANSWERS } from "../Portal/initiation.ts";
import { quizFeedback } from "./feedback.ts";
import {
  canCorrectQuiz, evaluateQuiz, failQuiz, loadQuizProgress, newQuizProgress,
  quizOwner, quizStorageKey, retryQuiz, saveQuizProgress,
  type QuizProgress,
} from "./progress.ts";
import { recordInitiation } from "../Portal/adept.ts";

const questionsRu = [
  {
    text: "1. Почему истинный Адепт никогда не дегустирует яйцо сразу из холодильника?",
    options: [
      "А) Это опасно для зубной эмали.",
      "Б) Холод блокирует липидное раскрытие желтка и делает «Яичный вдох» невозможным.",
      "В) Желток может треснуть от перепада температур.",
      "Г) Низкая температура искажает вес яйца.",
    ],
  },
  {
    text: "2. Что означает термин «Меловой след» (Chalky trail) в послевкусии?",
    options: [
      "А) Остатки скорлупы, попавшие в белок при неаккуратном вскрытии.",
      "Б) Признак избытка кальция в прикорме, считающийся дефектом.",
      "В) Специфическое ощущение сухости и минеральности, характерное для благородных белых яиц.",
      "Г) Ощущение, возникающее только при дегустации вареного вкрутую желтка.",
    ],
  },
  {
    text: "3. Какое состояние Яй Ци описывается фразой: «Взгляд становится яснее, внимание расширяется, позвоночник обретает ось»?",
    options: [
      "А) Заземляющее.",
      "Б) Поднимающее.",
      "В) Хищное.",
      "Г) Пустотное.",
    ],
  },
  {
    text: "4. В чем заключается главная ценность «Белого яйца» (Blanc Style), согласно Манифесту?",
    options: [
      "А) В его низкой стоимости и доступности для слепых тестов.",
      "Б) В аскетичной чистоте профиля и отсутствии «деревенской вульгарности».",
      "В) В повышенном содержании альбумина по сравнению с коричневыми яйцами.",
      "Г) Это маркетинговый миф, адепты предпочитают только тёмные яйца.",
    ],
  },
  {
    text: "5. Что такое «Пустотность» (The Void) в дегустационной заметке?",
    options: [
      "А) Когда внутри яйца оказался только белок без желтка.",
      "Б) Технически безупречное, свежее яйцо, которое не дает никакого энергетического отклика.",
      "В) Состояние рецепторов после употребления слишком острого соуса.",
      "Г) Яйцо с очень большой воздушной камерой (пугой).",
    ],
  },
  {
    text: "6. Как Адепт относится к «Рыбной тени» во вкусе?",
    options: [
      "А) Считает это признаком «морского терруара» и высокой ценностью.",
      "Б) Воспринимает как грубый технический дефект, вызванный перекормом птицы.",
      "В) Одобряет, если яйцо подается к белому вину.",
      "Г) Это миф, у яиц не может быть рыбного привкуса.",
    ],
  },
  {
    text: "7. Какова роль «Халазы» (белкового канатика) в Яичной Культуре?",
    options: [
      "А) Ее необходимо удалять пинцетом перед дегустацией как эстетический дефект.",
      "Б) Это маркер «витальной собранности» и структурной силы яйца.",
      "В) Она отвечает за уровень сернистости в послевкусии.",
      "Г) Это индикатор того, что яйцо было заморожено.",
    ],
  },
  {
    text: "8. На какой день выдержки яйцо обычно переходит из стадии «Юного» в стадию «Раскрывшегося/Собранного»?",
    options: [
      "А) В первые 2 часа после сбора.",
      "Б) На 3-й день.",
      "В) Между 10-м и 14-м днем.",
      "Г) После 45 дней в погребе.",
    ],
  },
  {
    text: "9. Что из перечисленного является «Яичным варварством»?",
    options: [
      "А) Дегустация яйца без соли.",
      "Б) Использование кетчупа или агрессивных специй, скрывающих происхождение продукта.",
      "В) Сравнение яиц разных пород кур.",
      "Г) Ожидание термического баланса продукта в течение 20 минут.",
    ],
  },
  {
    text: "10. Завершите цитату Манифеста: «Корм — это не просто еда для птицы, это…»",
    options: [
      "А) …статья расходов фермерского хозяйства.",
      "Б) …гарантия оранжевого цвета желтка.",
      "В) …язык будущего желтка.",
      "Г) …способ повысить питательную ценность продукта.",
    ],
  },
];

const questionsEn = [
  {
    text: "1. Why does a true Adept never taste an egg straight from the refrigerator?",
    options: [
      "A) It is dangerous for tooth enamel.",
      "B) Cold blocks the lipid unfolding of the yolk and makes the 'Egg Breath' impossible.",
      "C) The yolk may crack from the temperature difference.",
      "D) Low temperature distorts the weight of the egg.",
    ],
  },
  {
    text: "2. What does the term 'Chalky Trail' mean in the aftertaste?",
    options: [
      "A) Shell fragments that got into the white during careless opening.",
      "B) A sign of excess calcium in the feed, considered a defect.",
      "C) A specific sensation of dryness and minerality, characteristic of noble white eggs.",
      "D) A sensation that arises only when tasting a hard-boiled yolk.",
    ],
  },
  {
    text: "3. Which state of Egg Qi is described by the phrase: 'The gaze grows clearer, attention expands, the spine finds its axis'?",
    options: [
      "A) Grounding.",
      "B) Uplifting.",
      "C) Predatory.",
      "D) Void-like.",
    ],
  },
  {
    text: "4. What is the chief value of the white egg (Blanc Style), according to the Manifesto?",
    options: [
      "A) Its low cost and availability for blind tests.",
      "B) The ascetic purity of its profile and the absence of 'rustic vulgarity'.",
      "C) Its higher albumin content compared to brown eggs.",
      "D) It is a marketing myth; Adepts prefer only dark eggs.",
    ],
  },
  {
    text: "5. What is 'the Void' in a tasting note?",
    options: [
      "A) When the egg turns out to contain only white and no yolk.",
      "B) A technically flawless, fresh egg that gives no energetic response whatsoever.",
      "C) The state of the receptors after consuming a sauce that is too spicy.",
      "D) An egg with a very large air cell.",
    ],
  },
  {
    text: "6. How does an Adept regard the 'Fishy Shadow' in the taste?",
    options: [
      "A) As a sign of 'marine terroir' and of high value.",
      "B) As a gross technical defect caused by overfeeding the hen.",
      "C) With approval, if the egg is served with white wine.",
      "D) It is a myth; eggs cannot have a fishy taste.",
    ],
  },
  {
    text: "7. What is the role of the Chalaza (the protein cord) in Egg Culture?",
    options: [
      "A) It must be removed with tweezers before tasting, as an aesthetic defect.",
      "B) It is a marker of the egg's 'vital composure' and structural strength.",
      "C) It is responsible for the level of sulfur in the aftertaste.",
      "D) It is an indicator that the egg has been frozen.",
    ],
  },
  {
    text: "8. On which day of aging does an egg usually pass from the 'Young' stage to the 'Opened/Composed' stage?",
    options: [
      "A) Within the first 2 hours after collection.",
      "B) On the 3rd day.",
      "C) Between the 10th and 14th day.",
      "D) After 45 days in the cellar.",
    ],
  },
  {
    text: "9. Which of the following is 'Egg Barbarism'?",
    options: [
      "A) Tasting an egg without salt.",
      "B) Using ketchup or aggressive spices that hide the product's origin.",
      "C) Comparing eggs of different hen breeds.",
      "D) Waiting 20 minutes for the product's thermal balance.",
    ],
  },
  {
    text: "10. Complete the quote from the Manifesto: 'Feed is not just food for the bird, it is…'",
    options: [
      "A) …an expense line of the farm.",
      "B) …a guarantee of an orange yolk.",
      "C) …the language of the future yolk.",
      "D) …a way to increase the nutritional value of the product.",
    ],
  },
];

const RANKS = {
  ru: {
    perfect: "Истинный Адепт",
    good: "Полуадепт",
    lost: "Заблудший в Куполе",
    captive: "Пленник Индустриального Стрима",
    neophyte: "Неофит из супермаркета",
  },
  en: {
    perfect: "True Adept",
    good: "Half-Adept",
    lost: "Lost in the Dome",
    captive: "Captive of the Industrial Stream",
    neophyte: "Supermarket Neophyte",
  },
};

const STRINGS = {
  ru: {
    success: "Экран медленно бледнеет. Добро пожаловать. Теперь вы один из нас.",
    deniedTitle: "Доступ запрещен.",
    deniedText:
      "Вернитесь к супермаркетной полке. Ваше восприятие еще слишком фрагментарно для Истины.",
    correctLabel: "Правильно:",
    rankLabel: "Ваше звание:",
    mistakesTitle: "Ошибки в вопросах:",
    retry: "Начать заново",
    review: "Разобрать ошибку",
    selected: "Ваш ответ:",
    expected: "Верный ответ:",
    guide: "Открыть справочник",
    correctMistakes: "Исправить ошибки",
    correctionsLocked: "Исправление ошибок доступно после третьей полной неудачной попытки. Сейчас требуется пройти Инициацию заново.",
    correctionsReady: "Три полные попытки рассмотрены. Разрешено исправить ошибки, сохранив верные ответы.",
    correctionInstruction: "Исправьте отмеченные ответы. Засчитанные ответы сохранены. Допуск по-прежнему требует 10 из 10.",
    acceptedAnswer: "Ответ засчитан.",
    instruction:
      "Инструкция: Выберите один верный ответ. Для прохождения необходимо ответить правильно на все вопросы.",
    submit: "Завершить тест",
  },
  en: {
    success: "The screen slowly fades. Welcome. You are one of us now.",
    deniedTitle: "Access denied.",
    deniedText:
      "Return to the supermarket shelf. Your perception is still too fragmented for the Truth.",
    correctLabel: "Correct:",
    rankLabel: "Your rank:",
    mistakesTitle: "Mistakes in questions:",
    retry: "Start over",
    review: "Review this error",
    selected: "Your answer:",
    expected: "Correct answer:",
    guide: "Open the guide",
    correctMistakes: "Correct mistakes",
    correctionsLocked: "Correction is available after the third complete failed attempt. For now, the Initiation must be taken again in full.",
    correctionsReady: "Three complete attempts have been reviewed. You may correct your mistakes while retaining accepted answers.",
    correctionInstruction: "Correct the marked answers. Accepted answers have been retained. Admission still requires 10 out of 10.",
    acceptedAnswer: "Answer accepted.",
    instruction:
      "Instructions: choose one correct answer. To pass, you must answer every question correctly.",
    submit: "Complete the trial",
  },
};

const getRank = (lang: "ru" | "en", mistakes: number) => {
  const ranks = RANKS[lang];
  if (mistakes === 0) return ranks.perfect;
  if (mistakes <= 2) return ranks.good;
  if (mistakes <= 5) return ranks.lost;
  if (mistakes <= 8) return ranks.captive;
  return ranks.neophyte;
};

interface QuizProps {
  lang: string;
}

const getRedirectTarget = (lang: string) => {
  if (typeof window === "undefined") return `/${lang}/dark-side`;

  let storedTarget: string | null = null;
  try { storedTarget = localStorage.getItem("egg_after_quiz"); } catch { /* Storage is optional. */ }
  const defaultTarget = `/${lang}/dark-side`;

  if (!storedTarget) return defaultTarget;

  const isSafeInternalTarget =
    storedTarget.startsWith(`/${lang}/`) &&
    !storedTarget.startsWith("//") &&
    !storedTarget.includes("://");

  return isSafeInternalTarget ? storedTarget : defaultTarget;
};

export const Quiz: React.FC<QuizProps> = ({ lang }) => {
  const uiLang: "ru" | "en" = lang === "en" ? "en" : "ru";
  const questions = uiLang === "en" ? questionsEn : questionsRu;
  const s = STRINGS[uiLang];
  const adept = useAdept(), portal = usePortal();
  const owner = portalIdentityReady(portal) ? quizOwner(portal.account) : null;
  const [progress, setProgress] = useState<QuizProgress | null>(null);
  const progressRef = useRef<QuizProgress | null>(null);
  const remembered = useRef(new Map<string, QuizProgress>());
  const activeRef = useRef(true);
  const redirectRef = useRef<number | null>(null);
  const pendingFocusRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const [fading, setFading] = useState(false);
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState("");
  // Never show another identity's draft while its replacement is being loaded.
  const current = progress?.owner === owner ? progress : null;
  const answers = current?.answers ?? {};
  const result = current?.review ? evaluateQuiz(answers) : null;
  const correcting = current?.correcting ?? [];
  const correctionAllowed = current ? canCorrectQuiz(current) : false;

  const liveOwner = () => {
    const live = portalState();
    return portalIdentityReady(live) ? quizOwner(live.account) : null;
  };
  const putProgress = (next: QuizProgress) => {
    let saved = next;
    try { saved = saveQuizProgress(window.localStorage, next); } catch { /* Keep the current tab usable. */ }
    progressRef.current = saved;
    remembered.current.set(saved.owner, saved);
    setProgress(saved);
  };
  const readyProgress = () => {
    const value = progressRef.current;
    return value && value.owner === owner && liveOwner() === owner ? value : null;
  };

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      if (redirectRef.current !== null) window.clearTimeout(redirectRef.current);
    };
  }, []);

  useEffect(() => {
    if (redirectRef.current !== null) window.clearTimeout(redirectRef.current);
    savingRef.current = false;
    setSaving(false);
    setFading(false);
    setSaveError("");
    pendingFocusRef.current = null;
    if (!owner) {
      progressRef.current = null;
      setProgress(null);
      return;
    }
    let restored = remembered.current.get(owner) ?? newQuizProgress(owner, crypto.randomUUID());
    try {
      if (!remembered.current.has(owner)) restored = loadQuizProgress(window.localStorage, owner, restored.attemptId);
    } catch { /* Browser storage is optional. */ }
    progressRef.current = restored;
    remembered.current.set(owner, restored);
    setProgress(restored);

    const storageChanged = (event: StorageEvent) => {
      if (!event.key?.startsWith(`${quizStorageKey(owner)}:failure:`)) return;
      const previous = progressRef.current;
      if (!previous || previous.owner !== owner) return;
      try {
        const stored = loadQuizProgress(window.localStorage, owner, previous.attemptId);
        const failures = [...new Set([...previous.failures, ...stored.failures])].slice(0, 3);
        const next = { ...previous, failures };
        progressRef.current = next;
        remembered.current.set(owner, next);
        setProgress(next);
      } catch { /* Keep the current draft if storage becomes unavailable. */ }
    };
    window.addEventListener("storage", storageChanged);
    return () => window.removeEventListener("storage", storageChanged);
  }, [owner]);

  useEffect(() => {
    if (adept && owner && liveOwner() === owner && !fading && !saving) {
      const target = getRedirectTarget(lang);
      try { localStorage.removeItem("egg_after_quiz"); } catch { /* Navigation remains available. */ }
      window.location.href = target;
    }
  }, [adept, owner, fading, saving, lang]);

  useEffect(() => {
    const index = pendingFocusRef.current;
    if (index === null || !current || current.review) return;
    pendingFocusRef.current = null;
    const heading = document.getElementById(`quiz-question-${index}`);
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [current?.attemptId]);

  const handleSelect = (qIndex: number, aIndex: number) => {
    const previous = readyProgress();
    if (!previous || previous.review || savingRef.current ||
      (previous.correcting.length > 0 && !previous.correcting.includes(qIndex))) return;
    putProgress({ ...previous, answers: { ...previous.answers, [qIndex]: aIndex } });
    setSaveError("");
  };

  const handleSubmit = async () => {
    const previous = readyProgress();
    if (!previous || previous.review || savingRef.current || portalState().failed) return;
    const evaluated = evaluateQuiz(previous.answers);
    if (!evaluated) return; // An incomplete form is never an attempt.
    setSaveError("");
    if (evaluated.score !== questions.length) {
      putProgress(failQuiz(previous));
      return;
    }

    savingRef.current = true;
    setSaving(true);
    const submittedOwner = previous.owner;
    const stillHere = () => activeRef.current && liveOwner() === submittedOwner &&
      progressRef.current?.owner === submittedOwner && progressRef.current.attemptId === previous.attemptId;
    try {
      // Only the existing verified path can grant Initiation. Local correction
      // permission and failed-attempt receipts never grant access.
      await recordInitiation(questions.map((_, i) => previous.answers[i]));
      if (!stillHere()) return;
      setFading(true);
      redirectRef.current = window.setTimeout(() => {
        if (!stillHere()) return;
        const target = getRedirectTarget(lang);
        try { localStorage.removeItem("egg_after_quiz"); } catch { /* Navigation remains available. */ }
        window.location.href = target;
      }, 2000);
    } catch {
      if (stillHere()) setSaveError(uiLang === "ru"
        ? "Не удалось сохранить Инициацию. Ответы сохранены — повторите отправку."
        : "Could not save your Initiation. Your answers have been retained — please retry.");
    } finally {
      if (stillHere()) { savingRef.current = false; setSaving(false); }
    }
  };

  const handleRetry = (correctOnly = false) => {
    const previous = readyProgress();
    if (!previous || savingRef.current) return;
    const next = retryQuiz(previous, crypto.randomUUID(), correctOnly);
    if (next === previous) return;
    pendingFocusRef.current = correctOnly ? next.correcting[0] : 0;
    setSaveError("");
    putProgress(next);
  };

  if (fading && current) {
    return <div className="quiz-success"><p>{s.success}</p></div>;
  }

  if (result && current) {
    return (
      <div className="quiz-result" data-failed-attempts={current.failures.length}>
        <h2>{s.deniedTitle}</h2>
        <p>{s.deniedText}</p>
        <div className="result-stats">
          <p>{s.correctLabel} {result.score} / {questions.length}</p>
          <p>{s.rankLabel} <strong>{getRank(uiLang, result.mistakes.length)}</strong></p>
        </div>
        <div className="mistakes-list">
          <h3>{s.mistakesTitle}</h3>
          <ul>
            {result.mistakes.map((index) => (
              <li key={index}>
                <p className="quiz-mistake-question">{questions[index].text}</p>
                <details className="quiz-feedback">
                  <summary>{s.review}</summary>
                  <p><strong>{s.selected}</strong> {questions[index].options[answers[index]]}</p>
                  <p><strong>{s.expected}</strong> {questions[index].options[INITIATION_ANSWERS[index]]}</p>
                  <p>{quizFeedback[index][uiLang]}</p>
                  <a href={`/${uiLang}/guide#${quizFeedback[index].anchor}`}>{s.guide}</a>
                </details>
              </li>
            ))}
          </ul>
        </div>
        <p className="quiz-correction-policy">{correctionAllowed ? s.correctionsReady : s.correctionsLocked}</p>
        <div className="quiz-actions">
          {correctionAllowed && (
            <button className="btn quiz-btn" data-action="correct-mistakes" onClick={() => handleRetry(true)}>{s.correctMistakes}</button>
          )}
          <button className={`btn quiz-btn${correctionAllowed ? " btn-secondary" : ""}`} data-action="start-over" onClick={() => handleRetry()}>{s.retry}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-container" data-ready={Boolean(current)} data-correcting={correcting.length > 0}>
      {saveError && <p role="alert">{saveError}</p>}
      {portal.failed && <p role="alert">{uiLang === "ru" ? "Не удалось проверить профиль. Ответы остаются на странице." : "Could not check your account. Your answers remain on this page."} <button type="button" className="btn btn-link" onClick={() => void refreshPortal()}>{uiLang === "ru" ? "Повторить" : "Retry"}</button></p>}
      <p className="quiz-instruction">{correcting.length > 0 ? s.correctionInstruction : s.instruction}</p>
      {questions.map((q, qIndex) => {
        const accepted = correcting.length > 0 && !correcting.includes(qIndex);
        const needsCorrection = correcting.includes(qIndex);
        return (
          <div key={qIndex} className={`quiz-question${needsCorrection ? " quiz-question-correction" : ""}`} data-question-index={qIndex} data-accepted={accepted}>
            <h3 id={`quiz-question-${qIndex}`} tabIndex={-1}>{q.text}</h3>
            {accepted && <p className="quiz-answer-accepted">{s.acceptedAnswer}</p>}
            <div className="quiz-options" role="radiogroup" aria-labelledby={`quiz-question-${qIndex}`}>
              {q.options.map((opt, oIndex) => (
                <label key={oIndex} className="quiz-option">
                  <input type="radio" name={`question-${qIndex}`} checked={answers[qIndex] === oIndex}
                    disabled={!current || saving || accepted} onChange={() => handleSelect(qIndex, oIndex)} />
                  <span className="quiz-option-text">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <button className="btn quiz-btn" onClick={handleSubmit} aria-busy={saving} disabled={saving || !current || portal.failed || !evaluateQuiz(answers)}>
        {s.submit}
      </button>
    </div>
  );
};
