#!/usr/bin/env python3
"""把表單 (data/songs.xlsx，或 Google 試算表 CSV 網址) 轉成 App 用的 data/songs.json。

只輸出「已確認」的歌曲：排除「待建置」列，且至少一家 KTV 已填 O 或 X。
用法：
  python scripts/build_data.py                 # 讀 data/songs.xlsx
  python scripts/build_data.py --csv <網址>     # 讀 Google 試算表「發佈到網路」的 CSV
"""
import argparse, csv, hashlib, io, json, os, sys, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KTVS = ["凱悅", "星光", "覓夜", "超巨"]
HEADER = ["歌手", "歌名", "假名/羅馬音", "中文", "動漫", "類型", "年分"] + KTVS + ["備註"]


def clean(v):
    if v is None:
        return ""
    s = str(v).strip()
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]
    return s


def rows_from_xlsx(path):
    import openpyxl
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    return rows[0], rows[1:]


def rows_from_csv(url):
    with urllib.request.urlopen(url) as r:
        rows = list(csv.reader(io.StringIO(r.read().decode("utf-8-sig"))))
    return rows[0], rows[1:]


def none_if_x(s):
    return "" if s.upper() == "X" else s


def ktv_state(s):
    s = s.upper()
    if s in ("O", "Ｏ", "V", "○"):
        return 1
    if s in ("X", "Ｘ", "×"):
        return 0
    return None  # 空白 = 待確認


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=os.environ.get("SHEET_CSV_URL") or None)
    ap.add_argument("--xlsx", default=os.path.join(ROOT, "data", "songs.xlsx"))
    a = ap.parse_args()
    header, rows = rows_from_csv(a.csv) if a.csv else rows_from_xlsx(a.xlsx)
    idx = {clean(h): i for i, h in enumerate(header) if h}
    missing = [h for h in HEADER if h not in idx]
    if missing:
        sys.exit(f"表單缺少欄位: {missing}")

    meta = json.load(open(os.path.join(ROOT, "data", "meta.json"), encoding="utf-8"))
    alias, artists, anime = meta["artistAlias"], meta["artists"], meta["anime"]

    songs, skipped = [], 0
    for r in rows:
        g = lambda k: clean(r[idx[k]]) if idx[k] < len(r) else ""
        artist, title = g("歌手"), g("歌名")
        if not artist or not title or "待建置" in (artist + title):
            skipped += bool(artist or title)
            continue
        ktv = {k: ktv_state(g(k)) for k in KTVS}
        if all(v is None for v in ktv.values()):
            skipped += 1
            continue
        artist = alias.get(artist, artist)
        raw_anime = none_if_x(g("動漫"))
        am = anime.get(raw_anime, {})
        year = g("年分")
        songs.append({
            "id": hashlib.md5(f"{artist}|{title}".encode()).hexdigest()[:8],
            "title": title,
            "kana": none_if_x(g("假名/羅馬音")),
            "zh": none_if_x(g("中文")),
            "artist": artist,
            "artistType": artists.get(artist, "other"),
            "anime": raw_anime,
            "animeZh": am.get("zh", raw_anime),
            "animeJa": am.get("ja", raw_anime),
            "animeKana": am.get("kana", ""),
            "type": none_if_x(g("類型")),
            "year": int(year) if year.isdigit() else None,
            "ktv": ktv,
            "note": g("備註"),
        })

    path = os.path.join(ROOT, "data", "songs.json")
    updated = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:  # 資料沒變就保留原本的更新時間，避免每天產生無意義的提交
        old = json.load(open(path, encoding="utf-8"))
        if old.get("songs") == songs:
            updated = old["updated"]
    except (OSError, ValueError, KeyError):
        pass
    out = {
        "updated": updated,
        "ktvs": KTVS,
        "songs": songs,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    unknown = sorted({s["artist"] for s in songs if s["artistType"] == "other"})
    print(f"已確認 {len(songs)} 首，略過 {skipped} 列待確認/待建置")
    if unknown:
        print("提醒：以下歌手尚未在 data/meta.json 分類 →", ", ".join(unknown))


if __name__ == "__main__":
    main()
