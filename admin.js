// ====== Admin Backend Application ======
const ADMIN_CONFIG = {
  dataUrl: 'data.json',
  pageSize: 20
};

let appData = null;
let allCustomers = [];
let filteredCustomers = [];
let currentPage = 1;
let charts = {};
let currentView = 'overview';

// ====== Init ======
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupSearch();
  setupSidebar();
  setupDataEntryForm();
  setupSettingsForm();
  await loadData();
});

// ====== Navigation ======
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      switchView(view);
    });
  });
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  const titles = { overview: '数据概览', customers: '客户列表', regions: '区域分布', add: '数据录入', settings: '系统设置' };
  document.getElementById('pageTitle').textContent = titles[view] || view;

  // Close sidebar on mobile
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('show');
    document.getElementById('overlay').classList.remove('show');
  }

  // Render the view
  if (view === 'overview') renderOverview();
  else if (view === 'customers') renderCustomers();
  else if (view === 'regions') renderRegions();
  else if (view === 'add') setupDataEntry();
  else if (view === 'settings') setupSettings();
}

// ====== Sidebar (mobile) ======
function setupSidebar() {
  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('show');
    document.getElementById('overlay').classList.toggle('show');
  });
  document.getElementById('overlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('show');
    document.getElementById('overlay').classList.remove('show');
  });
}

// ====== Load Data ======
async function loadData() {
  try {
    const resp = await fetch(ADMIN_CONFIG.dataUrl + '?t=' + Date.now());
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    appData = await resp.json();

    // Flatten addressDetails into customer list
    allCustomers = [];
    const addrDetails = appData.addressDetails || {};
    for (const [month, entries] of Object.entries(addrDetails)) {
      if (Array.isArray(entries)) {
        entries.forEach(e => {
          allCustomers.push({ ...e, month });
        });
      }
    }
    // Sort by month descending, then name
    allCustomers.sort((a, b) => (b.month || '').localeCompare(a.month || ''));

    setSyncStatus(true);
    renderOverview(); // initial view
  } catch (e) {
    console.error('Data load failed:', e);
    setSyncStatus(false);
  }
}

function setSyncStatus(online) {
  const dot = document.getElementById('syncDot');
  const text = document.getElementById('syncText');
  if (online) {
    dot.classList.remove('offline');
    text.textContent = '已同步';
  } else {
    dot.classList.add('offline');
    text.textContent = '离线';
  }
}

// ====== Helpers ======
function getCumulativeDistrictData() {
  const result = {};
  for (const md of Object.values(appData.monthlyData || {})) {
    for (const [name, d] of Object.entries(md.districtData || {})) {
      if (!result[name]) result[name] = { total: 0, vip: 0 };
      result[name].total += d.total || 0;
      result[name].vip += d.vip || 0;
    }
  }
  return result;
}

function getMonthlyTotals() {
  const result = {};
  for (const [month, md] of Object.entries(appData.monthlyData || {})) {
    let total = 0, vip = 0;
    for (const d of Object.values(md.districtData || {})) {
      total += d.total || 0;
      vip += d.vip || 0;
    }
    if (total > 0) result[month] = { total, vip };
  }
  return result;
}

function getYearlyTotals() {
  const monthly = getMonthlyTotals();
  const result = {};
  for (const [month, v] of Object.entries(monthly)) {
    const year = month.split('-')[0];
    if (!result[year]) result[year] = { total: 0, vip: 0 };
    result[year].total += v.total;
    result[year].vip += v.vip;
  }
  return result;
}

