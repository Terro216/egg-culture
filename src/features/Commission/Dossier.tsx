import { useState } from "react";
import { claims, proofs } from "./content.ts";
import type { Action, Claim, Lang, Proof, State } from "./types.ts";

export default function Dossier({ state, lang, act }: { state: State | null; lang: Lang; act: (a: Action) => void }) {
  const ru = lang === "ru", t = (a: string, b: string) => ru ? a : b;
  const [selected, setSelected] = useState<Proof[]>([]), [claim, setClaim] = useState<Claim | "">("");
  const exhibits = state?.proofs ?? [], canWork = state && ["evening", "final"].includes(state.phase);
  return <div className="commission-dossier">
    <p className="commission-lead">{t("Это ваше расследование нарушений в Комиссии.", "This is your investigation into the Commission.")}</p>
    <p>{t("Копии из реестра, результаты блюдца и письма попадают сюда после исследования. После смены сопоставьте два документа и укажите, что они доказывают. Три подтверждённых вывода позволят предъявить досье на последнем заседании; также нужны независимые решения и поддержка свидетеля.", "Copies from the registry, dish reports and letters are kept here after examination. After a shift, pair two exhibits and identify what they establish. Three supported conclusions let you present the dossier at the final meeting; you also need independent choices and a witness's support.")}</p>
    <p className="commission-caption">{t("Досье не влияет на допуск текущей партии. Можно завершить кампанию, выполняя только работу инспектора.", "The dossier does not decide the current batch. You can finish the campaign by doing your inspector's job alone.")}</p>
    {!exhibits.length ? <div className="commission-empty-dossier"><h3>{t("Документов пока нет", "No exhibits yet")}</h3><p>{t("В третью смену откроется реестр. Сверьте запись партии ИС-41: копия накладной станет первым документом. Нина также предложит её после смены.", "The registry opens on shift three. Check the IS-41 lot entry to keep the first invoice. Nina will also offer a copy after the shift.")}</p></div> : <>
      <h3>{t("1. Выберите два документа", "1. Select two exhibits")}</h3>
      <div className="commission-exhibit-list">{exhibits.map(id => <article key={id}><label><input type="checkbox" checked={selected.includes(id)} disabled={!selected.includes(id) && selected.length === 2} onChange={() => setSelected(previous => previous.includes(id) ? previous.filter(p => p !== id) : [...previous, id])} /><strong>{proofs[id].title[lang]}</strong></label><p>{proofs[id].text[lang]}</p></article>)}</div>
      {exhibits.length < 2 && <p className="commission-reference">{t("Одного документа недостаточно. Сохраните его; подтверждения появятся в следующих поставках и письмах. Пропущенные копии можно заказать после смены.", "One exhibit is not enough. Keep it; later shipments and letters may corroborate it. Missing copies can be ordered after a shift.")}</p>}
      <label className="commission-claim-select">{t("2. Что подтверждает эта пара?", "2. What does this pair establish?")}<select value={claim} onChange={e => setClaim(e.target.value as Claim | "")}><option value="">{t("Выберите вывод", "Select a conclusion")}</option>{(Object.keys(claims) as Claim[]).map(id => <option key={id} value={id} disabled={state?.claims.includes(id)}>{claims[id].title[lang]}{state?.claims.includes(id) ? t(" — уже оформлен", " — already filed") : ""}</option>)}</select></label>
      <button className="commission-primary" disabled={!canWork || selected.length !== 2 || !claim || state?.claims.includes(claim)} onClick={() => { if (claim) act({ type: "connect", claim, exhibits: selected }); }}>{t("Приложить документы к выводу", "Attach exhibits to the conclusion")}</button>
      {!canWork && <p className="commission-caption">{t("Сейчас идёт приём. Оформить вывод можно после смены; документы уже сохранены.", "Admissions are open. File conclusions after the shift; the exhibits are already saved.")}</p>}
    </>}
    {Boolean(state?.claims.length) && <section><h3>{t("Подтверждённые выводы", "Supported conclusions")} · {state!.claims.length}/3</h3>{state!.claims.map(id => <article key={id}><h4>{claims[id].title[lang]}</h4><p>{claims[id].description[lang]}</p></article>)}</section>}
  </div>;
}
