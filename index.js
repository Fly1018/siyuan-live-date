/**
 * siyuan-live-date —— 让指定文档/笔记本里的日期"活着"
 *
 * 生效范围（满足其一即可）：
 *   1) 文档块上带 custom-live-date 属性；
 *   2) 文档所在笔记本在「插件设置 → 生效笔记本」列表里（一行一个笔记本 ID，默认为空）。
 * 生效范围内：@today / @now 标记换成当天日期；带 custom-live-date 属性的块也刷成当天日期。
 *
 * 只改 DOM 显示，不改块数据。
 */
const siyuan = require("siyuan");
const { Plugin, Setting, showMessage } = siyuan;

// 属性名：文档块上写 = 开启本文档；普通块上写 = 该块显示日期（值即格式）
const ATTR = "custom-live-date";

// 配置文件名（存在 data/storage/petal/siyuan-live-date/ 下）
const CFG_FILE = "settings.json";

// 默认设置：笔记本白名单留空，靠文档属性开启；调试日志默认关
const DEFAULT_CFG = {
    notebooks: "",
    debug: false,
};

// 界面文案兜底（中文）。思源会给 this.i18n 装上当前语言的 i18n/*.json，
// 万一当前语言没有对应文件，就用这里的文案，避免界面上出现裸 key。
const FALLBACK = {
    settingTitle: "动态日期设置",
    notebookTitle: "生效笔记本",
    notebookDesc: "这些笔记本下的文档不用加属性也会自动刷新日期。点下面的按钮可以把当前文档所在笔记本填进来，改完点确定。",
    notebookPlaceholder: "一行一个笔记本 ID，留空表示只靠文档属性生效",
    debugTitle: "调试日志",
    debugDesc: "把每次实际替换写进 data/storage/petal/siyuan-live-date/debug.json，排障用。",
    shortcutTitle: "快捷操作",
    shortcutDesc: "把当前文档所在笔记本加入上面的列表。",
    addButton: "加入当前文档所在笔记本",
    addDone: "已加入：",
    addDup: "已在列表里：",
    addFail: "读取笔记本 ID 失败",
    noDoc: "没有取到当前文档所在的笔记本，请先打开一篇文档",
    openSetting: "动态日期：打开设置",
    slashTag: "动态日期",
};

// 这些容器里的文本不碰（代码块、公式块、HTML 块、以及一切不可编辑区域）
const SKIP_SELECTOR = '[contenteditable="false"], [data-type="NodeCodeBlock"], [data-type="NodeMathBlock"], [data-type="NodeHTMLBlock"]';

// 未生效结论的缓存时间（毫秒）
const TTL_NEGATIVE = 3000;
// 已生效结论的缓存时间
const TTL_POSITIVE = 60000;
// 缓存上限，防止长期运行缓慢增长
const CACHE_MAX = 300;
// debug 写盘合并窗口
const FLUSH_INTERVAL = 5000;

/**
 * 兼容 fetchPost 的三种形态：
 *   1) siyuan.fetchPost —— Promise 式或 callback 式都接
 *   2) 全局 fetchPost
 *   3) 原生 fetch
 */
function request(url, data) {
    const send = (fn) => new Promise((resolve, reject) => {
        let settled = false;
        const done = (res) => {
            if (!settled) {
                settled = true;
                resolve(res);
            }
        };
        try {
            const ret = fn(url, data, done);
            if (ret && typeof ret.then === "function") {
                ret.then(done, (e) => {
                    if (!settled) {
                        settled = true;
                        reject(e);
                    }
                });
            }
        } catch (e) {
            if (!settled) {
                settled = true;
                reject(e);
            }
        }
    });

    if (siyuan && typeof siyuan.fetchPost === "function") {
        return send(siyuan.fetchPost);
    }
    if (typeof fetchPost === "function") {
        return send(fetchPost);
    }
    return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data || {}),
    }).then((r) => r.json());
}