// ====== Overview View ======
function renderOverview() {
  if (!appData) return;

  const districtData = getCumulativeDistrictData();
  const monthly = getMonthlyTotals();
  const yearly = getYearlyTotals();

  const totalCustomers = Object.values(monthly).reduce((s, v) => s + v.total, 0);
  const totalVip = Object.values(monthly).reduce((s, v) => s + v.vip, 0);
  const districts = Object.keys(districtData).filter(k => k !== '其他' && districtData[k].total > 0);
  const monthCount = Object.keys(monthly).length;

  // Stats cards
  document.getElementById('statTotal').textContent = totalCustomers.toLocaleString();
  document.getElementById('statVip').textContent = totalVip.toLocaleString();
  document.getElementById('statDistricts').textContent = districts.length;
  document.getElementById('statMonths').textContent = monthCount;

  // Trends
  const months = Object.keys(monthly).sort();
  if (months.length >= 2) {
    const last = monthly[months[months.length - 1]];
    const prev = monthly[months[months.length - 2]];
    const change = last.total - prev.total;
    const pct = prev.total > 0 ? ((change / prev.total) * 100).toFixed(1) : '0';
    const el = document.getElementById('statTotalTrend');
    el.textContent = change >= 0 ? `↑ ${change} (${pct}%) 较上月` : `↓ ${Math.abs(change)} (${pct}%) 较上月`;
    el.className = 'trend ' + (change >= 0 ? 'up' : 'down');
  }

  // Last update
  if (appData.updated_at) {
    document.getElementById('statMonthsTrend').textContent = '更新: ' + new Date(appData.updated_at).toLocaleDateString('zh-CN');
  }

  // Trend chart
  renderTrendChart(monthly);
  // District pie chart
  renderDistrictChart(districtData);
  // Year comparison
  renderYearChart(yearly);
}

function renderTrendChart(monthly) {
  const el = document.getElementById('trendChart');
  if (!el) return;
  if (charts.trend) { charts.trend.dispose(); }
  charts.trend = echarts.init(el);

  const months = Object.keys(monthly).sort();
  const data = months.map(m => monthly[m].total);

  charts.trend.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: months, axisLabel: { fontSize: 10, rotate: 45 } },
    yAxis: { type: 'value' },
    series: [{
      name: '新增客户', type: 'bar', data: data,
      itemStyle: { color: '#1890ff', borderRadius: [4, 4, 0, 0] }
    }]
  });
}

function renderDistrictChart(districtData) {
  const el = document.getElementById('districtChart');
  if (!el) return;
  if (charts.district) { charts.district.dispose(); }
  charts.district = echarts.init(el);

  const data = Object.entries(districtData)
    .filter(([k]) => k !== '其他')
    .sort((a, b) => b[1].total - a[1].total);

  charts.district.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { type: 'scroll', orient: 'vertical', right: 5, top: 'center', textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie', radius: ['40%', '70%'],
      center: ['35%', '50%'],
      label: { show: false },
      data: data.map(([name, v]) => ({ name, value: v.total }))
    }]
  });
}

function renderYearChart(yearly) {
  const el = document.getElementById('yearChart');
  if (!el) return;
  if (charts.year) { charts.year.dispose(); }
  charts.year = echarts.init(el);

  const years = Object.keys(yearly).sort();
  const data = years.map(y => yearly[y].total);

  charts.year.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: years },
    yAxis: { type: 'value' },
    series: [{
      name: '年度客户', type: 'bar', data: data,
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#1890ff' }, { offset: 1, color: '#69c0ff' }
        ]),
        borderRadius: [4, 4, 0, 0]
      },
      label: { show: true, position: 'top', fontSize: 11 }
    }]
  });
}

// ====== Customer List View ======
function setupSearch() {
  document.getElementById('customerSearch').addEventListener('input', () => {
    currentPage = 1;
    renderCustomerTable();
  });
  document.getElementById('filterDistrict').addEventListener('change', () => {
    currentPage = 1;
    renderCustomerTable();
  });
  document.getElementById('filterMonth').addEventListener('change', () => {
    currentPage = 1;
    renderCustomerTable();
  });
}

function renderCustomers() {
  if (!appData) return;

  // Populate filters
  const districtSel = document.getElementById('filterDistrict');
  const monthSel = document.getElementById('filterMonth');
  if (districtSel.options.length <= 1) {
    const districts = new Set();
    allCustomers.forEach(c => c.district && districts.add(c.district));
    [...districts].sort().forEach(d => {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d;
      districtSel.appendChild(opt);
    });
  }
  if (monthSel.options.length <= 1) {
    const months = new Set();
    allCustomers.forEach(c => c.month && months.add(c.month));
    [...months].sort().reverse().forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      monthSel.appendChild(opt);
    });
  }

  renderCustomerTable();
}

