import { lazy, Suspense, useState } from "react";
import { reasonLabels, styleNames, tools } from "./content.ts";
import { actualProfile, airDepth, archiveRecords, certificate, crackSide, declaredOrigin, duration, examinationAnswers, expectedAnswer, profileFacts, scaleOffset } from "./examination.ts";
import type { Action, GameCase, Lang, Reason, State, Style, Tool } from "./types.ts";

const Specimen = lazy(() => import("./Specimen.tsx"));
const signaturePaths = ["M9 29 19 8l-4 24 14-14-2 16 13-10 7 4 13-9M8 37l56-7", "M8 29q15-38 18-9t14-3l-4 16 13-9 9 3M14 38l48-8", "M8 31 22 9l-2 24 12-6 8-17-4 24 13-14 11 6M9 39l52-8"];
function Signature({ value, lang }: { value: number; lang: Lang }) {
  return <svg className="commission-autograph" viewBox="0 0 72 46" role="img" aria-label={`${lang === "ru" ? "Подпись, образец" : "Signature pattern"} ${value + 1}`}><path d={signaturePaths[value]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export function CertificateSlip({ item, lang }: { item: GameCase; lang: Lang }) {
  const cert = certificate(item), ru = lang === "ru";
  return <div className="commission-certificate"><strong>{ru ? "Свидетельство в паспорте" : "Passport certificate"}</strong><dl>
    <dt>{ru ? "Партия / редакция" : "Lot / revision"}</dt><dd>{item.lot} / {cert.revision}</dd>
    <dt>{ru ? "Печать" : "Seal"}</dt><dd>{cert.seal}</dd>
    <dt>{ru ? "Происхождение" : "Provenance"}</dt><dd>{declaredOrigin(item)[lang]}</dd>
    <dt>{ru ? "Действует до" : "Valid through"}</dt><dd>{ru ? `дня приёма ${cert.until}` : `admissions day ${cert.until}`}</dd>
    <dt>{ru ? "Подпись регистратора" : "Registrar's signature"}</dt><dd><Signature value={cert.signature} lang={lang} /></dd>
  </dl></div>;
}

export default function Workbench({ item, tool, state, lang, act }: { item: GameCase; tool: Tool; state: State; lang: Lang; act: (a: Action) => void }) {
  const ru = lang === "ru", t = (a: string, b: string) => ru ? a : b;
  const [side, setSide] = useState(0), [seen, setSeen] = useState(state.findings.inspect?.sample ?? (state.observed.includes("inspect") ? 15 : 1));
  const [zeroed, setZeroed] = useState(state.observed.includes("scale")), [loaded, setLoaded] = useState(state.observed.includes("scale"));
  const [depth, setDepth] = useState(state.findings.light?.sample ?? (state.observed.includes("light") ? airDepth(item) : 0)), [measured, setMeasured] = useState(state.observed.includes("light"));
  const [search, setSearch] = useState(""), [recordId, setRecordId] = useState(state.findings.archive?.record ?? (state.observed.includes("archive") ? `${item.id}:current` : ""));
  const [profile, setProfile] = useState<Style | null>((state.findings.plate?.record as Style) ?? (state.observed.includes("plate") ? actualProfile(item) : null));
  const [answers, setAnswers] = useState<Partial<Record<Tool, Reason>>>(Object.fromEntries(state.observed.map(id => [id, state.findings[id]?.answer ?? expectedAnswer(item, id)])));
  const done = state.observed.includes(tool), prepared = tool === "inspect" || state.prepared.includes(tool) || done;
  const records = archiveRecords(item), record = records.find(row => row.id === recordId);
  const actual = profileFacts[actualProfile(item)], expected = profileFacts[item.style];
  const reading = (loaded ? item.mass : 0) + (zeroed ? 0 : scaleOffset(item));
  const ready = tool === "inspect" ? seen === 15 : tool === "scale" ? loaded : tool === "light" ? measured : tool === "archive" ? Boolean(record) : Boolean(profile);
  const answer = tool === "plate" ? profile ? profile === item.style ? "none" : "profile" : undefined : answers[tool];
  const save = () => {
    if (answer === undefined) return;
    act({ type: "examine", tool, answer, sample: tool === "inspect" ? seen : tool === "scale" ? reading : tool === "light" ? depth : 0, record: tool === "archive" ? recordId : tool === "plate" ? profile! : "" });
  };
  return <div className="commission-workbench">
    {tool !== "archive" && <Suspense fallback={<div className="commission-model-loading">{t("Подготавливаем образец…", "Preparing the specimen…")}</div>}>
      <Specimen item={item} tool={tool} examined={prepared} loaded={loaded || done} lang={lang} onView={view => { setSide(view); if (tool === "inspect") setSeen(value => value | (1 << view)); }} />
    </Suspense>}
    {!prepared ? <div className="commission-exam-start"><p>{tools[tool].description[lang]}</p><button className="commission-primary" disabled={state.time < tools[tool].cost} onClick={() => act({ type: "prepare", tool })}>{tools[tool].action[lang]} · {duration(tools[tool].cost, lang)}</button><p className="commission-caption">{t("Время спишется один раз. Читать документы и работать с прибором можно без спешки.", "Time is charged once. Take as long as you need to read and use the instrument.")}</p></div> : <div className="commission-exam-controls">
      {tool === "inspect" && <>
        <h3>{t("Проверьте все четыре стороны", "Inspect all four sides")}</h3><p>{t("Проведите пальцем по яйцу или используйте стрелки. Затем запишите, цела ли скорлупа.", "Swipe the egg or use the arrows. Then record whether the shell is intact.")}</p>
        <div className="commission-surfaces" aria-label={t("Осмотренные стороны", "Inspected sides")}>{[0, 1, 2, 3].map(view => <span key={view} className={`${seen & (1 << view) ? "is-seen" : ""} ${side === view ? "is-current" : ""}`}>{view + 1}<small>{seen & (1 << view) ? t("осмотрена", "seen") : t("ещё нет", "unseen")}</small></span>)}</div>
        <p className="commission-caption" role="status">{t(`Осмотрено ${[0, 1, 2, 3].filter(i => seen & (1 << i)).length} из 4 сторон.`, `${[0, 1, 2, 3].filter(i => seen & (1 << i)).length} of 4 sides inspected.`)}</p>
        <details className="commission-text-observation"><summary>{t("Признаки текущей стороны текстом", "Read this side's features")}</summary><p>{item.defect === "shell" && side === crackSide(item) ? t("На поверхности видна неровная тёмная линия с ответвлением. Она пересекает поры скорлупы.", "An irregular dark line with a branch crosses the shell's pores.") : t("Ровная поверхность с порами и отдельными пигментными точками. Линии разлома не видно.", "An even surface with pores and scattered pigment spots. No fracture line is visible.")}</p></details>
      </>}
      {tool === "scale" && <>
        <div className="commission-scale-readout"><span>{reading.toFixed(1)}</span><small>{t("г", "g")}</small><p>{loaded ? t("Образец на чаше", "Specimen on the pan") : t("Чаша пуста — проверьте ноль", "Empty pan — check the zero")}</p></div>
        <div className="commission-action-row"><button className="commission-secondary" disabled={loaded || done} onClick={() => setZeroed(true)}>{t("Выставить ноль", "Set zero")}</button><button className="commission-secondary" disabled={done} onClick={() => setLoaded(!loaded)}>{loaded ? t("Снять образец", "Remove specimen") : t("Положить образец", "Place specimen")}</button></div>
        <p>{t("Допуск по паспорту", "Passport range")}: <strong>{item.declaredMass - 2}–{item.declaredMass + 2} {t("г", "g")}</strong>.</p>
        {item.day >= 5 && <p className="commission-caption">{t("После обслуживания весы могут сбиться. Обнуляйте только пустую чашу.", "The scales may drift after servicing. Zero the empty pan only.")}</p>}
      </>}
      {tool === "light" && <>
        <h3>{t("Измерьте воздушную камеру", "Measure the air cell")}</h3><p>{t("В окуляре виден верхний срез. Подведите подвижную риску к нижней границе светлой камеры.", "The eyepiece shows the top section. Move the marker to the lower edge of the pale air cell.")}</p>
        <svg className="commission-air-gauge" viewBox="0 0 300 192" role="img" aria-label={t("Срез воздушной камеры со шкалой от 0 до 15 миллиметров", "Air-cell section with a scale from 0 to 15 millimetres")}>
          <defs><clipPath id={`air-${item.id}`}><path d="M55 176V20Q135-9 215 20V176Z" /></clipPath></defs>
          <path d="M55 176V20Q135-9 215 20V176Z" fill="#977136" />
          <rect x="55" y="0" width="160" height={22 + airDepth(item) * 10} fill="#f7e6ad" clipPath={`url(#air-${item.id})`} />
          {Array.from({ length: 16 }, (_, n) => <g key={n}><path d={`M220 ${22 + n * 10}h${n % 5 === 0 ? 14 : 7}`} stroke="currentColor" /><text x="242" y={26 + n * 10}>{n}</text></g>)}
          <path d={`M44 ${22 + depth * 10}H235`} stroke="#973e32" strokeWidth="2" strokeDasharray="4 3" />
        </svg>
        <label className="commission-range-label">{t("Положение риски", "Marker position")}: <strong>{depth} {t("мм", "mm")}</strong><input aria-label={t("Глубина воздушной камеры", "Air-cell depth")} type="range" disabled={done} min="0" max="15" step="1" value={depth} onChange={e => { setDepth(Number(e.target.value)); setMeasured(true); }} /></label>
        <details><summary>{t("Срез текстом", "Read the section")}</summary><p>{t(`Нижняя граница камеры проходит у деления ${airDepth(item)} мм.`, `The lower edge of the air cell meets the ${airDepth(item)} mm mark.`)}</p></details>
        <p className="commission-reference">{item.style === "aged" && item.defect !== "age" ? t("В паспорте: архивная выдержка. Допустимая камера: 8–13 мм.", "Passport: aged. Permitted air cell: 8–13 mm.") : t("В паспорте: свежее поступление. Допустимая камера: до 6 мм включительно.", "Passport: fresh arrival. Permitted air cell: up to 6 mm inclusive.")}</p>
      </>}
      {tool === "plate" && <>
        <h3>{t("Определите профиль образца", "Identify the specimen's profile")}</h3>
        <dl className="commission-profile-facts"><dt>{t("Высота купола", "Dome height")}</dt><dd>{actual.dome} {t("мм", "mm")}</dd><dt>{t("Тело", "Body")}</dt><dd>{actual.body[lang]}</dd><dt>{t("Финиш", "Finish")}</dt><dd>{actual.finish[lang]}</dd></dl>
        <p>{t("В паспорте", "Passport")}: <strong>{styleNames[item.style][lang]}</strong> — {expected.dome} {t("мм", "mm")}, {expected.body[lang].toLowerCase()}, {expected.finish[lang].toLowerCase()}.</p>
        <details><summary>{t("Открыть таблицу четырёх стилей", "Open the four-style reference")}</summary><dl className="commission-profile-facts">{(Object.keys(profileFacts) as Style[]).map(id => <div key={id}><dt>{styleNames[id][lang]}</dt><dd>{profileFacts[id].dome} {t("мм", "mm")} · {profileFacts[id].body[lang]} · {profileFacts[id].finish[lang]}</dd></div>)}</dl></details>
        <fieldset className="commission-findings" disabled={done}><legend>{t("Какой профиль получился на блюдце?", "Which profile did you observe?")}</legend>{(Object.keys(styleNames) as Style[]).map(id => <label key={id}><input type="radio" name={`profile-${item.id}`} checked={profile === id} onChange={() => setProfile(id)} />{styleNames[id][lang]}</label>)}</fieldset>
      </>}
      {tool === "archive" && <>
        <h3>{t("Найдите запись и сверьте свидетельство", "Find the entry and compare the certificate")}</h3>
        <p>{t("Нужны номер партии и редакция из паспорта. Затем сравните печать, подпись, происхождение и срок. Сейчас идёт день приёма", "Match the lot and revision in the passport. Then compare seal, signature, provenance and validity. Current admissions day")}: <strong>{state.day}</strong>.</p>
        <label className="commission-search">{t("Поиск по номеру партии", "Search by lot number")}<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={item.lot} /></label>
        <div className="commission-record-list" aria-label={t("Архивные записи", "Archive entries")}>{records.filter(row => row.lot.toLowerCase().includes(search.trim().toLowerCase())).map(row => <button key={row.id} className={row.id === recordId ? "is-selected" : ""} aria-pressed={row.id === recordId} disabled={done && Boolean(state.findings.archive)} onClick={() => setRecordId(row.id)}><strong>{row.lot}</strong><span>{t("Редакция", "Revision")} {row.revision} · {t("до дня", "through day")} {row.until}</span></button>)}{!records.some(row => row.lot.toLowerCase().includes(search.trim().toLowerCase())) && <p>{t("Записей нет. Проверьте номер в паспорте.", "No records. Check the lot number in the passport.")}</p>}</div>
        <div className="commission-document-comparison"><CertificateSlip item={item} lang={lang} />{record && <div className="commission-certificate"><strong>{t("Архивная запись", "Archive entry")}</strong><dl><dt>{t("Партия / редакция", "Lot / revision")}</dt><dd>{record.lot} / {record.revision}</dd><dt>{t("Выданная печать", "Issued seal")}</dt><dd>{record.seal}</dd><dt>{t("Производитель", "Producer")}</dt><dd>{record.origin[lang]}</dd><dt>{t("Действует до", "Valid through")}</dt><dd>{t(`дня приёма ${record.until}`, `admissions day ${record.until}`)}</dd><dt>{t("Образец подписи", "Signature specimen")}</dt><dd><Signature value={record.signature} lang={lang} /></dd></dl></div>}</div>
        {record?.exception && <div className="commission-exception"><h4>{t("Письмо № 5/Л · Л. Ратин", "Letter No. 5/L · L. Ratin")}</h4><p>{t(`Разрешаю принять партию ${record.lot} Аркадия Латова с истёкшим свидетельством. Разрешение действует до 12-го дня приёма и только для указанной партии.`, `I authorise admission of Arkady Latov's batch ${record.lot} with an expired certificate. Valid through admissions day 12, for this batch only.`)}</p></div>}
        {item.day === 5 && !record?.exception && <p className="commission-caption">{t("Истёкшее свидетельство можно отклонить, отправить на уточнение или принять под своё поручительство. Письмо на чужую партию здесь не действует.", "An expired certificate may be rejected, deferred or personally guaranteed. A letter for another batch does not apply.")}</p>}
      </>}
      {tool !== "plate" && <fieldset className="commission-findings" disabled={!ready || done}><legend>{t("Что вы записываете в протокол?", "What will you record?")}</legend>{examinationAnswers[tool].map(value => <label key={value}><input type="radio" name={`finding-${item.id}-${tool}`} checked={answers[tool] === value} onChange={() => setAnswers(previous => ({ ...previous, [tool]: value }))} />{value === "none" ? tool === "inspect" ? t("Скорлупа целая", "Shell intact") : t("Соответствует паспорту и правилам", "Meets the passport and regulations") : reasonLabels[value][lang]}</label>)}</fieldset>}
      {done ? <div className="commission-observation" role="status"><h3>{t("Ваша запись сохранена", "Your observation is saved")}</h3><p>{state.findings[tool] ? reasonLabels[state.findings[tool]!.answer][lang] : t("Выполнено в предыдущей версии. Повторять проверку не нужно.", "Completed in the previous version. No need to repeat this check.")}</p><p className="commission-caption">{t("Галочка означает запись в протоколе. Решение по партии вы подпишете после проверок.", "A checkmark means the observation is recorded. Sign your decision after the checks.")}</p></div> : <button className="commission-primary" disabled={!ready || answer === undefined} onClick={save}>{t("Записать наблюдение", "Record observation")}</button>}
      {!done && !ready && <p className="commission-caption">{tool === "inspect" ? t("Сначала осмотрите все четыре стороны.", "Inspect all four sides first.") : tool === "scale" ? t("Сначала положите образец на чашу.", "Place the specimen on the pan first.") : tool === "light" ? t("Сначала установите измерительную риску.", "Position the measurement marker first.") : tool === "archive" ? t("Сначала откройте архивную запись.", "Open an archive entry first.") : t("Выберите профиль по наблюдениям.", "Identify the profile from the observations.")}</p>}
    </div>}
  </div>;
}
