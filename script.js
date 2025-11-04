import { MerkleTree } from './merkle.js';

const STOCKS = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corp.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. (Class A)' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.' },
  { symbol: 'META', name: 'Meta Platforms Inc.' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc. (Class B)' },
  { symbol: 'UNH', name: 'UnitedHealth Group Inc.' },
  { symbol: 'V', name: 'Visa Inc.' }
];

const TIME_RANGES = [
  { key: '1D', label: '1D', longLabel: 'the past day', durationMs: 24 * 60 * 60 * 1000 },
  { key: '5D', label: '5D', longLabel: 'the past five days', durationMs: 5 * 24 * 60 * 60 * 1000 },
  { key: '1M', label: '1M', longLabel: 'the past month', durationMs: 30 * 24 * 60 * 60 * 1000 },
  { key: '6M', label: '6M', longLabel: 'the past six months', durationMs: 182 * 24 * 60 * 60 * 1000 },
  { key: '1Y', label: '1Y', longLabel: 'the past year', durationMs: 365 * 24 * 60 * 60 * 1000 }
];

const SECTION_ITEMS = [
  { key: 'summary', label: 'Summary' },
  { key: 'news', label: 'News' },
  { key: 'research', label: 'Research', locked: true },
  { key: 'chart', label: 'Chart' },
  { key: 'statistics', label: 'Statistics' },
  { key: 'historical', label: 'Historical data' },
  { key: 'profile', label: 'Profile' },
  { key: 'financials', label: 'Financials' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'options', label: 'Options' },
  { key: 'holders', label: 'Holders' }
];

const UPDATE_INTERVAL_MS = 5000;
const HISTORY_INTERVAL_MINUTES = 15;
const HISTORY_SPAN_DAYS = 365;

let chartCanvas;
let lastUpdatedEl;
let stockListEl;
let stockNameEl;
let stockSymbolEl;
let stockPriceEl;
let stockChangeEl;
let detailOpenEl;
let detailHighEl;
let detailLowEl;
let detailChangeEl;
let detailChangePercentEl;
let detailVolumeEl;
let timeRangeButtonsEl;
let merkleRootEl;
let merkleStatusEl;
let navContainerEl;
let sectionContentEl;

let selectedSymbol = null;
let currentRangeKey = '1D';
let currentSectionKey = 'summary';
let chartInstance;
let isUpdating = false;
let merkleComputationToken = 0;

const stocksState = new Map();

const intradayFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric'
});

const longDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

const longDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

const crosshairPlugin = {
  id: 'crosshairLines',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    const activeElements = chart.getActiveElements();
    if (!activeElements || activeElements.length === 0) return;

    const { element } = activeElements[0];
    if (!element) return;

    const x = element.x;
    const y = element.y;

    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
    ctx.restore();
  }
};

if (globalThis.Chart) {
  Chart.register(crosshairPlugin);
}

function initializeStocks() {
  const basePrices = [189.57, 410.12, 126.72, 148.32, 875.66, 329.54, 205.71, 362.15, 487.9, 242.24];

  STOCKS.forEach((stock, index) => {
    const basePrice = basePrices[index];
    const history = generateSyntheticHistory(basePrice);
    const latest = history[history.length - 1];

    stocksState.set(stock.symbol, {
      ...stock,
      basePrice,
      fullHistory: history,
      price: latest.price,
      volume: Math.floor(Math.random() * 1_000_000) + 500_000,
      merkleTree: null,
      merkleRoot: null,
      merkleDirty: true
    });
  });
}

function generateSyntheticHistory(basePrice) {
  const history = [];
  const now = Date.now();
  const totalPoints = Math.floor((HISTORY_SPAN_DAYS * 24 * 60) / HISTORY_INTERVAL_MINUTES);
  let price = basePrice * (0.85 + Math.random() * 0.3);

  for (let i = totalPoints - 1; i >= 0; i -= 1) {
    const timestamp = now - i * HISTORY_INTERVAL_MINUTES * 60 * 1000;
    const meanReversion = (basePrice - price) * 0.015;
    const volatility = basePrice * 0.0035;
    const drift = (Math.random() - 0.5) * volatility;

    price = Math.max(5, price + meanReversion + drift);
    const roundedPrice = Number(price.toFixed(2));

    history.push({
      time: new Date(timestamp),
      price: roundedPrice
    });
  }

  return history;
}