function renderCustomerTable() {
  const search = document.getElementById('customerSearch').value.toLowerCase().trim();
  const fDistrict = document.getElementById('filterDistrict').value;
  const fMonth = document.getElementById('filterMonth').value;

  filteredCustomers = allCustomers.filter(c => {
    if (fDistrict && c.district !== fDistrict) return false;
    if (fMonth && c.month !== fMonth) return false;
    if (search) {
      const text = ((c.name || '') + (c.detail || '') + (c.district || '') + (c.street || '')).toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredCustomers.length / ADMIN_CONFIG.pageSize);
  if (currentPage > totalPages) currentPage = 1;
  const start = (currentPage - 1) * ADMIN_CONFIG.pageSize;
  const pageData = filteredCustomers.slice(start, start + ADMIN_CONFIG.pageSize);

  const tbody = document.getElementById('customerTableBody');
  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#999;">未找到匹配的客户</td></tr>';
  } else {
    tbody.innerHTML = pageData.map((c, i) => `
      <tr>
        <td>${start + i + 1}</td>
        <td>${c.name || '-'}</td>
        <td>${c.district || '-'}</td>
        <td>${c.street || '-'}</td>
        <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${c.detail || ''}">${c.detail || '-'}</td>
        <td><span class="vip-badge ${c.vip ? 'yes' : 'no'}">${c.vip ? 'VIP' : '普通'}</span></td>
        <td>${c.month || '-'}</td>
      </tr>
    `).join('');
  }

  // Pagination
  const pag = document.getElementById('pagination');
  if (totalPages <= 1) {
    pag.innerHTML = `<span class="page-info">共 ${filteredCustomers.length} 条</span>`;
  } else {
    let html = '';
    html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goPage(${currentPage - 1})">上一页</button>`;
    const maxButtons = 7;
    let s = Math.max(1, currentPage - 3);
    let e = Math.min(totalPages, s + maxButtons - 1);
    s = Math.max(1, e - maxButtons + 1);
    if (s > 1) { html += `<button class="page-btn" onclick="goPage(1)">1</button>`; if (s > 2) html += '<span class="page-info">...</span>'; }
    for (let i = s; i <= e; i++) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
    }
    if (e < totalPages) { if (e < totalPages - 1) html += '<span class="page-info">...</span>'; html += `<button class="page-btn" onclick="goPage(${totalPages})">${totalPages}</button>`; }
    html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goPage(${currentPage + 1})">下一页</button>`;
    html += `<span class="page-info">共 ${filteredCustomers.length} 条 / ${totalPages} 页</span>`;
    pag.innerHTML = html;
  }
}

function goPage(page) {
  currentPage = page;
  renderCustomerTable();
}

// ====== Regions View ======
let selectedRegionDistrict = '';

function renderRegions() {
  if (!appData) return;

  // Populate district filter
  const sel = document.getElementById('regionDistrictFilter');
  if (sel.options.length <= 1) {
    const districtData = getCumulativeDistrictData();
    Object.entries(districtData)
      .filter(([k]) => k !== '其他')
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([name]) => {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        sel.appendChild(opt);
      });
  }

  renderRegionView();
}

function onRegionDistrictChange() {
  selectedRegionDistrict = document.getElementById('regionDistrictFilter').value;
  renderRegionView();
}

function getCumulativeStreetData(district) {
  const result = {};
  for (const md of Object.values(appData.monthlyData || {})) {
    const sd = (md.streetData || {})[district] || {};
    for (const [street, v] of Object.entries(sd)) {
      if (!result[street]) result[street] = { total: 0, vip: 0 };
      result[street].total += v.total || 0;
      result[street].vip += v.vip || 0;
    }
  }
  return result;
}

