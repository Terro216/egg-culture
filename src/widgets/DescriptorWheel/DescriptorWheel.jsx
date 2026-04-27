import React, { useState, useEffect } from 'react';

const wheelData = [
  {
    category: 'Mineral',
    title: 'Минеральные',
    modes: ['white'],
    subcategories: [
      {
        name: 'Chalky',
        title: 'Меловые',
        items: [
          { name: 'Dry chalk', title: 'Сухой мел', color: '#FFFFFF', desc: 'Ощущение сухости и чистоты, характерно для свежего белка без добавок.' },
          { name: 'Limestone', title: 'Известняк', color: '#EAEAEA', desc: 'Легкая минеральность, напоминает запах чистой скорлупы.' },
          { name: 'Gypsum', title: 'Гипс', color: '#F2F2F2', desc: 'Плотный, чуть вяжущий профиль белка.' }
        ]
      },
      {
        name: 'Stone',
        title: 'Каменные',
        items: [
          { name: 'Wet stone', title: 'Мокрый камень', color: '#BDBDBD', desc: 'Чистый, прохладный аромат, часто встречается в качественных фабричных яйцах.' },
          { name: 'Flint', title: 'Кремень', color: '#9E9E9E', desc: 'Острый, холодный профиль.' }
        ]
      },
      {
        name: 'Metallic',
        title: 'Металлические',
        items: [
          { name: 'Iron water', title: 'Железистая вода', color: '#A7B1B5', desc: 'Легкий металлический привкус, связанный с минеральным составом воды для птиц.' },
          { name: 'Aluminum spoon', title: 'Алюминиевая ложка', color: '#D1D5D8', desc: 'Гладкий, стерильный вкус с легкой прохладой.' },
          { name: 'Raw blood', title: 'Сырая кровь', color: '#E57373', desc: 'Специфический железистый профиль, иногда признак стресса птицы.' }
        ]
      }
    ]
  },
  {
    category: 'Dairy & Creamy',
    title: 'Молочные и сливочные',
    modes: ['yolk'],
    subcategories: [
      {
        name: 'Fresh',
        title: 'Свежие',
        items: [
          { name: 'Cream 20%', title: 'Сливки 20%', color: '#FFF9E3', desc: 'Округлая, мягкая текстура свежего желтка.' },
          { name: 'Milk foam', title: 'Молочная пенка', color: '#FEFEE9', desc: 'Легкость и сладость.' },
          { name: 'Unsalted butter', title: 'Несоленое масло', color: '#FFF5BA', desc: 'Богатый, жирный вкус с гладким послевкусием.' }
        ]
      },
      {
        name: 'Fermented',
        title: 'Ферментированные',
        items: [
          { name: 'Neutral yogurt', title: 'Нейтральный йогурт', color: '#F5F5DC', desc: 'Легкая кислинка, балансирующая жирность.' },
          { name: 'Cream cheese', title: 'Творожный сыр', color: '#FFFDD0', desc: 'Плотность и кремовость.' }
        ]
      },
      {
        name: 'Sweet',
        title: 'Сладкие',
        items: [
          { name: 'Sugar-free ice cream', title: 'Пломбир без сахара', color: '#FFFFF0', desc: 'Холодная, тающая сладость.' },
          { name: 'Baked milk', title: 'Топленое молоко', color: '#F3E5AB', desc: 'Теплый, карамелизованный оттенок.' }
        ]
      }
    ]
  },
  {
    category: 'Grain & Feed',
    title: 'Зерновые и кормовые',
    modes: ['yolk'],
    subcategories: [
      {
        name: 'Light grains',
        title: 'Светлые злаки',
        items: [
          { name: 'Raw dough', title: 'Сырое тесто', color: '#F3E3C3', desc: 'Мучнистый, сытный профиль.' },
          { name: 'Oat flakes', title: 'Овсяные хлопья', color: '#ECE0C1', desc: 'Мягкий зерновой тон, признак качественного корма.' },
          { name: 'Rice water', title: 'Рисовая вода', color: '#FAF9F6', desc: 'Очень нейтральный, чистый крахмалистый вкус.' }
        ]
      },
      {
        name: 'Rich grains',
        title: 'Насыщенные злаки',
        items: [
          { name: 'Sweet corn', title: 'Сладкая кукуруза', color: '#FFD700', desc: 'Яркий, сладковатый профиль, часто от кукурузного откорма.' },
          { name: 'Wheat bran', title: 'Пшеничные отруби', color: '#D2B48C', desc: 'Сухой, слегка пыльный, но приятный вкус.' },
          { name: 'Dry straw', title: 'Сухая солома', color: '#E4D96F', desc: 'Сенные ноты, типичные для фермерских яиц.' }
        ]
      }
    ]
  },
  {
    category: 'Animal & Savory',
    title: 'Животные и умами',
    modes: ['yolk'],
    subcategories: [
      {
        name: 'Bird',
        title: 'Птичьи',
        items: [
          { name: 'Wet down', title: 'Мокрый пух', color: '#F5F5F5', desc: 'Специфический животный аромат.' },
          { name: 'Warm feather', title: 'Теплое перо', color: '#D7CCC8', desc: 'Характерно для дворовых яиц свободного выгула. Указывает на высокую витальность курицы.' },
          { name: 'Chicken air', title: 'Куриный дух', color: '#BCAAA4', desc: 'Аромат курятника, признак минимальной обработки и ручного сбора.' }
        ]
      },
      {
        name: 'Broth',
        title: 'Бульон (Умами)',
        items: [
          { name: 'Weak bone broth', title: 'Слабый костный бульон', color: '#E0C097', desc: 'Легкая мясная насыщенность.' },
          { name: 'Yolk paste', title: 'Желточная паста', color: '#F4A460', desc: 'Концентрированный, густой вкус желтка.' },
          { name: 'Chicken skin', title: 'Куриная кожа', color: '#DEB887', desc: 'Жирный, очень насыщенный вкус с нотами птицы.' }
        ]
      }
    ]
  },
  {
    category: 'Sulfur & Earthy',
    title: 'Сернистые и земляные',
    modes: ['white', 'yolk'],
    subcategories: [
      {
        name: 'Pure sulfur',
        title: 'Чистая сера',
        items: [
          { name: 'Lit match', title: 'Зажженная спичка', color: '#FFFF8D', desc: 'Резкий сернистый профиль, типичный для переваренных яиц.' },
          { name: 'Wet sulfur', title: 'Мокрая сера', color: '#C0CA33', desc: 'Признак высокого содержания аминокислот.' }
        ]
      },
      {
        name: 'Earthy',
        title: 'Землистые',
        items: [
          { name: 'Damp cellar', title: 'Сырой погреб', color: '#8D6E63', desc: 'Ноты влаги и земли.' },
          { name: 'Wet black soil', title: 'Влажный чернозем', color: '#4E342E', desc: 'Глубокий земляной тон, характерен для свободного выгула в дождливую погоду.' },
          { name: 'Forest floor', title: 'Лесная подстилка', color: '#6D4C41', desc: 'Органический, сложный профиль перегноя и листвы.' }
        ]
      }
    ]
  },
  {
    category: 'Textural',
    title: 'Текстурные',
    modes: ['white', 'yolk'],
    subcategories: [
      {
        name: 'White',
        title: 'Белковые',
        items: [
          { name: 'Glassy', title: 'Стеклянный', color: '#E1F5FE', desc: 'Гладкая, полупрозрачная текстура без ярко выраженного вкуса.' },
          { name: 'Silky', title: 'Шелковистый', color: '#F3E5F5', desc: 'Нежное, скользящее ощущение на языке.' },
          { name: 'Stringy', title: 'Волокнистый', color: '#E8F5E9', desc: 'Плотные белковые жгутики, признак свежести.' }
        ]
      },
      {
        name: 'Yolk',
        title: 'Желточные',
        items: [
          { name: 'Melting', title: 'Тающий', color: '#FFF9C4', desc: 'Идеальная консистенция, обволакивающая нёбо.' },
          { name: 'Pasty', title: 'Пастообразный', color: '#FFE082', desc: 'Густая, вязкая текстура, часто в перепелиных или цесариных яйцах.' },
          { name: 'Waxy', title: 'Восковой', color: '#FFD54F', desc: 'Слегка резиновый, плотный желток (характерно для некоторых фабричных).' }
        ]
      }
    ]
  },
  {
    category: 'Defects',
    title: 'Дефекты',
    modes: ['white', 'yolk'],
    subcategories: [
      {
        name: 'Technical',
        title: 'Технические',
        items: [
          { name: 'Old cardboard', title: 'Старый картон', color: '#A1887F', desc: 'Запах упаковки, впитавшийся в пористую скорлупу.' },
          { name: 'Refrigerator', title: 'Холодильник', color: '#B0BEC5', desc: 'Впитывание посторонних запахов при неправильном хранении.' },
          { name: 'Pharmacy/Iodine', title: 'Аптека/Йод', color: '#9575CD', desc: 'Лекарственный привкус от добавок в корм.' }
        ]
      },
      {
        name: 'Biological',
        title: 'Биологические',
        items: [
          { name: 'Fish meal', title: 'Рыбная мука', color: '#90A4AE', desc: 'Специфический рыбный привкус из-за избытка рыбной муки в рационе.' },
          { name: 'Mustiness', title: 'Затхлость', color: '#78909C', desc: 'Признак старого яйца или хранения во влажной среде.' },
          { name: 'Ammonia', title: 'Аммиак', color: '#DCEDC8', desc: 'Резкий запах, свидетельствующий о порче продукта.' }
        ]
      }
    ]
  }
];


