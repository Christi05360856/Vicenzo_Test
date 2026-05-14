/* =========================================================
   PROPHET VINCENZO QUIZ ENGINE
   - Cryptographic shuffle (Fisher-Yates via getRandomValues)
   - 50 questions per session
   - 15:00 countdown
   - Full review with explanations
   ========================================================= */

/* ---------- Utilities ---------- */
function cryptoShuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    window.crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/* ---------- State ---------- */
let quizQuestions = [];   // 50 selected + option-shuffled questions
let currentIndex = 0;
let userAnswers = [];     // null | 0..3
let timerInterval = null;
const TOTAL_TIME = 15 * 60; // 15 minutes

/* ---------- DOM Refs ---------- */
const screens = {
  landing: document.getElementById('landing-screen'),
  quiz:    document.getElementById('quiz-screen'),
  results: document.getElementById('results-screen'),
  review:  document.getElementById('review-screen')
};

const els = {
  timerText:      document.getElementById('timer-text'),
  timerRing:      document.querySelector('.timer-progress'),
  progressBar:    document.getElementById('progress-bar'),
  counter:        document.getElementById('question-counter'),
  questionText:   document.getElementById('question-text'),
  optionsBox:     document.getElementById('options-container'),
  prevBtn:        document.getElementById('prev-btn'),
  nextBtn:        document.getElementById('next-btn'),
  submitBtn:      document.getElementById('submit-btn'),
  navPanel:       document.getElementById('nav-panel'),
  navGrid:        document.getElementById('nav-grid'),
  scorePercent:   document.getElementById('score-percent'),
  scoreCircle:    document.getElementById('score-circle'),
  statCorrect:    document.getElementById('stat-correct'),
  statWrong:      document.getElementById('stat-wrong'),
  statSkipped:    document.getElementById('stat-skipped'),
  statTime:       document.getElementById('stat-time'),
  reviewBox:      document.getElementById('review-container')
};

/* ---------- Core Quiz Logic ---------- */
function initQuiz() {
  if (!window.ALL_QUESTIONS || !Array.isArray(window.ALL_QUESTIONS)) {
    alert('Error: questions.js did not load. Make sure it is in the same folder and loaded before script.js.');
    return;
  }

  // 1. Shuffle full bank and pick 50
  const shuffledPool = cryptoShuffle(window.ALL_QUESTIONS);
  const selected = shuffledPool.slice(0, 50);

  // 2. Shuffle options within each question and remap correct index
  quizQuestions = selected.map(q => {
    const wrapped = q.opts.map((text, idx) => ({ text, originalIdx: idx }));
    const shuffledOpts = cryptoShuffle(wrapped);
    const newAns = shuffledOpts.findIndex(o => o.originalIdx === q.ans);
    return {
      id: q.id,
      q: q.q,
      opts: shuffledOpts.map(o => o.text),
      ans: newAns,
      exp: q.exp
    };
  });

  userAnswers = new Array(50).fill(null);
  currentIndex = 0;
  timeLeft = TOTAL_TIME;

  showScreen(screens.quiz);
  renderQuestion();
  renderNav();
  startTimer();
}

let timeLeft = TOTAL_TIME;

function startTimer() {
  clearInterval(timerInterval);
  updateTimerUI();
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerUI();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      finishQuiz(true);
    }
  }, 1000);
}

function updateTimerUI() {
  els.timerText.textContent = formatTime(timeLeft);

  const r = 45;
  const circumference = 2 * Math.PI * r; // ~283
  const offset = circumference - (timeLeft / TOTAL_TIME) * circumference;
  els.timerRing.style.strokeDashoffset = offset;

  // Color warnings
  if (timeLeft <= 60) els.timerRing.style.stroke = 'var(--wrong)';
  else if (timeLeft <= 300) els.timerRing.style.stroke = 'var(--skipped)';
  else els.timerRing.style.stroke = 'var(--accent-gold)';
}

function renderQuestion() {
  const q = quizQuestions[currentIndex];

  els.questionText.textContent = `${currentIndex + 1}. ${q.q}`;
  els.counter.textContent = `${currentIndex + 1} / 50`;

  els.optionsBox.innerHTML = '';
  q.opts.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.dataset.label = String.fromCharCode(65 + idx); // A, B, C, D
    btn.textContent = opt;
    if (userAnswers[currentIndex] === idx) btn.classList.add('selected');
    btn.addEventListener('click', () => selectOption(idx));
    els.optionsBox.appendChild(btn);
  });

  els.prevBtn.disabled = currentIndex === 0;

  if (currentIndex === 49) {
    els.nextBtn.classList.add('hidden');
    els.submitBtn.classList.remove('hidden');
  } else {
    els.nextBtn.classList.remove('hidden');
    els.submitBtn.classList.add('hidden');
  }

  updateProgress();
  updateNav();
}

function selectOption(idx) {
  userAnswers[currentIndex] = idx;
  renderQuestion(); // refresh selected styling
  updateNav();
}

