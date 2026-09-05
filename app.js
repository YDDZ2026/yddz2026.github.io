// ========== EMBEDDED GEOJSON DATA ==========
const EMBEDDED_DATA = window.MAP_DATA;

// ========== GitHub Backend Config ==========
const GITHUB_CONFIG = {
  owner: 'YDDZ2026', repo: 'yddz2026.github.io', branch: 'main',
  dataFile: 'data.json',
  token: localStorage.getItem('gh_token') || ''
};
const GITHUB_API = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.dataFile}`;
const GITHUB_RAW = `https://yddz2026.github.io/${GITHUB_CONFIG.dataFile}`;
const GITHUB_READ_ENABLED = true;
let pollTimer = null;

// ========== App State ==========
let currentView = 'tv';
let tvChart = null, mobileChart = null;
let currentDrillDistrict = null;
let data = null;
let isAdmin = false;
let detectedDevice = 'desktop';
let currentMonth = 'all';
let pickerYear = 2026;
let pickerMode = 'month'; // 'month' or 'year'
let yearPageStart = 2024; // for year mode pagination (shows 12 years at a time)

const STORAGE_KEY = 'yidu_byd_full_data';
const UPDATE_KEY = 'yidu_byd_update';
const ADMIN_KEY = 'yidu_byd_admin';
const ADMIN_PASSWORD = 'yichang2026';
const bc = new BroadcastChannel('yidu_byd_full_sync');

// ========== Month Picker Helpers ==========
function getAvailableMonths() {
  if (!data || !data.monthlyData) return ['2026-08'];
  return Object.keys(data.monthlyData).sort();
}

function getMonthLabel(month) {
  if (month === 'all') return '累计';
  const p = month.split('-');
  return p[0] + '年' + parseInt(p[1]) + '月';
}

function getNextMonth() {
  const months = getAvailableMonths();
  const last = months[months.length - 1];
  const p = last.split('-');
  let y = parseInt(p[0]), m = parseInt(p[1]) + 1;
  if (m > 12) { y++; m = 1; }
  return y + '-' + String(m).padStart(2, '0');
}

function getRangeLabel() {
  if (currentMonth === 'all') return '累计';
  return getMonthLabel(currentMonth);
}

// Get district data for the selected month (or cumulative)
function getRangeDistrictData() {
  if (currentMonth === 'all') {
    const result = {};
    const names = data.districtNames || [];
    names.forEach(n => { result[n] = { total: 0, vip: 0 }; });
    result['其他'] = { total: 0, vip: 0 };
    Object.values(data.monthlyData).forEach(md => {
      if (md.districtData) {
        Object.entries(md.districtData).forEach(([name, d]) => {
          if (!result[name]) result[name] = { total: 0, vip: 0 };
          result[name].total += d.total || 0;
          result[name].vip += d.vip || 0;
        });
      }
    });
    return result;
  }
  const md = data.monthlyData[currentMonth];
  const result = md ? (md.districtData || {}) : {};
  if (!result['其他']) result['其他'] = { total: 0, vip: 0 };
  return result;
}

function getRangeStreetData(district) {
  if (currentMonth === 'all') {
    const result = {};
    const streets = (data.streetsByDistrict || {})[district] || [];
    streets.forEach(s => { result[s] = { total: 0, vip: 0 }; });
    Object.values(data.monthlyData).forEach(md => {
      if (md.streetData && md.streetData[district]) {
        Object.entries(md.streetData[district]).forEach(([s, d]) => {
          if (!result[s]) result[s] = { total: 0, vip: 0 };
          result[s].total += d.total || 0;
          result[s].vip += d.vip || 0;
        });
      }
    });
    return result;
  }
  const md = data.monthlyData[currentMonth];
  if (!md || !md.streetData) return {};
  return md.streetData[district] || {};
}

// Keep old function names for upload view compatibility
function getMonthDistrictData(month) {
  if (month === 'all') {
    const result = {};
    const names = data.districtNames || [];
    names.forEach(n => { result[n] = { total: 0, vip: 0 }; });
    result['其他'] = { total: 0, vip: 0 };
    Object.values(data.monthlyData).forEach(md => {
      if (md.districtData) {
        Object.entries(md.districtData).forEach(([name, d]) => {
          if (!result[name]) result[name] = { total: 0, vip: 0 };
          result[name].total += d.total || 0;
          result[name].vip += d.vip || 0;
        });
      }
    });
    return result;
  }
  const md = data.monthlyData[month];
  const result = md ? (md.districtData || {}) : {};
  if (!result['其他']) result['其他'] = { total: 0, vip: 0 };
  return result;
}

function getMonthStreetData(month, district) {
  if (month === 'all') {
    const result = {};
    const streets = (data.streetsByDistrict || {})[district] || [];
    streets.forEach(s => { result[s] = { total: 0, vip: 0 }; });
    Object.values(data.monthlyData).forEach(md => {
      if (md.streetData && md.streetData[district]) {
        Object.entries(md.streetData[district]).forEach(([s, d]) => {
          if (!result[s]) result[s] = { total: 0, vip: 0 };
          result[s].total += d.total || 0;
          result[s].vip += d.vip || 0;
        });
      }
    });
    return result;
  }
  const md = data.monthlyData[month];
  if (!md || !md.streetData) return {};
  return md.streetData[district] || {};
}

// ========== Month Picker UI ==========
const MONTH_NAMES_CN = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

function toggleMonthPicker(which) {
  const tvDD = document.getElementById('tvMonthDropdown');
  const mbDD = document.getElementById('mobileMonthDropdown');
  if (which === 'tv') {
    const isShow = tvDD.classList.contains('show');
    tvDD.classList.toggle('show', !isShow);
    if (!isShow) renderPickerGrid('tv');
    if (mbDD) mbDD.classList.remove('show');
  } else {
    const isShow = mbDD.classList.contains('show');
    mbDD.classList.toggle('show', !isShow);
    if (!isShow) renderPickerGrid('mobile');
    if (tvDD) tvDD.classList.remove('show');
  }
}

function setPickerMode(which, mode) {
  pickerMode = mode;
  // Update toggle buttons
  const wrapper = which === 'tv' ? document.getElementById('tvMonthDropdown') : document.getElementById('mobileMonthDropdown');
  // Update all mode-btn groups
  document.querySelectorAll('.picker-mode-toggle').forEach(toggle => {
    toggle.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  });
  renderPickerGrid(which);
}

function changePickerYear(which, delta) {
  if (pickerMode === 'year') {
    yearPageStart += delta * 12;
  } else {
    pickerYear += delta;
  }
  renderPickerGrid(which);
}

function renderPickerGrid(which) {
  const grid = document.getElementById(which + 'PickerGrid');
  if (!grid) return;
  const yearLabel = document.getElementById(which + 'PickerYear');
  const available = getAvailableMonths();
  
  if (pickerMode === 'year') {
    // Year mode: show 12 years in a 4x3 grid
    if (yearLabel) yearLabel.textContent = yearPageStart + ' - ' + (yearPageStart + 11) + ' 年';
    let html = '';
    for (let i = 0; i < 12; i++) {
      const yr = yearPageStart + i;
      // Check if any month in this year is available
      const hasData = available.some(m => m.startsWith(yr + '-'));
      // Check if this year is the selected year (if currentMonth starts with this year)
      const isSelected = currentMonth !== 'all' && currentMonth.startsWith(yr + '-');
      let cls = 'month-picker-cell';
      if (isSelected) cls += ' active';
      if (!hasData) cls += ' disabled';
      html += `<div class="${cls}" onclick="${hasData ? `selectPickerYear('${which}', ${yr})` : ''}">${yr}年</div>`;
    }
    grid.innerHTML = html;
  } else {
    // Month mode: show 12 months in a 4x3 grid
    if (yearLabel) yearLabel.textContent = pickerYear + ' 年';
    let html = '';
    for (let m = 1; m <= 12; m++) {
      const monthKey = pickerYear + '-' + String(m).padStart(2, '0');
      const isAvailable = available.indexOf(monthKey) >= 0;
      const isActive = currentMonth === monthKey;
      const isDisabled = !isAvailable;
      let cls = 'month-picker-cell';
      if (isActive) cls += ' active';
      if (isDisabled) cls += ' disabled';
      html += `<div class="${cls}" onclick="${isDisabled ? '' : `selectPickerMonth('${which}', '${monthKey}')`}">${MONTH_NAMES_CN[m-1]}</div>`;
    }
    grid.innerHTML = html;
  }
}

function selectPickerYear(which, year) {
  // When a year is selected, switch to month mode for that year
  pickerYear = year;
  pickerMode = 'month';
  // Update toggle buttons
  document.querySelectorAll('.picker-mode-toggle').forEach(toggle => {
    toggle.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === 'month');
    });
  });
  // Check if this year has any available months
  const available = getAvailableMonths();
  const yearMonths = available.filter(m => m.startsWith(year + '-'));
  if (yearMonths.length === 0) return;
  // Select the first available month of this year, or show the month grid
  renderPickerGrid(which);
}

function selectPickerMonth(which, month) {
  currentMonth = month;
  // Update trigger labels
  const tvLabel = document.getElementById('tvMonthLabel');
  const mbLabel = document.getElementById('mobileMonthLabel');
  const label = getRangeLabel();
  if (tvLabel) tvLabel.textContent = label;
  if (mbLabel) mbLabel.textContent = label;
  
  // Close dropdowns
  const tvDD = document.getElementById('tvMonthDropdown');
  const mbDD = document.getElementById('mobileMonthDropdown');
  if (tvDD) tvDD.classList.remove('show');
  if (mbDD) mbDD.classList.remove('show');
  
  refreshCurrentView();
}

function initMonthPickers() {
  // Close on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.month-picker-wrapper') && !e.target.closest('.mobile-month-picker')) {
      const tvDD = document.getElementById('tvMonthDropdown');
      const mbDD = document.getElementById('mobileMonthDropdown');
      if (tvDD) tvDD.classList.remove('show');
      if (mbDD) mbDD.classList.remove('show');
    }
  });
  // Update trigger labels
  const label = getRangeLabel();
  const tvLabel = document.getElementById('tvMonthLabel');
  const mbLabel = document.getElementById('mobileMonthLabel');
  if (tvLabel) tvLabel.textContent = label;
  if (mbLabel) mbLabel.textContent = label;
}

// ========== Streets Data (embedded, no async loading) ==========
function getStreetsGeo(districtName) {
  return data.streetsGeo ? data.streetsGeo[districtName] : null;
}

// ========== Device Detection ==========
function detectDevice() {
  const ua = navigator.userAgent.toLowerCase();
  const w = window.innerWidth;
  if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/.test(ua) || (w < 768 && !/ipad|tablet/.test(ua))) return 'mobile';
  return 'desktop';
}

// ========== Admin Login ==========
function tryAdminLogin() {
  if (document.getElementById('adminPwd').value === ADMIN_PASSWORD) {
    isAdmin = true;
    localStorage.setItem(ADMIN_KEY, 'true');
    document.getElementById('adminLoginGate').style.display = 'none';
    document.getElementById('uploadContent').style.display = 'block';
    initUpload();
    showToast('管理员登录成功');
  } else {
    document.getElementById('adminLoginError').style.display = 'block';
    document.getElementById('adminPwd').value = '';
    setTimeout(() => document.getElementById('adminLoginError').style.display = 'none', 3000);
  }
}
function checkAdminAuth() {
  if (localStorage.getItem(ADMIN_KEY) === 'true') {
    isAdmin = true;
    document.getElementById('adminLoginGate').style.display = 'none';
    document.getElementById('uploadContent').style.display = 'block';
    return true;
  }
  return false;
}

