import React, { useState, useEffect } from "react";
import "./Quiz.css";

const questions = [
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

const getRank = (mistakes: number) => {
  if (mistakes === 0) return "Истинный Адепт";
  if (mistakes <= 2) return "Полуадепт";
  if (mistakes <= 5) return "Заблудший в Куполе";
  if (mistakes <= 8) return "Пленник Индустриального Стрима";
  return "Неофит из супермаркета";
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
        <p>Экран медленно бледнеет. Добро пожаловать. Теперь вы один из нас.</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="quiz-result">
        <h2>Доступ запрещен.</h2>
        <p>
          Вернитесь к супермаркетной полке. Ваше восприятие еще слишком
          фрагментарно для Истины.
        </p>
        <div className="result-stats">
          <p>
            Правильно: {result.score} / {questions.length}
          </p>
          <p>
            Ваше звание: <strong>{getRank(result.mistakes.length)}</strong>
          </p>
        </div>

        {result.mistakes.length > 0 && (
          <div className="mistakes-list">
            <h3>Ошибки в вопросах:</h3>
            <ul>
              {result.mistakes.map((mIndex) => (
                <li key={mIndex}>{questions[mIndex].text}</li>
              ))}
            </ul>
          </div>
        )}

        <button className="quiz-btn" onClick={handleRetry}>
          Начать заново
        </button>
      </div>
    );
  }

  return (
    <div className="quiz-container">
      <p className="quiz-instruction">
        Инструкция: Выберите один верный ответ. Для прохождения необходимо
        ответить правильно на все вопросы.
      </p>
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
        Завершить тест
      </button>
    </div>
  );
};
