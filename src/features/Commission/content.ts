import { words as w } from "./types.ts";
import type { Claim, Ending, Person, Proof, Reason, Shift, Tool, Words } from "./types.ts";

export const people: Record<Person, { name: Words; role: Words; initials: string; introduction: Words }> = {
  vera: { name: w("Вера Сомова", "Vera Somova"), role: w("Старший инспектор", "Senior inspector"), initials: "ВС", introduction: w("Сначала запишите то, что увидели. Всё остальное ещё успеет измениться.", "First write down what you saw. Everything else still has time to change.") },
  asya: { name: w("Ася Мелова", "Asya Melova"), role: w("Малый производитель", "Small producer"), initials: "АМ", introduction: w("Куры не знают, что форму заявления опять поменяли.", "The hens don't know the application form has changed again.") },
  arkady: { name: w("Аркадий Латов", "Arkady Latov"), role: w("Куратор коллекции", "Collection curator"), initials: "АЛ", introduction: w("Происхождение — важная часть впечатления. Позвольте мне его изложить.", "Provenance is an important part of the impression. Allow me to present it.") },
  nina: { name: w("Нина Шелест", "Nina Shelest"), role: w("Хранитель архива", "Archive keeper"), initials: "НШ", introduction: w("У документа может быть несколько копий. Дата у него одна.", "A document can have several copies. It has only one date.") },
  semyon: { name: w("Семён Ровный", "Semyon Rovny"), role: w("Технолог Индустриального Стрима", "Industrial Stream technologist"), initials: "СР", introduction: w("Мы делаем обычное яйцо. Не уверен, что это следует скрывать.", "We make an ordinary egg. I'm not sure that needs concealing.") },
  ratin: { name: w("Леонид Ратин", "Leonid Ratin"), role: w("Начальник приёмного отделения", "Head of admissions"), initials: "ЛР", introduction: w("Различие мнений прекрасно до момента подписания протокола.", "Differences of opinion are admirable until it is time to sign the report.") },
};

export const tools: Record<Tool, { title: Words; action: Words; description: Words; cost: number; day: number }> = {
  inspect: { title: w("Осмотр", "Inspection"), action: w("Осмотреть скорлупу", "Inspect the shell"), description: w("Поверните образец, изучите скорлупу и номер. Осмотр не расходует время.", "Turn the specimen and examine its shell and number. Inspection costs no work time."), cost: 0, day: 1 },
  scale: { title: w("Весы", "Scales"), action: w("Взвесить образец", "Weigh the specimen"), description: w("Сравните измерение с диапазоном в паспорте. Допуск: ±2 г.", "Compare the reading with the passport range. Tolerance: ±2 g."), cost: 1, day: 1 },
  light: { title: w("Овоскоп", "Candling lamp"), action: w("Просветить образец", "Candle the specimen"), description: w("Сопоставьте воздушную камеру с заявленной категорией выдержки.", "Compare the air cell with the declared aging category."), cost: 1, day: 2 },
  plate: { title: w("Контрольное блюдце", "Examination dish"), action: w("Вскрыть контрольный образец", "Open the control specimen"), description: w("На исследование расходуется один выделенный образец, а не вся партия. Протокол сохраняется.", "One designated control specimen is used, not the whole batch. Its examination is retained."), cost: 3, day: 4 },
  archive: { title: w("Реестр", "Registry"), action: w("Запросить запись", "Request the record"), description: w("Проверьте печать, срок свидетельства и цепочку происхождения. Найдите нужную редакцию записи и сравните её со свидетельством в паспорте.", "Check the seal, certificate and chain of provenance. Find the correct revision and compare it with the passport certificate."), cost: 2, day: 3 },
};

