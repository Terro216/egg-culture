export type TranslationString = {
  ru: string;
  en: string;
};

export type MerchItem = {
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

export const merchItems: MerchItem[] = [
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
      en: "An object created in co-authorship with silence. The dark, coarse texture of the clay emphasizes the fragile perfection of the white shell. Each piece is unique.",
    },
    price: "4 500 ₽",
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
    image: "/precision-timer.webp",
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
      en: "<p>Article is under private review.</p>",
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
      en: "<p>Flow II program includes blind tastings of microlots and practice of timing setup to the second.</p>",
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
      en: "<p>A quiet event. Complete absence of light except for one directed beam on the center of the exposition.</p>",
    },
  },
  {
    id: "4",
    slug: "white-shell-aesthetics",
    title: {
      ru: "Светлый Стиль (Blanc): Лекция",
      en: "Light Style (Blanc): Lecture",
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
      en: "Destroying myths about farm products and an apology for the perfect form of the white egg.",
    },
    description: {
      ru: "<p>Лекция об Эстетике молчания и отказе от грубой классификации индустриального стрима.</p>",
      en: "<p>A lecture on the Aesthetics of Silence and the rejection of the rough classification of the industrial stream.</p>",
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
      en: "Workshop on assessing the elasticity of the 'Dome' and recognizing the 'chalky trace' of the white.",
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
