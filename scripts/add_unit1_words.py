#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把《Unit 1 单词句式基础练习》里缺失的词条补进五上词库 g5a。

背景：词库 Unit One 原有 24 条，PDF 练习列出 28 条（25 词 + 3 词组）。
逐条比对后缺 6 条：better / hobby / travel / good idea / watch films / folk dance。
famous 已经在 Unit Five / Lesson 15，不重复添加（同一词两张卡会打乱进度）。

用法：python scripts/add_unit1_words.py
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'g5a.json'
DST = ROOT / 'public' / 'data' / 'g5a.json'

# (word, pos, cn, phoneticUk, phoneticUs, exampleEn, exampleCn, lesson)
# 例句优先取 PDF「二、句子练习」里的原句，孩子练的就是这些句型
NEW = [
    (
        'better', 'adj.', '更好的',
        '/ˈbetə/', '/ˈbetɚ/',
        "Which one do you like better? I like Animal World better because it's interesting.",
        '你更喜欢哪一个？我更喜欢《动物世界》，因为它很有趣。',
        'Lesson 1',
    ),
    (
        'travel', 'v.', '旅行；旅游',
        '/ˈtrævl/', '/ˈtrævl/',
        'I like to travel.',
        '我喜欢旅行。',
        'Lesson 1',
    ),
    (
        'good idea', 'n.', '好主意',
        '/ˌɡʊd aɪˈdɪə/', '/ˌɡʊd aɪˈdiːə/',
        "That's a good idea.",
        '那是个好主意。',
        'Lesson 1',
    ),
    (
        'hobby', 'n.', '爱好',
        '/ˈhɒbi/', '/ˈhɑːbi/',
        'My hobby is watching films.',
        '我的爱好是看电影。',
        'Lesson 3',
    ),
    (
        'watch films', 'v.', '看电影',
        '/ˌwɒtʃ ˈfɪlmz/', '/ˌwɑːtʃ ˈfɪlmz/',
        'I watch films on Sunday.',
        '我周日看电影。',
        'Lesson 3',
    ),
    (
        'folk dance', 'n.', '民族舞',
        '/ˌfəʊk ˈdɑːns/', '/ˌfoʊk ˈdæns/',
        'I like folk dance best.',
        '我最喜欢民族舞。',
        'Lesson 4',
    ),
]


def blank_entry(tpl, wid, word, pos, cn, uk, us, ex_en, ex_cn, lesson, lesson_map):
    """照模板词条造一条新的。

    直接复制模板再覆盖 —— 模板里 book / grade / source / lang / unit /
    unitOrder / unitTitle 这些本来就有值，必须继承下来；
    note / article / category / definitionEn 在模板里是空串，phonics 是空数组，
    复制过来天然就是对的，不用再手动清空。
    """
    e = dict(tpl)
    e.update({
        'id': wid,
        'word': word,
        'pos': pos,
        'cn': cn,
        'phoneticUk': uk,
        'phoneticUs': us,
        'exampleEn': ex_en,
        'exampleCn': ex_cn,
        'lesson': lesson,
        'lessonOrder': lesson_map[lesson]['lessonOrder'],
        'lessonTitle': lesson_map[lesson]['lessonTitle'],
    })
    return e


def main():
    data = json.loads(SRC.read_text(encoding='utf-8'))
    words = data['words']

    unit1 = [w for w in words if w['unit'] == 'Unit One']
    tpl = unit1[0]

    # lesson -> (lessonOrder, lessonTitle)，沿用 Unit One 现有取值
    lesson_map = {}
    for w in unit1:
        lesson_map.setdefault(w['lesson'], {
            'lessonOrder': w['lessonOrder'],
            'lessonTitle': w['lessonTitle'],
        })

    existing = {w['word'].lower() for w in words}
    next_no = max(int(w['id'].split('-')[1]) for w in words) + 1

    added, skipped = [], []
    for word, pos, cn, uk, us, ex_en, ex_cn, lesson in NEW:
        if word.lower() in existing:
            skipped.append(word)
            continue
        wid = f'g5a-{next_no:04d}'
        words.append(blank_entry(
            tpl, wid, word, pos, cn, uk, us, ex_en, ex_cn, lesson, lesson_map))
        existing.add(word.lower())
        added.append((wid, word, lesson))
        next_no += 1

    # 词表有序：按 unit / lesson / 原顺序排，但 id 保持追加不动
    data['meta']['wordCount'] = len(words)

    out = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    SRC.write_text(out, encoding='utf-8')
    shutil.copyfile(SRC, DST)

    print(f'新增 {len(added)} 条：')
    for wid, word, lesson in added:
        print(f'  {wid}  {word:<14} {lesson}')
    if skipped:
        print(f'已存在跳过：{skipped}')
    print(f'\n词条总数 {len(words)}，meta.wordCount = {data["meta"]["wordCount"]}')
    print(f'已同步 → {DST.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
