import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import styles from "./EggOracle.module.css";

export default function EggOracle() {
  const { t, ready } = useTranslation("translation", { i18n });
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    if (ready && typeof document !== "undefined") {
      i18n.changeLanguage(document.documentElement.lang || "ru");
    }
  }, [ready]);

  const handleAsk = () => {
    if (!question.trim()) return;
    setIsThinking(true);
    setAnswer("");
    setTimeout(() => {
      const answers = t("oracle.answers", { returnObjects: true }) as string[];
      const randomAnswer = answers[Math.floor(Math.random() * answers.length)];
      setAnswer(randomAnswer);
      setIsThinking(false);
    }, 1500);
  };

  if (!ready) return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t("oracle.title")}</h2>
        <p className={styles.description}>{t("oracle.desc")}</p>
      </div>

      <div className={styles.form}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("oracle.placeholder")}
          className={styles.input}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAsk();
          }}
        />
        <button
          onClick={handleAsk}
          disabled={isThinking || !question.trim()}
          className={styles.button}
        >
          {isThinking ? t("oracle.thinking") : t("oracle.ask")}
        </button>
      </div>

      {answer && <div className={styles.answer}>"{answer}"</div>}
    </div>
  );
}
