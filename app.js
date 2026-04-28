(function () {
  "use strict";

  // ---------- Storage ----------
  const STORAGE_KEY = "liz-vocab:v1";

  function defaultStore() {
    return {
      words: {},
      sessions: [],
      xp: 0,
      achievements: {}, // { id: ISOdate }
      counters: { typingCorrect: 0 },
    };
  }

  function loadStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultStore();
      const parsed = JSON.parse(raw);
      const def = defaultStore();
      return {
        words: parsed.words || def.words,
        sessions: parsed.sessions || def.sessions,
        xp: typeof parsed.xp === "number" ? parsed.xp : def.xp,
        achievements: parsed.achievements || def.achievements,
        counters: parsed.counters || def.counters,
      };
    } catch (e) {
      console.error("Failed to load storage", e);
      return defaultStore();
    }
  }

  function saveStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      console.error("Failed to save storage", e);
    }
  }

  function statsFor(key) {
    if (!store.words[key]) {
      store.words[key] = {
        viewed: false,
        known: false,
        knownAwarded: false,
        seen: 0,
        attempts: 0,
        correct: 0,
        lastSeen: 0,
      };
    }
    return store.words[key];
  }

  // ---------- Gamification ----------
  function levelInfo(xp) {
    // Total XP needed to reach level N = 25 * (N-1) * N
    let level = 1;
    while (25 * level * (level + 1) <= xp) level++;
    const start = 25 * (level - 1) * level;
    const end = 25 * level * (level + 1);
    return { level, start, end, progress: xp - start, needed: end - start };
  }

  function awardXP(amount, reason) {
    if (!amount) return;
    const before = levelInfo(store.xp);
    store.xp += amount;
    const after = levelInfo(store.xp);
    saveStorage();
    showToast({
      kind: "xp",
      emoji: "✨",
      title: `+${amount} XP`,
      sub: reason || "",
    });
    if (after.level > before.level) {
      showToast({
        kind: "level",
        emoji: "🚀",
        title: `Level ${after.level}!`,
        sub: `Keep going — next level at ${after.end} XP`,
      });
    }
    renderHomeStatus();
  }

  // ---------- Achievements ----------
  const ACHIEVEMENTS = [
    { id: "first_view",   emoji: "🌱", title: "First Steps",    desc: "View your first card",
      check: () => totalViewed() >= 1 },
    { id: "bookworm",     emoji: "📖", title: "Bookworm",       desc: "View 25 different words",
      check: () => totalViewed() >= 25 },
    { id: "polyglot",     emoji: "🧠", title: "Polyglot",       desc: "View 50 different words",
      check: () => totalViewed() >= 50 },
    { id: "completionist",emoji: "🏛️", title: "Completionist",  desc: "View every word in the dictionary",
      check: () => words.length > 0 && totalViewed() >= words.length },
    { id: "quiz_starter", emoji: "🎯", title: "Quiz Starter",   desc: "Finish your first quiz",
      check: () => store.sessions.length >= 1 },
    { id: "quiz_regular", emoji: "🎲", title: "Quiz Regular",   desc: "Finish 10 quizzes",
      check: () => store.sessions.length >= 10 },
    { id: "perfect_10",   emoji: "⭐", title: "Sharp Shooter",   desc: "Score 100% on a quiz of 10+ questions",
      check: () => store.sessions.some((s) => s.total >= 10 && s.correct === s.total) },
    { id: "speller_10",   emoji: "⌨️", title: "Speller",         desc: "Type 10 correct answers",
      check: () => (store.counters.typingCorrect || 0) >= 10 },
    { id: "speller_50",   emoji: "✍️", title: "Word Wizard",     desc: "Type 50 correct answers",
      check: () => (store.counters.typingCorrect || 0) >= 50 },
    { id: "collector_10", emoji: "🪙", title: "Word Collector", desc: "Mark 10 words as known",
      check: () => totalKnown() >= 10 },
    { id: "collector_30", emoji: "🏆", title: "Word Master",    desc: "Mark 30 words as known",
      check: () => totalKnown() >= 30 },
    { id: "theme_one",    emoji: "🎨", title: "Theme Tamer",    desc: "View every word in any theme",
      check: () => themesFullyViewedCount() >= 1 },
    { id: "theme_three",  emoji: "🎭", title: "Renaissance",    desc: "Fully view 3 different themes",
      check: () => themesFullyViewedCount() >= 3 },
  ];

  function totalViewed() {
    return words.filter((w) => statsFor(w.word).viewed).length;
  }
  function totalKnown() {
    return words.filter((w) => statsFor(w.word).known).length;
  }
  function themesFullyViewedCount() {
    const themes = new Set(words.map((w) => w.theme).filter(Boolean));
    let count = 0;
    themes.forEach((t) => {
      const inTheme = words.filter((w) => w.theme === t);
      if (inTheme.length && inTheme.every((w) => statsFor(w.word).viewed)) count++;
    });
    return count;
  }

  function checkAchievements({ silent = false } = {}) {
    let newly = [];
    for (const a of ACHIEVEMENTS) {
      if (store.achievements[a.id]) continue;
      try {
        if (a.check()) {
          store.achievements[a.id] = new Date().toISOString();
          newly.push(a);
        }
      } catch (e) { /* defensive */ }
    }
    if (newly.length) {
      saveStorage();
      if (!silent) {
        newly.forEach((a, i) => {
          // small stagger so they don't pile
          setTimeout(() => {
            showToast({
              kind: "achv",
              emoji: a.emoji,
              title: a.title,
              sub: a.desc,
              durationMs: 3500,
            });
          }, i * 300);
        });
      }
      renderHomeStatus();
    }
    return newly.length;
  }

  // ---------- Toasts ----------
  const toastLayer = document.getElementById("toast-layer");
  let toastQueueDepth = 0;

  function showToast({ kind = "xp", emoji = "", title = "", sub = "", durationMs = 1800 }) {
    if (!toastLayer) return;
    toastQueueDepth++;
    const el = document.createElement("div");
    el.className = `toast toast-${kind}`;
    el.innerHTML = `
      <div class="toast-emoji">${emoji}</div>
      <div class="toast-body">
        <div class="toast-title"></div>
        ${sub ? '<div class="toast-sub"></div>' : ""}
      </div>
    `;
    el.querySelector(".toast-title").textContent = title;
    if (sub) el.querySelector(".toast-sub").textContent = sub;
    toastLayer.appendChild(el);
    setTimeout(() => {
      el.classList.add("exiting");
      setTimeout(() => {
        el.remove();
        toastQueueDepth = Math.max(0, toastQueueDepth - 1);
      }, 220);
    }, durationMs);
  }

  function recordView(key) {
    const s = statsFor(key);
    const wasViewed = s.viewed;
    s.viewed = true;
    s.seen += 1;
    s.lastSeen = Date.now();
    saveStorage();
    if (!wasViewed) awardXP(2, `New word: ${key}`);
    checkAchievements();
  }

  function setKnown(key, value) {
    const s = statsFor(key);
    const willKnow = !!value;
    s.known = willKnow;
    if (willKnow && !s.knownAwarded) {
      s.knownAwarded = true;
      saveStorage();
      awardXP(5, `Marked known: ${key}`);
    } else {
      saveStorage();
    }
    checkAchievements();
  }

  function recordQuiz(key, correct, mode) {
    const s = statsFor(key);
    s.attempts += 1;
    if (correct) s.correct += 1;
    s.lastSeen = Date.now();
    saveStorage();
    if (correct) {
      const xp = mode === "type" ? 5 : 3;
      awardXP(xp, mode === "type" ? "Typed correctly" : "Correct answer");
      if (mode === "type") {
        store.counters.typingCorrect = (store.counters.typingCorrect || 0) + 1;
        saveStorage();
      }
    }
    checkAchievements();
  }

  function recordSession(mode, total, correct) {
    store.sessions.push({
      ts: Date.now(),
      mode,
      total,
      correct,
    });
    saveStorage();
    // session bonus
    const pct = total ? correct / total : 0;
    let bonus = 0;
    if (total >= 5 && pct === 1) bonus = 20;
    else if (pct >= 0.8) bonus = 10;
    else if (pct >= 0.5) bonus = 5;
    if (bonus) awardXP(bonus, `Quiz finished (${correct}/${total})`);
    checkAchievements();
  }

  function resetAll() {
    store = defaultStore();
    saveStorage();
  }

  // ---------- State ----------
  let words = [];
  let store = loadStorage();
  let view = "welcome";

  // deck selection
  let selectedTheme = "all"; // "all" or a theme string

  // study
  let studyIndex = 0;

  // quiz
  let quizState = null;

  function activeWords() {
    if (selectedTheme === "all") return words;
    return words.filter((w) => w.theme === selectedTheme);
  }

  function deckLabel() {
    return selectedTheme === "all" ? "All Words" : selectedTheme;
  }

  // ---------- Routing ----------
  const screens = document.querySelectorAll("[data-view]");

  function show(name) {
    view = name;
    screens.forEach((el) => {
      el.classList.toggle("hidden", el.dataset.view !== name);
    });
    if (name === "home") renderHome();
    else if (name === "study") renderStudy();
    else if (name === "quiz-setup") {} // static form
    else if (name === "quiz") renderQuizQuestion();
    else if (name === "stats") renderStats();
    else if (name === "achievements") renderAchievements();
    window.scrollTo(0, 0);
  }

  document.querySelectorAll("[data-go]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      show(el.dataset.go);
    });
  });

  // ---------- Welcome / easter egg ----------
  const startBtn = document.getElementById("start-btn");
  const startLabel = startBtn.querySelector(".start-btn-label");
  startBtn.addEventListener("mouseenter", () => {
    startLabel.textContent = startBtn.dataset.hover;
  });
  startBtn.addEventListener("mouseleave", () => {
    startLabel.textContent = startBtn.dataset.default;
  });
  startBtn.addEventListener("focus", () => {
    startLabel.textContent = startBtn.dataset.hover;
  });
  startBtn.addEventListener("blur", () => {
    startLabel.textContent = startBtn.dataset.default;
  });
  startBtn.addEventListener("click", () => show("home"));

  // ---------- Deck picker ----------
  const deckChips = document.getElementById("deck-chips");
  const deckMeta = document.getElementById("deck-meta");
  const homeDeckName = document.getElementById("home-deck-name");
  const homeDeckCount = document.getElementById("home-deck-count");

  function makeChip(value, label, count) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "deck-chip";
    btn.dataset.value = value;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-pressed", value === selectedTheme ? "true" : "false");
    btn.innerHTML = `${label}<span class="chip-count">${count}</span>`;
    btn.addEventListener("click", () => setSelectedTheme(value));
    return btn;
  }

  function populateDeckChips() {
    const themes = Array.from(new Set(words.map((w) => w.theme).filter(Boolean))).sort();
    deckChips.innerHTML = "";
    deckChips.appendChild(makeChip("all", "All Words", words.length));
    themes.forEach((t) => {
      const n = words.filter((w) => w.theme === t).length;
      deckChips.appendChild(makeChip(t, t, n));
    });
    refreshChipsState();
    updateDeckMeta();
  }

  function refreshChipsState() {
    deckChips.querySelectorAll(".deck-chip").forEach((c) => {
      c.setAttribute("aria-pressed", c.dataset.value === selectedTheme ? "true" : "false");
    });
  }

  function updateDeckMeta() {
    const n = activeWords().length;
    deckMeta.textContent = `${n} word${n === 1 ? "" : "s"} in this deck`;
  }

  function setSelectedTheme(theme) {
    selectedTheme = theme;
    studyIndex = 0;
    if (typeof flashcard !== "undefined" && flashcard) {
      flashcard.classList.remove("flipped");
    }
    refreshChipsState();
    updateDeckMeta();
    if (view === "home") renderHome();
  }

  // ---------- Home ----------
  function renderHome() {
    const total = words.length;
    const viewedCount = words.filter((w) => statsFor(w.word).viewed).length;
    const knownCount = words.filter((w) => statsFor(w.word).known).length;
    const el = document.getElementById("home-progress");
    el.textContent = `${viewedCount}/${total} viewed · ${knownCount} known`;

    // Deck banner
    const active = activeWords();
    homeDeckName.textContent = deckLabel();
    homeDeckCount.textContent = `· ${active.length} word${active.length === 1 ? "" : "s"}`;

    renderHomeStatus();
    renderMenuBadgeCounts();
  }

  function renderHomeStatus() {
    const info = levelInfo(store.xp);
    const lvlEl = document.getElementById("status-level");
    const xpText = document.getElementById("status-xp-text");
    const xpFill = document.getElementById("status-xp-fill");
    if (!lvlEl) return; // not on home

    lvlEl.textContent = String(info.level);
    xpText.textContent = `${info.progress} / ${info.needed}`;
    const pct = info.needed ? (info.progress / info.needed) * 100 : 0;
    xpFill.style.width = `${pct}%`;
  }

  function renderMenuBadgeCounts() {
    const el = document.getElementById("menu-achievements-count");
    if (!el) return;
    const unlocked = Object.keys(store.achievements).length;
    el.textContent = `${unlocked}/${ACHIEVEMENTS.length}`;
  }

  document.getElementById("reset-btn").addEventListener("click", () => {
    if (confirm("Reset all progress and quiz history?")) {
      resetAll();
      renderHome();
    }
  });

  // ---------- Study ----------
  const flashcard = document.getElementById("flashcard");
  const cardWord = document.getElementById("card-word");
  const cardTranscription = document.getElementById("card-transcription");
  const cardSentiment = document.getElementById("card-sentiment");
  const cardMeanings = document.getElementById("card-meanings");
  const cardTranslations = document.getElementById("card-translations");
  const cardSynonyms = document.getElementById("card-synonyms");
  const cardExample = document.getElementById("card-example");
  const cardMistakeSection = document.getElementById("card-mistake-section");
  const cardMistake = document.getElementById("card-mistake");
  const counterCurrent = document.getElementById("counter-current");
  const counterTotal = document.getElementById("counter-total");
  const knownBtn = document.getElementById("known-btn");

  function sentimentClass(s) {
    const v = (s || "").toLowerCase();
    if (v === "positive") return "sentiment-positive";
    if (v === "negative") return "sentiment-negative";
    return "sentiment-neutral";
  }

  function renderStudy() {
    const deck = activeWords();
    if (!deck.length) {
      cardWord.textContent = "Empty deck";
      cardTranscription.textContent = "";
      counterCurrent.textContent = "0";
      counterTotal.textContent = "0";
      return;
    }
    if (studyIndex >= deck.length) studyIndex = 0;
    const w = deck[studyIndex];
    cardWord.textContent = w.word;
    cardTranscription.textContent = w.transcription || "";
    cardSentiment.textContent = w.sentiment;
    cardSentiment.className = "sentiment-pill " + sentimentClass(w.sentiment);
    const mc = w.meanings_count;
    cardMeanings.textContent = mc ? `${mc} meaning${mc === 1 ? "" : "s"}` : "";
    cardTranslations.textContent = (w.translations || []).join(", ");
    cardSynonyms.textContent = (w.synonyms || []).join(", ");
    cardExample.innerHTML = w.example || "";

    // Common mistake block
    if (w.common_mistake && w.common_mistake.trim().length > 0) {
      cardMistake.textContent = w.common_mistake;
      cardMistakeSection.classList.remove("hidden");
    } else {
      cardMistake.textContent = "";
      cardMistakeSection.classList.add("hidden");
    }

    counterCurrent.textContent = String(studyIndex + 1);
    counterTotal.textContent = String(deck.length);

    const s = statsFor(w.word);
    knownBtn.setAttribute("aria-pressed", s.known ? "true" : "false");
    knownBtn.textContent = s.known ? "Known" : "Mark known";

    recordView(w.word);
  }

  flashcard.addEventListener("click", () => flashcard.classList.toggle("flipped"));
  flashcard.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      flashcard.classList.toggle("flipped");
    }
  });

  function studyGo(delta) {
    const n = activeWords().length;
    if (!n) return;
    studyIndex = (studyIndex + delta + n) % n;
    flashcard.classList.remove("flipped");
    renderStudy();
  }
  document.getElementById("prev-btn").addEventListener("click", () => studyGo(-1));
  document.getElementById("next-btn").addEventListener("click", () => studyGo(1));

  knownBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const deck = activeWords();
    if (!deck.length) return;
    const w = deck[studyIndex];
    const s = statsFor(w.word);
    setKnown(w.word, !s.known);
    knownBtn.setAttribute("aria-pressed", s.known ? "true" : "false");
    knownBtn.textContent = s.known ? "Known" : "Mark known";
  });

  document.addEventListener("keydown", (e) => {
    if (view === "study") {
      if (e.key === "ArrowLeft") studyGo(-1);
      else if (e.key === "ArrowRight") studyGo(1);
    } else if (view === "quiz") {
      // Don't intercept keys that belong to the typing input/form
      if (e.target && (e.target.id === "quiz-input" || e.target.tagName === "INPUT")) return;
      // 1..4 to pick option
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 4) {
        const btns = document.querySelectorAll(".quiz-option");
        if (btns[n - 1] && !btns[n - 1].disabled) btns[n - 1].click();
      } else if (e.key === "Enter" || e.key === " ") {
        const next = document.getElementById("quiz-next-btn");
        if (!next.classList.contains("hidden")) {
          e.preventDefault();
          next.click();
        }
      }
    }
  });

  // ---------- Quiz ----------
  const quizPromptLabel = document.getElementById("quiz-prompt-label");
  const quizPrompt = document.getElementById("quiz-prompt");
  const quizOptions = document.getElementById("quiz-options");
  const quizContext = document.getElementById("quiz-context");
  const quizContextSyn = document.getElementById("quiz-context-syn");
  const quizContextEx = document.getElementById("quiz-context-ex");
  const quizTyping = document.getElementById("quiz-typing");
  const quizInput = document.getElementById("quiz-input");
  const quizSubmitBtn = document.getElementById("quiz-submit-btn");
  const quizFeedback = document.getElementById("quiz-feedback");
  const quizNextBtn = document.getElementById("quiz-next-btn");
  const quizCurrentEl = document.getElementById("quiz-current");
  const quizTotalEl = document.getElementById("quiz-total");
  const quizScoreEl = document.getElementById("quiz-score");

  function normalize(s) {
    return (s || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[\.,!\?;:"']+/g, "")
      .replace(/\s+/g, " ");
  }

  function blankOutExample(html) {
    // replace <mark>...</mark> with a blank line
    return (html || "").replace(/<mark>[^<]*<\/mark>/gi, '<span class="blank">_____</span>');
  }

  function findWord(key) {
    return words.find((w) => w.word === key) || null;
  }

  function pickRadio(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : null;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildQuestions(mode, len, pool) {
    let candidates = activeWords().slice();
    if (pool === "weak") {
      candidates.sort((a, b) => {
        const sa = statsFor(a.word);
        const sb = statsFor(b.word);
        const accA = sa.attempts ? sa.correct / sa.attempts : 0.5;
        const accB = sb.attempts ? sb.correct / sb.attempts : 0.5;
        if (accA !== accB) return accA - accB;
        return sb.attempts - sa.attempts;
      });
    } else {
      candidates = shuffle(candidates);
    }
    const count = len === "all" ? candidates.length : Math.min(parseInt(len, 10), candidates.length);
    const chosen = candidates.slice(0, count);

    return chosen.map((w) => {
      // en-ru: prompt = English, answer = RU translation
      // ru-en: prompt = RU, answer = English (multiple choice)
      // type:  prompt = RU, answer = English (typed)
      const isEnRu = mode === "en-ru";
      const promptText = isEnRu ? w.word : (w.translations[0] || w.word);
      const answerText = isEnRu ? (w.translations[0] || "—") : w.word;

      let options = null;
      if (mode !== "type") {
        // Prefer distractors from the same deck for thematic coherence;
        // fall back to the full dictionary if the deck is too small.
        const inDeck = activeWords().filter((x) => x.word !== w.word);
        const outOfDeck = words.filter((x) => x.word !== w.word && !inDeck.includes(x));
        const pool = shuffle(inDeck).concat(shuffle(outOfDeck));
        const distractors = pool.slice(0, 12).map((x) => {
          return isEnRu ? (x.translations[0] || x.word) : x.word;
        });
        const seen = new Set([answerText]);
        const uniqueDistractors = [];
        for (const d of distractors) {
          if (!seen.has(d)) {
            seen.add(d);
            uniqueDistractors.push(d);
            if (uniqueDistractors.length === 3) break;
          }
        }
        while (uniqueDistractors.length < 3) uniqueDistractors.push("—");
        options = shuffle([answerText, ...uniqueDistractors]);
      }

      return {
        key: w.word,
        prompt: promptText,
        answer: answerText,
        options,
        mode,
      };
    });
  }

  document.getElementById("quiz-start-btn").addEventListener("click", () => {
    const mode = pickRadio("quiz-mode");
    const len = pickRadio("quiz-len");
    const pool = pickRadio("quiz-pool");
    const questions = buildQuestions(mode, len, pool);
    if (!questions.length) {
      alert("No words available for the quiz.");
      return;
    }
    quizState = {
      mode,
      questions,
      index: 0,
      answers: [],
      score: 0,
    };
    show("quiz");
  });

  function renderQuizQuestion() {
    if (!quizState) return;
    const q = quizState.questions[quizState.index];
    quizCurrentEl.textContent = String(quizState.index + 1);
    quizTotalEl.textContent = String(quizState.questions.length);
    quizScoreEl.textContent = `${quizState.score}✓`;
    let label;
    if (q.mode === "en-ru") label = "Translate to Russian";
    else if (q.mode === "ru-en") label = "Translate to English";
    else label = "Type the English word";
    quizPromptLabel.textContent = label;
    quizPrompt.textContent = q.prompt;
    quizFeedback.textContent = "";
    quizFeedback.className = "quiz-feedback";
    quizNextBtn.classList.add("hidden");

    if (q.mode === "type") {
      quizOptions.innerHTML = "";
      quizOptions.classList.add("hidden");
      quizTyping.classList.remove("hidden");

      // Populate the English-meaning context (synonyms + cloze example)
      const w = findWord(q.key);
      if (w) {
        const syn = (w.synonyms || []).join(", ");
        quizContextSyn.innerHTML = syn ? `<strong>Means</strong> ${syn}` : "";
        const ex = blankOutExample(w.example);
        quizContextEx.innerHTML = ex ? `<strong>Example</strong> ${ex}` : "";
        quizContext.classList.remove("hidden");
      } else {
        quizContext.classList.add("hidden");
      }

      quizInput.value = "";
      quizInput.disabled = false;
      quizSubmitBtn.disabled = false;
      quizInput.className = "quiz-input";
      // give the DOM a tick so focus works on screen change
      setTimeout(() => quizInput.focus(), 30);
    } else {
      quizContext.classList.add("hidden");
      quizTyping.classList.add("hidden");
      quizOptions.classList.remove("hidden");
      quizOptions.innerHTML = "";
      q.options.forEach((opt, i) => {
        const btn = document.createElement("button");
        btn.className = "quiz-option";
        btn.textContent = `${i + 1}. ${opt}`;
        btn.dataset.value = opt;
        btn.addEventListener("click", () => onPickOption(btn, q));
        quizOptions.appendChild(btn);
      });
    }
  }

  function onPickOption(btn, q) {
    const allBtns = quizOptions.querySelectorAll(".quiz-option");
    const picked = btn.dataset.value;
    const correct = picked === q.answer;

    allBtns.forEach((b) => {
      b.disabled = true;
      const v = b.dataset.value;
      if (v === q.answer) b.classList.add("correct");
      else if (b === btn) b.classList.add("wrong");
      else b.classList.add("muted");
    });

    if (correct) {
      quizState.score += 1;
      quizFeedback.textContent = "Correct!";
      quizFeedback.className = "quiz-feedback correct";
    } else {
      quizFeedback.textContent = `Answer: ${q.answer}`;
      quizFeedback.className = "quiz-feedback wrong";
    }

    quizState.answers.push({ q, picked, correct });
    recordQuiz(q.key, correct, q.mode);
    quizScoreEl.textContent = `${quizState.score}✓`;
    quizNextBtn.classList.remove("hidden");
    quizNextBtn.focus();
  }

  quizTyping.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!quizState) return;
    const q = quizState.questions[quizState.index];
    if (q.mode !== "type") return;
    if (quizInput.disabled) return; // already submitted

    const typed = quizInput.value;
    const correct = normalize(typed) === normalize(q.answer) && normalize(typed).length > 0;

    quizInput.disabled = true;
    quizSubmitBtn.disabled = true;
    quizInput.classList.add(correct ? "correct" : "wrong");

    if (correct) {
      quizState.score += 1;
      quizFeedback.textContent = "Correct!";
      quizFeedback.className = "quiz-feedback correct";
    } else {
      quizFeedback.textContent = `Answer: ${q.answer}`;
      quizFeedback.className = "quiz-feedback wrong";
    }

    // Reveal the word in the example sentence
    const w = findWord(q.key);
    if (w && w.example) {
      quizContextEx.innerHTML = `<strong>Example</strong> ${w.example}`;
    }

    quizState.answers.push({ q, picked: typed.trim() || "(empty)", correct });
    recordQuiz(q.key, correct, q.mode);
    quizScoreEl.textContent = `${quizState.score}✓`;
    quizNextBtn.classList.remove("hidden");
    quizNextBtn.focus();
  });

  quizNextBtn.addEventListener("click", () => {
    if (!quizState) return;
    quizState.index += 1;
    if (quizState.index >= quizState.questions.length) {
      finishQuiz();
    } else {
      renderQuizQuestion();
    }
  });

  function finishQuiz() {
    const total = quizState.questions.length;
    const correct = quizState.score;
    recordSession(quizState.mode, total, correct);

    document.getElementById("result-score").textContent = `${correct} / ${total}`;
    const pct = total ? Math.round((correct / total) * 100) : 0;
    document.getElementById("result-pct").textContent = `${pct}%`;
    const msg = document.getElementById("result-message");
    if (pct === 100) msg.textContent = "Perfect — you crushed it.";
    else if (pct >= 80) msg.textContent = "Great work. Almost there.";
    else if (pct >= 50) msg.textContent = "Decent. Worth another pass.";
    else msg.textContent = "Tough round. Try again — you'll get them.";

    const list = document.getElementById("result-list");
    list.innerHTML = "";
    quizState.answers.forEach((a) => {
      const li = document.createElement("li");
      li.className = a.correct ? "right" : "wrong";
      const q = document.createElement("span");
      q.className = "rl-q";
      q.textContent = a.q.prompt;
      const ans = document.createElement("span");
      ans.className = "rl-a";
      ans.textContent = a.correct ? a.q.answer : `${a.picked} → ${a.q.answer}`;
      li.appendChild(q);
      li.appendChild(ans);
      list.appendChild(li);
    });

    show("quiz-result");
  }

  // ---------- Stats ----------
  function renderStats() {
    const total = words.length;
    const viewed = words.filter((w) => statsFor(w.word).viewed).length;
    const known = words.filter((w) => statsFor(w.word).known).length;
    document.getElementById("stat-viewed").textContent = `${viewed} / ${total}`;
    document.getElementById("stat-known").textContent = `${known} / ${total}`;
    document.getElementById("bar-viewed").style.width = total ? `${(viewed / total) * 100}%` : "0%";
    document.getElementById("bar-known").style.width = total ? `${(known / total) * 100}%` : "0%";

    let attempts = 0, correct = 0;
    words.forEach((w) => {
      const s = statsFor(w.word);
      attempts += s.attempts;
      correct += s.correct;
    });
    const accEl = document.getElementById("stat-accuracy");
    const attEl = document.getElementById("stat-attempts");
    if (attempts > 0) {
      accEl.textContent = `${Math.round((correct / attempts) * 100)}%`;
      attEl.textContent = `${correct} of ${attempts} attempts`;
    } else {
      accEl.textContent = "—";
      attEl.textContent = "No attempts yet";
    }

    const sessions = store.sessions || [];
    document.getElementById("stat-quizzes").textContent = String(sessions.length);
    if (sessions.length) {
      const best = sessions.reduce((m, s) => {
        const p = s.total ? s.correct / s.total : 0;
        return p > m.p ? { p, s } : m;
      }, { p: -1, s: null });
      const pct = Math.round(best.p * 100);
      document.getElementById("stat-best").textContent = `Best: ${best.s.correct}/${best.s.total} (${pct}%)`;
    } else {
      document.getElementById("stat-best").textContent = "No quizzes yet";
    }

    // weakest words: lowest accuracy among attempted, then unviewed words
    const attempted = words
      .map((w) => ({ w, s: statsFor(w.word) }))
      .filter((x) => x.s.attempts > 0)
      .map((x) => ({ ...x, acc: x.s.correct / x.s.attempts }))
      .sort((a, b) => {
        if (a.acc !== b.acc) return a.acc - b.acc;
        return b.s.attempts - a.s.attempts;
      })
      .slice(0, 8);

    const list = document.getElementById("weak-list");
    list.innerHTML = "";
    if (!attempted.length) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="wl-word">—</span><span class="wl-stat">Take a quiz to see weakest words</span>`;
      list.appendChild(li);
    } else {
      attempted.forEach(({ w, s, acc }) => {
        const li = document.createElement("li");
        const wEl = document.createElement("span");
        wEl.className = "wl-word";
        wEl.textContent = w.word;
        const sEl = document.createElement("span");
        sEl.className = "wl-stat";
        sEl.textContent = `${Math.round(acc * 100)}% · ${s.correct}/${s.attempts}`;
        li.appendChild(wEl);
        li.appendChild(sEl);
        list.appendChild(li);
      });
    }
  }

  // ---------- Achievements screen ----------
  function renderAchievements() {
    const grid = document.getElementById("achv-grid");
    const summary = document.getElementById("achv-summary");
    if (!grid) return;
    const unlocked = Object.keys(store.achievements).length;
    const total = ACHIEVEMENTS.length;
    const info = levelInfo(store.xp);
    summary.innerHTML =
      `<strong>${unlocked} / ${total}</strong> unlocked · ` +
      `Level <strong>${info.level}</strong> · ` +
      `<strong>${store.xp}</strong> XP`;

    grid.innerHTML = "";
    ACHIEVEMENTS.forEach((a) => {
      const card = document.createElement("div");
      const isUnlocked = !!store.achievements[a.id];
      card.className = "achv-card " + (isUnlocked ? "unlocked" : "locked");
      const dateStr = isUnlocked
        ? new Date(store.achievements[a.id]).toLocaleDateString()
        : "";
      card.innerHTML = `
        <div class="achv-emoji">${a.emoji}</div>
        <div class="achv-title"></div>
        <div class="achv-desc"></div>
        ${isUnlocked ? `<div class="achv-date"></div>` : ""}
      `;
      card.querySelector(".achv-title").textContent = a.title;
      card.querySelector(".achv-desc").textContent = a.desc;
      if (isUnlocked) card.querySelector(".achv-date").textContent = dateStr;
      grid.appendChild(card);
    });
  }

  // ---------- Boot ----------
  // Cache-bust the dictionary so schema changes always reach the browser
  const DICT_URL = "dictionary.json?v=" + Date.now();
  fetch(DICT_URL, { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then((data) => {
      words = Array.isArray(data) ? data : [];
      counterTotal.textContent = String(words.length);
      populateDeckChips();
      // Silent retroactive check (e.g. for users who already had progress)
      checkAchievements({ silent: true });
      renderHome();
    })
    .catch((err) => {
      console.error(err);
      cardWord.textContent = "Failed to load dictionary";
      cardTranscription.textContent = String(err.message || err);
    });
})();