function renderRegionView() {
  const districtData = getCumulativeDistrictData();

  if (selectedRegionDistrict) {
    // ===== Street-level view for selected district =====
    const streetData = getCumulativeStreetData(selectedRegionDistrict);
    const sortedAll = Object.entries(streetData).sort((a, b) => b[1].total - a[1].total);
    // Exclude "其他" from display stats and charts (it's a fallback category)
    const sorted = sortedAll.filter(([k]) => k !== '其他');
    const totalCustomers = sortedAll.reduce((s, [, v]) => s + v.total, 0);
    const mappedCustomers = sorted.reduce((s, [, v]) => s + v.total, 0);

    // Stats
    const core = sorted[0];
    document.getElementById('coreLabel').textContent = '核心街道';
    document.getElementById('coreRegion').textContent = core ? core[0] : '-';
    document.getElementById('coreRegionCount').textContent = core ? `客户数: ${core[1].total} (${totalCustomers > 0 ? (core[1].total * 100 / totalCustomers).toFixed(1) : 0}%)` : '';

    const allStreets = sorted.length;
    const covered = sorted.filter(([, v]) => v.total > 0).length;
    document.getElementById('coverageLabel').textContent = '街道覆盖率';
    document.getElementById('coverageRate').textContent = allStreets > 0 ? (covered * 100 / allStreets).toFixed(0) + '%' : '-';
    document.getElementById('coverageDetail').textContent = `${covered}/${allStreets} 街道有客户`;

    document.getElementById('regionLabel').textContent = '街道数';
    document.getElementById('regionCount').textContent = sorted.length;
    document.getElementById('regionDetail').textContent = `已定位 ${mappedCustomers} / 合计 ${totalCustomers} 人`;

    document.getElementById('mapTitle').textContent = `${selectedRegionDistrict} - 街道分布地图`;
    document.getElementById('rankTitle').textContent = `${selectedRegionDistrict} - 街道客户排名`;

    try { renderStreetMap(selectedRegionDistrict, streetData); } catch(e) { console.error('StreetMap:', e); }
    try { renderStreetRankChart(sorted, selectedRegionDistrict); } catch(e) { console.error('StreetRank:', e); }
  } else {
    // ===== District-level overview =====
    const sorted = Object.entries(districtData)
      .filter(([k]) => k !== '其他')
      .sort((a, b) => b[1].total - a[1].total);
    const totalCustomers = sorted.reduce((s, [, v]) => s + v.total, 0);

    const core = sorted[0];
    document.getElementById('coreLabel').textContent = '核心区域';
    document.getElementById('coreRegion').textContent = core ? core[0] : '-';
    document.getElementById('coreRegionCount').textContent = core ? `客户数: ${core[1].total} (${(core[1].total * 100 / totalCustomers).toFixed(1)}%)` : '';

    const allDistricts = 14;
    const covered = sorted.filter(([, v]) => v.total > 0).length;
    document.getElementById('coverageLabel').textContent = '覆盖率';
    document.getElementById('coverageRate').textContent = (covered * 100 / allDistricts).toFixed(0) + '%';
    document.getElementById('coverageDetail').textContent = `${covered}/${allDistricts} 区县有客户`;

    document.getElementById('regionLabel').textContent = '区域数';
    document.getElementById('regionCount').textContent = sorted.length;
    document.getElementById('regionDetail').textContent = `合计 ${totalCustomers} 人`;

    document.getElementById('mapTitle').textContent = '客户分布地图';
    document.getElementById('rankTitle').textContent = '区县客户排名';

    try { renderDistrictMap(districtData); } catch(e) { console.error('DistrictMap:', e); }
    try { renderDistrictRankChart(sorted); } catch(e) { console.error('DistrictRank:', e); }
  }
}

function renderDistrictMap(districtData) {
  const el = document.getElementById('regionMap');
  if (!el) return;
  if (charts.regionMap) { charts.regionMap.dispose(); }
  charts.regionMap = echarts.init(el);

  if (window.MAP_DATA && window.MAP_DATA.districtGeo) {
    // Build map from district-level GeoJSON only (for overview)
    const mapData = { type: 'FeatureCollection', features: [] };
    for (const [, geo] of Object.entries(window.MAP_DATA.districtGeo)) {
      if (geo.features) mapData.features.push(...geo.features);
    }
    echarts.registerMap('yichang_district', mapData);

    const maxVal = Math.max(1, ...Object.values(districtData).filter(d => d).map(d => d.total));
    charts.regionMap.setOption({
      tooltip: {
        trigger: 'item',
        formatter: function(p) {
          const val = districtData[p.name] ? districtData[p.name].total : 0;
          return p.name + '<br/>客户数: <b>' + val + '</b>';
        }
      },
      visualMap: {
        min: 0, max: maxVal,
        calculable: true, orient: 'vertical', right: 10, top: 'center',
        text: ['多', '少'],
        inRange: { color: ['#e6f7ff', '#69c0ff', '#1890ff', '#0050b3'] },
        textStyle: { fontSize: 11 }
      },
      series: [{
        type: 'map', map: 'yichang_district', roam: true,
        label: { show: true, fontSize: 9, color: '#333' },
        emphasis: { label: { show: true, fontWeight: 'bold' }, itemStyle: { areaColor: '#faad14' } },
        data: Object.entries(districtData)
          .filter(([k]) => k !== '其他')
          .map(([name, v]) => ({ name, value: v.total }))
      }]
    });
  } else {
    el.innerHTML = '<div class="loading">地图数据未加载</div>';
  }
}

