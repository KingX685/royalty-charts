import {
  openDB,
  getAllJournals,
  addJournal,
  updateJournal,
  deleteJournal,
  getTradesByJournal,
  addTrade,
  updateTrade,
  deleteTrade,
  getConfluenceTemplate,
  saveConfluenceTemplate,
} from './db.js';
import { getMonthMatrix, formatDateKey } from './calendar.js';
import { computeStats, confluenceBuckets, drawLineChart, drawBarChart } from './analytics.js';

const defaultTemplate = [
  'Trend aligned',
  'Setup confirmed',
  'Entry trigger valid',
  'SL placement correct',
  'Risk respected',
  'News checked',
];

const state = {
  currentJournal: null,
  trades: [],
  template: [],
  selectedMonth: new Date(),
  editingTradeId: null,
  screenshotBuffers: [],
};

const dom = {
  journalSelector: document.getElementById('journalSelector'),
  journalList: document.getElementById('journalList'),
  journalEmptyState: document.getElementById('journalEmptyState'),
  newJournalName: document.getElementById('newJournalName'),
  createJournalBtn: document.getElementById('createJournalBtn'),
  backToJournals: document.getElementById('backToJournals'),
  journalApp: document.getElementById('journalApp'),
  tabs: document.querySelectorAll('.tab'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  calendarLabel: document.getElementById('calendarLabel'),
  calendarGrid: document.getElementById('calendarGrid'),
  dayDetail: document.getElementById('dayDetail'),
  prevMonth: document.getElementById('prevMonth'),
  nextMonth: document.getElementById('nextMonth'),
  tradeForm: document.getElementById('tradeForm'),
  confluenceChecklist: document.getElementById('confluenceChecklist'),
  screenshotInput: document.getElementById('screenshotInput'),
  screenshotPreview: document.getElementById('screenshotPreview'),
  riskGuidance: document.getElementById('riskGuidance'),
  resetTradeForm: document.getElementById('resetTradeForm'),
  tradeList: document.getElementById('tradeList'),
  tradeSearch: document.getElementById('tradeSearch'),
  tradeSort: document.getElementById('tradeSort'),
  analyticsStats: document.getElementById('analyticsStats'),
  confluenceStats: document.getElementById('confluenceStats'),
  equityChart: document.getElementById('equityChart'),
  dailyChart: document.getElementById('dailyChart'),
  filterStart: document.getElementById('filterStart'),
  filterEnd: document.getElementById('filterEnd'),
  filterInstrument: document.getElementById('filterInstrument'),
  filterDirection: document.getElementById('filterDirection'),
  filterMarket: document.getElementById('filterMarket'),
  filterTag: document.getElementById('filterTag'),
  filterConfluenceMin: document.getElementById('filterConfluenceMin'),
  filterConfluenceMax: document.getElementById('filterConfluenceMax'),
  applyFilters: document.getElementById('applyFilters'),
  journalNameInput: document.getElementById('journalNameInput'),
  renameJournal: document.getElementById('renameJournal'),
  deleteJournal: document.getElementById('deleteJournal'),
  templateEditor: document.getElementById('templateEditor'),
  newTemplateItem: document.getElementById('newTemplateItem'),
  addTemplateItem: document.getElementById('addTemplateItem'),
  instrumentValues: document.getElementById('instrumentValues'),
  instrumentName: document.getElementById('instrumentName'),
  instrumentValue: document.getElementById('instrumentValue'),
  instrumentType: document.getElementById('instrumentType'),
  addInstrumentValue: document.getElementById('addInstrumentValue'),
  exportJson: document.getElementById('exportJson'),
  exportCsv: document.getElementById('exportCsv'),
  importJson: document.getElementById('importJson'),
  installBtn: document.getElementById('installBtn'),
};

let deferredPrompt;

async function init() {
  await openDB();
  registerServiceWorker();
  bindEvents();
  await loadJournalsFromDB();
}

function bindEvents() {
  dom.createJournalBtn.addEventListener('click', handleCreateJournal);
  dom.backToJournals.addEventListener('click', () => showJournalSelector());
  dom.tabs.forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  dom.prevMonth.addEventListener('click', () => changeMonth(-1));
  dom.nextMonth.addEventListener('click', () => changeMonth(1));
  dom.tradeForm.addEventListener('submit', handleTradeSubmit);
  dom.resetTradeForm.addEventListener('click', resetTradeForm);
  dom.screenshotInput.addEventListener('change', handleScreenshots);
  dom.tradeSearch.addEventListener('input', renderTradesList);
  dom.tradeSort.addEventListener('change', renderTradesList);
  dom.applyFilters.addEventListener('click', renderAnalytics);
  dom.renameJournal.addEventListener('click', renameJournal);
  dom.deleteJournal.addEventListener('click', handleDeleteJournal);
  dom.addTemplateItem.addEventListener('click', handleAddTemplateItem);
  dom.addInstrumentValue.addEventListener('click', handleAddInstrumentValue);
  dom.exportJson.addEventListener('click', exportJournalJson);
  dom.exportCsv.addEventListener('click', exportJournalCsv);
  dom.importJson.addEventListener('change', importJournalJson);

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    dom.installBtn.classList.remove('hidden');
  });

  dom.installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    dom.installBtn.classList.add('hidden');
  });

  dom.tradeForm.querySelector('[name="balance"]').addEventListener('input', updateRiskAmount);
  dom.tradeForm.querySelector('[name="riskPercent"]').addEventListener('input', updateRiskAmount);
  dom.tradeForm.querySelector('[name="entryPrice"]').addEventListener('input', updateRiskGuidance);
  dom.tradeForm.querySelector('[name="stopLoss"]').addEventListener('input', updateRiskGuidance);
  dom.tradeForm.querySelector('[name="marketType"]').addEventListener('change', updateRiskGuidance);
  dom.tradeForm.querySelector('[name="instrument"]').addEventListener('input', updateRiskGuidance);
}

