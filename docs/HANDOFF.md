# 交接備忘（HANDOFF）

> 這份文件記錄**程式碼本身看不出來**的脈絡：待辦事項、關鍵設計決策、踩過的坑。
> 新對話請先讀 `README.md` 與 `docs/RULES.md`，再讀這份。

---

## 一、專案現況

| 項目 | 狀態 |
|---|---|
| 位置 | `C:\Users\kai\Documents\DSH\卡牌遊戲-氣脈 Qimai\qimai` |
| 技術棧 | Angular 22 + TypeScript 6 + Tailwind CSS 4 + Vitest |
| 套件管理 | Bun（`bun install` / `bun run start` / `bun run test`） |
| 測試 | **108 個全綠** |
| git | 工作樹乾淨，最新 commit `f53ef1a` |

### 建置指令

```bash
bun run start        # 開發伺服器 http://localhost:4200
bun run test         # 執行測試
bun run build        # 正式建置 → dist/qimai/browser
bun run build:pages  # GitHub Pages 用（base href /qimai/）
```

若 `pwsh` 回報 `ENOENT` 指向 `WindowsApps\...\pwsh.exe`，那是 Store 版 PowerShell 被更新導致舊版本路徑失效；重開 DSH 通常可解。

---

## 二、待辦事項

### 1. 裝備卡「右邊重複顯示卡名」— 需要問清楚

使用者的原話是「裝備卡右邊重複顯示了卡名」。

已 grep 過 `app.html`，裝備區只有**一處**渲染卡名：

```html
<button ...>
  <div [innerHTML]="artOf(e.defId)"></div>   <!-- 卡圖 -->
  <span>{{ nameOf(e.defId) }}</span>          <!-- 卡名，只有一次 -->
</button>
```

`card-detail.ts` 也只有一處。**判斷不出「重複」在哪**，需要使用者指出是哪個畫面（場上裝備區／詳細浮層／其他）。

### 2. 觸控裝置看不到卡片資訊 ⚠️

卡片資訊現在**只靠 hover 浮層**顯示（左側面板與點擊查看都已移除）。觸控裝置沒有 hover，所以：

- **開局選生命卡時沒辦法判斷要選哪張**（最嚴重）
- 各種卡片都看不到效果

建議做法（已與使用者提過，尚未實作）：**長按顯示浮層**。

### 3. GitHub Pages 還沒部署成功

`Get Pages site failed` → **repository 的 Pages 尚未啟用**。已在 `deploy.yml` 加上：

```yaml
- uses: actions/configure-pages@v5
  with:
    enablement: true
```

需要 push 後才會生效；或者手動到 **Settings → Pages → Source 選 "GitHub Actions"**。

repo：`https://github.com/wkai2573/qimai`

---

## 三、關鍵設計決策（為什麼這樣做）

### 生命區 = 重構次數，不是傳統血量

這是整個遊戲的核心，**已與使用者確認過**：

- 受到傷害 → 牌組的卡沖進怒氣區（**不扣血**）
- 牌組抽乾 → 觸發「重構」→ 才真的少一張生命卡
- 生命卡橫置 = 支付費用，重置階段復原（**不是扣血**）
- 唯一的勝負條件是生命區歸零

### 引擎完全獨立於 Angular

`src/app/game/` 底下**不 import 任何 Angular API**。好處：Vitest 不需要 TestBed、未來做連線對戰可直接搬到伺服器、換 UI 框架不動規則。**請維持這個邊界**。

### 其他

| 決策 | 理由 |
|---|---|
| Seeded RNG（非 `Math.random()`） | 同一 seed 可重播、測試不隨機失敗、連線對戰只需傳種子 |
| 卡表資料驅動 | 新增卡片只改 `cards.ts`，不動引擎 |
| 連招用 `comboBonus` 欄位而非 buff | 只強化「那一擊」，避免滾雪球 |
| 卡圖是手寫 inline SVG | 零外部資源、離線可跑、體積為零 |
| 拖曳用 Pointer Events | HTML5 DnD 在觸控裝置幾乎不能用 |
| 通用 `PendingChoice` 機制 | 開局選生命卡、檢索選牌共用同一套「暫停等玩家選」 |

---

## 四、踩過的坑（別再踩一次）

### CSS

- **`overflow-y: auto` 會讓 `overflow-x` 變成 `auto`**（規範規定），於是 hover 時 `scale(1.04)` 放大的卡牌就足以叫出橫向卷軸。修法：`overflow-x: clip`。
- **grid 的 `1fr` 是 `minmax(auto, 1fr)`**，內容太寬時拒絕收縮，會把整個版面撐爆。要用 `minmax(0, 1fr)`。
- **`inline-flex` 的按鈕放在一般 block 容器內會產生一行基線間隙**，比旁邊的 flex item 矮一截。容器加 `flex` 可解。
- 浮層若放在有 `transform` 的祖先內（例如 `anim-deal`），`position: fixed` 會改成相對該元素定位而被裁切。

