# 🎤 KTV 動漫歌點播站

台灣 KTV 可點播的日文動漫歌曲查詢 App（PWA，可加入手機主畫面）。

## 功能
- **模糊搜尋**：歌名、歌手、動漫皆可，中文／日文／英文、平假名／片假名、羅馬拼音（長音 ō/ou 通用）
- **分類**：歌手（女歌手／男歌手／樂團）、動漫（50音日文名／中文筆畫）、年份、各家 KTV（凱悅、星光、覓夜、超巨）
- **歌曲卡片**：① 日文名・假名・中譯・歌手 ② 動漫（中日文名）・類別・年份 ③ 4 家 KTV 一排亮燈 ✓／✕／?（待確認）
- **長輩友善**：字級 5 段可調（A－／A＋）、護眼米黃模式（預設）／明亮／夜間，設定會記住
- **日文在前、繁中在後**：歌名、動漫名一律日文先、中文後
- **我的歌單**：可建多個歌單收藏（存在手機／瀏覽器），可產生連結分享給朋友
- **意見回饋、錯誤回報、贊助支持**

只顯示「已確認」的歌曲：排除「待建置」列，且至少一家 KTV 已填 O／X；個別 KTV 空白顯示為「?」待確認。

## 更新資料
1. 編輯表單後覆蓋 `data/songs.xlsx`，push 到 `main` → GitHub Actions 自動轉成 `data/songs.json` 並部署。
2. 或改用 Google 試算表：檔案 → 共用 → 發佈到網路 → 選工作表、格式 CSV，把網址設成 repo 的 **Settings → Secrets and variables → Actions → Variables** 裡的 `SHEET_CSV_URL`。之後每天自動同步（也可在 Actions 手動執行）。
3. 新歌手請在 `data/meta.json` 的 `artists` 加上分類（female／male／band）；新動漫在 `anime` 補上中日文名與讀音（50音排序用）。建置時會提醒未分類的歌手。

本機預覽：
```bash
pip install openpyxl
python scripts/build_data.py
python -m http.server 8000   # 開 http://localhost:8000
```

## 設定
`config.js`：GitHub repo 名稱（意見回饋／錯誤回報開 Issue 用）、可選的 Google 表單網址、贊助連結。

## 部署
repo **Settings → Pages → Source 選 GitHub Actions**，push 後即上線於 `https://<帳號>.github.io/ktv-anime-songs/`。
