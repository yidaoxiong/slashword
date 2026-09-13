#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把家长页「导出」下来的自制词库并进项目仓库。

导出的 json 结构和内置的 data/g5a.json 完全一致：
    { "meta": {id, name, grade, source, wordCount, units}, "words": [...] }

本脚本做四件事：
  1. 写一份 data/<id>.json（前端按 id 加载）
  2. 把词条并进 data/all.json（gen_audio.py 靠它生成发音）
  3. 在 data/books.json 里登记，首页"今天学哪本"就会出现
  4. 同步到 public/data/

之后跑 npm run audio 补发音、npm run deploy 上线。

用法：
    python scripts/import_book.py data/u-abc123.json [data/xxx.json ...]
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
PUBLIC_DATA = ROOT / "public" / "data"
ALL_JSON = DATA_DIR / "all.json"
BOOKS_JSON = DATA_DIR / "books.json"


def load_json(path: Path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def sync_public_data():
    """把 data/ 里前端要用的文件同步到 public/data/（all.json 是给脚本用的，不进包）"""
    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
    for f in DATA_DIR.glob("*.json"):
        if f.name == "all.json":
            continue
        shutil.copy2(f, PUBLIC_DATA / f.name)
    print(f"-> 已同步 {len(list(DATA_DIR.glob('*.json'))) - 1} 个文件到 public/data/")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    existing = load_json(ALL_JSON) or []
    catalog = load_json(BOOKS_JSON) or []
    by_id = {w["id"]: w for w in existing}

    for arg in sys.argv[1:]:
        src = Path(arg)
        if not src.exists():
            print(f"!! 找不到文件：{src}", file=sys.stderr)
            continue
        data = json.loads(src.read_text(encoding="utf-8"))
        meta = data["meta"]
        words = data["words"]
        book_id = meta["id"]

        if not words:
            print(f"!! {src.name} 里没有词条，跳过", file=sys.stderr)
            continue

        # 1. 单独存一份，前端按 id 加载
        out = DATA_DIR / f"{book_id}.json"
        out.write_text(
            json.dumps({"meta": meta, "words": words}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"-> 已写出 data/{book_id}.json")

        # 2. 并入 all.json（同 id 覆盖，可以重复导入同一个词库来更新）
        for w in words:
            by_id[w["id"]] = w

        # 3. 登记到词书目录
        entry = {
            "id": book_id,
            "name": meta.get("name") or book_id,
            "grade": meta.get("grade") or "自定义",
            "source": meta.get("source") or "自制词库",
            "wordCount": len(words),
            "unitCount": len(meta.get("units") or []),
        }
        catalog = [c for c in catalog if c["id"] != book_id]
        catalog.append(entry)
        print(f"   登记词书：{entry['name']}（{entry['wordCount']} 词）")

    ALL_JSON.write_text(
        json.dumps(list(by_id.values()), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"-> 已更新 data/all.json（合计 {len(by_id)} 条）")

    BOOKS_JSON.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"-> 已更新 data/books.json（{len(catalog)} 本词书）")

    sync_public_data()

    print("\n下一步：")
    print("  npm run audio     # 给新词生成英音/美音（只生成缺的，几分钟）")
    print("  npm run deploy    # 构建并上线")


if __name__ == "__main__":
    main()
