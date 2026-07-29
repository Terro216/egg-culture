import React, { useRef, useState } from "react";

interface AdeptCertificateProps {
  lang: "ru" | "en";
}

type Gender = "m" | "f";

const STRINGS = {
  ru: {
    heading: "Сертификат Истинного Адепта",
    intro:
      "Вы прошли инициацию — значит, имеете право на документ. Впишите имя, и Кладка заверит его печатью Купола.",
    placeholder: "Ваше имя",
    genderM: "Адепт",
    genderF: "Адептка",
    generate: "Заверить печатью",
    download: "Скачать сертификат",
    regenerate: "Переоформить",
    site: "EGG.ILYAMEDVE.DEV",
    certTitle: "СЕРТИФИКАТ",
    certSubtitle: {
      m: "Истинного Адепта Яичной Культуры",
      f: "Истинной Адептки Яичной Культуры",
    },
    body1: "Настоящим удостоверяется, что",
    body2: {
      m: "безошибочно прошел Инициацию, различает Меловой След",
      f: "безошибочно прошла Инициацию, различает Меловой След",
    },
    body3: "и допускается к Тёмной Стороне Яйца.",
    creed: "«Корм — это язык будущего желтка»",
    signature: "Заверено кровью Ордена Яйца",
    certNo: "Свидетельство №",
    dateLabel: "Дано",
  },
  en: {
    heading: "Certificate of the True Adept",
    intro:
      "You have passed the initiation — you are entitled to a document. Enter your name and the Clutch will seal it with the Dome.",
    placeholder: "Your name",
    genderM: "Adept",
    genderF: "Adeptess",
    generate: "Apply the seal",
    download: "Download certificate",
    regenerate: "Reissue",
    site: "EGG.ILYAMEDVE.DEV",
    certTitle: "CERTIFICATE",
    certSubtitle: {
      m: "of a True Adept of Egg Culture",
      f: "of a True Adeptess of Egg Culture",
    },
    body1: "This is to certify that",
    body2: {
      m: "has flawlessly passed the Initiation, discerns the Chalky Trail",
      f: "has flawlessly passed the Initiation, discerns the Chalky Trail",
    },
    body3: "and is admitted to the Dark Side of the Egg.",
    creed: "“Feed is the language of the future yolk”",
    signature: "Sealed in the blood of the Order of the Egg",
    certNo: "Testimony No.",
    dateLabel: "Issued",
  },
};

const W = 1600;
const H = 1131;

// Детерминированный номер свидетельства из имени.
function certNumber(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return String((h % 999) + 1).padStart(4, "0");
}