function renderStockList() {
  if (!stockListEl) return;
  stockListEl.innerHTML = '';
  const fragment = document.createDocumentFragment();

  STOCKS.forEach((stock) => {
    const state = stocksState.get(stock.symbol);
    if (!state) return;

    const li = document.createElement('li');
    li.className = 'stock-item';
    li.tabIndex = 0;
    li.dataset.symbol = stock.symbol;

    const symbolEl = document.createElement('span');
    symbolEl.className = 'symbol';
    symbolEl.textContent = stock.symbol;

    const priceEl = document.createElement('span');
    priceEl.className = 'price';
    priceEl.textContent = formatCurrency(state.price);

    li.append(symbolEl, priceEl);
    fragment.appendChild(li);
  });

  stockListEl.appendChild(fragment);
}

function attachStockListHandlers() {
  if (!stockListEl) return;

  stockListEl.addEventListener('click', (event) => {
    const item = event.target.closest('.stock-item');
    if (!item) return;
    const { symbol } = item.dataset;
    if (!symbol) return;
    void selectStock(symbol);
  });

  stockListEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const item = event.target.closest('.stock-item');
    if (!item) return;
    const { symbol } = item.dataset;
    if (!symbol) return;
    event.preventDefault();
    void selectStock(symbol);
  });
}

function renderTimeRangeButtons() {
  if (!timeRangeButtonsEl) return;
  timeRangeButtonsEl.innerHTML = '';

  TIME_RANGES.forEach((range) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'time-range-button';
    button.dataset.range = range.key;
    button.textContent = range.label;
    button.setAttribute('aria-pressed', range.key === currentRangeKey ? 'true' : 'false');
    if (range.key === currentRangeKey) {
      button.classList.add('active');
    }

    button.addEventListener('click', () => {
      if (currentRangeKey === range.key) return;
      setActiveTimeRange(range.key);
      void updateSelectedStockDisplay();
    });

    timeRangeButtonsEl.appendChild(button);
  });
}

function renderSectionNavigation() {
  if (!navContainerEl) return;
  navContainerEl.innerHTML = '';

  const list = document.createElement('ul');

  SECTION_ITEMS.forEach((item) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.section = item.key;
    button.textContent = item.label;
    button.className = 'nav-button';
    button.setAttribute('aria-pressed', item.key === currentSectionKey ? 'true' : 'false');

    if (item.locked) {
      button.disabled = true;
      button.classList.add('locked');
      const icon = document.createElement('span');
      icon.className = 'lock-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '🔒';
      button.appendChild(icon);
    }

    if (item.key === currentSectionKey) {
      button.classList.add('active');
    }

    if (!item.locked) {
      button.addEventListener('click', () => {
        if (currentSectionKey === item.key) return;
        setActiveSection(item.key);
        void updateSelectedStockDisplay();
      });
    }

    li.appendChild(button);
    list.appendChild(li);
  });

  navContainerEl.appendChild(list);
}

