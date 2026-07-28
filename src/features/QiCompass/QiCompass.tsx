import React, { useState } from "react";

interface QiCompassProps {
  lang: "ru" | "en";
}

type CompassPoint = {
  id: string;
  // Ось X: −1 минеральность … +1 животность.
  // Ось Y: −1 лёгкость … +1 плотность.
  x: number;
  y: number;
  ru: { name: string; desc: string };
  en: { name: string; desc: string };
};

const POINTS: CompassPoint[] = [
  {
    id: "blanc",
    x: -0.75,
    y: -0.65,
    ru: {
      name: "Светлый Стиль (Blanc)",
      desc: "Мел, вода, чистота. Высокая минеральность при почти невесомом теле. Выстраивает Вертикаль.",
    },
    en: {
      name: "Blanc Style",
      desc: "Chalk, water, purity. High minerality with an almost weightless body. Builds the Vertical.",
    },
  },
  {
    id: "industrial",
    x: -0.2,
    y: -0.3,
    ru: {
      name: "Индустриальный Стрим",
      desc: "Предсказуемый, чистый, плоский. База для калибровки рецепторов, а не для переживания.",
    },
    en: {
      name: "Industrial Stream",
      desc: "Predictable, clean, flat. A baseline for calibrating receptors, not for experience.",
    },
  },
  {
    id: "pastoral",
    x: 0.3,
    y: -0.15,
    ru: {
      name: "Пасторальный Стиль",
      desc: "Сливки, трава, свежее масло. Гедонизм средней плотности с мягкой животной теплотой.",
    },
    en: {
      name: "Pastoral Style",
      desc: "Cream, grass, fresh butter. Medium-density hedonism with a soft animal warmth.",
    },
  },
  {
    id: "farm",
    x: 0,
    y: 0.2,
    ru: {
      name: "Фермерский Концепт",
      desc: "Зерновой прикорм, яркий «желтый» профиль. Понятная плотность без крайностей.",
    },
    en: {
      name: "Farm Concept",
      desc: "Grain feed, a bright 'yellow' profile. Legible density without extremes.",
    },
  },
  {
    id: "aged",
    x: 0.5,
    y: 0.55,
    ru: {
      name: "Архивный Стиль (Aged)",
      desc: "Выдержка 21+ день: погреб, старая бумага, глубокая сернистость. Плотное, медленное Яй Ци.",
    },
    en: {
      name: "Aged (Archive) Style",
      desc: "Aged 21+ days: cellar, old paper, deep sulfur. A dense, slow Egg Qi.",
    },
  },
  {
    id: "bouillon",
    x: 0.75,
    y: 0.8,
    ru: {
      name: "Бульонный Стиль (Bouillon)",
      desc: "Максимум умами, мясные ноты, зимняя тяжесть. Чистое Заземление.",
    },
    en: {
      name: "Bouillon Style",
      desc: "Peak umami, meaty notes, winter weight. Pure Grounding.",
    },
  },
  {
    id: "yard-wild",
    x: 0.9,
    y: 0.35,
    ru: {
      name: "Дворовый Дикий (Yard Wild)",
      desc: "Перо, сено, непредсказуемость. Предельная животность, нервные партии. Только для подготовленных.",
    },
    en: {
      name: "Yard Wild",
      desc: "Feather, hay, unpredictability. Extreme animality, nervous batches. For the prepared only.",
    },
  },
  {
    id: "void",
    x: 0,
    y: 0,
    ru: {
      name: "Пустота (The Void)",
      desc: "Начало координат. Технически безупречное яйцо, не оставляющее следа. Гастрономический тупик.",
    },
    en: {
      name: "The Void",
      desc: "The origin of coordinates. A technically flawless egg that leaves no trace. A gastronomic dead end.",
    },
  },
];

const LABELS = {
  ru: {
    top: "Плотность",
    bottom: "Легкость",
    left: "Минеральность",
    right: "Животность",
    hint: "Коснитесь точки, чтобы услышать стиль.",
  },
  en: {
    top: "Density",
    bottom: "Lightness",
    left: "Minerality",
    right: "Animality",
    hint: "Touch a point to hear the style.",
  },
};

const SIZE = 640;
const PADDING = 70;

const toSvg = (value: number) =>
  PADDING + ((value + 1) / 2) * (SIZE - PADDING * 2);