### Angular Signals

- **`computed` 用 `Object.is` 比較**。引擎是就地修改陣列，若 computed 回傳同一個陣列參考，下游不會收到通知。已知解法：
  - `game-store.ts` 的 `publish()` 對 `sides` 做淺拷貝
  - `app.ts` 的 `hand` computed 回傳副本 `[...array]`
- 這個 bug 的症狀很陰：**畫面看起來正常**（header 讀了 `store.state().seed` 順手讓模板重跑），但**排版 effect 不會重跑**，導致抽牌時手牌來不及收窄而溢出。

### PowerShell 批次改檔

- Windows 檔案是 **CRLF**，here-string 是 LF——多行 `Contains` / `Replace` 會靜默失敗。用單行錨點，或明確用 `` "`r`n" `` 組字串。
- **不要寫 `$c = MyFunc $c ...` 這種函式**，函式內未被捕捉的輸出（例如 `"[OK] ..."`）會被一起賦值，把 `$c` 變成陣列並寫壞檔案。用 `Write-Host` 或 `$log += ...` 累積訊息。

---

## 五、檔案導覽

```
src/app/
├── game/                    純 TS 規則引擎（零 Angular 依賴）
│   ├── types.ts             型別、規則常數（RULES）
│   ├── rng.ts               seeded RNG
│   ├── cards.ts             卡表、預設牌組、構築驗證
│   ├── internal.ts          抽牌、重構、區域移動、費用支付
│   ├── effects.ts           效果結算、條件判定、檢索（互動）
│   ├── quests.ts            任務雙面條件
│   ├── combat.ts            戰鬥階段
│   ├── engine.ts            回合流程、開局、通用選擇
│   └── ai.ts                NPC 決策（接受 seat 參數，可 AI 對 AI）
├── game-store.ts            Signals 封裝 + NPC 回合排程
├── card-view.ts             卡牌（卡名 + 卡圖 + 招式階級圈）
├── card-detail.ts           卡片詳細資訊（浮層與面板共用）
├── card-art.ts              32+ 張卡的 inline SVG
├── hand-layout.ts           手牌自動排版（純函式，可測）
├── drag-utils.ts            拖曳手勢判定（純函式，可測）
├── rules.ts                 遊戲內規則說明資料
└── app.ts / app.html        主介面
```

### 測試分布

| 檔案 | 內容 |
|---|---|
| `game/engine.spec.ts` | 規則引擎（58 項，含開局／檢索選擇） |
| `game/simulation.spec.ts` | 100 局 AI 對 AI 完整對局 |
| `app.spec.ts` | UI 互動（hover 浮層、規則彈窗、進度條） |
| `card-view.spec.ts` | 招式階級圈映射 |
| `hand-layout.spec.ts` / `drag-utils.spec.ts` | 純函式邊界值 |
| `game-store.spec.ts` | Signal 通知鏈、節奏設定 |
| `card-art.spec.ts` | 用 DOMParser 驗證 SVG 合法性 |

---

## 六、介面現況（改過很多輪，以這裡為準）

### 版面順序

```
header（標題、回合、節奏設定、新對局、規則？）
├─ 對手手牌（卡背）
├─ 對手場面（生命／裝備／任務）
├─ 對手資源堆疊（牌組／怒氣／棄牌／達成）
├─ ──── 對峙線 ────
├─ 戰鬥區（橙，招式卡拖到這裡出招）
├─ ──── 對峙線 ────
├─ 我方資源堆疊
├─ 我方場面 = 行動區（綠，非招式卡拖到這裡使用）
├─ 回合流程進度條
├─ 控制列（爆發／進入戰鬥／結束回合 + 階段提示）
├─ 我方手牌（最底部，貼近畫面下緣）
footer（日誌，橫幅）
```

### 操作

| 操作 | 行為 |
|---|---|
| **hover 任何卡片** | 顯示詳細資訊浮層（唯一途徑） |
| **點擊手牌** | 直接使用／出招 |
| **拖曳手牌** | 招式 → 戰鬥區；其他 → 我方場面（行動區） |
| 點資源堆疊（怒氣／棄牌／生命／等級） | 開啟內容清單（清單內的卡可再 hover） |
| 拖曳出不起的卡 | 幽靈卡變灰 + 顯示「費用不足」 |
| 右上角 ⚙ | 對局節奏（快／一般／慢／很慢，會記憶） |
| 右上角 ？ | 規則說明（首次遊玩自動開啟） |

### 已知的顯示取捨

- 卡片上**只有卡名 + 卡圖 + 招式階級圈**，其餘資訊全在 hover 浮層
- 任務條件不在牌桌上顯示，hover 任務卡才看得到
- 這是為了「對局中不要塞太多文字」而做的取捨，如果覺得資訊取得太慢可以再討論
