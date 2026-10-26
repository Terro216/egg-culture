import { useAdept } from "../Portal/useAdept.ts";
import React, { useEffect, useRef, useState } from "react";
import type { KladkaVisibility } from "../../shared/utils/kladkaStore.ts";

// Форма Книги Кладки: писать могут только адепты (прошедшие квиз).
// Запись уходит на премодерацию Хранителю Книги (Telegram-бот).

interface KladkaFormProps {
  lang: "ru" | "en";
}

const STYLES = {
  ru: [
    "Светлый Стиль (Blanc)",
    "Индустриальный Стрим",
    "Пасторальный Стиль",
    "Фермерский Концепт",
    "Архивный Стиль (Aged)",
    "Бульонный Стиль",
    "Дворовый Дикий",
    "Пустота (The Void)",
  ],
  en: [
    "Blanc Style",
    "Industrial Stream",
    "Pastoral Style",
    "Farm Concept",
    "Aged (Archive) Style",
    "Bouillon Style",
    "Yard Wild",
    "The Void",
  ],
};

const STRINGS = {
  ru: {
    gateTitle: "Оставлять записи могут только адепты",
    gateText:
      "Чтобы оставить запись, нужно пройти Инициацию. Книга не терпит случайных рук.",
    gateBtn: "Пройти Инициацию",
    namePlaceholder: "Имя адепта (необязательно)",
    textPlaceholder:
      "Что было на завтрак? Партия, текстура, Яй Ци, обстоятельства тишины…",
    styleLabel: "Стиль партии (необязательно)",
    styleNone: "— без стиля —",
    visibilityLabel: "Кто увидит запись",
    visibilityPublic: "Для всех",
    visibilityAdepts: "Только адептам",
    visibilityHint: "Неофиты увидят заглушку с приглашением пройти Инициацию.",
    photoBtn: "Приложить фотографию",
    photoChange: "Заменить фотографию",
    submit: "Оставить запись",
    submitting: "Запись ложится в Книгу…",
    moderation: "Записи проходят через руки Хранителя Книги и появляются после одобрения.",
    counter: (n: number, max: number) => `${n} / ${max}`,
    errorGeneric: "Книга не приняла запись. Попробуйте позже.",
    errorImageSize: "Фотография тяжелее 5 МБ.",
    saved: "Запись легла в Книгу.",
    pending: "Запись сохранена для Хранителя Книги. Она появится после одобрения.",
    errors: {
      invalid_body: "Книга не распознала запись. Проверьте текст и фотографию.",
      invalid_visibility: "Выберите, кто увидит запись.",
      rate_limit: "Слишком много попыток. Подождите минуту.",
      empty: "Запись пуста: нужен текст или фотография.",
      text_length: "Книга принимает до 500 знаков.",
      too_large: "Фотография тяжелее 5 МБ.",
      image_format: "Книга принимает только JPEG, PNG, WebP или GIF.",
      daily_limit: "Три записи в день — предел. Тепло не терпит жадности.",
      unavailable: "Книга временно недоступна. Попробуйте позже.",
      busy: "Книга занята. Попробуйте немного позже.",
      timeout: "Загрузка заняла слишком много времени. Попробуйте ещё раз.",
    },
  },
  en: {
    gateTitle: "Only Adepts may leave entries",
    gateText:
      "To leave an entry you must pass the Initiation. The Book tolerates no random hands.",
    gateBtn: "Pass the Initiation",
    namePlaceholder: "Adept's name (optional)",
    textPlaceholder:
      "What was for breakfast? The batch, the texture, the Egg Qi, the circumstances of silence…",
    styleLabel: "Batch style (optional)",
    styleNone: "— no style —",
    visibilityLabel: "Who can see this entry",
    visibilityPublic: "Everyone",
    visibilityAdepts: "Adepts only",
    visibilityHint: "Neophytes will see an invitation to pass the Initiation.",
    photoBtn: "Attach a photograph",
    photoChange: "Replace the photograph",
    submit: "Leave an entry",
    submitting: "The entry is settling into the Book…",
    moderation: "Entries pass through the hands of the Keeper of the Book and appear after approval.",
    counter: (n: number, max: number) => `${n} / ${max}`,
    errorGeneric: "The Book did not accept the entry. Try again later.",
    errorImageSize: "The photograph is heavier than 5 MB.",
    saved: "The entry has settled into the Book.",
    pending: "The entry has been saved for the Keeper of the Book. It will appear after approval.",
    errors: {
      invalid_body: "The Book could not read the entry. Check the text and photograph.",
      invalid_visibility: "Choose who can see this entry.",
      rate_limit: "Too many attempts. Please wait a minute.",
      empty: "The entry is empty: add text or a photograph.",
      text_length: "The Book accepts up to 500 characters.",
      too_large: "The photograph is heavier than 5 MB.",
      image_format: "The Book accepts only JPEG, PNG, WebP or GIF.",
      daily_limit: "Three entries a day is the limit. Warmth does not tolerate greed.",
      unavailable: "The Book is temporarily unavailable. Try again later.",
      busy: "The Book is busy. Please try again shortly.",
      timeout: "The upload took too long. Please try again.",
    },
  },
};

const TEXT_MAX = 500;
const IMAGE_MAX = 5 * 1024 * 1024;

// Черновик из Генератора Дегустационных Заметок («Оставить в Книге»).
const DRAFT_KEY = "kladka_draft";