// ========== Sync Status ==========
function setSyncStatus(s) {
  const dot = document.getElementById('syncDot'), text = document.getElementById('syncStatus');
  const dotInline = document.getElementById('syncDotInline'), textInline = document.getElementById('syncTextInline');
  const badge = document.getElementById('syncBadge');
  if (dot) dot.className = 'dot ' + s;
  if (text) text.textContent = s === 'online' ? '已同步' : s === 'offline' ? '离线模式' : '连接中...';
  if (dotInline) { dotInline.style.background = s === 'online' ? '#10b981' : s === 'offline' ? '#ef4444' : '#f59e0b'; }
  if (textInline) textInline.textContent = s === 'online' ? '自动同步' : s === 'offline' ? '离线模式' : '同步中...';
  if (badge) {
    if (s === 'online') { badge.style.background = '#f0fdf4'; badge.style.color = '#15803d'; }
    else if (s === 'offline') { badge.style.background = '#fef2f2'; badge.style.color = '#dc2626'; }
    else { badge.style.background = '#fffbeb'; badge.style.color = '#d97706'; }
  }
}

// ========== GitHub Backend ==========
let lastCloudUpdate = '';

async function loadFromGitHub() {
  if (!GITHUB_READ_ENABLED) { setSyncStatus('offline'); return; }
  try {
    const resp = await fetch(GITHUB_RAW + '?t=' + Date.now());
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const cloudData = await resp.json();
    if (cloudData && cloudData.monthlyData) {
      // Use timestamp for comparison instead of expensive JSON.stringify
      const cloudUpdate = cloudData.updated_at || '';
      if (cloudUpdate !== lastCloudUpdate) {
        lastCloudUpdate = cloudUpdate;
        data.monthlyData = cloudData.monthlyData;
        if (cloudData.addressDetails) data.addressDetails = cloudData.addressDetails;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ monthlyData: data.monthlyData, addressDetails: data.addressDetails || {} }));
        const info = { name: cloudData.updated_by || '系统', time: cloudData.updated_at ? new Date(cloudData.updated_at).toLocaleString('zh-CN', {hour12: false}) : '' };
        localStorage.setItem(UPDATE_KEY, JSON.stringify(info));
        updateLastUpdate(info);
        // Always refresh view when data changed (including initial load)
        refreshCurrentView();
      }
    }
    setSyncStatus('online');
  } catch(e) { console.error('Load failed:', e); setSyncStatus('offline'); }
}

async function saveToGitHub(updater) {
  if (!GITHUB_CONFIG.token || GITHUB_CONFIG.token.length < 20) { setSyncStatus('offline'); return; }
  try {
    const resp = await fetch(GITHUB_API + '?ref=' + GITHUB_CONFIG.branch, { headers: { 'Authorization': `Bearer ${GITHUB_CONFIG.token}`, 'Accept': 'application/vnd.github+json' } });
    let sha = '';
    if (resp.ok) { const fd = await resp.json(); sha = fd.sha; }
    const content = { monthlyData: data.monthlyData, addressDetails: data.addressDetails || {}, updated_by: updater || '系统', updated_at: new Date().toISOString() };
    const updateResp = await fetch(GITHUB_API, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${GITHUB_CONFIG.token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `更新客户数据 - ${updater || '系统'} - ${new Date().toISOString()}`, content: btoa(unescape(encodeURIComponent(JSON.stringify(content)))), sha: sha || undefined, branch: GITHUB_CONFIG.branch })
    });
    if (!updateResp.ok) throw new Error('HTTP ' + updateResp.status);
    lastCloudUpdate = new Date().toISOString();
    setSyncStatus('online');
  } catch(e) { console.error('Save failed:', e); setSyncStatus('offline'); showToast('云端同步失败，数据已保存在本地'); }
}

function startPolling() {
  if (!GITHUB_READ_ENABLED) return;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(loadFromGitHub, 60000); // 60s
}

// ========== Data Management ==========
function loadData() {
  // Reference static map data directly (read-only, never modified)
  // Only load dynamic data (monthlyData, addressDetails) from localStorage
  data = {
    districtNames: EMBEDDED_DATA.districtNames,
    districtGeo: EMBEDDED_DATA.districtGeo,
    streetsGeo: EMBEDDED_DATA.streetsGeo,
    streetsByDistrict: EMBEDDED_DATA.streetsByDistrict,
    monthlyData: {},
    addressDetails: {}
  };
  // Load dynamic data from localStorage
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const saved = JSON.parse(stored);
      if (saved.monthlyData) data.monthlyData = saved.monthlyData;
      if (saved.addressDetails) data.addressDetails = saved.addressDetails;
    } catch(e) { /* ignore corrupt localStorage */ }
  }
  if (!data.addressDetails) data.addressDetails = {};
  if (!data.monthlyData) data.monthlyData = { '2026-08': { districtData: {}, streetData: {} } };
  // Ensure 2026-08 exists with all districts
  if (!data.monthlyData['2026-08']) {
    data.monthlyData['2026-08'] = { districtData: {}, streetData: {} };
  }
  const names = data.districtNames || [];
  names.forEach(d => {
    if (!data.monthlyData['2026-08'].districtData[d]) data.monthlyData['2026-08'].districtData[d] = { total: 0, vip: 0 };
    if (!data.monthlyData['2026-08'].streetData[d]) {
      data.monthlyData['2026-08'].streetData[d] = {};
      (data.streetsByDistrict[d] || []).forEach(s => { data.monthlyData['2026-08'].streetData[d][s] = { total: 0, vip: 0 }; });
    }
  });
  // Ensure "其他" exists
  if (!data.monthlyData['2026-08'].districtData['其他']) data.monthlyData['2026-08'].districtData['其他'] = { total: 0, vip: 0 };
}

function saveData(updater) {
  const info = { name: updater || '系统', time: new Date().toLocaleString('zh-CN', {hour12: false}) };
  // Only save dynamic data to localStorage, NOT the 211KB of static map data
  const slimData = { monthlyData: data.monthlyData, addressDetails: data.addressDetails || {} };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(slimData));
  localStorage.setItem(UPDATE_KEY, JSON.stringify(info));
  bc.postMessage({type: 'data_update', data: data, update: info});
  saveToGitHub(updater);
}

bc.onmessage = function(e) {
  if (e.data.type === 'data_update') {
    data = e.data.data;
    refreshCurrentView();
    showToast('数据已被 ' + e.data.update.name + ' 更新');
    updateLastUpdate(e.data.update);
  }
};

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function updateLastUpdate(info) {
  const el = document.getElementById('uploadLastUpdate');
  if (el && info) el.textContent = '最后更新：' + info.name + ' 于 ' + info.time;
}

// ========== Color helpers ==========
function getColorForValue(val, max) {
  if (max === 0) return '#1e3a5f';
  const r = val / max;
  if (r > 0.75) return '#1e40af';
  if (r > 0.5) return '#3b82f6';
  if (r > 0.25) return '#60a5fa';
  if (r > 0.1) return '#93c5fd';
  return '#dbeafe';
}

// ========== Month Selectors ==========
function refreshMonthSelectors() {
  // Only refresh upload month selector now (TV/Mobile use date range picker)
  const up = document.getElementById('uploadMonthSelect');
  if (up) {
    const months = getAvailableMonths();
    up.innerHTML = months.map(m => `<option value="${m}">${getMonthLabel(m)}</option>`).join('');
    // Default to latest month
    if (months.length > 0) {
      up.value = months[months.length - 1];
    }
  }
}

function onMonthChange() {
  // No longer used by TV/Mobile - kept for compatibility
  refreshCurrentView();
}