function setActiveTimeRange(rangeKey) {
  currentRangeKey = rangeKey;
  if (!timeRangeButtonsEl) return;

  timeRangeButtonsEl.querySelectorAll('button').forEach((button) => {
    const isActive = button.dataset.range === rangeKey;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function setActiveSection(sectionKey) {
  currentSectionKey = sectionKey;
  if (!navContainerEl) return;

  navContainerEl.querySelectorAll('button').forEach((button) => {
    const isActive = button.dataset.section === sectionKey;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

async function selectStock(symbol, options = {}) {
  const stock = stocksState.get(symbol);
  if (!stock) return;

  if (!options.skipHighlight) {
    document.querySelectorAll('.stock-item').forEach((item) => {
      item.classList.toggle('selected', item.dataset.symbol === symbol);
    });
  }

  selectedSymbol = symbol;

  const history = getHistoryForRange(stock, currentRangeKey);
  if (!history.length) {
    return;
  }

  const stats = getStatsForHistory(history);
  if (!stats) return;

  stockNameEl.textContent = stock.name;
  stockSymbolEl.textContent = stock.symbol;
  stockPriceEl.textContent = formatCurrency(stats.close);
  updateChangeDisplay(stockChangeEl, stats.change, stats.changePercent);
  updateDetailDisplays(stats, stock);
  updateChart(stock, history);
  updateSectionContent(currentSectionKey, stock, history, stats);
  await updateMerkleDisplay(stock, symbol);
}

function updateDetailDisplays(stats, stock) {
  const changeValue = `${stats.change >= 0 ? '+' : '-'}${formatCurrency(Math.abs(stats.change))}`;
  const changePercentValue = `${stats.changePercent >= 0 ? '+' : ''}${stats.changePercent.toFixed(2)}%`;

  detailOpenEl.textContent = formatCurrency(stats.open);
  detailHighEl.textContent = formatCurrency(stats.high);
  detailLowEl.textContent = formatCurrency(stats.low);
  detailChangeEl.textContent = changeValue;
  detailChangePercentEl.textContent = changePercentValue;
  detailVolumeEl.textContent = Intl.NumberFormat('en-US').format(stock.volume);
}

function getHistoryForRange(stock, rangeKey) {
  const range = getRangeMeta(rangeKey);
  const cutoffTime = Date.now() - range.durationMs;
  const filtered = stock.fullHistory.filter((point) => point.time.getTime() >= cutoffTime);
  return filtered.length ? filtered : [...stock.fullHistory];
}

function getRangeMeta(rangeKey) {
  return TIME_RANGES.find((range) => range.key === rangeKey) ?? TIME_RANGES[0];
}

function getStatsForHistory(history) {
  if (!history.length) return null;

  const open = history[0].price;
  const close = history[history.length - 1].price;
  let high = history[0].price;
  let low = history[0].price;

  history.forEach((point) => {
    if (point.price > high) high = point.price;
    if (point.price < low) low = point.price;
  });

  const change = Number((close - open).toFixed(2));
  const changePercent = open === 0 ? 0 : Number(((change / open) * 100).toFixed(2));

  return {
    open,
    close,
    high: Number(high.toFixed(2)),
    low: Number(low.toFixed(2)),
    change,
    changePercent
  };
}

function updateChart(stock, history) {
  if (!chartCanvas) return;

  const labels = history.map((point) => formatTimeLabel(point.time, currentRangeKey));
  const data = history.map((point) => point.price);
  const datasetLabel = `${stock.symbol} price`;

  const tooltipCallbacks = {
    title: (items) => {
      if (!items.length) return '';
      const index = items[0].dataIndex;
      const point = history[index];
      return point ? longDateTimeFormatter.format(point.time) : '';
    },
    label: (context) => `${stock.symbol}: ${formatCurrency(context.parsed.y)}`
  };

  if (!chartInstance) {
    chartInstance = new Chart(chartCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: datasetLabel,
            data,
            borderColor: 'rgba(56, 189, 248, 1)',
            backgroundColor: 'rgba(56, 189, 248, 0.2)',
            pointRadius: 0,
            tension: 0.35,
            fill: true,
            borderWidth: 2,
            pointHoverRadius: 3
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        scales: {
          x: {
            grid: { color: 'rgba(148, 163, 184, 0.15)' },
            ticks: { color: 'rgba(148, 163, 184, 0.8)' }
          },
          y: {
            grid: { color: 'rgba(148, 163, 184, 0.15)' },
            ticks: {
              color: 'rgba(148, 163, 184, 0.8)',
              callback: (value) => formatCurrency(value)
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: tooltipCallbacks
          }
        }
      }
    });
  } else {
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = data;
    chartInstance.data.datasets[0].label = datasetLabel;
    chartInstance.options.plugins.tooltip.callbacks = tooltipCallbacks;
    chartInstance.update('none');
  }
}

function formatTimeLabel(date, rangeKey) {
  if (rangeKey === '1D') {
    return intradayFormatter.format(date);
  }
  if (rangeKey === '5D') {
    return dateTimeFormatter.format(date);
  }
  if (rangeKey === '1M' || rangeKey === '6M') {
    return shortDateFormatter.format(date);
  }
  return longDateFormatter.format(date);
}

function updateChangeDisplay(element, change, changePercent) {
  element.textContent = `${change >= 0 ? '+' : ''}${formatCurrency(change, false)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`;
  element.classList.remove('positive', 'negative', 'neutral');

  if (changePercent > 0.05) {
    element.classList.add('positive');
  } else if (changePercent < -0.05) {
    element.classList.add('negative');
  } else {
    element.classList.add('neutral');
  }
}

function formatCurrency(value, includeSymbol = true) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Intl.NumberFormat('en-US', {
    style: includeSymbol ? 'currency' : 'decimal',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isNaN(numberValue) ? 0 : numberValue);
}

function updateSectionContent(sectionKey, stock, history, stats) {
  if (!sectionContentEl) return;
  sectionContentEl.innerHTML = '';
  const renderer = SECTION_RENDERERS[sectionKey] ?? SECTION_RENDERERS.summary;
  const rangeMeta = getRangeMeta(currentRangeKey);
  const fragment = renderer(stock, history, stats, rangeMeta);
  sectionContentEl.appendChild(fragment);
}

const SECTION_RENDERERS = {
  summary: renderSummarySection,
  news: renderNewsSection,
  chart: renderChartSection,
  statistics: renderStatisticsSection,
  historical: renderHistoricalSection,
  profile: renderProfileSection,
  financials: renderFinancialsSection,
  analysis: renderAnalysisSection,
  options: renderOptionsSection,
  holders: renderHoldersSection
};

function renderSummarySection(stock, history, stats, rangeMeta) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Summary'));

  const direction = stats.change > 0 ? 'higher' : stats.change < 0 ? 'lower' : 'flat';
  const changeDescriptor = stats.change === 0 ? 'has been unchanged' : `has moved ${stats.change > 0 ? 'up' : 'down'} ${formatCurrency(Math.abs(stats.change))} (${stats.changePercent >= 0 ? '+' : ''}${stats.changePercent.toFixed(2)}%)`;

  fragment.appendChild(
    createParagraph(
      `${stock.name} (${stock.symbol}) is trading ${direction} over ${rangeMeta.longLabel}. The price ${changeDescriptor} during this window.`
    )
  );

  const tradingRange = `Trading range: ${formatCurrency(stats.low)} – ${formatCurrency(stats.high)}.`;
  fragment.appendChild(createParagraph(tradingRange));

  return fragment;
}

function renderNewsSection(stock, history, stats, rangeMeta) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('News highlights'));

  buildNewsItems(stock, history, stats, rangeMeta).forEach((item) => {
    const article = document.createElement('article');
    article.className = 'news-item';

    const title = document.createElement('h4');
    title.textContent = item.title;

    const timeEl = document.createElement('time');
    timeEl.dateTime = item.time.toISOString();
    timeEl.textContent = longDateTimeFormatter.format(item.time);

    const summary = createParagraph(item.summary);

    article.append(title, timeEl, summary);
    fragment.appendChild(article);
  });

  return fragment;
}

function buildNewsItems(stock, history, stats, rangeMeta) {
  const latest = history[history.length - 1];
  const midpoint = history[Math.max(0, Math.floor(history.length / 2))];
  const earliest = history[0];
  const now = Date.now();

  return [
    {
      title: `${stock.symbol} holds ${stats.change >= 0 ? 'gains' : 'declines'}`,
      time: new Date(now - 60 * 60 * 1000),
      summary: `Shares last traded at ${formatCurrency(latest.price)} after ranging between ${formatCurrency(stats.low)} and ${formatCurrency(stats.high)} over ${rangeMeta.longLabel}.`
    },
    {
      title: `${stock.name} traders watch momentum shift`,
      time: new Date(now - 3 * 60 * 60 * 1000),
      summary: `Mid-period pricing hovered near ${formatCurrency(midpoint.price)}, suggesting ${stats.change >= 0 ? 'steady demand from buyers' : 'continued selling pressure'}.`
    },
    {
      title: `Analysts weigh ${stock.symbol} trajectory`,
      time: new Date(now - 22 * 60 * 60 * 1000),
      summary: `From ${formatCurrency(earliest.price)} at the start of the period to ${formatCurrency(latest.price)} now, market watchers remain focused on volatility across ${rangeMeta.longLabel}.`
    }
  ];
}

function renderChartSection(stock, history, stats, rangeMeta) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Chart tools'));
  fragment.appendChild(
    createParagraph('Use the interactive chart to explore precise price movements with real-time crosshair guides.')
  );
  fragment.appendChild(
    createList([
      'Hover over the line to reveal vertical and horizontal reference lines with the exact price and timestamp.',
      `Switch between ${TIME_RANGES.map((range) => range.label).join(', ')} to focus on different periods.`,
      'Drag horizontally to zoom in, then double-click to reset (desktop browsers).'
    ])
  );
  return fragment;
}

function renderStatisticsSection(stock, history, stats) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Key statistics'));
  const fullStats = getStatsForHistory(stock.fullHistory) ?? stats;
  const average = history.reduce((acc, point) => acc + point.price, 0) / history.length;

  fragment.appendChild(
    createList([
      `Average price in range: ${formatCurrency(average)}`,
      `High in range: ${formatCurrency(stats.high)}`,
      `Low in range: ${formatCurrency(stats.low)}`,
      `Year high: ${formatCurrency(fullStats.high)}`,
      `Year low: ${formatCurrency(fullStats.low)}`,
      `Data points analysed: ${history.length}`
    ])
  );

  return fragment;
}

