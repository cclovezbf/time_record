// ==================== 应用状态 ====================
let records = [];                // 内存中的记录缓存（用于快速渲染）
let currentView = 'all';         // all | day | month | year
let collapsedGroups = new Set(); // 折叠的分组 key 集合
let isReady = false;             // 数据库是否就绪

// ==================== 工具函数 ====================
function pad(n) {
    return n < 10 ? '0' + n : '' + n;
}

function formatDateTime(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(ts) {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getWeekDay(ts) {
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return days[new Date(ts).getDay()];
}

function getDayKey(ts) {
    return formatDate(ts);
}

function getMonthKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function getYearKey(ts) {
    return String(new Date(ts).getFullYear());
}

function formatDuration(ms) {
    if (ms < 1000) return { value: ms, unit: '毫秒' };
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return { value: seconds, unit: '秒前' };
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return { value: minutes, unit: '分钟前' };
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return { value: hours, unit: '小时前' };
    const days = Math.floor(hours / 24);
    return { value: days, unit: '天前' };
}

function formatGap(ms) {
    if (ms < 1000) return ms + 'ms';
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return sec + '秒';
    const min = Math.floor(sec / 60);
    const remainSec = sec % 60;
    if (min < 60) return `${min}分${remainSec}秒`;
    const hour = Math.floor(min / 60);
    const remainMin = min % 60;
    return `${hour}时${remainMin}分`;
}

// ==================== 容量监控（IndexedDB 版） ====================
function formatBytes(bytes, decimals = 2) {
    if (bytes < 1024) return Math.round(bytes) + ' B';
    if (bytes < 1024 * 1024) return trimDecimal(bytes / 1024, decimals) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return trimDecimal(bytes / 1024 / 1024, decimals) + ' MB';
    return trimDecimal(bytes / 1024 / 1024 / 1024, decimals) + ' GB';
}

function trimDecimal(num, decimals = 2) {
    return parseFloat(num.toFixed(decimals)).toString();
}

async function updateStorageMonitor() {
    const est = await getStorageEstimate();
    const used = est.usage;
    const total = est.quota || (1024 * 1024 * 1024); // 兜底 1GB
    const percent = total > 0 ? Math.min(100, (used / total) * 100) : 0;
    const count = records.length;

    document.getElementById('storageUsed').textContent = formatBytes(used);
    document.getElementById('storageTotal').textContent = est.supported ? formatBytes(total) : '~';
    document.getElementById('storagePercent').textContent = percent.toFixed(2) + '%';

    const bar = document.getElementById('storageBar');
    bar.style.width = percent + '%';

    const status = document.getElementById('storageStatus');
    bar.classList.remove('storage-bar-stripe');
    status.classList.remove('storage-warn');
    if (percent < 60) {
        bar.className = 'absolute inset-y-0 left-0 rounded-full transition-all duration-500 bg-gradient-to-r from-emerald-400 to-teal-500';
        status.className = 'px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-600 font-medium';
        status.innerHTML = '<i class="ri-shield-check-line"></i> 充足';
    } else if (percent < 85) {
        bar.className = 'absolute inset-y-0 left-0 rounded-full transition-all duration-500 bg-gradient-to-r from-amber-400 to-orange-500';
        status.className = 'px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-600 font-medium';
        status.innerHTML = '<i class="ri-alert-line"></i> 注意';
    } else {
        bar.className = 'absolute inset-y-0 left-0 rounded-full transition-all duration-500 bg-gradient-to-r from-red-400 to-rose-600 storage-bar-stripe';
        status.className = 'px-2 py-0.5 text-xs rounded-full bg-red-50 text-red-600 font-medium storage-warn';
        status.innerHTML = '<i class="ri-error-warning-line"></i> 紧张';
    }

    // 单条平均（按当前应用占用估算）
    const avgSizeEl = document.getElementById('avgSize');
    const remainEl = document.getElementById('remainCount');
    if (count === 0) {
        avgSizeEl.textContent = '-- B';
        // 按 300 字节/条估算
        const remainBytes = total - used;
        const estimatePerRecord = 300;
        const cnt = Math.floor(remainBytes / estimatePerRecord);
        remainEl.textContent = cnt > 0 ? '约 ' + cnt.toLocaleString() + ' 条' : '已满';
    } else {
        // navigator.storage.estimate 返回的是整个 origin 的占用，不仅是 records
        // 这里用记录占用的"逻辑大小"估算单条平均（更准确反映记录本身）
        let logicSize = 0;
        records.forEach(r => {
            logicSize += 80 + ((r.note || '').length * 2);
        });
        const avg = logicSize / count;
        let avgStr;
        if (avg < 1024) {
            avgStr = trimDecimal(avg, 1) + ' B';
        } else {
            avgStr = formatBytes(avg, 2);
        }
        avgSizeEl.textContent = avgStr;
        const remainBytes = total - used;
        const remainCnt = avg > 0 ? Math.floor(remainBytes / avg) : 0;
        remainEl.textContent = remainCnt > 0 ? '约 ' + remainCnt.toLocaleString() + ' 条' : '已满';
    }
}

// ==================== Toast 提示 ====================
let toastTimer = null;
function showToast(message, icon = 'ri-check-line') {
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toastText');
    toast.querySelector('i').className = icon;
    toastText.textContent = message;
    toast.classList.add('toast-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('toast-show');
    }, 2000);
}

// ==================== 实时时钟 ====================
function updateLiveClock() {
    const now = new Date();
    document.getElementById('liveClock').textContent = formatTime(now.getTime());
    document.getElementById('todayDate').textContent = `${formatDate(now.getTime())} ${getWeekDay(now.getTime())}`;
}
setInterval(updateLiveClock, 1000);
updateLiveClock();

// ==================== 涟漪效果 ====================
function createRipple(event) {
    const button = event.currentTarget;
    const container = button.querySelector('.ripple-container');
    if (!container) return;

    const circle = document.createElement('span');
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;
    const rect = button.getBoundingClientRect();

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - rect.left - radius}px`;
    circle.style.top = `${event.clientY - rect.top - radius}px`;
    circle.classList.add('ripple');

    container.appendChild(circle);
    setTimeout(() => circle.remove(), 600);
}

// ==================== 记录功能（异步）====================
async function addRecord() {
    if (!isReady) return;
    const now = Date.now();
    const newRecord = await dbAddRecord({ timestamp: now, note: '' });
    // 在内存数组开头插入（保持倒序）
    records.unshift(newRecord);
    renderList(true);
    updateStats();

    const btn = document.getElementById('recordBtn');
    btn.classList.add('pulse-effect');
    setTimeout(() => btn.classList.remove('pulse-effect'), 800);

    showToast(`已记录：${formatTime(now)}`, 'ri-time-line');
}

async function deleteRecord(id) {
    await dbDeleteRecord(id);
    records = records.filter(r => r.id !== id);
    renderList();
    updateStats();
    showToast('已删除该记录', 'ri-delete-bin-line');
}

async function updateNote(id, note) {
    await dbUpdateRecord(id, { note });
    const record = records.find(r => r.id === id);
    if (record) record.note = note;
}

async function clearAll() {
    if (records.length === 0) {
        showToast('暂无记录可清空', 'ri-information-line');
        return;
    }
    if (!confirm(`确定要清空全部 ${records.length} 条记录吗？此操作不可恢复。`)) return;
    await dbClearRecords();
    records = [];
    renderList();
    updateStats();
    showToast('已清空全部记录', 'ri-delete-bin-line');
}

function exportCSV() {
    if (records.length === 0) {
        showToast('暂无记录可导出', 'ri-information-line');
        return;
    }
    const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
    let csv = '\ufeff序号,日期,时间,星期,时间戳,备注\n';
    sorted.forEach((r, i) => {
        const note = (r.note || '').replace(/"/g, '""');
        csv += `${i + 1},${formatDate(r.timestamp)},${formatTime(r.timestamp)},${getWeekDay(r.timestamp)},${r.timestamp},"${note}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `时间记录_${formatDate(Date.now())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已导出 CSV 文件', 'ri-download-line');
}