export const reasonLabels: Record<Reason, Words> = {
  none: w("Соответствует", "Conforms"), mass: w("Несоответствие массы", "Mass discrepancy"), shell: w("Повреждение скорлупы", "Shell damage"),
  age: w("Несоответствие выдержки", "Aging discrepancy"), seal: w("Недействительная печать", "Invalid seal"), origin: w("Подмена происхождения", "False provenance"),
  profile: w("Несоответствие профиля", "Profile discrepancy"), permit: w("Истёкшее свидетельство", "Expired certificate"), procedure: w("Недостаточно исследований", "Required checks missing"),
};
export const styleNames = { blanc: w("Светлый Стиль", "Blanc Style"), bouillon: w("Бульонный Стиль", "Bouillon Style"), pastoral: w("Пасторальный Стиль", "Pastoral Style"), aged: w("Архивный Стиль", "Aged Style") };
export const proofs: Record<Proof, { title: Words; text: Words }> = {
  source1: { title: w("Накладная ИС-41", "Invoice IS-41"), text: w("Заводская накладная связывает серию ИС-41 с Индустриальным Стримом. Позднее тот же номер появляется на паспорте коллекционного микролота.", "A factory invoice identifies IS-41 as Industrial Stream. The same number later appears on a collectible micro-batch passport.") },
  source2: { title: w("Двойная запись", "Duplicate entry"), text: w("Одна поставка зарегистрирована как две партии разного происхождения. Времена погрузки и масса совпадают.", "One shipment is registered as two batches of different provenance. Loading times and weights match.") },
  source3: { title: w("Подпись технолога", "Technologist's signature"), text: w("Семён подтвердил подлинность заводской накладной. У исходной партии нет заявленного коллекционного происхождения.", "Semyon authenticated the factory invoice. The original batch does not have the claimed collectible provenance.") },
  standard1: { title: w("Старая таблица", "Previous standard"), text: w("До поправки Пасторальный и Светлый стили имели самостоятельные критерии. Новая редакция сравнивает оба с одним образцом.", "Before the amendment, Pastoral and Blanc had separate criteria. The new edition compares both against a single specimen.") },
  standard2: { title: w("Пара измерений", "Paired measurements"), text: w("Один образец принят по старому протоколу и отклонён по новому. Измерения не менялись; изменился порог.", "A specimen was accepted under the old protocol and rejected under the new one. Its measurements stayed the same; the threshold changed.") },
  standard3: { title: w("Дата эталона", "Reference date"), text: w("Характеристики нового эталона подписаны до заявленного поступления образца, совпадающего с партией куратора.", "The new reference characteristics were signed before the stated arrival of the specimen matching the curator's batch.") },
  pressure1: { title: w("Письмо об исключении", "Exemption letter"), text: w("Для поставки куратора сделано исключение из правила, по которому другим производителям уже отказали.", "The curator's shipment was exempted from a rule already used to reject other producers.") },
  pressure2: { title: w("Исправленный протокол", "Altered protocol"), text: w("Первичные измерения не совпадают с заключением, исправленным после подписи инспектора. На исправлении стоит служебная виза.", "Original measurements differ from a conclusion altered after the inspector signed it. The alteration bears an administrative endorsement.") },
  pressure3: { title: w("Распоряжение 12-Б", "Directive 12-B"), text: w("Начальник предписывает сохранить итоговую оценку независимо от результата контрольного исследования. Есть входящий номер и подпись.", "The head orders the final grade retained regardless of the control examination. The directive carries a registered number and signature.") },
};
export const claims: Record<Claim, { title: Words; description: Words; required: Proof[] }> = {
  source: { title: w("Подмена происхождения", "Provenance substitution"), description: w("Связать заводскую поставку с коллекционной маркировкой.", "Link the factory shipment to its collectible label."), required: ["source1", "source2", "source3"] },
  standard: { title: w("Подогнанный эталон", "A tailored reference"), description: w("Показать, кому и когда помогла смена критериев.", "Establish who benefited from the changed criteria, and when."), required: ["standard1", "standard2", "standard3"] },
  pressure: { title: w("Вмешательство в экспертизу", "Interference in inspection"), description: w("Подтвердить распоряжения и изменения подписанных заключений.", "Document the orders and changes to signed conclusions."), required: ["pressure1", "pressure2", "pressure3"] },
};

