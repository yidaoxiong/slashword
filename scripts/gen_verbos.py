#!/usr/bin/env python3
"""生成西语动词词库（含变位表）。

变位一律手工列出，不用"规则引擎"推：西语动词的例外太多了
（e→ie、o→ue、e→i 的词干变化，-car/-gar/-zar 的正字法变化，
第一人称 -go，过去时的 -yó / 不规则词根……），按规则推必错。
宁可多花点地方手写，也不能教错孩子。

人称按拉美西语来：**没有 vosotros**（拉美一律用 ustedes），
所以是 5 个形式：yo / tú / él,Ud. / nosotros / ellos,Uds.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "es-verbos.json"

# 人称顺序固定：yo, tú, él/usted, nosotros, ellos/ustedes
# 第五个是 ellos/ustedes —— 拉美不用 vosotros
TENSES = [
    ("presente", "现在时"),
    ("preterito", "简单过去时"),
]

# word, 中文, 例句, 例句中文, {时态: [5 个人称形式]}, 规则提示
VERBS = [
    ("hablar", "说，讲", "Quiero hablar contigo.", "我想和你说话。",
     {"presente": ["hablo", "hablas", "habla", "hablamos", "hablan"],
      "preterito": ["hablé", "hablaste", "habló", "hablamos", "hablaron"]},
     "-ar 现在时：-o / -as / -a / -amos / -an"),

    ("comer", "吃", "Voy a comer una manzana.", "我要吃一个苹果。",
     {"presente": ["como", "comes", "come", "comemos", "comen"],
      "preterito": ["comí", "comiste", "comió", "comimos", "comieron"]},
     "-er 现在时：-o / -es / -e / -emos / -en"),

    ("vivir", "生活，住", "Vivo en Beijing.", "我住在北京。",
     {"presente": ["vivo", "vives", "vive", "vivimos", "viven"],
      "preterito": ["viví", "viviste", "vivió", "vivimos", "vivieron"]},
     "-ir 现在时：-o / -es / -e / -imos / -en"),

    ("ser", "是（本质）", "Ella es mi hermana.", "她是我妹妹。",
     {"presente": ["soy", "eres", "es", "somos", "son"],
      "preterito": ["fui", "fuiste", "fue", "fuimos", "fueron"]},
     None),

    ("estar", "在，处于", "Estoy cansado.", "我累了。",
     {"presente": ["estoy", "estás", "está", "estamos", "están"],
      "preterito": ["estuve", "estuviste", "estuvo", "estuvimos", "estuvieron"]},
     None),

    ("tener", "有", "Tengo dos hermanos.", "我有两个兄弟。",
     {"presente": ["tengo", "tienes", "tiene", "tenemos", "tienen"],
      "preterito": ["tuve", "tuviste", "tuvo", "tuvimos", "tuvieron"]},
     None),

    ("ir", "去", "Vamos al parque.", "我们去公园。",
     {"presente": ["voy", "vas", "va", "vamos", "van"],
      "preterito": ["fui", "fuiste", "fue", "fuimos", "fueron"]},
     None),

    ("querer", "想要，爱", "Quiero un café.", "我想要一杯咖啡。",
     {"presente": ["quiero", "quieres", "quiere", "queremos", "quieren"],
      "preterito": ["quise", "quisiste", "quiso", "quisimos", "quisieron"]},
     "e→ie，但 nosotros / vosotros 不变"),

    ("poder", "能够，可以", "¿Puedes ayudarme?", "你能帮我吗？",
     {"presente": ["puedo", "puedes", "puede", "podemos", "pueden"],
      "preterito": ["pude", "pudiste", "pudo", "pudimos", "pudieron"]},
     "o→ue，但 nosotros 不变"),

    ("decir", "说，告诉", "¿Qué dices?", "你说什么？",
     {"presente": ["digo", "dices", "dice", "decimos", "dicen"],
      "preterito": ["dije", "dijiste", "dijo", "dijimos", "dijeron"]},
     None),

    ("hacer", "做，制造", "¿Qué haces?", "你在做什么？",
     {"presente": ["hago", "haces", "hace", "hacemos", "hacen"],
      "preterito": ["hice", "hiciste", "hizo", "hicimos", "hicieron"]},
     None),

    ("pensar", "想，思考", "Pienso en ti.", "我想你。",
     {"presente": ["pienso", "piensas", "piensa", "pensamos", "piensan"],
      "preterito": ["pensé", "pensaste", "pensó", "pensamos", "pensaron"]},
     "e→ie，nosotros 不变"),

    ("dormir", "睡觉", "Duermo ocho horas.", "我睡八小时。",
     {"presente": ["duermo", "duermes", "duerme", "dormimos", "duermen"],
      "preterito": ["dormí", "dormiste", "durmió", "dormimos", "durmieron"]},
     "o→ue，过去时三单/三复 e→u"),

    ("pedir", "请求，点（餐）", "Pido un taxi.", "我叫一辆出租车。",
     {"presente": ["pido", "pides", "pide", "pedimos", "piden"],
      "preterito": ["pedí", "pediste", "pidió", "pedimos", "pidieron"]},
     "e→i，过去时三单/三复也 e→i"),

    ("leer", "读，阅读", "Leo un libro.", "我读一本书。",
     {"presente": ["leo", "lees", "lee", "leemos", "leen"],
      "preterito": ["leí", "leíste", "leyó", "leímos", "leyeron"]},
     "过去时三单 y 结尾：-yó / -yeron"),

    ("buscar", "寻找", "Busco mis llaves.", "我找我的钥匙。",
     {"presente": ["busco", "buscas", "busca", "buscamos", "buscan"],
      "preterito": ["busqué", "buscaste", "buscó", "buscamos", "buscaron"]},
     "过去时 yo 要保音：c→qu（busqué）"),

    ("llegar", "到达", "Llego a las ocho.", "我八点到。",
     {"presente": ["llego", "llegas", "llega", "llegamos", "llegan"],
      "preterito": ["llegué", "llegaste", "llegó", "llegamos", "llegaron"]},
     "过去时 yo 要保音：g→gu（llegué）"),

    ("jugar", "玩，踢（球）", "Juego al fútbol.", "我踢足球。",
     {"presente": ["juego", "juegas", "juega", "jugamos", "juegan"],
      "preterito": ["jugué", "jugaste", "jugó", "jugamos", "jugaron"]},
     "u→ue，过去时 yo g→gu"),

    ("conocer", "认识，知道", "Conozco México.", "我了解墨西哥。",
     {"presente": ["conozco", "conoces", "conoce", "conocemos", "conocen"],
      "preterito": ["conocí", "conociste", "conoció", "conocimos", "conocieron"]},
     "yo 加 -zco（conozco）"),

    ("poner", "放，摆", "Pongo la mesa.", "我摆桌子。",
     {"presente": ["pongo", "pones", "pone", "ponemos", "ponen"],
      "preterito": ["puse", "pusiste", "puso", "pusimos", "pusieron"]},
     None),
]

PER_UNIT = 20  # 每单元放几个动词


def build():
    words = []
    for i, (word, cn, ex, excn, forms, rule) in enumerate(VERBS, start=1):
        unit_order = (i - 1) // PER_UNIT + 1
        conj = []
        for tid, tcn in TENSES:
            fs = forms[tid]
            conj.append({
                "tense": tid,
                "tenseCn": tcn,
                # 规则提示只在现在时给：过去时的不规则太杂，给了反而乱
                "rule": rule if tid == "presente" else None,
                "forms": {
                    "yo": fs[0],
                    "tu": fs[1],
                    "el": fs[2],
                    "nosotros": fs[3],
                    "ellos": fs[4],
                },
            })
        words.append({
            "id": f"es-verbos-{i:04d}",
            "word": word,
            "note": "",
            "phoneticUk": "",
            "phoneticUs": "",
            "article": "",
            "lang": "es",
            "pos": "v.",
            "cn": cn,
            "exampleEn": ex,
            "exampleCn": excn,
            "book": "es-verbos",
            "grade": "西语动词",
            "source": "常用动词",
            "unit": f"Unidad {unit_order}",
            "unitOrder": unit_order,
            "unitTitle": "动词变位",
            "lesson": "",
            "lessonOrder": 999,
            "lessonTitle": "",
            "category": "verbo",
            "phonics": [],
            "definitionEn": "",
            "conjugations": conj,
        })
    return words


def sync(words):
    """同步到前端能加载的地方 + 音频脚本读的 all.json。

    - public/data/{id}.json  前端 fetch 词条用
    - data/books.json + public/data/books.json  词书目录
    - data/all.json  gen_audio.py 读它生成发音（不进包）

    public/data/{id}.json 必须是 {meta, words} 结构 —— 前端取的是
    data.words（见 useAppStore.loadBook）。直接给裸数组的话，
    importEntries 收到 undefined，一读 .length 就崩。
    """
    book_id = "es-verbos"
    pub = ROOT / "public" / "data"
    pub.mkdir(parents=True, exist_ok=True)

    units = sorted({w["unitOrder"] for w in words})
    payload = {
        "meta": {
            "id": book_id,
            "name": "西语常用动词",
            "grade": "西语动词",
            "source": "常用动词",
            "lang": "es",
            "wordCount": len(words),
            "units": [f"Unidad {u}" for u in units],
        },
        "words": words,
    }
    (pub / f"{book_id}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    units = sorted({w["unitOrder"] for w in words})
    entry = {
        "id": book_id,
        "name": "西语常用动词",
        "grade": "西语动词",
        "source": "常用动词",
        "lang": "es",
        "wordCount": len(words),
        "unitCount": len(units),
    }
    bpath = ROOT / "data" / "books.json"
    catalog = json.loads(bpath.read_text(encoding="utf-8"))
    catalog = [c for c in catalog if c["id"] != book_id] + [entry]
    text = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    bpath.write_text(text, encoding="utf-8")
    (pub / "books.json").write_text(text, encoding="utf-8")

    apath = ROOT / "data" / "all.json"
    allw = json.loads(apath.read_text(encoding="utf-8"))
    by_id = {w["id"]: w for w in allw}
    for w in words:
        by_id[w["id"]] = w
    apath.write_text(
        json.dumps(list(by_id.values()), ensure_ascii=False, indent=2),
        encoding="utf-8")
    print(f"已同步：public/data/{book_id}.json、books.json、all.json（合计 {len(by_id)} 条）")


def main():
    words = build()
    OUT.write_text(
        json.dumps(words, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"已写入 {OUT.relative_to(ROOT)}  {len(words)} 个动词")
    sync(words)
    for w in words[:3]:
        print(f"  {w['word']}: " + json.dumps(w["conjugations"][0]["forms"], ensure_ascii=False))
    print("\n自检：每个动词必须两种时态 × 5 人称都有值")
    bad = []
    for w in words:
        for c in w["conjugations"]:
            if len(c["forms"]) != 5 or any(not v for v in c["forms"].values()):
                bad.append(w["word"])
    print("  缺失: " + (", ".join(bad) if bad else "无"))


if __name__ == "__main__":
    main()