async function loadJournalsFromDB() {
  const journals = await getAllJournals();
  renderJournals(journals);
}

function renderJournals(journals) {
  console.log('renderJournals count', journals.length);
  dom.journalList.innerHTML = '';
  dom.journalEmptyState.classList.toggle('hidden', journals.length > 0);
  if (!journals.length) return;
  journals.forEach((journal) => {
    const card = document.createElement('div');
    card.className = 'journal-card';
    card.innerHTML = `
      <div>
        <h3>${journal.name}</h3>
        <p class="muted">Trades: ${journal.tradeCount || 0}</p>
      </div>
      <button class="btn btn-primary">Open</button>
    `;
    card.querySelector('button').addEventListener('click', () => openJournal(journal.id));
    dom.journalList.appendChild(card);
  });
}

async function handleCreateJournal() {
  const name = dom.newJournalName.value.trim();
  if (!name) return;
  const journal = {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    tradeCount: 0,
    instrumentValues: [],
  };
  await addJournal(journal);
  await saveConfluenceTemplate(journal.id, defaultTemplate.map((item) => ({ id: crypto.randomUUID(), label: item })));
  dom.newJournalName.value = '';
  await loadJournalsFromDB();
}

async function openJournal(id) {
  const journals = await getAllJournals();
  const journal = journals.find((j) => j.id === id);
  if (!journal) return;
  state.currentJournal = journal;
  dom.journalNameInput.value = journal.name;
  dom.backToJournals.classList.remove('hidden');
  dom.journalSelector.classList.remove('active');
  dom.journalApp.classList.add('active');
  state.trades = await getTradesByJournal(journal.id);
  state.currentJournal.tradeCount = state.trades.length;
  await updateJournal(state.currentJournal);
  await loadTemplate();
  updateJournalStats();
  resetTradeForm();
  renderCalendar();
  renderTradesList();
  renderAnalytics();
  renderTemplateEditor();
  renderInstrumentValues();
}

function showJournalSelector() {
  dom.journalSelector.classList.add('active');
  dom.journalApp.classList.remove('active');
  dom.backToJournals.classList.add('hidden');
  state.currentJournal = null;
  loadJournalsFromDB();
}

function switchTab(tabId) {
  dom.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabId));
  dom.tabPanels.forEach((panel) => panel.classList.toggle('active', panel.id === tabId));
}