export const shifts: Shift[] = [
  {
    title: w("Первое поступление", "First arrivals"),
    letter: w("До Большой Слепой Встречи двенадцать смен. Вам поручен приём образцов. Вера оставила на столе исправные весы и пустой журнал. Сегодня ошибки считаются учебными.", "Twelve shifts remain until the Grand Blind Meeting. You are assigned to specimen admissions. Vera has left working scales and an empty ledger on your desk. Today's mistakes are part of training."),
    rule: w("Осмотрите и взвесьте каждую партию. Масса должна попадать в указанный диапазон; сквозная трещина — основание для отказа. Укажите наблюдение, на котором основано решение.", "Inspect and weigh every batch. Mass must fall within its declared range; a through-crack is grounds for rejection. Cite the observation supporting your decision."),
    event: w("Вера задерживается у вашего стола. «В журнале пишут результат. В личной тетради — почему он вас смутил». Она предлагает оставить вам старую тетрадь инспектора.", "Vera stops by your desk. ‘The ledger records the result. A personal notebook records why it troubled you.’ She offers you an old inspector's notebook."),
    options: [
      { label: w("Принять тетрадь", "Accept the notebook"), effect: w("Доверие Веры +1 · самостоятельность +1", "Vera's trust +1 · integrity +1"), integrity: 1, relations: { vera: 1 } },
      { label: w("Оставить только официальный журнал", "Keep only the official ledger"), effect: w("Доверие начальника +1 · влияние +1", "Head's trust +1 · influence +1"), influence: 1, relations: { ratin: 1 } },
    ],
  },
  {
    title: w("То, что видно на свету", "What light reveals"),
    letter: w("В отделение доставлен овоскоп. Несколько свежих партий сопровождаются необычно подробными рассказами о выдержке. Рассказы можно выслушать после измерений.", "A candling lamp has arrived. Several fresh batches come with unusually elaborate stories about aging. You may listen to the stories after taking measurements."),
    rule: w("Измерьте камеру в окуляре овоскопа. Для свежего поступления допустимо до 6 мм включительно, для архивной выдержки — от 8 до 13 мм. Одинаковая камера может означать разное: сверяйте категорию в паспорте.", "Measure the air cell in the eyepiece. Fresh arrivals allow up to 6 mm inclusive; aged specimens allow 8–13 mm. The same cell can mean different things: check the passport category."),
    event: w("Ася просит показать ей ваш протокол: она хочет понять, что исправить к следующей поставке. Копия обойдётся отделению в 2 ₽.", "Asya asks to see your report: she wants to understand what to correct for her next shipment. A copy will cost the department 2 ₽."),
    options: [
      { label: w("Выдать объяснение и копию", "Provide an explanation and copy"), effect: w("−2 ₽ · поддержка +1 · доверие Аси +2", "−2 ₽ · solidarity +1 · Asya's trust +2"), budget: -2, solidarity: 1, relations: { asya: 2 } },
      { label: w("Направить к общему справочнику", "Refer her to the general handbook"), effect: w("Без расходов · доверие Аси −1", "No expense · Asya's trust −1"), relations: { asya: -1 } },
    ],
  },
  {
    title: w("Печать и её владелец", "The seal and its owner"),
    letter: w("Нина открыла доступ к реестру. Его ответы содержат срок свидетельства, владельца печати и зарегистрированное происхождение. Подлинная печать ещё не подтверждает любую историю её предъявителя.", "Nina has opened registry access. Replies include certificate validity, seal ownership and registered provenance. A genuine seal does not authenticate every story told by its bearer."),
    rule: w("Проверяйте реестр для партий с архивным направлением. Несуществующая печать и неверное происхождение — разные основания отказа. Ответ сохраняется в деле.", "Check the registry for batches with an archival referral. An unregistered seal and false provenance are distinct rejection grounds. Replies remain in the file."),
    event: w("Нина нашла накладную ИС-41. «Пока это просто бумага. Но вы ведь уже видели этот номер?» Заверенная копия стоит 3 ₽.", "Nina has found invoice IS-41. ‘For now it's just a piece of paper. But you've seen that number already, haven't you?’ A certified copy costs 3 ₽."),
    options: [
      { label: w("Заказать заверенную копию", "Order a certified copy"), effect: w("−3 ₽ · улика «Накладная ИС-41» · доверие Нины +1", "−3 ₽ · exhibit ‘Invoice IS-41’ · Nina's trust +1"), budget: -3, proof: "source1", relations: { nina: 1 } },
      { label: w("Сообщить начальнику о совпадении", "Tell the head about the match"), effect: w("Влияние +1 · доверие начальника +1", "Influence +1 · head's trust +1"), influence: 1, relations: { ratin: 1 } },
    ],
  },
  {
    title: w("Вскрытие формы", "Opening the form"),
    letter: w("Вам выдано контрольное блюдце. Исследуется отдельный образец партии. С этой смены доступно одно личное поручительство: оно покрывает истёкшее свидетельство, но не подделку или дефект.", "An examination dish has been issued. It uses a separate control specimen. From this shift you may make one personal guarantee: it covers an expired certificate, not fraud or a physical defect."),
    rule: w("Профиль устанавливают контрольным вскрытием, если оно указано в направлении. Один лишь цвет скорлупы ничего не доказывает. Поручительство нужно прямо отметить в допуске.", "Examine the control specimen when the referral requires a profile check. Shell colour alone proves nothing. A guarantee must be explicitly recorded in the approval."),
    event: w("Вера показывает две редакции таблицы стилей. В новой исчезла строка о самостоятельном Светлом Стиле. «Пока это проект. Я надеюсь». Она готова дать копию.", "Vera shows you two editions of the style table. The new one omits the independent Blanc criteria. ‘It's still a draft. I hope.’ She can give you a copy."),
    options: [
      { label: w("Сохранить старую таблицу", "Keep the previous standard"), effect: w("Улика «Старая таблица» · самостоятельность +1", "Exhibit ‘Previous standard’ · integrity +1"), proof: "standard1", integrity: 1 },
      { label: w("Поддержать единый стандарт", "Support a unified standard"), effect: w("Влияние +1 · доверие начальника +1", "Influence +1 · head's trust +1"), influence: 1, relations: { ratin: 1 } },
    ],
  },
  {
    title: w("Исключение из порядка", "An exception to order"),
    letter: w("Сегодня придут Ася и Аркадий — оба с просроченными свидетельствами. У Аркадия есть письмо начальника. Найдите его в реестре и проверьте, кому именно разрешён допуск. После обслуживания также проверьте ноль на весах.", "Asya and Arkady both arrive with expired certificates today. Arkady carries a letter from the head. Find it in the registry and check exactly whom it permits. Also check the scale zero after servicing."),
    rule: w("На уточнении может находиться не более двух дел. Они вернутся завтра с дополнительными сведениями; физические дефекты от ожидания не исчезают. Последняя смена не допускает отсрочки.", "At most two files may await clarification. They return tomorrow with additional information; waiting does not remove physical defects. Deferral is unavailable on the final shift."),
    event: w("Аркадий предлагает оплатить расходные материалы. «Без обязательств. Только не отправляйте мою коллекцию в общую очередь». Предложение поступило письменно.", "Arkady offers to cover your supplies. ‘No obligations. Just don't put my collection in the general queue.’ The offer is in writing."),
    options: [
      { label: w("Зарегистрировать предложение в досье", "Register the offer in your dossier"), effect: w("Улика «Письмо об исключении» · самостоятельность +1", "Exhibit ‘Exemption letter’ · integrity +1"), proof: "pressure1", integrity: 1 },
      { label: w("Принять помощь куратора", "Accept the curator's assistance"), effect: w("+6 ₽ · влияние +2 · доверие Аркадия +2", "+6 ₽ · influence +2 · Arkady's trust +2"), budget: 6, influence: 2, relations: { arkady: 2 } },
    ],
  },
  {
    title: w("Обычное яйцо", "An ordinary egg"),
    letter: w("Семён привёз калибровочную партию Индустриального Стрима. Её описание короткое и проверяемое. На соседней коробке коллекционного поставщика обнаруживается знакомая маркировка.", "Semyon has brought an Industrial Stream calibration batch. Its description is brief and verifiable. A neighbouring collectible box bears a familiar mark."),
    rule: w("Честно заявленный Индустриальный Стрим допускается на своих основаниях. Нарушение — выдавать его за другое происхождение. Отказывайте по доказанному несоответствию.", "Honestly declared Industrial Stream is admissible on its own terms. The violation is passing it off as another provenance. Reject on a demonstrated discrepancy."),
    event: w("Семён согласен подписать показания о заводской поставке. Он просит указать, что его предприятие не выпускало поддельных коллекционных паспортов.", "Semyon will sign a statement about the factory shipment. He asks you to make clear that his plant did not issue the forged collectible passports."),
    options: [
      { label: w("Принять точные показания", "Take an accurate statement"), effect: w("Улика «Подпись технолога» · поддержка +1 · доверие Семёна +2", "Exhibit ‘Technologist's signature’ · solidarity +1 · Semyon's trust +2"), proof: "source3", solidarity: 1, relations: { semyon: 2 } },
      { label: w("Передать разговор куратору", "Relay the conversation to the curator"), effect: w("Влияние +2 · доверие Аркадия +1 · доверие Семёна −2", "Influence +2 · Arkady's trust +1 · Semyon's trust −2"), influence: 2, relations: { arkady: 1, semyon: -2 } },
    ],
  },
  {
    title: w("Две даты", "Two dates"),
    letter: w("Объявлен проект «Единая форма». Все школы должны стать сопоставимыми. На вашем столе оказываются предыдущий эталон и образец нового. Подписи на документах поставлены в разное время.", "The ‘Unified Form’ project is announced. All schools are to become comparable. The previous reference and a new specimen reach your desk. Their documents were signed at different times."),
    rule: w("Дело хранит редакцию регламента, действовавшую при поступлении. Новые требования не отменяют прежние измерения. Сравнивайте обе записи до выводов.", "A file retains the regulation in force when it arrived. New requirements do not erase old measurements. Compare both records before drawing conclusions."),
    event: w("Нина обнаружила дату подписания нового эталона. На тот момент образец ещё не числился в приёмном журнале. Она готова заверить выписку, если её имя останется в документе.", "Nina found the date the new reference was signed. The specimen had not yet appeared in the admissions ledger. She will certify the extract if her name stays on it."),
    options: [
      { label: w("Сохранить выписку с авторством", "Retain the attributed extract"), effect: w("Улика «Дата эталона» · доверие Нины +2", "Exhibit ‘Reference date’ · Nina's trust +2"), proof: "standard3", relations: { nina: 2 } },
      { label: w("Убедить её пока не вмешиваться", "Persuade her to stay out for now"), effect: w("Влияние +1 · доверие Нины −1", "Influence +1 · Nina's trust −1"), influence: 1, relations: { nina: -1 } },
    ],
  },
  {
    title: w("Под вашей подписью", "Beneath your signature"),
    letter: w("Вернулся один из закрытых протоколов. Заключение в нём выглядит знакомо, но последнее слово исправлено. Приём продолжается; первичные измерения доступны в архиве.", "A closed report has returned. Its conclusion looks familiar, but the last word has been changed. Admissions continue; original measurements remain in the archive."),
    rule: w("Сохраняйте первичные наблюдения. Служебное заключение может оспариваться отдельно от измерений. Политическое взыскание можно обжаловать по собранным документам.", "Retain original observations. An administrative conclusion can be challenged separately from measurements. A political sanction can be appealed with collected documents."),
    event: w("Вера признаётся: однажды она согласилась с таким исправлением. «Я думала, оно единственное». Она предлагает вместе подписать заявление о сохранении первичного протокола.", "Vera admits she once accepted such an alteration. ‘I thought it was the only one.’ She offers to co-sign a request to preserve the original report."),
    options: [
      { label: w("Подписать заявление вместе", "Co-sign the request"), effect: w("Улика «Исправленный протокол» · самостоятельность +1 · доверие Веры +2", "Exhibit ‘Altered protocol’ · integrity +1 · Vera's trust +2"), proof: "pressure2", integrity: 1, relations: { vera: 2 } },
      { label: w("Согласовать исправление", "Approve the alteration"), effect: w("+4 ₽ · влияние +2 · доверие Веры −2", "+4 ₽ · influence +2 · Vera's trust −2"), budget: 4, influence: 2, relations: { vera: -2 } },
    ],
  },
  {
    title: w("Место за столом", "A place at the table"),
    letter: w("Список участников Встречи почти закрыт. Несколько небольших производителей готовят собственную дегустацию. Для неё нужны образцы, помещение и люди, готовые отвечать за свои слова.", "The Meeting's participant list is nearly closed. Several small producers are preparing their own tasting. They need specimens, a room and people willing to stand by their words."),
    rule: w("Партии рассматриваются по собственным документам. Репутация знакомого поставщика не заменяет обязательное исследование. Поручительство покрывает только свидетельство.", "Assess each batch on its own documents. A familiar supplier's reputation does not replace required checks. A guarantee covers only the certificate."),
    event: w("Ася нашла небольшую комнату для независимой Слепой Встречи. Нужны 4 ₽ на аренду. Никто не обещает, что гости придут без официального приглашения.", "Asya found a small room for an independent Blind Meeting. Rent costs 4 ₽. No one promises that guests will come without an official invitation."),
    options: [
      { label: w("Помочь с помещением", "Help secure the room"), effect: w("−4 ₽ · поддержка +3 · доверие Аси +2", "−4 ₽ · solidarity +3 · Asya's trust +2"), budget: -4, solidarity: 3, relations: { asya: 2 } },
      { label: w("Остаться в официальной программе", "Remain with the official programme"), effect: w("Влияние +1 · доверие начальника +1", "Influence +1 · head's trust +1"), influence: 1, relations: { ratin: 1 } },
    ],
  },
  {
    title: w("Распоряжение 12-Б", "Directive 12-B"),
    letter: w("На столе лежит подписанное распоряжение: сохранить оценку контрольной партии независимо от повторного исследования. Инструменты исправны. Документы и наблюдения придётся разделить особенно точно.", "A signed order lies on your desk: retain the control batch's grade regardless of re-examination. Your instruments work. Documents and observations will need especially careful separation."),
    rule: w("Фиксируйте результаты даже при служебном вмешательстве. Отклонение привилегированной партии может вызвать административную претензию; это не делает измерение ошибочным.", "Record results even under administrative interference. Rejecting a privileged batch may trigger a political complaint; that does not make the measurement incorrect."),
    event: w("Ратин вызывает вас после смены. «Когда каждый считает себя последней инстанцией, культура распадается». Он просит оставить распоряжение внутри отделения.", "Ratin summons you after the shift. ‘When everyone believes they are the final authority, culture falls apart.’ He asks that the directive stay within the department."),
    options: [
      { label: w("Зарегистрировать распоряжение как доказательство", "Register the directive as evidence"), effect: w("Улика «Распоряжение 12-Б» · самостоятельность +2 · доверие начальника −1", "Exhibit ‘Directive 12-B’ · integrity +2 · head's trust −1"), proof: "pressure3", integrity: 2, relations: { ratin: -1 } },
      { label: w("Договориться о своей роли", "Negotiate your future role"), effect: w("Влияние +3 · доверие начальника +2", "Influence +3 · head's trust +2"), influence: 3, relations: { ratin: 2 } },
    ],
  },
  {
    title: w("Последняя сверка", "Final cross-check"),
    letter: w("Завтра состоится Встреча. Сегодня можно проверить копии, восстановить недостающие связи и решить, кто готов подтвердить ваши выводы. Неподтверждённое подозрение останется подозрением.", "The Meeting is tomorrow. Today you can verify copies, restore missing links and establish who will corroborate your findings. An unconfirmed suspicion remains a suspicion."),
    rule: w("Для каждого вывода досье нужны любые два из трёх независимых подтверждений. Вывод оформляется отдельно. Поздние копии проверяются так же внимательно, как первые.", "Each dossier conclusion needs any two of its three independent exhibits. File the conclusion explicitly. Late copies need the same scrutiny as the first ones."),
    event: w("Аркадий предлагает место хранителя новой коллекции. Он знает, что вы многое поняли. «Вопрос теперь в том, что вы намерены с этим сделать». Рядом ждёт Нина с открытым архивом.", "Arkady offers you the position of keeper of a new collection. He knows how much you have understood. ‘The question is what you intend to do with it.’ Nina waits nearby with the archive open."),
    options: [
      { label: w("Попросить Нину подтвердить цепочку", "Ask Nina to corroborate the chain"), effect: w("Улика «Двойная запись» · доверие Нины +1 · самостоятельность +1", "Exhibit ‘Duplicate entry’ · Nina's trust +1 · integrity +1"), proof: "source2", integrity: 1, relations: { nina: 1 } },
      { label: w("Принять предложение коллекции", "Accept the collection's offer"), effect: w("+8 ₽ · влияние +3 · доверие Аркадия +2", "+8 ₽ · influence +3 · Arkady's trust +2"), budget: 8, influence: 3, relations: { arkady: 2 } },
    ],
  },
  {
    title: w("Большая Слепая Встреча", "The Grand Blind Meeting"),
    letter: w("В зале снимают именные этикетки с образцов. Впервые за двенадцать смен яйцо будет представлять само себя. Вам осталось закрыть приём и решить, какой протокол прочтут вслух.", "Name labels are being removed in the hall. For the first time in twelve shifts, an egg will represent itself. Finish admissions and decide which report will be read aloud."),
    rule: w("Приём окончательный: отсрочки закрыты. Обязательные исследования и право на личное поручительство сохраняются. После смены вы сможете завершить досье и выступить.", "Admissions are final: deferrals are closed. Required examinations and your personal guarantee remain available. After the shift, complete your dossier and choose how to act."),
    event: w("Вера раскладывает перед вами чистый бланк, личное досье и программу независимой встречи. «Теперь подпись действительно ваша». В коридоре объявляют начало.", "Vera lays out a clean form, your dossier and the independent meeting's programme. ‘Now the signature really is yours.’ The opening is announced in the corridor."),
    options: [
      { label: w("Сохранить все первичные протоколы", "Preserve all original reports"), effect: w("Самостоятельность +1 · доверие Веры +1", "Integrity +1 · Vera's trust +1"), integrity: 1, relations: { vera: 1 } },
      { label: w("Подготовить служебное выступление", "Prepare the official address"), effect: w("Влияние +1 · доверие начальника +1", "Influence +1 · head's trust +1"), influence: 1, relations: { ratin: 1 } },
    ],
  },
];

