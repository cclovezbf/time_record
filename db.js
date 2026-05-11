// ==================== IndexedDB 数据库（基于 Dexie.js） ====================
// 数据库结构定义
const db = new Dexie('TimeLoggerDB');

db.version(1).stores({
    // ++id: 自增主键
    // timestamp: 索引（按时间查询/排序）
    // 其它字段（note）不建索引
    records: '++id, timestamp',
    // 应用配置（视图选择、折叠状态等）
    settings: 'key'
});

// ==================== Records CRUD ====================
async function dbAddRecord(record) {
    // record = { timestamp, note }
    const id = await db.records.add(record);
    return { ...record, id };
}

async function dbGetAllRecords() {
    // 按时间倒序（IndexedDB 索引天然支持）
    return await db.records.orderBy('timestamp').reverse().toArray();
}

async function dbDeleteRecord(id) {
    return await db.records.delete(id);
}

async function dbUpdateRecord(id, changes) {
    return await db.records.update(id, changes);
}

async function dbClearRecords() {
    return await db.records.clear();
}

async function dbCountRecords() {
    return await db.records.count();
}

// 按时间范围统计（利用索引，毫秒级响应）
async function dbCountByRange(startTs, endTs) {
    return await db.records
        .where('timestamp')
        .between(startTs, endTs, true, true)
        .count();
}

// ==================== Settings ====================
async function dbGetSetting(key, defaultVal = null) {
    const item = await db.settings.get(key);
    return item ? item.value : defaultVal;
}

async function dbSetSetting(key, value) {
    return await db.settings.put({ key, value });
}

// ==================== 从 localStorage 自动迁移旧数据 ====================
async function migrateFromLocalStorage() {
    const MIGRATED_KEY = 'time_logger_migrated_v1';
    if (localStorage.getItem(MIGRATED_KEY)) return { migrated: false, count: 0 };

    let migratedCount = 0;
    try {
        // 迁移记录
        const oldData = localStorage.getItem('time_logger_records');
        if (oldData) {
            const oldRecords = JSON.parse(oldData);
            if (Array.isArray(oldRecords) && oldRecords.length > 0) {
                // 转换格式：旧 id 是字符串，IndexedDB 用自增数字 id
                const toInsert = oldRecords.map(r => ({
                    timestamp: r.timestamp,
                    note: r.note || '',
                    legacyId: r.id // 保留旧 id 以备追溯
                }));
                await db.records.bulkAdd(toInsert);
                migratedCount = toInsert.length;
            }
        }

        // 迁移视图设置
        const oldView = localStorage.getItem('time_logger_view');
        if (oldView) {
            await dbSetSetting('view', oldView);
        }

        // 迁移折叠状态
        const oldCollapsed = localStorage.getItem('time_logger_collapsed');
        if (oldCollapsed) {
            try {
                await dbSetSetting('collapsed', JSON.parse(oldCollapsed));
            } catch (e) { /* ignore */ }
        }

        // 标记已迁移，避免重复
        localStorage.setItem(MIGRATED_KEY, '1');

        // 清理旧 localStorage 数据（迁移成功后）
        if (migratedCount > 0) {
            // 安全起见，保留旧记录数据 7 天再清理；这里直接打个备份键
            localStorage.setItem('time_logger_records_backup', oldData || '');
            localStorage.removeItem('time_logger_records');
        }
        localStorage.removeItem('time_logger_view');
        localStorage.removeItem('time_logger_collapsed');

        return { migrated: true, count: migratedCount };
    } catch (e) {
        console.error('数据迁移失败：', e);
        return { migrated: false, count: 0, error: e };
    }
}

// ==================== 容量估算 ====================
async function getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
        try {
            const est = await navigator.storage.estimate();
            return {
                usage: est.usage || 0,
                quota: est.quota || 0,
                supported: true
            };
        } catch (e) {
            return { usage: 0, quota: 0, supported: false };
        }
    }
    return { usage: 0, quota: 0, supported: false };
}