function changeMonth(delta) {
  const next = new Date(state.selectedMonth);
  next.setMonth(next.getMonth() + delta);
  state.selectedMonth = next;
  renderCalendar();
}

function renderCalendar() {
  const month = state.selectedMonth.getMonth();
  const year = state.selectedMonth.getFullYear();
  const monthLabel = state.selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  dom.calendarLabel.textContent = monthLabel;
  dom.calendarGrid.innerHTML = '';
  dom.dayDetail.classList.add('hidden');
  const dailyTotals = getDailyTotals();
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((label) => {
    const header = document.createElement('div');
    header.className = 'calendar-cell calendar-header-cell';
    header.textContent = label;
    dom.calendarGrid.appendChild(header);
  });
  const matrix = getMonthMatrix(year, month);
  matrix.forEach((week) => {
    week.forEach((date) => {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      if (!date) {
        cell.classList.add('empty');
        dom.calendarGrid.appendChild(cell);
        return;
      }
      const key = formatDateKey(date);
      const dayData = dailyTotals[key] || { pl: 0, count: 0 };
      if (dayData.pl > 0) cell.classList.add('profit');
      if (dayData.pl < 0) cell.classList.add('loss');
      cell.innerHTML = `
        <div class="day-number">${date.getDate()}</div>
        <div class="day-metrics">
          <div>P/L: ${formatPl(dayData.pl)}</div>
          <div>Trades: ${dayData.count}</div>
        </div>
      `;
      cell.addEventListener('click', () => renderDayDetail(key));
      dom.calendarGrid.appendChild(cell);
    });
  });
}

function renderDayDetail(dateKey) {
  const trades = state.trades.filter((trade) => {
    if (trade.status !== 'Closed') return false;
    const key = trade.closeDate || trade.date;
    return key === dateKey;
  });
  const total = trades.reduce((sum, trade) => sum + Number(trade.plUsd || 0), 0);
  dom.dayDetail.classList.remove('hidden');
  dom.dayDetail.innerHTML = `
    <h3>Day Detail - ${dateKey}</h3>
    <p>Total P/L: <span class="${total >= 0 ? 'trade-pl positive' : 'trade-pl negative'}">${formatPl(total)}</span></p>
    <div class="trade-list">
      ${trades.map(renderTradeCard).join('')}
    </div>
  `;
  bindTradeCardActions(dom.dayDetail);
}

async function loadTemplate() {
  const template = await getConfluenceTemplate(state.currentJournal.id);
  if (template && template.items) {
    state.template = template.items;
  } else {
    state.template = defaultTemplate.map((item) => ({ id: crypto.randomUUID(), label: item }));
    await saveConfluenceTemplate(state.currentJournal.id, state.template);
  }
  renderConfluenceChecklist();
}

function renderConfluenceChecklist(checkedIds = []) {
  dom.confluenceChecklist.innerHTML = '';
  state.template.forEach((item) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = item.id;
    input.checked = checkedIds.includes(item.id);
    label.appendChild(input);
    label.appendChild(document.createTextNode(item.label));
    dom.confluenceChecklist.appendChild(label);
  });
}

function updateRiskAmount() {
  const balance = Number(dom.tradeForm.balance.value);
  const riskPercent = Number(dom.tradeForm.riskPercent.value);
  if (balance && riskPercent) {
    dom.tradeForm.riskAmount.value = (balance * (riskPercent / 100)).toFixed(2);
  } else {
    dom.tradeForm.riskAmount.value = '';
  }
  updateRiskGuidance();
}

