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
  price: string;
  image: string;
  detailedImage?: string;
};

export type BlogPost = {
  id: string;
  slug: string;
  title: TranslationString;
  excerpt: TranslationString;
  content: TranslationString;
  date: string;
  image: string;
  detailedImage?: string;
};

export type EventItem = {
  id: string;
  slug: string;
  title: TranslationString;
  date: string;
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
      ru: "Подставка из темного шамота",
      en: "Dark chamotte egg cup",
    },
    description: {
      ru: "Объект, созданный в соавторстве с тишиной. Темная, грубая текстура глины подчеркивает хрупкое совершенство белой скорлупы. Каждый экземпляр уникален.",
      en: "An object co-authored with silence. The dark, coarse texture of the clay emphasizes the fragile perfection of the white shell. Each piece is unique.",
    },
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
      ru: "Перламутровая лопатка",
      en: "Mother-of-pearl spoon",
    },
    description: {
      ru: "Инструмент для чистой встречи. Натуральный перламутр химически инертен: он не вступает в реакцию с серой желтка, сохраняя органолептический профиль нетронутым.",
      en: "A tool for a pure encounter. Natural mother-of-pearl is chemically inert: it does not react with the yolk's sulfur, keeping the organoleptic profile intact.",
    },
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
      ru: "Латунный таймер экспозиции",
      en: "Brass exposure timer",
    },
    description: {
      ru: "Тяжелая полированная латунь. Механический отсчет секунд — это ритуал подготовки ума к моменту раскрытия формы. Точность, ставшая весом.",
      en: "Heavy polished brass. The mechanical countdown of seconds is a ritual of preparing the mind for the moment the form unfolds. Precision manifested as weight.",
    },
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
      ru: "Блюдо для Купола",
      en: "Dome Plate",
    },
    description: {
      ru: "Плоское блюдо из матового белого фарфора с едва заметным углублением. Создано для бережной фиксации очищенного яйца, позволяя оценить архитектуру 'Купола' до начала дегустации.",
      en: "A flat plate made of matte white porcelain with a barely noticeable depression. Created to hold the peeled egg gently in place, allowing you to appreciate the architecture of the 'Dome' before tasting.",
    },
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
      ru: "Пинцет для Халазы",
      en: "Chalaza Tweezers",
    },
    description: {
      ru: "Хирургическая сталь с титановым покрытием. Инструмент абсолютного контроля. Позволяет элегантно удалить халазу, не нарушая гармонию 'Альбуминового Облака' при сырой подаче.",
      en: "Surgical steel with titanium coating. An instrument of absolute control. Allows you to elegantly remove the chalaza without disturbing the harmony of the 'Albumin Cloud' during raw serving.",
    },
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
      ru: "Стилет-перфоратор",
      en: "Stiletto Piercer",
    },
    description: {
      ru: "Монолитный алюминиевый цилиндр со скрытой иглой. Микроскопический прокол на тупом конце скорлупы стравливает давление, гарантируя идеальное отделение мембраны и сохраняя форму 'Светлого Стиля (Blanc)'.",
      en: "Monolithic aluminum cylinder with a hidden needle. A microscopic puncture at the blunt end of the shell releases pressure, ensuring perfect membrane separation and preserving the 'Blanc Style' form.",
    },
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
      ru: "Сенсорный камертон",
      en: "Sensory Tuning Fork",
    },
    description: {
      ru: "Набор благовоний с тонким ароматом сухого сена и минералов. Создает 'Вертикаль' перед началом ритуала, очищая рецепторы и подготавливая ум к восприятию тончайших нюансов Яй Ци.",
      en: "A set of incense with a delicate aroma of dry hay and minerals. Creates 'Verticality' before the start of the ritual, clearing receptors and preparing the mind to perceive the subtlest nuances of Egg Qi.",
    },
    price: "2 500 ₽",
    // PROMPT: Minimalist zen arrangement of thin premium incense sticks leaning against a raw rough stone, delicate wisp of smoke, soft morning light, muted beige and grey tones
    image: "/qi-incense.webp",
  },
];

export const blogPosts: BlogPost[] = [
  {
    id: "1",
    slug: "white-vs-dark-eggs",
    title: {
      ru: "Дихотомия цвета: Фарфор против Терракоты",
      en: "Color Dichotomy: Porcelain vs Terracotta",
    },
    date: "15.10.26",
    image: "/white-vs-dark.webp",
    excerpt: {
      ru: "Почему эстетика белого яйца требует большей дисциплины восприятия, чем привычный культ фермерской коричневой скорлупы.",
      en: "Why the aesthetics of a white egg require more discipline of perception than the usual cult of farm brown shells.",
    },
    content: {
      ru: `
        <p>Массовый рынок приучил нас искать в коричневом цвете признак 'натуральности'. Это эстетическая ловушка. Цвет — лишь генетический код, 'одежда' курицы. Но для адепта Яичной Культуры выбор белого яйца — это возвращение к чистому листу, к абсолютной форме.</p>
        <p><strong>Эстетика Молчания</strong></p>
        <p>Белое яйцо не обещает 'деревенского уюта'. Оно холодно, архитектурно и честно. Именно за этой фарфоровой маской чаще всего скрывается самая тонкая минеральность и тот самый меловой финиш, который мы так ценим в ранних партиях Леггорнов.</p>
      `,
      en: `
        <p>The mass market has trained us to look for signs of 'naturalness' in the color brown. This is an aesthetic trap. Color is merely a genetic code, the 'clothing' of the hen. But for an adept of Egg Culture, choosing a white egg is a return to a clean slate, to the absolute form.</p>
      `,
    },
  },
  {
    id: "2",
    slug: "anatomy-of-yolk",
    title: {
      ru: "Текстура как текст: От жидкого к пастообразному",
      en: "Texture as Text: From Liquid to Pasty",
    },
    date: "02.11.26",
    image: "/anatomy-of-yolk.webp",
    excerpt: {
      ru: "Гайд по температурной деконструкции желтка: как поймать момент, когда энергия превращается в пасту.",
      en: "A guide to the thermal deconstruction of the yolk: how to catch the moment when energy turns into paste.",
    },
    content: {
      ru: "<p>Статья находится в закрытой доработке.</p>",
      en: "<p>The article is undergoing closed revision.</p>",
    },
  },
];

const getFutureDate = (minDays: number, maxDays: number) => {
  const days = Math.floor(Math.random() * (maxDays - minDays + 1)) + minDays;
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
};

export const eventItems: EventItem[] = [
  {
    id: "1",
    slug: "egg-school-flow-2",
    title: {
      ru: "Яичная Школа. Поток II",
      en: "Egg School. Flow II",
    },
    date: getFutureDate(4, 10),
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
    date: getFutureDate(4, 10),
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
    date: getFutureDate(4, 10),
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
    date: getFutureDate(4, 10),
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
    date: getFutureDate(4, 10),
    // PROMPT: Close-up abstract shot of softly cooked egg white, showing delicate textures resembling a white cloud or silk, pure white background, soft subtle shadows
    image: "/albumen-texture.webp",
    location: {
      ru: "Студия 'Альбуминовое Облако', Москва",
      en: "Studio 'Albumin Cloud', Moscow",
    },
    shortDescription: {
      ru: "Воркшоп по оценке упругости 'Купола' и распознаванию 'мелового следа' белка.",
      en: "Workshop on assessing the elasticity of the 'Dome' and recognizing the 'Chalky Trail' of the white.",
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
    date: getFutureDate(4, 10),
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