function getContrastYIQ(hexcolor) {
  hexcolor = hexcolor.replace("#", "");
  if (hexcolor.length === 3) {
    hexcolor = hexcolor.split('').map(c => c + c).join('');
  }
  const r = parseInt(hexcolor.substr(0, 2), 16);
  const g = parseInt(hexcolor.substr(2, 2), 16);
  const b = parseInt(hexcolor.substr(4, 2), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? '#2b2b2b' : '#ffffff';
}

export default function DescriptorWheel() {

  const [mode, setMode] = useState('white');
  const [hoveredItem, setHoveredItem] = useState(null);
  const [originalBg, setOriginalBg] = useState('');

  useEffect(() => {
    setOriginalBg(document.body.style.backgroundColor);
    return () => {
      document.body.style.backgroundColor = originalBg;
    };
  }, []);

  const handleMouseEnter = (item) => {
    setHoveredItem(item);
    document.body.style.backgroundColor = item.color;
    document.body.style.transition = 'background-color 0.4s ease';
  };

  const handleMouseLeave = () => {
    setHoveredItem(null);
    document.body.style.backgroundColor = originalBg;
  };

  const activeCategories = wheelData.filter(cat => cat.modes.includes(mode));

  return (
    <div style={{ display: 'flex', gap: '2rem', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>

      {/* Left Column: Controls & Grid */}
      <div style={{ flex: '2' }}>

        {/* Mode Toggles */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button
            onClick={() => setMode('white')}
            style={{
              padding: '0.75rem 1.5rem',
              cursor: 'pointer',
              backgroundColor: mode === 'white' ? '#fff' : '#eee',
              border: mode === 'white' ? '2px solid #ccc' : '1px solid #ddd',
              borderRadius: '8px',
              fontWeight: mode === 'white' ? 'bold' : 'normal',
              boxShadow: mode === 'white' ? '0 4px 6px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            ⚪ Колесо Белка
          </button>
          <button
            onClick={() => setMode('yolk')}
            style={{
              padding: '0.75rem 1.5rem',
              cursor: 'pointer',
              backgroundColor: mode === 'yolk' ? '#FFD54F' : '#FFF9C4',
              border: mode === 'yolk' ? '2px solid #F57F17' : '1px solid #FFF59D',
              borderRadius: '8px',
              fontWeight: mode === 'yolk' ? 'bold' : 'normal',
              boxShadow: mode === 'yolk' ? '0 4px 6px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            🟡 Колесо Желтка
          </button>
        </div>

        {/* Categories Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1.5rem' }}>
          {activeCategories.map((cat, idx) => (
            <div key={idx} style={{
              backgroundColor: 'rgba(255,255,255,0.8)',
              padding: '1rem',
              borderRadius: '12px',
              border: '1px solid #ddd'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
                {cat.title}
              </h3>

              {cat.subcategories.map((sub, sidx) => {
                // Filter items if some subcategories are specific to white/yolk.
                // In our data, textural is split by subcategory name ('White', 'Yolk')
                let itemsToShow = sub.items;
                if (cat.category === 'Textural') {
                  if (mode === 'white' && sub.name === 'Yolk') itemsToShow = [];
                  if (mode === 'yolk' && sub.name === 'White') itemsToShow = [];
                }

                if (itemsToShow.length === 0) return null;

                return (
                  <div key={sidx} style={{ marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '0.9rem', color: '#555', marginBottom: '0.5rem', fontWeight: 600 }}>{sub.title}</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {itemsToShow.map((item, iidx) => (
                        <div
                          key={iidx}
                          onMouseEnter={() => handleMouseEnter(item)}
                          onMouseLeave={handleMouseLeave}
                          style={{
                            padding: '0.4rem 0.8rem',
                            backgroundColor: item.color,
                            color: getContrastYIQ(item.color),
                            borderRadius: '20px',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            border: '1px solid rgba(0,0,0,0.1)',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                            transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.transform = 'scale(1.05)';
                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                          }}
                        >
                          {item.title}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Info Panel */}
      <div style={{ flex: '1', minWidth: '300px' }}>
        <div style={{
          position: 'sticky',
          top: '2rem',
          backgroundColor: 'rgba(255,255,255,0.9)',
          padding: '2rem',
          borderRadius: '16px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
          border: '1px solid #eaeaea',
          minHeight: '250px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}>
          {hoveredItem ? (
            <div>
              <div style={{
                display: 'inline-block',
                width: '40px',
                height: '40px',
                backgroundColor: hoveredItem.color,
                borderRadius: '50%',
                border: '2px solid #ccc',
                marginBottom: '1rem'
              }}></div>
              <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.8rem' }}>{hoveredItem.title}</h2>
              <p style={{ fontSize: '0.9rem', color: '#777', marginBottom: '1.5rem', fontStyle: 'italic' }}>
                En: {hoveredItem.name}
              </p>
              <p style={{ fontSize: '1.1rem', lineHeight: '1.6', color: '#333' }}>
                {hoveredItem.desc}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#999', textAlign: 'center', flexFlow: 'column' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🥚</div>
              <p>Наведите курсор на дескриптор, чтобы увидеть его описание и цвет.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