function renderHistoricalSection(stock, history) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Historical data'));

  const table = document.createElement('table');
  table.className = 'historical-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Date', 'Price'].forEach((heading) => {
    const th = document.createElement('th');
    th.textContent = heading;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = document.createElement('tbody');
  const rows = history.slice(-8).reverse();
  rows.forEach((point) => {
    const tr = document.createElement('tr');
    const dateCell = document.createElement('td');
    dateCell.textContent = longDateTimeFormatter.format(point.time);
    const priceCell = document.createElement('td');
    priceCell.textContent = formatCurrency(point.price);
    tr.append(dateCell, priceCell);
    tbody.appendChild(tr);
  });

  table.append(thead, tbody);
  fragment.appendChild(table);

  return fragment;
}

function renderProfileSection(stock) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Company profile'));
  fragment.appendChild(
    createParagraph(
      `${stock.name} (${stock.symbol}) is a key component of major U.S. equity indices. The simulated data captures how the stock might respond to typical market catalysts such as earnings, guidance updates, or macroeconomic news.`
    )
  );
  fragment.appendChild(
    createParagraph('Use the additional tabs to review statistics, historical performance, and strategic analysis tailored to this simulated dataset.')
  );
  return fragment;
}

function renderFinancialsSection(stock) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Financial overview (simulated)'));

  const revenue = stock.basePrice * 1_200_000;
  const income = stock.basePrice * 240_000;
  const eps = (stock.price / 25).toFixed(2);
  const yieldPct = (2 + (stock.basePrice % 3)).toFixed(2);

  fragment.appendChild(
    createList([
      `Revenue (ttm est.): ${formatCompactNumber(revenue)}`,
      `Net income (ttm est.): ${formatCompactNumber(income)}`,
      `Earnings per share (ttm est.): $${eps}`,
      `Dividend yield (simulated): ${yieldPct}%`
    ])
  );

  return fragment;
}

