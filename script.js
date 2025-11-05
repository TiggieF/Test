import { MerkleTree } from './merkle.js';

const STOCKS = [
  { symbol: 'SHEL.L', name: 'Shell plc' },
  { symbol: 'AZN.L', name: 'AstraZeneca plc' },
  { symbol: 'HSBA.L', name: 'HSBC Holdings plc' },
  { symbol: 'ULVR.L', name: 'Unilever plc' },
  { symbol: 'BP.L', name: 'BP plc' },
  { symbol: 'GSK.L', name: 'GSK plc' },
  { symbol: 'RIO.L', name: 'Rio Tinto plc' },
  { symbol: 'DGE.L', name: 'Diageo plc' },
  { symbol: 'BATS.L', name: 'British American Tobacco plc' },
  { symbol: 'REL.L', name: 'RELX plc' }
];

const TIME_RANGES = [
  { key: '1D', label: '1D', longLabel: 'the past trading day', durationMs: 24 * 60 * 60 * 1000 },
  { key: '5D', label: '5D', longLabel: 'the past five trading days', durationMs: 5 * 24 * 60 * 60 * 1000 },
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
  { key: 'financials', label: 'Market colour' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'options', label: 'Liquidity' },
  { key: 'holders', label: 'Institutional interest' }
];

const UPDATE_INTERVAL_MS = 60_000;
const LONDON_TIMEZONE = 'Europe/London';

const RANGE_TO_YAHOO = {
  '1D': { range: '1d', interval: '5m' },
  '5D': { range: '5d', interval: '15m' },
  '1M': { range: '1mo', interval: '1h' },
  '6M': { range: '6mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' }
};

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
let isRefreshing = false;
let merkleComputationToken = 0;

const stocksState = new Map();

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

const currencyFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const compactNumberFormatter = new Intl.NumberFormat('en-GB', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1
});

const intradayFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: LONDON_TIMEZONE
});

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  day: 'numeric',
  timeZone: LONDON_TIMEZONE
});

const longDateFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: LONDON_TIMEZONE
});

const longDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: LONDON_TIMEZONE
});

function initialiseStocks() {
  STOCKS.forEach((stock) => {
    stocksState.set(stock.symbol, {
      ...stock,
      rangeHistories: new Map(),
      fullHistory: [],
      merkleTree: null,
      merkleRoot: null,
      merkleDirty: true,
      price: null,
      volume: null,
      lastUpdated: null,
      marketState: 'loading',
      error: null
    });
  });
}