function renderStreetMap(district, streetData) {
  const el = document.getElementById('regionMap');
  if (!el) return;
  if (charts.regionMap) { charts.regionMap.dispose(); }
  charts.regionMap = echarts.init(el);

  if (window.MAP_DATA && window.MAP_DATA.streetsGeo && window.MAP_DATA.streetsGeo[district]) {
    const geoData = window.MAP_DATA.streetsGeo[district];
    // Use ASCII-safe map name to avoid potential encoding issues
    const mapName = 'street_map';
    try { echarts.registerMap(mapName, geoData); } catch(e) { console.error('registerMap error:', e.message || e); }

    // Calculate max from mapped streets only (exclude "其他")
    const mappedVals = Object.entries(streetData)
      .filter(([k]) => k !== '其他')
      .map(v => v[1].total);
    const maxVal = Math.max(1, ...mappedVals);

    charts.regionMap.setOption({
      tooltip: {
        trigger: 'item',
        formatter: function(p) {
          const val = streetData[p.name] ? streetData[p.name].total : 0;
          return p.name + '<br/>客户数: <b style="color:#1890ff">' + val + '</b>';
        }
      },
      visualMap: {
        type: 'continuous',
        min: 0, max: maxVal,
        calculable: true, orient: 'vertical', right: 10, top: 'center',
        text: ['多', '少'],
        inRange: { color: ['#f0f9ff', '#bae6fd', '#38bdf8', '#0284c7', '#075985'] },
        textStyle: { fontSize: 11 }
      },
      series: [{
        type: 'map', map: mapName, roam: true,
        label: { show: true, fontSize: 10, color: '#333' },
        emphasis: { label: { show: true, fontWeight: 'bold' }, itemStyle: { areaColor: '#faad14' } },
        data: Object.entries(streetData)
          .filter(([k]) => k !== '其他')
          .map(([name, v]) => ({ name: name, value: v.total }))
      }]
    });
  } else {
    el.innerHTML = '<div class="loading">该区县无街道地图数据</div>';
  }
}

function renderDistrictRankChart(sorted) {
  const el = document.getElementById('rankChart');
  if (!el) return;
  if (charts.rank) { charts.rank.dispose(); }
  charts.rank = echarts.init(el);

  const data = sorted.slice(0, 15);
  charts.rank.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '25%', right: '8%', top: '3%', bottom: '3%' },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: data.map(d => d[0]).reverse(), axisLabel: { fontSize: 11 } },
    series: [{
      type: 'bar',
      data: data.map(d => d[1].total).reverse(),
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#1890ff' }, { offset: 1, color: '#69c0ff' }
        ]),
        borderRadius: [0, 4, 4, 0]
      },
      barWidth: '60%',
      label: { show: true, position: 'right', fontSize: 11, color: '#666' }
    }]
  });
}

function renderStreetRankChart(sorted, district) {
  const el = document.getElementById('rankChart');
  if (!el) return;
  if (charts.rank) { charts.rank.dispose(); }
  charts.rank = echarts.init(el);

  const data = sorted.slice(0, 15);
  charts.rank.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '30%', right: '8%', top: '3%', bottom: '3%' },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: data.map(d => d[0]).reverse(), axisLabel: { fontSize: 11 } },
    series: [{
      type: 'bar',
      data: data.map(d => d[1].total).reverse(),
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#0284c7' }, { offset: 1, color: '#38bdf8' }
        ]),
        borderRadius: [0, 4, 4, 0]
      },
      barWidth: '60%',
      label: { show: true, position: 'right', fontSize: 11, color: '#666' }
    }]
  });
}

