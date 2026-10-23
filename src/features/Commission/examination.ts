import { hash, reasonTool } from "./cases.ts";
import { words as w } from "./types.ts";
import type { Examination, GameCase, Lang, Reason, Style, Tool } from "./types.ts";

// Existing saves keep their original units and case facts. Only their display changes.
export const minutes = (units: number) => units * 5;
export const duration = (units: number, lang: Lang) => units ? `${minutes(units)} ${lang === "ru" ? "мин" : "min"}` : lang === "ru" ? "Без затрат времени" : "No time cost";
export const crackSide = (item: GameCase) => 1 + hash(`${item.id}:crack`) % 3;
export const airDepth = (item: GameCase) => item.defect === "age" || item.style === "aged" ? 9 + hash(item.id) % 4 : 3 + hash(item.id) % 3;
export const scaleOffset = (item: GameCase) => item.day < 5 ? 0 : (hash(`${item.id}:zero`) % 5) - 2;
export const expectedAnswer = (item: GameCase, tool: Tool): Reason => reasonTool[item.defect] === tool ? item.defect : "none";
export const profileFacts = {
  blanc: { dome: 9, body: w("Лёгкое", "Light"), finish: w("Меловой", "Chalky") },
  bouillon: { dome: 7, body: w("Плотное", "Dense"), finish: w("Бульонный", "Brothy") },
  pastoral: { dome: 8, body: w("Сливочное", "Creamy"), finish: w("Травяной", "Grassy") },
  aged: { dome: 4, body: w("Плотное", "Dense"), finish: w("Долгий", "Long") },
};
export function actualProfile(item: GameCase): Style {
  const styles: Style[] = ["blanc", "bouillon", "pastoral", "aged"];
  return item.defect === "profile" ? styles[(styles.indexOf(item.style) + 1 + hash(item.id) % 3) % 4] : item.style;
}
export function declaredOrigin(item: GameCase) {
  return item.defect !== "origin" && item.person === "semyon" ? w("Индустриальный Стрим", "Industrial Stream")
    : item.person === "arkady" || item.defect === "origin" ? w("Коллекционный микролот", "Collectible micro-batch") : w("Меловой терруар", "Chalk terroir");
}
export const hasException = (item: GameCase) => item.day === 5 && item.person === "arkady" && item.proofs.some(p => p.id === "pressure1");
export function certificate(item: GameCase) {
  const serial = 20 + hash(item.id) % 70;
  const signature = hash(`${item.id}:signature`) % 3;
  return { seal: `К-${serial}`, signature, until: item.defect === "permit" || hasException(item) ? item.day - 1 : 12, revision: item.returned ? 2 : 1 };
}
export function archiveRecords(item: GameCase) {
  const cert = certificate(item);
  const current = {
    id: `${item.id}:current`, lot: item.lot, revision: cert.revision,
    origin: item.defect === "origin" ? w("Индустриальный Стрим", "Industrial Stream") : declaredOrigin(item),
    seal: item.defect === "seal" ? `К-${Number(cert.seal.slice(2)) + 1}` : cert.seal,
    signature: item.defect === "seal" ? (cert.signature + 1) % 3 : cert.signature,
    until: cert.until, exception: hasException(item),
  };
  const records = [current,
    { ...current, id: `${item.id}:old`, revision: 0, until: Math.max(0, item.day - 1), exception: false },
    { ...current, id: `${item.id}:near`, lot: `${item.lot.slice(0, -1)}${(Number(item.lot.at(-1)) + 1) % 10}`, seal: "К-19", exception: false },
  ];
  return records.sort((a, b) => hash(a.id) - hash(b.id));
}
export const examinationAnswers: Record<Tool, Reason[]> = {
  inspect: ["none", "shell"], scale: ["none", "mass"], light: ["none", "age"],
  plate: ["none", "profile"], archive: ["none", "seal", "origin", "permit"],
};
export function validExamination(item: GameCase, exam: Examination) {
  if (exam.tool === "inspect") return exam.sample === 15;
  if (exam.tool === "scale") return Math.abs(exam.sample - item.mass) < .01;
  if (exam.tool === "light") return Math.abs(exam.sample - airDepth(item)) <= 1;
  if (exam.tool === "plate") return exam.record === actualProfile(item);
  return exam.record === `${item.id}:current`;
}