function updateRiskGuidance() {
  const balance = Number(dom.tradeForm.balance.value);
  const riskPercent = Number(dom.tradeForm.riskPercent.value);
  const entry = Number(dom.tradeForm.entryPrice.value);
  const stop = Number(dom.tradeForm.stopLoss.value);
  const marketType = dom.tradeForm.marketType.value;
  const instrument = dom.tradeForm.instrument.value.trim();
  if (!balance || !riskPercent || !entry || !stop) {
    dom.riskGuidance.textContent = 'Provide balance, risk %, entry, and stop-loss to calculate risk.';
    return;
  }
  const riskAmount = balance * (riskPercent / 100);
  const stopDistance = Math.abs(entry - stop);
  if (!instrument) {
    dom.riskGuidance.textContent = `Risk amount: ${riskAmount.toFixed(2)}. Stop distance: ${stopDistance.toFixed(2)}. Add instrument for sizing guidance.`;
    return;
  }
  const valueEntry = state.currentJournal.instrumentValues.find((item) => item.instrument === instrument && item.type === marketType);
  if (!valueEntry) {
    dom.riskGuidance.textContent = `Risk amount: ${riskAmount.toFixed(2)}. Stop distance: ${stopDistance.toFixed(2)}. Insufficient data to verify position size.`;
    return;
  }
  if (!stopDistance) {
    dom.riskGuidance.textContent = 'Stop distance is zero. Adjust entry and stop-loss.';
    return;
  }
  const positionSize = riskAmount / (stopDistance * valueEntry.value);
  dom.riskGuidance.textContent = `Estimated position size: ${positionSize.toFixed(2)} lots based on your saved value.`;
}

async function handleScreenshots(event) {
  const files = Array.from(event.target.files || []);
  state.screenshotBuffers = [];
  dom.screenshotPreview.innerHTML = '';
  for (const file of files) {
    const resized = await resizeImage(file);
    state.screenshotBuffers.push(resized);
    const url = URL.createObjectURL(resized);
    const img = document.createElement('img');
    img.src = url;
    dom.screenshotPreview.appendChild(img);
  }
}

function resizeImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const maxSize = 1280;
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const scale = Math.min(maxSize / width, maxSize / height);
          width *= scale;
          height *= scale;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), file.type || 'image/jpeg', 0.85);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleTradeSubmit(event) {
  event.preventDefault();
  if (!state.currentJournal) return;
  highlightRecommendedFields();
  const data = new FormData(dom.tradeForm);
  const trade = Object.fromEntries(data.entries());
  const dateTime = trade.dateTime ? new Date(trade.dateTime) : new Date();
  trade.date = formatDateKey(dateTime);
  trade.dateTime = dateTime.toISOString();
  trade.closeDate = trade.closeDateTime ? formatDateKey(new Date(trade.closeDateTime)) : null;
  trade.closeDateTime = trade.closeDateTime ? new Date(trade.closeDateTime).toISOString() : null;
  trade.plUsd = Number(trade.plUsd || 0);
  trade.plNgn = Number(trade.plNgn || 0);
  trade.riskAmount = trade.riskAmount ? Number(trade.riskAmount) : null;
  trade.balance = trade.balance ? Number(trade.balance) : null;
  trade.riskPercent = trade.riskPercent ? Number(trade.riskPercent) : null;
  trade.entryPrice = trade.entryPrice ? Number(trade.entryPrice) : null;
  trade.stopLoss = trade.stopLoss ? Number(trade.stopLoss) : null;
  trade.takeProfit = trade.takeProfit ? Number(trade.takeProfit) : null;
  trade.exitPrice = trade.exitPrice ? Number(trade.exitPrice) : null;
  trade.lotSize = trade.lotSize ? Number(trade.lotSize) : null;
  trade.pips = trade.pips ? Number(trade.pips) : null;
  trade.tags = trade.tags ? trade.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [];
  trade.journalId = state.currentJournal.id;
  trade.screenshots = state.screenshotBuffers.map((blob) => ({
    id: crypto.randomUUID(),
    blob,
    type: blob.type || 'image/jpeg',
  }));

  const checked = Array.from(dom.confluenceChecklist.querySelectorAll('input:checked')).map((input) => input.value);
  trade.confluenceChecked = checked;
  trade.confluenceScore = state.template.length
    ? Math.round((checked.length / state.template.length) * 100)
    : 0;

  if (state.editingTradeId) {
    trade.id = state.editingTradeId;
    await updateTrade(trade);
  } else {
    trade.id = crypto.randomUUID();
    await addTrade(trade);
    state.currentJournal.tradeCount += 1;
    await updateJournal(state.currentJournal);
  }

  state.trades = await getTradesByJournal(state.currentJournal.id);
  updateJournalStats();
  resetTradeForm();
  renderCalendar();
  renderTradesList();
  renderAnalytics();
  switchTab('trades');
}

