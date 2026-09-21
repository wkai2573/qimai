# 氣脈 Qimai

一款單機卡牌對戰遊戲。你與 NPC 各持一副主牌組與任務牌組，透過出招削減對手的牌組、完成任務提升等級，直到對手的生命區歸零。

> **核心設計**：這不是「被打就扣血」的遊戲。
> 傷害會把牌組的卡沖進怒氣區、加速牌組枯竭；直到牌組抽乾觸發「重構」，
> 生命區才會真的少一張。**生命區代表的是「你的牌組還能撐幾次重構」。**

---

## 遊戲特色

- **資源枯竭型賽局** — 勝負取決於牌組管理，不是單純的血量互換
- **雙面任務卡** — 每張任務同時有「我方完成」與「對方阻止」條件，雙方都能看到，互相牽制
- **連招系統** — 同一戰鬥階段內依序打出指定招式組合，後一張獲得額外加成
- **密奧義解放** — 王牌需要滿足前置條件才能打出（例如本回合已用過奧義）
- **可重現的對局** — 每局由亂數種子決定，同一組種子必然產生完全相同的牌序

---

## 快速開始

需要 [Bun](https://bun.sh/)（或改用 npm / pnpm）。

```bash
bun install
bun run start
```

開啟 <http://localhost:4200/>。

### 其它指令

| 指令 | 說明 |
|---|---|
| `bun run start` | 開發伺服器（含熱更新） |
| `bun run build` | 正式建置，輸出到 `dist/qimai/browser` |
| `bun run build:pages` | 建置給 GitHub Pages 用（自動帶入 base href） |
| `bun test` / `bun run test` | 執行測試（Vitest） |

---

## 怎麼玩

遊戲內建完整規則說明：**第一次開啟會自動顯示**，之後隨時可以按右上角的 **？** 再打開。

完整規則文件見 [`docs/RULES.md`](docs/RULES.md)。

> **接手開發的話**：請先讀 [`docs/HANDOFF.md`](docs/HANDOFF.md)——裡面記錄了待辦事項、關鍵設計決策，以及踩過的坑（CSS 溢出、Angular Signals 通知、PowerShell 批次改檔等）。

### 操作

| 操作 | 效果 |
|---|---|
| **滑鼠移入**任何卡片 | 顯示完整資訊浮層 |
| **點擊**手牌 | 直接使用（主要階段）／出招（戰鬥階段） |
| **拖曳**招式卡到戰鬥區 | 出招 |
| **拖曳**其他卡到我方場面（行動區） | 裝備／行動／事件／任務 |
| 點擊怒氣區、棄牌區、生命數字、等級區 | 查看該區內容清單 |
| 右上角 ⚙ | 調整對手思考節奏（快／一般／慢／很慢） |
| 右上角 ？ | 開啟完整規則說明 |

---

## 專案結構

```
src/app/
├── game/                    ← 純 TypeScript 規則引擎，零 Angular 依賴
│   ├── types.ts             型別與規則常數（牌組大小、生命數…）
│   ├── rng.ts               可重現的亂數產生器
│   ├── cards.ts             卡表、預設牌組、構築規則驗證
│   ├── internal.ts          低階操作（抽牌、重構、區域移動）
│   ├── effects.ts           效果結算與條件判定
│   ├── quests.ts            任務雙面條件
│   ├── combat.ts            戰鬥階段
│   ├── engine.ts            回合流程
│   └── ai.ts                NPC 決策
├── game-store.ts            Angular Signals 狀態封裝
├── card-view.ts             卡牌元件
├── card-detail.ts           卡片詳細資訊面板
├── card-art.ts              32 張卡的 inline SVG 圖騰
├── hand-layout.ts           手牌自動排版計算
├── drag-utils.ts            拖曳手勢判定
├── rules.ts                 遊戲規則資料
└── app.ts / app.html        主介面
```

### 為什麼規則引擎獨立成一個資料夾

`src/app/game/` 底下**不 import 任何 Angular API**。這帶來三個好處：

1. 測試不需要啟動 TestBed，用 Vitest 直接跑
2. 之後要做連線對戰，同一份程式碼可以直接搬到伺服器執行（伺服器權威架構）
3. 換 UI 框架不會動到規則

---

## 技術棧

| 層 | 選用 |
|---|---|
| 框架 | Angular 22（Signals、standalone components） |
| 語言 | TypeScript 6 |
| 樣式 | Tailwind CSS 4 |
| 建置 | Angular CLI（esbuild）+ Vite dev server |
| 測試 | Vitest + jsdom |
| 套件管理 | Bun（也可以改用 npm / pnpm） |

---

## 測試

```bash
bun run test
```

近百項測試，涵蓋五個層面：

- **規則引擎** — 構築規則、開局、戰鬥、重構、任務完成／失敗、勝負判定
- **整局模擬** — 100 局 AI 對 AI 完整對局，驗證不會崩潰、不會無限迴圈、同一 seed 可重現
- **卡圖** — 用 `DOMParser` 實際解析 32 張卡的 SVG，避免手寫標籤錯誤默默變成空白
- **排版與手勢** — 手牌間距計算、拖曳門檻與放置判定（抽成純函式以便測邊界值）
- **UI 互動** — 點卡開資訊面板、規則彈窗、回合流程進度條

---

## 部署到 GitHub Pages

### 方法 A：GitHub Actions（推薦）

專案已附 `.github/workflows/deploy.yml`，推上 GitHub 就會自動建置並部署。

**步驟：**

1. 在 GitHub 建立一個名為 `qimai` 的 repository

2. 推送程式碼：

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<你的帳號>/qimai.git
   git push -u origin main
   ```

3. 到 repository 的 **Settings → Pages**

4. 把 **Source** 設為 **GitHub Actions**（不是 "Deploy from a branch"）

5. 回到 **Actions** 頁面確認 workflow 執行成功

6. 網址：`https://<你的帳號>.github.io/qimai/`

> **如果 repository 名稱不是 `qimai`**，要改兩個地方：
>
> - `package.json` 的 `build:pages` 腳本：`--base-href /你的-repo-名/`
> - `.github/workflows/deploy.yml` 的 `path:`：`dist/qimai/browser`
>   （Angular 的輸出目錄名取自 `angular.json` 的專案名稱，與 repo 名無關）

### 方法 B：手動部署

```bash
# 1. 建置（base-href 要對應 repo 名稱）
bun run build:pages

# 2. 用 gh-pages 工具推送
npx angular-cli-ghpages --dir=dist/qimai/browser
```

接著到 **Settings → Pages**，把 Source 設為 **Deploy from a branch**，分支選 `gh-pages`。

### 使用自訂網域

若綁定自訂網域（例如 `qimai.example.com`），網站會發佈在根目錄，
base href 要改回 `/`：

```bash
bunx ng build --base-href /
```

### 常見問題

| 症狀 | 原因 |
|---|---|
| 頁面一片空白 | `base-href` 與實際網址路徑不符（專案頁面需要 `/<repo>/`） |
| 重新整理後 404 | 這是單頁應用的正常行為，改從首頁導航即可；或在 Pages 設定 404 回退 |
| Actions 失敗在建置步驟 | 確認 `angular.json` 的專案名稱與 workflow 的 `path` 一致 |

---

## 開發筆記

幾個刻意的設計決定：

- **Seeded RNG** — 洗牌用可重現的亂數產生器而非 `Math.random()`。好處是同一 seed 能完整重播對局、測試結果穩定不隨機失敗，未來做連線對戰時也只需傳遞種子而非整副牌序。
- **資料驅動的卡表** — 新增卡片只要在 `cards.ts` 加一筆資料，不必改引擎（除非用到全新的 Effect 型別）。
- **連招做成獨立欄位** — 連招加成只強化「打出的那一擊」，不像 buff 會持續到回合結束，避免滾雪球。
- **卡圖是手寫 SVG** — 32 張卡各一組 inline SVG，零外部圖片檔、離線可跑、體積為零。
- **拖曳用 Pointer Events** — 不用 HTML5 Drag and Drop，因為後者在觸控裝置上幾乎不能用。

---

## 授權

MIT