// ========== TV View ==========
// ========== Animation Functions ==========
function animateNumber(el, targetVal, duration, formatter) {
  const startVal = 0;
  const startTime = performance.now();
  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = Math.round(startVal + (targetVal - startVal) * eased);
    el.textContent = formatter ? formatter(current) : current.toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderTVStatsAnimated(grandTotal, grandVIP) {
  const vipRate = grandTotal > 0 ? (grandVIP / grandTotal * 100).toFixed(1) : '0.0';
  document.getElementById('tvStats').innerHTML = `
    <div class="tv-stat-card"><div class="label">客户总数</div><div class="value accent" id="statTotal">0</div></div>
    <div class="tv-stat-card"><div class="label">VIP客户</div><div class="value success" id="statVIP">0</div></div>
    <div class="tv-stat-card"><div class="label">VIP占比</div><div class="value warn" id="statRate">0.0%</div></div>
  `;
  animateNumber(document.getElementById('statTotal'), grandTotal, 1200);
  animateNumber(document.getElementById('statVIP'), grandVIP, 1500);
  // Animate rate
  const rateEl = document.getElementById('statRate');
  const rateStart = performance.now();
  function rateStep(now) {
    const p = Math.min((now - rateStart) / 1500, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    rateEl.textContent = (parseFloat(vipRate) * eased).toFixed(1) + '%';
    if (p < 1) requestAnimationFrame(rateStep);
  }
  requestAnimationFrame(rateStep);
}

function updateTicker() {
  const dd = getRangeDistrictData();
  const names = data.districtNames || [];
  const districts = names.map(name => ({ name, total: (dd[name]||{}).total||0, vip: (dd[name]||{}).vip||0 }))
    .sort((a,b) => b.total - a.total);
  const otherData = dd['其他'] || {total:0, vip:0};
  const grandTotal = districts.reduce((s,d) => s+d.total, 0) + otherData.total;
  const grandVIP = districts.reduce((s,d) => s+d.vip, 0) + otherData.vip;

  let parts = [];
  parts.push(`当前统计：<span>${getRangeLabel()}</span>`);
  parts.push(`客户总数：<span>${grandTotal.toLocaleString()}</span> 户`);
  parts.push(`VIP客户：<span>${grandVIP.toLocaleString()}</span> 户`);
  parts.push(`VIP占比：<span>${grandTotal>0?(grandVIP/grandTotal*100).toFixed(1):'0.0'}%</span>`);
  // Top 3 districts
  districts.slice(0, 3).forEach(d => {
    if (d.total > 0) parts.push(`${d.name}：<span>${d.total}</span> 户`);
  });
  if (otherData.total > 0) parts.push(`市外客户：<span>${otherData.total}</span> 户`);
  parts.push(`系统开发：宜都华晟达洲比亚迪 · 技术支持：Trae AI`);

  document.getElementById('tvTickerText').innerHTML = parts.join(' &nbsp;|&nbsp; ');
}

function initTV() {
  if (!tvChart) {
    tvChart = echarts.init(document.getElementById('tvMap'));
    window.addEventListener('resize', () => tvChart && tvChart.resize());
  }
  echarts.registerMap('yichang', data.districtGeo);
  renderTVOverview();
  renderTVRankList();
}

function renderTVOverview() {
  const dd = getRangeDistrictData();
  const names = data.districtNames || [];
  const districts = names.map(name => ({ name, value: (dd[name]||{}).total||0, vip: (dd[name]||{}).vip||0 }));
  const otherData = dd['其他'] || {total:0, vip:0};
  const grandTotal = districts.reduce((s,d) => s+d.value, 0) + otherData.total;
  const grandVIP = districts.reduce((s,d) => s+d.vip, 0) + otherData.vip;

  document.getElementById('tvMapTitle').textContent = '客户分布 - ' + getRangeLabel();
  renderTVStatsAnimated(grandTotal, grandVIP);
  updateTicker();

  const maxVal = Math.max(...districts.map(d=>d.value), 1);
  const seriesData = districts.map(d => ({
    name: d.name, value: d.value, vip: d.vip,
    itemStyle: { areaColor: getColorForValue(d.value, maxVal), borderColor: '#2a4a7f', borderWidth: 1 },
    label: { show: true, formatter: '{b}', color: '#0a1929', fontSize: 12, fontWeight: 'bold', textBorderColor: '#fff', textBorderWidth: 2 }
  }));

  tvChart.setOption({
    geo: {
      map: 'yichang', roam: true, zoom: 1.2, silent: true,
      itemStyle: { areaColor: 'transparent', borderColor: 'transparent' },
      label: { show: false }
    },
    tooltip: {
      trigger: 'item', backgroundColor: 'rgba(10,14,26,0.95)', borderColor: '#1e3a5f', textStyle: { color: '#e0e7ff', fontSize: 13 },
      formatter: function(p) {
        const d = p.data||{}; const vip=d.vip||0, total=d.value||0;
        const rate = total>0?(vip/total*100).toFixed(1):0;
        return `<b>${p.name}</b><br/>客户总数: ${total} 户<br/>VIP客户: ${vip} 户<br/>普通客户: ${total-vip} 户<br/>VIP占比: ${rate}%<br/><span style="color:#3b82f6">点击查看街道分布</span>`;
      }
    },
    series: [{
      type: 'map', map: 'yichang', roam: true, zoom: 1.2,
      label: { show: true, formatter: '{b}', color: '#0a1929', fontSize: 12, fontWeight: 'bold', textBorderColor: '#fff', textBorderWidth: 2 },
      labelLayout: { hideOverlap: false },
      itemStyle: { borderColor: '#2a4a7f', borderWidth: 1 },
      emphasis: { label: { show: true, formatter: '{b}', color: '#fff', fontSize: 14, fontWeight: 'bold', textBorderColor: '#1e3a5f', textBorderWidth: 2 }, itemStyle: { areaColor: '#3b82f6' } },
      data: seriesData,
      // Auto highlight effect - cycle through districts
      animation: true, animationDuration: 800, animationDurationUpdate: 500, animationEasing: 'cubicOut'
    }, {
      // Effect scatter for pulsing dots on districts with data
      type: 'effectScatter',
      coordinateSystem: 'geo',
      rippleEffect: { brushType: 'stroke', scale: 3, period: 4 },
      symbolSize: function(val) { return Math.max(Math.sqrt(val[2]) * 2, 6); },
      itemStyle: { color: '#3b82f6', shadowBlur: 10, shadowColor: 'rgba(59,130,246,0.5)' },
      data: [],
      zlevel: 2
    }]
  }, true);

  tvChart.off('click');
  tvChart.on('click', function(params) {
    if (params.name) {
      drillToDistrict(params.name);
    }
  });
}

function drillToDistrict(districtName) {
  currentDrillDistrict = districtName;
  document.getElementById('tvMapTitle').textContent = '客户分布 - ' + districtName + ' - ' + getRangeLabel();
  document.getElementById('tvBackBtn').style.display = 'inline-block';

  const streetGeo = getStreetsGeo(districtName);
  if (!streetGeo) return;
  const mapName = 'street_' + districtName;
  echarts.registerMap(mapName, streetGeo);

  const sd = getRangeStreetData(districtName);
  const streets = streetGeo.features.map(f => {
    const sName = f.properties.name;
    const s = sd[sName] || {total:0, vip:0};
    return { name: sName, value: s.total, vip: s.vip };
  });
  const maxVal = Math.max(...streets.map(s=>s.value), 1);
  const seriesData = streets.map(s => ({
    name: s.name, value: s.value, vip: s.vip,
    itemStyle: { areaColor: getColorForValue(s.value, maxVal), borderColor: '#2a4a7f', borderWidth: 1 },
    label: { show: true, formatter: '{b}', color: '#0a1929', fontSize: 11, fontWeight: 'bold', textBorderColor: '#fff', textBorderWidth: 2 }
  }));

  tvChart.setOption({
    tooltip: {
      trigger: 'item', backgroundColor: 'rgba(10,14,26,0.95)', borderColor: '#1e3a5f', textStyle: { color: '#e0e7ff', fontSize: 13 },
      formatter: function(p) {
        const d = p.data||{}; const vip=d.vip||0, total=d.value||0;
        const rate = total>0?(vip/total*100).toFixed(1):0;
        return `<b>${p.name}</b><br/>客户总数: ${total} 户<br/>VIP客户: ${vip} 户<br/>VIP占比: ${rate}%`;
      }
    },
    series: [{
      type: 'map', map: mapName, roam: true, zoom: 1.2,
      label: { show: true, formatter: '{b}', color: '#0a1929', fontSize: 11, fontWeight: 'bold', textBorderColor: '#fff', textBorderWidth: 2 },
      labelLayout: { hideOverlap: false },
      itemStyle: { borderColor: '#2a4a7f', borderWidth: 1 },
      emphasis: { label: { show: true, formatter: '{b}', color: '#fff', fontSize: 13, fontWeight: 'bold', textBorderColor: '#1e3a5f', textBorderWidth: 2 }, itemStyle: { areaColor: '#3b82f6' } },
      data: seriesData
    }]
  }, true);

  // Re-register click handler: clicking a street shows street customer detail
  tvChart.off('click');
  tvChart.on('click', function(params) {
    if (params.name) {
      showStreetDetailTV(districtName, params.name);
    }
  });

  renderTVDetailPanel(districtName);
}

// Show customer detail for a specific street in TV view
function showStreetDetailTV(districtName, streetName) {
  tvChart.dispatchAction({ type: 'highlight', name: streetName });
  document.getElementById('tvMapTitle').textContent = streetName + ' - 客户明细 - ' + getRangeLabel();

  const sd = getRangeStreetData(districtName);
  const sInfo = sd[streetName] || {total:0, vip:0};
  const allCustomers = getRangeCustomerList(districtName);
  const streetCustomers = allCustomers.filter(c => c.street === streetName);

  let customerHtml = '';
  streetCustomers.forEach((c, i) => {
    const vipBadge = c.vip === 1 ? '<span class="tv-cust-vip">VIP</span>' : '<span class="tv-cust-normal">普通</span>';
    const monthLabel = c.month ? c.month.replace('-', '年') + '月' : '';
    customerHtml += `<div class="tv-cust-row">
      <span class="tv-cust-name">${c.name || '未署名'}</span>
      <span class="tv-cust-addr">${c.detail || ''}</span>
      <span class="tv-cust-month">${monthLabel}</span>
      ${vipBadge}
    </div>`;
  });

  document.getElementById('tvPanel').innerHTML = `
    <div class="tv-detail-card">
      <div class="tv-detail-name">${streetName}</div>
      <div class="tv-detail-grid">
        <div class="tv-detail-stat"><div class="label">客户总数</div><div class="value" style="color:#3b82f6">${sInfo.total}</div></div>
        <div class="tv-detail-stat"><div class="label">VIP客户</div><div class="value" style="color:#10b981">${sInfo.vip}</div></div>
        <div class="tv-detail-stat"><div class="label">普通客户</div><div class="value" style="color:#06b6d4">${sInfo.total-sInfo.vip}</div></div>
        <div class="tv-detail-stat"><div class="label">所属区县</div><div class="value" style="color:#f59e0b;font-size:14px">${districtName}</div></div>
      </div>
      <div style="margin-top:20px">
        <div style="font-size:14px;font-weight:600;margin-bottom:8px;color:#e0e7ff">客户明细 (${streetCustomers.length} 户)</div>
        <div class="tv-cust-list">${customerHtml || '<div style="color:#6b7280;font-size:13px;">暂无客户记录</div>'}</div>
      </div>
    </div>
  `;
}

function showOtherDetailTV() {
  currentDrillDistrict = '其他';
  document.getElementById('tvMapTitle').textContent = '客户分布 - 其他 (市外) - ' + getRangeLabel();
  document.getElementById('tvBackBtn').style.display = 'inline-block';
  // Clear the map and show a placeholder message
  tvChart.setOption({
    title: { text: '市外客户\n（无街道地图数据）', left: 'center', top: 'center', textStyle: { color: '#6b7280', fontSize: 16, fontWeight: 'normal' } },
    series: []
  }, true);
  renderTVDetailPanel('其他');
}

function backToOverview() {
  // If currently viewing a street detail, go back to district view
  const title = document.getElementById('tvMapTitle').textContent;
  if (currentDrillDistrict && currentDrillDistrict !== '其他' && !title.includes('客户分布 - ' + currentDrillDistrict)) {
    drillToDistrict(currentDrillDistrict);
    return;
  }
  // Otherwise go back to city overview
  currentDrillDistrict = null;
  document.getElementById('tvMapTitle').textContent = '客户分布 - ' + getRangeLabel();
  document.getElementById('tvBackBtn').style.display = 'none';
  renderTVOverview();
  renderTVRankList();
}

function renderTVRankList() {
  const dd = getRangeDistrictData();
  const names = data.districtNames || [];
  const districts = names.map(name => ({ name, total: (dd[name]||{}).total||0, vip: (dd[name]||{}).vip||0 })).sort((a,b) => b.total - a.total);
  // Append "其他" at the end
  const otherData = dd['其他'] || {total:0, vip:0};
  districts.push({ name: '其他', total: otherData.total, vip: otherData.vip, isOther: true });
  const maxVal = Math.max(...districts.map(d=>d.total), 1);

  let html = '';
  districts.forEach((d,i) => {
    const pct = (d.total/maxVal*100).toFixed(0);
    const colors = ['#ef4444','#f59e0b','#3b82f6','#06b6d4','#10b981','#8b5cf6'];
    const color = d.isOther ? '#6b7280' : (colors[i%colors.length]);
    const clickAttr = d.isOther ? `onclick="showOtherDetailTV()" style="cursor:pointer"` : `onclick="drillToDistrict('${d.name}')" style="cursor:pointer"`;
    html += `<div class="tv-rank-bar clickable" ${clickAttr}><div class="row">
      <span class="name" style="color:${d.isOther?'#6b7280':(i<3?color:'#6b7280')};font-weight:${d.isOther?'bold':(i<3?'bold':'normal')}">${i+1}. ${d.name}${d.isOther?' (市外)':''}</span>
      <div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <span class="val">${d.total}</span>
    </div></div>`;
  });
  document.getElementById('tvPanel').innerHTML = `<div class="tv-panel-title">各区县客户排名 - ${getRangeLabel()}</div>${html}`;
}

function renderTVDetailPanel(districtName) {
  const dd = getRangeDistrictData();
  const dInfo = dd[districtName] || {total:0, vip:0};
  const sd = getRangeStreetData(districtName);
  const streets = Object.entries(sd).map(([name,d]) => ({name, total:d.total, vip:d.vip})).sort((a,b) => b.total-a.total);
  const rate = dInfo.total > 0 ? (dInfo.vip/dInfo.total*100).toFixed(1) : '0.0';

  let streetHtml = '';
  streets.slice(0,10).forEach((s,i) => {
    const maxS = streets[0]?streets[0].total:1;
    const pct = (s.total/maxS*100).toFixed(0);
    streetHtml += `<div class="tv-rank-bar"><div class="row">
      <span class="name">${i+1}. ${s.name}</span>
      <div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${i<3?'#06b6d4':'#3b82f6'}"></div></div>
      <span class="val">${s.total}</span>
    </div></div>`;
  });

  // Collect customer records for this district
  const customers = getRangeCustomerList(districtName);
  let customerHtml = '';
  customers.forEach((c, i) => {
    const vipBadge = c.vip === 1 ? '<span class="tv-cust-vip">VIP</span>' : '<span class="tv-cust-normal">普通</span>';
    const monthLabel = c.month ? c.month.replace('-', '年') + '月' : '';
    customerHtml += `<div class="tv-cust-row">
      <span class="tv-cust-name">${c.name || '未署名'}</span>
      <span class="tv-cust-addr">${c.street || ''} ${c.detail || ''}</span>
      <span class="tv-cust-month">${monthLabel}</span>
      ${vipBadge}
    </div>`;
  });

  document.getElementById('tvPanel').innerHTML = `
    <div class="tv-detail-card">
      <div class="tv-detail-name">${districtName}</div>
      <div class="tv-detail-grid">
        <div class="tv-detail-stat"><div class="label">客户总数</div><div class="value" style="color:#3b82f6">${dInfo.total}</div></div>
        <div class="tv-detail-stat"><div class="label">VIP客户</div><div class="value" style="color:#10b981">${dInfo.vip}</div></div>
        <div class="tv-detail-stat"><div class="label">普通客户</div><div class="value" style="color:#06b6d4">${dInfo.total-dInfo.vip}</div></div>
        <div class="tv-detail-stat"><div class="label">VIP占比</div><div class="value" style="color:#f59e0b">${rate}%</div></div>
      </div>
      <div style="margin-top:16px">
        <div style="font-size:14px;font-weight:600;margin-bottom:8px;color:#e0e7ff">街道客户分布 TOP10 - ${getRangeLabel()}</div>
        ${streetHtml || '<div style="color:#6b7280;font-size:13px;">暂无街道数据</div>'}
      </div>
      <div style="margin-top:20px">
        <div style="font-size:14px;font-weight:600;margin-bottom:8px;color:#e0e7ff">客户明细 (${customers.length} 户) - ${getRangeLabel()}</div>
        <div class="tv-cust-list">${customerHtml || '<div style="color:#6b7280;font-size:13px;">暂无客户记录</div>'}</div>
      </div>
    </div>
  `;
}

function getRangeCustomerList(district) {
  if (!data.addressDetails) return [];
  let months;
  if (currentMonth === 'all') {
    months = Object.keys(data.addressDetails).sort().reverse();
  } else {
    months = [currentMonth];
  }
  const customers = [];
  months.forEach(m => {
    const items = data.addressDetails[m] || [];
    // Reverse within each month too (latest entries first)
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.district === district) {
        customers.push({ name: item.name, street: item.street, detail: item.detail, vip: item.vip, month: m });
      }
    }
  });
  return customers;
}