function resetTradeForm() {
  dom.tradeForm.reset();
  dom.tradeForm.dateTime.value = new Date().toISOString().slice(0, 16);
  dom.tradeForm.closeDateTime.value = '';
  dom.tradeForm.riskAmount.value = '';
  state.editingTradeId = null;
  state.screenshotBuffers = [];
  dom.screenshotPreview.innerHTML = '';
  renderConfluenceChecklist();
  clearRecommendedHighlights();
  updateRiskGuidance();
}

function highlightRecommendedFields() {
  const recommended = ['instrument', 'entryPrice', 'stopLoss', 'plUsd', 'dateTime'];
  recommended.forEach((name) => {
    const field = dom.tradeForm.querySelector(`[name=\"${name}\"]`);
    if (!field) return;
    const hasValue = field.value && field.value.toString().trim() !== '';
    field.classList.toggle('missing', !hasValue);
  });
}

function clearRecommendedHighlights() {
  dom.tradeForm.querySelectorAll('.missing').forEach((field) => field.classList.remove('missing'));
}

function getDailyTotals() {
  const totals = {};
  state.trades.forEach((trade) => {
    if (trade.status !== 'Closed') return;
    const key = trade.closeDate || trade.date;
    if (!key) return;
    if (!totals[key]) totals[key] = { pl: 0, count: 0 };
    totals[key].pl += Number(trade.plUsd || 0);
    totals[key].count += 1;
  });
  return totals;
}

function renderTradesList() {
  const search = dom.tradeSearch.value.toLowerCase();
  const sort = dom.tradeSort.value;
  let trades = [...state.trades];
  if (search) {
    trades = trades.filter((trade) => {
      const content = [trade.instrument, trade.notes, ...(trade.tags || [])].join(' ').toLowerCase();
      return content.includes(search);
    });
  }
  trades.sort((a, b) => {
    if (sort === 'dateAsc') return new Date(a.dateTime) - new Date(b.dateTime);
    if (sort === 'plDesc') return Number(b.plUsd) - Number(a.plUsd);
    if (sort === 'plAsc') return Number(a.plUsd) - Number(b.plUsd);
    return new Date(b.dateTime) - new Date(a.dateTime);
  });
  dom.tradeList.innerHTML = trades.length ? trades.map(renderTradeCard).join('') : '<p class="muted">No trades found.</p>';
  bindTradeCardActions(dom.tradeList);
}

function renderTradeCard(trade) {
  const plClass = trade.plUsd > 0 ? 'positive' : trade.plUsd < 0 ? 'negative' : '';
  const tags = trade.tags?.length ? trade.tags.map((tag) => `<span class="tag">${tag}</span>`).join('') : '';
  const screenshots = trade.screenshots?.length
    ? trade.screenshots.map((shot) => {
        const url = URL.createObjectURL(shot.blob);
        return `<img src="${url}" alt="Screenshot" />`;
      }).join('')
    : '<p class="muted">No screenshots</p>';
  return `
    <article class="trade-card" data-id="${trade.id}">
      <div class="trade-meta">
        <div>
          <h3>${trade.instrument || 'Untitled Trade'}</h3>
          <p class="muted">${trade.marketType} · ${trade.direction} · ${new Date(trade.dateTime).toLocaleString()}</p>
        </div>
        <div class="trade-pl ${plClass}">${formatPl(trade.plUsd)}</div>
      </div>
      <div class="trade-meta">
        <div>Confluence: ${trade.confluenceScore || 0}%</div>
        <div>Status: ${trade.status}</div>
      </div>
      <div class="trade-tags">${tags}</div>
      <details>
        <summary class="muted">Details</summary>
        <div class="trade-details">
          <p>Entry: ${trade.entryPrice ?? '—'} | SL: ${trade.stopLoss ?? '—'} | TP: ${trade.takeProfit ?? '—'} | Exit: ${trade.exitPrice ?? '—'}</p>
          <p>Lot size: ${trade.lotSize ?? '—'} | Balance: ${trade.balance ?? '—'} | Risk %: ${trade.riskPercent ?? '—'}</p>
          <p>Notes: ${trade.notes || '—'}</p>
          <div class="screenshot-grid">${screenshots}</div>
        </div>
      </details>
      <div class="form-actions">
        <button class="btn btn-outline" data-action="edit">Edit</button>
        <button class="btn btn-danger" data-action="delete">Delete</button>
      </div>
    </article>
  `;
}