export const endingCopy: Record<Ending, { title: Words; lead: Words; text: Words }> = {
  approved: { title: w("Утверждённая форма", "The approved form"), lead: w("Порядок принят единогласно. Воздержавшихся не внесли в протокол.", "Order was adopted unanimously. Abstentions were omitted from the minutes."), text: w("Вы подписываете официальный доклад. Критерии становятся понятнее, ваша должность — выше. В следующем сезоне на столе заметно меньше разных партий. Некоторые поставщики больше не приходят. Новая инструкция безупречно объясняет их отсутствие.", "You sign the official report. The criteria become clearer and your position more senior. Next season, fewer distinct batches reach your desk. Some suppliers no longer visit. The new manual explains their absence impeccably.") },
  open: { title: w("Открытый протокол", "The open record"), lead: w("Впервые в зале обсуждают не происхождение яйца, а происхождение заключения.", "For once, the hall debates the provenance of a verdict rather than of an egg."), text: w("Вы предъявляете подтверждённые связи, первичные измерения и подписанные распоряжения. Программу Встречи приостанавливают. Пересмотр затрагивает влиятельных кураторов и знакомых малых производителей. Комиссия сохраняется, но теперь каждое исключение должно оставлять видимый след. Ваш стол остаётся прежним. Молчать за ним стало труднее.", "You present corroborated links, original measurements and signed directives. The Meeting is suspended. The review reaches influential curators and familiar small producers alike. The Commission survives, but every exception must now leave a visible record. Your desk remains the same. Silence behind it has become harder.") },
  free: { title: w("Свободная дегустация", "The independent tasting"), lead: w("На столе нет герба. Места хватает всем образцам.", "There is no official crest on the table. Every specimen has a place."), text: w("Вы приходите в небольшую комнату, подготовленную производителями. У неё нет официальной программы и почти нет бюджета. Образцы подписаны только номерами. Люди спорят, ошибаются, возвращаются к блюдцам. Служебная карьера заканчивается, а практика продолжается. Первую запись в общем журнале вы делаете от руки.", "You arrive in the small room the producers prepared. It has no official programme and almost no budget. Specimens carry only numbers. People disagree, make mistakes and return to the dishes. Your institutional career ends; the practice continues. You write the shared ledger's first entry by hand.") },
  private: { title: w("Частная коллекция", "The private collection"), lead: w("Все документы на месте. Не все документы доступны.", "Every document is accounted for. Not every document is accessible."), text: w("Вы принимаете место в коллекции. Связи, образцы и архивные сведения становятся частью вашей работы. Вы знаете, какие истории можно проверить, а какие удобнее оставить закрытыми. Комиссия продолжает утверждать форму. Вы научились определять её цену.", "You accept a position in the collection. Connections, specimens and archival knowledge become your trade. You know which stories can be verified and which are more useful sealed. The Commission continues to approve the form. You have learned to determine its price.") },
  dismissed: { title: w("Дело закрыто", "File closed"), lead: w("Ваши полномочия прекращены. Первичные наблюдения остаются в архиве.", "Your authority has ended. Your original observations remain in the archive."), text: w("Три действующих взыскания приводят к отстранению. На стол кладут акт передачи инструментов. Незакрытые дела достанутся следующему инспектору. Можно вернуться к началу последней смены: её образцы и документы останутся теми же.", "Three active sanctions lead to dismissal. An equipment handover form arrives on your desk. The next inspector inherits the open files. You may return to the start of the last shift: its specimens and documents will remain unchanged.") },
};