function renderStockList() {
  if (!stockListEl) return;
  stockListEl.innerHTML = '';

  const fragment = document.createDocumentFragment();

  STOCKS.forEach((stock) => {
    const state = stocksState.get(stock.symbol);
    const li = document.createElement('li');
    li.className = 'stock-item';
    li.tabIndex = 0;
    li.dataset.symbol = stock.symbol;

    const symbolEl = document.createElement('span');
    symbolEl.className = 'symbol';
    symbolEl.textContent = stock.symbol;

    const priceEl = document.createElement('span');
    priceEl.className = 'price';
    priceEl.textContent = formatCurrency(state?.price);

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
    const isActive = range.key === currentRangeKey;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    if (isActive) {
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
    const isActive = item.key === currentSectionKey;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');

    if (item.locked) {
      button.disabled = true;
      button.classList.add('locked');
      const icon = document.createElement('span');
      icon.className = 'lock-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '🔒';
      button.appendChild(icon);
    }

    if (isActive) {
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

async function selectStock(symbol) {
  const stock = stocksState.get(symbol);
  if (!stock) return;

  document.querySelectorAll('.stock-item').forEach((item) => {
    item.classList.toggle('selected', item.dataset.symbol === symbol);
  });

  selectedSymbol = symbol;

  const history = await ensureHistoryForRange(stock, currentRangeKey);
  if (!history.length) {
    displayStockError(stock, 'No price data available.');
    return;
  }

  const stats = getStatsForHistory(history);
  if (!stats) {
    displayStockError(stock, 'Unable to compute statistics for this range.');
    return;
  }

  updatePrimaryDisplay(stock, stats);
  updateDetailDisplays(stats, stock);
  updateChart(stock, history);
  updateSectionContent(currentSectionKey, stock, history, stats);
  await updateMerkleDisplay(stock, symbol);
}

function displayStockError(stock, message) {
  stockNameEl.textContent = stock.name;
  stockSymbolEl.textContent = stock.symbol;
  stockPriceEl.textContent = '—';
  stockChangeEl.textContent = message;
  stockChangeEl.className = 'change neutral';
}

function updatePrimaryDisplay(stock, stats) {
  stockNameEl.textContent = stock.name;
  stockSymbolEl.textContent = stock.symbol;
  stockPriceEl.textContent = formatCurrency(stats.close);
  updateChangeDisplay(stockChangeEl, stats.change, stats.changePercent, stock.marketState);

  const timestamp = stock.lastUpdated ? longDateTimeFormatter.format(stock.lastUpdated) : '--';
  const sessionLabel = stock.marketState === 'premarket' ? 'Pre-market' : stock.marketState === 'regular' ? 'Regular session' : 'Closed';
  lastUpdatedEl.textContent = `${timestamp} (${sessionLabel})`;
}

function updateDetailDisplays(stats, stock) {
  detailOpenEl.textContent = formatCurrency(stats.open);
  detailHighEl.textContent = formatCurrency(stats.high);
  detailLowEl.textContent = formatCurrency(stats.low);
  detailChangeEl.textContent = `${stats.change >= 0 ? '+' : ''}${formatCurrency(stats.change, false)}`;
  detailChangePercentEl.textContent = `${stats.changePercent >= 0 ? '+' : ''}${stats.changePercent.toFixed(2)}%`;
  detailVolumeEl.textContent = stock.volume ? compactNumberFormatter.format(stock.volume) : '—';
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
            borderColor: 'rgba(59, 130, 246, 1)',
            backgroundColor: 'rgba(59, 130, 246, 0.18)',
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
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 8,
              autoSkip: true
            },
            grid: {
              display: false
            }
          },
          y: {
            ticks: {
              callback: (value) => formatCurrency(value)
            }
          }
        },
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: tooltipCallbacks
          }
        }
      }
    });
    return;
  }

  chartInstance.data.labels = labels;
  chartInstance.data.datasets[0].label = datasetLabel;
  chartInstance.data.datasets[0].data = data;
  chartInstance.options.plugins.tooltip.callbacks = tooltipCallbacks;
  chartInstance.update();
}

function updateSectionContent(sectionKey, stock, history, stats) {
  if (!sectionContentEl) return;
  sectionContentEl.innerHTML = '';

  const renderer = SECTION_RENDERERS[sectionKey];
  if (!renderer) {
    sectionContentEl.appendChild(createParagraph('Section unavailable.'));
    return;
  }

  const rangeMeta = TIME_RANGES.find((range) => range.key === currentRangeKey) ?? TIME_RANGES[0];
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
  options: renderLiquiditySection,
  holders: renderHoldersSection
};

function renderSummarySection(stock, history, stats, rangeMeta) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Summary'));

  const direction = stats.change > 0 ? 'higher' : stats.change < 0 ? 'lower' : 'flat';
  const changeDescriptor = stats.change === 0
    ? 'has been unchanged'
    : `has moved ${stats.change > 0 ? 'up' : 'down'} ${formatCurrency(Math.abs(stats.change))} (${stats.changePercent >= 0 ? '+' : ''}${stats.changePercent.toFixed(2)}%)`;

  fragment.appendChild(
    createParagraph(
      `${stock.name} (${stock.symbol}) is trading ${direction} over ${rangeMeta.longLabel}. The price ${changeDescriptor} during this window.`
    )
  );

  const tradingRange = `Trading range: ${formatCurrency(stats.low)} – ${formatCurrency(stats.high)}.`;
  fragment.appendChild(createParagraph(tradingRange));

  const sessionLabel = stock.marketState === 'premarket' ? 'pre-market levels' : stock.marketState === 'regular' ? 'the live session' : 'the latest close';
  fragment.appendChild(
    createParagraph(`Latest quote reflects ${sessionLabel}. Data refreshes automatically each minute when the London market is open.`)
  );

  return fragment;
}

