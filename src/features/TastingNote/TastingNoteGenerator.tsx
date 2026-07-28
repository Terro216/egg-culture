import React, { useMemo, useState } from "react";

interface TastingNoteGeneratorProps {
  lang: "ru" | "en";
}

type Option = {
  id: string;
  label: { ru: string; en: string };
  fragment: { ru: string; en: string };
};

type Category = {
  id: string;
  title: { ru: string; en: string };
  options: Option[];
};

const CATEGORIES: Category[] = [
  {
    id: "origin",
    title: { ru: "Происхождение партии", en: "Origin of the batch" },
    options: [
      {
        id: "industrial",
        label: { ru: "Индустриальный Стрим", en: "Industrial Stream" },
        fragment: {
          ru: "Партия Индустриального Стрима — ровная, откалиброванная, без иллюзий",
          en: "A batch of the Industrial Stream — even, calibrated, without illusions",
        },
      },
      {
        id: "farm",
        label: { ru: "Фермерский Концепт", en: "Farm Concept" },
        fragment: {
          ru: "Фермерский Концепт с честным зерновым прикормом",
          en: "A Farm Concept with honest grain feed",
        },
      },
      {
        id: "yard",
        label: { ru: "Дворовый Дикий", en: "Yard Wild" },
        fragment: {
          ru: "Дворовый Дикий — партия нервная, с нотами пера и сена",
          en: "Yard Wild — a nervous batch with notes of feather and hay",
        },
      },
      {
        id: "microlot",
        label: { ru: "Микролот", en: "Micro-batch" },
        fragment: {
          ru: "Микролот ранней кладки, собранный с вниманием к каждой форме",
          en: "An early-laying micro-batch, gathered with attention to every form",
        },
      },
    ],
  },
  {
    id: "attack",
    title: { ru: "Атака", en: "Attack" },
    options: [
      {
        id: "creamy",
        label: { ru: "Сливочная", en: "Creamy" },
        fragment: {
          ru: "Атака сливочная, обволакивающая небо без спешки",
          en: "The attack is creamy, coating the palate without haste",
        },
      },
      {
        id: "mineral",
        label: { ru: "Минеральная", en: "Mineral" },
        fragment: {
          ru: "Атака минеральная, с меловым нажатием",
          en: "The attack is mineral, with a chalky press",
        },
      },
      {
        id: "aggressive",
        label: { ru: "Агрессивная", en: "Aggressive" },
        fragment: {
          ru: "Атака агрессивная — яйцо не просит внимания, а требует его",
          en: "The attack is aggressive — the egg does not ask for attention, it demands it",
        },
      },
    ],
  },
  {
    id: "body",
    title: { ru: "Тело", en: "Body" },
    options: [
      {
        id: "light",
        label: { ru: "Легкое", en: "Light" },
        fragment: {
          ru: "тело легкое, как рисовый отвар",
          en: "the body is light, like rice water",
        },
      },
      {
        id: "silky",
        label: { ru: "Шелковистое", en: "Silky" },
        fragment: {
          ru: "тело шелковистое, среднее, держит форму разговора",
          en: "the body is silky, medium, holding the shape of the conversation",
        },
      },
      {
        id: "pasty",
        label: { ru: "Пастозное", en: "Pasty" },
        fragment: {
          ru: "тело пастозное — рецепторы работают на пределе",
          en: "the body is pasty — the receptors work at their limit",
        },
      },
    ],
  },
  {
    id: "finish",
    title: { ru: "Финиш", en: "Finish" },
    options: [
      {
        id: "short",
        label: { ru: "Короткий", en: "Short" },
        fragment: {
          ru: "Финиш короткий, честный: сказал и замолчал",
          en: "The finish is short and honest: it spoke and fell silent",
        },
      },
      {
        id: "chalky",
        label: { ru: "Меловой", en: "Chalky" },
        fragment: {
          ru: "Финиш меловой — сухость высокой минеральности остается на языке",
          en: "The finish is chalky — the dryness of high minerality lingers on the tongue",
        },
      },
      {
        id: "long",
        label: { ru: "Километровый", en: "Kilometer-long" },
        fragment: {
          ru: "Финиш километровый: белково-минеральный шлейф не отпускает",
          en: "The finish is kilometer-long: the protein-mineral trail refuses to let go",
        },
      },
    ],
  },
  {
    id: "qi",
    title: { ru: "Яй Ци", en: "Egg Qi" },
    options: [
      {
        id: "vertical",
        label: { ru: "Вертикаль", en: "Verticality" },
        fragment: {
          ru: "Яй Ци выстраивает Вертикаль — взгляд яснее, осанка прямее",
          en: "The Egg Qi builds the Vertical — the gaze clearer, the posture straighter",
        },
      },
      {
        id: "grounding",
        label: { ru: "Заземление", en: "Grounding" },
        fragment: {
          ru: "Яй Ци дает Заземление — тихую телесную собранность",
          en: "The Egg Qi grants Grounding — a quiet bodily composure",
        },
      },
      {
        id: "vibration",
        label: { ru: "Вибрация", en: "Vibration" },
        fragment: {
          ru: "Яй Ци вибрирует — сернистое покалывание выдает дикий характер",
          en: "The Egg Qi vibrates — a sulfurous tingling betrays a wild character",
        },
      },
      {
        id: "void",
        label: { ru: "Пустота", en: "The Void" },
        fragment: {
          ru: "Яй Ци отсутствует: перед нами Пустота, и не стоит путать ее с деликатностью",
          en: "The Egg Qi is absent: before us is the Void, and one must not mistake it for delicacy",
        },
      },
    ],
  },
];