function copyAll() {
    if (records.length === 0) {
        showToast('暂无记录可复制', 'ri-information-line');
        return;
    }
    const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
    const text = sorted.map((r, i) => {
        const noteStr = r.note ? ` | ${r.note}` : '';
        return `${i + 1}. ${formatDateTime(r.timestamp)} ${getWeekDay(r.timestamp)}${noteStr}`;
    }).join('\n');

    navigator.clipboard.writeText(text).then(() => {
        showToast(`已复制 ${records.length} 条记录到剪贴板`, 'ri-file-copy-line');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast(`已复制 ${records.length} 条记录到剪贴板`, 'ri-file-copy-line');
    });
}

// ==================== 渲染列表 ====================
function getFilteredSortedRecords() {
    const keyword = document.getElementById('searchInput').value.trim().toLowerCase();
    const sortOrder = document.getElementById('sortSelect').value;

    let list = [...records];
    if (keyword) {
        list = list.filter(r =>
            (r.note || '').toLowerCase().includes(keyword) ||
            formatDateTime(r.timestamp).includes(keyword)
        );
    }
    list.sort((a, b) => sortOrder === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp);
    return list;
}

function getColors(orderNum) {
    const colors = [
        ['from-indigo-500', 'to-purple-500'],
        ['from-pink-500', 'to-rose-500'],
        ['from-emerald-500', 'to-teal-500'],
        ['from-amber-500', 'to-orange-500'],
        ['from-blue-500', 'to-cyan-500'],
        ['from-fuchsia-500', 'to-pink-500']
    ];
    return colors[orderNum % colors.length];
}