// ========== Mobile View ==========
function initMobile() {
  if (!mobileChart) {
    mobileChart = echarts.init(document.getElementById('mobileMap'));
    window.addEventListener('resize', () => mobileChart && mobileChart.resize());
  }
  echarts.registerMap('yichang', data.districtGeo);

  const dd = getRangeDistrictData();
  const names = data.districtNames || [];
  const districts = names.map(name => ({ name, total: (dd[name]||{}).total||0, vip: (dd[name]||{}).vip||0 }));
  const otherData = dd['其他'] || {total:0, vip:0};
  const grandTotal = districts.reduce((s,d) => s+d.total, 0) + otherData.total;
  const grandVIP = districts.reduce((s,d) => s+d.vip, 0) + otherData.vip;

  document.getElementById('mobileStats').innerHTML = `
    <div class="mobile-stat-card"><div class="label">客户总数</div><div class="value">${grandTotal.toLocaleString()}</div></div>
    <div class="mobile-stat-card"><div class="label">VIP客户</div><div class="value" style="color:#10b981">${grandVIP.toLocaleString()}</div></div>
    <div class="mobile-stat-card"><div class="label">VIP占比</div><div class="value" style="color:#f59e0b">${grandTotal>0?(grandVIP/grandTotal*100).toFixed(1):'0.0'}%</div></div>
  `;
  document.getElementById('mobileMapTitle').textContent = '宜昌市客户分布 - ' + getRangeLabel();

  const maxVal = Math.max(...districts.map(d=>d.total), 1);
  const seriesData = districts.map(d => ({
    name: d.name, value: d.total, vip: d.vip,
    itemStyle: { areaColor: getColorForValue(d.total, maxVal), borderColor: '#cbd5e1', borderWidth: 0.5 },
    label: { show: true, formatter: '{b}', color: '#0a1929', fontSize: 10, fontWeight: 'bold', textBorderColor: '#fff', textBorderWidth: 2 }
  }));

  mobileChart.setOption({
    tooltip: { trigger: 'item', formatter: p => `<b>${p.name}</b><br/>客户: ${p.value||0} 户<br/>VIP: ${p.data?.vip||0} 户<br/>点击查看详情` },
    series: [{
      type: 'map', map: 'yichang', roam: true, zoom: 1.2,
      label: { show: true, formatter: '{b}', color: '#0a1929', fontSize: 10, fontWeight: 'bold', textBorderColor: '#fff', textBorderWidth: 2 },
      labelLayout: { hideOverlap: false },
      itemStyle: { borderColor: '#cbd5e1', borderWidth: 0.5 },
      emphasis: { label: { show: true, formatter: '{b}', color: '#fff', fontSize: 12, fontWeight: 'bold', textBorderColor: '#1e3a5f', textBorderWidth: 2 }, itemStyle: { areaColor: '#3b82f6' } },
      data: seriesData
    }]
  }, true);

  mobileChart.off('click');
  mobileChart.on('click', function(params) {
    if (params.name) showMobileDetail(params.name);
  });
  renderMobileRankList();
}

function renderMobileRankList() {
  const dd = getRangeDistrictData();
  const names = data.districtNames || [];
  const districts = names.map(name => ({ name, total: (dd[name]||{}).total||0, vip: (dd[name]||{}).vip||0 })).sort((a,b) => b.total-a.total);
  // Append "其他" at the end
  const otherData = dd['其他'] || {total:0, vip:0};
  districts.push({ name: '其他', total: otherData.total, vip: otherData.vip, isOther: true });
  const maxTotal = Math.max(...districts.map(d=>d.total), 1);

  document.getElementById('mobilePanelTitle').textContent = '各区县客户排名 - ' + getRangeLabel();
  document.getElementById('mobileRankList').innerHTML = districts.map((d,i) => {
    const barW = (d.total/maxTotal*100).toFixed(1);
    const vipPct = d.total>0?(d.vip/d.total*100).toFixed(1):'0.0';
    const label = d.isOther ? `${i+1}. 其他 (市外)` : `${i+1}. ${d.name}`;
    const clickAttr = `onclick="showMobileDetail('${d.name}')"`;
    return `<div class="mobile-street-row" ${clickAttr} style="padding:10px 0;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='transparent'"><div style="flex:1;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="name" style="font-weight:${d.isOther?'bold':'600'};color:${d.isOther?'#6b7280':'inherit'};">${label}</span>
        <span class="val" style="font-size:12px;">${d.total}户 · VIP ${d.vip} (${vipPct}%)</span>
      </div>
      <div style="margin-top:4px;height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${barW}%;background:${d.isOther?'linear-gradient(90deg,#9ca3af,#d1d5db)':'linear-gradient(90deg,#3b82f6,#60a5fa)'};border-radius:3px;"></div>
      </div>
    </div></div>`;
  }).join('');
  document.getElementById('mobileDetailContent').style.display = 'none';
  document.getElementById('mobileRankList').parentElement.style.display = 'block';
}