export const achievementCopy: Record<string, { title: Words; text: Words }> = {
  first: { title: w("Первая подпись", "First signature"), text: w("Завершить первую смену.", "Finish the first shift.") },
  precise: { title: w("Без замечаний", "No remarks"), text: w("Закрыть смену без ошибок, выполнив норму.", "Meet a shift's quota without errors.") },
  instruments: { title: w("Полный инструментарий", "Every instrument"), text: w("Использовать все пять инструментов.", "Use all five instruments.") },
  guarantee: { title: w("Под мою ответственность", "On my responsibility"), text: w("Обоснованно поручиться за партию.", "Issue a justified personal guarantee.") },
  appeal: { title: w("Особое мнение", "Dissenting opinion"), text: w("Добиться снятия административного взыскания.", "Successfully appeal a political sanction.") },
  dossier: { title: w("Цепочка происхождения", "Chain of provenance"), text: w("Подтвердить все три вывода досье.", "Substantiate all three dossier conclusions.") },
  daily: { title: w("Дежурный инспектор", "Duty inspector"), text: w("Завершить ежедневную смену.", "Complete a daily shift.") },
  approved: { title: endingCopy.approved.title, text: w("Завершить официальную карьерную линию.", "Complete the official career path.") },
  open: { title: endingCopy.open.title, text: w("Представить подтверждённое расследование.", "Present a corroborated investigation.") },
  free: { title: endingCopy.free.title, text: w("Помочь независимой Слепой Встрече состояться.", "Help the independent Blind Meeting take place.") },
  private: { title: endingCopy.private.title, text: w("Принять место в частной коллекции.", "Accept a position in the private collection.") },
};