function bindTradeCardActions(container) {
  container.querySelectorAll('[data-action="edit"]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('[data-id]');
      const trade = state.trades.find((t) => t.id === card.dataset.id);
      if (trade) loadTradeIntoForm(trade);
    });
  });
  container.querySelectorAll('[data-action="delete"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const card = button.closest('[data-id]');
      if (!confirm('Delete this trade?')) return;
      await deleteTrade(card.dataset.id);
      state.trades = await getTradesByJournal(state.currentJournal.id);
      state.currentJournal.tradeCount = state.trades.length;
      await updateJournal(state.currentJournal);
      updateJournalStats();
      renderCalendar();
      renderTradesList();
      renderAnalytics();
    });
  });
}

function loadTradeIntoForm(trade) {
  state.editingTradeId = trade.id;
  dom.tradeForm.instrument.value = trade.instrument || '';
  dom.tradeForm.marketType.value = trade.marketType || 'Forex';
  dom.tradeForm.direction.value = trade.direction || 'Buy';
  dom.tradeForm.dateTime.value = trade.dateTime ? trade.dateTime.slice(0, 16) : new Date().toISOString().slice(0, 16);
  dom.tradeForm.session.value = trade.session || 'Asia';
  dom.tradeForm.entryPrice.value = trade.entryPrice ?? '';
  dom.tradeForm.stopLoss.value = trade.stopLoss ?? '';
  dom.tradeForm.takeProfit.value = trade.takeProfit ?? '';
  dom.tradeForm.exitPrice.value = trade.exitPrice ?? '';
  dom.tradeForm.lotSize.value = trade.lotSize ?? '';
  dom.tradeForm.balance.value = trade.balance ?? '';
  dom.tradeForm.riskPercent.value = trade.riskPercent ?? '';
  dom.tradeForm.riskAmount.value = trade.riskAmount ?? '';
  dom.tradeForm.plUsd.value = trade.plUsd ?? '';
  dom.tradeForm.plNgn.value = trade.plNgn ?? '';
  dom.tradeForm.pips.value = trade.pips ?? '';
  dom.tradeForm.tags.value = trade.tags?.join(', ') || '';
  dom.tradeForm.status.value = trade.status || 'Open';
  dom.tradeForm.closeDateTime.value = trade.closeDateTime ? trade.closeDateTime.slice(0, 16) : '';
  dom.tradeForm.notes.value = trade.notes || '';
  renderConfluenceChecklist(trade.confluenceChecked || []);
  dom.screenshotPreview.innerHTML = trade.screenshots?.length
    ? trade.screenshots.map((shot) => `<img src="${URL.createObjectURL(shot.blob)}" alt="Screenshot" />`).join('')
    : '';
  state.screenshotBuffers = trade.screenshots?.map((shot) => shot.blob) || [];
  updateRiskGuidance();
  switchTab('add');
}

function formatPl(value) {
  const formatted = Number(value || 0).toFixed(2);
  return `${value >= 0 ? '+' : ''}${formatted}`;
}