function showMobileDetail(districtName) {
  currentDrillDistrict = districtName;
  document.getElementById('mobileMapTitle').textContent = '客户分布 - ' + districtName + ' - ' + getRangeLabel();
  document.getElementById('mobileBackBtn').style.display = 'inline-block';

  const streetGeo = getStreetsGeo(districtName);

  if (streetGeo) {
    const mapName = 'street_' + districtName;
    echarts.registerMap(mapName, streetGeo);
    const sd = getRangeStreetData(districtName);
    const streets = streetGeo.features.map(f => {
      const sName = f.properties.name;
      const s = sd[sName] || {total:0, vip:0};
      return { name: sName, value: s.total, vip: s.vip };
    });
    const maxVal = Math.max(...streets.map(s=>s.value), 1);
    mobileChart.setOption({
      tooltip: { trigger: 'item', formatter: p => `<b>${p.name}</b><br/>客户: ${p.value||0} 户<br/>VIP: ${p.data?.vip||0} 户` },
      series: [{
        type: 'map', map: mapName, roam: true, zoom: 1.2,
        label: { show: true, formatter: '{b}', color: '#0a1929', fontSize: 10, fontWeight: 'bold', textBorderColor: '#fff', textBorderWidth: 2 },
        labelLayout: { hideOverlap: false },
        itemStyle: { borderColor: '#cbd5e1', borderWidth: 0.5 },
        emphasis: { label: { show: true, formatter: '{b}', color: '#fff', fontSize: 12, fontWeight: 'bold', textBorderColor: '#1e3a5f', textBorderWidth: 2 }, itemStyle: { areaColor: '#3b82f6' } },
        data: streets.map(s => ({ name: s.name, value: s.value, vip: s.vip, itemStyle: { areaColor: getColorForValue(s.value, maxVal) } }))
      }]
    }, true);
    // Re-register click handler: clicking a street shows street customer detail
    mobileChart.off('click');
    mobileChart.on('click', function(params) {
      if (params.name) {
        showStreetCustomerDetail(districtName, params.name);
      }
    });
  }

  const dd = getRangeDistrictData();
  const dInfo = dd[districtName] || {total:0, vip:0};
  const sd = getRangeStreetData(districtName);
  const streetList = Object.entries(sd).map(([name,d]) => ({name, total:d.total, vip:d.vip})).sort((a,b) => b.total-a.total);
  const rate = dInfo.total>0?(dInfo.vip/dInfo.total*100).toFixed(1):'0.0';

  document.getElementById('mobilePanelTitle').textContent = districtName + ' - 街道详情 - ' + getRangeLabel();
  
  // Collect customer records
  const customers = getRangeCustomerList(districtName);
  let customerHtml = '';
  customers.forEach(c => {
    const vipBadge = c.vip === 1 ? '<span style="font-size:10px;color:#10b981;font-weight:700;border:1px solid rgba(16,185,129,0.3);border-radius:4px;padding:1px 6px;">VIP</span>' : '';
    const monthLabel = c.month ? c.month.replace('-', '年') + '月' : '';
    customerHtml += `<div class="mobile-street-row"><div style="flex:1;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="name" style="font-weight:600;">${c.name || '未署名'}</span>
        ${vipBadge}
      </div>
      <div style="font-size:11px;color:var(--mobile-dim);margin-top:2px;">${c.street || ''} ${c.detail || ''}</div>
      <div style="font-size:10px;color:#9ca3af;margin-top:1px;">${monthLabel}</div>
    </div></div>`;
  });

  document.getElementById('mobileRankList').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div class="mobile-detail-stat" style="background:var(--mobile-bg);border-radius:8px;padding:8px;text-align:center;"><div style="font-size:10px;color:var(--mobile-dim);">客户总数</div><div style="font-size:16px;font-weight:700;color:#3b82f6">${dInfo.total}</div></div>
      <div class="mobile-detail-stat" style="background:var(--mobile-bg);border-radius:8px;padding:8px;text-align:center;"><div style="font-size:10px;color:var(--mobile-dim);">VIP客户</div><div style="font-size:16px;font-weight:700;color:#10b981">${dInfo.vip}</div></div>
    </div>
    <div style="font-size:13px;font-weight:600;margin:12px 0 8px;color:var(--mobile-text);">街道客户分布</div>
    <div class="mobile-street-list">
      ${streetList.length > 0 ? streetList.map(s => `<div class="mobile-street-row" style="cursor:pointer;" onclick="showStreetCustomerDetail('${districtName}','${s.name}')"><span class="name">${s.name}</span><span class="val">${s.total}户 (VIP ${s.vip})</span></div>`).join('') : '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:16px;">暂无街道数据</div>'}
    </div>
    <div style="font-size:13px;font-weight:600;margin:16px 0 8px;color:var(--mobile-text);">客户明细 (${customers.length} 户)</div>
    <div class="mobile-street-list" style="max-height:400px;overflow-y:auto;">
      ${customerHtml || '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:16px;">暂无客户记录</div>'}
    </div>
  `;
}

// Show customer detail for a specific street within a district
function showStreetCustomerDetail(districtName, streetName) {
  // Highlight the clicked street on the map
  mobileChart.dispatchAction({ type: 'highlight', name: streetName });
  
  document.getElementById('mobileMapTitle').textContent = streetName + ' - 客户明细 - ' + getRangeLabel();

  // Get street data
  const sd = getRangeStreetData(districtName);
  const sInfo = sd[streetName] || {total:0, vip:0};

  // Get customers in this specific street
  const allCustomers = getRangeCustomerList(districtName);
  const streetCustomers = allCustomers.filter(c => c.street === streetName);

  let customerHtml = '';
  streetCustomers.forEach(c => {
    const vipBadge = c.vip === 1 ? '<span style="font-size:10px;color:#10b981;font-weight:700;border:1px solid rgba(16,185,129,0.3);border-radius:4px;padding:1px 6px;">VIP</span>' : '';
    const monthLabel = c.month ? c.month.replace('-', '年') + '月' : '';
    customerHtml += `<div class="mobile-street-row"><div style="flex:1;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="name" style="font-weight:600;">${c.name || '未署名'}</span>
        ${vipBadge}
      </div>
      <div style="font-size:11px;color:var(--mobile-dim);margin-top:2px;">${c.detail || ''}</div>
      <div style="font-size:10px;color:#9ca3af;margin-top:1px;">${monthLabel}</div>
    </div></div>`;
  });

  document.getElementById('mobilePanelTitle').textContent = streetName + ' - 客户明细 - ' + getRangeLabel();
  document.getElementById('mobileRankList').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div class="mobile-detail-stat" style="background:var(--mobile-bg);border-radius:8px;padding:8px;text-align:center;"><div style="font-size:10px;color:var(--mobile-dim);">客户总数</div><div style="font-size:16px;font-weight:700;color:#3b82f6">${sInfo.total}</div></div>
      <div class="mobile-detail-stat" style="background:var(--mobile-bg);border-radius:8px;padding:8px;text-align:center;"><div style="font-size:10px;color:var(--mobile-dim);">VIP客户</div><div style="font-size:16px;font-weight:700;color:#10b981">${sInfo.vip}</div></div>
    </div>
    <div style="font-size:13px;font-weight:600;margin:12px 0 8px;color:var(--mobile-text);">客户明细 (${streetCustomers.length} 户)</div>
    <div class="mobile-street-list" style="max-height:400px;overflow-y:auto;">
      ${customerHtml || '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:16px;">暂无客户记录</div>'}
    </div>
  `;
}

function mobileBackToOverview() {
  // If currently viewing a street detail, go back to district view
  const title = document.getElementById('mobileMapTitle').textContent;
  if (currentDrillDistrict && !title.includes('客户分布 - ' + currentDrillDistrict)) {
    showMobileDetail(currentDrillDistrict);
    return;
  }
  // Otherwise go back to city overview
  currentDrillDistrict = null;
  document.getElementById('mobileMapTitle').textContent = '宜昌市客户分布 - ' + getRangeLabel();
  document.getElementById('mobileBackBtn').style.display = 'none';
  initMobile();
}

// ========== Upload View ==========
function initUpload() {
  ensureCurrentMonth();
  populateDistrictSelect();
  renderQuickStats();
  renderCustomerList();
  const info = localStorage.getItem(UPDATE_KEY);
  if (info) { try { updateLastUpdate(JSON.parse(info)); } catch(e) {} }
}

// Auto-sync: saves to localStorage immediately, syncs to GitHub with debounce
let syncTimer = null;
function autoSync(updater) {
  // Save to localStorage immediately
  const slimData = { monthlyData: data.monthlyData, addressDetails: data.addressDetails || {} };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(slimData));
  // Broadcast to other tabs
  const info = { name: updater || '系统', time: new Date().toLocaleString('zh-CN', {hour12: false}) };
  localStorage.setItem(UPDATE_KEY, JSON.stringify(info));
  bc.postMessage({type: 'data_update', data: data, update: info});
  // Refresh views
  renderQuickStats();
  renderCustomerList();
  refreshCurrentView();
  // Debounced GitHub sync (2 second delay to avoid rapid-fire API calls)
  if (syncTimer) clearTimeout(syncTimer);
  setSyncStatus('connecting');
  syncTimer = setTimeout(() => {
    saveToGitHub(updater || '系统');
  }, 1500);
}

function renderQuickStats() {
  const month = getCurrentMonth();
  const dd = getMonthDistrictData(month);
  const names = data.districtNames || [];
  let totalAll = 0, vipAll = 0;
  names.forEach(n => { const d = dd[n] || {total:0,vip:0}; totalAll += d.total; vipAll += d.vip; });
  const otherD = dd['其他'] || {total:0,vip:0};
  totalAll += otherD.total; vipAll += otherD.vip;
  
  const el = document.getElementById('quickStats');
  if (!el) return;
  el.innerHTML = `
    <div style="flex:1;padding:12px 16px;background:#eff6ff;border-radius:10px;text-align:center;">
      <div style="font-size:24px;font-weight:700;color:#3b82f6;">${totalAll}</div>
      <div style="font-size:11px;color:#6b7280;">总客户</div>
    </div>
    <div style="flex:1;padding:12px 16px;background:#f0fdf4;border-radius:10px;text-align:center;">
      <div style="font-size:24px;font-weight:700;color:#10b981;">${vipAll}</div>
      <div style="font-size:11px;color:#6b7280;">VIP客户</div>
    </div>
    <div style="flex:1;padding:12px 16px;background:#fffbeb;border-radius:10px;text-align:center;">
      <div style="font-size:24px;font-weight:700;color:#f59e0b;">${totalAll - vipAll}</div>
      <div style="font-size:11px;color:#6b7280;">普通客户</div>
    </div>
    <div style="flex:1;padding:12px 16px;background:#f5f3ff;border-radius:10px;text-align:center;">
      <div style="font-size:14px;font-weight:600;color:#7c3aed;">${month.replace('-', '年')}月</div>
      <div style="font-size:11px;color:#6b7280;">当前月份</div>
    </div>
  `;
}

// Get current month string in YYYY-MM format
function getCurrentMonth() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

// Ensure current month exists in monthlyData with zero-initialized structure
function ensureCurrentMonth() {
  if (!data || !data.monthlyData) return;
  const now = new Date();
  const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  if (!data.monthlyData[currentMonth]) {
    data.monthlyData[currentMonth] = { districtData: {}, streetData: {} };
    const names = data.districtNames || [];
    names.forEach(d => {
      data.monthlyData[currentMonth].districtData[d] = { total: 0, vip: 0 };
      data.monthlyData[currentMonth].streetData[d] = {};
      (data.streetsByDistrict[d] || []).forEach(s => {
        data.monthlyData[currentMonth].streetData[d][s] = { total: 0, vip: 0 };
      });
    });
    data.monthlyData[currentMonth].districtData['其他'] = { total: 0, vip: 0 };
  }
}

function onUploadMonthChange() {
  renderQuickStats();
  renderCustomerList();
}

function populateDistrictSelect() {
  const sel = document.getElementById('addrDistrict');
  if (!sel) return;
  const names = data.districtNames || [];
  sel.innerHTML = '<option value="">选择区县</option>' + names.map(n => `<option value="${n}">${n}</option>`).join('');
}

function onAddrDistrictChange() {
  const dist = document.getElementById('addrDistrict').value;
  const streetSel = document.getElementById('addrStreet');
  if (!dist) { streetSel.innerHTML = '<option value="">选择街道/乡镇</option>'; return; }
  const streets = (data.streetsByDistrict || {})[dist] || [];
  streetSel.innerHTML = '<option value="">选择街道/乡镇</option>' + streets.map(s => `<option value="${s}">${s}</option>`).join('');
}