export function epilogue(person: Person, relation: number): Words {
  const texts: Record<Person, [Words, Words]> = {
    vera: [w("Вера сохранила вашу тетрадь. На первой странице появилась её подпись.", "Vera kept your notebook. Her signature now appears on its first page."), w("Вера продолжает учить новых инспекторов записывать первичные наблюдения.", "Vera continues teaching new inspectors to record their original observations.")],
    asya: [w("Ася прислала новый микролот. Документы оформлены правильно. В коробке оставлена записка с благодарностью.", "Asya sent a new micro-batch. Its documents are correct. A note of thanks is tucked into the box."), w("Ася нашла другой способ представить свои партии. В вашем журнале её имя больше не появляется.", "Asya found another way to present her batches. Her name no longer appears in your ledger.")],
    arkady: [w("Аркадий продолжает приглашать вас на закрытые просмотры. Теперь он внимательнее выбирает слова о происхождении.", "Arkady still invites you to private viewings. He now chooses his words about provenance more carefully."), w("Аркадий сменил посредника. На новых паспортах его фамилия напечатана мельче.", "Arkady changed intermediaries. His surname is printed smaller on the new passports.")],
    nina: [w("Нина выделила для ваших материалов отдельную архивную папку. Копии доступны по запросу.", "Nina assigned your materials their own archive folder. Copies are available on request."), w("Нина продолжает хранить документы. Не все из них она готова показать вам снова.", "Nina continues to preserve documents. She is not willing to show you all of them again.")],
    semyon: [w("Семён оставил в паспорте простую строку: «Индустриальный Стрим». Он считает, что этого достаточно.", "Semyon kept a simple line in the passport: ‘Industrial Stream’. He considers it sufficient."), w("Семён больше не даёт неофициальных пояснений. Все вопросы теперь принимаются письменно.", "Semyon no longer offers informal explanations. Questions must now be submitted in writing.")],
    ratin: [w("Ратин отмечает вашу способность доводить дела до конца. В его оценке это самое важное качество инспектора.", "Ratin notes your ability to bring matters to a conclusion. To him, it is an inspector's most important quality."), w("Ратин называет произошедшее издержками переходного периода. Новая инструкция уже готовится.", "Ratin calls what happened a cost of transition. A new instruction is already being drafted.")],
  };
  return texts[person][relation >= 2 ? 0 : 1];
}
