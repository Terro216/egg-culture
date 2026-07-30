import React, { useState, useEffect } from "react";
import "./Quiz.css";

const questionsRu = [
  {
    text: "1. Почему истинный Адепт никогда не дегустирует яйцо сразу из холодильника?",
    options: [
      "А) Это опасно для зубной эмали.",
      "Б) Холод блокирует липидное раскрытие желтка и делает «Яичный вдох» невозможным.",
      "В) Желток может треснуть от перепада температур.",
      "Г) Низкая температура искажает вес яйца.",
    ],
    correct: 1,
  },
  {
    text: "2. Что означает термин «Меловой след» (Chalky trail) в послевкусии?",
    options: [
      "А) Остатки скорлупы, попавшие в белок при неаккуратном вскрытии.",
      "Б) Признак избытка кальция в прикорме, считающийся дефектом.",
      "В) Специфическое ощущение сухости и минеральности, характерное для благородных белых яиц.",
      "Г) Ощущение, возникающее только при дегустации вареного вкрутую желтка.",
    ],
    correct: 2,
  },
  {
    text: "3. Какое состояние Яй Ци описывается фразой: «Взгляд становится яснее, внимание расширяется, позвоночник обретает ось»?",
    options: [
      "А) Заземляющее.",
      "Б) Поднимающее.",
      "В) Хищное.",
      "Г) Пустотное.",
    ],
    correct: 1,
  },
  {
    text: "4. В чем заключается главная ценность «Белого яйца» (Blanc Style), согласно Манифесту?",
    options: [
      "А) В его низкой стоимости и доступности для слепых тестов.",
      "Б) В аскетичной чистоте профиля и отсутствии «деревенской вульгарности».",
      "В) В повышенном содержании альбумина по сравнению с коричневыми яйцами.",
      "Г) Это маркетинговый миф, адепты предпочитают только тёмные яйца.",
    ],
    correct: 1,
  },
  {
    text: "5. Что такое «Пустотность» (The Void) в дегустационной заметке?",
    options: [
      "А) Когда внутри яйца оказался только белок без желтка.",
      "Б) Технически безупречное, свежее яйцо, которое не дает никакого энергетического отклика.",
      "В) Состояние рецепторов после употребления слишком острого соуса.",
      "Г) Яйцо с очень большой воздушной камерой (пугой).",
    ],
    correct: 1,
  },
  {
    text: "6. Как Адепт относится к «Рыбной тени» во вкусе?",
    options: [
      "А) Считает это признаком «морского терруара» и высокой ценностью.",
      "Б) Воспринимает как грубый технический дефект, вызванный перекормом птицы.",
      "В) Одобряет, если яйцо подается к белому вину.",
      "Г) Это миф, у яиц не может быть рыбного привкуса.",
    ],
    correct: 1,
  },
  {
    text: "7. Какова роль «Халазы» (белкового канатика) в Яичной Культуре?",
    options: [
      "А) Ее необходимо удалять пинцетом перед дегустацией как эстетический дефект.",
      "Б) Это маркер «витальной собранности» и структурной силы яйца.",
      "В) Она отвечает за уровень сернистости в послевкусии.",
      "Г) Это индикатор того, что яйцо было заморожено.",
    ],
    correct: 1,
  },
  {
    text: "8. На какой день выдержки яйцо обычно переходит из стадии «Юного» в стадию «Раскрывшегося/Собранного»?",
    options: [
      "А) В первые 2 часа после сбора.",
      "Б) На 3-й день.",
      "В) Между 10-м и 14-м днем.",
      "Г) После 45 дней в погребе.",
    ],
    correct: 2,
  },
  {
    text: "9. Что из перечисленного является «Яичным варварством»?",
    options: [
      "А) Дегустация яйца без соли.",
      "Б) Использование кетчупа или агрессивных специй, скрывающих происхождение продукта.",
      "В) Сравнение яиц разных пород кур.",
      "Г) Ожидание термического баланса продукта в течение 20 минут.",
    ],
    correct: 1,
  },
  {
    text: "10. Завершите цитату Манифеста: «Корм — это не просто еда для птицы, это…»",
    options: [
      "А) …статья расходов фермерского хозяйства.",
      "Б) …гарантия оранжевого цвета желтка.",
      "В) …язык будущего желтка.",
      "Г) …способ повысить питательную ценность продукта.",
    ],
    correct: 2,
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
    correct: 1,
  },
  {
    text: "2. What does the term 'Chalky Trail' mean in the aftertaste?",
    options: [
      "A) Shell fragments that got into the white during careless opening.",
      "B) A sign of excess calcium in the feed, considered a defect.",
      "C) A specific sensation of dryness and minerality, characteristic of noble white eggs.",
      "D) A sensation that arises only when tasting a hard-boiled yolk.",
    ],
    correct: 2,
  },
  {
    text: "3. Which state of Egg Qi is described by the phrase: 'The gaze grows clearer, attention expands, the spine finds its axis'?",
    options: [
      "A) Grounding.",
      "B) Uplifting.",
      "C) Predatory.",
      "D) Void-like.",
    ],
    correct: 1,
  },
  {
    text: "4. What is the chief value of the white egg (Blanc Style), according to the Manifesto?",
    options: [
      "A) Its low cost and availability for blind tests.",
      "B) The ascetic purity of its profile and the absence of 'rustic vulgarity'.",
      "C) Its higher albumin content compared to brown eggs.",
      "D) It is a marketing myth; Adepts prefer only dark eggs.",
    ],
    correct: 1,
  },
  {
    text: "5. What is 'the Void' in a tasting note?",
    options: [
      "A) When the egg turns out to contain only white and no yolk.",
      "B) A technically flawless, fresh egg that gives no energetic response whatsoever.",
      "C) The state of the receptors after consuming a sauce that is too spicy.",
      "D) An egg with a very large air cell.",
    ],
    correct: 1,
  },
  {
    text: "6. How does an Adept regard the 'Fishy Shadow' in the taste?",
    options: [
      "A) As a sign of 'marine terroir' and of high value.",
      "B) As a gross technical defect caused by overfeeding the hen.",
      "C) With approval, if the egg is served with white wine.",
      "D) It is a myth; eggs cannot have a fishy taste.",
    ],
    correct: 1,
  },
  {
    text: "7. What is the role of the Chalaza (the protein cord) in Egg Culture?",
    options: [
      "A) It must be removed with tweezers before tasting, as an aesthetic defect.",
      "B) It is a marker of the egg's 'vital composure' and structural strength.",
      "C) It is responsible for the level of sulfur in the aftertaste.",
      "D) It is an indicator that the egg has been frozen.",
    ],
    correct: 1,
  },
  {
    text: "8. On which day of aging does an egg usually pass from the 'Young' stage to the 'Opened/Composed' stage?",
    options: [
      "A) Within the first 2 hours after collection.",
      "B) On the 3rd day.",
      "C) Between the 10th and 14th day.",
      "D) After 45 days in the cellar.",
    ],
    correct: 2,
  },
  {
    text: "9. Which of the following is 'Egg Barbarism'?",
    options: [
      "A) Tasting an egg without salt.",
      "B) Using ketchup or aggressive spices that hide the product's origin.",
      "C) Comparing eggs of different hen breeds.",
      "D) Waiting 20 minutes for the product's thermal balance.",
    ],
    correct: 1,
  },
  {
    text: "10. Complete the quote from the Manifesto: 'Feed is not just food for the bird, it is…'",
    options: [
      "A) …an expense line of the farm.",
      "B) …a guarantee of an orange yolk.",
      "C) …the language of the future yolk.",
      "D) …a way to increase the nutritional value of the product.",
    ],
    correct: 2,
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

  const storedTarget = localStorage.getItem("egg_after_quiz");
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
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{
    score: number;
    mistakes: number[];
  } | null>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isAdept = localStorage.getItem("egg_adept");
      if (isAdept === "true") {
        const target = getRedirectTarget(lang);
        localStorage.removeItem("egg_after_quiz");
        window.location.href = target;
      }
    }
  }, [lang]);

  const handleSelect = (qIndex: number, aIndex: number) => {
    setAnswers((prev) => ({ ...prev, [qIndex]: aIndex }));
  };

  const handleSubmit = () => {
    let score = 0;
    const mistakes: number[] = [];
    questions.forEach((q, i) => {
      if (answers[i] === q.correct) {
        score++;
      } else {
        mistakes.push(i);
      }
    });

    if (score === questions.length) {
      setFading(true);
      setTimeout(() => {
        if (typeof window !== "undefined") {
          localStorage.setItem("egg_adept", "true");
          const target = getRedirectTarget(lang);
          localStorage.removeItem("egg_after_quiz");
          window.location.href = target;
        }
      }, 2000);
    } else {
      setResult({ score, mistakes });
    }
  };

  const handleRetry = () => {
    setAnswers({});
    setResult(null);
  };

  if (fading) {
    return (
      <div className="quiz-success">
        <p>{s.success}</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="quiz-result">
        <h2>{s.deniedTitle}</h2>
        <p>{s.deniedText}</p>
        <div className="result-stats">
          <p>
            {s.correctLabel} {result.score} / {questions.length}
          </p>
          <p>
            {s.rankLabel} <strong>{getRank(uiLang, result.mistakes.length)}</strong>
          </p>
        </div>

        {result.mistakes.length > 0 && (
          <div className="mistakes-list">
            <h3>{s.mistakesTitle}</h3>
            <ul>
              {result.mistakes.map((mIndex) => (
                <li key={mIndex}>{questions[mIndex].text}</li>
              ))}
            </ul>
          </div>
        )}

        <button className="quiz-btn" onClick={handleRetry}>
          {s.retry}
        </button>
      </div>
    );
  }

  return (
    <div className="quiz-container">
      <p className="quiz-instruction">{s.instruction}</p>
      {questions.map((q, qIndex) => (
        <div key={qIndex} className="quiz-question">
          <h3>{q.text}</h3>
          <div className="quiz-options">
            {q.options.map((opt, oIndex) => (
              <label key={oIndex} className="quiz-option">
                <input
                  type="radio"
                  name={`question-${qIndex}`}
                  checked={answers[qIndex] === oIndex}
                  onChange={() => handleSelect(qIndex, oIndex)}
                />
                <span className="quiz-option-text">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <button
        className="quiz-btn"
        onClick={handleSubmit}
        disabled={Object.keys(answers).length !== questions.length}
      >
        {s.submit}
      </button>
    </div>
  );
};
