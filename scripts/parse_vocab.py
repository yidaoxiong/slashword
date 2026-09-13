#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把学校/机构发的单词表 Excel 解析成统一结构的词库 JSON。

设计原则：
- 源表已经带音标 / 词性 / 中文 / 例句，这些是事实数据，直接用，不让 LLM 重造。
- LLM 只负责补"需要改写能力"的字段：儿童友好英英释义、自然拼读切分。
- 输出带 checksum 与统计报告，便于人工抽检。
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

SOURCE_DIR = Path(
    "/Users/ray/Library/Mobile Documents/com~apple~CloudDocs/Alex/英语"
)

BOOKS = [
    {
        "id": "g5a",
        "name": "五年级上 英语单词表",
        "file": SOURCE_DIR / "五年级上英语单词表.xlsx",
        "sheet": "单词表",
        "grade": "五年级上",
        "source": "校内教材",
        "columns": {
            "word": "单词",
            "phonetic": "注音",
            "pos": "词性",
            "cn": "中文含义",
            "ex_en": "例句",
            "ex_cn": "例句中文解释",
            "unit": "所属Unit",
            "unit_title": "单元主题",
            "lesson": "所属Lesson",
            "lesson_title": "课文题目",
        },
    },
    {
        "id": "g4b-houhai",
        "name": "四下 厚海单词表",
        "file": SOURCE_DIR / "四下厚海单词表.xlsx",
        "sheet": "单词表",
        "grade": "四年级下",
        "source": "厚海校外教材",
        "columns": {
            "word": "单词",
            "phonetic": "音标",
            "pos": "词性",
            "cn": "中文含义",
            "ex_en": "英文例句",
            "ex_cn": "例句中文解释",
            "unit": "所属Unit",
            "unit_title": "单元主题",
            "lesson": "所属Lesson",
            "category": "词汇类别",
        },
    },
]


def clean(v):
    if v is None:
        return ""
    return str(v).replace("\u00a0", " ").strip()


def clean_word(raw):
    """把 'maths (=mathematics, AmE math)' 拆成 ('maths', '=mathematics, AmE math')。

    词表里这类括号注释不少（缩写全称、美式拼法、复数形式、可选词），
    直接塞进单词字段会让孩子永远拼不对，必须剥掉。
    但注释本身有价值（比如 AmE math），所以单独留到 note 字段。
    """
    s = clean(raw)
    note = ""
    parts = re.findall(r"\(([^)]*)\)|（([^）]*)）", s)
    if parts:
        note = "; ".join((a or b).strip() for a, b in parts if (a or b).strip())
        s = re.sub(r"\([^)]*\)", "", s)
        s = re.sub(r"（[^）]*）", "", s)
    # 'turn left/right' 这类二选一短语，取第一种作为答案
    if "/" in s:
        s = s.split("/")[0]
    s = s.strip().strip(",").strip()
    s = re.sub(r"\s+", " ", s)
    return s, note


def clean_cn(raw):
    """中文释义同步去掉二选一部分（'左转/右转' -> '左转'）"""
    s = clean(raw)
    if "/" in s:
        s = s.split("/")[0]
    return s.strip()


def split_phonetic(raw):
    """把 '英 /ˈdʒɜːni/  美 /ˈdʒɜːrni/' 或 '/wɪtʃ/' 拆成 (uk, us)。"""
    s = clean(raw)
    if not s:
        return "", ""
    # 英 /a/  美 /b/
    m = re.search(r"英\s*(/[^/]+/)\s*美\s*(/[^/]+/)", s)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    # 只有一种音标，英美共用
    m = re.search(r"(/[^/]+/)", s)
    if m:
        p = m.group(1).strip()
        return p, p
    return s, s


def lesson_num(lesson):
    m = re.search(r"(\d+)", clean(lesson))
    return int(m.group(1)) if m else 999


def unit_num(unit):
    s = clean(unit)
    zh = {"One": 1, "Two": 2, "Three": 3, "Four": 4, "Five": 5,
          "Six": 6, "Seven": 7, "Eight": 8, "Nine": 9, "Ten": 10}
    m = re.search(r"(\d+)", s)
    if m:
        return int(m.group(1))
    for k, v in zh.items():
        if k.lower() in s.lower():
            return v
    return 999