function renderAnalytics() {
  const filtered = filterTrades(state.trades);
  const stats = computeStats(filtered);
  dom.analyticsStats.innerHTML = [
    { label: 'Total Trades', value: stats.total },
    { label: 'Wins', value: stats.wins },
    { label: 'Losses', value: stats.losses },
    { label: 'Break-even', value: stats.breakEven },
    { label: 'Win Rate', value: `${stats.winRate}%` },
    { label: 'Total P/L ($)', value: stats.totalPlUsd.toFixed(2) },
    { label: 'Total P/L (₦)', value: stats.totalPlNgn.toFixed(2) },
    { label: 'Average Win', value: stats.avgWin.toFixed(2) },
    { label: 'Average Loss', value: stats.avgLoss.toFixed(2) },
    { label: 'Best Day', value: stats.bestDay.toFixed(2) },
    { label: 'Worst Day', value: stats.worstDay.toFixed(2) },
  ]
    .map((stat) => `<div class="stat"><p class="muted">${stat.label}</p><h3>${stat.value}</h3></div>`)
    .join('');

  const dailyValues = Object.values(stats.daily).sort((a, b) => a.date.localeCompare(b.date));
  const equityCurve = [];
  let cumulative = 0;
  dailyValues.forEach((entry) => {
    cumulative += entry.pl;
    equityCurve.push(cumulative);
  });
  drawLineChart(dom.equityChart, equityCurve, '#1aa3ff');
  drawBarChart(dom.dailyChart, dailyValues.map((entry) => entry.pl), '#1aa3ff');

  const buckets = confluenceBuckets(filtered);
  dom.confluenceStats.innerHTML = `
    <h3>Confluence Performance</h3>
    <ul>
      ${buckets.map((bucket) => `<li>${bucket.label}: ${bucket.winRate}% win rate (${bucket.wins}/${bucket.total})</li>`).join('')}
    </ul>
  `;
}

function filterTrades(trades) {
  const start = dom.filterStart.value ? new Date(dom.filterStart.value) : null;
  const end = dom.filterEnd.value ? new Date(dom.filterEnd.value) : null;
  const instrument = dom.filterInstrument.value.trim().toLowerCase();
  const direction = dom.filterDirection.value;
  const market = dom.filterMarket.value;
  const tag = dom.filterTag.value.trim().toLowerCase();
  const confluenceMin = dom.filterConfluenceMin.value ? Number(dom.filterConfluenceMin.value) : null;
  const confluenceMax = dom.filterConfluenceMax.value ? Number(dom.filterConfluenceMax.value) : null;

  return trades.filter((trade) => {
    const tradeDate = trade.closeDateTime ? new Date(trade.closeDateTime) : new Date(trade.dateTime);
    if (start && tradeDate < start) return false;
    if (end && tradeDate > end) return false;
    if (instrument && !trade.instrument?.toLowerCase().includes(instrument)) return false;
    if (direction && trade.direction !== direction) return false;
    if (market && trade.marketType !== market) return false;
    if (tag && !trade.tags?.some((t) => t.toLowerCase().includes(tag))) return false;
    if (confluenceMin !== null && trade.confluenceScore < confluenceMin) return false;
    if (confluenceMax !== null && trade.confluenceScore > confluenceMax) return false;
    return true;
  });
}

function updateJournalStats() {
  dom.journalNameInput.value = state.currentJournal.name;
}

async function renameJournal() {
  const name = dom.journalNameInput.value.trim();
  if (!name) return;
  state.currentJournal.name = name;
  await updateJournal(state.currentJournal);
  loadJournalsFromDB();
}

async function handleDeleteJournal() {
  if (!confirm('Delete this journal and all its trades?')) return;
  await deleteJournal(state.currentJournal.id);
  showJournalSelector();
}

function renderTemplateEditor() {
  dom.templateEditor.innerHTML = '';
  state.template.forEach((item, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'template-item';
    wrapper.innerHTML = `
      <input type="text" value="${item.label}" />
      <button class="btn btn-outline" data-action="up">↑</button>
      <button class="btn btn-outline" data-action="down">↓</button>
      <button class="btn btn-danger" data-action="remove">Remove</button>
    `;
    const input = wrapper.querySelector('input');
    input.addEventListener('change', () => {
      item.label = input.value;
      saveTemplate();
      renderConfluenceChecklist();
    });
    wrapper.querySelector('[data-action="up"]').addEventListener('click', () => moveTemplateItem(index, -1));
    wrapper.querySelector('[data-action="down"]').addEventListener('click', () => moveTemplateItem(index, 1));
    wrapper.querySelector('[data-action="remove"]').addEventListener('click', () => removeTemplateItem(index));
    dom.templateEditor.appendChild(wrapper);
  });
}

async function saveTemplate() {
  await saveConfluenceTemplate(state.currentJournal.id, state.template);
}

function handleAddTemplateItem() {
  const label = dom.newTemplateItem.value.trim();
  if (!label) return;
  state.template.push({ id: crypto.randomUUID(), label });
  dom.newTemplateItem.value = '';
  saveTemplate();
  renderTemplateEditor();
  renderConfluenceChecklist();
}