function renderAnalysisSection(stock, history, stats) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Analyst sentiment (simulated)'));

  let rating = 'Hold';
  if (stats.changePercent > 5) {
    rating = 'Buy';
  } else if (stats.changePercent < -5) {
    rating = 'Underperform';
  }

  fragment.appendChild(createParagraph(`${stock.symbol} is currently rated "${rating}" based on the momentum observed in this range.`));
  fragment.appendChild(
    createParagraph(
      `Momentum score: ${(Math.abs(stats.changePercent) * 1.2 + history.length / 150).toFixed(1)} (higher implies stronger trend).`
    )
  );

  return fragment;
}

function renderOptionsSection(stock) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Options snapshot (simulated)'));
  fragment.appendChild(
    createList([
      `30-day implied volatility: ${(18 + (stock.basePrice % 12)).toFixed(1)}%`,
      `Call/put volume ratio: ${(1.2 + (stock.basePrice % 3) / 10).toFixed(2)}`,
      'Most active strike: At-the-money contracts expiring this month.'
    ])
  );
  return fragment;
}

function renderHoldersSection(stock) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Top institutional holders (simulated)'));
  fragment.appendChild(
    createList([
      'Northbridge Capital Advisors – 6.8%',
      'Atlas Global Funds – 5.1%',
      'Evergreen Retirement Systems – 3.9%',
      'Summit Index ETF – 2.6%'
    ])
  );
  fragment.appendChild(createParagraph(`Holder distribution is generated for demonstration and does not reflect real ownership of ${stock.symbol}.`));
  return fragment;
}

function createHeading(text) {
  const heading = document.createElement('h3');
  heading.textContent = text;
  return heading;
}

function createParagraph(text) {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  return paragraph;
}

function createList(items) {
  const list = document.createElement('ul');
  list.className = 'section-list';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });
  return list;
}

function formatCompactNumber(value) {
  return Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value);
}

function createLeafValue(point) {
  return `${point.time.toISOString()}|${point.price.toFixed(2)}`;
}

