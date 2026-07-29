import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  PERSONAS,
  getPersonaById,
  resolvePersona,
  type Persona,
} from "./personaData";

// Тест «Какое вы яйцо?»: ответы сдвигают точку по осям Компаса Яй Ци
// (минеральность ↔ животность, легкость ↔ плотность), результат —
// ближайший стиль из Справочника + карточка для шеринга (canvas → PNG).
// Данные типажей — в personaData.ts (общие с /api/persona-og).

interface EggPersonaProps {
  lang: "ru" | "en";
}

type Delta = { x: number; y: number };

type Question = {
  ru: string;
  en: string;
  options: { ru: string; en: string; d: Delta }[];
};

const QUESTIONS: Question[] = [
  {
    ru: "Ваше идеальное утро начинается с…",
    en: "Your ideal morning begins with…",
    options: [
      { ru: "Стакана минеральной воды и тишины", en: "A glass of mineral water and silence", d: { x: -0.9, y: -0.7 } },
      { ru: "Ритуала: кофе, тот же час, та же чашка", en: "A ritual: coffee, same hour, same cup", d: { x: -0.3, y: -0.1 } },
      { ru: "Плотного завтрака без спешки", en: "A hearty breakfast, unhurried", d: { x: 0.6, y: 0.8 } },
      { ru: "Того, что подвернется. Каждый день — иначе", en: "Whatever comes. Every day is different", d: { x: 0.9, y: 0.2 } },
    ],
  },
  {
    ru: "Выберите пейзаж:",
    en: "Choose a landscape:",
    options: [
      { ru: "Меловые скалы над холодным морем", en: "Chalk cliffs over a cold sea", d: { x: -1, y: -0.4 } },
      { ru: "Луг после дождя, пахнет травой", en: "A meadow after rain, smelling of grass", d: { x: 0.4, y: -0.3 } },
      { ru: "Старый погреб со стеллажами", en: "An old cellar lined with shelves", d: { x: 0.5, y: 0.9 } },
      { ru: "Задний двор, где всё живое и шумит", en: "A backyard where everything is alive and loud", d: { x: 1, y: 0.3 } },
    ],
  },
  {
    ru: "В споре вы…",
    en: "In an argument you…",
    options: [
      { ru: "Молчите. Чистота не спорит", en: "Stay silent. Purity does not argue", d: { x: -0.8, y: -0.8 } },
      { ru: "Приводите проверенные аргументы", en: "Bring verified arguments", d: { x: -0.4, y: 0.1 } },
      { ru: "Давите весом. Медленно и неотвратимо", en: "Press with weight. Slowly and inevitably", d: { x: 0.7, y: 1 } },
      { ru: "Непредсказуемы. Даже для себя", en: "Are unpredictable. Even to yourself", d: { x: 0.9, y: 0.1 } },
    ],
  },
  {
    ru: "Ваш звук:",
    en: "Your sound:",
    options: [
      { ru: "Одна нота, длящаяся минуту", en: "One note held for a minute", d: { x: -0.9, y: -0.6 } },
      { ru: "Виолончель в подземелье", en: "A cello in a dungeon", d: { x: 0.3, y: 0.7 } },
      { ru: "Гул рынка ранним утром", en: "The hum of a market at dawn", d: { x: 0.8, y: 0.4 } },
      { ru: "Ровный белый шум", en: "Steady white noise", d: { x: -0.1, y: -0.2 } },
    ],
  },
  {
    ru: "Что вы цените в людях?",
    en: "What do you value in people?",
    options: [
      { ru: "Сдержанность и вертикаль", en: "Restraint and the vertical", d: { x: -0.8, y: -0.5 } },
      { ru: "Теплоту и мягкость", en: "Warmth and softness", d: { x: 0.5, y: -0.2 } },
      { ru: "Глубину, которая открывается не сразу", en: "Depth that opens slowly", d: { x: 0.4, y: 0.8 } },
      { ru: "Дикость. Настоящее не бывает ручным", en: "Wildness. The real is never tame", d: { x: 1, y: 0.4 } },
    ],
  },
  {
    ru: "Ваш рабочий стол:",
    en: "Your desk:",
    options: [
      { ru: "Пустой. Совсем", en: "Empty. Completely", d: { x: -0.9, y: -0.9 } },
      { ru: "Всё по местам, ничего лишнего", en: "Everything in place, nothing extra", d: { x: -0.3, y: 0 } },
      { ru: "Слои. Археология проектов", en: "Layers. An archaeology of projects", d: { x: 0.5, y: 0.9 } },
      { ru: "Хаос, в котором вы всё находите", en: "Chaos in which you find everything", d: { x: 0.8, y: 0.3 } },
    ],
  },
  {
    ru: "Чего вы боитесь больше всего?",
    en: "What do you fear most?",
    options: [
      { ru: "Вульгарности", en: "Vulgarity", d: { x: -0.9, y: -0.4 } },
      { ru: "Не оставить следа", en: "Leaving no trace", d: { x: 0.2, y: 0.5 } },
      { ru: "Спешки", en: "Haste", d: { x: 0.4, y: 0.9 } },
      { ru: "Клетки", en: "The cage", d: { x: 1, y: 0.2 } },
    ],
  },
];

