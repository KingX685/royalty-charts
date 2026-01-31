export function computeStats(trades) {
  const closedTrades = trades.filter((t) => t.status === 'Closed');
  const total = closedTrades.length;
  const wins = closedTrades.filter((t) => Number(t.plUsd) > 0).length;
  const losses = closedTrades.filter((t) => Number(t.plUsd) < 0).length;
  const breakEven = closedTrades.filter((t) => Number(t.plUsd) === 0).length;
  const winRate = total ? Math.round((wins / total) * 100) : 0;
  const totalPlUsd = closedTrades.reduce((sum, t) => sum + Number(t.plUsd || 0), 0);
  const totalPlNgn = closedTrades.reduce((sum, t) => sum + Number(t.plNgn || 0), 0);
  const sumWins = closedTrades.filter((t) => Number(t.plUsd) > 0).reduce((sum, t) => sum + Number(t.plUsd || 0), 0);
  const sumLosses = closedTrades.filter((t) => Number(t.plUsd) < 0).reduce((sum, t) => sum + Number(t.plUsd || 0), 0);
  const avgWin = wins ? sumWins / wins : 0;
  const avgLoss = losses ? sumLosses / losses : 0;

  const daily = groupByDay(closedTrades);
  const dayValues = Object.values(daily).map((entry) => entry.pl);
  const bestDay = dayValues.length ? Math.max(...dayValues) : 0;
  const worstDay = dayValues.length ? Math.min(...dayValues) : 0;

  return {
    total,
    wins,
    losses,
    breakEven,
    winRate,
    totalPlUsd,
    totalPlNgn,
    avgWin,
    avgLoss,
    bestDay,
    worstDay,
    daily,
  };
}

export function groupByDay(trades) {
  return trades.reduce((acc, trade) => {
    const key = trade.closeDate || trade.date;
    if (!key) return acc;
    if (!acc[key]) acc[key] = { date: key, pl: 0, trades: [] };
    acc[key].pl += Number(trade.plUsd || 0);
    acc[key].trades.push(trade);
    return acc;
  }, {});
}

export function confluenceBuckets(trades) {
  const buckets = [
    { label: '0-49', min: 0, max: 49, wins: 0, total: 0 },
    { label: '50-69', min: 50, max: 69, wins: 0, total: 0 },
    { label: '70-84', min: 70, max: 84, wins: 0, total: 0 },
    { label: '85-100', min: 85, max: 100, wins: 0, total: 0 },
  ];
  trades.forEach((trade) => {
    if (trade.status !== 'Closed') return;
    const score = Number(trade.confluenceScore || 0);
    const bucket = buckets.find((b) => score >= b.min && score <= b.max);
    if (!bucket) return;
    bucket.total += 1;
    if (Number(trade.plUsd) > 0) bucket.wins += 1;
  });
  return buckets.map((b) => ({
    ...b,
    winRate: b.total ? Math.round((b.wins / b.total) * 100) : 0,
  }));
}

export function drawLineChart(canvas, dataPoints, color) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  if (dataPoints.length < 2) return;
  const min = Math.min(...dataPoints);
  const max = Math.max(...dataPoints);
  const range = max - min || 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  dataPoints.forEach((value, index) => {
    const x = (index / (dataPoints.length - 1)) * (width - 20) + 10;
    const y = height - ((value - min) / range) * (height - 20) - 10;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

export function drawBarChart(canvas, dataPoints, color) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  if (!dataPoints.length) return;
  const max = Math.max(...dataPoints.map((d) => Math.abs(d))) || 1;
  const barWidth = width / dataPoints.length;
  dataPoints.forEach((value, index) => {
    const barHeight = (Math.abs(value) / max) * (height - 20);
    const x = index * barWidth + 6;
    const y = height / 2 - (value >= 0 ? barHeight : 0);
    ctx.fillStyle = value >= 0 ? '#1fbf75' : '#ff4d4f';
    ctx.fillRect(x, y, barWidth - 12, barHeight);
  });
}