function moveTemplateItem(index, delta) {
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= state.template.length) return;
  const [item] = state.template.splice(index, 1);
  state.template.splice(nextIndex, 0, item);
  saveTemplate();
  renderTemplateEditor();
  renderConfluenceChecklist();
}

function removeTemplateItem(index) {
  state.template.splice(index, 1);
  saveTemplate();
  renderTemplateEditor();
  renderConfluenceChecklist();
}

function renderInstrumentValues() {
  dom.instrumentValues.innerHTML = '';
  state.currentJournal.instrumentValues.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'template-item';
    row.innerHTML = `
      <strong>${item.instrument}</strong>
      <span class="muted">${item.type}</span>
      <span>${item.value}</span>
      <button class="btn btn-danger">Remove</button>
    `;
    row.querySelector('button').addEventListener('click', async () => {
      state.currentJournal.instrumentValues = state.currentJournal.instrumentValues.filter((entry) => entry !== item);
      await updateJournal(state.currentJournal);
      renderInstrumentValues();
    });
    dom.instrumentValues.appendChild(row);
  });
}

async function handleAddInstrumentValue() {
  const instrument = dom.instrumentName.value.trim();
  const value = Number(dom.instrumentValue.value);
  const type = dom.instrumentType.value;
  if (!instrument || !value) return;
  const existing = state.currentJournal.instrumentValues.find((item) => item.instrument === instrument && item.type === type);
  if (existing) {
    existing.value = value;
  } else {
    state.currentJournal.instrumentValues.push({ instrument, value, type });
  }
  await updateJournal(state.currentJournal);
  dom.instrumentName.value = '';
  dom.instrumentValue.value = '';
  renderInstrumentValues();
}

async function exportJournalJson() {
  const payload = {
    journal: state.currentJournal,
    trades: state.trades,
    template: state.template,
  };
  downloadFile(JSON.stringify(payload, null, 2), `${state.currentJournal.name}-journal.json`, 'application/json');
}

async function exportJournalCsv() {
  const headers = [
    'instrument',
    'marketType',
    'direction',
    'dateTime',
    'closeDateTime',
    'session',
    'entryPrice',
    'stopLoss',
    'takeProfit',
    'exitPrice',
    'lotSize',
    'balance',
    'riskPercent',
    'riskAmount',
    'plUsd',
    'plNgn',
    'pips',
    'tags',
    'notes',
    'status',
    'confluenceScore',
  ];
  const rows = state.trades.map((trade) => headers.map((header) => {
    const value = trade[header] ?? '';
    return `"${String(value).replace(/"/g, '""')}"`;
  }).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  downloadFile(csv, `${state.currentJournal.name}-trades.csv`, 'text/csv');
}

async function importJournalJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const payload = JSON.parse(text);
  const overwrite = confirm('Import as new journal? Cancel to overwrite current journal.');
  if (overwrite) {
    const newJournal = { ...payload.journal, id: crypto.randomUUID(), name: `${payload.journal.name} (Imported)` };
    await addJournal(newJournal);
    for (const trade of payload.trades) {
      trade.id = crypto.randomUUID();
      trade.journalId = newJournal.id;
      await addTrade(trade);
    }
    newJournal.tradeCount = payload.trades.length;
    await updateJournal(newJournal);
    await saveConfluenceTemplate(newJournal.id, payload.template || []);
  } else {
    state.currentJournal = { ...state.currentJournal, ...payload.journal };
    await updateJournal(state.currentJournal);
    await Promise.all(state.trades.map((trade) => deleteTrade(trade.id)));
    for (const trade of payload.trades) {
      trade.journalId = state.currentJournal.id;
      await updateTrade(trade);
    }
    await saveConfluenceTemplate(state.currentJournal.id, payload.template || []);
    state.trades = await getTradesByJournal(state.currentJournal.id);
    state.currentJournal.tradeCount = state.trades.length;
    await updateJournal(state.currentJournal);
    await loadTemplate();
  }
  event.target.value = '';
  await loadJournalsFromDB();
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
}

init();