// ====== Resize ======
window.addEventListener('resize', () => {
  Object.values(charts).forEach(c => c && c.resize());
});

// ====== Data Entry ======
let formDistricts = {};
let formInitialized = false;

function setupDataEntryForm() {
  const submitBtn = document.getElementById('submitCustomer');
  const resetBtn = document.getElementById('resetForm');
  const districtSel = document.getElementById('customerDistrict');
  const streetSel = document.getElementById('customerStreet');

  if (submitBtn) submitBtn.addEventListener('click', submitCustomerForm);
  if (resetBtn) resetBtn.addEventListener('click', () => {
    document.getElementById('customerName').value = '';
    districtSel.value = '';
    streetSel.innerHTML = '<option value="">请先选择区县</option>';
    document.getElementById('customerAddress').value = '';
    document.getElementById('customerPhone').value = '';
    document.getElementById('customerVip').checked = false;
    document.getElementById('customerMonth').value = '';
    hideFormMsg();
    document.getElementById('formHint').className = 'form-msg info show';
  });
  if (districtSel) districtSel.addEventListener('change', () => onFormDistrictChange());
}

function setupDataEntry() {
  // Set default month
  const monthInput = document.getElementById('customerMonth');
  if (monthInput && !monthInput.value) {
    const now = new Date();
    monthInput.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }
  populateFormDistricts();
}

function populateFormDistricts() {
  const sel = document.getElementById('customerDistrict');
  if (!sel || !appData) return;
  // Only populate once
  if (sel.options.length > 1) return;

  // Build district -> streets mapping from existing data
  formDistricts = {};
  allCustomers.forEach(c => {
    if (c.district && c.district !== '其他') {
      if (!formDistricts[c.district]) formDistricts[c.district] = new Set();
      if (c.street && c.street !== '其他') formDistricts[c.district].add(c.street);
    }
  });

  // Also include districts from map data
  if (window.MAP_DATA && window.MAP_DATA.streetsGeo) {
    Object.keys(window.MAP_DATA.streetsGeo).forEach(d => {
      if (!formDistricts[d]) formDistricts[d] = new Set();
    });
  }

  const sortedDistricts = Object.keys(formDistricts).sort();
  sortedDistricts.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d; opt.textContent = d;
    sel.appendChild(opt);
  });
}

function onFormDistrictChange() {
  const districtSel = document.getElementById('customerDistrict');
  const streetSel = document.getElementById('customerStreet');
  const district = districtSel.value;
  streetSel.innerHTML = '<option value="">请选择街道</option>';

  if (!district) return;

  // Get streets for this district
  let streets = formDistricts[district] ? [...formDistricts[district]] : [];

  // Also add streets from map data
  if (window.MAP_DATA && window.MAP_DATA.streetsGeo && window.MAP_DATA.streetsGeo[district]) {
    const geo = window.MAP_DATA.streetsGeo[district];
    if (geo.features) {
      geo.features.forEach(f => {
        const name = f.properties && (f.properties.name || f.properties.NAME);
        if (name && !streets.includes(name)) streets.push(name);
      });
    }
  }

  streets.sort().forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    streetSel.appendChild(opt);
  });

  // Allow custom street input
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__'; customOpt.textContent = '其他（手动输入）';
  streetSel.appendChild(customOpt);
}

function showFormMsg(type, text) {
  const msg = document.getElementById('formMsg');
  msg.className = 'form-msg show ' + type;
  msg.textContent = text;
  document.getElementById('formHint').classList.remove('show');
}

function hideFormMsg() {
  const msg = document.getElementById('formMsg');
  msg.className = 'form-msg';
  msg.textContent = '';
  document.getElementById('formHint').className = 'form-msg info show';
}

