import { useState } from "react";
import styles from "./EggOracle.module.css";

export interface EggOracleProps {
  dict: {
    title: string;
    desc: string;
    placeholder: string;
    ask: string;
    thinking: string;
    answers: string[];
  };
}

export default function EggOracle({ dict }: EggOracleProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  const handleAsk = () => {
    if (isThinking || !question.trim()) return;
    setIsThinking(true);
    setAnswer("");
    setTimeout(() => {
      const randomAnswer =
        dict.answers[Math.floor(Math.random() * dict.answers.length)];
      setAnswer(randomAnswer);
      setIsThinking(false);
    }, 1500);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>{dict.title}</h2>
        <p className={styles.description}>{dict.desc}</p>
      </div>

      <div className={styles.form}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={dict.placeholder}
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
          {isThinking ? dict.thinking : dict.ask}
        </button>
      </div>

      {answer && <div className={styles.answer}>"{answer}"</div>}
    </div>
  );
}