async function updateMerkleDisplay(stock, symbol) {
  if (!merkleRootEl || !merkleStatusEl) return;

  const token = ++merkleComputationToken;
  merkleStatusEl.textContent = 'Verifying price history…';
  merkleStatusEl.classList.remove('verified', 'failed');
  merkleRootEl.textContent = 'Calculating…';

  const values = stock.fullHistory.map(createLeafValue);

  if (!values.length) {
    merkleRootEl.textContent = '--';
    merkleStatusEl.textContent = 'No price history available for verification.';
    return;
  }

  try {
    if (!stock.merkleTree || stock.merkleDirty) {
      stock.merkleTree = await MerkleTree.create(values);
      stock.merkleRoot = stock.merkleTree.root;
      stock.merkleDirty = false;
    }

    const index = values.length - 1;
    const proof = stock.merkleTree.getProof(index);
    const verified = await MerkleTree.verifyProof(values[index], proof, stock.merkleRoot);

    if (token !== merkleComputationToken || selectedSymbol !== symbol) {
      return;
    }

    merkleRootEl.textContent = stock.merkleRoot;
    if (verified) {
      merkleStatusEl.textContent = 'Price history verified via Merkle proof.';
      merkleStatusEl.classList.add('verified');
    } else {
      merkleStatusEl.textContent = 'Verification failed. Price history may have been altered.';
      merkleStatusEl.classList.add('failed');
    }
  } catch (error) {
    if (token !== merkleComputationToken || selectedSymbol !== symbol) {
      return;
    }
    console.error('Merkle verification failed', error);
    merkleRootEl.textContent = 'Unavailable';
    merkleStatusEl.textContent = 'Unable to verify price history in this environment.';
    merkleStatusEl.classList.add('failed');
  }
}

async function updateSelectedStockDisplay() {
  if (!selectedSymbol) return;
  await selectStock(selectedSymbol, { skipHighlight: true });
}

function refreshListPrices() {
  document.querySelectorAll('.stock-item').forEach((item) => {
    const stock = stocksState.get(item.dataset.symbol);
    if (!stock) return;
    const priceEl = item.querySelector('.price');
    if (!priceEl) return;
    priceEl.textContent = formatCurrency(stock.price);
  });
}

async function updateStockPrices() {
  if (isUpdating) return;
  isUpdating = true;

  try {
    const now = new Date();

    STOCKS.forEach(({ symbol }) => {
      const stock = stocksState.get(symbol);
      if (!stock) return;

      const meanReversion = (stock.basePrice - stock.price) * 0.012;
      const volatility = stock.basePrice * 0.004;
      const drift = (Math.random() - 0.5) * volatility;
      const nextPrice = Math.max(5, stock.price + meanReversion + drift);
      const roundedPrice = Number(nextPrice.toFixed(2));

      stock.price = roundedPrice;
      stock.fullHistory.push({ time: now, price: roundedPrice });
      stock.volume += Math.floor(Math.random() * 25_000);
      stock.merkleTree = null;
      stock.merkleRoot = null;
      stock.merkleDirty = true;
    });

    refreshListPrices();
    lastUpdatedEl.textContent = now.toLocaleTimeString('en-US', { hour12: false });
    await updateSelectedStockDisplay();
  } catch (error) {
    console.error('Failed to update stock prices', error);
  } finally {
    isUpdating = false;
  }
}

function startUpdates() {
  void updateStockPrices();
  setInterval(() => {
    void updateStockPrices();
  }, UPDATE_INTERVAL_MS);
}

function initDomReferences() {
  chartCanvas = document.getElementById('price-chart');
  lastUpdatedEl = document.getElementById('last-updated');
  stockListEl = document.getElementById('stock-items');
  stockNameEl = document.getElementById('stock-name');
  stockSymbolEl = document.getElementById('stock-symbol');
  stockPriceEl = document.getElementById('stock-price');
  stockChangeEl = document.getElementById('stock-change');
  detailOpenEl = document.getElementById('detail-open');
  detailHighEl = document.getElementById('detail-high');
  detailLowEl = document.getElementById('detail-low');
  detailChangeEl = document.getElementById('detail-change');
  detailChangePercentEl = document.getElementById('detail-change-percent');
  detailVolumeEl = document.getElementById('detail-volume');
  timeRangeButtonsEl = document.getElementById('time-range-buttons');
  merkleRootEl = document.getElementById('merkle-root');
  merkleStatusEl = document.getElementById('merkle-status');
  navContainerEl = document.getElementById('section-nav');
  sectionContentEl = document.getElementById('section-content');
}

async function init() {
  initDomReferences();
  initializeStocks();
  renderStockList();
  attachStockListHandlers();
  renderTimeRangeButtons();
  renderSectionNavigation();
  await selectStock(STOCKS[0].symbol);
  startUpdates();
}

document.addEventListener('DOMContentLoaded', () => {
  void init();
});
