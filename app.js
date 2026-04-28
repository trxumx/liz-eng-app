(function () {
  "use strict";

  // ---------- Storage ----------
  const STORAGE_KEY = "liz-vocab:v1";

  function loadStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { words: {}, sessions: [] };
      const parsed = JSON.parse(raw);
      return {
        words: parsed.words || {},
        sessions: parsed.sessions || [],
      };
    } catch (e) {
      console.error("Failed to load storage", e);
      return { words: {}, sessions: [] };
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
    store = { words: {}, sessions: [] };
    saveStorage();
  }

  // ---------- State ----------
  let words = [];
  let store = loadStorage();
  let view = "welcome";

  // study
  let studyIndex = 0;

  // quiz
  let quizState = null;

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

  // ---------- Home ----------
  function renderHome() {
    const total = words.length;
    const viewedCount = words.filter((w) => statsFor(w.word).viewed).length;
    const knownCount = words.filter((w) => statsFor(w.word).known).length;
    const el = document.getElementById("home-progress");
    el.textContent = `${viewedCount}/${total} viewed · ${knownCount} known`;
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
    if (!words.length) return;
    const w = words[studyIndex];
    cardWord.textContent = w.word;
    cardTranscription.textContent = w.transcription || "";
    cardSentiment.textContent = w.sentiment;
    cardSentiment.className = "sentiment-pill " + sentimentClass(w.sentiment);
    const mc = w.meanings_count;
    cardMeanings.textContent = mc ? `${mc} meaning${mc === 1 ? "" : "s"}` : "";
    cardTranslations.textContent = (w.translations || []).join(", ");
    cardSynonyms.textContent = (w.synonyms || []).join(", ");
    cardExample.innerHTML = w.example || "";
    counterCurrent.textContent = String(studyIndex + 1);
    counterTotal.textContent = String(words.length);

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
    if (!words.length) return;
    studyIndex = (studyIndex + delta + words.length) % words.length;
    flashcard.classList.remove("flipped");
    renderStudy();
  }
  document.getElementById("prev-btn").addEventListener("click", () => studyGo(-1));
  document.getElementById("next-btn").addEventListener("click", () => studyGo(1));

  knownBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const w = words[studyIndex];
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
    let candidates = words.slice();
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
        const distractorPool = words.filter((x) => x.word !== w.word);
        const distractors = shuffle(distractorPool).slice(0, 8).map((x) => {
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
      quizInput.value = "";
      quizInput.disabled = false;
      quizSubmitBtn.disabled = false;
      quizInput.className = "quiz-input";
      // give the DOM a tick so focus works on screen change
      setTimeout(() => quizInput.focus(), 30);
    } else {
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
  fetch("dictionary.json")
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then((data) => {
      words = Array.isArray(data) ? data : [];
      counterTotal.textContent = String(words.length);
      renderHome();
    })
    .catch((err) => {
      console.error(err);
      cardWord.textContent = "Failed to load dictionary";
      cardTranscription.textContent = String(err.message || err);
    });
})();
