(() => {
  'use strict';

  const body = document.body;
  const byId = (id) => document.getElementById(id);
  const setText = (id, text) => {
    const element = byId(id);
    if (element) element.textContent = text;
  };
  const chapters = Array.from(document.querySelectorAll('article.chapter'));
  const eraLinks = Array.from(document.querySelectorAll('.era-link'));
  const exhibit = byId('exhibit');
  const egg = exhibit?.querySelector('.egg');
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let motionChoice = null;
  let reducedMotion = motionPreference.matches;
  let scrollFrame = 0;
  let tiltFrame = 0;
  let factoryTimer = 0;
  let factoryRunning = false;
  let activeChapter = null;

  function resetTilt() {
    cancelAnimationFrame(tiltFrame);
    tiltFrame = 0;
    egg?.style.setProperty('--tilt-x', '0deg');
    egg?.style.setProperty('--tilt-y', '0deg');
  }

  function finishBatch() {
    clearTimeout(factoryTimer);
    factoryTimer = 0;
    factoryRunning = false;
    byId('conveyor')?.classList.remove('running');
    const start = byId('factory-start');
    if (start) {
      start.disabled = false;
      start.textContent = 'Собрать ещё партию';
    }
    setText('factory-note', 'Партия собрана. Шесть яиц, одна привычная форма. Масштаб изменился — утро осталось утром.');
  }

  function updateMotion() {
    reducedMotion = motionChoice ?? motionPreference.matches;
    body.classList.toggle('still', reducedMotion);
    body.classList.toggle('motion-full', motionChoice === false);
    const toggle = byId('motion-toggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(reducedMotion));
      toggle.textContent = reducedMotion ? 'Больше движения' : 'Меньше движения';
    }
    if (reducedMotion) {
      resetTilt();
      if (factoryRunning) finishBatch();
    }
  }

  function updateReading() {
    scrollFrame = 0;
    const viewportHeight = window.innerHeight;
    const scrollable = document.documentElement.scrollHeight - viewportHeight;
    const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 1;
    const progressBar = byId('reading-progress');
    if (progressBar) progressBar.style.transform = `scaleX(${progress})`;

    if (!chapters.length) return;
    // Follow the reading area beneath the compact mobile exhibit.
    const mobile = matchMedia('(max-width: 700px)').matches;
    const exhibitBottom = exhibit?.getBoundingClientRect().bottom ?? 0;
    const readingLine = mobile
      ? Math.max(viewportHeight * 0.48, Math.min(viewportHeight * 0.72, exhibitBottom + 48))
      : viewportHeight * 0.46;
    let nearest = chapters[0];
    let distance = Infinity;
    for (const chapter of chapters) {
      const rect = chapter.getBoundingClientRect();
      const gap = rect.top > readingLine ? rect.top - readingLine : Math.max(0, readingLine - rect.bottom);
      if (gap < distance) {
        nearest = chapter;
        distance = gap;
      }
    }
    const index = chapters.indexOf(nearest);
    setText('progress-label', `${index + 1} / ${chapters.length}`);
    if (nearest === activeChapter) return;
    activeChapter = nearest;
    if (nearest.dataset.era) body.dataset.era = nearest.dataset.era;
    setText('era-year', nearest.dataset.year ?? '');
    setText('era-name', nearest.dataset.label ?? '');
    if (!reducedMotion) byId('era-year')?.animate([{ opacity: .45, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)' });
    if (nearest.dataset.caption) setText('exhibit-caption', nearest.dataset.caption);
    for (const link of eraLinks) {
      const selected = link.getAttribute('href') === `#${nearest.id}`;
      if (selected) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    }
    for (const chapter of chapters) chapter.classList.toggle('is-current', chapter === nearest);
  }

  function requestReadingUpdate() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateReading);
  }

  for (const link of eraLinks) link.addEventListener('click', () => { const menu = link.closest('details'); if (menu) menu.open = false; });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') document.querySelectorAll('.chapter-menu[open]').forEach(menu => { menu.open = false; menu.querySelector('summary')?.focus(); }); });
  window.addEventListener('scroll', requestReadingUpdate, { passive: true });
  window.addEventListener('resize', requestReadingUpdate, { passive: true });
  window.addEventListener('pageshow', requestReadingUpdate);
  document.fonts?.ready.then(requestReadingUpdate);
  motionPreference.addEventListener('change', updateMotion);
  finePointer.addEventListener('change', resetTilt);
  byId('motion-toggle')?.addEventListener('click', () => {
    motionChoice = !reducedMotion;
    updateMotion();
  });

  exhibit?.addEventListener('pointermove', (event) => {
    if (reducedMotion || !finePointer.matches || event.pointerType === 'touch' || !egg) return;
    const bounds = exhibit.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
    cancelAnimationFrame(tiltFrame);
    tiltFrame = requestAnimationFrame(() => {
      tiltFrame = 0;
      egg.style.setProperty('--tilt-x', `${-y * 6}deg`);
      egg.style.setProperty('--tilt-y', `${x * 9}deg`);
    });
  }, { passive: true });
  exhibit?.addEventListener('pointerleave', resetTilt);

  const crackButtons = Array.from(document.querySelectorAll('[data-crack]'));
  for (const button of crackButtons) {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const open = body.classList.toggle('egg-open');
      for (const control of crackButtons) {
        control.setAttribute('aria-pressed', String(open));
        control.textContent = open ? 'Закрыть скорлупу' : 'Заглянуть внутрь';
      }
    });
  }

  const dyes = {
    onion: { color: '#a54b26', note: 'Луковая шелуха: от тёплой охры до каштанового. Здесь — цветовой этюд; настоящий оттенок зависит от скорлупы и отвара.' },
    beet: { color: '#993d50', note: 'Свёкла: розовые и винные оттенки. Здесь — цветовой этюд, не рецепт: на настоящей скорлупе цвет может получиться совсем другим.' },
    cabbage: { color: '#536b82', note: 'Краснокочанная капуста может дать голубой оттенок. Здесь — цветовой этюд; результат зависит в том числе от кислотности.' },
  };
  const dyeButtons = Array.from(document.querySelectorAll('[data-dye]'));
  for (const button of dyeButtons) button.addEventListener('click', () => {
    const dye = dyes[button.dataset.dye];
    if (!dye) return;
    const sample = byId('dye-sample');
    if (sample) {
      sample.style.backgroundColor = dye.color;
      sample.dataset.dye = button.dataset.dye;
    }
    body.style.setProperty('--dye-color', dye.color);
    setText('dye-note', dye.note);
    for (const control of dyeButtons) control.setAttribute('aria-pressed', String(control === button));
  });

  const folklore = [
    ['Сундук', 'Сказка хранит самое важное подальше. Начнём с сундука.'],
    ['Заяц', 'В сундуке — заяц. У тайны появились быстрые ноги.'],
    ['Утка', 'В зайце — утка. Теперь тайна умеет улетать.'],
    ['Яйцо', 'В утке — яйцо. До самого хрупкого добрались не сразу.'],
    ['Игла', 'В яйце — игла. На её конце — смерть Кощея. Так устроен один из вариантов сказки.'],
  ];
  let folkloreStep = 0;
  byId('folklore-next')?.addEventListener('click', () => {
    folkloreStep = (folkloreStep + 1) % folklore.length;
    setText('folklore-object', folklore[folkloreStep][0]);
    setText('folklore-line', folklore[folkloreStep][1]);
    const object = byId('folklore-object');
    if (object) object.dataset.step = String(folkloreStep);
    setText('folklore-next', folkloreStep === folklore.length - 1 ? 'Спрятать всё обратно' : 'А что внутри?');
  });

  byId('faberge-open')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? 'Закрыть драгоценность' : 'Открыть сюрприз';
    const object = byId('faberge-object');
    if (object) object.dataset.open = String(open);
    const surprise = byId('faberge-surprise');
    if (surprise) surprise.hidden = !open;
    body.classList.toggle('faberge-open', open);
  });

  const recipes = {
    soft: { name: 'Всмятку', text: 'Скорлупа служит собственной посудой. Белок уже держит форму, желток ещё нет. Маленький спор о степени готовности переживает большие эпохи.' },
    omelet: { name: 'Омлет', text: 'Яйцо перестаёт быть одиночкой: белок и желток соединяются. Один ингредиент оказывается целым блюдом, а с добавками — семейным разговором о правильном омлете.' },
    meringue: { name: 'Безе', text: 'Белок удерживает воздух, сахар помогает сохранить форму. Из привычного яйца получается почти невесомая вещь. Желток тем временем ждёт другой роли.' },
  };
  const recipeButtons = Array.from(document.querySelectorAll('#recipe-tabs [data-recipe]'));
  for (const button of recipeButtons) button.addEventListener('click', () => {
    const recipe = recipes[button.dataset.recipe];
    if (!recipe) return;
    setText('recipe-name', recipe.name);
    setText('recipe-text', recipe.text);
    for (const control of recipeButtons) control.setAttribute('aria-pressed', String(control === button));
  });

  byId('factory-start')?.addEventListener('click', () => {
    if (factoryRunning) return;
    factoryRunning = true;
    const button = byId('factory-start');
    if (button) button.disabled = true;
    setText('factory-note', 'Собираем партию…');
    byId('conveyor')?.classList.add('running');
    if (reducedMotion) finishBatch();
    else factoryTimer = window.setTimeout(finishBatch, 2400);
  });

  const stamps = {
    CO: { mark: 'СО', note: 'Отборная категория: от 65 до 74,9 г. «С» — столовое, «О» — отборное. Здесь именно буква «О», не ноль.' },
    C1: { mark: 'С1', note: 'Первая категория: от 55 до 64,9 г. Это обозначение массы, а не оценка вкуса или качества.' },
    C2: { mark: 'С2', note: 'Вторая категория: от 45 до 54,9 г. Яйцо поменьше; достоинства измеряются не только граммами.' },
  };
  const stampButtons = Array.from(document.querySelectorAll('#stamp-buttons [data-stamp]'));
  for (const button of stampButtons) button.addEventListener('click', () => {
    const stamp = stamps[button.dataset.stamp];
    if (!stamp) return;
    setText('stamp-egg', stamp.mark);
    setText('stamp-note', stamp.note);
    const stampedEgg = byId('stamp-egg');
    if (stampedEgg) stampedEgg.dataset.stamp = button.dataset.stamp;
    for (const control of stampButtons) control.setAttribute('aria-pressed', String(control === button));
  });

  byId('like-egg')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    const liked = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(liked));
    setText('like-count', liked ? '1' : '0');
    const label = button.querySelector('[data-like-label]');
    if (label) label.textContent = liked ? 'Симпатия взаимна' : 'Поддержать яйцо';
  });

  byId('breakfast-button')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    const plate = byId('breakfast-plate');
    const served = plate?.dataset.served !== 'true';
    if (plate) plate.dataset.served = String(served);
    button.setAttribute('aria-pressed', String(served));
    button.textContent = served ? 'Убрать завтрак' : 'Подать завтрак';
    setText('breakfast-note', served
      ? 'История дошла до вашей тарелки. Дальше — дело вкуса.'
      : 'Тарелка снова свободна. Можно подать ещё раз.');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resetTilt();
      if (factoryRunning) finishBatch();
    } else requestReadingUpdate();
  });

  const heroEgg = document.querySelector('.hero-egg');
  if (heroEgg && 'IntersectionObserver' in window) new IntersectionObserver(entries => { heroEgg.style.animationPlayState = entries[0].isIntersecting ? 'running' : 'paused'; }).observe(heroEgg);
  updateMotion();
  document.querySelectorAll('.interactive[hidden]').forEach((element) => { element.hidden = false; });
  body.classList.add('history-ready');
  updateReading();
})();