// ========== ID Card Smart Recognition ==========
function parseAndFillIdCard() {
  const rawText = document.getElementById('idCardInput').value.trim();
  if (!rawText) { showToast('请先粘贴身份证信息'); return; }

  // Normalize: unify colons, remove zero-width spaces
  const text = rawText.replace(/：/g, ':').replace(/[\u3000]/g, ' ');
  // Concatenate all text (remove newlines) for regex matching
  const fullText = text.replace(/[\n\r]+/g, '');

  // --- 1. Extract ID number (18 digits, last may be X) ---
  let idNumber = '';
  const idMatch = fullText.match(/\d{17}[\dXx]/);
  if (idMatch) idNumber = idMatch[0];

  // --- 2. Extract name (2-4 Chinese chars after 姓名, before keyword/digit/space/end) ---
  let name = '';
  const nameMatch = fullText.match(/姓名[:\s]*([\u4e00-\u9fa5]{2,4})(?=性别|民族|出生|住址|公民|号码|签发|有效|\d|\s|$)/);
  if (nameMatch) {
    name = nameMatch[1].trim();
  } else {
    // Fallback: take 2-4 chars after 姓名
    const simpleMatch = fullText.match(/姓名[:\s]*([\u4e00-\u9fa5]{2,4})/);
    if (simpleMatch) name = simpleMatch[1];
  }

  // --- 3. Extract gender ---
  let gender = '';
  const genderMatch = fullText.match(/性别[:\s]*([男女])/);
  if (genderMatch) gender = genderMatch[1];

  // Also infer gender from ID number (17th digit: odd=male, even=female)
  if (!gender && idNumber && idNumber.length === 18) {
    gender = parseInt(idNumber[16]) % 2 === 0 ? '女' : '男';
  }

  // --- 4. Extract birth date ---
  let birthMonth = '';
  const birthMatch = fullText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (birthMatch) {
    birthMonth = birthMatch[1] + '-' + birthMatch[2].padStart(2, '0');
  } else if (idNumber && idNumber.length === 18) {
    // Extract from ID number: digits 7-14 are YYYYMMDD
    birthMonth = idNumber.substring(6, 10) + '-' + idNumber.substring(10, 12);
  }

  // --- 5. Extract address ---
  // Strategy: remove all known values and keyword labels, what remains is the address
  let cleaned = fullText;

  // Remove ID number
  if (idNumber) cleaned = cleaned.replace(idNumber, '');

  // Remove name and label
  if (name) cleaned = cleaned.replace('姓名', '').replace(name, '');
  else cleaned = cleaned.replace(/姓名[:\s]*/g, '');

  // Remove birth date
  if (birthMatch) cleaned = cleaned.replace(birthMatch[0], '');

  // Remove any other date patterns
  cleaned = cleaned.replace(/\d{4}年\d{1,2}月\d{1,2}日/g, '');
  cleaned = cleaned.replace(/\d{4}-\d{1,2}-\d{1,2}/g, '');

  // Remove gender and ethnicity (non-greedy to avoid eating 出生 keyword)
  cleaned = cleaned.replace(/性别[:\s]*[男女]/g, '');
  cleaned = cleaned.replace(/民族[:\s]*[\u4e00-\u9fa5]{1,2}?(?=出生|住址|住\s|性别|公民|号码|签发|有效|\s|$)/g, '');

  // Remove keyword labels (handle "住 址" with space)
  cleaned = cleaned.replace(/公民身份号码/g, '');
  cleaned = cleaned.replace(/身份号码/g, '');
  cleaned = cleaned.replace(/号码/g, '');
  cleaned = cleaned.replace(/出生/g, '');
  cleaned = cleaned.replace(/住\s*址/g, '');  // matches both 住址 and 住 址
  cleaned = cleaned.replace(/签发机关/g, '');
  cleaned = cleaned.replace(/有效期限/g, '');

  // Remove any remaining digits and punctuation
  cleaned = cleaned.replace(/[\d\-\.\/年月日]/g, '');

  // Remove whitespace
  cleaned = cleaned.replace(/\s+/g, '');

  let address = cleaned.trim();

  // Fallback: if address empty, try extracting between 住址 and 公民身份号码
  if (!address) {
    const addrStart = fullText.search(/住\s*址/);
    const idStart = fullText.indexOf('公民身份');
    if (addrStart >= 0) {
      const addrEnd = fullText.indexOf('住', addrStart) + 1; // skip past 住
      const actualAddrStart = fullText.search(/住\s*址/) + fullText.substring(fullText.search(/住\s*址/)).indexOf('址') + 1;
      const end = idStart > actualAddrStart ? idStart : fullText.length;
      address = fullText.substring(actualAddrStart, end).replace(/[\s\n\r]/g, '').replace(/[\d\-\.\/年月日]/g, '').trim();
    }
  }

  // --- 6. Parse district and street from address ---
  const districtNames = data.districtNames || [];
  let matchedDistrict = '';
  let remainingAddr = address;

  // Match known district
  for (const d of districtNames) {
    if (address.includes(d)) {
      matchedDistrict = d;
      remainingAddr = address.substring(address.indexOf(d) + d.length);
      break;
    }
  }

  // Fallback: extract by pattern (XX市/XX区/XX县)
  if (!matchedDistrict) {
    remainingAddr = address.replace(/^.*?省/, '');
    const cityMatch = remainingAddr.match(/([\u4e00-\u9fa5]{2,4}(?:市|区|县))/);
    if (cityMatch) {
      matchedDistrict = cityMatch[1];
      remainingAddr = remainingAddr.substring(remainingAddr.indexOf(cityMatch[1]) + cityMatch[1].length);
    }
  }

  // Match known street
  const streets = matchedDistrict ? ((data.streetsByDistrict || {})[matchedDistrict] || []) : [];
  // Street name aliases: map common abbreviations to official names
  const streetAliases = {
    '陆城街办': '陆城街道',
    '陆城办事处': '陆城街道',
    '红花街办': '红花街道',
    '聂家街办': '聂家河街道',
  };
  let matchedStreet = '';
  let detailAddr = remainingAddr;

  for (const s of streets) {
    if (remainingAddr.includes(s)) {
      matchedStreet = s;
      detailAddr = remainingAddr.substring(remainingAddr.indexOf(s) + s.length);
      break;
    }
  }

  // Check aliases if no direct match
  if (!matchedStreet) {
    for (const [alias, official] of Object.entries(streetAliases)) {
      if (remainingAddr.includes(alias)) {
        // Verify the official name exists in streets list
        if (streets.includes(official)) {
          matchedStreet = official;
          detailAddr = remainingAddr.substring(remainingAddr.indexOf(alias) + alias.length);
          break;
        }
      }
    }
  }

  // Fallback: extract street by pattern (XX镇/XX乡/XX街道/XX街办)
  if (!matchedStreet && remainingAddr) {
    const townMatch = remainingAddr.match(/([\u4e00-\u9fa5]{2,6}(?:镇|乡|街道|街办))/);
    if (townMatch) {
      let townName = townMatch[1];
      // Normalize "街办" to "街道"
      if (townName.endsWith('街办')) {
        townName = townName.replace('街办', '街道');
      }
      matchedStreet = townName;
      detailAddr = remainingAddr.substring(remainingAddr.indexOf(townMatch[1]) + townMatch[1].length);
    }
  }

  // --- 6.5 Truncate detail address: village→村, city→路 ---
  if (detailAddr) {
    // If address contains 村 (village), keep only up to and including 村
    const villageIdx = detailAddr.indexOf('村');
    if (villageIdx >= 0) {
      detailAddr = detailAddr.substring(0, villageIdx + 1);
    } else {
      // City address: keep only up to 路/街/道/巷 (road name), remove numbers after
      const roadMatch = detailAddr.match(/^.*?[路街道巷]/);
      if (roadMatch) {
        detailAddr = roadMatch[0];
      }
    }
    detailAddr = detailAddr.replace(/[，。、,.;:：]+$/g, '').trim();
  }

  // --- 7. Fill the form ---
  if (name) {
    const nameInput = document.getElementById('addrName');
    if (nameInput) nameInput.value = name;
  }

  if (matchedDistrict) {
    const distSel = document.getElementById('addrDistrict');
    if (distSel) {
      let found = false;
      for (const opt of distSel.options) {
        if (opt.value === matchedDistrict) { found = true; break; }
      }
      if (found) {
        distSel.value = matchedDistrict;
        onAddrDistrictChange();
      }
    }
  }

  if (matchedStreet) {
    // Wait for street dropdown to populate (onAddrDistrictChange is synchronous)
    setTimeout(() => {
      const streetSel = document.getElementById('addrStreet');
      if (streetSel) {
        let found = false;
        for (const opt of streetSel.options) {
          if (opt.value === matchedStreet || opt.textContent === matchedStreet) { found = true; break; }
        }
        if (found) {
          streetSel.value = matchedStreet;
        } else {
          // Add as custom option
          const opt = document.createElement('option');
          opt.value = matchedStreet;
          opt.textContent = matchedStreet + ' (自动识别)';
          streetSel.appendChild(opt);
          streetSel.value = matchedStreet;
        }
      }
    }, 50);
  }

  if (detailAddr) {
    const detailInput = document.getElementById('addrDetail');
    if (detailInput) detailInput.value = detailAddr;
  }

  // Clear the textarea
  document.getElementById('idCardInput').value = '';

  // Show result
  let parts = [];
  if (name) parts.push('姓名:' + name);
  if (matchedDistrict) parts.push('区县:' + matchedDistrict);
  if (matchedStreet) parts.push('街道:' + matchedStreet);
  if (detailAddr) parts.push('地址:' + detailAddr);
  showToast('识别成功 ' + parts.join(' | '));
}

function addNewMonth() {
  const next = getNextMonth();
  if (data.monthlyData[next]) { showToast(getMonthLabel(next) + ' 已存在'); return; }
  const names = data.districtNames || [];
  data.monthlyData[next] = { districtData: {}, streetData: {} };
  names.forEach(d => {
    data.monthlyData[next].districtData[d] = { total: 0, vip: 0 };
    data.monthlyData[next].streetData[d] = {};
    (data.streetsByDistrict[d] || []).forEach(s => { data.monthlyData[next].streetData[d][s] = { total: 0, vip: 0 }; });
  });
  // Add "其他" for outside Yichang
  data.monthlyData[next].districtData['其他'] = { total: 0, vip: 0 };
  refreshMonthSelectors();
  document.getElementById('uploadMonthSelect').value = next;
  onUploadMonthChange();
  showToast('已新增 ' + getMonthLabel(next));
}

// ========== Customer Search & Edit ==========
let editingMonth = null;
let editingIndex = -1;

function searchExistingCustomer() {
  renderCustomerList();
}

function editAddressItem(month, index) {
  const items = data.addressDetails[month] || [];
  if (index < 0 || index >= items.length) return;
  const item = items[index];

  // Populate form
  document.getElementById('addrDistrict').value = item.district || '';
  onAddrDistrictChange();
  document.getElementById('addrStreet').value = item.street || '';
  document.getElementById('addrDetail').value = item.detail || '';
  document.getElementById('addrName').value = item.name || '';
  document.getElementById('addrVip').value = item.vip || 0;

  // Set edit mode
  editingMonth = month;
  editingIndex = index;

  // Update button text
  const addBtn = document.querySelector('button[onclick="addAddressItem()"]');
  if (addBtn) {
    addBtn.textContent = '更新';
    addBtn.setAttribute('onclick', 'updateAddressItem()');
    addBtn.style.background = '#f59e0b';
  }

  // Add cancel button if not exists
  if (!document.getElementById('cancelEditBtn')) {
    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'cancelEditBtn';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.style.cssText = 'padding:8px 16px;font-size:13px;margin-left:8px;';
    cancelBtn.textContent = '取消编辑';
    cancelBtn.onclick = cancelEdit;
    addBtn.parentNode.appendChild(cancelBtn);
  }

  // Switch to the month being edited
  if (month !== getCurrentMonth()) {
    // Show a note that we're editing from a different month
    showToast(`正在编辑 ${month.replace('-', '年')}月 的客户信息`);
  }

  // Clear search results
  document.getElementById('customerSearchInput').value = '';
  renderCustomerList();

  // Scroll to form
  document.querySelector('#addrDetail').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function updateAddressItem() {
  if (editingMonth === null || editingIndex < 0) {
    addAddressItem();
    return;
  }

  const dist = document.getElementById('addrDistrict').value;
  const street = document.getElementById('addrStreet').value;
  const detail = document.getElementById('addrDetail').value.trim();
  const name = document.getElementById('addrName').value.trim();
  const vip = parseInt(document.getElementById('addrVip').value);

  if (!dist) { showToast('请选择区县'); return; }
  if (!street) { showToast('请选择街道/乡镇'); return; }
  if (!detail) { showToast('请输入客户地址'); return; }

  const items = data.addressDetails[editingMonth] || [];
  if (editingIndex >= items.length) { showToast('客户记录不存在，请重新搜索'); cancelEdit(); return; }

  const oldItem = items[editingIndex];
  const oldVip = oldItem.vip;
  const oldDist = oldItem.district;
  const oldStreet = oldItem.street;

  // Update the item
  items[editingIndex] = { district: dist, street, detail, name, vip };

  // If district/street changed, recalculate the entire month's data
  if (oldDist !== dist || oldStreet !== street) {
    recalculateMonth(editingMonth);
  } else if (oldVip !== vip) {
    // Only VIP changed, adjust counts
    if (data.monthlyData[editingMonth] && data.monthlyData[editingMonth].districtData[dist]) {
      data.monthlyData[editingMonth].districtData[dist].vip += (vip === 1 ? 1 : -1);
    }
    if (data.monthlyData[editingMonth] && data.monthlyData[editingMonth].streetData[dist] && data.monthlyData[editingMonth].streetData[dist][street]) {
      data.monthlyData[editingMonth].streetData[dist][street].vip += (vip === 1 ? 1 : -1);
    }
  }

  // Exit edit mode
  cancelEdit();

  autoSync('编辑客户');
  showToast('客户信息已更新，数据自动同步中');
}

function cancelEdit() {
  editingMonth = null;
  editingIndex = -1;

  // Reset button
  const updateBtn = document.querySelector('button[onclick="updateAddressItem()"]');
  if (updateBtn) {
    updateBtn.textContent = '添加';
    updateBtn.setAttribute('onclick', 'addAddressItem()');
    updateBtn.style.background = '';
  }

  // Remove cancel button
  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) cancelBtn.remove();

  // Clear form
  document.getElementById('addrDetail').value = '';
  document.getElementById('addrName').value = '';
  document.getElementById('addrVip').value = '0';
}