function renderEmpty(isSearching) {
    return `
        <div class="py-20 text-center">
            <div class="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                <i class="${isSearching ? 'ri-search-line' : 'ri-inbox-line'} text-5xl text-indigo-400"></i>
            </div>
            <p class="text-gray-500 font-medium">${isSearching ? '没有匹配的记录' : '还没有任何记录'}</p>
            <p class="text-sm text-gray-400 mt-1">${isSearching ? '试试其他关键词吧' : '点击左侧大按钮开始记录吧 ✨'}</p>
        </div>
    `;
}

function renderRecordItem(r, orderNum, gapStr, isNew) {
    const ago = formatDuration(Date.now() - r.timestamp);
    const [c1, c2] = getColors(orderNum);
    return `
        <div class="record-item ${isNew ? 'new-item' : ''} px-6 py-4 hover:bg-gray-50 transition group" data-id="${r.id}">
            <div class="flex items-start gap-4">
                <div class="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${c1} ${c2} flex items-center justify-center text-white font-bold shadow-md">
                    ${orderNum < 100 ? `#${orderNum}` : orderNum}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap mb-1">
                        <span class="font-mono font-semibold text-gray-800 text-lg">${formatTime(r.timestamp)}</span>
                        <span class="text-sm text-gray-500">${formatDate(r.timestamp)}</span>
                        <span class="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-xs">${getWeekDay(r.timestamp)}</span>
                        ${gapStr ? `<span class="px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full text-xs flex items-center gap-1">
                            <i class="ri-arrow-right-up-line"></i>${gapStr}
                        </span>` : ''}
                        <span class="text-xs text-gray-400">${ago.value}${ago.unit}</span>
                    </div>
                    <input type="text"
                        class="note-input w-full mt-1 px-2 py-1 text-sm bg-transparent border border-transparent hover:border-gray-200 focus:border-indigo-300 focus:bg-white rounded transition outline-none"
                        placeholder="点击添加备注..."
                        value="${(r.note || '').replace(/"/g, '&quot;')}"
                        data-id="${r.id}">
                </div>
                <button class="delete-btn flex-shrink-0 w-9 h-9 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 opacity-0 group-hover:opacity-100 transition flex items-center justify-center" data-id="${r.id}" title="删除">
                    <i class="ri-delete-bin-line"></i>
                </button>
            </div>
        </div>
    `;
}

function groupRecords(list, viewType) {
    const groups = new Map();
    list.forEach(r => {
        let key, label, sortKey;
        const d = new Date(r.timestamp);
        if (viewType === 'day') {
            key = getDayKey(r.timestamp);
            label = `${key} ${getWeekDay(r.timestamp)}`;
            sortKey = key;
        } else if (viewType === 'month') {
            key = getMonthKey(r.timestamp);
            label = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
            sortKey = key;
        } else if (viewType === 'year') {
            key = getYearKey(r.timestamp);
            label = `${key} 年`;
            sortKey = key;
        }
        if (!groups.has(key)) {
            groups.set(key, { key, label, sortKey, items: [] });
        }
        groups.get(key).items.push(r);
    });
    return groups;
}

function renderGroupedList(filtered, viewType, highlightFirst) {
    const sortOrder = document.getElementById('sortSelect').value;
    const timeSorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
    const indexMap = new Map();
    timeSorted.forEach((r, i) => indexMap.set(r.id, i));

    const groups = groupRecords(filtered, viewType);
    const groupArr = [...groups.values()];
    groupArr.sort((a, b) => sortOrder === 'desc' ? b.sortKey.localeCompare(a.sortKey) : a.sortKey.localeCompare(b.sortKey));

    const iconMap = {
        day: 'ri-calendar-line',
        month: 'ri-calendar-2-line',
        year: 'ri-calendar-event-line'
    };
    const colorMap = {
        day: ['from-indigo-500', 'to-purple-500'],
        month: ['from-purple-500', 'to-pink-500'],
        year: ['from-pink-500', 'to-rose-500']
    };
    const [gc1, gc2] = colorMap[viewType];

    return groupArr.map((group, gIdx) => {
        const sortedItems = [...group.items].sort((a, b) =>
            sortOrder === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
        );
        const isCollapsed = collapsedGroups.has(`${viewType}_${group.key}`);

        const minTs = Math.min(...group.items.map(r => r.timestamp));
        const maxTs = Math.max(...group.items.map(r => r.timestamp));
        const span = group.items.length > 1 ? formatGap(maxTs - minTs) : '--';

        const itemsHtml = sortedItems.map((r, idx) => {
            const orderNum = indexMap.get(r.id) + 1;
            const groupTimeSorted = [...group.items].sort((a, b) => a.timestamp - b.timestamp);
            const groupIdx = groupTimeSorted.findIndex(x => x.id === r.id);
            const prev = groupTimeSorted[groupIdx - 1];
            const gapStr = prev ? `+${formatGap(r.timestamp - prev.timestamp)}` : '起点';
            const isNew = highlightFirst && gIdx === 0 && idx === 0 && sortOrder === 'desc';
            return renderRecordItem(r, orderNum, gapStr, isNew);
        }).join('');

        return `
            <div class="group-block ${isCollapsed ? 'group-collapsed' : ''}" data-group-key="${viewType}_${group.key}">
                <div class="group-header px-6 py-4 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between border-l-4" style="border-color: #a78bfa;">
                    <div class="flex items-center gap-3">
                        <i class="ri-arrow-down-s-line group-arrow text-gray-500 text-xl"></i>
                        <div class="w-10 h-10 rounded-lg bg-gradient-to-br ${gc1} ${gc2} flex items-center justify-center text-white shadow">
                            <i class="${iconMap[viewType]} text-lg"></i>
                        </div>
                        <div>
                            <p class="font-bold text-gray-800">${group.label}</p>
                            <p class="text-xs text-gray-500 mt-0.5">
                                <i class="ri-time-line"></i> 时间跨度：${span}
                            </p>
                        </div>
                    </div>
                    <span class="count-badge">
                        <i class="ri-stack-line mr-1"></i>${group.items.length} 个时间点
                    </span>
                </div>
                <div class="group-content divide-y divide-gray-100" style="max-height: ${isCollapsed ? '0' : '9999px'};">
                    ${itemsHtml}
                </div>
            </div>
        `;
    }).join('');
}

function renderList(highlightFirst = false) {
    const listEl = document.getElementById('recordList');
    const filtered = getFilteredSortedRecords();
    const isSearching = document.getElementById('searchInput').value.trim();

    if (filtered.length === 0) {
        listEl.innerHTML = renderEmpty(isSearching);
        return;
    }

    if (currentView === 'all') {
        const timeSorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
        const indexMap = new Map();
        timeSorted.forEach((r, i) => indexMap.set(r.id, i));
        const sortOrder = document.getElementById('sortSelect').value;

        listEl.innerHTML = filtered.map((r, idx) => {
            const orderNum = indexMap.get(r.id) + 1;
            const prev = timeSorted[indexMap.get(r.id) - 1];
            const gapStr = prev ? `+${formatGap(r.timestamp - prev.timestamp)}` : '起点';
            const isNew = highlightFirst && idx === 0 && sortOrder === 'desc';
            return renderRecordItem(r, orderNum, gapStr, isNew);
        }).join('');
    } else {
        listEl.innerHTML = renderGroupedList(filtered, currentView, highlightFirst);
    }
}

// ==================== 统计更新 ====================
function updateStats() {
    document.getElementById('totalCount').textContent = records.length;

    if (records.length === 0) {
        document.getElementById('lastInterval').textContent = '--';
        document.getElementById('lastIntervalUnit').textContent = '尚无记录';
        document.getElementById('todayCount').textContent = '0';
        document.getElementById('monthCount').textContent = '0';
        document.getElementById('yearCount').textContent = '0';
        updateStorageMonitor();
        return;
    }

    const latest = records.reduce((a, b) => a.timestamp > b.timestamp ? a : b);
    const ago = formatDuration(Date.now() - latest.timestamp);
    document.getElementById('lastInterval').textContent = ago.value;
    document.getElementById('lastIntervalUnit').textContent = ago.unit;

    const now = Date.now();
    const todayKey = getDayKey(now);
    const monthKey = getMonthKey(now);
    const yearKey = getYearKey(now);
    let todayN = 0, monthN = 0, yearN = 0;
    records.forEach(r => {
        if (getDayKey(r.timestamp) === todayKey) todayN++;
        if (getMonthKey(r.timestamp) === monthKey) monthN++;
        if (getYearKey(r.timestamp) === yearKey) yearN++;
    });
    document.getElementById('todayCount').textContent = todayN;
    document.getElementById('monthCount').textContent = monthN;
    document.getElementById('yearCount').textContent = yearN;

    updateStorageMonitor();
}

setInterval(() => {
    if (records.length > 0) updateStats();
}, 1000);

// ==================== 视图切换 ====================
async function switchView(view) {
    currentView = view;
    await dbSetSetting('view', view);
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.classList.toggle('active-tab', tab.dataset.view === view);
    });
    renderList();
}

// ==================== 事件绑定 ====================
document.getElementById('recordBtn').addEventListener('click', (e) => {
    createRipple(e);
    addRecord();
});

document.getElementById('clearBtn').addEventListener('click', clearAll);
document.getElementById('exportBtn').addEventListener('click', exportCSV);
document.getElementById('copyBtn').addEventListener('click', copyAll);

document.getElementById('searchInput').addEventListener('input', () => renderList());
document.getElementById('sortSelect').addEventListener('change', () => renderList());

document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
});

document.getElementById('recordList').addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.delete-btn');
    if (delBtn) {
        // dataset.id 是字符串，IndexedDB 主键是数字，需要转换
        const id = Number(delBtn.dataset.id);
        await deleteRecord(id);
        return;
    }
    const groupHeader = e.target.closest('.group-header');
    if (groupHeader) {
        const block = groupHeader.parentElement;
        const key = block.dataset.groupKey;
        if (collapsedGroups.has(key)) {
            collapsedGroups.delete(key);
            block.classList.remove('group-collapsed');
            block.querySelector('.group-content').style.maxHeight = '9999px';
        } else {
            collapsedGroups.add(key);
            block.classList.add('group-collapsed');
            block.querySelector('.group-content').style.maxHeight = '0';
        }
        await dbSetSetting('collapsed', [...collapsedGroups]);
    }
});

document.getElementById('recordList').addEventListener('change', async (e) => {
    if (e.target.classList.contains('note-input')) {
        const id = Number(e.target.dataset.id);
        await updateNote(id, e.target.value);
        showToast('备注已保存', 'ri-edit-line');
    }
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        document.getElementById('recordBtn').click();
    }
});

// ==================== 应用初始化 ====================
async function initApp() {
    try {
        // 1. 自动迁移旧数据
        const migrationResult = await migrateFromLocalStorage();

        // 2. 加载配置
        currentView = await dbGetSetting('view', 'all');
        const savedCollapsed = await dbGetSetting('collapsed', []);
        collapsedGroups = new Set(Array.isArray(savedCollapsed) ? savedCollapsed : []);

        // 3. 加载记录
        records = await dbGetAllRecords();

        // 4. 激活当前视图
        document.querySelectorAll('.view-tab').forEach(tab => {
            tab.classList.toggle('active-tab', tab.dataset.view === currentView);
        });

        // 5. 渲染
        renderList();
        updateStats();

        isReady = true;

        // 6. 迁移成功提示
        if (migrationResult.migrated && migrationResult.count > 0) {
            setTimeout(() => {
                showToast(`已自动迁移 ${migrationResult.count} 条历史记录到 IndexedDB ✨`, 'ri-database-2-line');
            }, 500);
        }
    } catch (e) {
        console.error('应用初始化失败：', e);
        showToast('数据库初始化失败，请刷新重试', 'ri-error-warning-line');
    }
}

initApp();
