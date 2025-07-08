// ==========================
// Dopamine Rewards Tracker JS
// ==========================

// --- Data model and persistence ---

const LS_KEY = 'dopamine-tracker-data-v2';

let state = {
  rewards: [
    { name: "Exercise", custom: false },
    { name: "Read", custom: false },
    { name: "Meditate", custom: false },
    { name: "Walk", custom: false }
  ],
  dailyStats: {},
  activityLog: [],
  streak: 0,
  lastCompletedDate: null,
  mood: {},
  theme: 'light'
};
let undoStack = [];

function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
function loadState() {
  const data = localStorage.getItem(LS_KEY);
  if (data) {
    try {
      state = JSON.parse(data);
    } catch {}
  }
}
loadState();

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// --- Utilities ---
function showSnackbar(msg, undoCallback) {
  const snackbar = document.getElementById('undo-snackbar');
  snackbar.querySelector('span').textContent = msg;
  snackbar.hidden = false;
  snackbar.undoCallback = undoCallback;
}
function hideSnackbar() {
  const snackbar = document.getElementById('undo-snackbar');
  snackbar.hidden = true;
  snackbar.undoCallback = null;
}

// --- Theme ---
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  state.theme = theme;
  saveState();
}
document.getElementById('theme-toggle').addEventListener('click', () => {
  const newTheme = state.theme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
});
applyTheme(state.theme || 'light');

// --- Rewards List (Sidebar) ---

