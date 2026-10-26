import React, { useId, useState } from "react";

const wheelData = [
  {
    category: "Mineral",
    title: "Минеральные",
    modes: ["white"],
    subcategories: [
      {
        name: "Chalky",
        title: "Меловые",
        items: [
          {
            name: "Dry chalk",
            title: "Сухой мел",
            color: "#FFFFFF",
            desc: "Ощущение сухости и чистоты, характерно для свежего белка без добавок.",
            descEn: "A dry, clean sensation, typical of fresh egg white without additions.",
          },
          {
            name: "Limestone",
            title: "Известняк",
            color: "#EAEAEA",
            desc: "Легкая минеральность, напоминает запах чистой скорлупы.",
            descEn: "A light minerality reminiscent of the scent of a clean shell.",
          },
          {
            name: "Gypsum",
            title: "Гипс",
            color: "#F2F2F2",
            desc: "Плотный, чуть вяжущий профиль белка.",
            descEn: "A dense, slightly astringent egg-white profile.",
          },
        ],
      },
      {
        name: "Stone",
        title: "Каменные",
        items: [
          {
            name: "Wet stone",
            title: "Мокрый камень",
            color: "#BDBDBD",
            desc: "Чистый, прохладный аромат, часто встречается в качественных фабричных яйцах.",
            descEn: "A clean, cool aroma often found in well-made industrial eggs.",
          },
          {
            name: "Flint",
            title: "Кремень",
            color: "#9E9E9E",
            desc: "Острый, холодный профиль.",
            descEn: "A sharp, cool profile.",
          },
        ],
      },
      {
        name: "Metallic",
        title: "Металлические",
        items: [
          {
            name: "Iron water",
            title: "Железистая вода",
            color: "#A7B1B5",
            desc: "Легкий металлический привкус, связанный с минеральным составом воды для птиц.",
            descEn: "A light metallic note associated with the mineral composition of the hens’ water.",
          },
          {
            name: "Aluminum spoon",
            title: "Алюминиевая ложка",
            color: "#D1D5D8",
            desc: "Гладкий, стерильный вкус с легкой прохладой.",
            descEn: "A smooth, neutral taste with a cool finish.",
          },
          {
            name: "Raw blood",
            title: "Сырая кровь",
            color: "#E57373",
            desc: "Специфический железистый профиль, иногда признак стресса птицы.",
            descEn: "A distinct iron-like profile, sometimes a sign of stress in the hen.",
          },
        ],
      },
    ],
  },
  {
    category: "Dairy & Creamy",
    title: "Молочные и сливочные",
    modes: ["yolk"],
    subcategories: [
      {
        name: "Fresh",
        title: "Свежие",
        items: [
          {
            name: "Cream 20%",
            title: "Сливки 20%",
            color: "#FFF9E3",
            desc: "Округлая, мягкая текстура свежего желтка.",
            descEn: "The rounded, soft texture of a fresh yolk.",
          },
          {
            name: "Milk foam",
            title: "Молочная пенка",
            color: "#FEFEE9",
            desc: "Легкость и сладость.",
            descEn: "Lightness and sweetness.",
          },
          {
            name: "Unsalted butter",
            title: "Несоленое масло",
            color: "#FFF5BA",
            desc: "Богатый, жирный вкус с гладким послевкусием.",
            descEn: "A rich, buttery taste with a smooth finish.",
          },
        ],
      },
      {
        name: "Fermented",
        title: "Ферментированные",
        items: [
          {
            name: "Neutral yogurt",
            title: "Нейтральный йогурт",
            color: "#F5F5DC",
            desc: "Легкая кислинка, балансирующая жирность.",
            descEn: "A gentle acidity that balances the richness.",
          },
          {
            name: "Cream cheese",
            title: "Творожный сыр",
            color: "#FFFDD0",
            desc: "Плотность и кремовость.",
            descEn: "Density and creaminess.",
          },
        ],
      },
      {
        name: "Sweet",
        title: "Сладкие",
        items: [
          {
            name: "Sugar-free ice cream",
            title: "Пломбир без сахара",
            color: "#FFFFF0",
            desc: "Холодная, тающая сладость.",
            descEn: "Cool, melting sweetness.",
          },
          {
            name: "Baked milk",
            title: "Топленое молоко",
            color: "#F3E5AB",
            desc: "Теплый, карамелизованный оттенок.",
            descEn: "A warm, caramelised note.",
          },
        ],
      },
    ],
  },
  {
    category: "Grain & Feed",
    title: "Зерновые и кормовые",
    modes: ["yolk"],
    subcategories: [
      {
        name: "Light grains",
        title: "Светлые злаки",
        items: [
          {
            name: "Raw dough",
            title: "Сырое тесто",
            color: "#F3E3C3",
            desc: "Мучнистый, сытный профиль.",
            descEn: "A floury, substantial profile.",
          },
          {
            name: "Oat flakes",
            title: "Овсяные хлопья",
            color: "#ECE0C1",
            desc: "Мягкий зерновой тон, признак качественного корма.",
            descEn: "A soft grain note associated with good feed.",
          },
          {
            name: "Rice water",
            title: "Рисовая вода",
            color: "#FAF9F6",
            desc: "Очень нейтральный, чистый крахмалистый вкус.",
            descEn: "A very neutral, clean, starchy taste.",
          },
        ],
      },
      {
        name: "Rich grains",
        title: "Насыщенные злаки",
        items: [
          {
            name: "Sweet corn",
            title: "Сладкая кукуруза",
            color: "#FFD700",
            desc: "Яркий, сладковатый профиль, часто от кукурузного откорма.",
            descEn: "A bright, sweetish profile, often associated with corn feed.",
          },
          {
            name: "Wheat bran",
            title: "Пшеничные отруби",
            color: "#D2B48C",
            desc: "Сухой, слегка пыльный, но приятный вкус.",
            descEn: "A dry, slightly dusty but pleasant taste.",
          },
          {
            name: "Dry straw",
            title: "Сухая солома",
            color: "#E4D96F",
            desc: "Сенные ноты, типичные для фермерских яиц.",
            descEn: "Hay notes typical of farm eggs.",
          },
        ],
      },
    ],
  },
  {
    category: "Animal & Savory",
    title: "Животные и умами",
    modes: ["yolk"],
    subcategories: [
      {
        name: "Bird",
        title: "Птичьи",
        items: [
          {
            name: "Wet down",
            title: "Мокрый пух",
            color: "#F5F5F5",
            desc: "Специфический животный аромат.",
            descEn: "A distinctive animal aroma.",
          },
          {
            name: "Warm feather",
            title: "Теплое перо",
            color: "#D7CCC8",
            desc: "Характерно для дворовых яиц свободного выгула. Указывает на высокую витальность курицы.",
            descEn: "Typical of free-range yard eggs; a sign of a lively hen.",
          },
          {
            name: "Chicken air",
            title: "Куриный дух",
            color: "#BCAAA4",
            desc: "Аромат курятника, признак минимальной обработки и ручного сбора.",
            descEn: "The aroma of a henhouse, associated with minimal processing and hand collection.",
          },
        ],
      },
      {
        name: "Broth",
        title: "Бульон (Умами)",
        items: [
          {
            name: "Weak bone broth",
            title: "Слабый костный бульон",
            color: "#E0C097",
            desc: "Легкая мясная насыщенность.",
            descEn: "A gentle, savoury richness.",
          },
          {
            name: "Yolk paste",
            title: "Желточная паста",
            color: "#F4A460",
            desc: "Концентрированный, густой вкус желтка.",
            descEn: "The concentrated, dense taste of yolk.",
          },
          {
            name: "Chicken skin",
            title: "Куриная кожа",
            color: "#DEB887",
            desc: "Жирный, очень насыщенный вкус с нотами птицы.",
            descEn: "A rich, fatty taste with poultry notes.",
          },
        ],
      },
    ],
  },
  {
    category: "Sulfur & Earthy",
    title: "Сернистые и земляные",
    modes: ["white", "yolk"],
    subcategories: [
      {
        name: "Pure sulfur",
        title: "Чистая сера",
        items: [
          {
            name: "Lit match",
            title: "Зажженная спичка",
            color: "#FFFF8D",
            desc: "Резкий сернистый профиль, типичный для переваренных яиц.",
            descEn: "A sharp sulphurous profile typical of overcooked eggs.",
          },
          {
            name: "Wet sulfur",
            title: "Мокрая сера",
            color: "#C0CA33",
            desc: "Признак высокого содержания аминокислот.",
            descEn: "A note associated with a high amino-acid content.",
          },
        ],
      },
      {
        name: "Earthy",
        title: "Землистые",
        items: [
          {
            name: "Damp cellar",
            title: "Сырой погреб",
            color: "#8D6E63",
            desc: "Ноты влаги и земли.",
            descEn: "Notes of dampness and earth.",
          },
          {
            name: "Wet black soil",
            title: "Влажный чернозем",
            color: "#4E342E",
            desc: "Глубокий земляной тон, характерен для свободного выгула в дождливую погоду.",
            descEn: "A deep, earthy note associated with free-range hens in rainy weather.",
          },
          {
            name: "Forest floor",
            title: "Лесная подстилка",
            color: "#6D4C41",
            desc: "Органический, сложный профиль перегноя и листвы.",
            descEn: "An organic, complex profile of humus and leaves.",
          },
        ],
      },
    ],
  },
  {
    category: "Textural",
    title: "Текстурные",
    modes: ["white", "yolk"],
    subcategories: [
      {
        name: "White",
        title: "Белковые",
        items: [
          {
            name: "Glassy",
            title: "Стеклянный",
            color: "#E1F5FE",
            desc: "Гладкая, полупрозрачная текстура без ярко выраженного вкуса.",
            descEn: "A smooth, translucent texture without a strong flavour.",
          },
          {
            name: "Silky",
            title: "Шелковистый",
            color: "#F3E5F5",
            desc: "Нежное, скользящее ощущение на языке.",
            descEn: "A delicate sensation that glides across the tongue.",
          },
          {
            name: "Stringy",
            title: "Волокнистый",
            color: "#E8F5E9",
            desc: "Плотные белковые жгутики, признак свежести.",
            descEn: "Firm strands of egg white, a sign of freshness.",
          },
        ],
      },
      {
        name: "Yolk",
        title: "Желточные",
        items: [
          {
            name: "Melting",
            title: "Тающий",
            color: "#FFF9C4",
            desc: "Идеальная консистенция, обволакивающая нёбо.",
            descEn: "A texture that gently coats the palate.",
          },
          {
            name: "Pasty",
            title: "Пастообразный",
            color: "#FFE082",
            desc: "Густая, вязкая текстура, часто в перепелиных или цесариных яйцах.",
            descEn: "A thick, viscous texture often found in quail or guinea-fowl eggs.",
          },
          {
            name: "Waxy",
            title: "Восковой",
            color: "#FFD54F",
            desc: "Слегка резиновый, плотный желток (характерно для некоторых фабричных).",
            descEn: "A firm, slightly rubbery yolk, typical of some industrial eggs.",
          },
        ],
      },
    ],
  },
  {
    category: "Defects",
    title: "Дефекты",
    modes: ["white", "yolk"],
    subcategories: [
      {
        name: "Technical",
        title: "Технические",
        items: [
          {
            name: "Old cardboard",
            title: "Старый картон",
            color: "#A1887F",
            desc: "Запах упаковки, впитавшийся в пористую скорлупу.",
            descEn: "The smell of packaging absorbed through the porous shell.",
          },
          {
            name: "Refrigerator",
            title: "Холодильник",
            color: "#B0BEC5",
            desc: "Впитывание посторонних запахов при неправильном хранении.",
            descEn: "Unwanted odours absorbed during unsuitable storage.",
          },
          {
            name: "Pharmacy/Iodine",
            title: "Аптека/Йод",
            color: "#9575CD",
            desc: "Лекарственный привкус от добавок в корм.",
            descEn: "A medicinal note from feed additives.",
          },
        ],
      },
      {
        name: "Biological",
        title: "Биологические",
        items: [
          {
            name: "Fish meal",
            title: "Рыбная мука",
            color: "#90A4AE",
            desc: "Специфический рыбный привкус из-за избытка рыбной муки в рационе.",
            descEn: "A distinct fishy note associated with too much fish meal in the feed.",
          },
          {
            name: "Mustiness",
            title: "Затхлость",
            color: "#78909C",
            desc: "Признак старого яйца или хранения во влажной среде.",
            descEn: "A sign of an old egg or storage in damp conditions.",
          },
          {
            name: "Ammonia",
            title: "Аммиак",
            color: "#DCEDC8",
            desc: "Резкий запах, свидетельствующий о порче продукта.",
            descEn: "A sharp smell indicating spoilage.",
          },
        ],
      },
    ],
  },
];