export const QiCompass: React.FC<QiCompassProps> = ({ lang }) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const labels = LABELS[lang];
  const active = POINTS.find((point) => point.id === activeId) ?? null;
  const center = SIZE / 2;

  return (
    <div className="qi-compass">
      <style>{`
        .qi-compass {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          align-items: center;
        }
        .qi-compass-svg {
          width: 100%;
          max-width: 640px;
          height: auto;
        }
        .qi-compass-axis {
          stroke: rgba(43, 43, 43, 0.25);
          stroke-width: 1;
        }
        .qi-compass-ring {
          fill: none;
          stroke: rgba(43, 43, 43, 0.08);
          stroke-width: 1;
        }
        .qi-compass-axis-label {
          font-family: var(--font-sans-ui, sans-serif);
          font-size: 13px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          fill: var(--color-text, #2b2b2b);
          opacity: 0.55;
        }
        .qi-compass-point {
          fill: rgba(212, 175, 55, 0.55);
          stroke: var(--color-yolk, #d4af37);
          stroke-width: 1.5;
          cursor: pointer;
          transition: r 0.2s ease, fill 0.2s ease;
        }
        .qi-compass-point:hover,
        .qi-compass-point.is-active {
          fill: var(--color-yolk, #d4af37);
        }
        .qi-compass-point-label {
          font-family: var(--font-serif-body, serif);
          font-size: 14px;
          fill: var(--color-text, #2b2b2b);
          opacity: 0.85;
          pointer-events: none;
        }
        .qi-compass-panel {
          max-width: 640px;
          width: 100%;
          min-height: 7rem;
          padding: 1.5rem 2rem;
          border: 1px solid var(--color-yolk, #d4af37);
          background: rgba(255, 255, 255, 0.4);
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          justify-content: center;
        }
        .qi-compass-panel h3 {
          margin: 0;
          font-family: var(--font-serif-headers, serif);
          color: var(--color-yolk, #d4af37);
          font-size: 1.4rem;
        }
        .qi-compass-panel p {
          margin: 0;
          line-height: 1.6;
          opacity: 0.9;
        }
        .qi-compass-panel .qi-compass-hint {
          font-style: italic;
          opacity: 0.6;
        }
        @media (max-width: 768px) {
          .qi-compass-point-label {
            font-size: 16px;
          }
          .qi-compass-panel {
            padding: 1rem;
          }
        }
      `}</style>

      <svg
        className="qi-compass-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={lang === "ru" ? "Компас Яй Ци" : "Egg Qi Compass"}
      >
        <circle className="qi-compass-ring" cx={center} cy={center} r={(SIZE - PADDING * 2) / 2} />
        <circle className="qi-compass-ring" cx={center} cy={center} r={(SIZE - PADDING * 2) / 4} />
        <line
          className="qi-compass-axis"
          x1={PADDING}
          y1={center}
          x2={SIZE - PADDING}
          y2={center}
        />
        <line
          className="qi-compass-axis"
          x1={center}
          y1={PADDING}
          x2={center}
          y2={SIZE - PADDING}
        />

        <text
          className="qi-compass-axis-label"
          x={center}
          y={PADDING - 28}
          textAnchor="middle"
        >
          {labels.top}
        </text>
        <text
          className="qi-compass-axis-label"
          x={center}
          y={SIZE - PADDING + 40}
          textAnchor="middle"
        >
          {labels.bottom}
        </text>
        <text
          className="qi-compass-axis-label"
          x={PADDING - 12}
          y={center}
          textAnchor="middle"
          transform={`rotate(-90 ${PADDING - 12} ${center})`}
        >
          {labels.left}
        </text>
        <text
          className="qi-compass-axis-label"
          x={SIZE - PADDING + 16}
          y={center}
          textAnchor="middle"
          transform={`rotate(90 ${SIZE - PADDING + 16} ${center})`}
        >
          {labels.right}
        </text>

        {POINTS.map((point) => {
          const cx = toSvg(point.x);
          // Плотность растет вверх: инвертируем ось Y для SVG.
          const cy = toSvg(-point.y);
          const isActive = point.id === activeId;
          return (
            <g key={point.id}>
              <circle
                className={`qi-compass-point ${isActive ? "is-active" : ""}`}
                cx={cx}
                cy={cy}
                r={isActive ? 12 : 8}
                onClick={() =>
                  setActiveId((prev) => (prev === point.id ? null : point.id))
                }
                onMouseEnter={() => setActiveId(point.id)}
              />
              <text
                className="qi-compass-point-label"
                x={cx}
                y={cy - 16}
                textAnchor="middle"
              >
                {point[lang].name.replace(/\s*\(.+\)$/, "")}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="qi-compass-panel" aria-live="polite">
        {active ? (
          <>
            <h3>{active[lang].name}</h3>
            <p>{active[lang].desc}</p>
          </>
        ) : (
          <p className="qi-compass-hint">{labels.hint}</p>
        )}
      </div>
    </div>
  );
};

export default QiCompass;
