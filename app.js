(function () {
  "use strict";

  // ---------- Profiles & Storage ----------
  const PROFILES = {
    liza: { emoji: "💗", name: "Liza" },
    igor: { emoji: "⚡", name: "Igor" },
  };
  const ACTIVE_PROFILE_KEY = "liz-vocab:active-profile";
  const STORAGE_PREFIX = "liz-vocab:v1";

  let activeProfile = localStorage.getItem(ACTIVE_PROFILE_KEY);
  if (!PROFILES[activeProfile]) activeProfile = null;

  function storageKey() {
    return activeProfile ? `${STORAGE_PREFIX}:${activeProfile}` : null;
  }

  function defaultStore() {
    return {
      words: {},
      sessions: [],
    };
  }

  function loadStorage() {
    const key = storageKey();
    if (!key) return defaultStore();
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return defaultStore();
      const parsed = JSON.parse(raw);
      const def = defaultStore();
      return {
        words: parsed.words || def.words,
        sessions: parsed.sessions || def.sessions,
      };
    } catch (e) {
      console.error("Failed to load storage", e);
      return defaultStore();
    }
  }

  function saveStorage() {
    const key = storageKey();
    if (!key) return; // no profile selected; nothing to save
    try {
      localStorage.setItem(key, JSON.stringify(store));
    } catch (e) {
      console.error("Failed to save storage", e);
    }
  }

  function statsFor(key) {
    if (!store.words[key]) {
      store.words[key] = {
        viewed: false,
        known: false,
        seen: 0,
        attempts: 0,
        correct: 0,
        lastSeen: 0,
      };
    }
    return store.words[key];
  }

  function recordView(key) {
    const s = statsFor(key);
    s.viewed = true;
    s.seen += 1;
    s.lastSeen = Date.now();
    saveStorage();
  }

  function setKnown(key, value) {
    statsFor(key).known = !!value;
    saveStorage();
  }

  function recordQuiz(key, correct) {
    const s = statsFor(key);
    s.attempts += 1;
    if (correct) s.correct += 1;
    s.lastSeen = Date.now();
    saveStorage();
  }

  function recordSession(mode, total, correct) {
    store.sessions.push({
      ts: Date.now(),
      mode,
      total,
      correct,
    });
    saveStorage();
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
    window.scrollTo(0, 0);
  }

  document.querySelectorAll("[data-go]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      show(el.dataset.go);
    });
  });

  // ---------- Profile picker (welcome) ----------
  const profileBtns = document.querySelectorAll(".profile-btn");
  const profilePill = document.getElementById("profile-pill");
  const profilePillEmoji = document.getElementById("profile-pill-emoji");
  const profilePillName = document.getElementById("profile-pill-name");

  function refreshProfileChips() {
    profileBtns.forEach((b) => {
      b.setAttribute("aria-pressed", b.dataset.profile === activeProfile ? "true" : "false");
    });
    if (activeProfile && PROFILES[activeProfile]) {
      profilePillEmoji.textContent = PROFILES[activeProfile].emoji;
      profilePillName.textContent = PROFILES[activeProfile].name;
    }
    refreshStartButton();
  }

  function refreshStartButton() {
    if (!activeProfile) {
      startBtn.disabled = true;
      startBtn.dataset.hover = "pick a profile first";
    } else if (activeProfile === "liza") {
      startBtn.disabled = false;
      startBtn.dataset.hover = "hi lizzy <3";
    } else {
      startBtn.disabled = false;
      startBtn.dataset.hover = "let's go";
    }
    // Reset visible label in case it was showing a stale hover text
    if (!startBtn.matches(":hover") && document.activeElement !== startBtn) {
      startLabel.textContent = startBtn.dataset.default;
    }
  }

  function setActiveProfile(name) {
    if (!PROFILES[name]) return;
    activeProfile = name;
    localStorage.setItem(ACTIVE_PROFILE_KEY, name);
    store = loadStorage();
    refreshProfileChips();
    if (view === "home") renderHome();
  }

  profileBtns.forEach((b) => {
    b.addEventListener("click", () => setActiveProfile(b.dataset.profile));
  });

  // Reflect any saved profile right away (don't wait for dictionary fetch).
  refreshProfileChips();

  // ---------- Welcome / easter egg ----------
  const startBtn = document.getElementById("start-btn");
  const startLabel = startBtn.querySelector(".start-btn-label");
  startBtn.addEventListener("mouseenter", () => {
    if (startBtn.disabled) return;
    startLabel.textContent = startBtn.dataset.hover;
  });
  startBtn.addEventListener("mouseleave", () => {
    startLabel.textContent = startBtn.dataset.default;
  });
  startBtn.addEventListener("focus", () => {
    if (startBtn.disabled) return;
    startLabel.textContent = startBtn.dataset.hover;
  });
  startBtn.addEventListener("blur", () => {
    startLabel.textContent = startBtn.dataset.default;
  });
  startBtn.addEventListener("click", () => {
    if (!activeProfile) return;
    show("home");
  });

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

  function setSection(sectionEl, contentEl, value) {
    // Generic helper to hide a back-section if its value is empty.
    if (!sectionEl) return;
    if (value && String(value).trim().length > 0) {
      sectionEl.classList.remove("hidden");
    } else {
      sectionEl.classList.add("hidden");
    }
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

    const translationsText = (w.translations || []).filter(Boolean).join(", ");
    const synonymsText = (w.synonyms || []).filter(Boolean).join(", ");

    cardTranslations.textContent = translationsText;
    cardSynonyms.textContent = synonymsText;
    cardExample.innerHTML = w.example || "";

    // Hide empty back-sections so the card doesn't show bare labels.
    setSection(cardTranslations.closest(".back-section"), cardTranslations, translationsText);
    setSection(cardSynonyms.closest(".back-section"), cardSynonyms, synonymsText);
    setSection(cardExample.closest(".back-section"), cardExample, w.example);

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

  // Whether a word can serve as a question (or distractor) in the chosen mode.
  function isQuizable(w, mode) {
    if (!w) return false;
    const hasTrans = Array.isArray(w.translations) && w.translations[0] && w.translations[0].trim().length > 0;
    const hasWord = w.word && w.word.trim().length > 0;
    if (mode === "en-ru" || mode === "ru-en" || mode === "type") {
      return hasTrans && hasWord;
    }
    return hasWord;
  }

  function quizableCount(mode) {
    return activeWords().filter((w) => isQuizable(w, mode)).length;
  }

  function buildQuestions(mode, len, pool) {
    let candidates = activeWords().filter((w) => isQuizable(w, mode));
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
      const promptText = isEnRu ? w.word : w.translations[0];
      const answerText = isEnRu ? w.translations[0] : w.word;

      let options = null;
      if (mode !== "type") {
        // Distractors: only from words that also pass isQuizable for this mode,
        // so we don't mix English fallbacks into a Russian options list.
        const distractorPool = words.filter(
          (x) => x.word !== w.word && isQuizable(x, mode)
        );
        // Prefer same-theme distractors; fall back to the rest.
        const sameTheme = distractorPool.filter((x) => x.theme === w.theme);
        const otherTheme = distractorPool.filter((x) => x.theme !== w.theme);
        const ordered = shuffle(sameTheme).concat(shuffle(otherTheme));
        const seen = new Set([answerText]);
        const uniqueDistractors = [];
        for (const x of ordered) {
          const d = isEnRu ? x.translations[0] : x.word;
          if (!d || seen.has(d)) continue;
          seen.add(d);
          uniqueDistractors.push(d);
          if (uniqueDistractors.length === 3) break;
        }
        // If the entire dictionary doesn't have enough valid distractors,
        // we just show fewer options. (Should be rare.)
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
    recordQuiz(q.key, correct);
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
    recordQuiz(q.key, correct);
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
      refreshProfileChips();
      renderHome();
    })
    .catch((err) => {
      console.error(err);
      cardWord.textContent = "Failed to load dictionary";
      cardTranscription.textContent = String(err.message || err);
    });
})();