function drawSeal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.translate(cx, cy);

  // Лучи вокруг печати
  ctx.strokeStyle = "rgba(139, 0, 0, 0.55)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r + 8), Math.sin(a) * (r + 8));
    ctx.lineTo(Math.cos(a) * (r + 20), Math.sin(a) * (r + 20));
    ctx.stroke();
  }

  // Внешние окружности
  ctx.strokeStyle = "#8b0000";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r - 12, 0, Math.PI * 2);
  ctx.stroke();

  // Купол (яйцо) в центре
  ctx.beginPath();
  ctx.ellipse(0, 6, r * 0.34, r * 0.46, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(139, 0, 0, 0.12)";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.stroke();

  // Халаза — витальная собранность
  ctx.beginPath();
  ctx.arc(0, 2, r * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = "#8b0000";
  ctx.fill();

  // Круговая надпись
  ctx.fillStyle = "#8b0000";
  ctx.font = "600 21px 'Playfair Display', serif";
  const text = "· EGG QI · SILENTIUM · TEXTURA ·";
  const step = (Math.PI * 2) / text.length;
  for (let i = 0; i < text.length; i++) {
    const a = -Math.PI / 2 + i * step;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -(r - 34));
    ctx.textAlign = "center";
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// Кровавая печать Ордена Яйца: неровный оттиск с яйцом-просветом.
// Форма оттиска детерминированно зависит от имени — у каждого адепта
// печать своя, но при переоформлении не меняется.
function drawBloodSeal(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  seedText: string,
) {
  let s = 0;
  for (let i = 0; i < seedText.length; i++) {
    s = (s * 31 + seedText.charCodeAt(i)) >>> 0;
  }
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rnd() - 0.5) * 0.25);

  // Неровный контур оттиска
  const blob = (radius: number, jitter: number) => {
    const points = 26;
    const rads: number[] = [];
    for (let i = 0; i < points; i++) {
      rads.push(radius * (1 - jitter / 2 + rnd() * jitter));
    }
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const a1 = ((i % points) / points) * Math.PI * 2;
      const a2 = (((i + 0.5) % points) / points) * Math.PI * 2;
      const r1 = rads[i % points];
      const r2 = (rads[i % points] + rads[(i + 1) % points]) / 2;
      if (i === 0) ctx.moveTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
      else ctx.quadraticCurveTo(
        Math.cos(a1) * r1, Math.sin(a1) * r1,
        Math.cos(a2) * r2, Math.sin(a2) * r2,
      );
    }
    ctx.closePath();
  };

  // Два слоя: размытая кромка + плотное тело
  blob(r, 0.34);
  ctx.fillStyle = "rgba(112, 12, 12, 0.45)";
  ctx.fill();
  blob(r * 0.92, 0.22);
  ctx.fillStyle = "rgba(112, 12, 12, 0.88)";
  ctx.fill();

  // Яйцо-просвет в теле печати
  ctx.beginPath();
  ctx.ellipse(0, r * 0.06, r * 0.34, r * 0.48, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#f0ead6";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(112, 12, 12, 0.55)";
  ctx.stroke();

  // Брызги вокруг
  const drops = 7 + Math.floor(rnd() * 4);
  for (let i = 0; i < drops; i++) {
    const a = rnd() * Math.PI * 2;
    const dist = r * (1.1 + rnd() * 0.45);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * dist, Math.sin(a) * dist, 1.5 + rnd() * 4.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(112, 12, 12, ${0.35 + rnd() * 0.5})`;
    ctx.fill();
  }

  ctx.restore();

  // Девиз Ордена под печатью
  ctx.textAlign = "center";
  ctx.font = "600 24px 'Playfair Display', serif";
  ctx.fillStyle = "rgba(112, 12, 12, 0.85)";
  ctx.fillText("O R D O   O V I", cx, cy + r + 42);
}

function drawCertificate(
  canvas: HTMLCanvasElement,
  name: string,
  lang: "ru" | "en",
  gender: Gender,
) {
  const s = STRINGS[lang];
  const ctx = canvas.getContext("2d")!;
  canvas.width = W;
  canvas.height = H;

  // Пергамент
  ctx.fillStyle = "#f0ead6";
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 1100);
  grad.addColorStop(0, "rgba(255,255,255,0.25)");
  grad.addColorStop(1, "rgba(160, 130, 60, 0.18)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Двойная золотая рамка с уголками
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 6;
  ctx.strokeRect(50, 50, W - 100, H - 100);
  ctx.lineWidth = 2;
  ctx.strokeRect(70, 70, W - 140, H - 140);
  const corner = 46;
  ctx.lineWidth = 3;
  for (const [x, y, dx, dy] of [
    [70, 70, 1, 1],
    [W - 70, 70, -1, 1],
    [70, H - 70, 1, -1],
    [W - 70, H - 70, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x + dx * corner, y);
    ctx.quadraticCurveTo(x + dx * corner * 0.2, y + dy * corner * 0.2, x, y + dy * corner);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#2b2b2b";

  // Шапка
  ctx.font = "600 34px 'Playfair Display', serif";
  ctx.fillStyle = "#b8963a";
  ctx.fillText("EGG CULTURE — ЯИЧНАЯ КУЛЬТУРА", W / 2, 165);

  ctx.font = "600 96px 'Playfair Display', serif";
  ctx.fillStyle = "#2b2b2b";
  ctx.fillText(s.certTitle, W / 2, 290);

  ctx.font = "italic 40px 'Lora', serif";
  ctx.fillStyle = "#6b5a2a";
  ctx.fillText(s.certSubtitle[gender], W / 2, 355);

  // Тело
  ctx.font = "30px 'Lora', serif";
  ctx.fillStyle = "#2b2b2b";
  ctx.fillText(s.body1, W / 2, 470);

  ctx.font = "italic 600 76px 'Playfair Display', serif";
  ctx.fillStyle = "#8b6914";
  ctx.fillText(name, W / 2, 580);

  // Линия под именем
  ctx.strokeStyle = "rgba(139, 105, 20, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 420, 610);
  ctx.lineTo(W / 2 + 420, 610);
  ctx.stroke();

  ctx.font = "30px 'Lora', serif";
  ctx.fillStyle = "#2b2b2b";
  ctx.fillText(s.body2[gender], W / 2, 680);
  ctx.fillText(s.body3, W / 2, 728);

  ctx.font = "italic 32px 'Lora', serif";
  ctx.fillStyle = "#6b5a2a";
  ctx.fillText(s.creed, W / 2, 830);

  // Печать
  drawSeal(ctx, W - 330, H - 250, 130);

  // Кровавая печать Ордена вместо подписи
  drawBloodSeal(ctx, 280, H - 265, 80, name);

  ctx.textAlign = "left";
  ctx.font = "24px 'Lora', serif";
  ctx.fillStyle = "#6b5a2a";
  ctx.fillText(s.signature, 430, H - 210);

  const dateStr = new Date().toLocaleDateString(
    lang === "ru" ? "ru-RU" : "en-GB",
    { day: "numeric", month: "long", year: "numeric" },
  );
  ctx.fillText(`${s.dateLabel}: ${dateStr}`, 430, H - 172);
  ctx.fillText(`${s.certNo} ${certNumber(name)}`, 430, H - 137);

  // Футер
  ctx.textAlign = "center";
  ctx.font = "22px 'Lora', serif";
  ctx.fillStyle = "rgba(43,43,43,0.45)";
  ctx.fillText(s.site, W / 2, H - 92);
}

export const AdeptCertificate: React.FC<AdeptCertificateProps> = ({ lang }) => {
  const s = STRINGS[lang];
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("m");
  const [issued, setIssued] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const issue = async (g: Gender = gender) => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed || !canvasRef.current) return;
    // Дожидаемся веб-шрифтов, иначе canvas упадет на системные.
    try {
      await Promise.all([
        document.fonts.load("600 96px 'Playfair Display'"),
        document.fonts.load("italic 600 76px 'Playfair Display'"),
        document.fonts.load("30px 'Lora'"),
        document.fonts.load("italic 32px 'Lora'"),
      ]);
    } catch {
      // рисуем как есть
    }
    drawCertificate(canvasRef.current, trimmed, lang, g);
    setIssued(true);
    (window as any).plausible?.("Adept Certificate");
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `egg-culture-adept-${certNumber(name.trim())}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  return (
    <div className="adept-cert">
      <style>{`
        .adept-cert {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          align-items: center;
          text-align: center;
        }
        .adept-cert-intro {
          color: #d1b8b8;
          font-size: 1.05rem;
          max-width: 560px;
          margin: 0 auto;
        }
        .adept-cert-form {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          justify-content: center;
        }
        .adept-cert-input {
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(139, 0, 0, 0.6);
          color: #e0d5d5;
          padding: 0.8rem 1.2rem;
          font-family: var(--font-serif-body, serif);
          font-size: 1.1rem;
          min-width: 260px;
          outline: none;
        }
        .adept-cert-input:focus {
          border-color: #ff3333;
        }
        .adept-cert-btn {
          background: transparent;
          border: 1px solid #8b0000;
          color: #ff6b6b;
          padding: 0.8rem 1.5rem;
          font-family: var(--font-sans-ui, sans-serif);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-size: 0.8rem;
          transition: all 0.3s ease;
        }
        .adept-cert-btn:hover:not(:disabled) {
          background: #8b0000;
          color: #fff;
          box-shadow: 0 0 10px rgba(139, 0, 0, 0.8);
        }
        .adept-cert-btn:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .adept-cert-gender {
          display: flex;
          border: 1px solid rgba(139, 0, 0, 0.6);
        }
        .adept-cert-gender button {
          background: transparent;
          border: none;
          color: #d1b8b8;
          padding: 0.8rem 1.2rem;
          font-family: var(--font-sans-ui, sans-serif);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-size: 0.8rem;
          transition: all 0.3s ease;
        }
        .adept-cert-gender button.is-active {
          background: #8b0000;
          color: #fff;
        }
        .adept-cert-canvas {
          width: 100%;
          max-width: 820px;
          height: auto;
          border: 1px solid rgba(212, 175, 55, 0.4);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
        }
      `}</style>

      <p className="adept-cert-intro">{s.intro}</p>

      <div className="adept-cert-form">
        <input
          className="adept-cert-input"
          type="text"
          maxLength={40}
          placeholder={s.placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void issue();
          }}
        />
        <div className="adept-cert-gender" role="group">
          {(["m", "f"] as Gender[]).map((g) => (
            <button
              key={g}
              className={gender === g ? "is-active" : ""}
              onClick={() => {
                setGender(g);
                // Уже выданный документ переоформляется сразу.
                if (issued) void issue(g);
              }}
            >
              {g === "m" ? s.genderM : s.genderF}
            </button>
          ))}
        </div>
        <button
          className="adept-cert-btn"
          disabled={!name.trim()}
          onClick={() => void issue()}
        >
          {issued ? s.regenerate : s.generate}
        </button>
        {issued && (
          <button className="adept-cert-btn" onClick={download}>
            {s.download}
          </button>
        )}
      </div>

      <canvas
        ref={canvasRef}
        className="adept-cert-canvas"
        style={{ display: issued ? "block" : "none" }}
      />
    </div>
  );
};

export default AdeptCertificate;
