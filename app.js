// ==================== 数据管理 ====================
const STORAGE_KEY = 'time_logger_records';

let records = loadRecords();

function loadRecords() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function saveRecords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

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

// ==================== 记录功能 ====================
function addRecord() {
    const now = Date.now();
    const record = {
        id: now + '_' + Math.random().toString(36).slice(2, 8),
        timestamp: now,
        note: ''
    };
    records.unshift(record);
    saveRecords();
    renderList(true);
    updateStats();

    // 按钮波动效果
    const btn = document.getElementById('recordBtn');
    btn.classList.add('pulse-effect');
    setTimeout(() => btn.classList.remove('pulse-effect'), 800);

    showToast(`已记录：${formatTime(now)}`, 'ri-time-line');
}

function deleteRecord(id) {
    records = records.filter(r => r.id !== id);
    saveRecords();
    renderList();
    updateStats();
    showToast('已删除该记录', 'ri-delete-bin-line');
}

function updateNote(id, note) {
    const record = records.find(r => r.id === id);
    if (record) {
        record.note = note;
        saveRecords();
    }
}

function clearAll() {
    if (records.length === 0) {
        showToast('暂无记录可清空', 'ri-information-line');
        return;
    }
    if (!confirm(`确定要清空全部 ${records.length} 条记录吗？此操作不可恢复。`)) return;
    records = [];
    saveRecords();
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
        // 兼容方案
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

function renderList(highlightFirst = false) {
    const listEl = document.getElementById('recordList');
    const filtered = getFilteredSortedRecords();

    if (filtered.length === 0) {
        const isSearching = document.getElementById('searchInput').value.trim();
        listEl.innerHTML = `
            <div class="py-20 text-center">
                <div class="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                    <i class="${isSearching ? 'ri-search-line' : 'ri-inbox-line'} text-5xl text-indigo-400"></i>
                </div>
                <p class="text-gray-500 font-medium">${isSearching ? '没有匹配的记录' : '还没有任何记录'}</p>
                <p class="text-sm text-gray-400 mt-1">${isSearching ? '试试其他关键词吧' : '点击左侧大按钮开始记录吧 ✨'}</p>
            </div>
        `;
        return;
    }

    // 排序后用于计算间隔（按时间正序）
    const timeSorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
    const indexMap = new Map();
    timeSorted.forEach((r, i) => indexMap.set(r.id, i));

    listEl.innerHTML = filtered.map((r, idx) => {
        const orderNum = indexMap.get(r.id) + 1;
        const prevRecord = timeSorted[indexMap.get(r.id) - 1];
        const gap = prevRecord ? r.timestamp - prevRecord.timestamp : null;
        const gapStr = gap !== null ? `+${formatGap(gap)}` : '起点';
        const ago = formatDuration(Date.now() - r.timestamp);
        const isNew = highlightFirst && idx === 0 && document.getElementById('sortSelect').value === 'desc';

        const colors = [
            ['from-indigo-500', 'to-purple-500'],
            ['from-pink-500', 'to-rose-500'],
            ['from-emerald-500', 'to-teal-500'],
            ['from-amber-500', 'to-orange-500'],
            ['from-blue-500', 'to-cyan-500'],
            ['from-fuchsia-500', 'to-pink-500']
        ];
        const [c1, c2] = colors[orderNum % colors.length];

        return `
            <div class="record-item ${isNew ? 'new-item' : ''} px-6 py-4 hover:bg-gray-50 transition group" data-id="${r.id}">
                <div class="flex items-start gap-4">
                    <!-- 序号徽章 -->
                    <div class="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${c1} ${c2} flex items-center justify-center text-white font-bold shadow-md">
                        ${orderNum < 100 ? `#${orderNum}` : orderNum}
                    </div>

                    <!-- 内容区 -->
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap mb-1">
                            <span class="font-mono font-semibold text-gray-800 text-lg">${formatTime(r.timestamp)}</span>
                            <span class="text-sm text-gray-500">${formatDate(r.timestamp)}</span>
                            <span class="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-xs">${getWeekDay(r.timestamp)}</span>
                            <span class="px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full text-xs flex items-center gap-1">
                                <i class="ri-arrow-right-up-line"></i>${gapStr}
                            </span>
                            <span class="text-xs text-gray-400">${ago.value}${ago.unit}</span>
                        </div>
                        <input type="text"
                            class="note-input w-full mt-1 px-2 py-1 text-sm bg-transparent border border-transparent hover:border-gray-200 focus:border-indigo-300 focus:bg-white rounded transition outline-none"
                            placeholder="点击添加备注..."
                            value="${(r.note || '').replace(/"/g, '&quot;')}"
                            data-id="${r.id}">
                    </div>

                    <!-- 删除按钮 -->
                    <button class="delete-btn flex-shrink-0 w-9 h-9 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 opacity-0 group-hover:opacity-100 transition flex items-center justify-center" data-id="${r.id}" title="删除">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== 统计更新 ====================
function updateStats() {
    document.getElementById('totalCount').textContent = records.length;

    if (records.length === 0) {
        document.getElementById('lastInterval').textContent = '--';
        document.getElementById('lastIntervalUnit').textContent = '尚无记录';
        return;
    }

    const latest = records.reduce((a, b) => a.timestamp > b.timestamp ? a : b);
    const ago = formatDuration(Date.now() - latest.timestamp);
    document.getElementById('lastInterval').textContent = ago.value;
    document.getElementById('lastIntervalUnit').textContent = ago.unit;
}

// 每秒更新"距上次"显示
setInterval(() => {
    if (records.length > 0) updateStats();
}, 1000);

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

// 列表事件委托
document.getElementById('recordList').addEventListener('click', (e) => {
    const delBtn = e.target.closest('.delete-btn');
    if (delBtn) {
        deleteRecord(delBtn.dataset.id);
    }
});

document.getElementById('recordList').addEventListener('change', (e) => {
    if (e.target.classList.contains('note-input')) {
        updateNote(e.target.dataset.id, e.target.value);
        showToast('备注已保存', 'ri-edit-line');
    }
});

// 阻止备注框输入触发空格快捷键
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        document.getElementById('recordBtn').click();
    }
});

// 初始化渲染
renderList();
updateStats();
