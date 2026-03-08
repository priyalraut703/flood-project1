/* ═══════════════════════════════════════════════════════════
   URBAN FLOOD INTELLIGENCE PLATFORM — Frontend Script
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ── State ───────────────────────────────────────────────────
let map, riskLayer, drainLayer, twinLayer;
let pieChart, barChart, resourceChart;
let currentMode = 'slider';
let selectedFile = null;
let twinSteps = [];
let twinAnimTimeout = null;
let analysisData = null;
let currentTab = 'map';

// ── Tab Switching ────────────────────────────────────────────
function switchTab(tabName) {
  // Hide all tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  
  // Remove active class from all tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab pane
  document.getElementById('tab-content-' + tabName).classList.add('active');
  
  // Add active class to selected tab button
  document.getElementById('tab-' + tabName).classList.add('active');
  
  currentTab = tabName;
  
  // Handle map resizing when switching to map tab
  if (tabName === 'map' && map) {
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }
}

// ── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  switchTab('map'); // Initialize with map tab active first
  initMap();
  initCharts();
  startClock();
  document.getElementById('fileDrop').addEventListener('click', () => {
    document.getElementById('csvFile').click();
  });
});

// ── Clock ────────────────────────────────────────────────────
function startClock() {
  const tick = () => {
    const now = new Date();
    document.getElementById('clockDisplay').textContent =
      now.toLocaleTimeString('en-GB', {hour12: false});
  };
  tick();
  setInterval(tick, 1000);
}

// ── Mode toggle ──────────────────────────────────────────────
function setMode(mode) {
  currentMode = mode;
  document.getElementById('btnSlider').classList.toggle('active', mode === 'slider');
  document.getElementById('btnUpload').classList.toggle('active', mode === 'upload');
  document.getElementById('sliderSection').classList.toggle('hidden', mode !== 'slider');
  document.getElementById('uploadSection').classList.toggle('hidden', mode !== 'upload');
}

// ── Slider ───────────────────────────────────────────────────
function updateSliderDisplay(val) {
  document.getElementById('rainfallValue').textContent = val;
  const pct = ((val - 50) / 250) * 100;
  document.getElementById('gaugeFill').style.width = pct + '%';
}

// ── File upload ──────────────────────────────────────────────
function handleFileSelect(input) {
  selectedFile = input.files[0];
  document.getElementById('fileNameDisplay').textContent = selectedFile ? '✔ ' + selectedFile.name : '';
}

// ── Map Init ─────────────────────────────────────────────────
function initMap() {
  map = L.map('floodMap', { center: [19.076, 72.877], zoom: 12, zoomControl: true });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 18,
  }).addTo(map);

  riskLayer  = L.layerGroup().addTo(map);
  drainLayer = L.layerGroup().addTo(map);
  twinLayer  = L.layerGroup();

  map.on('mousemove', e => {
    document.getElementById('mapCoords').textContent =
      e.latlng.lat.toFixed(4) + '°N ' + e.latlng.lng.toFixed(4) + '°E';
  });
}

// ── Chart Init ───────────────────────────────────────────────
function initCharts() {
  const defaults = {
    plugins: { legend: { labels: { color: '#5a7a8a', font: { family: 'Share Tech Mono', size: 10 } } } },
    responsive: true, maintainAspectRatio: false,
  };

  const pieCfg = {
    type: 'doughnut',
    data: { labels: ['HIGH', 'MEDIUM', 'LOW'], datasets: [{ data: [0, 0, 0], backgroundColor: ['#ff3b3b33', '#ffcc0033', '#00e67633'], borderColor: ['#ff3b3b', '#ffcc00', '#00e676'], borderWidth: 2 }] },
    options: { ...defaults, cutout: '65%' },
  };
  pieChart = new Chart(document.getElementById('pieChart'), pieCfg);

  const barCfg = {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Flood Risk Score', data: [], backgroundColor: [], borderColor: [], borderWidth: 1 }] },
    options: { ...defaults,
      scales: {
        x: { ticks: { color: '#5a7a8a', font: { family: 'Share Tech Mono', size: 9 } }, grid: { color: '#1e3040' } },
        y: { ticks: { color: '#5a7a8a', font: { family: 'Share Tech Mono', size: 9 } }, grid: { color: '#1e3040' } },
      },
      plugins: { ...defaults.plugins, legend: { display: false } },
    },
  };
  barChart = new Chart(document.getElementById('barChart'), barCfg);

  const resCfg = {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        { label: 'Pumps', data: [], backgroundColor: '#0088cc55', borderColor: '#0088cc', borderWidth: 2 },
        { label: 'Teams', data: [], backgroundColor: '#ff8c0044', borderColor: '#ff8c00', borderWidth: 2 },
      ],
    },
    options: { ...defaults, scales: {
      x: { ticks: { color: '#5a7a8a', font: { family: 'Share Tech Mono', size: 9 } }, grid: { color: '#1e3040' } },
      y: { ticks: { color: '#5a7a8a', font: { family: 'Share Tech Mono', size: 9 } }, grid: { color: '#1e3040' } },
    }},
  };
  resourceChart = new Chart(document.getElementById('resourceChart'), resCfg);
}

// ── Layer Toggles ────────────────────────────────────────────
function toggleLayer(layer) {
  if (layer === 'risk')  { map.hasLayer(riskLayer)  ? map.removeLayer(riskLayer)  : riskLayer.addTo(map); }
  if (layer === 'drain') { map.hasLayer(drainLayer) ? map.removeLayer(drainLayer) : drainLayer.addTo(map); }
  if (layer === 'twin')  { map.hasLayer(twinLayer)  ? map.removeLayer(twinLayer)  : twinLayer.addTo(map); }
}

// ── Run Analysis ─────────────────────────────────────────────
async function runAnalysis() {
  setStatus('PROCESSING — ANALYSING WARD DATA…');
  const formData = new FormData();
  if (currentMode === 'slider') {
    formData.append('rainfall_mm', document.getElementById('rainfallSlider').value);
  } else if (currentMode === 'upload' && selectedFile) {
    formData.append('file', selectedFile);
  }

  try {
    const res = await fetch('/api/analyze', { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    analysisData = data;
    renderAll(data);
    setStatus('ANALYSIS COMPLETE — ' + data.wards.length + ' WARDS PROCESSED');
  } catch (err) {
    setStatus('ERROR: ' + err.message);
    console.error(err);
  }
}

function setStatus(msg) {
  document.getElementById('systemStatus').textContent = msg;
}

// ── Render Everything ────────────────────────────────────────
function renderAll(data) {
  renderMap(data.wards);
  renderWardReadiness(data.wards);
  renderResourceTable(data.wards);
  renderActionTimeline(data.timeline);
  renderImpactMetrics(data.summary);
  renderCharts(data.wards, data.summary);
  updateMapStats(data.summary);
}

// ── Map Markers ──────────────────────────────────────────────
function renderMap(wards) {
  riskLayer.clearLayers();
  drainLayer.clearLayers();

  wards.forEach(w => {
    const color = w.risk_level === 'HIGH' ? '#ff3b3b' : w.risk_level === 'MEDIUM' ? '#ffcc00' : '#00e676';
    const cls   = 'custom-marker marker-' + w.risk_level;

    const icon = L.divIcon({
      className: '',
      html: `<div class="${cls}">${w.risk_level.slice(0,1)}</div>`,
      iconSize: [30, 30], iconAnchor: [15, 15],
    });

    const popup = `
      <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:#c8dde8;background:#0d1219;padding:10px;min-width:180px;border:1px solid #1e3040;">
        <div style="font-size:13px;font-weight:700;color:#eef6fa;margin-bottom:6px;">${w.ward}</div>
        <div style="color:${color};font-weight:700;margin-bottom:6px;">▌ ${w.risk_level} RISK · Score: ${w.flood_risk_score}</div>
        <div>Rainfall: <b>${w.rainfall} mm</b></div>
        <div>Elevation: <b>${w.elevation} m</b></div>
        <div>Drainage Cap: <b>${w.drainage_capacity}%</b></div>
        <div>Readiness: <b>${w.readiness_score}%</b></div>
        <div>Population: <b>${w.population.toLocaleString()}</b></div>
        <div style="margin-top:6px;color:#ff8c00;">Pumps: ${w.pumps} · Teams: ${w.teams}</div>
      </div>`;

    L.marker([w.lat, w.lng], {icon}).bindPopup(popup, {
      className: 'custom-popup', maxWidth: 220
    }).addTo(riskLayer);

    if (w.drain_failed) {
      const drainIcon = L.divIcon({
        className: '',
        html: `<div class="custom-marker marker-drain">⚠</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14],
      });
      const dPopup = `<div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:#c8dde8;background:#0d1219;padding:10px;border:1px solid #1e3040;">
        <div style="color:#ff8c00;font-weight:700;">⚠ DRAIN FAILURE — ${w.ward}</div>
        <div>Failure Risk: <b>${w.drain_failure_risk}x</b></div>
        <div>Rainfall: ${w.rainfall}mm / Capacity: ${w.drainage_capacity}%</div>
      </div>`;
      L.marker([w.lat + 0.003, w.lng + 0.003], {icon: drainIcon})
        .bindPopup(dPopup, {className:'custom-popup'})
        .addTo(drainLayer);
    }
  });

  const bounds = wards.map(w => [w.lat, w.lng]);
  if (bounds.length) map.fitBounds(bounds, {padding: [40, 40]});
}

// ── Ward Readiness ───────────────────────────────────────────
function renderWardReadiness(wards) {
  const sorted = [...wards].sort((a, b) => a.readiness_score - b.readiness_score);
  const container = document.getElementById('wardReadiness');
  container.innerHTML = sorted.map((w, i) => {
    const fillClass = w.risk_level === 'HIGH' ? 'fill-red' : w.risk_level === 'MEDIUM' ? 'fill-yellow' : 'fill-green';
    return `<div class="ward-item" style="animation-delay:${i*40}ms">
      <div class="ward-row1">
        <span class="ward-name">${w.ward}</span>
        <span class="risk-badge ${w.risk_level}">${w.risk_level}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill ${fillClass}" style="width:${w.readiness_score}%"></div>
      </div>
      <div class="ward-score">Readiness: ${w.readiness_score}% · Risk Score: ${w.flood_risk_score}</div>
    </div>`;
  }).join('');
}

// ── Resource Table ───────────────────────────────────────────
function renderResourceTable(wards) {
  const highs = wards.filter(w => w.risk_level === 'HIGH');
  const meds  = wards.filter(w => w.risk_level === 'MEDIUM');
  const rows  = [...highs, ...meds].map(w =>
    `<tr>
      <td style="color:#eef6fa">${w.ward}</td>
      <td><span class="risk-badge ${w.risk_level}">${w.risk_level}</span></td>
      <td class="pump-count">${w.pumps}</td>
      <td class="team-count">${w.teams}</td>
      <td style="color:#5a7a8a;font-size:9px">${w.drain_failed ? '<span style="color:#ff8c00">⚠ FAILED</span>' : 'OK'}</td>
    </tr>`
  ).join('');

  document.getElementById('resourceTable').innerHTML = `
    <table class="resource-table">
      <thead><tr><th>WARD</th><th>RISK</th><th>PUMPS</th><th>TEAMS</th><th>DRAIN</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="color:#5a7a8a;text-align:center;padding:12px">No high/medium risk wards</td></tr>'}</tbody>
    </table>`;
}

// ── Action Timeline ──────────────────────────────────────────
function renderActionTimeline(timeline) {
  const container = document.getElementById('actionTimeline');
  container.innerHTML = timeline.map((t, i) =>
    `<div class="timeline-item" style="animation-delay:${i*60}ms">
      <div class="tl-time">${t.time}</div>
      <div class="tl-body">
        <div class="tl-action">${t.action}</div>
        <span class="tl-priority ${t.priority}">${t.priority}</span>
        ${t.wards.length ? `<div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:#5a7a8a;margin-top:3px">${t.wards.slice(0,4).join(', ')}${t.wards.length > 4 ? ' +' + (t.wards.length - 4) + ' more' : ''}</div>` : ''}
      </div>
    </div>`
  ).join('');
}

// ── Impact Metrics ───────────────────────────────────────────
function renderImpactMetrics(summary) {
  document.getElementById('impactMetrics').style.display = 'flex';
  animateCounter('mHigh',   0, summary.high_count,           400);
  animateCounter('mPop',    0, summary.population_affected,  600, true);
  document.getElementById('mArea').textContent  = summary.flood_area_km2 + ' km²';
  animateCounter('mPumps',  0, summary.total_pumps,          500);
  animateCounter('mTeams',  0, summary.total_teams,          500);
  animateCounter('mDrains', 0, summary.drain_failures,       400);
}

function animateCounter(id, from, to, duration, formatted = false) {
  const el = document.getElementById(id);
  const start = performance.now();
  const update = now => {
    const t = Math.min((now - start) / duration, 1);
    const val = Math.round(from + (to - from) * easeOut(t));
    el.textContent = formatted ? val.toLocaleString() : val;
    if (t < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

// ── Map Stats Overlay ────────────────────────────────────────
function updateMapStats(summary) {
  document.getElementById('mapStats').style.display = 'flex';
  document.getElementById('moHigh').textContent  = summary.high_count;
  document.getElementById('moMed').textContent   = summary.medium_count;
  document.getElementById('moLow').textContent   = summary.low_count;
  document.getElementById('moDrain').textContent = summary.drain_failures;
}

// ── Charts ───────────────────────────────────────────────────
function renderCharts(wards, summary) {
  // Pie
  pieChart.data.datasets[0].data = [summary.high_count, summary.medium_count, summary.low_count];
  pieChart.update('active');

  // Bar
  const labels = wards.map(w => w.ward.replace('Ward_', 'W'));
  const scores  = wards.map(w => w.flood_risk_score);
  const colors  = wards.map(w =>
    w.risk_level === 'HIGH' ? '#ff3b3b55' : w.risk_level === 'MEDIUM' ? '#ffcc0044' : '#00e67633'
  );
  const borders = wards.map(w =>
    w.risk_level === 'HIGH' ? '#ff3b3b' : w.risk_level === 'MEDIUM' ? '#ffcc00' : '#00e676'
  );
  barChart.data.labels = labels;
  barChart.data.datasets[0].data = scores;
  barChart.data.datasets[0].backgroundColor = colors;
  barChart.data.datasets[0].borderColor = borders;
  barChart.update('active');

  // Resource
  const highMed = wards.filter(w => w.risk_level !== 'LOW');
  resourceChart.data.labels  = highMed.map(w => w.ward.replace('Ward_', 'W'));
  resourceChart.data.datasets[0].data = highMed.map(w => w.pumps);
  resourceChart.data.datasets[1].data = highMed.map(w => w.teams);
  resourceChart.update('active');
}

// ── Digital Twin ─────────────────────────────────────────────
async function runDigitalTwin() {
  const rainfall = currentMode === 'slider'
    ? parseInt(document.getElementById('rainfallSlider').value)
    : 150;

  document.getElementById('twinStatus').textContent = 'FETCHING SIMULATION…';

  try {
    const res = await fetch('/api/simulate_twin', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({rainfall}),
    });
    const data = await res.json();
    if (!data.success) throw new Error('Simulation failed');
    twinSteps = data.steps;
    renderTwinTimeline(twinSteps);
    switchTab('twin'); // Switch to twin tab
    document.getElementById('twinStatus').textContent = 'SIMULATION LOADED — RAINFALL: ' + rainfall + 'mm';
    document.getElementById('twinLayerToggle').checked = true;
  } catch (err) {
    document.getElementById('twinStatus').textContent = 'ERROR: ' + err.message;
  }
}

function renderTwinTimeline(steps) {
  const html = steps.map((s, i) => `
    <div class="twin-step" id="twinStep${i}">
      <div class="twin-step-time">${s.label}</div>
      <div class="twin-step-body" style="flex:1">
        <div class="twin-step-event">${s.event}</div>
        <div class="twin-step-desc">${s.description}</div>
        <div class="twin-flood-bar"><div class="twin-flood-fill" id="twinFill${i}" style="width:0%"></div></div>
      </div>
    </div>`
  ).join('');
  document.getElementById('twinTimeline').innerHTML = html;
  document.getElementById('twinProgressFill').style.width = '0%';
}

function resetTwin() {
  if (twinAnimTimeout) clearTimeout(twinAnimTimeout);
  document.querySelectorAll('.twin-step').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.twin-flood-fill').forEach(el => el.style.width = '0%');
  document.getElementById('twinProgressFill').style.width = '0%';
  twinLayer.clearLayers();
  document.getElementById('twinPlayBtn').disabled = false;
}

function playTwinAnimation() {
  document.getElementById('twinPlayBtn').disabled = true;
  let i = 0;
  const total = twinSteps.length;

  const playStep = () => {
    if (i >= total) {
      document.getElementById('twinPlayBtn').disabled = false;
      animateTwinLayer(twinSteps[total - 1].flood_pct);
      return;
    }
    document.querySelectorAll('.twin-step').forEach(el => el.classList.remove('active'));
    const step = document.getElementById('twinStep' + i);
    step.classList.add('active');
    step.scrollIntoView({behavior: 'smooth', block: 'nearest'});

    // Animate flood bar
    setTimeout(() => {
      document.getElementById('twinFill' + i).style.width = twinSteps[i].flood_pct + '%';
    }, 100);

    const prog = ((i + 1) / total) * 100;
    document.getElementById('twinProgressFill').style.width = prog + '%';

    animateTwinLayer(twinSteps[i].flood_pct);
    i++;
    twinAnimTimeout = setTimeout(playStep, 1500);
  };

  // Reset
  document.querySelectorAll('.twin-flood-fill').forEach(el => el.style.width = '0%');
  document.getElementById('twinProgressFill').style.width = '0%';
  twinLayer.clearLayers();
  map.addLayer(twinLayer);

  playStep();
}

function animateTwinLayer(pct) {
  twinLayer.clearLayers();
  if (!analysisData || pct === 0) return;

  const highWards = analysisData.wards.filter(w => w.risk_level === 'HIGH');
  const medWards  = analysisData.wards.filter(w => w.risk_level === 'MEDIUM');

  const wards = pct > 60 ? [...highWards, ...medWards] : highWards;
  const radius = 300 + (pct / 100) * 400;
  const opacity = 0.1 + (pct / 100) * 0.25;

  wards.forEach(w => {
    L.circle([w.lat, w.lng], {
      radius,
      color: '#ff3b3b',
      fillColor: '#ff3b3b',
      fillOpacity: opacity,
      weight: 1,
    }).addTo(twinLayer);
  });
}
