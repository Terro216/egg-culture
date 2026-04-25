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
};

export type BlogPost = {
  id: string;
  slug: string;
  title: TranslationString;
  excerpt: TranslationString;
  content: TranslationString;
  date: string;
  image: string;
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
    image:
      "https://images.unsplash.com/photo-1516448653548-c5b57f02377b?q=80&w=1000&auto=format&fit=crop",
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
    image:
      "https://images.unsplash.com/photo-1621251342518-77b31336423d?q=80&w=1000&auto=format&fit=crop",
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
    image:
      "https://images.unsplash.com/photo-1509048191080-d2984bad6ad5?q=80&w=1000&auto=format&fit=crop",
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
    date: "15.10.23",
    image:
      "https://images.unsplash.com/photo-1587486913049-53fe8953f1d2?q=80&w=1200&auto=format&fit=crop",
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
    date: "02.11.23",
    image:
      "https://images.unsplash.com/photo-1598965402089-897ce52e8355?q=80&w=1200&auto=format&fit=crop",
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

export const eventItems: EventItem[] = [
  {
    id: "1",
    slug: "egg-school-flow-2",
    title: {
      ru: "Яичная Школа. Поток II",
      en: "Egg School. Flow II",
    },
    date: "15.11.23",
    image:
      "https://images.unsplash.com/photo-1498654077810-12c21d4d6dc3?q=80&w=1200&auto=format&fit=crop",
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
    date: "05.12.23",
    image:
      "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?q=80&w=1200&auto=format&fit=crop",
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
];
