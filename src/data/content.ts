export type TranslationString = {
  ru: string;
  en: string;
};

export type ShopItem = {
  id: string;
  slug: string;
  title: TranslationString;
  shortDescription: TranslationString;
  description: TranslationString;
  specifications: { label: TranslationString; value: TranslationString }[];
  price: string;
  image: string;
  detailedImage?: string;
};

export type EventItem = {
  id: string;
  slug: string;
  title: TranslationString;
  date: string | null;
  location: TranslationString;
  shortDescription: TranslationString;
  description: TranslationString;
  image: string;
  detailedImage?: string;
};

export const shopItems: ShopItem[] = [
  {
    id: "1",
    slug: "egg-cup-silence",
    title: {
      ru: "Silence",
      en: "Silence",
    },
    shortDescription: {
      ru: "Тёмный шамот. У яйца приём.",
      en: "Dark chamotte. The egg will see you now.",
    },
    description: {
      ru: "Подставка из тёмного шамота для яйца, которому есть что не сказать. Шероховатая глина подчёркивает гладкость скорлупы; каждый экземпляр уникален. Положите телефон экраном вниз. У яйца приём.",
      en: "A dark chamotte egg cup for an egg with something to leave unsaid. Rough clay sets off the smooth shell; each piece is unique. Place your phone face down. The egg will see you now.",
    },
    specifications: [
      { label: { ru: "Материал", en: "Material" }, value: { ru: "Тёмный шамот", en: "Dark chamotte" } },
      { label: { ru: "Вместимость", en: "Capacity" }, value: { ru: "Одно яйцо, без сопровождающих", en: "One egg, unaccompanied" } },
      { label: { ru: "Режим приёма", en: "Consultation mode" }, value: { ru: "В тишине", en: "In silence" } },
    ],
    price: "4 500 ₽",
    // PROMPT: Minimalist product photography of a dark grey chamotte clay egg cup on a smooth dark background, soft side lighting, wabi-sabi aesthetic
    image: "/egg-cup-silence.webp",
  },
  {
    id: "2",
    slug: "adept-spoon",
    title: {
      ru: "L'Essence",
      en: "L'Essence",
    },
    shortDescription: {
      ru: "Перламутр для переговоров с желтком.",
      en: "Mother-of-pearl for delicate yolk negotiations.",
    },
    description: {
      ru: "Лопатка из натурального перламутра для первого контакта с желтком. Подводится плавно, без суеты и разговоров о калориях. Обычная чайная ложка к переговорам не допущена: на прошлом заседании она звенела.",
      en: "A natural mother-of-pearl spoon for first contact with the yolk. Approach slowly, without fuss or discussion of calories. The ordinary teaspoon has been excluded from negotiations: it clinked at the last meeting.",
    },
    specifications: [
      { label: { ru: "Материал", en: "Material" }, value: { ru: "Натуральный перламутр", en: "Natural mother-of-pearl" } },
      { label: { ru: "Назначение", en: "Purpose" }, value: { ru: "Первый контакт с желтком", en: "First contact with the yolk" } },
      { label: { ru: "Обсуждение калорий", en: "Calorie discussion" }, value: { ru: "В повестку не включено", en: "Not on the agenda" } },
    ],
    price: "5 200 ₽",
    // PROMPT: Macro shot of an elegant mother-of-pearl spoon resting on a pristine white marble surface, high-end jewelry lighting
    image: "/adept-spoon.webp",
  },
  {
    id: "3",
    slug: "precision-timer",
    title: {
      ru: "Chronos",
      en: "Chronos",
    },
    shortDescription: {
      ru: "Латунный таймер. «Ещё минуточку» отклонено.",
      en: "Brass timer. Request for one more minute denied.",
    },
    description: {
      ru: "Тяжёлая полированная латунь и механический отсчёт. Пока вы подбираете слово «пастозность», Chronos продолжает считать. Просьбы остановить время, вернуть вчерашний желток или дать ещё минуточку принимаются. На отсчёт они не влияют.",
      en: "Heavy polished brass and a mechanical countdown. While you search for the word 'unctuous', Chronos keeps counting. Requests to stop time, recover yesterday's yolk or grant one more minute may be submitted. They do not affect the countdown.",
    },
    specifications: [
      { label: { ru: "Материал", en: "Material" }, value: { ru: "Полированная латунь", en: "Polished brass" } },
      { label: { ru: "Отсчёт", en: "Countdown" }, value: { ru: "Механический", en: "Mechanical" } },
      { label: { ru: "Продление экспозиции", en: "Exposure extension" }, value: { ru: "По просьбе не предоставляется", en: "Not granted upon request" } },
    ],
    price: "8 800 ₽",
    // PROMPT: Sleek polished brass mechanical timer, brutalist minimalist design, dramatic studio lighting against a black background
    image: "/precision-timer.webp",
  },
  {
    id: "4",
    slug: "dome-plate",
    title: {
      ru: "The Dome Plate",
      en: "The Dome Plate",
    },
    shortDescription: {
      ru: "Фарфоровая сцена. В главной роли — яйцо.",
      en: "A porcelain stage. Starring the egg.",
    },
    description: {
      ru: "Матовый белый фарфор, едва заметное углубление и одно очищенное яйцо в центре внимания. Достаточно свободного места, чтобы оценить форму и выдержать положенную паузу. Ветка укропа считается несанкционированной застройкой.",
      en: "Matte white porcelain, a subtle hollow and one peeled egg at the centre of attention. Enough open space to study the form and observe the prescribed pause. A sprig of dill constitutes unauthorised development.",
    },
    specifications: [
      { label: { ru: "Материал", en: "Material" }, value: { ru: "Матовый белый фарфор", en: "Matte white porcelain" } },
      { label: { ru: "Композиция", en: "Composition" }, value: { ru: "Одно яйцо в центре", en: "One egg at the centre" } },
      { label: { ru: "Допуск гарнира", en: "Garnish clearance" }, value: { ru: "Не выдан", en: "Not granted" } },
    ],
    price: "6 100 ₽",
    // PROMPT: Top-down view of a perfectly minimalist matte white porcelain plate with a very shallow smooth dimple in the center, resting on a white concrete table, soft daylight, ultra-clean aesthetic
    image: "/dome-plate.webp",
  },
  {
    id: "5",
    slug: "chalaza-tweezers",
    title: {
      ru: "Purity",
      en: "Purity",
    },
    shortDescription: {
      ru: "Пинцет для халазы. Владейте собой.",
      en: "Chalaza tweezers. Exercise restraint.",
    },
    description: {
      ru: "Пинцет из хирургической стали с титановым покрытием для точной работы при подготовке яйца. Халаза удерживает желток и в исправлениях не нуждается. Высшая степень владения инструментом — вовремя положить его обратно.",
      en: "Surgical steel tweezers with a titanium coating for precise work when preparing an egg. The chalaza holds the yolk in place and requires no correction. The highest form of mastery is knowing when to put the instrument back.",
    },
    specifications: [
      { label: { ru: "Материал", en: "Material" }, value: { ru: "Хирургическая сталь, титановое покрытие", en: "Surgical steel, titanium coating" } },
      { label: { ru: "Объект внимания", en: "Object of attention" }, value: { ru: "Халаза", en: "The chalaza" } },
      { label: { ru: "Высшая степень владения", en: "Highest level of mastery" }, value: { ru: "Воздержаться от вмешательства", en: "Refraining from intervention" } },
    ],
    price: "3 900 ₽",
    // PROMPT: Macro studio shot of surgical precision tweezers with a matte dark titanium finish, resting on a sleek grey slate board, sharp focus, luxury tool photography
    image: "/chalaza-tweezers.webp",
  },
  {
    id: "6",
    slug: "blanc-piercer",
    title: {
      ru: "Point Blanc",
      en: "Point Blanc",
    },
    shortDescription: {
      ru: "Прокол скорлупы по предварительной записи.",
      en: "Shell piercing by appointment only.",
    },
    description: {
      ru: "Монолитный алюминиевый цилиндр со скрытой иглой для маленького прокола на тупом конце скорлупы. Вмешательство минимальное, выражение лица — предельно серьёзное. После процедуры яйцо направляется в кастрюлю, а инструмент возвращается к молчанию.",
      en: "A solid aluminium cylinder with a concealed needle for a small puncture at the blunt end of the shell. Minimal intervention; an exceptionally serious expression. After the procedure, the egg proceeds to the saucepan and the instrument resumes its silence.",
    },
    specifications: [
      { label: { ru: "Корпус", en: "Body" }, value: { ru: "Монолитный алюминий", en: "Solid aluminium" } },
      { label: { ru: "Рабочий элемент", en: "Working element" }, value: { ru: "Скрытая игла", en: "Concealed needle" } },
      { label: { ru: "Точка входа", en: "Point of entry" }, value: { ru: "Тупой конец скорлупы. Другие входы закрыты.", en: "The blunt end of the shell. All other entrances are closed." } },
    ],
    price: "4 300 ₽",
    // PROMPT: Close up of a minimalist brushed aluminum cylinder, subtle premium design, standing upright on a perfectly smooth white surface, sleek futuristic kitchenware, cinematic lighting
    image: "/blanc-piercer.webp",
  },
  {
    id: "7",
    slug: "qi-incense",
    title: {
      ru: "Aura",
      en: "Aura",
    },
    shortDescription: {
      ru: "Благовония. Завтрак получил атмосферу.",
      en: "Incense. Breakfast has acquired an atmosphere.",
    },
    description: {
      ru: "Благовония с ароматом сухого сена и минералов для подготовки пространства к дегустации. Дым поднимается, разговоры стихают, обычная кухня временно получает статус зала. Яйцо появляется последним: по протоколу оно не занимается организацией.",
      en: "Incense with notes of dry hay and minerals to prepare the space for a tasting. Smoke rises, conversation subsides, and an ordinary kitchen is temporarily designated a hall. The egg arrives last: protocol exempts it from organisational duties.",
    },
    specifications: [
      { label: { ru: "Аромат", en: "Aroma" }, value: { ru: "Сухое сено и минералы", en: "Dry hay and minerals" } },
      { label: { ru: "Выход на сцену", en: "Stage entrance" }, value: { ru: "До появления яйца", en: "Before the egg arrives" } },
      { label: { ru: "Должность", en: "Appointment" }, value: { ru: "Заведующий атмосферой", en: "Head of atmosphere" } },
    ],
    price: "2 500 ₽",
    // PROMPT: Minimalist zen arrangement of thin premium incense sticks leaning against a raw rough stone, delicate wisp of smoke, soft morning light, muted beige and grey tones
    image: "/qi-incense.webp",
  },
];