function recalculateMonth(month) {
  if (!data.monthlyData[month]) return;
  const items = data.addressDetails[month] || [];
  const names = data.districtNames || [];
  names.forEach(d => {
    data.monthlyData[month].districtData[d] = { total: 0, vip: 0 };
    if (!data.monthlyData[month].streetData[d]) data.monthlyData[month].streetData[d] = {};
    (data.streetsByDistrict[d] || []).forEach(s => {
      data.monthlyData[month].streetData[d][s] = { total: 0, vip: 0 };
    });
  });
  if (!data.monthlyData[month].districtData['其他']) data.monthlyData[month].districtData['其他'] = { total: 0, vip: 0 };
  items.forEach(item => {
    if (!data.monthlyData[month].districtData[item.district]) data.monthlyData[month].districtData[item.district] = { total: 0, vip: 0 };
    data.monthlyData[month].districtData[item.district].total++;
    if (item.vip === 1) data.monthlyData[month].districtData[item.district].vip++;
    if (!data.monthlyData[month].streetData[item.district]) data.monthlyData[month].streetData[item.district] = {};
    if (!data.monthlyData[month].streetData[item.district][item.street]) data.monthlyData[month].streetData[item.district][item.street] = { total: 0, vip: 0 };
    data.monthlyData[month].streetData[item.district][item.street].total++;
    if (item.vip === 1) data.monthlyData[month].streetData[item.district][item.street].vip++;
  });
}

function addAddressItem() {
  const dist = document.getElementById('addrDistrict').value;
  const street = document.getElementById('addrStreet').value;
  const detail = document.getElementById('addrDetail').value.trim();
  const name = document.getElementById('addrName').value.trim();
  const vip = parseInt(document.getElementById('addrVip').value);
  const month = getCurrentMonth();

  if (!dist) { showToast('请选择区县'); return; }
  if (!street) { showToast('请选择街道/乡镇'); return; }
  if (!detail) { showToast('请输入客户地址'); return; }

  if (!data.addressDetails[month]) data.addressDetails[month] = [];
  data.addressDetails[month].push({ district: dist, street, detail, name, vip });

  // Auto-update counts
  if (!data.monthlyData[month]) data.monthlyData[month] = { districtData: {}, streetData: {} };
  if (!data.monthlyData[month].districtData[dist]) data.monthlyData[month].districtData[dist] = { total: 0, vip: 0 };
  if (!data.monthlyData[month].streetData[dist]) data.monthlyData[month].streetData[dist] = {};
  if (!data.monthlyData[month].streetData[dist][street]) data.monthlyData[month].streetData[dist][street] = { total: 0, vip: 0 };

  data.monthlyData[month].districtData[dist].total++;
  if (vip === 1) data.monthlyData[month].districtData[dist].vip++;
  data.monthlyData[month].streetData[dist][street].total++;
  if (vip === 1) data.monthlyData[month].streetData[dist][street].vip++;

  document.getElementById('addrDetail').value = '';
  document.getElementById('addrName').value = '';
  autoSync('添加客户');
  showToast('客户已添加，数据自动同步中');
}

// ========== Excel Batch Import ==========
function downloadExcelTemplate() {
  if (typeof XLSX === 'undefined') { showToast('Excel库加载中，请稍后重试'); return; }

  const districts = data.districtNames || [];
  const streetsByDistrict = data.streetsByDistrict || {};

  // Build a second sheet listing all valid districts/streets as reference
  const refRows = [];
  refRows.push(['区县', '可选街道/乡镇']);
  districts.forEach(d => {
    const streets = (streetsByDistrict[d] || []).join('、');
    refRows.push([d, streets]);
  });

  // Main sheet: template headers + 2 sample rows
  const tplRows = [
    ['区县', '街道/乡镇', '详细地址', '客户姓名', '是否VIP'],
    ['宜都市', '陆城街道', '清江大道168号', '张三', '是'],
    ['宜都市', '枝城镇', '城坡大道99号', '李四', '否']
  ];

  const wb = XLSX.utils.book_new();
  const wsTpl = XLSX.utils.aoa_to_sheet(tplRows);
  wsTpl['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 10 }];
  // Add data validation comment on header row
  if (!wsTpl['A1'].c) wsTpl['A1'].c = [];
  wsTpl['A1'].c.push({ a: '系统', t: '请填写13个区县之一，参考"区县街道参考表"' });
  XLSX.utils.book_append_sheet(wb, wsTpl, '客户信息模板');

  const wsRef = XLSX.utils.aoa_to_sheet(refRows);
  wsRef['!cols'] = [{ wch: 18 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsRef, '区县街道参考表');

  XLSX.writeFile(wb, '客户信息导入模板.xlsx');
  showToast('模板已下载，请按格式填写后上传');
}

function handleExcelUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (typeof XLSX === 'undefined') { showToast('Excel库加载中，请稍后重试'); return; }

  const statusEl = document.getElementById('importStatus');
  const previewEl = document.getElementById('importPreview');
  statusEl.textContent = '正在解析文件...';
  statusEl.style.color = '#3b82f6';
  previewEl.style.display = 'none';

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      processExcelRows(rows);
    } catch (err) {
      statusEl.textContent = '❌ 文件解析失败：' + err.message;
      statusEl.style.color = '#ef4444';
    }
  };
  reader.onerror = function() {
    statusEl.textContent = '❌ 文件读取失败';
    statusEl.style.color = '#ef4444';
  };
  reader.readAsArrayBuffer(file);
  event.target.value = ''; // reset so same file can be re-selected
}

function processExcelRows(rows) {
  const statusEl = document.getElementById('importStatus');
  const previewEl = document.getElementById('importPreview');

  if (rows.length < 2) {
    statusEl.textContent = '❌ 文件为空或只有表头，请填写客户数据后再上传';
    statusEl.style.color = '#ef4444';
    return;
  }

  // Detect header row (first row should contain "区县" or similar)
  let headerRow = rows[0].map(c => String(c).trim());
  let dataStart = 1;

  // If first row doesn't look like header, treat all as data
  if (!headerRow.some(h => h.includes('区县') || h.includes('街道') || h.includes('地址'))) {
    headerRow = ['区县', '街道/乡镇', '详细地址', '客户姓名', '是否VIP'];
    dataStart = 0;
  }

  // Map column indices
  const colMap = {};
  headerRow.forEach((h, i) => {
    if (h.includes('区县') || h.includes('区')) colMap.district = i;
    else if (h.includes('街道') || h.includes('乡镇') || h.includes('街道/乡镇')) colMap.street = i;
    else if (h.includes('详细地址') || h.includes('地址')) colMap.detail = i;
    else if (h.includes('姓名') || h.includes('客户')) colMap.name = i;
    else if (h.includes('VIP') || h.includes('vip') || h.includes('是否')) colMap.vip = i;
  });

  // Defaults if not found
  if (colMap.district === undefined) colMap.district = 0;
  if (colMap.street === undefined) colMap.street = 1;
  if (colMap.detail === undefined) colMap.detail = 2;
  if (colMap.name === undefined) colMap.name = 3;
  if (colMap.vip === undefined) colMap.vip = 4;

  const districts = data.districtNames || [];
  const streetsByDistrict = data.streetsByDistrict || {};
  const validRows = [];
  const invalidRows = [];

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    // Skip completely empty rows
    const hasData = row.some(c => String(c).trim() !== '');
    if (!hasData) continue;

    const district = String(row[colMap.district] || '').trim();
    const street = String(row[colMap.street] || '').trim();
    const detail = String(row[colMap.detail] || '').trim();
    const name = String(row[colMap.name] || '').trim();
    const vipRaw = String(row[colMap.vip] || '').trim().toLowerCase();

    const errors = [];
    if (!district) errors.push('区县为空');
    else if (!districts.includes(district)) errors.push(`区县"${district}"不在可选范围`);

    if (!street) errors.push('街道为空');
    else if (district && streetsByDistrict[district] && !streetsByDistrict[district].includes(street)) {
      errors.push(`街道"${street}"不属于${district}`);
    }

    if (!detail) errors.push('详细地址为空');

    let vip = 0;
    if (vipRaw === '是' || vipRaw === '1' || vipRaw === 'true' || vipRaw === 'vip') vip = 1;

    if (errors.length > 0) {
      invalidRows.push({ row: i + 1, district, street, detail, name, vip, errors });
    } else {
      validRows.push({ district, street, detail, name, vip });
    }
  }

  showImportPreview(validRows, invalidRows);
}