def parse_book(cfg):
    wb = openpyxl.load_workbook(cfg["file"], read_only=True, data_only=True)
    ws = wb[cfg["sheet"]]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    header = [clean(c) for c in rows[0]]
    idx = {}
    for key, col_name in cfg["columns"].items():
        if col_name not in header:
            print(f"  !! 缺少列 {col_name}（{cfg['name']}），实际表头：{header}",
                  file=sys.stderr)
            idx[key] = None
        else:
            idx[key] = header.index(col_name)

    words = []
    for r in rows[1:]:
        if r is None:
            continue
        raw_word = clean(r[idx["word"]]) if idx.get("word") is not None else ""
        word, note = clean_word(raw_word)
        if not word:
            continue
        uk, us = split_phonetic(r[idx["phonetic"]] if idx.get("phonetic") is not None else "")
        cn = clean_cn(r[idx["cn"]] if idx.get("cn") is not None else "")
        ex_en = clean(r[idx["ex_en"]]) if idx.get("ex_en") is not None else ""
        ex_cn = clean(r[idx["ex_cn"]]) if idx.get("ex_cn") is not None else ""
        item = {
            "id": f"{cfg['id']}-{len(words) + 1:04d}",
            "word": word,
            "note": note,
            "phoneticUk": uk,
            "phoneticUs": us,
            "pos": clean(r[idx["pos"]]) if idx.get("pos") is not None else "",
            "cn": cn,
            "exampleEn": ex_en,
            "exampleCn": ex_cn,
            "book": cfg["id"],
            "grade": cfg["grade"],
            "source": cfg["source"],
            "unit": clean(r[idx["unit"]]) if idx.get("unit") is not None else "",
            "unitOrder": unit_num(r[idx["unit"]]) if idx.get("unit") is not None else 999,
            "unitTitle": clean(r[idx["unit_title"]]) if idx.get("unit_title") is not None else "",
            "lesson": clean(r[idx["lesson"]]) if idx.get("lesson") is not None else "",
            "lessonOrder": lesson_num(r[idx["lesson"]]) if idx.get("lesson") is not None else 999,
            "lessonTitle": clean(r[idx["lesson_title"]]) if idx.get("lesson_title") is not None else "",
            "category": clean(r[idx["category"]]) if idx.get("category") is not None else "",
            "phonics": [],  # 待 LLM / 规则补
            "definitionEn": "",  # 待 LLM 补（儿童友好英英释义）
        }
        words.append(item)
    return words


def report(words, name):
    total = len(words)
    miss = {
        "缺音标": sum(1 for w in words if not w["phoneticUk"]),
        "缺中文": sum(1 for w in words if not w["cn"]),
        "缺例句": sum(1 for w in words if not w["exampleEn"]),
        "缺例句中文": sum(1 for w in words if not w["exampleCn"]),
        "缺词性": sum(1 for w in words if not w["pos"]),
    }
    seen = {}
    dup = []
    for w in words:
        k = w["word"].lower()
        if k in seen:
            dup.append(w["word"])
        seen[k] = 1
    units = sorted({w["unit"] for w in words if w["unit"]}, key=lambda u: unit_num(u))
    print(f"\n=== {name} ===")
    print(f"  总词数        : {total}")
    print(f"  单元          : {len(units)} 个 -> {units}")
    for k, v in miss.items():
        flag = "  " if v == 0 else "!!"
        print(f"  {flag} {k:<12}: {v}")
    print(f"  重复词        : {len(dup)}" + (f" -> {dup[:12]}" if dup else ""))
    if any(w["category"] for w in words):
        cats = {}
        for w in words:
            cats[w["category"]] = cats.get(w["category"], 0) + 1
        print(f"  词汇类别      : {cats}")


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    all_words = []
    catalog = []
    for cfg in BOOKS:
        if not cfg["file"].exists():
            print(f"!! 文件不存在：{cfg['file']}", file=sys.stderr)
            continue
        words = parse_book(cfg)
        report(words, cfg["name"])
        all_words.extend(words)
        book_meta = {k: v for k, v in cfg.items() if k not in ("file", "columns")}
        book_meta["wordCount"] = len(words)
        book_meta["units"] = sorted(
            {w["unit"] for w in words if w["unit"]}, key=lambda u: unit_num(u)
        )
        out = {"meta": book_meta, "words": words}
        (DATA_DIR / f"{cfg['id']}.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"  -> 已写出 data/{cfg['id']}.json")

        # 词书目录：前端靠它渲染"今天学哪本"，新增词包只要重跑本脚本
        catalog.append(
            {
                "id": cfg["id"],
                "name": cfg["name"],
                "grade": cfg["grade"],
                "source": cfg["source"],
                "wordCount": len(words),
                "unitCount": len(book_meta["units"]),
            }
        )

    print(f"\n合计 {len(all_words)} 条")
    (DATA_DIR / "all.json").write_text(
        json.dumps(all_words, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("-> 已写出 data/all.json")

    (DATA_DIR / "books.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"-> 已写出 data/books.json（{len(catalog)} 本词书）")


if __name__ == "__main__":
    main()
