import type { MotionTrialLang } from "./MotionTrial.tsx";

export const motionCopy = {
  ru: {
    chalaza: {
      kicker: "Испытание формы",
      title: "Халаза-тест",
      intro:
        "Удержите яйцо в центре. Даже идеальная неподвижность не спасает: форму придётся ловить наклоном.",
      calibrate: "Положить на стол",
      calibrating: "Считываю стол…",
      calibrationStatus: "Положите телефон на стол и не двигайте 3 секунды.",
      calibrated: "Нулевое положение считано. Можно начинать испытание.",
      start: "Начать испытание",
      playing: "Яйцо начинает уходить. Ловите центр наклоном телефона.",
      centered: "Центр пойман. Удерживайте.",
      needsCorrection: "Удерживайте центр небольшими корректировками: ожидание не засчитывается.",
      manualDrifting: "Яйцо уходит. Верните его к центру стрелками или касанием арены.",
      drifting: "Яйцо уходит. Ловите наклоном телефона.",
      rolledAway: "Яйцо укатилось за край блюда.",
      retryAfterRoll: "Попробуйте снова. У нас ещё много больших яиц.",
      success: "Халаза удержала форму. Испытание пройдено.",
      foninSuccess: "Халаза удержала форму. Вторая печать поддалась.",
      close: "Закрыть испытание",
      reset: "Начать заново",
      manual: "Играть без датчиков",
      manualStatus:
        "Управляйте формой стрелками, клавишами или касанием арены.",
      sensorUnavailable:
        "Датчики движения не отдают данные. Проверьте HTTPS и доступ к датчикам или выберите управление без датчиков.",
    },
    oracle: {
      kicker: "Испытание восприятия",
      title: "Оракул желтка",
      intro:
        "Сформулируйте вопрос. Оракул отвечает после трёх точных встряхиваний.",
      ask: "Спросить оракула",
      playing:
        "Три точных встряхивания. Слабый импульс не будет прочитан, чрезмерный разрушит Купол.",
      firstShake: "Первый импульс принят. Осталось два встряхивания.",
      secondShake: "Второй импульс принят. Осталось одно встряхивание.",
      silent: "Вопрос не достиг желтка.",
      tooQuiet: "Импульс слишком слабый. Повторите вопрос точнее.",
      broken: "Слишком быстрый импульс разрушил Купол.",
      tooStrong: "Купол треснул. Сбавьте темп и повторите вопрос.",
      success: "Ответ Оракула сформирован.",
      foninSuccess: "Ответ Оракула сформирован. Третья печать поддалась.",
      idle: "Оракул ожидает вопрос.",
      result: "Ответ Оракула",
      reset: "Спросить ещё раз",
      manual: "Спросить без датчиков",
      manualStatus:
        "Трижды коснитесь желтка: не торопясь, но без долгой паузы.",
      sensorUnavailable:
        "Датчики движения недоступны. Разрешите доступ браузеру или выберите испытание без датчиков.",
    },
    common: {
      completionError: "Испытание пройдено, но результат не удалось сохранить.",
      retrySave: "Повторить сохранение",
      saving: "Сохраняем результат…",
      permissionDenied:
        "Браузер не дал доступ к датчикам. Можно пройти испытание без них.",
      sensorLabel: "Показания датчиков",
      manualLabel: "Ручное управление",
    },
  },
  en: {
    chalaza: {
      kicker: "Trial of form",
      title: "The Chalaza Test",
      intro:
        "Keep the egg at the centre. Perfect stillness will not save it: catch the form by tilting your phone.",
      calibrate: "Place on the table",
      calibrating: "Reading the table…",
      calibrationStatus: "Place the phone on a table and keep it still for 3 seconds.",
      calibrated: "The neutral position is set. The trial may begin.",
      start: "Begin the trial",
      playing: "The egg is drifting. Catch the centre by tilting your phone.",
      centered: "The centre is held. Keep it there.",
      needsCorrection: "Hold the centre with small corrections: waiting does not count.",
      manualDrifting: "The egg is drifting. Return to the centre with the arrows or by touching the arena.",
      drifting: "The egg is drifting. Catch it with the tilt of your phone.",
      rolledAway: "The egg rolled beyond the edge of the dish.",
      retryAfterRoll: "Try again. We still have plenty of large eggs.",
      success: "The chalaza held the form. The trial is complete.",
      foninSuccess: "The chalaza held the form. The second seal yielded.",
      close: "Close the trial",
      reset: "Begin again",
      manual: "Play without sensors",
      manualStatus:
        "Guide the form with the arrows, keyboard, or by touching the arena.",
      sensorUnavailable:
        "The motion sensors returned no data. Check HTTPS and sensor access, or use the sensor-free controls.",
    },
    oracle: {
      kicker: "Trial of perception",
      title: "Oracle of the Yolk",
      intro:
        "Formulate a question. The Oracle answers after three precise shakes.",
      ask: "Ask the oracle",
      playing:
        "Three precise shakes. A weak impulse will not be read; an excessive one will break the Dome.",
      firstShake: "The first impulse is received. Two shakes remain.",
      secondShake: "The second impulse is received. One shake remains.",
      silent: "The question did not reach the yolk.",
      tooQuiet: "The impulse was too weak. Ask the question more precisely.",
      broken: "An overly rapid impulse broke the Dome.",
      tooStrong: "The Dome cracked. Slow down and ask again.",
      success: "The Oracle's answer is formed.",
      foninSuccess: "The Oracle's answer is formed. The third seal yielded.",
      idle: "The Oracle awaits a question.",
      result: "The Oracle's answer",
      reset: "Ask again",
      manual: "Ask without sensors",
      manualStatus:
        "Touch the yolk three times: without haste, but without a long pause.",
      sensorUnavailable:
        "Motion sensors are unavailable. Allow browser access or use the sensor-free trial.",
    },
    common: {
      completionError: "The trial is complete, but its result could not be saved.",
      retrySave: "Retry saving",
      saving: "Saving the result…",
      permissionDenied:
        "The browser denied sensor access. You can complete the trial without sensors.",
      sensorLabel: "Sensor readings",
      manualLabel: "Manual controls",
    },
  },
} as const;