function nextQuestion() {
  if (currentIndex < 49) {
    currentIndex++;
    renderQuestion();
  }
}

function prevQuestion() {
  if (currentIndex > 0) {
    currentIndex--;
    renderQuestion();
  }
}

function updateProgress() {
  const answered = userAnswers.filter(a => a !== null).length;
  const pct = (answered / 50) * 100;
  els.progressBar.style.width = `${pct}%`;
}

/* ---------- Navigator ---------- */
function renderNav() {
  els.navGrid.innerHTML = '';
  for (let i = 0; i < 50; i++) {
    const btn = document.createElement('button');
    btn.className = 'nav-dot';
    btn.textContent = i + 1;
    if (i === currentIndex) btn.classList.add('current');
    if (userAnswers[i] !== null) btn.classList.add('answered');
    btn.addEventListener('click', () => {
      currentIndex = i;
      renderQuestion();
    });
    els.navGrid.appendChild(btn);
  }
}

function updateNav() {
  const dots = els.navGrid.querySelectorAll('.nav-dot');
  dots.forEach((btn, i) => {
    btn.classList.toggle('current', i === currentIndex);
    btn.classList.toggle('answered', userAnswers[i] !== null);
  });
}

/* ---------- Finish & Results ---------- */
function finishQuiz(timeExpired = false) {
  clearInterval(timerInterval);

  let correct = 0, wrong = 0, skipped = 0;
  quizQuestions.forEach((q, i) => {
    if (userAnswers[i] === null) skipped++;
    else if (userAnswers[i] === q.ans) correct++;
    else wrong++;
  });

  const scorePct = Math.round((correct / 50) * 100);
  const timeUsed = TOTAL_TIME - timeLeft;

  els.scorePercent.textContent = `${scorePct}%`;
  els.scoreCircle.style.setProperty('--score-deg', `${(scorePct / 100) * 360}deg`);

  els.statCorrect.textContent = correct;
  els.statWrong.textContent = wrong;
  els.statSkipped.textContent = skipped;
  els.statTime.textContent = formatTime(timeUsed);

  showScreen(screens.results);

  if (timeExpired) {
    setTimeout(() => alert('Time is up! Your quiz has been submitted automatically.'), 100);
  }
}

/* ---------- Review Mode ---------- */
function showReview() {
  els.reviewBox.innerHTML = '';

  quizQuestions.forEach((q, i) => {
    const userAns = userAnswers[i];
    const isCorrect = userAns === q.ans;
    const isSkipped = userAns === null;

    const card = document.createElement('div');
    card.className = `review-card ${isSkipped ? 'skipped' : isCorrect ? 'correct' : 'wrong'}`;

    const badge = isSkipped
      ? '<span class="badge skipped">Skipped</span>'
      : isCorrect
        ? '<span class="badge correct">Correct</span>'
        : '<span class="badge wrong">Wrong</span>';

    const optsHtml = q.opts.map((opt, idx) => {
      let cls = '';
      if (idx === q.ans) cls = 'correct-ans';
      if (idx === userAns && !isCorrect) cls = 'wrong-ans';
      return `<div class="review-opt ${cls}">${String.fromCharCode(65 + idx)}. ${opt}</div>`;
    }).join('');

    card.innerHTML = `
      <div class="review-top">
        <h3>Q${i + 1}: ${q.q}</h3>
        ${badge}
      </div>
      <div class="review-opts">${optsHtml}</div>
      <div class="review-exp">${q.exp}</div>
    `;

    els.reviewBox.appendChild(card);
  });

  showScreen(screens.review);
}

/* ---------- Screen Helpers ---------- */
function showScreen(screenEl) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screenEl.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Event Listeners ---------- */
document.getElementById('start-btn').addEventListener('click', initQuiz);

els.nextBtn.addEventListener('click', nextQuestion);
els.prevBtn.addEventListener('click', prevQuestion);

document.getElementById('nav-toggle').addEventListener('click', () => {
  els.navPanel.classList.toggle('hidden');
});

els.submitBtn.addEventListener('click', () => {
  const skipped = userAnswers.filter(a => a === null).length;
  if (skipped > 0) {
    const ok = confirm(`You have ${skipped} unanswered question(s). Submit anyway?`);
    if (!ok) return;
  }
  finishQuiz(false);
});

document.getElementById('review-btn').addEventListener('click', showReview);
document.getElementById('close-review-btn').addEventListener('click', () => showScreen(screens.results));
document.getElementById('restart-btn').addEventListener('click', () => {
  clearInterval(timerInterval);
  els.navPanel.classList.add('hidden');
  showScreen(screens.landing);
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (!screens.quiz.classList.contains('active')) return;

  if (e.key === 'ArrowRight') nextQuestion();
  if (e.key === 'ArrowLeft') prevQuestion();
  if (['1', '2', '3', '4'].includes(e.key)) {
    selectOption(parseInt(e.key) - 1);
  }
});