const CLOSINGS = {
  ru: [
    "Партия заслуживает второй встречи.",
    "Рекомендовано к утренней медитации.",
    "Записано для памяти. Без памяти нет традиции.",
    "Кетчуп к этой партии был бы преступлением.",
  ],
  en: [
    "The batch deserves a second meeting.",
    "Recommended for morning meditation.",
    "Recorded for memory. Without memory there is no tradition.",
    "Ketchup with this batch would be a crime.",
  ],
};

const UI = {
  ru: {
    generate: "Составить заметку",
    copy: "Скопировать",
    copied: "Скопировано",
    placeholder: "Выберите дескрипторы — заметка сложится сама.",
  },
  en: {
    generate: "Compose the note",
    copy: "Copy",
    copied: "Copied",
    placeholder: "Choose the descriptors — the note will compose itself.",
  },
};

function buildNote(
  lang: "ru" | "en",
  selection: Record<string, string>,
): string | null {
  const picked = CATEGORIES.map((category) => {
    const optionId = selection[category.id];
    return category.options.find((option) => option.id === optionId) ?? null;
  });
  if (picked.some((option) => option === null)) return null;

  const [origin, attack, body, finish, qi] = picked as Option[];
  // Детерминированный афоризм: одинаковый набор дескрипторов — одинаковая заметка.
  const hash = Object.values(selection)
    .join("|")
    .split("")
    .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 997, 7);
  const closing = CLOSINGS[lang][hash % CLOSINGS[lang].length];

  if (lang === "ru") {
    return `${origin.fragment.ru}. ${attack.fragment.ru}; ${body.fragment.ru}. ${finish.fragment.ru}. ${qi.fragment.ru}. ${closing}`;
  }
  return `${origin.fragment.en}. ${attack.fragment.en}; ${body.fragment.en}. ${finish.fragment.en}. ${qi.fragment.en}. ${closing}`;
}

export const TastingNoteGenerator: React.FC<TastingNoteGeneratorProps> = ({
  lang,
}) => {
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const note = useMemo(() => buildNote(lang, selection), [lang, selection]);
  const ui = UI[lang];

  const select = (categoryId: string, optionId: string) => {
    setCopied(false);
    setSelection((prev) => ({ ...prev, [categoryId]: optionId }));
  };

  const copyNote = async () => {
    if (!note) return;
    try {
      await navigator.clipboard.writeText(note);
      setCopied(true);
    } catch {
      // Clipboard может быть недоступен (http, старый браузер) — молчим,
      // текст можно выделить руками.
    }
  };

  return (
    <div className="tasting-note">
      <style>{`
        .tasting-note {
          max-width: 700px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .tasting-note-category {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .tasting-note-category > p {
          margin: 0;
          font-weight: 600;
        }
        .tasting-note-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .tasting-note-chip {
          padding: 0.5rem 1rem;
          font-size: 0.95rem;
          font-family: var(--font-sans-ui, sans-serif);
          border: 1px solid var(--color-yolk, #d4af37);
          background: transparent;
          color: var(--color-text, #2b2b2b);
          cursor: pointer;
          transition: all 0.25s ease;
        }
        .tasting-note-chip.is-active {
          background: var(--color-yolk, #d4af37);
          color: var(--color-shell, #F0EAD6);
        }
        .tasting-note-result {
          padding: 2rem;
          border: 1px dashed var(--color-yolk, #d4af37);
          background: rgba(212, 175, 55, 0.08);
          font-family: var(--font-serif-body, serif);
          font-size: 1.15rem;
          line-height: 1.8;
          font-style: italic;
          min-height: 6rem;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
        }
        .tasting-note-result.is-empty {
          opacity: 0.55;
        }
        .tasting-note-copy {
          align-self: center;
          padding: 0.75rem 2rem;
          font-family: var(--font-sans-ui, sans-serif);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          border: 1px solid var(--color-yolk, #d4af37);
          background: var(--color-yolk, #d4af37);
          color: var(--color-shell, #F0EAD6);
          cursor: pointer;
          transition: opacity 0.25s ease;
        }
        .tasting-note-copy:disabled {
          opacity: 0.4;
          cursor: default;
        }
      `}</style>

      {CATEGORIES.map((category) => (
        <div className="tasting-note-category" key={category.id}>
          <p>{category.title[lang]}</p>
          <div className="tasting-note-chips">
            {category.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`tasting-note-chip ${
                  selection[category.id] === option.id ? "is-active" : ""
                }`}
                onClick={() => select(category.id, option.id)}
              >
                {option.label[lang]}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className={`tasting-note-result ${note ? "" : "is-empty"}`}>
        {note ?? ui.placeholder}
      </div>

      <button
        type="button"
        className="tasting-note-copy"
        onClick={() => void copyNote()}
        disabled={!note}
      >
        {copied ? ui.copied : ui.copy}
      </button>
    </div>
  );
};

export default TastingNoteGenerator;