export const KladkaForm: React.FC<KladkaFormProps> = ({ lang }) => {
  const s = STRINGS[lang];
  const isAdept = useAdept();
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [style, setStyle] = useState("");
  const [visibility, setVisibility] = useState<KladkaVisibility>("public");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAdept) return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      sessionStorage.removeItem(DRAFT_KEY);
      const draft = JSON.parse(raw) as { text?: string; style?: string };
      if (draft.text) setText(draft.text.slice(0, TEXT_MAX));
      if (draft.style && STYLES[lang].includes(draft.style)) {
        setStyle(draft.style);
      }
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      // Битый черновик — просто открываем чистую форму.
    }
  }, [lang, isAdept]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const goToQuiz = () => {
    try { localStorage.setItem("egg_after_quiz", `/${lang}/kladka`); } catch { /* Navigation remains available. */ }
    window.location.href = `/${lang}/quiz`;
  };

  const pickFile = (picked: File | null) => {
    if (picked && picked.size > IMAGE_MAX) {
      setNotice(s.errorImageSize);
      return;
    }
    setNotice(null);
    setFile(picked);
  };

  const submit = async () => {
    if (busy || (!text.trim() && !file)) return;
    setBusy(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("text", text);
      form.append("visibility", visibility);
      if (style) form.append("style", style);
      if (file) form.append("image", file);
      const res = await fetch("/api/kladka-post", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice(typeof data?.error === "string" && Object.hasOwn(s.errors, data.error)
          ? s.errors[data.error as keyof typeof s.errors] : s.errorGeneric);
        return;
      }
      setNotice(data?.status === "approved" ? s.saved : s.pending);
      setName("");
      setText("");
      setStyle("");
      setVisibility("public");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      (window as any).plausible?.("Kladka Post");
      // Если запись опубликована сразу (без модерации) — обновляем ленту.
      if (data?.status === "approved") {
        window.setTimeout(() => window.location.reload(), 1200);
      }
    } catch {
      setNotice(s.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  if (isAdept === null) return null;

  const css = (
    <style>{`
        .kladka-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: var(--spacing-xl);
          border: 1px dashed var(--color-yolk, #d4af37);
          background: rgba(212, 175, 55, 0.06);
          text-align: center;
        }
        .kladka-form h3 { margin: 0; }
        .kladka-input, .kladka-textarea, .kladka-select {
          border: 1px solid rgba(212, 175, 55, 0.5);
          background: rgba(255, 255, 255, 0.5);
          padding: 0.8rem 1rem;
          font-family: var(--font-serif-body, serif);
          font-size: 1rem;
          color: var(--color-text, #2b2b2b);
          outline: none;
          width: 100%;
        }
        .kladka-input:focus, .kladka-textarea:focus, .kladka-select:focus {
          border-color: var(--color-yolk, #d4af37);
        }
        .kladka-textarea {
          min-height: 7rem;
          resize: vertical;
        }
        .kladka-counter {
          font-family: var(--font-sans-ui, sans-serif);
          font-size: 0.75rem;
          opacity: 0.5;
          text-align: right;
          margin: 0;
        }
        .kladka-preview {
          max-height: 260px;
          width: auto;
          max-width: 100%;
          margin: 0 auto;
          border: 1px solid rgba(212, 175, 55, 0.4);
        }
        .kladka-notice {
          font-style: italic;
          opacity: 0.85;
          margin: 0;
        }
        .kladka-row {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          justify-content: center;
        }
      `}</style>
  );

  if (!isAdept) {
    return (
      <div className="kladka-form kladka-gate">
        {css}
        <h3>{s.gateTitle}</h3>
        <p>{s.gateText}</p>
        <p>
          <button className="btn" onClick={goToQuiz}>
            {s.gateBtn}
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="kladka-form" ref={formRef}>
      {css}
      <p className="kladka-notice">{s.moderation}</p>
      <input
        className="kladka-input"
        type="text"
        maxLength={40}
        placeholder={s.namePlaceholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        className="kladka-textarea"
        maxLength={TEXT_MAX}
        placeholder={s.textPlaceholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="kladka-counter">{s.counter(text.length, TEXT_MAX)}</p>

      <label className="text-ui" style={{ opacity: 0.7 }}>
        {s.styleLabel}
        <select
          className="kladka-select"
          style={{ marginTop: "0.5rem" }}
          value={style}
          onChange={(e) => setStyle(e.target.value)}
        >
          <option value="">{s.styleNone}</option>
          {STYLES[lang].map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </label>

      <label className="text-ui">
        {s.visibilityLabel}
        <select
          className="kladka-select"
          style={{ marginTop: "0.5rem" }}
          value={visibility}
          disabled={busy}
          onChange={(e) => setVisibility(e.target.value as KladkaVisibility)}
        >
          <option value="public">{s.visibilityPublic}</option>
          <option value="adepts">{s.visibilityAdepts}</option>
        </select>
      </label>
      {visibility === "adepts" && <p className="kladka-notice">{s.visibilityHint}</p>}

      {preview && <img className="kladka-preview" src={preview} alt="" />}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: "none" }}
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />
      <div className="kladka-row">
        {file && <button type="button" className="btn btn-link" disabled={busy} onClick={() => { setFile(null); setNotice(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>{lang === "ru" ? "Убрать фотографию" : "Remove photograph"}</button>}
        <button
          className="btn btn-secondary"
          onClick={() => fileInputRef.current?.click()}
        >
          {file ? s.photoChange : s.photoBtn}
        </button>
        <button
          className="btn"
          aria-busy={busy}
          disabled={busy || (!text.trim() && !file)}
          onClick={() => void submit()}
        >
          {busy ? s.submitting : s.submit}
        </button>
      </div>

      {notice && (
        <p className="kladka-notice" aria-live="polite">
          {notice}
        </p>
      )}
    </div>
  );
};

export default KladkaForm;
