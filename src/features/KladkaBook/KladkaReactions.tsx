import { useEffect, useId, useRef, useState } from "react";
import { KLADKA_REACTIONS, KLADKA_REACTION_MAX } from "../../shared/kladkaReactions.ts";
import type { KladkaReaction, KladkaReactionAccess, KladkaReactionSummary } from "../../shared/kladkaReactions.ts";
import { portalIdentityReady, portalState } from "../Portal/client.ts";
import "./KladkaReactions.css";

type Props = { lang: "ru" | "en"; post: string; initial: KladkaReactionSummary; access: KladkaReactionAccess; account: string | null; ready: boolean };
export default function KladkaReactions({ lang, post, initial, access, account, ready }: Props) {
  const ru = lang === "ru", id = useId();
  const [summary, setSummary] = useState(initial), [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [retry, setRetry] = useState<{ reaction: KladkaReaction; selected: boolean } | null>(null);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<KladkaReaction>("shell");
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => { setSummary(initial); }, [initial]);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    root.current?.querySelector<HTMLButtonElement>(".kladka-reaction-choice")?.focus();
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const mine = ready ? (summary.selected ?? (summary.mine ? [summary.mine] : [])) : [];
  const atLimit = mine.length >= KLADKA_REACTION_MAX;
  const canReact = ready && access.reason === "ready";
  const limitMessage = ru ? "Можно выбрать до трёх реакций. Снимите одну, чтобы добавить другую." : "Choose up to three reactions. Remove one to add another.";
  function close() { setOpen(false); trigger.current?.focus(); }
  async function save(reaction: KladkaReaction, selected: boolean) {
    if (!canReact || !account || request.current) return;
    if (selected && !mine.includes(reaction) && atLimit) { setError(limitMessage); return; }
    const owns = () => portalIdentityReady() && portalState().account?.registered && portalState().account?.name === account;
    if (!owns()) return;
    const controller = new AbortController(); request.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 10000);
    setPending(true); setError(""); setRetry(null); setNotice("");
    if (!open) trigger.current?.focus();
    try {
      const response = await fetch("/api/kladka-reaction", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post, reaction, selected, account }), signal: controller.signal });
      const data = await response.json();
      if (!owns() || request.current !== controller) return;
      if (!response.ok) {
        if (data.error === "reaction_limit" && data.summary) setSummary(data.summary);
        const minutes = Math.max(1, Math.ceil(Number(data.retryAfter || 60) / 60));
        const messages: Record<string, string> = {
          login: ru ? "Войдите в аккаунт, чтобы оставить реакцию." : "Sign in to leave a reaction.",
          initiation: ru ? "Пройдите Инициацию, чтобы оставить реакцию." : "Pass the Initiation to leave a reaction.",
          account_changed: ru ? "Аккаунт изменился. Обновите страницу." : "The account changed. Refresh the page.",
          reaction_limit: limitMessage,
          not_found: ru ? "Запись больше недоступна. Обновите книгу." : "This entry is no longer available. Refresh the Book.",
          rate_limit: ru ? `Слишком много реакций. Повторите через ${minutes} мин.` : `Too many reactions. Try again in ${minutes} min.`,
          network_limit: ru ? `Лимит реакций из одной сети. Повторите через ${minutes} мин.` : `This network has reached its limit. Try again in ${minutes} min.`,
        };
        setError(messages[data.error] ?? (ru ? "Не удалось сохранить реакцию. Попробуйте ещё раз." : "Could not save your reaction. Try again."));
        if (response.status >= 500 || data.error === "timeout") setRetry({ reaction, selected });
        return;
      }
      setSummary(data.summary);
      setNotice(!selected ? (ru ? "Реакция снята." : "Reaction removed.") : (ru ? "Реакция сохранена." : "Reaction saved."));
    } catch {
      if (owns() && request.current === controller) {
        setError(ru ? "Не удалось подтвердить реакцию. Повторите отправку." : "Could not confirm your reaction. Try sending it again.");
        setRetry({ reaction, selected });
      }
    } finally {
      window.clearTimeout(timer);
      if (request.current === controller) { request.current = null; setPending(false); }
    }
  }
  const returnToBook = () => { try { localStorage.setItem("egg_after_quiz", `/${lang}/kladka/#entry-${post}`); } catch { /* Navigation still works. */ } };
  return <div className="kladka-reactions" ref={root} onKeyDown={event => { if (event.key === "Escape" && open) { event.preventDefault(); close(); } }}>
    <div className="kladka-reaction-bar" role="group" aria-label={ru ? "Реакции на запись" : "Entry reactions"} aria-busy={pending}>
      {KLADKA_REACTIONS.filter(item => (summary.counts[item.id] ?? 0) > 0).map(item => <button type="button" key={item.id}
        className="kladka-reaction-chip" aria-pressed={mine.includes(item.id)} disabled={pending || !ready}
        aria-label={`${item[lang]}: ${summary.counts[item.id]}${mine.includes(item.id) ? (ru ? ". Ваша реакция. Нажмите, чтобы снять" : ". Your reaction. Press to remove") : ""}`}
        title={item[lang]} onClick={() => {
          if (!canReact) { setOpen(true); return; }
          // A count chip can disappear when its last reaction is removed.
          trigger.current?.focus(); void save(item.id, !mine.includes(item.id));
        }}>
        <span className="kladka-reaction-emoji" aria-hidden="true">{item.emoji}</span><span>{summary.counts[item.id]}</span>
      </button>)}
      <button type="button" ref={trigger} className="kladka-reaction-trigger" aria-expanded={open} aria-controls={id}
        disabled={!ready} aria-disabled={pending || undefined} onClick={() => { if (!pending) setOpen(value => !value); }}>
        <svg width="26" height="24" viewBox="0 0 28 24" fill="none" aria-hidden="true">
          <path d="M16 14c0 4.8-2.9 8-6.5 8S3 18.8 3 14 6.2 2 9.5 2 16 9.2 16 14Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M23 5v8m-4-4h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {pending ? (ru ? "Сохраняем…" : "Saving…") : (ru ? "Реакция" : "Reaction")}
      </button>
    </div>
    {open && <div id={id} className="kladka-reaction-picker">
      {canReact ? <>
        <div className="kladka-reaction-options" role="group" aria-label={ru ? "Выберите реакцию" : "Choose a reaction"}>
          {KLADKA_REACTIONS.map(item => <button type="button" key={item.id} className="kladka-reaction-choice"
            title={item[lang]} aria-label={item[lang]} aria-pressed={mine.includes(item.id)}
            aria-disabled={pending || (atLimit && !mine.includes(item.id)) || undefined}
            onFocus={() => setPreview(item.id)} onMouseEnter={() => setPreview(item.id)}
            onClick={() => { if (!pending && (!atLimit || mine.includes(item.id))) void save(item.id, !mine.includes(item.id)); }}>
            <span className="kladka-reaction-emoji" aria-hidden="true">{item.emoji}</span>
          </button>)}
        </div>
        <p className="kladka-reaction-hint"><strong>{KLADKA_REACTIONS.find(item => item.id === preview)![lang]}</strong>
          <span>{ru ? `Выбрано ${mine.length} из ${KLADKA_REACTION_MAX}. ${atLimit ? "Снимите одну, чтобы выбрать другую." : "Повторное нажатие снимает реакцию."}`
            : `Selected ${mine.length} of ${KLADKA_REACTION_MAX}. ${atLimit ? "Remove one to choose another." : "Press a selected reaction to remove it."}`}</span></p>
      </> : <p className="kladka-reaction-gate">
        {!ready ? (ru ? "Обновите книгу, чтобы поставить реакцию." : "Refresh the Book to react.")
          : access.reason === "login" ? <><a href={`/${lang}/profile/`}>{ru ? "Войдите в аккаунт" : "Sign in"}</a>{ru ? ", чтобы оставить реакцию." : " to leave a reaction."}</>
          : <><a href={`/${lang}/quiz/`} onClick={returnToBook}>{ru ? "Пройдите Инициацию" : "Pass the Initiation"}</a>{ru ? ", чтобы оставить реакцию." : " to leave a reaction."}</>}
      </p>}
    </div>}
    <div role="status" aria-live="polite" className={error ? "kladka-reaction-error" : "kladka-reaction-status"}>
      {error || notice}
      {error && retry && <button type="button" disabled={pending || !canReact} onClick={() => { trigger.current?.focus(); void save(retry.reaction, retry.selected); }}>{ru ? "Повторить" : "Retry"}</button>}
    </div>
  </div>;
}
