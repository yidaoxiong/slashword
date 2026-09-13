#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
用 Edge TTS（微软神经网络语音）批量生成单词与例句音频。

为什么不继续用系统 TTS：
  - 每台设备声音不一样（Mac 是 Samantha，Windows 是 David，iPad 又不同）
  - 机械感重，孩子听着没兴趣
  - 离线时部分设备的语音包没下载就完全没声音

生成成文件之后：所有设备听到的完全一样，离线可用，加载也快。
系统 TTS 保留作为兜底（音频文件缺失或加载失败时）。

用法：python scripts/gen_audio.py

每个词/例句都生成英音和美音两份，前端按「发音偏好」设置挑一份播。
脚本会跳过已存在的文件，所以改词表后重跑只会生成新增的部分。
"""
import asyncio
import json
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "audio"
WORDS_DIR = OUT / "words"
EXAMPLES_DIR = OUT / "examples"

# 儿童应用优先女声：清晰、亲和。
# 这里的音色和口音 id 必须和 src/core/lang.ts 的 ACCENTS 完全一致，
# 否则前端拼出来的文件名和这边生成出来的对不上。
ACCENTS = {
    "en": {
        "default": "uk",
        "voices": {
            "uk": "en-GB-SoniaNeural",
            "us": "en-US-AriaNeural",
        },
    },
    "es": {
        "default": "es-mx",  # Ray 选的拉美口音
        "voices": {
            "es-mx": "es-MX-DaliaNeural",
            "es-es": "es-ES-ElviraNeural",
        },
    },
}
RATE = "-8%"  # 比正常语速略慢，适合孩子听清

CONCURRENCY = 6


async def synth(text: str, path: Path, voice: str, sem: asyncio.Semaphore):
    if path.exists() and path.stat().st_size > 500:
        return "skip"
    async with sem:
        for attempt in range(3):
            try:
                comm = edge_tts.Communicate(text, voice, rate=RATE)
                await comm.save(str(path))
                if path.stat().st_size > 500:
                    return "ok"
            except Exception as e:  # noqa: BLE001
                if attempt == 2:
                    print(f"  !! 失败 {path.name}: {e}", file=sys.stderr)
                    return "fail"
                await asyncio.sleep(1.5 * (attempt + 1))
        return "fail"


async def main():
    words = json.loads((ROOT / "data" / "all.json").read_text(encoding="utf-8"))
    WORDS_DIR.mkdir(parents=True, exist_ok=True)
    EXAMPLES_DIR.mkdir(parents=True, exist_ok=True)

    sem = asyncio.Semaphore(CONCURRENCY)
    tasks = []
    by_lang: dict[str, int] = {}
    ex_count = 0

    def path(d: Path, wid: str, accent_id: str, default: str) -> Path:
        # 命名规则必须和 src/lib/speech.ts 的 audioPath 一致：
        # 默认口音是裸文件，其他口音带 -{accentId} 后缀
        suffix = "" if accent_id == default else f"-{accent_id}"
        return d / f"{wid}{suffix}.mp3"

    for w in words:
        wid = w["id"]
        word = w["word"]
        lang = w.get("lang") or "en"
        cfg = ACCENTS.get(lang, ACCENTS["en"])
        default = cfg["default"]
        by_lang[lang] = by_lang.get(lang, 0) + 1

        # 单词：每种口音各一份
        for accent_id, voice in cfg["voices"].items():
            tasks.append(
                synth(word, path(WORDS_DIR, wid, accent_id, default), voice, sem)
            )
        # 例句：同样每种口音一份，保证整关的口音一致
        if w.get("exampleEn"):
            for accent_id, voice in cfg["voices"].items():
                tasks.append(
                    synth(
                        w["exampleEn"],
                        path(EXAMPLES_DIR, wid, accent_id, default),
                        voice,
                        sem,
                    )
                )
            ex_count += 1

    print(
        "待生成："
        + "、".join(f"{k} {v} 词" for k, v in sorted(by_lang.items()))
        + f" + {ex_count} 例句"
    )
    print(f"共 {len(tasks)} 个音频，并发 {CONCURRENCY}，请稍候…")

    results = await asyncio.gather(*tasks)
    ok = results.count("ok")
    skip = results.count("skip")
    fail = results.count("fail")
    print(f"\n完成：新增 {ok} · 已存在跳过 {skip} · 失败 {fail}")

    total = sum(p.stat().st_size for p in OUT.rglob("*.mp3"))
    print(f"音频目录总大小：{total / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    asyncio.run(main())
