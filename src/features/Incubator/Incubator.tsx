import React, { useEffect, useMemo, useRef, useState } from "react";

// Инкубатор: тамагочи Яичной Культуры. Яйцо не вылупляется — оно созревает.
// Ежедневный ритуал прогрева (удержание ладони), стрики, ранги,
// «Холодильный Ожог» за пропуск и Пустота за неделю забвения.

interface IncubatorProps {
  lang: "ru" | "en";
}

interface IncubatorState {
  startedAt: string; // день закладки, YYYY-MM-DD (локально)
  lastWarm: string; // последний день прогрева
  streak: number;
  qi: number; // накопленное Яй Ци текущего яйца
  burns: number; // перенесенные холодильные ожоги
  totalWarmed: number; // прогревов за всё время, включая прошлые яйца
}

const STORAGE_KEY = "egg_incubator_v1";
const HOLD_MS = 2600;
const VOID_AFTER_DAYS = 7; // столько дней забвения поглощают яйцо

function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Обе даты — локальные YYYY-MM-DD; Date.parse трактует их как UTC-полночь,
// поэтому разница всегда кратна целым суткам.
function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function loadState(): IncubatorState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.startedAt !== "string") return null;
    return parsed as IncubatorState;
  } catch {
    return null;
  }
}

function saveState(state: IncubatorState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // приватный режим — яйцо живет одну сессию
  }
}

const RANKS = [
  { minStreak: 30, ru: "Иерофант Яй Ци", en: "Hierophant of Egg Qi" },
  { minStreak: 14, ru: "Архонт Желтка", en: "Archon of the Yolk" },
  { minStreak: 7, ru: "Смотритель Тепла", en: "Warden of Warmth" },
  { minStreak: 3, ru: "Хранитель Купола", en: "Keeper of the Dome" },
  { minStreak: 0, ru: "Послушник Кладки", en: "Novice of the Clutch" },
];

const STAGES = [
  { minQi: 21, ru: "Архивное", en: "Archive" },
  { minQi: 10, ru: "Раскрывшееся", en: "Opened" },
  { minQi: 3, ru: "Собирающееся", en: "Gathering" },
  { minQi: 0, ru: "Юное", en: "Young" },
];

const MEDITATIONS = {
  ru: [
    "Яйцо слышит ваше тепло.",
    "Купол крепнет в тишине.",
    "Халаза держит ось. Держите и вы.",
    "Сегодня белок учится молчанию.",
    "Выдержка — это диалог без слов.",
    "Тепло ладони — язык, понятный желтку.",
    "Не торопите. Созревание нельзя ускорить, его можно лишь не прервать.",
  ],
  en: [
    "The egg hears your warmth.",
    "The Dome strengthens in silence.",
    "The chalaza holds the axis. So should you.",
    "Today the albumen practices silence.",
    "Aging is a dialogue without words.",
    "The warmth of a palm is a language the yolk understands.",
    "Do not rush. Ripening cannot be hastened — only left unbroken.",
  ],
};

const STRINGS = {
  ru: {
    layTitle: "Кладка пуста",
    layText:
      "Заложите яйцо и возвращайтесь каждый день, чтобы прогреть его теплом ладони. Пропустите день — получите Холодильный Ожог. Забудете на неделю — яйцо заберет Пустота.",
    layBtn: "Заложить яйцо",
    holdHint: "Держите ладонь на скорлупе…",
    warmBtn: "Прогреть яйцо",
    warmedToday: "Яйцо прогрето. Возвращайтесь завтра — тепло не терпит жадности.",
    burnTitle: "Холодильный Ожог",
    burnText: (d: number) =>
      `Вы отсутствовали ${d} ${d === 1 ? "день" : d < 5 ? "дня" : "дней"}. Скорлупа помнит холод: серия прервана, часть Яй Ци утрачена.`,
    rewarmBtn: "Отогреть яйцо",
    voidTitle: "Пустота поглотила кладку",
    voidText:
      "Неделя без тепла — и яйцо перестало оставлять след. Это не смерть: это Пустота. Начните заново — уже зная цену.",
    dayOfAging: "День выдержки",
    streak: "Серия тепла",
    qi: "Яй Ци",
    rank: "Ранг",
    stage: "Стадия",
    burnsLabel: "Ожоги",
    daysUnit: "дн.",
    perfected:
      "Яйцо не вылупится. Оно уже совершенно — и совершенствуется дальше.",
  },
  en: {
    layTitle: "The clutch is empty",
    layText:
      "Lay an egg and return every day to warm it with your palm. Miss a day — a Freezer Burn. Forget for a week — the Void takes the egg.",
    layBtn: "Lay an egg",
    holdHint: "Hold your palm on the shell…",
    warmBtn: "Warm the egg",
    warmedToday: "The egg is warmed. Return tomorrow — warmth tolerates no greed.",
    burnTitle: "Freezer Burn",
    burnText: (d: number) =>
      `You were away for ${d} ${d === 1 ? "day" : "days"}. The shell remembers the cold: the streak is broken, some Egg Qi is lost.`,
    rewarmBtn: "Rewarm the egg",
    voidTitle: "The Void has taken the clutch",
    voidText:
      "A week without warmth — and the egg stopped leaving a trace. This is not death: this is the Void. Begin again, knowing the price.",
    dayOfAging: "Day of aging",
    streak: "Warmth streak",
    qi: "Egg Qi",
    rank: "Rank",
    stage: "Stage",
    burnsLabel: "Burns",
    daysUnit: "d.",
    perfected: "The egg will not hatch. It is already perfect — and keeps perfecting.",
  },
};