function renderRewardList() {
  const ul = document.getElementById('reward-list');
  ul.innerHTML = '';
  state.rewards.forEach((reward, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${reward.name}</span>
      <span class="reward-controls">
        <button type="button" title="Edit" aria-label="Edit reward" class="edit" data-idx="${idx}">✏️</button>
        <button type="button" title="Delete" aria-label="Delete reward" class="delete" data-idx="${idx}">🗑️</button>
        <button type="button" title="Move up" aria-label="Move reward up" class="up" data-idx="${idx}">⬆️</button>
        <button type="button" title="Move down" aria-label="Move reward down" class="down" data-idx="${idx}">⬇️</button>
      </span>
    `;
    ul.appendChild(li);
  });
}
document.getElementById('reward-list').addEventListener('click', (e) => {
  const idx = e.target.dataset.idx;
  if (e.target.classList.contains('edit')) {
    const newName = prompt('Edit reward name:', state.rewards[idx].name);
    if (newName && newName.trim()) {
      state.rewards[idx].name = newName.trim();
      saveState(); renderRewardList(); renderRewardItems();
    }
  }
  if (e.target.classList.contains('delete')) {
    const removed = state.rewards.splice(idx, 1)[0];
    saveState(); renderRewardList(); renderRewardItems();
    showSnackbar(`Reward "${removed.name}" deleted.`, () => {
      state.rewards.splice(idx, 0, removed);
      saveState(); renderRewardList(); renderRewardItems();
    });
  }
  if (e.target.classList.contains('up') && idx > 0) {
    [state.rewards[idx-1], state.rewards[idx]] = [state.rewards[idx], state.rewards[idx-1]];
    saveState(); renderRewardList(); renderRewardItems();
  }
  if (e.target.classList.contains('down') && idx < state.rewards.length - 1) {
    [state.rewards[idx], state.rewards[+idx+1]] = [state.rewards[+idx+1], state.rewards[idx]];
    saveState(); renderRewardList(); renderRewardItems();
  }
});

document.getElementById('add-reward-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('reward-input');
  const val = input.value.trim();
  if (val) {
    state.rewards.push({ name: val, custom: true });
    input.value = '';
    saveState(); renderRewardList(); renderRewardItems();
  }
});

// --- Reward Items (Main Tracker) ---

function renderRewardItems() {
  const container = document.getElementById('reward-items');
  container.innerHTML = '';
  const today = todayISO();
  const checked = state.dailyStats[today] || [];
  state.rewards.forEach((reward, idx) => {
    const div = document.createElement('div');
    div.className = 'reward-item';
    div.innerHTML = `
      <input type="checkbox" class="reward-checkbox" id="reward-${idx}" data-idx="${idx}" ${checked.includes(idx) ? 'checked' : ''} aria-label="Mark ${reward.name} as complete">
      <label class="reward-label" for="reward-${idx}">${reward.name}</label>
    `;
    container.appendChild(div);
  });
}
document.getElementById('reward-items').addEventListener('change', (e) => {
  if (e.target.classList.contains('reward-checkbox')) {
    debounceRewardCheck(e.target);
  }
});
let debounceTimer = null;
function debounceRewardCheck(target) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const idx = +target.dataset.idx;
    const today = todayISO();
    state.dailyStats[today] = state.dailyStats[today] || [];
    const checked = state.dailyStats[today];
    if (target.checked && !checked.includes(idx)) {
      checked.push(idx);
      logActivity(`Completed "${state.rewards[idx].name}"`);
    } else if (!target.checked && checked.includes(idx)) {
      state.dailyStats[today] = checked.filter(i => i !== idx);
      logActivity(`Unchecked "${state.rewards[idx].name}"`);
    }
    saveState();
    renderStreak();
    renderAnalytics();
  }, 200);
}

// --- Streak Logic ---
function renderStreak() {
  const info = document.getElementById('streak-info');
  const today = todayISO();
  let streak = 0;
  let date = new Date(today);
  while (true) {
    const dateStr = date.toISOString().slice(0, 10);
    if (state.dailyStats[dateStr] && state.dailyStats[dateStr].length === state.rewards.length) {
      streak++;
      date.setDate(date.getDate() - 1);
    } else {
      break;
    }
  }
  state.streak = streak;
  info.textContent = `🔥 Current Streak: ${streak} day${streak !== 1 ? 's' : ''}`;
  if (streak && streak % 7 === 0) triggerCelebration();
}

// --- Mood Tracker ---
function renderMood() {
  const today = todayISO();
  const currentMood = state.mood[today];
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.mood === currentMood);
  });
}
document.getElementById('mood-buttons').addEventListener('click', (e) => {
  if (e.target.classList.contains('mood-btn')) {
    const mood = e.target.dataset.mood;
    state.mood[todayISO()] = mood;
    saveState();
    renderMood();
    logActivity(`Mood set: ${mood}`);
    renderAnalytics();
  }
});

// --- Activity Log ---
function logActivity(text) {
  const entry = { text, time: new Date().toLocaleTimeString() };
  state.activityLog.unshift(entry);
  state.activityLog = state.activityLog.slice(0, 25);
  saveState();
  renderActivityLog();
}
function renderActivityLog() {
  const ul = document.getElementById('activity-log');
  ul.innerHTML = '';
  state.activityLog.forEach(entry => {
    const li = document.createElement('li');
    li.textContent = `[${entry.time}] ${entry.text}`;
    ul.appendChild(li);
  });
}

// --- Trends & Analytics ---
let chart;
function renderAnalytics() {
  if (!window.Chart) return;
  const ctx = document.getElementById('analytics-chart').getContext('2d');
  const days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6-i));
    return d.toISOString().slice(0, 10);
  });
  const rewardCounts = days.map(d => (state.dailyStats[d] || []).length);
  const moodVals = days.map(d => {
    switch (state.mood[d]) {
      case 'happy': return 2;
      case 'neutral': return 1;
      case 'sad': return 0;
      default: return null;
    }
  });
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Rewards Completed',
          data: rewardCounts,
          borderColor: '#3b82f6',
          fill: false
        },
        {
          label: 'Mood (0=Sad, 2=Happy)',
          data: moodVals,
          borderColor: '#f59e42',
          fill: false,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      scales: {
        y: { beginAtZero: true, max: state.rewards.length },
        y1: { beginAtZero: true, max: 2, position: 'right', grid: { drawOnChartArea: false } }
      }
    }
  });
}

// --- Export and Import ---
document.getElementById('export-data').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'dopamine-tracker-backup.json';
  a.click();
});
document.getElementById('import-data-btn').addEventListener('click', () => {
  document.getElementById('import-data').click();
});
document.getElementById('import-data').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.rewards && data.dailyStats) {
        state = data;
        saveState();
        renderAll();
        logActivity('Data imported');
      } else {
        alert('Invalid data format.');
      }
    } catch {
      alert('Failed to import data.');
    }
  };
  reader.readAsText(file);
});

// --- Reset & Undo ---
document.getElementById('reset-all').addEventListener('click', () => {
  undoStack.push(JSON.stringify(state));
  state.dailyStats = {};
  state.activityLog = [];
  state.mood = {};
  saveState();
  renderAll();
  showSnackbar('All data reset.', () => {
    if (undoStack.length) {
      state = JSON.parse(undoStack.pop());
      saveState();
      renderAll();
    }
  });
});
document.getElementById('undo-btn').addEventListener('click', () => {
  const snackbar = document.getElementById('undo-snackbar');
  if (snackbar.undoCallback) snackbar.undoCallback();
  hideSnackbar();
});

// --- Celebration (Confetti) ---
function triggerCelebration() {
  if (!window.confetti) return;
  window.confetti({ particleCount: 60, spread: 80 });
}

// --- Initialization ---
function renderAll() {
  renderRewardList();
  renderRewardItems();
  renderStreak();
  renderMood();
  renderActivityLog();
  renderAnalytics();
  hideSnackbar();
}

window.addEventListener('DOMContentLoaded', () => {
  renderAll();
  // Load Chart.js and confetti for analytics/celebration
  if (!window.Chart) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.onload = renderAnalytics;
    document.body.appendChild(script);
  }
  if (!window.confetti) {
    const confettiScript = document.createElement('script');
    confettiScript.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
    document.body.appendChild(confettiScript);
  }
});
