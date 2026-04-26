import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";

type Size = "S" | "M" | "L";
type Temp = "fridge" | "room";
type Doneness = "soft" | "medium" | "hard";

export default function EggCalculator() {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof document !== "undefined") {
      i18n.changeLanguage(document.documentElement.lang || "ru");
      setMounted(true);
    }
  }, []);

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

    return `${minutes} ${t("calculator.minutes")} ${seconds > 0 ? `${seconds} ${t("calculator.seconds")}` : ""}`;
  };

  const buttonStyle = (isActive: boolean) => ({
    padding: "0.75rem 1.5rem",
    fontSize: "1rem",
    border: "1px solid var(--accent-color)",
    cursor: "pointer",
    backgroundColor: isActive ? "var(--accent-color)" : "transparent",
    color: isActive ? "var(--bg-color)" : "var(--text-color)",
    fontFamily: "var(--font-sans)",
    transition: "all 0.3s ease",
  });

  if (!mounted) return null;

  return (
    <div
      style={{
        padding: "2rem",
        border: "1px solid var(--border-color)",
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
          className="text-center"
          style={{ color: "var(--accent-color)", fontSize: "2rem", margin: 0 }}
        >
          {t("calculator.title")}
        </h3>
        <p
          className="text-center"
          style={{ fontStyle: "italic", opacity: 0.8, margin: 0 }}
        >
          {t("calculator.subtitle")}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <p className="text-bold" style={{ margin: 0 }}>
          {t("calculator.caliber")}
        </p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {(["S", "M", "L"] as Size[]).map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              style={{ ...buttonStyle(size === s), flex: 1 }}
            >
              {s === "S" && t("calculator.sizeS")}
              {s === "M" && t("calculator.sizeM")}
              {s === "L" && t("calculator.sizeL")}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <p className="text-bold" style={{ margin: 0 }}>
          {t("calculator.temp")}
        </p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <button
            onClick={() => setTemp("fridge")}
            style={{ ...buttonStyle(temp === "fridge"), flex: 1 }}
          >
            {t("calculator.tempFridge")}
          </button>
          <button
            onClick={() => setTemp("room")}
            style={{ ...buttonStyle(temp === "room"), flex: 1 }}
          >
            {t("calculator.tempRoom")}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <p className="text-bold" style={{ margin: 0 }}>
          {t("calculator.doneness")}
        </p>
        <div style={{ display: "flex", gap: "1rem", flexDirection: "column" }}>
          <button
            onClick={() => setDoneness("soft")}
            style={buttonStyle(doneness === "soft")}
          >
            {t("calculator.doneSoft")}
          </button>
          <button
            onClick={() => setDoneness("medium")}
            style={buttonStyle(doneness === "medium")}
          >
            {t("calculator.doneMedium")}
          </button>
          <button
            onClick={() => setDoneness("hard")}
            style={buttonStyle(doneness === "hard")}
          >
            {t("calculator.doneHard")}
          </button>
        </div>
      </div>

      <div
        className="text-center"
        style={{
          padding: "2rem",
          backgroundColor: "rgba(212, 175, 55, 0.1)",
          border: "1px dashed var(--accent-color)",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <p
          className="text-caps"
          style={{ fontSize: "0.9rem", opacity: 0.8, margin: 0 }}
        >
          {t("calculator.resultLabel")}
        </p>
        <p
          style={{
            fontSize: "3rem",
            fontWeight: 600,
            color: "var(--accent-color)",
            margin: 0,
            fontFamily: "var(--font-display)",
          }}
        >
          {calculateTime()}
        </p>
      </div>
    </div>
  );
}
