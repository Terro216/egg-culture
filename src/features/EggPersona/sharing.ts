import { getPersonaById, type PersonaLang } from "./personaData.ts";

export function personaResultPath(lang: PersonaLang, resultId?: string | null) {
  const persona = resultId ? getPersonaById(resultId) : undefined;
  return `/${lang}/egg-type${persona ? `?result=${persona.id}` : ""}`;
}

export function personaShareMetadata(lang: PersonaLang, resultId?: string | null) {
  const persona = resultId ? getPersonaById(resultId) : undefined;
  const content = persona?.[lang];
  const title = content
    ? lang === "ru"
      ? `Я — ${content.name} | Яичная Культура`
      : `I am ${content.name} | Egg Culture`
    : lang === "ru"
      ? "Какое вы яйцо? | Яичная Культура"
      : "Which egg are you? | Egg Culture";
  const description = content
    ? `${content.epithet}. ${content.desc}`
    : lang === "ru"
      ? "Семь вопросов — и Компас Яй Ци укажет ваш стиль: от аскетичного Blanc до Дворового Дикого."
      : "Seven questions — and the Qi Compass will point to your style: from ascetic Blanc to Yard Wild.";
  const imageParams = new URLSearchParams({ lang, v: "2" });
  if (persona) imageParams.set("type", persona.id);

  return {
    persona,
    title,
    description,
    canonicalPath: personaResultPath(lang, persona?.id),
    image: `/api/persona-og?${imageParams}`,
    imageAlt: lang === "ru"
      ? `Компас Яй Ци${content ? `: ${content.name}. ${content.epithet}` : ": восемь яичных стилей"}`
      : `Egg Qi Compass${content ? `: ${content.name}. ${content.epithet}` : ": eight egg styles"}`,
  };
}
