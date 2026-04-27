import React, { useState, useMemo } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
// @ts-ignore
import worldData from "@shared/data/world-110m.json";

interface TerroirMapProps {
  dict: {
    title: string;
    subtitle: string;
    labels: {
      breed: string;
      diet: string;
      profile: string;
    };
    regions: Record<
      string,
      {
        name: string;
        breed: string;
        diet: string;
        profile: string;
      }
    >;
  };
}

// Картографируем названия стран из TopoJSON в наши ключи
const COUNTRY_MAP: Record<string, string> = {
  Japan: "japan",
  France: "france",
  Chile: "chile",
  Russia: "russia",
  China: "china",
  Italy: "italy",
  "United States of America": "usa",
  Australia: "australia",
};

export const TerroirMap: React.FC<TerroirMapProps> = ({ dict }) => {
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    regionId: string | null;
    countryName: string;
  }>({
    visible: false,
    x: 0,
    y: 0,
    regionId: null,
    countryName: "",
  });

  // Распаковываем TopoJSON только один раз
  const geometries = useMemo(() => {
    // @ts-ignore
    const featureCollection = feature(worldData, worldData.objects.countries);
    const features = featureCollection.features;
    // Сортируем: сначала обычные регионы, затем "яичные", чтобы их обводка не перекрывалась
    return features.sort((a: any, b: any) => {
      const aIsTerroir = !!COUNTRY_MAP[a.properties?.name];
      const bIsTerroir = !!COUNTRY_MAP[b.properties?.name];
      if (aIsTerroir === bIsTerroir) return 0;
      return aIsTerroir ? 1 : -1;
    });
  }, []);

  // Базовые размеры для проекции D3
  const width = 1000;
  const height = 500;

  // Используем проекцию Меркатора (можно заменить на geoNaturalEarth1 для более мягких форм)
  const projection = geoMercator()
    .scale(120)
    .translate([width / 2, height / 1.4]);
  const pathGenerator = geoPath().projection(projection);

  const handleMouseMove = (
    e: React.MouseEvent,
    regionId: string | null,
    countryName: string,
  ) => {
    // Позиционируем относительно контейнера страницы
    setTooltip({
      visible: true,
      x: e.pageX,
      y: e.pageY,
      regionId,
      countryName,
    });
  };

  const handleMouseLeave = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  const tooltipData = tooltip.regionId ? dict.regions[tooltip.regionId] : null;

  return (
    <section className="terroir-section flex-col gap-lg">
      <style>{`
        .terroir-section {
          padding: 4rem 1rem;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .terroir-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        .terroir-header h2 {
          font-family: var(--font-serif-headers, serif);
          font-size: 2.5rem;
          color: var(--color-yolk, #d4af37);
          margin-bottom: 0.5rem;
        }
        .terroir-header p {
          font-family: var(--font-serif-body, serif);
          font-size: 1.2rem;
          opacity: 0.8;
        }
        .map-container {
          position: relative;
          width: 100%;
          max-width: 1000px;
          margin: 0 auto;
        }
        .terroir-svg {
          width: 100%;
          height: auto;
        }
        .map-path {
          fill: rgba(43, 43, 43, 0.05); /* Легкая заливка, чтобы было видно массу */
          stroke: var(--color-shell, #F0EAD6); /* Сливается с фоном, "не обведено" */
          stroke-width: 1; /* Единая жирность */
          transition: all 0.4s ease;
          cursor: crosshair;
        }
        .map-path.is-terroir {
          fill: rgba(212, 175, 55, 0.2);
          stroke: var(--color-yolk, #d4af37);
          stroke-width: 1; /* Единая жирность */
        }
        .map-path:hover {
          fill: rgba(212, 175, 55, 0.5);
          stroke: var(--color-yolk, #d4af37);
          stroke-width: 1; /* Единая жирность */
        }
        .terroir-tooltip {
          position: absolute;
          z-index: 100;
          background: var(--color-shell, #F0EAD6);
          color: var(--color-text, #2b2b2b);
          padding: 1.5rem;
          border: 1px solid var(--color-yolk, #d4af37);
          pointer-events: none;
          max-width: 300px;
          font-family: var(--font-serif-body, serif);
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          transform: translate(-50%, -120%);
        }
        .tooltip-title {
          font-family: var(--font-sans-ui, sans-serif);
          font-size: 1rem;
          margin-bottom: 1rem;
          color: var(--color-yolk, #d4af37);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          border-bottom: 1px solid rgba(212, 175, 55, 0.3);
          padding-bottom: 0.5rem;
        }
        .tooltip-line {
          margin-bottom: 0.5rem;
          font-size: 0.95rem;
          line-height: 1.4;
        }
        .tooltip-line strong {
          font-family: var(--font-sans-ui, sans-serif);
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          opacity: 0.6;
          display: block;
          margin-bottom: 0.1rem;
        }
      `}</style>

      <div className="terroir-header">
        <h2>{dict.title}</h2>
        <p>{dict.subtitle}</p>
      </div>

      <div className="map-container">
        <svg viewBox={`0 0 ${width} ${height}`} className="terroir-svg">
          {geometries.map((geo: any, i: number) => {
            const countryName = geo.properties?.name;
            const regionKey = COUNTRY_MAP[countryName];
            const isTerroir = !!regionKey;

            return (
              <path
                key={i}
                d={pathGenerator(geo) || ""}
                className={`map-path ${isTerroir ? "is-terroir" : ""}`}
                onMouseMove={(e) =>
                  handleMouseMove(e, regionKey || null, countryName || "")
                }
                onMouseLeave={handleMouseLeave}
              />
            );
          })}
        </svg>
      </div>

      {/* Тултип рендерится в корне страницы по абсолютным координатам мыши */}
      {tooltip.visible && (
        <div
          className="terroir-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltipData ? (
            <>
              <div className="tooltip-title">{tooltipData.name}</div>
              <div className="tooltip-line">
                <strong>{dict.labels.breed}</strong>
                {tooltipData.breed}
              </div>
              <div className="tooltip-line">
                <strong>{dict.labels.diet}</strong>
                {tooltipData.diet}
              </div>
              <div className="tooltip-line">
                <strong>{dict.labels.profile}</strong>
                {tooltipData.profile}
              </div>
            </>
          ) : (
            <>
              <div className="tooltip-title">
                {tooltip.countryName || "Unknown Region"}
              </div>
              <div
                className="tooltip-line"
                style={{ opacity: 0.7, fontStyle: "italic" }}
              >
                {dict.title && dict.title.includes("Терруар")
                  ? "Яичная культура в этом регионе еще не развита. Терруар спит."
                  : "Egg culture is not yet developed in this region. The terroir is dormant."}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};