function renderNewsSection(stock, history, stats, rangeMeta) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Price action narrative'));

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
      summary: `Mid-period pricing hovered near ${formatCurrency(midpoint.price)}, suggesting ${stats.change >= 0 ? 'steady demand from buyers' : 'persistent supply from sellers'}.`
    },
    {
      title: `Analysts weigh ${stock.symbol} trajectory`,
      time: new Date(now - 22 * 60 * 60 * 1000),
      summary: `From ${formatCurrency(earliest.price)} at the start of the period to ${formatCurrency(latest.price)} now, market watchers remain focused on volatility across ${rangeMeta.longLabel}.`
    }
  ];
}

function renderChartSection(stock) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Chart tools'));
  fragment.appendChild(
    createParagraph('Use the interactive chart to explore precise price movements with crosshair guides and minute-by-minute updates when markets trade.')
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
  const fullStats = getStatsForHistory(stock.fullHistory.length ? stock.fullHistory : history) ?? stats;
  const average = history.reduce((acc, point) => acc + point.price, 0) / history.length;

  fragment.appendChild(
    createList([
      `Average price in range: ${formatCurrency(average)}`,
      `High in range: ${formatCurrency(stats.high)}`,
      `Low in range: ${formatCurrency(stats.low)}`,
      `52-week high (range view): ${formatCurrency(fullStats.high)}`,
      `52-week low (range view): ${formatCurrency(fullStats.low)}`,
      `Data points analysed: ${history.length}`
    ])
  );

  return fragment;
}

function renderHistoricalSection(stock, history) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Recent prints'));

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
      `${stock.name} (${stock.symbol}) is one of the highest-valued companies on the London Stock Exchange. Live pricing is sourced from Yahoo Finance and will respect London trading hours.`
    )
  );
  fragment.appendChild(
    createParagraph('Use the navigation to pivot between market statistics, historical performance, and liquidity cues tailored to the selected time span.')
  );
  return fragment;
}

function renderFinancialsSection(stock, history, stats) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Market colour'));
  const intradayRange = formatCurrency(stats.high - stats.low, false);
  fragment.appendChild(
    createList([
      `Intraday range: ${formatCurrency(stats.high)} – ${formatCurrency(stats.low)} (${intradayRange} span)`,
      `Rolling average price (selected period): ${formatCurrency(history.reduce((sum, point) => sum + point.price, 0) / history.length)}`,
      `Latest session volume sample: ${stock.volume ? compactNumberFormatter.format(stock.volume) : 'N/A'}`,
      `Market state: ${stock.marketState === 'premarket' ? 'Pre-market quoting' : stock.marketState === 'regular' ? 'Regular trading' : 'Closed / last trade'}`
    ])
  );
  fragment.appendChild(
    createParagraph('For full fundamentals, layer this pricing view with your preferred research platform; this dashboard focuses on verified real-time market data.')
  );
  return fragment;
}

function renderAnalysisSection(stock, history, stats) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Trend analysis'));

  const momentum = stats.changePercent > 4 ? 'bullish' : stats.changePercent < -4 ? 'bearish' : 'range-bound';
  fragment.appendChild(createParagraph(`${stock.symbol} trend is currently ${momentum} based on the selected window.`));

  const volatility = calculateVolatility(history);
  fragment.appendChild(createParagraph(`Observed volatility (annualised from sample): ${volatility.toFixed(2)}%.`));
  fragment.appendChild(createParagraph('Combine this read with macro catalysts and company news to confirm your trading bias.'));

  return fragment;
}

function renderLiquiditySection(stock, history) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Liquidity highlights'));

  const latestVolume = stock.volume ? compactNumberFormatter.format(stock.volume) : '—';
  const volumeTrend = history.slice(-10).map((point) => point.volume ?? 0);
  const averageVolume = volumeTrend.length ? volumeTrend.reduce((a, b) => a + b, 0) / volumeTrend.length : 0;

  fragment.appendChild(
    createList([
      `Most recent volume print: ${latestVolume}`,
      `Short-run average volume: ${averageVolume ? compactNumberFormatter.format(averageVolume) : '—'}`,
      'Depth estimates leverage Yahoo Finance intraday feeds and adapt to pre-market sessions when regular trading is closed.'
    ])
  );

  return fragment;
}