// Every capitalised term here is defined in the Adept's Guide.
export const oraclePredictions: Record<MotionTrialLang, string[]> = {
  ru: [
    "Ответ собранный. Сохраняйте выбранный курс.",
    "Сейчас говорит Пустота. Не принимайте отсутствие сопротивления за согласие.",
    "Нужна Температурная Пауза. Вернитесь к вопросу, когда он достигнет комнатной температуры.",
    "Первая Атака резкая, но Развитие обещает мягкий Финиш.",
    "Вертикаль ясна. Выбирайте решение, после которого выпрямляется осанка.",
    "Заземление сильнее импульса. Сегодня лучше остаться.",
    "Меловой след чистый. Источник заслуживает доверия.",
    "Халаза натянута: центр удержится, если не ускорять движение.",
    "Купол высокий и упругий. Решение выдержит вскрытие.",
    "Индустриальный Стрим предлагает предсказуемость. Если нужна глубина, ищите другой терруар.",
    "Дворовый Дикий: исход непредсказуем, но Яй Ци живое.",
    "Архивный Стиль: решение созрело; дальнейшая выдержка даст только сернистость.",
    "Светлый Стиль: уберите лишнее. Ответ останется.",
    "Бульонный Стиль: решение тяжёлое, но даёт Заземление.",
    "Пасторальный Стиль: мягкость здесь не равна Пустоте.",
    "Это нервная партия. Не фиксируйте вывод по одной Атаке.",
  ],
  en: [
    "The answer is Composed. Hold your chosen course.",
    "The Void is speaking. Do not mistake the absence of resistance for consent.",
    "A Temperature Pause is required. Return when the question reaches room temperature.",
    "The first Attack is sharp, but Development promises a gentle Finish.",
    "Verticality is clear. Choose the decision that straightens your posture.",
    "Grounding outweighs impulse. Today, remain where you are.",
    "The Chalky Trail is clean. The source deserves trust.",
    "The chalaza is taut: the centre will hold if you do not accelerate.",
    "The Dome is high and resilient. The decision will survive opening.",
    "The Industrial Stream offers predictability. If you need depth, seek another terroir.",
    "Yard Wild: the outcome is unpredictable, but its Egg Qi is alive.",
    "The Aged Style: the decision has matured; more time will add only sulfur.",
    "The Blanc Style: remove what is unnecessary. The answer will remain.",
    "The Bouillon Style: the decision is heavy, but it brings Grounding.",
    "The Pastoral Style: softness here is not the Void.",
    "This batch is Nervous. Do not settle the question after one Attack.",
  ],
};