async function submitCustomerForm() {
  // Validate
  const name = document.getElementById('customerName').value.trim();
  const district = document.getElementById('customerDistrict').value;
  let street = document.getElementById('customerStreet').value;
  const address = document.getElementById('customerAddress').value.trim();
  const phone = document.getElementById('customerPhone').value.trim();
  const vip = document.getElementById('customerVip').checked;
  const monthInput = document.getElementById('customerMonth');

  if (!name) { showFormMsg('error', '请输入客户姓名'); return; }
  if (!district) { showFormMsg('error', '请选择所属区县'); return; }
  if (!street) { showFormMsg('error', '请选择乡镇/街道'); return; }
  if (!address) { showFormMsg('error', '请输入详细地址'); return; }

  // Handle custom street
  if (street === '__custom__') {
    street = prompt('请输入街道名称：');
    if (!street) return;
  }

  let month = monthInput.value;
  if (!month) {
    const now = new Date();
    month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }

  // Check GitHub settings
  const settings = getGitHubSettings();
  if (!settings.token || !settings.user || !settings.repo) {
    showFormMsg('error', '请先在"设置"页面配置GitHub令牌');
    return;
  }

  // Disable submit button
  const submitBtn = document.getElementById('submitCustomer');
  submitBtn.disabled = true;
  submitBtn.textContent = '正在提交...';
  showFormMsg('info', '正在提交数据到GitHub，请稍候...');

  try {
    // Fetch current data.json from GitHub API (get SHA for update)
    const fileResp = await fetch(`https://api.github.com/repos/${settings.user}/${settings.repo}/contents/data.json`, {
      headers: { 'Authorization': `Bearer ${settings.token}`, 'Accept': 'application/vnd.github.v3+json' }
    });

    if (!fileResp.ok) {
      const errData = await fileResp.json().catch(() => ({}));
      throw new Error(`获取文件失败: ${fileResp.status} ${errData.message || ''}`);
    }

    const fileInfo = await fileResp.json();
    const sha = fileInfo.sha;

    // Decode current content and parse
    const currentContent = decodeURIComponent(escape(atob(fileInfo.content.replace(/\n/g, ''))));
    const dataObj = JSON.parse(currentContent);

    // Ensure structures exist
    if (!dataObj.addressDetails) dataObj.addressDetails = {};
    if (!dataObj.monthlyData) dataObj.monthlyData = {};

    const monthKey = month; // e.g., "2026-09"

    // Add customer entry to addressDetails
    if (!dataObj.addressDetails[monthKey]) dataObj.addressDetails[monthKey] = [];
    dataObj.addressDetails[monthKey].push({
      name: name,
      district: district,
      street: street,
      detail: address,
      vip: vip,
      phone: phone || undefined
    });

    // Update monthlyData
    if (!dataObj.monthlyData[monthKey]) {
      dataObj.monthlyData[monthKey] = { districtData: {}, streetData: {} };
    }
    const md = dataObj.monthlyData[monthKey];
    if (!md.districtData) md.districtData = {};
    if (!md.streetData) md.streetData = {};

    // Update district counts
    if (!md.districtData[district]) md.districtData[district] = { total: 0, vip: 0 };
    md.districtData[district].total = (md.districtData[district].total || 0) + 1;
    if (vip) md.districtData[district].vip = (md.districtData[district].vip || 0) + 1;

    // Update street counts
    if (!md.streetData[district]) md.streetData[district] = {};
    if (!md.streetData[district][street]) md.streetData[district][street] = { total: 0, vip: 0 };
    md.streetData[district][street].total = (md.streetData[district][street].total || 0) + 1;
    if (vip) md.streetData[district][street].vip = (md.streetData[district][street].vip || 0) + 1;

    // Update timestamp
    dataObj.updated_at = new Date().toISOString();

    // Encode and push to GitHub
    const newContent = JSON.stringify(dataObj, null, 2);
    const encodedContent = btoa(unescape(encodeURIComponent(newContent)));

    const updateResp = await fetch(`https://api.github.com/repos/${settings.user}/${settings.repo}/contents/data.json`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${settings.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `添加客户: ${name} (${district} ${street}) - ${monthKey}`,
        content: encodedContent,
        sha: sha
      })
    });

    if (!updateResp.ok) {
      const errData = await updateResp.json().catch(() => ({}));
      throw new Error(`提交失败: ${updateResp.status} ${errData.message || ''}`);
    }

    showFormMsg('success', `客户"${name}"已成功添加！数据已同步到网站。`);

    // Reload local data
    setTimeout(() => {
      loadData();
      // Reset form
      document.getElementById('customerName').value = '';
      document.getElementById('customerAddress').value = '';
      document.getElementById('customerPhone').value = '';
      document.getElementById('customerVip').checked = false;
    }, 2000);

  } catch (err) {
    console.error('Submit error:', err);
    showFormMsg('error', '提交失败: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '保存客户信息';
  }
}