function getContrastText(hexcolor) {
  const hex = hexcolor.slice(1);
  const rgb = (hex.length === 3 ? [...hex].map(c => c + c).join("") : hex)
    .match(/../g).map(c => parseInt(c, 16) / 255);
  const linear = rgb.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = linear.reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const textLuminance = ((43 / 255 + 0.055) / 1.055) ** 2.4;
  if ((luminance + 0.05) / (textLuminance + 0.05) >= 4.5) return "#2b2b2b";
  return 1.05 / (luminance + 0.05) >= 4.5 ? "#ffffff" : "#000000";
}

export default function DescriptorWheel({ lang = "ru" }) {
  const ru = lang === "ru";
  const id = useId();
  const [mode, setMode] = useState("white");
  const [selected, setSelected] = useState(null);
  const activeCategories = wheelData.filter(category => category.modes.includes(mode));
  const changeMode = next => { setMode(next); setSelected(null); };
  const details = (item, inline = false) => <div className={inline ? "descriptor-info descriptor-info-inline" : "descriptor-info"} id={`${id}-${inline ? item.name.replace(/[^a-z0-9]/gi, "-") : "panel"}`} aria-live="polite">
    {item ? <>
      <span className="descriptor-swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
      <h3>{ru ? item.title : item.name}</h3>
      {ru && <p className="descriptor-translation" lang="en">{item.name}</p>}
      <p>{ru ? item.desc : item.descEn}</p>
    </> : <p>{ru ? "Выберите дескриптор, чтобы увидеть его описание и цвет." : "Select a descriptor to see its description and colour."}</p>}
  </div>;
  return <div className="descriptor-container" style={{ "--descriptor-tint": selected?.color ?? "var(--color-shell)" }}>
    <style>{`
      .descriptor-container { position:relative; isolation:isolate; display:grid; grid-template-columns:minmax(0,2fr) minmax(240px,1fr); gap:2rem; font-family:var(--font-sans-ui,system-ui,sans-serif); }
      .descriptor-container::before { content:""; position:absolute; inset:-1.25rem; z-index:-1; border-radius:12px; background:color-mix(in srgb,var(--descriptor-tint) 30%,var(--color-shell)); transition:background-color .25s ease; pointer-events:none; }
      .descriptor-left { min-width:0; }
      .descriptor-toggles { display:flex; flex-wrap:wrap; gap:.75rem; margin-bottom:1.5rem; }
      .descriptor-toggles button { min-height:44px; padding:.75rem 1rem; border:1px solid #bba85d; border-radius:8px; }
      .descriptor-toggles [aria-pressed="true"] { background:#fff5ba; box-shadow:inset 0 0 0 1px #8b6914; }
      .descriptor-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr)); gap:1rem; }
      .descriptor-category { min-width:0; padding:1rem; border:1px solid #ddd; border-radius:12px; background:#ffffffcc; }
      .descriptor-category h3 { font-size:1.15rem; color:#67501a; }
      .descriptor-category h4 { margin:1rem 0 .5rem; font-size:.95rem; color:#555; }
      .descriptor-chips { display:flex; flex-wrap:wrap; gap:.5rem; align-items:flex-start; }
      .descriptor-chip { min-height:44px; max-width:100%; padding:.5rem .8rem; border:1px solid #0003; border-radius:20px; font-size:.9rem; overflow-wrap:anywhere; }
      .descriptor-chip[aria-pressed="true"] { outline:2px solid #67501a; outline-offset:2px; }
      .descriptor-container button:focus-visible { outline:3px solid #2b2b2b; outline-offset:3px; }
      .descriptor-sidebar { min-width:0; }
      .descriptor-sidebar > .descriptor-info { position:sticky; top:1rem; }
      .descriptor-info { padding:1.5rem; background:#fffffff2; border:1px solid #ddd; border-radius:12px; overflow-wrap:anywhere; }
      .descriptor-info h3 { font-size:1.4rem; color:#67501a; }
      .descriptor-info p { margin-top:.5rem; font-size:1rem; }
      .descriptor-translation { font-style:italic; color:#666; }
      .descriptor-swatch { display:block; width:40px; height:40px; border-radius:50%; border:1px solid #777; margin-bottom:.75rem; }
      .descriptor-info-inline { display:none; }
      @media(max-width:768px) {
        .descriptor-container { grid-template-columns:minmax(0,1fr); }
        .descriptor-container::before { inset:-.75rem; }
        .descriptor-sidebar { display:none; }
        .descriptor-info-inline { display:block; flex-basis:100%; margin:.4rem 0; padding:1rem; }
      }
      @media(prefers-reduced-motion:reduce) { .descriptor-container::before { transition:none; } }
    `}</style>
    <div className="descriptor-left">
      <div className="descriptor-toggles" role="group" aria-label={ru ? "Часть яйца" : "Part of the egg"}>
        <button type="button" onClick={() => changeMode("white")} aria-pressed={mode === "white"}>{ru ? "⚪ Колесо Белка" : "⚪ Egg White Wheel"}</button>
        <button type="button" onClick={() => changeMode("yolk")} aria-pressed={mode === "yolk"}>{ru ? "🟡 Колесо Желтка" : "🟡 Yolk Wheel"}</button>
      </div>
      <div className="descriptor-grid">{activeCategories.map(category => <section key={category.category} className="descriptor-category">
        <h3>{ru ? category.title : category.category}</h3>
        {category.subcategories.filter(sub => category.category !== "Textural" || sub.name !== (mode === "white" ? "Yolk" : "White")).map(sub => <div key={sub.name}>
          <h4>{ru ? sub.title : sub.name}</h4>
          <div className="descriptor-chips">{sub.items.map(item => <React.Fragment key={item.name}>
            <button type="button" className="descriptor-chip" data-descriptor-chip aria-pressed={selected === item} aria-controls={`${id}-panel ${id}-${item.name.replace(/[^a-z0-9]/gi, "-")}`}
              onClick={() => setSelected(item)} onFocus={() => setSelected(item)}
              onPointerEnter={event => { if (event.pointerType === "mouse") setSelected(item); }}
              style={{ backgroundColor:item.color, color:getContrastText(item.color) }}>{ru ? item.title : item.name}</button>
            {selected === item && details(item, true)}
          </React.Fragment>)}</div>
        </div>)}
      </section>)}</div>
    </div>
    <aside className="descriptor-sidebar">{details(selected)}</aside>
  </div>;
}