function showImportPreview(validRows, invalidRows) {
  const statusEl = document.getElementById('importStatus');
  const previewEl = document.getElementById('importPreview');

  const total = validRows.length + invalidRows.length;
  if (total === 0) {
    statusEl.textContent = '❌ 未检测到任何有效数据行';
    statusEl.style.color = '#ef4444';
    previewEl.style.display = 'none';
    return;
  }

  statusEl.textContent = `解析完成：✅ ${validRows.length} 条有效，❌ ${invalidRows.length} 条无效（共 ${total} 条）`;
  statusEl.style.color = validRows.length > 0 ? '#10b981' : '#ef4444';

  let html = '';

  if (validRows.length > 0) {
    html += `<div style="margin-bottom:12px;">
      <div style="font-size:13px;font-weight:600;color:#10b981;margin-bottom:6px;">✅ 有效数据预览（前5条）</div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f0fdf4;">
            <th style="border:1px solid #d1d5db;padding:6px;text-align:left;">区县</th>
            <th style="border:1px solid #d1d5db;padding:6px;text-align:left;">街道</th>
            <th style="border:1px solid #d1d5db;padding:6px;text-align:left;">详细地址</th>
            <th style="border:1px solid #d1d5db;padding:6px;text-align:left;">姓名</th>
            <th style="border:1px solid #d1d5db;padding:6px;text-align:left;">VIP</th>
          </tr></thead>
          <tbody>
            ${validRows.slice(0, 5).map(r => `
              <tr>
                <td style="border:1px solid #d1d5db;padding:6px;">${r.district}</td>
                <td style="border:1px solid #d1d5db;padding:6px;">${r.street}</td>
                <td style="border:1px solid #d1d5db;padding:6px;">${r.detail}</td>
                <td style="border:1px solid #d1d5db;padding:6px;">${r.name || '-'}</td>
                <td style="border:1px solid #d1d5db;padding:6px;">${r.vip === 1 ? '是' : '否'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${validRows.length > 5 ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;">...还有 ${validRows.length - 5} 条数据未显示</div>` : ''}
    </div>`;
  }

  if (invalidRows.length > 0) {
    html += `<div style="margin-bottom:12px;">
      <div style="font-size:13px;font-weight:600;color:#ef4444;margin-bottom:6px;">❌ 无效数据（前5条）</div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#fef2f2;">
            <th style="border:1px solid #d1d5db;padding:6px;">行号</th>
            <th style="border:1px solid #d1d5db;padding:6px;text-align:left;">区县</th>
            <th style="border:1px solid #d1d5db;padding:6px;text-align:left;">街道</th>
            <th style="border:1px solid #d1d5db;padding:6px;text-align:left;">地址</th>
            <th style="border:1px solid #d1d5db;padding:6px;text-align:left;">错误原因</th>
          </tr></thead>
          <tbody>
            ${invalidRows.slice(0, 5).map(r => `
              <tr>
                <td style="border:1px solid #d1d5db;padding:6px;">${r.row}</td>
                <td style="border:1px solid #d1d5db;padding:6px;">${r.district || '-'}</td>
                <td style="border:1px solid #d1d5db;padding:6px;">${r.street || '-'}</td>
                <td style="border:1px solid #d1d5db;padding:6px;">${r.detail || '-'}</td>
                <td style="border:1px solid #d1d5db;padding:6px;color:#ef4444;">${r.errors.join('；')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${invalidRows.length > 5 ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;">...还有 ${invalidRows.length - 5} 条错误未显示</div>` : ''}
    </div>`;
  }

  if (validRows.length > 0) {
    html += `<div style="display:flex;gap:8px;margin-top:8px;">
      <button class="btn-primary" style="padding:10px 28px;font-size:14px;" onclick="confirmExcelImport(${validRows.length})">✅ 确认导入 ${validRows.length} 条</button>
      <button class="btn-secondary" style="padding:10px 20px;font-size:14px;" onclick="cancelExcelImport()">取消</button>
    </div>`;
  }

  // Store valid rows for confirmation
  window._pendingExcelImport = validRows;
  previewEl.innerHTML = html;
  previewEl.style.display = 'block';
}

function confirmExcelImport(count) {
  const rows = window._pendingExcelImport || [];
  if (rows.length === 0) { showToast('没有可导入的数据'); return; }

  const month = getCurrentMonth();
  if (!data.addressDetails[month]) data.addressDetails[month] = [];
  if (!data.monthlyData[month]) data.monthlyData[month] = { districtData: {}, streetData: {} };

  let imported = 0;
  rows.forEach(row => {
    data.addressDetails[month].push({
      district: row.district,
      street: row.street,
      detail: row.detail,
      name: row.name,
      vip: row.vip
    });

    // Update counts
    if (!data.monthlyData[month].districtData[row.district]) data.monthlyData[month].districtData[row.district] = { total: 0, vip: 0 };
    if (!data.monthlyData[month].streetData[row.district]) data.monthlyData[month].streetData[row.district] = {};
    if (!data.monthlyData[month].streetData[row.district][row.street]) data.monthlyData[month].streetData[row.district][row.street] = { total: 0, vip: 0 };

    data.monthlyData[month].districtData[row.district].total++;
    if (row.vip === 1) data.monthlyData[month].districtData[row.district].vip++;
    data.monthlyData[month].streetData[row.district][row.street].total++;
    if (row.vip === 1) data.monthlyData[month].streetData[row.district][row.street].vip++;

    imported++;
  });

  autoSync('Excel导入');

  // Reset UI
  const statusEl = document.getElementById('importStatus');
  const previewEl = document.getElementById('importPreview');
  statusEl.textContent = `✅ 成功导入 ${imported} 条客户数据！数据已自动同步`;
  statusEl.style.color = '#10b981';
  previewEl.style.display = 'none';
  window._pendingExcelImport = null;

  showToast(`成功导入 ${imported} 条客户数据`);
}

function cancelExcelImport() {
  const statusEl = document.getElementById('importStatus');
  const previewEl = document.getElementById('importPreview');
  statusEl.textContent = '';
  previewEl.style.display = 'none';
  window._pendingExcelImport = null;
}

function renderCustomerList() {
  const list = document.getElementById('addressList');
  if (!list) return;
  const keyword = (document.getElementById('customerSearchInput')?.value || '').trim();
  const month = getCurrentMonth();
  const countEl = document.getElementById('customerCount');
  
  // Search across ALL months if keyword is present, otherwise show current month
  let items = [];
  if (keyword) {
    for (const [m, arr] of Object.entries(data.addressDetails || {})) {
      if (!Array.isArray(arr)) continue;
      arr.forEach((item, i) => {
        if (item.name && item.name.includes(keyword)) {
          items.push({ ...item, month: m, index: i });
        }
      });
    }
  } else {
    items = (data.addressDetails[month] || []).map((item, i) => ({ ...item, month, index: i }));
  }
  
  if (countEl) countEl.textContent = `(${items.length}条)`;
  
  if (items.length === 0) {
    list.innerHTML = `<div style="text-align:center;color:#9ca3af;font-size:13px;padding:24px;">${keyword ? '未找到匹配的客户' : '暂无客户，请在上方添加'}</div>`;
    return;
  }
  list.innerHTML = items.map(item => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px;background:#f9fafb;">
      <div style="flex:1;min-width:0;">
        <span style="font-weight:600;color:#1f2937;">${item.name || '未填写'}</span>
        ${item.vip === 1 ? '<span style="font-size:10px;color:#10b981;font-weight:700;border:1px solid rgba(16,185,129,0.3);border-radius:4px;padding:1px 6px;margin-left:6px;">VIP</span>' : ''}
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">${item.district} · ${item.street} · ${item.detail || ''}</div>
        ${keyword ? `<div style="font-size:10px;color:#9ca3af;margin-top:2px;">${item.month.replace('-', '年')}月</div>` : ''}
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;">
        <button style="border:none;background:transparent;color:#f59e0b;font-size:12px;cursor:pointer;padding:6px 10px;" onclick="editAddressItem('${item.month}', ${item.index})">编辑</button>
        <button style="border:none;background:transparent;color:#ef4444;font-size:12px;cursor:pointer;padding:6px 10px;" onclick="removeAddressItem('${item.month}', ${item.index})">删除</button>
      </div>
    </div>
  `).join('');
}

function removeAddressItem(month, index) {
  month = month || getCurrentMonth();
  const items = data.addressDetails[month] || [];
  if (index < 0 || index >= items.length) return;
  items.splice(index, 1);
  recalculateMonth(month);
  autoSync('删除客户');
  showToast('已删除客户，数据自动同步中');
}

function submitData() {
  autoSync('手动同步');
  showToast('数据已同步');
}

function resetData() {
  if (!confirm('确定要恢复为默认数据吗？所有月份数据将被清零。')) return;
  data.monthlyData = {};
  data.addressDetails = {};
  loadData();
  autoSync('系统重置');
  initUpload();
  showToast('已恢复默认数据');
}

// ========== View Routing ==========
function switchView(view) {
  currentView = view;
  detectedDevice = detectDevice();
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));

  if (view === 'upload') {
    document.getElementById('tvView').style.display = 'none';
    document.getElementById('mobileView').style.display = 'none';
    document.getElementById('uploadView').style.display = 'block';
    if (!checkAdminAuth()) {
      document.getElementById('adminLoginGate').style.display = 'block';
      document.getElementById('uploadContent').style.display = 'none';
    } else {
      initUpload();
    }
    setTimeout(() => parseEmojis(), 50);
  } else if (detectedDevice === 'mobile') {
    document.getElementById('tvView').style.display = 'none';
    document.getElementById('mobileView').style.display = 'block';
    document.getElementById('uploadView').style.display = 'none';
    setTimeout(() => { initMonthPickers(); initMobile(); }, 100);
  } else {
    document.getElementById('tvView').style.display = 'block';
    document.getElementById('mobileView').style.display = 'none';
    document.getElementById('uploadView').style.display = 'none';
    setTimeout(() => { initMonthPickers(); initTV(); }, 100);
  }
}

function refreshCurrentView() {
  if (currentView === 'upload') { if (isAdmin) initUpload(); return; }
  detectedDevice = detectDevice();
  if (detectedDevice === 'mobile') { initMobile(); }
  else {
    if (currentDrillDistrict) { drillToDistrict(currentDrillDistrict); }
    else { renderTVOverview(); renderTVRankList(); }
  }
}

// ========== Clock ==========
function updateClock() {
  const now = new Date();
  const days = ['日','一','二','三','四','五','六'];
  const el = document.getElementById('navClock');
  if (el) el.textContent = now.toLocaleString('zh-CN', {hour12: false}) + ' 星期' + days[now.getDay()];
}

// ========== Init ==========
loadData();
loadFromGitHub();
startPolling();

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', function(e) {
    e.preventDefault();
    location.hash = this.dataset.view;
    switchView(this.dataset.view);
  });
});

document.getElementById('tvBackBtn').addEventListener('click', backToOverview);
document.getElementById('mobileBackBtn').addEventListener('click', mobileBackToOverview);
document.getElementById('fullscreenBtn').addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
});

detectedDevice = detectDevice();
const hash = location.hash.replace('#', '') || 'tv';
switchView(hash);
updateClock();
setInterval(updateClock, 1000);

// Remove loading overlay
const loadingEl = document.getElementById('appLoading');
if (loadingEl) { loadingEl.style.opacity = '0'; loadingEl.style.transition = 'opacity 0.3s'; setTimeout(() => loadingEl.remove(), 300); }

window.addEventListener('hashchange', () => switchView(location.hash.replace('#', '') || 'tv'));

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const nd = detectDevice();
    if (nd !== detectedDevice && currentView !== 'upload') { detectedDevice = nd; switchView(currentView); }
    if (tvChart) tvChart.resize();
    if (mobileChart) mobileChart.resize();
  }, 200);
});

// ========== Twemoji: Convert emoji to SVG images for cross-platform support ==========
function parseEmojis() {
  if (typeof twemoji === 'undefined') return;
  twemoji.parse(document.body, { folder: 'svg', ext: '.svg', base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/' });
}

// Parse on load and watch for DOM changes
window.addEventListener('load', function() {
  setTimeout(function() {
    parseEmojis();
    if (typeof MutationObserver !== 'undefined') {
      var obs = new MutationObserver(function() {
        setTimeout(parseEmojis, 100);
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }, 200);
});