function formatDate(pattern) {
    const d = new Date();
    const pad = (n) => (n < 10 ? "0" : "") + n;
    const weeks = ["日", "一", "二", "三", "四", "五", "六"];
    const fmt = pattern && /yyyy|yy|MM|dd|HH|mm|ss|ECN/.test(pattern) ? pattern : "yyyy-MM-dd";
    const map = {
        yyyy: String(d.getFullYear()),
        yy: String(d.getFullYear()).slice(-2),
        MM: pad(d.getMonth() + 1),
        dd: pad(d.getDate()),
        HH: pad(d.getHours()),
        mm: pad(d.getMinutes()),
        ss: pad(d.getSeconds()),
        ECN: weeks[d.getDay()],
    };
    return fmt.replace(/yyyy|yy|MM|dd|HH|mm|ss|ECN/g, (m) => map[m]);
}

class LiveDatePlugin extends Plugin {

    async onload() {
        this.cfg = Object.assign({}, DEFAULT_CFG);
        this.notebookList = [];
        this.renderEvent = this.render.bind(this);
        this.updateEvent = this.onUpdate.bind(this);
        this.destroyEvent = this.onDestroy.bind(this);
        this.docCache = new Map(); // rootID -> { ok, at }
        this.boxCache = new Map(); // rootID -> boxID
        this.currentProtyle = null;
        this.debugLog = [];

        // 先读配置，再挂事件，避免首屏渲染用不上白名单
        await this.loadCfg();

        this.eventBus.on("loaded-protyle-static", this.renderEvent);
        this.eventBus.on("switch-protyle", this.renderEvent);
        this.eventBus.on("ws-main", this.updateEvent);
        this.eventBus.on("destroy-protyle", this.destroyEvent);

        this.protyleSlash = [{
            filter: ["dqr", "live"],
            html: "<span>" + this.t("slashTag") + " <b>@today</b></span>",
            id: "live-date",
            callback: (protyle) => {
                protyle.insert("【@today】", false);
            },
        }];

        this.addSetting();
        this.addCommand({langKey: "openSetting", hotkey: "", callback: () => this.openSetting()});
        this.record("onload", true);
    }