function pickRank(streak: number, lang: "ru" | "en") {
  return RANKS.find((r) => streak >= r.minStreak)![lang];
}

function pickStage(qi: number, lang: "ru" | "en") {
  return STAGES.find((s) => qi >= s.minQi)![lang];
}

// Детерминированные крапинки: позиция i-й крапинки не меняется между визитами.
function speckle(i: number) {
  const a = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  const b = Math.sin(i * 269.5 + 183.3) * 28001.8384;
  const fx = a - Math.floor(a);
  const fy = b - Math.floor(b);
  // Эллиптическое распределение внутри скорлупы
  const angle = fx * Math.PI * 2;
  const rad = 0.25 + fy * 0.6;
  return {
    x: 150 + Math.cos(angle) * 85 * rad,
    y: 200 + Math.sin(angle) * 120 * rad,
    r: 1.6 + ((i * 7) % 5) * 0.5,
  };
}

type Mode = "loading" | "lay" | "ready" | "warmedToday" | "burned" | "void";

export const Incubator: React.FC<IncubatorProps> = ({ lang }) => {
  const s = STRINGS[lang];
  const [state, setState] = useState<IncubatorState | null>(null);
  const [mode, setMode] = useState<Mode>("loading");
  const [missedDays, setMissedDays] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0);
  const [justWarmed, setJustWarmed] = useState(false);
  const holdRaf = useRef<number | null>(null);
  const holdStart = useRef(0);

  useEffect(() => {
    const st = loadState();
    if (!st) {
      setMode("lay");
      return;
    }
    setState(st);
    const today = dayKey();
    if (st.lastWarm === today) {
      setMode("warmedToday");
      return;
    }
    const missed = daysBetween(st.lastWarm, today) - 1;
    if (missed >= VOID_AFTER_DAYS) {
      setMode("void");
      setMissedDays(missed);
    } else if (missed >= 1) {
      setMode("burned");
      setMissedDays(missed);
    } else {
      setMode("ready");
    }
  }, []);

  const meditation = useMemo(() => {
    const idx = daysBetween("2026-01-01", dayKey()) % MEDITATIONS[lang].length;
    return MEDITATIONS[lang][(idx + MEDITATIONS[lang].length) % MEDITATIONS[lang].length];
  }, [lang]);

  const layEgg = () => {
    const today = dayKey();
    const fresh: IncubatorState = {
      startedAt: today,
      lastWarm: today,
      streak: 1,
      qi: 1,
      burns: 0,
      totalWarmed: (state?.totalWarmed ?? 0) + 1,
    };
    saveState(fresh);
    setState(fresh);
    setMode("warmedToday");
    setJustWarmed(true);
    (window as any).plausible?.("Incubator Lay");
  };

  const completeWarm = () => {
    if (!state) return;
    const today = dayKey();
    const isBurn = mode === "burned";
    const next: IncubatorState = {
      ...state,
      lastWarm: today,
      // Ожог: серия начинается заново, холод съедает по 2 Ци за день пропуска.
      streak: isBurn ? 1 : state.streak + 1,
      qi: Math.max(1, (isBurn ? state.qi - missedDays * 2 : state.qi) + 1),
      burns: state.burns + (isBurn ? 1 : 0),
      totalWarmed: state.totalWarmed + 1,
    };
    saveState(next);
    setState(next);
    setMode("warmedToday");
    setJustWarmed(true);
    if (typeof navigator !== "undefined") navigator.vibrate?.(120);
    (window as any).plausible?.("Incubator Warm", {
      props: { streak: String(next.streak) },
    });
  };

  const cancelHold = () => {
    if (holdRaf.current) {
      cancelAnimationFrame(holdRaf.current);
      holdRaf.current = null;
    }
    setHoldProgress(0);
  };

  const beginHold = () => {
    holdStart.current = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - holdStart.current) / HOLD_MS);
      setHoldProgress(p);
      if (p >= 1) {
        holdRaf.current = null;
        setHoldProgress(0);
        completeWarm();
        return;
      }
      holdRaf.current = requestAnimationFrame(tick);
    };
    holdRaf.current = requestAnimationFrame(tick);
  };

  useEffect(() => cancelHold, []);

  const qi = state?.qi ?? 0;
  const agingDays = state ? daysBetween(state.startedAt, dayKey()) + 1 : 0;
  const glow = Math.min(1, qi / 30);
  const speckleCount = qi >= 3 ? Math.min(24, qi) : 0;
  const showAura = (state?.streak ?? 0) >= 14 || qi >= 21;
  const frosted = mode === "burned" || mode === "void";
  const isVoid = mode === "void";

  const canHold = mode === "ready" || mode === "burned";

  return (
    <div className="incubator">
      <style>{`
        .incubator {
          max-width: 560px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          align-items: center;
          text-align: center;
        }
        .incubator-egg-wrap {
          position: relative;
          width: min(300px, 70vw);
        }
        .incubator-egg {
          width: 100%;
          height: auto;
          user-select: none;
          -webkit-user-select: none;
          touch-action: none;
        }
        .incubator-egg.is-alive {
          animation: incubator-pulse 4s ease-in-out infinite;
        }
        .incubator-egg.is-warming {
          animation: incubator-pulse 1.2s ease-in-out infinite;
        }
        @keyframes incubator-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.015); }
        }
        .incubator-meditation {
          font-style: italic;
          opacity: 0.7;
          margin: 0;
        }
        .incubator-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem 2rem;
          justify-content: center;
          font-family: var(--font-sans-ui, sans-serif);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-size: 0.8rem;
        }
        .incubator-stats b {
          display: block;
          font-family: var(--font-serif-headers, serif);
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--color-yolk, #d4af37);
          letter-spacing: normal;
          text-transform: none;
        }
        .incubator-hold-btn {
          position: relative;
          overflow: hidden;
          min-width: 260px;
        }
        .incubator-hold-btn .fill {
          position: absolute;
          inset: 0;
          background: var(--color-yolk, #d4af37);
          transform-origin: left center;
          opacity: 0.35;
          pointer-events: none;
        }
        .incubator-hold-btn .label {
          position: relative;
        }
        .incubator-note {
          margin: 0;
          opacity: 0.8;
        }
        .incubator-burn {
          border: 1px solid rgba(100, 140, 200, 0.5);
          background: rgba(120, 160, 220, 0.08);
          padding: 1rem 1.5rem;
        }
        .incubator-burn h3 {
          color: #5a7ba6;
          margin: 0 0 0.5rem;
        }
        .incubator-void h3 {
          color: #2b2b2b;
          opacity: 0.6;
          margin: 0 0 0.5rem;
        }
      `}</style>

      {mode === "lay" || mode === "void" ? (
        <>
          {isVoid && (
            <div className="incubator-void">
              <h3>{s.voidTitle}</h3>
              <p className="incubator-note">{s.voidText}</p>
            </div>
          )}
          {mode === "lay" && (
            <div>
              <h3 style={{ margin: "0 0 0.5rem" }}>{s.layTitle}</h3>
              <p className="incubator-note">{s.layText}</p>
            </div>
          )}
          <EggSvg qi={0} glow={0} speckleCount={0} aura={false} frosted={isVoid} empty />
          <button className="btn" onClick={layEgg}>
            {s.layBtn}
          </button>
        </>
      ) : (
        <>
          <div className="incubator-egg-wrap">
            <EggSvg
              qi={qi}
              glow={justWarmed ? Math.min(1, glow + 0.25) : glow}
              speckleCount={speckleCount}
              aura={showAura}
              frosted={frosted}
              warming={holdProgress > 0}
              alive={mode === "warmedToday"}
            />
          </div>

          {mode === "burned" && (
            <div className="incubator-burn">
              <h3>{s.burnTitle}</h3>
              <p className="incubator-note">{s.burnText(missedDays)}</p>
            </div>
          )}

          {canHold && (
            <button
              className="btn incubator-hold-btn"
              onPointerDown={(e) => {
                e.preventDefault();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                beginHold();
              }}
              onPointerUp={cancelHold}
              onPointerCancel={cancelHold}
              onPointerLeave={cancelHold}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span
                className="fill"
                style={{ transform: `scaleX(${holdProgress})` }}
              />
              <span className="label">
                {holdProgress > 0
                  ? s.holdHint
                  : mode === "burned"
                    ? s.rewarmBtn
                    : s.warmBtn}
              </span>
            </button>
          )}

          {mode === "warmedToday" && (
            <p className="incubator-note">{s.warmedToday}</p>
          )}

          <p className="incubator-meditation">
            {qi >= 30 ? s.perfected : meditation}
          </p>

          {state && (
            <div className="incubator-stats">
              <span>
                {s.dayOfAging}
                <b>{agingDays}</b>
              </span>
              <span>
                {s.streak}
                <b>
                  {state.streak} {s.daysUnit}
                </b>
              </span>
              <span>
                {s.qi}
                <b>{state.qi}</b>
              </span>
              <span>
                {s.stage}
                <b>{pickStage(state.qi, lang)}</b>
              </span>
              <span>
                {s.rank}
                <b>{pickRank(state.streak, lang)}</b>
              </span>
              {state.burns > 0 && (
                <span>
                  {s.burnsLabel}
                  <b>{state.burns}</b>
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ————— SVG яйца —————

interface EggSvgProps {
  qi: number;
  glow: number; // 0..1
  speckleCount: number;
  aura: boolean;
  frosted: boolean;
  warming?: boolean;
  alive?: boolean;
  empty?: boolean;
}

const EggSvg: React.FC<EggSvgProps> = ({
  qi,
  glow,
  speckleCount,
  aura,
  frosted,
  warming,
  alive,
  empty,
}) => {
  const speckles = Array.from({ length: speckleCount }, (_, i) => speckle(i));
  // Скорлупа теплеет по мере созревания.
  const shellWarmth = Math.min(1, qi / 30);
  const shell = frosted
    ? "#dfe4ea"
    : `hsl(${44 - shellWarmth * 6}, ${38 + shellWarmth * 18}%, ${88 - shellWarmth * 6}%)`;

  return (
    <svg
      viewBox="0 0 300 400"
      className={`incubator-egg ${alive ? "is-alive" : ""} ${warming ? "is-warming" : ""}`}
      role="img"
      aria-label="Egg"
    >
      <defs>
        <radialGradient id="incubator-glow" cx="50%" cy="55%" r="55%">
          <stop offset="0%" stopColor="#d4af37" stopOpacity={0.55 * glow} />
          <stop offset="60%" stopColor="#d4af37" stopOpacity={0.18 * glow} />
          <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="incubator-shine" cx="38%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {aura && (
        <>
          <circle cx="150" cy="205" r="150" fill="none" stroke="#d4af37" strokeOpacity="0.25" strokeWidth="1.5" />
          <circle cx="150" cy="205" r="170" fill="none" stroke="#d4af37" strokeOpacity="0.12" strokeWidth="1" />
        </>
      )}

      {glow > 0 && <ellipse cx="150" cy="210" rx="140" ry="170" fill="url(#incubator-glow)" />}

      <path
        d="M150 35
           C 215 35 250 125 250 215
           C 250 300 205 360 150 360
           C 95 360 50 300 50 215
           C 50 125 85 35 150 35 Z"
        fill={shell}
        stroke={frosted ? "#aab6c6" : "rgba(43,43,43,0.25)"}
        strokeWidth="2"
        opacity={empty ? 0.35 : 1}
        strokeDasharray={empty ? "6 6" : undefined}
      />

      {!empty && (
        <path
          d="M150 35
             C 215 35 250 125 250 215
             C 250 300 205 360 150 360
             C 95 360 50 300 50 215
             C 50 125 85 35 150 35 Z"
          fill="url(#incubator-shine)"
        />
      )}

      {speckles.map((sp, i) => (
        <circle
          key={i}
          cx={sp.x}
          cy={sp.y}
          r={sp.r}
          fill="rgba(120, 95, 40, 0.28)"
        />
      ))}

      {frosted && !empty && (
        // Иней ожога
        <g stroke="#8fb0d9" strokeWidth="1.5" strokeLinecap="round" opacity="0.8">
          <path d="M95 140 l18 10 M104 134 l0 22 M113 140 l-18 10" />
          <path d="M195 250 l16 9 M203 245 l0 19 M211 250 l-16 9" />
          <path d="M130 300 l14 8 M137 296 l0 17 M144 300 l-14 8" />
        </g>
      )}
    </svg>
  );
};

export default Incubator;