// ====== Settings ======
function setupSettingsForm() {
  const saveBtn = document.getElementById('saveSettings');
  const testBtn = document.getElementById('testConnection');

  if (saveBtn) saveBtn.addEventListener('click', saveSettings);
  if (testBtn) testBtn.addEventListener('click', testGitHubConnection);

  // Load saved settings
  const saved = localStorage.getItem('gh_settings');
  if (saved) {
    try {
      const s = JSON.parse(saved);
      const tokenInput = document.getElementById('githubToken');
      const userInput = document.getElementById('githubUser');
      const repoInput = document.getElementById('githubRepo');
      const saveChk = document.getElementById('saveToken');
      if (s.token && tokenInput) tokenInput.value = s.token;
      if (s.user && userInput) userInput.value = s.user;
      if (s.repo && repoInput) repoInput.value = s.repo;
      if (saveChk) saveChk.checked = true;
    } catch(e) { console.error('Load settings:', e); }
  }

  // Set defaults
  const userInput = document.getElementById('githubUser');
  const repoInput = document.getElementById('githubRepo');
  if (userInput && !userInput.value) userInput.value = 'yddz2026';
  if (repoInput && !repoInput.value) repoInput.value = 'yddz2026.github.io';
}

function setupSettings() {
  // Called when switching to settings view - settings already loaded in setupSettingsForm
}

function getGitHubSettings() {
  return {
    token: document.getElementById('githubToken').value.trim(),
    user: document.getElementById('githubUser').value.trim() || 'yddz2026',
    repo: document.getElementById('githubRepo').value.trim() || 'yddz2026.github.io'
  };
}

function saveSettings() {
  const settings = getGitHubSettings();
  const saveChk = document.getElementById('saveToken');
  const msg = document.getElementById('settingsMsg');

  if (saveChk.checked && settings.token) {
    localStorage.setItem('gh_settings', JSON.stringify(settings));
    msg.className = 'form-msg show success';
    msg.textContent = '设置已保存到本地浏览器';
  } else {
    localStorage.removeItem('gh_settings');
    msg.className = 'form-msg show info';
    msg.textContent = '设置已清除（未勾选记住令牌）';
  }
  setTimeout(() => { msg.className = 'form-msg'; }, 3000);
}

async function testGitHubConnection() {
  const settings = getGitHubSettings();
  const msg = document.getElementById('settingsMsg');
  const testBtn = document.getElementById('testConnection');

  if (!settings.token) {
    msg.className = 'form-msg show error';
    msg.textContent = '请先输入GitHub令牌';
    return;
  }

  testBtn.disabled = true;
  testBtn.textContent = '测试中...';
  msg.className = 'form-msg show info';
  msg.textContent = '正在测试连接...';

  try {
    const resp = await fetch(`https://api.github.com/repos/${settings.user}/${settings.repo}`, {
      headers: { 'Authorization': `Bearer ${settings.token}`, 'Accept': 'application/vnd.github.v3+json' }
    });

    if (resp.ok) {
      const data = await resp.json();
      msg.className = 'form-msg show success';
      msg.textContent = `连接成功！仓库: ${data.full_name}，权限正常`;
    } else if (resp.status === 401) {
      msg.className = 'form-msg show error';
      msg.textContent = '令牌无效或已过期，请重新创建';
    } else if (resp.status === 404) {
      msg.className = 'form-msg show error';
      msg.textContent = '仓库不存在或令牌无权限访问';
    } else {
      const errData = await resp.json().catch(() => ({}));
      msg.className = 'form-msg show error';
      msg.textContent = `连接失败: ${resp.status} ${errData.message || ''}`;
    }
  } catch (err) {
    msg.className = 'form-msg show error';
    msg.textContent = '网络错误: ' + err.message;
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '测试连接';
  }
}