    onunload() {
        this.eventBus.off("loaded-protyle-static", this.renderEvent);
        this.eventBus.off("switch-protyle", this.renderEvent);
        this.eventBus.off("ws-main", this.updateEvent);
        this.eventBus.off("destroy-protyle", this.destroyEvent);
        if (this.timer) {
            clearTimeout(this.timer);
        }
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
        }
    }

    /* ---------- 文案 ---------- */

    t(key) {
        if (this.i18n && typeof this.i18n[key] === "string") {
            return this.i18n[key];
        }
        return FALLBACK[key] || key;
    }

    /* ---------- 配置 ---------- */

    async loadCfg() {
        try {
            const saved = await this.loadData(CFG_FILE);
            if (saved && typeof saved === "object") {
                this.cfg = Object.assign({}, DEFAULT_CFG, saved);
            }
        } catch (e) {
            console.warn("[live-date] 读取配置失败", e);
        }
        if (typeof this.cfg.notebooks !== "string") {
            this.cfg.notebooks = "";
        }
        this.refreshNotebooks();
    }

    // 把「一行一个 ID」的文本解析成数组（逗号、空格、换行都认）
    refreshNotebooks() {
        this.notebookList = String(this.cfg.notebooks || "")
            .split(/[\s,，]+/)
            .map((s) => s.trim())
            .filter(Boolean);
    }

    async saveCfg() {
        try {
            await this.saveData(CFG_FILE, this.cfg);
        } catch (e) {
            console.warn("[live-date] 保存配置失败", e);
        }
    }

    // 当前文档所在笔记本 ID（用于设置里的「加入白名单」按钮）
    currentBoxId() {
        const protyle = this.currentProtyle;
        const rootID = protyle && protyle.block ? protyle.block.rootID : "";
        if (!rootID) {
            return Promise.resolve("");
        }
        return this.boxOf(protyle, rootID);
    }

    /* ---------- 设置面板 ---------- */

    addSetting() {
        const elNotebooks = document.createElement("textarea");
        elNotebooks.className = "b3-text-field fn__block";
        elNotebooks.rows = 4;
        elNotebooks.style.fontFamily = "var(--b3-font-family-code)";
        elNotebooks.style.fontSize = "12px";
        elNotebooks.placeholder = this.t("notebookPlaceholder");

        const elDebug = document.createElement("input");
        elDebug.type = "checkbox";
        elDebug.className = "b3-switch fn__flex-center";

        const btnAdd = document.createElement("button");
        btnAdd.className = "b3-button b3-button--outline fn__size200";
        btnAdd.textContent = this.t("addButton");
        const self = this;
        btnAdd.addEventListener("click", () => {
            self.currentBoxId().then((box) => {
                if (!box) {
                    showMessage(self.t("noDoc"), 3000, "info");
                    return;
                }
                const list = String(elNotebooks.value || "")
                    .split(/[\s,，]+/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                if (list.indexOf(box) > -1) {
                    showMessage(self.t("addDup") + box, 3000, "info");
                    return;
                }
                list.push(box);
                elNotebooks.value = list.join("\n");
                showMessage(self.t("addDone") + box, 3000, "info");
            }, () => {
                showMessage(self.t("addFail"), 3000, "error");
            });
        });

        this.setting = new Setting({
            confirmCallback: () => {
                self.cfg.notebooks = elNotebooks.value;
                self.cfg.debug = elDebug.checked;
                self.refreshNotebooks();
                self.docCache.clear();
                self.saveCfg();
            },
        });

        this.setting.addItem({
            title: this.t("notebookTitle"),
            description: this.t("notebookDesc"),
            direction: "column",
            createActionElement: () => {
                elNotebooks.value = String(self.cfg.notebooks || "");
                return elNotebooks;
            },
        });
        this.setting.addItem({
            title: this.t("debugTitle"),
            description: this.t("debugDesc"),
            createActionElement: () => {
                elDebug.checked = !!self.cfg.debug;
                return elDebug;
            },
        });
        this.setting.addItem({
            title: this.t("shortcutTitle"),
            description: this.t("shortcutDesc"),
            createActionElement: () => btnAdd,
        });
    }

    openSetting() {
        if (!this.setting) {
            this.addSetting();
        }
        this.setting.open(this.t("settingTitle"));
    }

    /* ---------- 自检记录（合并写盘，不每次渲染都写） ---------- */

    record(text, immediate) {
        if (!this.cfg || !this.cfg.debug) {
            return;
        }
        this.debugLog.push(new Date().toISOString() + " " + text);
        if (this.debugLog.length > 30) {
            this.debugLog.shift();
        }
        if (immediate) {
            this.flush();
            return;
        }
        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => {
                this.flushTimer = null;
                this.flush();
            }, FLUSH_INTERVAL);
        }
    }

    flush() {
        try {
            this.saveData("debug.json", this.debugLog);
        } catch (e) {
            // 记录失败不影响主流程
        }
    }

    /* ---------- 事件 ---------- */

    // 只在真正的文档事务后重扫；顺带让当前文档的开关结论失效（属性可能刚改）
    onUpdate({ detail }) {
        if (detail && detail.cmd !== "transactions") {
            return;
        }
        const protyle = this.currentProtyle;
        if (!protyle) {
            return;
        }
        const rootID = protyle.block && protyle.block.rootID;
        if (rootID) {
            this.docCache.delete(rootID);
        }
        if (this.timer) {
            return;
        }
        this.timer = setTimeout(() => {
            this.timer = null;
            if (protyle.wysiwyg && protyle.wysiwyg.element) {
                try {
                    this.apply(protyle);
                } catch (e) {
                    console.error("[live-date]", e);
                }
            }
        }, 600);
    }

    onDestroy({ detail }) {
        if (detail && detail.protyle === this.currentProtyle) {
            this.currentProtyle = null;
        }
    }

    render({ detail }) {
        const protyle = detail && detail.protyle;
        if (!protyle || !protyle.wysiwyg || !protyle.wysiwyg.element) {
            return;
        }
        this.currentProtyle = protyle;
        this.apply(protyle);
    }

    /* ---------- 主流程 ---------- */

    apply(protyle) {
        const rootID = protyle.block && protyle.block.rootID;
        if (!rootID) {
            return;
        }
        this.docEnabled(protyle, rootID).then((ok) => {
            if (!ok || !protyle.wysiwyg || !protyle.wysiwyg.element) {
                return;
            }
            const mark = this.renderMarkers(protyle.wysiwyg.element);
            const attr = this.renderAttrs(protyle.wysiwyg.element);
            if (mark || attr) {
                this.record("render doc=" + rootID + " markers=" + mark + " attrs=" + attr);
            }
        });
    }

    // 文档所在笔记本：优先用 protyle 现成字段，取不到再查一次
    boxOf(protyle, rootID) {
        if (protyle && typeof protyle.notebookId === "string" && protyle.notebookId) {
            return Promise.resolve(protyle.notebookId);
        }
        const hit = this.boxCache.get(rootID);
        if (hit) {
            return Promise.resolve(hit);
        }
        return request("/api/query/sql", {
            stmt: "SELECT box FROM blocks WHERE id = '" + rootID + "'",
        }).then((res) => {
            const rows = (res && res.data) || [];
            const box = rows.length ? rows[0].box : "";
            this.setCache(this.boxCache, rootID, box);
            return box;
        }).catch(() => "");
    }

    docEnabled(protyle, rootID) {
        const hit = this.docCache.get(rootID);
        if (hit && Date.now() - hit.at < (hit.ok ? TTL_POSITIVE : TTL_NEGATIVE)) {
            return Promise.resolve(hit.ok);
        }
        return this.boxOf(protyle, rootID).then((box) => {
            // 笔记本白名单（插件设置里的列表）：直接放行
            if (box && this.notebookList.indexOf(box) > -1) {
                this.setCache(this.docCache, rootID, { ok: true, at: Date.now() });
                return true;
            }
            // 否则看文档属性开关
            return request("/api/attr/getBlockAttrs", { id: rootID }).then((res) => {
                const attrs = (res && res.data) || {};
                const v = attrs[ATTR];
                const off = v === undefined || ["off", "false", "0"].indexOf(String(v).toLowerCase()) > -1;
                const ok = !off;
                this.setCache(this.docCache, rootID, { ok: ok, at: Date.now() });
                return ok;
            });
        }).catch((e) => {
            // 读不到就放行，避免整篇静默失效
            this.record("gate-error doc=" + rootID + " " + (e && e.message ? e.message : e));
            return true;
        });
    }

    setCache(map, key, value) {
        map.set(key, value);
        if (map.size > CACHE_MAX) {
            map.delete(map.keys().next().value);
        }
    }

    /* ---------- 替换 ---------- */

    // @today -> 2026-09-26   @now -> 2026-09-26 12:30:45
    renderMarkers(root) {
        // 先做一次廉价的整体判断，没标记就整篇跳过
        const all = root.textContent;
        if (!all || (all.indexOf("@today") === -1 && all.indexOf("@now") === -1)) {
            return 0;
        }
        let count = 0;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const value = node.nodeValue;
            if (!value || (value.indexOf("@today") === -1 && value.indexOf("@now") === -1)) {
                continue;
            }
            // 代码块 / 公式块 / HTML 块 / 其它不可编辑区域：不动
            const parent = node.parentElement;
            if (parent && parent.closest(SKIP_SELECTOR)) {
                continue;
            }
            node.nodeValue = value
                .replace(/@now/g, formatDate("yyyy-MM-dd HH:mm:ss"))
                .replace(/@today/g, formatDate("yyyy-MM-dd"));
            count++;
        }
        return count;
    }

    // 带 custom-live-date 属性的块：第一个文本节点刷成当天日期
    renderAttrs(root) {
        let count = 0;
        root.querySelectorAll("[" + ATTR + "]").forEach((el) => {
            const type = el.getAttribute("data-type");
            if (type === "NodeCodeBlock" || type === "NodeMathBlock" || type === "NodeHTMLBlock") {
                return;
            }
            const text = formatDate(el.getAttribute(ATTR));
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            const node = walker.nextNode();
            if (node && node.nodeValue !== text) {
                node.nodeValue = text;
                count++;
            }
        });
        return count;
    }
}

module.exports = LiveDatePlugin;
