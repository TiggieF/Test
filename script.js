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

const UPDATE_INTERVAL_MS = 5000;
const HISTORY_LENGTH = 48; // Keep roughly 4 minutes of data at 5-second intervals

const chartCanvas = document.getElementById('price-chart');
const lastUpdatedEl = document.getElementById('last-updated');
const stockListEl = document.getElementById('stock-items');
const stockNameEl = document.getElementById('stock-name');
const stockSymbolEl = document.getElementById('stock-symbol');
const stockPriceEl = document.getElementById('stock-price');
const stockChangeEl = document.getElementById('stock-change');
const detailOpenEl = document.getElementById('detail-open');
const detailHighEl = document.getElementById('detail-high');
const detailLowEl = document.getElementById('detail-low');
const detailChangeEl = document.getElementById('detail-change');
const detailChangePercentEl = document.getElementById('detail-change-percent');
const detailVolumeEl = document.getElementById('detail-volume');

let selectedSymbol = null;
let chartInstance;

const stocksState = new Map();

function initializeStocks() {
  const basePrices = [189.57, 410.12, 126.72, 148.32, 875.66, 329.54, 205.71, 362.15, 487.9, 242.24];

  STOCKS.forEach((stock, index) => {
    const basePrice = basePrices[index];
    stocksState.set(stock.symbol, {
      ...stock,
      price: basePrice,
      open: basePrice,
      high: basePrice,
      low: basePrice,
      change: 0,
      changePercent: 0,
      volume: Math.floor(Math.random() * 1_000_000) + 500_000,
      history: createInitialHistory(basePrice)
    });
  });
}

function createInitialHistory(price) {
  const history = [];
  const now = Date.now();

  for (let i = HISTORY_LENGTH - 1; i >= 0; i -= 1) {
    const timestamp = new Date(now - i * UPDATE_INTERVAL_MS);
    history.push({ time: timestamp, price });
  }

  return history;
}

function renderStockList() {
  const fragment = document.createDocumentFragment();

  STOCKS.forEach((stock) => {
    const li = document.createElement('li');
    li.className = 'stock-item';
    li.tabIndex = 0;
    li.dataset.symbol = stock.symbol;

    const symbolEl = document.createElement('span');
    symbolEl.className = 'symbol';
    symbolEl.textContent = stock.symbol;

    const priceEl = document.createElement('span');
    priceEl.className = 'price';
    priceEl.textContent = formatCurrency(stocksState.get(stock.symbol).price);

    li.append(symbolEl, priceEl);
    fragment.appendChild(li);
  });

  stockListEl.appendChild(fragment);
}

function attachStockListHandlers() {
  stockListEl.addEventListener('click', (event) => {
    const item = event.target.closest('.stock-item');
    if (!item) return;
    selectStock(item.dataset.symbol);
  });

  stockListEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const item = event.target.closest('.stock-item');
    if (!item) return;
    event.preventDefault();
    selectStock(item.dataset.symbol);
  });
}

function selectStock(symbol) {
  if (!stocksState.has(symbol)) return;

  selectedSymbol = symbol;
  document.querySelectorAll('.stock-item').forEach((item) => {
    item.classList.toggle('selected', item.dataset.symbol === symbol);
  });

  const stock = stocksState.get(symbol);

  stockNameEl.textContent = stock.name;
  stockSymbolEl.textContent = stock.symbol;
  stockPriceEl.textContent = formatCurrency(stock.price);
  updateChangeDisplay(stockChangeEl, stock.change, stock.changePercent);

  detailOpenEl.textContent = formatCurrency(stock.open);
  detailHighEl.textContent = formatCurrency(stock.high);
  detailLowEl.textContent = formatCurrency(stock.low);
  detailChangeEl.textContent = formatCurrency(stock.change);
  detailChangePercentEl.textContent = `${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%`;
  detailVolumeEl.textContent = Intl.NumberFormat('en-US').format(stock.volume);

  updateChart(stock);
}

function updateChart(stock) {
  const labels = stock.history.map((point) => formatTime(point.time));
  const data = stock.history.map((point) => point.price);

  if (!chartInstance) {
    chartInstance = new Chart(chartCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: `${stock.symbol} price`,
            data,
            borderColor: 'rgba(56, 189, 248, 1)',
            backgroundColor: 'rgba(56, 189, 248, 0.2)',
            pointRadius: 0,
            tension: 0.35,
            fill: true,
            borderWidth: 2
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: 'rgba(148, 163, 184, 0.15)' },
            ticks: { color: 'rgba(148, 163, 184, 0.8)' }
          },
          y: {
            grid: { color: 'rgba(148, 163, 184, 0.15)' },
            ticks: { color: 'rgba(148, 163, 184, 0.8)' }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            intersect: false,
            mode: 'index',
            callbacks: {
              label: (context) => `${stock.symbol}: ${formatCurrency(context.parsed.y)}`
            }
          }
        }
      }
    });
  } else {
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].label = `${stock.symbol} price`;
    chartInstance.data.datasets[0].data = data;
    chartInstance.update();
  }
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
  return Intl.NumberFormat('en-US', {
    style: includeSymbol ? 'currency' : 'decimal',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatTime(date) {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function updateStockPrices() {
  const now = new Date();

  STOCKS.forEach(({ symbol }) => {
    const stock = stocksState.get(symbol);
    const drift = (Math.random() - 0.5) * 1.4; // random change within ~1.40 USD range
    const nextPrice = Math.max(5, stock.price + drift);

    stock.price = Number(nextPrice.toFixed(2));
    stock.change = Number((stock.price - stock.open).toFixed(2));
    stock.changePercent = Number(((stock.change / stock.open) * 100).toFixed(2));
    stock.high = Math.max(stock.high, stock.price);
    stock.low = Math.min(stock.low, stock.price);
    stock.volume += Math.floor(Math.random() * 25_000);

    stock.history.push({ time: now, price: stock.price });
    if (stock.history.length > HISTORY_LENGTH) {
      stock.history.splice(0, stock.history.length - HISTORY_LENGTH);
    }
  });

  refreshListPrices();
  updateSelectedStockDisplay();
  lastUpdatedEl.textContent = now.toLocaleTimeString('en-US', { hour12: false });
}

function refreshListPrices() {
  document.querySelectorAll('.stock-item').forEach((item) => {
    const stock = stocksState.get(item.dataset.symbol);
    const priceEl = item.querySelector('.price');
    if (!priceEl) return;
    priceEl.textContent = formatCurrency(stock.price);
  });
}

function updateSelectedStockDisplay() {
  if (!selectedSymbol) return;
  selectStock(selectedSymbol);
}

function startUpdates() {
  updateStockPrices();
  setInterval(updateStockPrices, UPDATE_INTERVAL_MS);
}

function init() {
  initializeStocks();
  renderStockList();
  attachStockListHandlers();
  selectStock(STOCKS[0].symbol);
  startUpdates();
}

document.addEventListener('DOMContentLoaded', init);
