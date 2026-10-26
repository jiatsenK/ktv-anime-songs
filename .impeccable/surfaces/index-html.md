---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["app.js","style.css"]
---

# Surface brief：查歌主畫面（index.html）

Mode: Operate（現場查歌工具）。使用者在暗包廂單手查歌，查到後把日文歌名與歌手抄進點歌機。
Constraints: 純靜態、無框架、GitHub Pages；功能全保留（搜尋、分類、歌單、分享、反饋、回報、贊助）。只顯示有確認資料的 KTV（目前凱悅、星光）。歌手顯示日文原名，中文名降為輔助。深淺色跟隨系統，可在設定覆寫。
Unresolved: 部分歌手日文原名待站主確認（meta.json artistJa）。

## Direction contract
THESIS: 每首歌是一張動畫 OP 標題字卡——巨大極粗明朝體的日文歌名＋歌手，其他一律退成小字；拒絕「圓角粉彩卡片＋標籤雲」的查詢 App 預設。
OWN-WORLD: 近黑底（淺色版為冷白紙），白／黑墨字，極粗明朝（Noto Serif JP/TC 900）只給歌名與站名，介面用無襯線。一個霓虹洋紅負責選取與品牌，一個霓虹青綠只代表「可點播」燈號。髮絲線分隔，不用陰影卡片、不用 emoji，圖示為自繪 SVG 單一線寬。
STORY: 使用者知道這首歌在哪家點得到、要輸入什麼字；點一下歌名就複製，帶著字去點歌機。
FIRST VIEWPORT: 頂部 sticky 一列：明朝站名「動漫KTV」左、設定齒輪右；其下大搜尋框，再下六等分底線分頁。之後即是字卡清單，第一張在 390×844 的 y≈200 內出現。
FORM: 黑底標題字卡清單（grounded 第 1 名，使用者在回合中指定）；seed:bb25c1c9de6b0408。招牌動作：點歌名複製時整張字卡做一次黑白反相「切卡」。
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