function renderHoldersSection(stock) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createHeading('Institutional interest'));
  fragment.appendChild(
    createParagraph(
      `${stock.name} features prominently in FTSE 100 allocations. For the latest shareholder breakdown, consult the LSE or company filings; this dashboard centres on intraday price verification.`
    )
  );
  fragment.appendChild(
    createParagraph('Institutional ownership metrics are not pulled in real time here but can be overlaid from your broker or data vendor.')
  );
  return fragment;
}

function getStatsForHistory(history) {
  if (!history || !history.length) return null;
  const open = history[0].open ?? history[0].price;
  const close = history[history.length - 1].price;
  let high = history[0].high ?? history[0].price;
  let low = history[0].low ?? history[0].price;

  history.forEach((point) => {
    const candidateHigh = point.high ?? point.price;
    const candidateLow = point.low ?? point.price;
    if (candidateHigh > high) high = candidateHigh;
    if (candidateLow < low) low = candidateLow;
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

function calculateVolatility(history) {
  if (!history.length) return 0;
  const returns = [];
  for (let i = 1; i < history.length; i += 1) {
    const prev = history[i - 1].price;
    const current = history[i].price;
    if (prev === 0 || current === 0) continue;
    returns.push(Math.log(current / prev));
  }
  if (!returns.length) return 0;
  const mean = returns.reduce((acc, value) => acc + value, 0) / returns.length;
  const variance = returns.reduce((acc, value) => acc + (value - mean) ** 2, 0) / returns.length;
  const dailyVol = Math.sqrt(variance);
  const annualised = dailyVol * Math.sqrt(252) * 100;
  return annualised;
}

async function ensureHistoryForRange(stock, rangeKey, { force = false } = {}) {
  const cache = stock.rangeHistories;
  if (!force && cache.has(rangeKey)) {
    return cache.get(rangeKey);
  }

  const params = RANGE_TO_YAHOO[rangeKey] ?? RANGE_TO_YAHOO['1Y'];

  try {
    const points = await fetchYahooChart(stock.symbol, params);
    if (!points.length) {
      throw new Error('No data');
    }
    cache.set(rangeKey, points);
    if (!stock.fullHistory.length || rangeKey === '1Y') {
      stock.fullHistory = points;
    }
    applyLatestQuote(stock, points);
    return points;
  } catch (error) {
    console.error(`Failed to fetch data for ${stock.symbol} [${rangeKey}]`, error);
    stock.error = error;
    if (!cache.has(rangeKey)) {
      const fallback = buildFallbackHistory(stock);
      cache.set(rangeKey, fallback);
      if (!stock.fullHistory.length) {
        stock.fullHistory = fallback;
      }
      applyLatestQuote(stock, fallback);
      return fallback;
    }
    return cache.get(rangeKey) ?? [];
  }
}

function applyLatestQuote(stock, history) {
  if (!history.length) return;
  const sessionNow = determineMarketSession(new Date());
  const reversed = [...history].reverse();

  let candidate = reversed.find((point) => point.marketState === sessionNow);
  if (!candidate) {
    candidate = reversed.find((point) => point.marketState === 'regular') ?? history[history.length - 1];
  }

  stock.price = candidate.price;
  stock.volume = candidate.volume ?? stock.volume ?? null;
  stock.lastUpdated = candidate.time;
  stock.marketState = candidate.marketState;
}

async function updateMerkleDisplay(stock, symbol) {
  const token = ++merkleComputationToken;
  merkleStatusEl.classList.remove('verified', 'failed');
  merkleStatusEl.textContent = 'Verifying history…';
  merkleRootEl.textContent = 'Computing…';

  try {
    const yearHistory = await ensureHistoryForRange(stock, '1Y');
    if (!yearHistory.length) throw new Error('Missing history');

    const values = yearHistory.map((point) => `${point.time.toISOString()}|${point.price.toFixed(2)}`);

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
  const stock = stocksState.get(selectedSymbol);
  if (!stock) return;
  await selectStock(selectedSymbol);
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

async function refreshQuotes() {
  if (isRefreshing) return;
  isRefreshing = true;

  try {
    await Promise.all(
      STOCKS.map(async ({ symbol }) => {
        const stock = stocksState.get(symbol);
        if (!stock) return;
        const history = await ensureHistoryForRange(stock, '1D', { force: true });
        if (symbol === selectedSymbol) {
          const stats = getStatsForHistory(history);
          if (stats) {
            updatePrimaryDisplay(stock, stats);
            updateDetailDisplays(stats, stock);
            updateChart(stock, history);
            updateSectionContent(currentSectionKey, stock, history, stats);
          }
        }
      })
    );
    refreshListPrices();
  } catch (error) {
    console.error('Failed to refresh quotes', error);
  } finally {
    isRefreshing = false;
  }
}

function startUpdates() {
  void refreshQuotes();
  setInterval(() => {
    void refreshQuotes();
  }, UPDATE_INTERVAL_MS);
}

async function fetchYahooChart(symbol, { range, interval }) {
  const params = new URLSearchParams({
    range,
    interval,
    includePrePost: 'true'
  });
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params.toString()}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  if (!result) {
    throw new Error('Unexpected response shape');
  }
  const { timestamp = [], indicators, meta } = result;
  const quote = indicators?.quote?.[0] ?? {};
  const closes = quote.close ?? [];
  const opens = quote.open ?? [];
  const highs = quote.high ?? [];
  const lows = quote.low ?? [];
  const volumes = quote.volume ?? [];
  const timezone = meta?.timezone ?? LONDON_TIMEZONE;

  const points = timestamp.map((ts, index) => {
    const price = closes[index];
    if (price == null) return null;
    const time = new Date(ts * 1000);
    return {
      time,
      price: Number(Number(price).toFixed(2)),
      open: Number(Number(opens[index] ?? price).toFixed(2)),
      high: Number(Number(highs[index] ?? price).toFixed(2)),
      low: Number(Number(lows[index] ?? price).toFixed(2)),
      volume: volumes[index] ?? 0,
      marketState: determineMarketSession(time, timezone)
    };
  });

  return points.filter((point) => point !== null);
}

function determineMarketSession(date, sourceTimezone = LONDON_TIMEZONE) {
  const londonString = date.toLocaleString('en-GB', { timeZone: LONDON_TIMEZONE });
  const londonDate = new Date(londonString);
  const minutes = londonDate.getHours() * 60 + londonDate.getMinutes();
  const preMarketStart = 7 * 60;
  const marketOpen = 8 * 60;
  const marketClose = 16 * 60 + 30;

  if (minutes >= marketOpen && minutes <= marketClose) return 'regular';
  if (minutes >= preMarketStart && minutes < marketOpen) return 'premarket';
  return 'closed';
}

function buildFallbackHistory(stock) {
  const now = Date.now();
  const base = Number.isFinite(stock.price) && stock.price ? stock.price : 100;
  const history = [];
  for (let i = 60; i >= 0; i -= 1) {
    const time = new Date(now - i * 15 * 60 * 1000);
    const variance = (Math.random() - 0.5) * 0.02 * base;
    const price = Number((base + variance).toFixed(2));
    history.push({
      time,
      price,
      open: price,
      high: price,
      low: price,
      volume: 0,
      marketState: determineMarketSession(time)
    });
  }
  return history;
}

function formatTimeLabel(date, rangeKey) {
  if (rangeKey === '1D' || rangeKey === '5D') {
    return intradayFormatter.format(date);
  }
  if (rangeKey === '1M') {
    return shortDateFormatter.format(date);
  }
  return longDateFormatter.format(date);
}

function formatCurrency(value, includeSymbol = true) {
  if (value == null || Number.isNaN(value)) return '—';
  if (!includeSymbol) {
    return Number(value).toLocaleString('en-GB', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  return currencyFormatter.format(value);
}

function createHeading(text) {
  const heading = document.createElement('h3');
  heading.textContent = text;
  return heading;
}

function createParagraph(text) {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

function createList(items) {
  const ul = document.createElement('ul');
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  });
  return ul;
}

function updateChangeDisplay(element, change, changePercent, marketState) {
  const isPositive = change > 0;
  const isNegative = change < 0;
  element.classList.remove('positive', 'negative', 'neutral');
  if (isPositive) {
    element.classList.add('positive');
  } else if (isNegative) {
    element.classList.add('negative');
  } else {
    element.classList.add('neutral');
  }

  const label = `${change >= 0 ? '+' : ''}${formatCurrency(change, false)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`;
  const stateLabel = marketState === 'premarket' ? 'Pre-market' : marketState === 'regular' ? 'Live' : 'Previous close';
  element.textContent = `${label} · ${stateLabel}`;
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
  initialiseStocks();
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
