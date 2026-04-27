import React, { useState } from "react";

type Size = "S" | "M" | "L";
type Temp = "fridge" | "room";
type Doneness = "soft" | "medium" | "hard";

export interface EggCalculatorProps {
  dict: {
    title: string;
    subtitle: string;
    caliber: string;
    sizeS: string;
    sizeM: string;
    sizeL: string;
    temp: string;
    tempFridge: string;
    tempRoom: string;
    doneness: string;
    doneSoft: string;
    doneMedium: string;
    doneHard: string;
    resultLabel: string;
    minutes: string;
    seconds: string;
  };
}

export default function EggCalculator({ dict }: EggCalculatorProps) {
  const [size, setSize] = useState<Size>("M");
  const [temp, setTemp] = useState<Temp>("fridge");
  const [doneness, setDoneness] = useState<Doneness>("soft");

  // Упрощенная модель расчета времени варки (в кипящей воде)
  const calculateTime = () => {
    // Базовое время в секундах для яйца категории М (отборное ~60г) из холодильника
    const baseTimes = {
      soft: 360, // 6 мин
      medium: 480, // 8 мин
      hard: 600, // 10 мин
    };

    let time = baseTimes[doneness];

    // Корректировка по размеру
    if (size === "S") time -= 45;
    if (size === "L") time += 45;

    // Корректировка по температуре (комнатная ~20°C экономит около минуты)
    if (temp === "room") time -= 60;

    const minutes = Math.floor(time / 60);
    const seconds = time % 60;

    return `${minutes} ${dict.minutes} ${seconds > 0 ? `${seconds} ${dict.seconds}` : ""}`;
  };

  const buttonStyle = (isActive: boolean) => ({
    padding: "0.75rem 1.5rem",
    fontSize: "1rem",
    border: "1px solid var(--color-yolk, var(--accent-color, #d4af37))",
    cursor: "pointer",
    backgroundColor: isActive
      ? "var(--color-yolk, var(--accent-color, #d4af37))"
      : "transparent",
    color: isActive
      ? "var(--color-shell, var(--bg-color, #F0EAD6))"
      : "var(--color-text, #2b2b2b)",
    fontFamily: "var(--font-sans-ui, var(--font-sans-ui))",
    transition: "all 0.3s ease",
  });

  return (
    <div
      style={{
        padding: "2rem",
        border: "1px solid var(--border-color, rgba(43,43,43,0.1))",
        maxWidth: "600px",
        margin: "0 auto",
        backgroundColor: "rgba(255, 255, 255, 0.3)",
        display: "flex",
        flexDirection: "column",
        gap: "2rem",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <h3
          style={{
            color: "var(--color-yolk, var(--accent-color, #d4af37))",
            fontSize: "2rem",
            margin: 0,
            textAlign: "center",
          }}
        >
          {dict.title}
        </h3>
        <p
          style={{
            fontStyle: "italic",
            opacity: 0.8,
            margin: 0,
            textAlign: "center",
          }}
        >
          {dict.subtitle}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{dict.caliber}</p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {(["S", "M", "L"] as Size[]).map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              style={{ ...buttonStyle(size === s), flex: 1 }}
            >
              {s === "S" && dict.sizeS}
              {s === "M" && dict.sizeM}
              {s === "L" && dict.sizeL}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{dict.temp}</p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <button
            onClick={() => setTemp("fridge")}
            style={{ ...buttonStyle(temp === "fridge"), flex: 1 }}
          >
            {dict.tempFridge}
          </button>
          <button
            onClick={() => setTemp("room")}
            style={{ ...buttonStyle(temp === "room"), flex: 1 }}
          >
            {dict.tempRoom}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{dict.doneness}</p>
        <div style={{ display: "flex", gap: "1rem", flexDirection: "column" }}>
          <button
            onClick={() => setDoneness("soft")}
            style={buttonStyle(doneness === "soft")}
          >
            {dict.doneSoft}
          </button>
          <button
            onClick={() => setDoneness("medium")}
            style={buttonStyle(doneness === "medium")}
          >
            {dict.doneMedium}
          </button>
          <button
            onClick={() => setDoneness("hard")}
            style={buttonStyle(doneness === "hard")}
          >
            {dict.doneHard}
          </button>
        </div>
      </div>

      <div
        style={{
          padding: "2rem",
          backgroundColor: "rgba(212, 175, 55, 0.1)",
          border: "1px dashed var(--color-yolk, var(--accent-color, #d4af37))",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: "0.9rem",
            opacity: 0.8,
            margin: 0,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {dict.resultLabel}
        </p>
        <p
          style={{
            fontSize: "3rem",
            fontWeight: 600,
            color: "var(--color-yolk, var(--accent-color, #d4af37))",
            margin: 0,
            fontFamily: "var(--font-serif-headers, var(--font-serif-headers))",
          }}
        >
          {calculateTime()}
        </p>
      </div>
    </div>
  );
}
