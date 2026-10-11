import React, { useState, useMemo, useRef, useId, useEffect } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import worldData from "@shared/data/world-110m.json";

interface TerroirMapProps {
  lang: "ru" | "en";
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

// Базовые размеры для проекции D3
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 500;

export const TerroirMap: React.FC<TerroirMapProps> = ({ lang, dict }) => {
  const infoId = useId();
  const [hoveredRegion, setHoveredRegion] = useState<{
    regionId: string;
    point?: { x: number; y: number };
  } | null>(null);
  const [focusedRegion, setFocusedRegion] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Карта, кнопки и карточка всегда показывают один и тот же регион.
  // Наведение — только предпросмотр, пока пользователь ничего не выбрал.
  const activeRegion = selectedRegion ?? hoveredRegion?.regionId ?? focusedRegion;

  // Явный выбор остаётся для чтения на touch-экране; обычное наведение — нет.
  useEffect(() => {
    if (!selectedRegion && !focusedRegion) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setSelectedRegion(null);
        setFocusedRegion(null);
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [selectedRegion, focusedRegion]);

  // Распаковываем TopoJSON и считаем SVG-пути один раз: геометрия статична,
  // а pathGenerator по всем странам — слишком дорог для каждого рендера.
  const countryPaths = useMemo(() => {
    const world = worldData as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
    const featureCollection = feature(world, world.objects.countries);
    const features = featureCollection.features;
    // Сортируем: сначала обычные регионы, затем "яичные", чтобы их обводка не перекрывалась
    features.sort((a, b) => {
      const aIsTerroir = !!COUNTRY_MAP[a.properties?.name ?? ""];
      const bIsTerroir = !!COUNTRY_MAP[b.properties?.name ?? ""];
      if (aIsTerroir === bIsTerroir) return 0;
      return aIsTerroir ? 1 : -1;
    });

    // Используем проекцию Меркатора (можно заменить на geoNaturalEarth1 для более мягких форм)
    const projection = geoMercator()
      .scale(120)
      .translate([MAP_WIDTH / 2, MAP_HEIGHT / 1.4]);
    const pathGenerator = geoPath().projection(projection);

    return features.map(geo => {
      const countryName: string = geo.properties?.name || "";
      return {
        d: pathGenerator(geo) || "",
        countryName,
        regionKey: COUNTRY_MAP[countryName] || null,
      };
    });
  }, []);

  const hoverRegion = (event: React.PointerEvent, regionId: string, onMap = false) => {
    // Touch генерирует pointerenter перед click, но это не наведение.
    if (event.pointerType === "touch" || selectedRegion) return;
    const rect = onMap ? containerRef.current?.getBoundingClientRect() : null;
    setHoveredRegion({
      regionId,
      point: rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : undefined,
    });
  };

  const focusRegion = (event: React.FocusEvent, regionId: string) => {
    // Фокус от мыши не должен закреплять временное наведение после mouseleave.
    if (event.currentTarget.matches(":focus-visible")) setFocusedRegion(regionId);
  };

  const selectRegion = (regionId: string) => {
    setHoveredRegion(null);
    setFocusedRegion(null);
    setSelectedRegion(previous => previous === regionId ? null : regionId);
  };

  const clearRegions = () => {
    setHoveredRegion(null);
    setFocusedRegion(null);
    setSelectedRegion(null);
  };

  const tooltipData = activeRegion ? dict.regions[activeRegion] : null;
  const tooltipPoint = selectedRegion ? undefined : hoveredRegion?.point;

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
          color: var(--color-yolk-text, #80600f);
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
          cursor: pointer;
        }
        .terroir-region-list { display:flex; flex-wrap:wrap; gap:.5rem; justify-content:center; margin-top:1rem; }
        .terroir-region-list button { min-height:44px; padding:.5rem .8rem; border:1px solid #9f823c; border-radius:6px; }
        .terroir-region-list [data-active="true"] { background:#fff2b5; }
        .terroir-region-list button:focus-visible { outline:2px solid #2b2b2b; outline-offset:3px; }
        .map-path.is-terroir[data-active="true"] {
          fill: rgba(212, 175, 55, 0.5);
          stroke: var(--color-yolk, #d4af37);
          stroke-width: 1; /* Единая жирность */
        }
        .map-path.is-terroir:focus-visible { outline: none; fill: #d4af37; stroke: #2b2b2b; stroke-width: 3; }
        .terroir-tooltip {
          position: absolute;
          z-index: 100;
          background: var(--color-shell, #F0EAD6);
          color: var(--color-text, #2b2b2b);
          padding: 1.5rem;
          border: 1px solid var(--color-yolk, #d4af37);
          width: min(300px, 100%);
          max-width: 100%;
          overflow-wrap: anywhere;
          font-family: var(--font-serif-body, serif);
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          margin-top: 12px;
        }
        .tooltip-title {
          font-family: var(--font-sans-ui, sans-serif);
          font-size: 1rem;
          margin-bottom: 1rem;
          color: var(--color-yolk-text, #80600f);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          border-bottom: 1px solid rgba(212, 175, 55, 0.3);
          padding-bottom: 0.5rem;
        }
        .terroir-tooltip[data-pinned="true"] { position: static; width: 100%; }
        .terroir-tooltip[data-pinned="false"] { pointer-events: none; }
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

        @media (max-width: 768px) {
          .terroir-section {
            padding: 2rem 0;
          }
          .terroir-header h2 {
            font-size: 1.75rem;
          }
          .terroir-header p {
            font-size: 1rem;
          }
          .terroir-tooltip {
            position: static;
            width: 100%;
            max-width: 100%;
            padding: 1rem;
          }
        }
      `}</style>

      <div className="terroir-header">
        <h2>{dict.title}</h2>
        <p>{dict.subtitle}</p>
      </div>

      <div
        className="map-container"
        ref={containerRef}
        onPointerLeave={() => setHoveredRegion(null)}
        onPointerDown={event => {
          if (event.pointerType === "touch") {
            setHoveredRegion(null);
            setFocusedRegion(null);
          }
          if (!(event.target as Element).closest("[data-terroir-region], .terroir-tooltip")) clearRegions();
        }}
        onKeyDown={event => { if (event.key === "Escape") clearRegions(); }}
      >
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="terroir-svg"
          aria-label={dict.title}
        >
          {countryPaths.map((country, i) => (
            <path
              key={i}
              d={country.d}
              className={`map-path ${country.regionKey ? "is-terroir" : ""}`}
              role={country.regionKey ? "button" : undefined}
              tabIndex={country.regionKey ? 0 : undefined}
              aria-label={country.regionKey ? dict.regions[country.regionKey]?.name : undefined}
              aria-pressed={country.regionKey ? selectedRegion === country.regionKey : undefined}
              aria-expanded={country.regionKey ? activeRegion === country.regionKey : undefined}
              aria-controls={country.regionKey ? infoId : undefined}
              data-terroir-region={country.regionKey ?? undefined}
              data-active={!!country.regionKey && activeRegion === country.regionKey}
              onClick={() => { if (country.regionKey) selectRegion(country.regionKey); }}
              onKeyDown={event => {
                if (country.regionKey && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  selectRegion(country.regionKey);
                }
              }}
              onPointerEnter={event => { if (country.regionKey) hoverRegion(event, country.regionKey, true); }}
              onPointerMove={event => {
                if (country.regionKey && hoveredRegion?.regionId === country.regionKey) {
                  hoverRegion(event, country.regionKey, true);
                }
              }}
              onPointerLeave={() => setHoveredRegion(null)}
              onFocus={event => { if (country.regionKey) focusRegion(event, country.regionKey); }}
              onBlur={() => setFocusedRegion(null)}
            />
          ))}
        </svg>

        <div className="terroir-region-list" role="group" aria-label={lang === "ru" ? "Выберите терруар" : "Choose a terroir"}>
          {Object.entries(dict.regions).map(([regionId, region]) => (
            <button
              key={regionId}
              type="button"
              aria-controls={infoId}
              aria-pressed={selectedRegion === regionId}
              aria-expanded={activeRegion === regionId}
              data-terroir-region={regionId}
              data-active={activeRegion === regionId}
              onPointerEnter={event => hoverRegion(event, regionId)}
              onPointerLeave={() => setHoveredRegion(null)}
              onFocus={event => focusRegion(event, regionId)}
              onBlur={() => setFocusedRegion(null)}
              onClick={() => selectRegion(regionId)}
            >
              {region.name}
            </button>
          ))}
        </div>

        {tooltipData && (
          <div
            className="terroir-tooltip"
            data-pinned={!tooltipPoint}
            id={infoId}
            role="region"
            aria-live="polite"
            aria-label={tooltipData.name}
            style={tooltipPoint ? { left: `clamp(0px, ${tooltipPoint.x - 150}px, max(0px, calc(100% - 300px)))`, top: tooltipPoint.y } : undefined}
          >
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
          </div>
        )}
      </div>
    </section>
  );
};
