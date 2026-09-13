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

# 儿童应用优先女声：清晰、亲和
VOICE_UK = "en-GB-SoniaNeural"
VOICE_US = "en-US-AriaNeural"
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
    us_count = 0
    ex_count = 0

    for w in words:
        wid = w["id"]
        word = w["word"]
        # 单词（英音）
        tasks.append(synth(word, WORDS_DIR / f"{wid}.mp3", VOICE_UK, sem))
        # 英美发音不同的，额外生成一份美音
        if w.get("phoneticUs") and w["phoneticUs"] != w.get("phoneticUk"):
            tasks.append(synth(word, WORDS_DIR / f"{wid}-us.mp3", VOICE_US, sem))
            us_count += 1
        # 例句
        if w.get("exampleEn"):
            tasks.append(
                synth(w["exampleEn"], EXAMPLES_DIR / f"{wid}.mp3", VOICE_UK, sem)
            )
            ex_count += 1

    print(f"待生成：{len(words)} 词（其中 {us_count} 个需要美音）+ {ex_count} 条例句")
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
