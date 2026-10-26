import { useEffect, useState } from "react";
import { RoadAccount, useRoadAccount } from "../EggRoad/RoadAccount.tsx";
import { AVATARS } from "./model.ts";
import { portalIdentityReady, refreshPortal, saveProfileSettings, saveProfileSlug } from "./client.ts";
import { usePortal } from "./PortalPresence.tsx";
import ProfileCard from "./ProfileCard.tsx";
import AdeptCertificate from "../AdeptCertificate/AdeptCertificate.tsx";
import "./Profile.css";
import { useAdept } from "./useAdept.ts";
import { guestInitiated, recordInitiation, clearGuestInitiation } from "./adept.ts";
import { INITIATION_ANSWERS } from "./initiation.ts";
import GuestSummary from "./GuestSummary.tsx";
import GuestNestResults from "../EggUntangle/GuestNestResults.tsx";
import ProfileIncubator from "./ProfileIncubator.tsx";

export default function Profile({ lang }: { lang: "ru" | "en" }) {
  const state = usePortal(), ru = lang === "ru";
  const account = useRoadAccount({ data: state.account, reload: () => void refreshPortal(), adoptAccount: () => void refreshPortal() });
  const [visible, setVisible] = useState(false), [avatar, setAvatar] = useState(0), [saving, setSaving] = useState(false), [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [slug, setSlug] = useState(""), [slugSaving, setSlugSaving] = useState(false), [slugMessage, setSlugMessage] = useState("");
  const [tab, setTab] = useState<"profile" | "certificate">("profile");
  const adept = useAdept();
  const [guestAdept, setGuestAdept] = useState(false);
  useEffect(() => { setGuestAdept(guestInitiated()); }, [state.account?.name]);
  useEffect(() => { setVisible(state.profile?.public ?? false); setAvatar(state.profile?.avatar ?? 0); }, [state.profile?.id, state.profile?.public, state.profile?.avatar]);
  useEffect(() => { setLink(""); setMessage(""); }, [state.profile?.id]);
  useEffect(() => { setSlug(state.profile?.slug ?? ""); setSlugMessage(""); }, [state.profile?.slug, state.profile?.name]);
  return <div className="portal-profile">
    <nav className="portal-tabs" aria-label={ru ? "Разделы личного кабинета" : "Profile sections"}>
        <button className="btn btn-secondary" type="button" aria-current={tab === "profile" ? "page" : undefined} onClick={() => setTab("profile")}>{ru ? "Личное дело" : "Profile"}</button>
        <button className="btn btn-secondary" type="button" aria-current={tab === "certificate" ? "page" : undefined} onClick={() => setTab("certificate")}>{ru ? "Сертификат адепта" : "Adept certificate"}</button>
    </nav>
    {tab === "profile" ? <>
      <GuestNestResults lang={lang} />
      <RoadAccount lang={lang} account={account} reload={() => void refreshPortal()} failed={state.failed} suggestedName={state.account?.name ?? ""} openForGuest inProfile />
      {state.account?.registered === false && !state.failed && portalIdentityReady(state) && <GuestSummary lang={lang} onCertificate={() => setTab("certificate")} />}
      {state.account?.registered && state.profile && <>
      <section className="portal-settings"><h2>{ru ? "Видимость профиля" : "Profile visibility"}</h2>
        <p>{ru ? "В публичном профиле видны имя, выбранный знак, лучшие результаты и достижения." : "Your public profile shows your name, chosen symbol, best results and achievements."}</p>
        <fieldset disabled={saving}><legend>{ru ? "Знак адепта" : "Adept's symbol"}</legend><div className="portal-avatars">{AVATARS.map((symbol, i) => <button className="btn btn-secondary" key={symbol} type="button" aria-pressed={avatar === i} aria-label={`${ru ? "Знак" : "Symbol"} ${i + 1}`} onClick={() => setAvatar(i)}>{symbol}</button>)}</div>
          <label className="portal-public-toggle"><input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} />{ru ? "Сделать профиль публичным" : "Make my profile public"}</label>
          <button className="btn portal-button" type="button" aria-busy={saving} onClick={async () => { setSaving(true); setMessage(""); try { await saveProfileSettings(visible, avatar); setMessage(ru ? "Настройки сохранены." : "Settings saved."); } catch { setMessage(ru ? "Не удалось сохранить. Повторите попытку." : "Could not save. Please retry."); } finally { setSaving(false); } }}>{saving ? ru ? "Сохраняем…" : "Saving…" : ru ? "Сохранить" : "Save"}</button>
        </fieldset>
        {state.profile.public && <div className="portal-share"><a href={`/${lang}/adepts/${state.profile.id}/`}>{ru ? "Открыть публичный профиль ↗" : "View public profile ↗"}</a><button className="btn btn-secondary" type="button" onClick={async () => { const url = new URL(`/${lang}/adepts/${state.profile!.id}/`, location.origin).href; try { await navigator.clipboard.writeText(url); setMessage(ru ? "Ссылка скопирована." : "Link copied."); } catch { setLink(url); } }}>{ru ? "Скопировать ссылку" : "Copy link"}</button>{link && <input aria-label={ru ? "Ссылка на профиль" : "Profile link"} readOnly value={link} onFocus={e => e.target.select()} />}</div>}
        <form className="portal-slug" onSubmit={async event => { event.preventDefault(); setSlugSaving(true); setSlugMessage(""); try { await saveProfileSlug(slug); setSlugMessage(ru ? "Адрес сохранён." : "Address saved."); } catch (error) { const code = error instanceof Error ? error.message : ""; setSlugMessage(code === "slug_taken" ? ru ? "Этот ID уже занят." : "This ID is taken." : code === "invalid_slug" ? ru ? "Используйте 3–32 латинских строчных букв, цифр или дефисов. Начните с буквы." : "Use 3–32 lowercase letters, digits or hyphens. Start with a letter." : ru ? "Не удалось сохранить адрес. Повторите попытку." : "Could not save the address. Please retry."); } finally { setSlugSaving(false); } }}>
          <label htmlFor="portal-slug">{ru ? "ID публичного профиля" : "Public profile ID"}</label>
          <div className="portal-slug-entry"><span>/{lang}/adepts/</span><input id="portal-slug" value={slug} onChange={event => setSlug(event.target.value.toLowerCase())} minLength={3} maxLength={32} pattern="[a-z][a-z0-9-]{1,30}[a-z0-9]" placeholder="ilyamed" autoComplete="off" spellCheck={false} required disabled={slugSaving} /><span>/</span><button className="btn" type="submit" aria-busy={slugSaving} disabled={slugSaving || slug === state.profile.slug}>{slugSaving ? ru ? "Сохраняем…" : "Saving…" : ru ? "Сохранить ID" : "Save ID"}</button></div>
          {slugMessage && <p role="status">{slugMessage}</p>}
        </form>
        {message && <p role="status">{message}</p>}
      </section>
      <ProfileIncubator state={state.profile.incubator ?? null} lang={lang} />
      <ProfileCard profile={state.profile} lang={lang} />
      </>}
    </> : <section className="portal-certificate" aria-label={ru ? "Сертификат адепта" : "Adept certificate"}>
        <h2>{ru ? "Сертификат Истинного Адепта" : "Certificate of the True Adept"}</h2>
        {!adept && guestAdept && state.account?.registered && <p><button className="btn btn-secondary" type="button" disabled={saving} onClick={async () => {
          setSaving(true); setMessage("");
          try { await recordInitiation([...INITIATION_ANSWERS]); clearGuestInitiation(); setGuestAdept(false); }
          catch { setMessage(ru ? "Не удалось перенести результат. Повторите попытку." : "Could not transfer your result. Please retry."); }
          finally { setSaving(false); }
        }}>{ru ? "Перенести пройденную гостевую Инициацию в этот профиль" : "Transfer your completed guest Initiation to this account"}</button></p>}
        {message && <p role="status">{message}</p>}
        {adept ? <AdeptCertificate key={state.account?.name ?? "guest"} lang={lang} initialName={state.account?.registered ? state.account.name : ""} /> : <a className="portal-certificate-empty" href={`/${lang}/quiz/`} onClick={() => { try { localStorage.setItem("egg_after_quiz", `/${lang}/dark-side/`); } catch { /* Quiz still opens. */ } }}><span>{ru ? "Получить сертификат" : "Get your certificate"}</span><small>{ru ? "Пройдите Инициацию и откройте Тёмную сторону" : "Pass the Initiation and enter the Dark Side"}</small></a>}
      </section>}
    <nav className="portal-links"><a href={`/${lang}/untangle/`}>{ru ? "Халазы судьбы →" : "Chalazae of Fate →"}</a><a href={`/${lang}/incubator/`}>{ru ? "Инкубатор →" : "Incubator →"}</a><a href={`/${lang}/play/`}>{ru ? "Путь формы →" : "Path of Form →"}</a><a href={`/${lang}/fry/`}>{ru ? "Великая Жарка →" : "The Great Fry →"}</a><a href={`/${lang}/dark-side/#games`}>{ru ? "Все испытания →" : "All trials →"}</a></nav>
  </div>;
}