// Dates are announced by the organisers; do not invent a schedule at build time.
export const eventItems: EventItem[] = [
  {
    id: "1",
    slug: "egg-school-flow-2",
    title: {
      ru: "Яичная Школа. Поток II",
      en: "Egg School. Flow II",
    },
    date: null,
    image: "/egg-school.webp",
    location: {
      ru: "Секретное пространство, Москва",
      en: "Secret space, Moscow",
    },
    shortDescription: {
      ru: "Базовый курс дисциплины восприятия. Три дня погружения в философию и практику формы.",
      en: "Basic course in the discipline of perception. Three days of immersion in the philosophy and practice of form.",
    },
    description: {
      ru: "<p>Программа II потока включает слепые дегустации микролотов и практику настройки тайминга до секунды.</p>",
      en: "<p>The Flow II program includes blind tastings of micro-batches and the practice of tuning one's timing to the second.</p>",
    },
  },
  {
    id: "2",
    slug: "blind-tasting-december",
    title: {
      ru: "Grand Degustation",
      en: "Grand Degustation",
    },
    date: null,
    image: "/blind-tasting.webp",
    location: {
      ru: "Boutique, Moscow",
      en: "Boutique, Moscow",
    },
    shortDescription: {
      ru: "Слепая дегустация пяти редких образцов сезона. Калибровка рецепторов.",
      en: "Blind tasting of five rare samples of the season. Receptor calibration.",
    },
    description: {
      ru: "<p>Встреча для тех, кто готов отличать зерновое дыхание от травяного в послевкусии.</p>",
      en: "<p>A meeting for those ready to distinguish grain breath from herbal breath in the aftertaste.</p>",
    },
  },
  {
    id: "3",
    slug: "meditation-on-yolk",
    title: {
      ru: "Медитация: Взгляд в Желток",
      en: "Meditation: Gaze into the Yolk",
    },
    date: null,
    // PROMPT: Minimalist macro photography of a perfectly round, vibrant golden egg yolk resting on a matte dark grey clay plate, dramatic soft lighting, zen aesthetic, 8k resolution
    image: "/meditation-yolk.webp",
    location: {
      ru: "Галерея 'Форма', Санкт-Петербург",
      en: "Gallery 'Form', Saint Petersburg",
    },
    shortDescription: {
      ru: "Практика поиска Яй Ци через визуальную концентрацию на пастозном теле желтка.",
      en: "The practice of finding Egg Qi through visual concentration on the pasty body of the yolk.",
    },
    description: {
      ru: "<p>Тихое событие. Полное отсутствие света, кроме одного направленного луча на центр экспозиции.</p>",
      en: "<p>A quiet event. Complete absence of light except for a single directed beam on the center of the display.</p>",
    },
  },
  {
    id: "4",
    slug: "white-shell-aesthetics",
    title: {
      ru: "Светлый Стиль (Blanc): Лекция",
      en: "Blanc Style: A Lecture",
    },
    date: null,
    // PROMPT: A single pure white egg levitating above a raw white marble pedestal, high-end gallery lighting, ultra-minimalism, empty white space, Apple style product photography
    image: "/white-shell.webp",
    location: {
      ru: "Лекторий 'Купол', Казань",
      en: "Lecture Hall 'Dome', Kazan",
    },
    shortDescription: {
      ru: "Разрушение мифов о фермерских продуктах и апология идеальной формы белого яйца.",
      en: "Destroying myths about farm products and an apologia for the perfect form of the white egg.",
    },
    description: {
      ru: "<p>Лекция об Эстетике молчания и отказе от грубой классификации индустриального стрима.</p>",
      en: "<p>A lecture on the Aesthetics of Silence and the rejection of the rough classification of the Industrial Stream.</p>",
    },
  },
  {
    id: "5",
    slug: "albumen-texture-workshop",
    title: {
      ru: "Текстура как Текст",
      en: "Texture as Text",
    },
    date: null,
    // PROMPT: Close-up abstract shot of softly cooked egg white, showing delicate textures resembling a white cloud or silk, pure white background, soft subtle shadows
    image: "/albumen-texture.webp",
    location: {
      ru: "Студия 'Альбуминовое Облако', Москва",
      en: "Studio 'Albumin Cloud', Moscow",
    },
    shortDescription: {
      ru: "Воркшоп по оценке упругости 'Альбуминового Облака' и распознаванию 'мелового следа' белка.",
      en: "Workshop on assessing the elasticity of the 'Albumin Cloud' and recognizing the 'Chalky Trail' of the white.",
    },
    description: {
      ru: "<p>Практическая сессия по температурному контролю и деконструкции текстуры белка.</p>",
      en: "<p>Practical session on temperature control and deconstruction of the egg white texture.</p>",
    },
  },
  {
    id: "6",
    slug: "terroir-exploration",
    title: {
      ru: "Яичный Терруар: Экспедиция",
      en: "Egg Terroir: Expedition",
    },
    date: null,
    // PROMPT: A minimalist landscape of a foggy morning meadow with a single elegant hen standing gracefully, muted desaturated colors, misty atmosphere, cinematic art photography
    image: "/terroir-expedition.webp",
    location: {
      ru: "Сбор: Бутик, Москва",
      en: "Gathering: Boutique, Moscow",
    },
    shortDescription: {
      ru: "Выезд на локальную ферму для изучения влияния диеты и климата на текстурно-вкусовой профиль.",
      en: "Trip to a local farm to study the influence of diet and climate on the texture and flavor profile.",
    },
    description: {
      ru: "<p>Понимание того, как регион формирует уникальное Яй Ци. Возвращение к корням Дворового Дикого стиля.</p>",
      en: "<p>Understanding how the region forms a unique Egg Qi. Returning to the roots of the Yard Wild style.</p>",
    },
  },
];