const STRINGS = {
  ru: {
    progress: "Вопрос",
    of: "из",
    resultLabel: "Ваш стиль",
    download: "Сохранить карточку",
    share: "Поделиться",
    shareText: "Я —",
    linkCopied: "Ссылка скопирована — отправьте её миру.",
    retake: "Пройти заново",
    cardHeader: "КАКОЕ ВЫ ЯЙЦО?",
    axisTop: "Плотность",
    axisBottom: "Легкость",
    axisLeft: "Минеральность",
    axisRight: "Животность",
    site: "egg.ilyamedve.dev",
  },
  en: {
    progress: "Question",
    of: "of",
    resultLabel: "Your style",
    download: "Save the card",
    share: "Share",
    shareText: "I am",
    linkCopied: "Link copied — send it into the world.",
    retake: "Retake",
    cardHeader: "WHICH EGG ARE YOU?",
    axisTop: "Density",
    axisBottom: "Lightness",
    axisLeft: "Minerality",
    axisRight: "Animality",
    site: "egg.ilyamedve.dev",
  },
};

// ————— Карточка результата (1080×1350, под сторис и ленту) —————

const CARD_W = 1080;
const CARD_H = 1350;

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (ctx.measureText(probe).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCard(
  canvas: HTMLCanvasElement,
  persona: Persona,
  point: { x: number; y: number },
  lang: "ru" | "en",
) {
  const s = STRINGS[lang];
  const ctx = canvas.getContext("2d")!;
  canvas.width = CARD_W;
  canvas.height = CARD_H;

  // Фон-скорлупа
  ctx.fillStyle = "#f0ead6";
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const grad = ctx.createRadialGradient(
    CARD_W / 2, CARD_H / 2, 100, CARD_W / 2, CARD_H / 2, 1000,
  );
  grad.addColorStop(0, "rgba(255,255,255,0.3)");
  grad.addColorStop(1, "rgba(170, 140, 70, 0.14)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Рамка
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, CARD_W - 72, CARD_H - 72);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(52, 52, CARD_W - 104, CARD_H - 104);

  ctx.textAlign = "center";

  // Шапка
  ctx.font = "600 30px 'Playfair Display', serif";
  ctx.fillStyle = "#b8963a";
  const spaced = "EGG CULTURE".split("").join("  ");
  ctx.fillText(spaced, CARD_W / 2, 128);
  ctx.font = "italic 34px 'Lora', serif";
  ctx.fillStyle = "#6b5a2a";
  ctx.fillText(s.cardHeader, CARD_W / 2, 182);

  // Компас
  const cx = CARD_W / 2;
  const cy = 500;
  const R = 240;

  ctx.strokeStyle = "rgba(43,43,43,0.1)";
  ctx.lineWidth = 1.5;
  for (const r of [R, R / 2]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(43,43,43,0.25)";
  ctx.beginPath();
  ctx.moveTo(cx - R, cy);
  ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R);
  ctx.lineTo(cx, cy + R);
  ctx.stroke();

  // Подписи осей
  ctx.font = "20px 'Lora', serif";
  ctx.fillStyle = "rgba(43,43,43,0.5)";
  ctx.fillText(s.axisTop.toUpperCase(), cx, cy - R - 20);
  ctx.fillText(s.axisBottom.toUpperCase(), cx, cy + R + 40);
  ctx.textAlign = "left";
  ctx.fillText(s.axisRight.toUpperCase(), cx + R + 16, cy + 7);
  ctx.textAlign = "right";
  ctx.fillText(s.axisLeft.toUpperCase(), cx - R - 16, cy + 7);
  ctx.textAlign = "center";

  // Остальные стили — бледные точки
  for (const p of PERSONAS) {
    if (p.id === persona.id) continue;
    ctx.beginPath();
    ctx.arc(cx + p.x * R, cy - p.y * R, 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(43,43,43,0.15)";
    ctx.fill();
  }

  // Точка результата с сиянием
  const px = cx + point.x * R;
  const py = cy - point.y * R;
  const glow = ctx.createRadialGradient(px, py, 2, px, py, 46);
  glow.addColorStop(0, "rgba(212, 175, 55, 0.8)");
  glow.addColorStop(1, "rgba(212, 175, 55, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(px, py, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px, py, 13, 0, Math.PI * 2);
  ctx.fillStyle = "#d4af37";
  ctx.fill();
  ctx.strokeStyle = "#8b6914";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Результат
  const content = persona[lang];
  ctx.fillStyle = "rgba(43,43,43,0.55)";
  ctx.font = "24px 'Lora', serif";
  ctx.fillText(s.resultLabel.toUpperCase(), CARD_W / 2, 850);

  ctx.fillStyle = "#8b6914";
  let nameSize = 76;
  ctx.font = `600 ${nameSize}px 'Playfair Display', serif`;
  while (ctx.measureText(content.name).width > CARD_W - 160 && nameSize > 40) {
    nameSize -= 4;
    ctx.font = `600 ${nameSize}px 'Playfair Display', serif`;
  }
  ctx.fillText(content.name, CARD_W / 2, 935);

  ctx.fillStyle = "#6b5a2a";
  ctx.font = "italic 34px 'Lora', serif";
  ctx.fillText(content.epithet, CARD_W / 2, 995);

  ctx.fillStyle = "#2b2b2b";
  ctx.font = "28px 'Lora', serif";
  const lines = wrapText(ctx, content.desc, CARD_W - 220);
  lines.forEach((line, i) => {
    ctx.fillText(line, CARD_W / 2, 1070 + i * 42);
  });

  // Футер
  ctx.fillStyle = "rgba(43,43,43,0.4)";
  ctx.font = "22px 'Lora', serif";
  ctx.fillText(s.site, CARD_W / 2, CARD_H - 76);
}

// ————— Компонент —————

export const EggPersona: React.FC<EggPersonaProps> = ({ lang }) => {
  const s = STRINGS[lang];
  const [answers, setAnswers] = useState<number[]>([]);
  const [preset, setPreset] = useState<Persona | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cardReady, setCardReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const step = answers.length;
  const finished = step >= QUESTIONS.length;

  // Заход по шерённой ссылке (?result=id) сразу показывает результат.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("result");
    if (!id) return;
    const persona = getPersonaById(id);
    if (persona) setPreset(persona);
  }, []);

  const result = useMemo(() => {
    if (preset) {
      return { persona: preset, point: { x: preset.x, y: preset.y } };
    }
    if (!finished) return null;
    let x = 0;
    let y = 0;
    answers.forEach((optIndex, qIndex) => {
      const d = QUESTIONS[qIndex].options[optIndex].d;
      x += d.x;
      y += d.y;
    });
    x /= QUESTIONS.length;
    y /= QUESTIONS.length;
    // Слегка растягиваем к краям: средние значения скучны.
    const stretch = (v: number) => Math.max(-1, Math.min(1, v * 1.35));
    const px = stretch(x);
    const py = stretch(y);
    return { persona: resolvePersona(px, py), point: { x: px, y: py } };
  }, [answers, finished, preset]);

  // Результат фиксируется в URL — шерённая ссылка отдаст SSR og:image.
  useEffect(() => {
    if (!result) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("result") !== result.persona.id) {
      url.searchParams.set("result", result.persona.id);
      window.history.replaceState(null, "", url);
    }
  }, [result]);

  const pick = (optIndex: number) => {
    const next = [...answers, optIndex];
    setAnswers(next);
    if (next.length === QUESTIONS.length) {
      (window as any).plausible?.("Egg Persona");
    }
  };

  // Карточка рисуется, когда canvas уже в DOM (после появления результата).
  useEffect(() => {
    if (!result || !canvasRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        await Promise.all([
          document.fonts.load("600 76px 'Playfair Display'"),
          document.fonts.load("italic 34px 'Lora'"),
          document.fonts.load("28px 'Lora'"),
        ]);
      } catch {
        // рисуем как есть
      }
      if (cancelled || !canvasRef.current) return;
      drawCard(canvasRef.current, result.persona, result.point, lang);
      setCardReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [result, lang]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    const a = document.createElement("a");
    a.download = `egg-persona-${result.persona.id}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  // Шерим ссылку, а не файл: в мессенджерах она развернется
  // серверной og-карточкой (/api/persona-og). Файл — через «Сохранить».
  const share = async () => {
    if (!result) return;
    const url = window.location.href;
    const content = result.persona[lang];
    const text = `${s.shareText} ${content.name}. ${content.epithet}.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: s.cardHeader, text, url });
      } catch {
        // пользователь отменил — молчим
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard недоступен — ничего страшного
    }
  };

  const retake = () => {
    setAnswers([]);
    setPreset(null);
    setCardReady(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("result");
    window.history.replaceState(null, "", url);
  };

  const showResult = result !== null;
  const question = showResult ? null : QUESTIONS[step];

  return (
    <div className="egg-persona">
      <style>{`
        .egg-persona {
          max-width: 680px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          align-items: stretch;
        }
        .egg-persona-progress {
          text-align: center;
          font-family: var(--font-sans-ui, sans-serif);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-size: 0.8rem;
          opacity: 0.6;
        }
        .egg-persona-bar {
          height: 3px;
          background: rgba(212, 175, 55, 0.2);
        }
        .egg-persona-bar > span {
          display: block;
          height: 100%;
          background: var(--color-yolk, #d4af37);
          transition: width 0.4s ease;
        }
        .egg-persona-question {
          font-family: var(--font-serif-headers, serif);
          color: var(--color-yolk, #d4af37);
          font-size: 1.8rem;
          text-align: center;
          margin: 0;
        }
        .egg-persona-option {
          border: 1px solid rgba(212, 175, 55, 0.5);
          background: rgba(255, 255, 255, 0.35);
          padding: 1rem 1.5rem;
          font-family: var(--font-serif-body, serif);
          font-size: 1.1rem;
          text-align: left;
          transition: all 0.25s ease;
        }
        .egg-persona-option:hover {
          background: var(--color-yolk, #d4af37);
          color: var(--color-shell, #f0ead6);
          border-color: var(--color-yolk, #d4af37);
        }
        .egg-persona-result-title {
          text-align: center;
          margin: 0;
          font-size: 2.4rem;
        }
        .egg-persona-epithet {
          text-align: center;
          font-style: italic;
          opacity: 0.75;
          margin: 0;
        }
        .egg-persona-desc {
          text-align: center;
          margin: 0;
        }
        .egg-persona-canvas {
          width: 100%;
          max-width: 480px;
          height: auto;
          margin: 0 auto;
          border: 1px solid rgba(212, 175, 55, 0.4);
          box-shadow: 0 16px 48px rgba(43, 43, 43, 0.18);
        }
        .egg-persona-actions {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          justify-content: center;
        }
      `}</style>

      {!showResult && question && (
        <>
          <p className="egg-persona-progress">
            {s.progress} {step + 1} {s.of} {QUESTIONS.length}
          </p>
          <div className="egg-persona-bar">
            <span style={{ width: `${(step / QUESTIONS.length) * 100}%` }} />
          </div>
          <h3 className="egg-persona-question">{question[lang]}</h3>
          <div className="flex-col gap-md">
            {question.options.map((opt, i) => (
              <button
                key={i}
                className="egg-persona-option"
                onClick={() => pick(i)}
              >
                {opt[lang]}
              </button>
            ))}
          </div>
        </>
      )}

      {showResult && result && (
        <>
          <p className="egg-persona-progress">{s.resultLabel}</p>
          <h2 className="egg-persona-result-title">
            {result.persona[lang].name}
          </h2>
          <p className="egg-persona-epithet">{result.persona[lang].epithet}</p>
          <p className="egg-persona-desc">{result.persona[lang].desc}</p>

          <canvas
            ref={canvasRef}
            className="egg-persona-canvas"
            style={{ display: cardReady ? "block" : "none" }}
          />

          <div className="egg-persona-actions">
            <button className="btn" onClick={() => void share()}>
              {s.share}
            </button>
            <button className="btn" onClick={download}>
              {s.download}
            </button>
            <button
              className="btn"
              style={{ opacity: 0.6 }}
              onClick={retake}
            >
              {s.retake}
            </button>
          </div>
          {copied && (
            <p className="egg-persona-epithet" aria-live="polite">
              {s.linkCopied}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default EggPersona;
