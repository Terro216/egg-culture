// Типажи теста «Какое вы яйцо?» — общие данные для клиентского компонента
// (EggPersona.tsx) и серверного генератора og-карточек (/api/persona-og).

export type PersonaLang = "ru" | "en";

export type Persona = {
  id: string;
  x: number; // −1 минеральность … +1 животность
  y: number; // −1 легкость … +1 плотность
  ru: { name: string; epithet: string; desc: string };
  en: { name: string; epithet: string; desc: string };
};

export const PERSONAS: Persona[] = [
  {
    id: "blanc",
    x: -0.75,
    y: -0.65,
    ru: {
      name: "Светлое (Blanc)",
      epithet: "Аскеза как высшая роскошь",
      desc: "Мел, вода, вертикаль. Вы не украшаете себя — вы вычитаете лишнее. Ваше Яй Ци выстраивает позвоночник всем, кто рядом.",
    },
    en: {
      name: "Blanc",
      epithet: "Asceticism as the highest luxury",
      desc: "Chalk, water, the vertical. You do not decorate yourself — you subtract the excess. Your Egg Qi straightens the spine of everyone nearby.",
    },
  },
  {
    id: "industrial",
    x: -0.2,
    y: -0.3,
    ru: {
      name: "Индустриальный Стрим",
      epithet: "Недооцененная точность",
      desc: "Вы предсказуемы — и это ваша сила. Мир держится на тех, кто приходит вовремя. По вам калибруют рецепторы.",
    },
    en: {
      name: "Industrial Stream",
      epithet: "Underrated precision",
      desc: "You are predictable — and that is your strength. The world rests on those who arrive on time. Receptors are calibrated against you.",
    },
  },
  {
    id: "pastoral",
    x: 0.3,
    y: -0.15,
    ru: {
      name: "Пасторальное",
      epithet: "Мягкий гедонист",
      desc: "Сливки, трава, свежее масло. Вы умеете делать людям хорошо и не считаете это слабостью. Ваша теплота — животная, в лучшем смысле.",
    },
    en: {
      name: "Pastoral",
      epithet: "The gentle hedonist",
      desc: "Cream, grass, fresh butter. You know how to make people feel good and don't consider it a weakness. Your warmth is animal — in the best sense.",
    },
  },
  {
    id: "farm",
    x: 0,
    y: 0.2,
    ru: {
      name: "Фермерский Концепт",
      epithet: "Основательность без крайностей",
      desc: "Яркий «желтый» профиль, понятная плотность. Вас читают с первой страницы — и перечитывают. Это редкий дар.",
    },
    en: {
      name: "Farm Concept",
      epithet: "Groundedness without extremes",
      desc: "A bright 'yellow' profile, legible density. People read you from page one — and then reread you. A rare gift.",
    },
  },
  {
    id: "aged",
    x: 0.5,
    y: 0.55,
    ru: {
      name: "Архивное (Aged)",
      epithet: "Глубина, открывающаяся не сразу",
      desc: "Погреб, старая бумага, медленное Яй Ци. Вы раскрываетесь на 21-й день знакомства. Кто дождался — не уходит.",
    },
    en: {
      name: "Aged (Archive)",
      epithet: "Depth that opens slowly",
      desc: "Cellar, old paper, a slow Egg Qi. You open on day 21 of acquaintance. Those who wait never leave.",
    },
  },
  {
    id: "bouillon",
    x: 0.75,
    y: 0.8,
    ru: {
      name: "Бульонное (Bouillon)",
      epithet: "Чистое Заземление",
      desc: "Максимум умами, зимняя тяжесть. Рядом с вами люди перестают суетиться. Вы — точка опоры, а не украшение стола.",
    },
    en: {
      name: "Bouillon",
      epithet: "Pure Grounding",
      desc: "Peak umami, winter weight. Around you people stop fussing. You are a point of support, not a table decoration.",
    },
  },
  {
    id: "yard-wild",
    x: 0.9,
    y: 0.35,
    ru: {
      name: "Дворовое Дикое",
      epithet: "Только для подготовленных",
      desc: "Перо, сено, непредсказуемость. Вас нельзя стандартизировать, и вы этим гордитесь. Нервные партии — ваша стихия.",
    },
    en: {
      name: "Yard Wild",
      epithet: "For the prepared only",
      desc: "Feather, hay, unpredictability. You cannot be standardized, and you are proud of it. Nervous batches are your element.",
    },
  },
  {
    id: "void",
    x: 0,
    y: 0,
    ru: {
      name: "Пустота (The Void)",
      epithet: "Технически безупречны",
      desc: "Свежесть без изъяна, форма без следа. Вы всё делаете правильно — и именно это тревожит Дегустационный Совет. Найдите свой дефект.",
    },
    en: {
      name: "The Void",
      epithet: "Technically flawless",
      desc: "Freshness without flaw, form without trace. You do everything right — and that is exactly what worries the Tasting Council. Find your defect.",
    },
  },
];

export function getPersonaById(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}

export function resolvePersona(x: number, y: number): Persona {
  // Точка у начала координат — Пустота. Особый диагноз.
  if (Math.abs(x) < 0.18 && Math.abs(y) < 0.18) {
    return PERSONAS.find((p) => p.id === "void")!;
  }
  let best = PERSONAS[0];
  let bestDist = Infinity;
  for (const p of PERSONAS) {
    if (p.id === "void") continue;
    const dist = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

export const PERSONA_AXIS_LABELS = {
  ru: {
    top: "Плотность",
    bottom: "Легкость",
    left: "Минеральность",
    right: "Животность",
    header: "КАКОЕ ВЫ ЯЙЦО?",
  },
  en: {
    top: "Density",
    bottom: "Lightness",
    left: "Minerality",
    right: "Animality",
    header: "WHICH EGG ARE YOU?",
  },
};
