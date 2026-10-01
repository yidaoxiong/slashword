#!/usr/bin/env python3
"""生成西语动词词库（含变位表）。

人称按拉美西语来：**没有 vosotros**（拉美一律用 ustedes），
所以是 5 个形式：yo / tú / él,Ud. / nosotros / ellos,Uds.
（`él` 和 `usted` 变位相同，5 个形式够覆盖 6 个代词）

变位的生成方式：规则动词按类型推，真正不规则的单独给全表。
西语的例外集中在现在时（词干变化、第一人称 -go/-zco、正字法）
和过去时（不规则词根、-yó），这些类型在本文件里逐个标注，
不给"通用规则引擎"硬推的空间 —— 推错了就是教错孩子。
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "es-verbos.json"
BOOK_ID = "es-verbos"
PER_UNIT = 25

PERSONS = ["yo", "tu", "el", "nosotros", "ellos"]

# 不规则动词的完整变位。这些是高频且没规律的，必须逐个写死。
# 格式: {现在时 5 个形式}, {过去时 5 个形式}
IRREGULAR: dict[str, tuple[list[str], list[str]]] = {
    "ser":     (["soy", "eres", "es", "somos", "son"],
                ["fui", "fuiste", "fue", "fuimos", "fueron"]),
    "estar":   (["estoy", "estás", "está", "estamos", "están"],
                ["estuve", "estuviste", "estuvo", "estuvimos", "estuvieron"]),
    "ir":      (["voy", "vas", "va", "vamos", "van"],
                ["fui", "fuiste", "fue", "fuimos", "fueron"]),
    "ver":     (["veo", "ves", "ve", "vemos", "ven"],
                ["vi", "viste", "vio", "vimos", "vieron"]),
    "dar":     (["doy", "das", "da", "damos", "dan"],
                ["di", "diste", "dio", "dimos", "dieron"]),
    "saber":   (["sé", "sabes", "sabe", "sabemos", "saben"],
                ["supe", "supiste", "supo", "supimos", "supieron"]),
    "haber":   (["he", "has", "ha", "hemos", "han"],
                ["hube", "hubiste", "hubo", "hubimos", "hubieron"]),
    "tener":   (["tengo", "tienes", "tiene", "tenemos", "tienen"],
                ["tuve", "tuviste", "tuvo", "tuvimos", "tuvieron"]),
    "venir":   (["vengo", "vienes", "viene", "venimos", "vienen"],
                ["vine", "viniste", "vino", "vinimos", "vinieron"]),
    "poner":   (["pongo", "pones", "pone", "ponemos", "ponen"],
                ["puse", "pusiste", "puso", "pusimos", "pusieron"]),
    "hacer":   (["hago", "haces", "hace", "hacemos", "hacen"],
                ["hice", "hiciste", "hizo", "hicimos", "hicieron"]),
    "decir":   (["digo", "dices", "dice", "decimos", "dicen"],
                ["dije", "dijiste", "dijo", "dijimos", "dijeron"]),
    "querer":  (["quiero", "quieres", "quiere", "queremos", "quieren"],
                ["quise", "quisiste", "quiso", "quisimos", "quisieron"]),
    "poder":   (["puedo", "puedes", "puede", "podemos", "pueden"],
                ["pude", "pudiste", "pudo", "pudimos", "pudieron"]),
    "traer":   (["traigo", "traes", "trae", "traemos", "traen"],
                ["traje", "trajiste", "trajo", "trajimos", "trajeron"]),
    "producir": (["produzco", "produces", "produce", "producimos", "producen"],
                 ["produje", "produjiste", "produjo", "produjimos", "produjeron"]),
    "traducir": (["traduzco", "traduces", "traduce", "traducimos", "traducen"],
                 ["traduje", "tradujiste", "tradujo", "tradujimos", "tradujeron"]),
    "oír":     (["oigo", "oyes", "oye", "oímos", "oyen"],
                ["oí", "oíste", "oyó", "oímos", "oyeron"]),
    "jugar":   (["juego", "juegas", "juega", "jugamos", "juegan"],
                ["jugué", "jugaste", "jugó", "jugamos", "jugaron"]),
    "dormir":  (["duermo", "duermes", "duerme", "dormimos", "duermen"],
                ["dormí", "dormiste", "durmió", "dormimos", "durmieron"]),
    "morir":   (["muero", "mueres", "muere", "morimos", "mueren"],
                ["morí", "moriste", "murió", "morimos", "murieron"]),
    # -guir 动词：gu→g 再 e→i（seguir→sigo），规则推不出，必须写死
    "seguir":  (["sigo", "sigues", "sigue", "seguimos", "siguen"],
                ["seguí", "seguiste", "siguió", "seguimos", "siguieron"]),
    "conseguir": (["consigo", "consigues", "consigue", "conseguimos", "consiguen"],
                  ["conseguí", "conseguiste", "consiguió", "conseguimos", "consiguieron"]),
}


def _stem_change(stem: str, kind: str) -> str:
    """词干元音变化：e→ie、o→ue、e→i、u→ue。只作用在最后一个元音上。"""
    table = {"ie": ("e", "ie"), "ue": ("o", "ue"), "i": ("e", "i"), "u2u": ("o", "u")}
    if kind == "u2ue":
        src, dst = "u", "ue"
    elif kind in table:
        src, dst = table[kind]
    else:
        return stem
    idx = stem.rfind(src)
    if idx < 0:
        return stem
    return stem[:idx] + dst + stem[idx + 1 :]


def _ortho_yo_past(stem: str, word: str) -> str:
    """过去时 yo 的正字法保音：car→qué、gar→gué、zar→cé。"""
    if word.endswith("car"):
        return stem[: -1] + "qu"
    if word.endswith("gar"):
        return stem[: -1] + "gu"
    if word.endswith("zar"):
        return stem[: -1] + "c"
    return stem


def conjugate(word: str, tags: list[str]) -> tuple[list[str], list[str]]:
    """返回（现在时 5 个形式, 过去时 5 个形式）。"""
    if word in IRREGULAR:
        return IRREGULAR[word]

    # 反身动词（levantarse / dormirse）：se 不是变位结尾，先剥掉 ——
    # 不然 word[-2:] 取到 "se"，后面整套变位全错
    base = word[:-2] if word.endswith("se") else word
    ending = base[-2:]
    stem = base[:-2]

    change = next((t for t in tags if t in ("ie", "ue", "i", "u2ue")), None)
    go = "go" in tags
    zco = "zco" in tags
    y_past = "y" in tags

    # ---- 现在时 ----
    # 注意 -go / -zco 本身已经带结尾元音，不能再补一个 -o
    # （salir → salgo，补了就成 salgoo；conocer → conozco，补了成 conozcoo）
    if zco:
        # -cer / -cir 前面的 c 要换成 z：conocer→conozco、nacer→nazco
        # （直接 stem + "zco" 会拼出 conoczco 这种错东西）
        first = (stem[:-1] if stem.endswith("c") else stem) + "zco"
    elif go:
        first = stem + "go"
    elif change:
        first = _stem_change(stem, change) + "o"
    else:
        first = stem + "o"

    rest = _stem_change(stem, change) if change else stem
    if ending == "ar":
        pres = [first, rest + "as", rest + "a", stem + "amos", rest + "an"]
    elif ending == "er":
        pres = [first, rest + "es", rest + "e", stem + "emos", rest + "en"]
    else:  # ir
        pres = [first, rest + "es", rest + "e", stem + "imos", rest + "en"]

    # ---- 过去时 ----
    if ending == "ar":
        yo_stem = _ortho_yo_past(stem, base)
        pret = [
            yo_stem + "é", stem + "aste", stem + "ó",
            stem + "amos", stem + "aron",
        ]
    else:
        # -ir 动词的过去时三单/三复要 e→i（pedir→pidió、sentir→sintió）
        if ending == "ir" and change in ("ie", "i"):
            # -ir 动词过去时三单/三复一律 e→i：sentir→sintió、preferir→prefirió。
            # 照搬现在时的 ie 会拼出 sientió 这种错东西
            third = _stem_change(stem, "i")
        elif ending == "ir" and change == "ue":
            third = _stem_change(stem, "u2u")
        else:
            third = stem
        if y_past:
            # -yó 类：三单 -yó、三复 -yeron，不是 -ió / -ieron
            # （leer → leí / leyó / leyeron，写成 leyió 就错了）
            pret = [
                stem + "í", stem + "iste", third + "yó",
                stem + "imos", third + "yeron",
            ]
        else:
            pret = [
                stem + "í", stem + "iste", third + "ió",
                stem + "imos", third + "ieron",
            ]
    return pres, pret


# (原形, 中文, 例句, 例句中文, 类型标签)
# 标签: 空=规则 / ie,ue,i,u2ue=词干变化 / go=第一人称 -go / zco=第一人称 -zco / y=过去时 -yó
VERBS: list[tuple[str, str, str, str, list[str]]] = [
    ("ser", "是（本质）", "Ella es mi hermana.", "她是我妹妹。", []),
    ("estar", "在，处于", "Estoy cansado.", "我累了。", []),
    ("tener", "有", "Tengo dos hermanos.", "我有两个兄弟。", []),
    ("haber", "有（助动词）", "He comido ya.", "我已经吃过了。", []),
    ("hacer", "做，制造", "¿Qué haces?", "你在做什么？", []),
    ("poder", "能够，可以", "¿Puedes ayudarme?", "你能帮我吗？", []),
    ("decir", "说，告诉", "¿Qué dices?", "你说什么？", []),
    ("ir", "去", "Vamos al parque.", "我们去公园。", []),
    ("ver", "看，看见", "Veo la casa.", "我看见那座房子。", []),
    ("dar", "给", "Me da un libro.", "他给我一本书。", []),
    ("saber", "知道，会", "Sé la respuesta.", "我知道答案。", []),
    ("querer", "想要，爱", "Quiero un café.", "我想要一杯咖啡。", []),
    ("hablar", "说，讲", "Quiero hablar contigo.", "我想和你说话。", []),
    ("comer", "吃", "Voy a comer una manzana.", "我要吃一个苹果。", []),
    ("vivir", "生活，住", "Vivo en Beijing.", "我住在北京。", []),
    ("beber", "喝", "Bebo agua.", "我喝水。", []),
    ("leer", "读，阅读", "Leo un libro.", "我读一本书。", ["y"]),
    ("escribir", "写", "Escribo una carta.", "我写一封信。", []),
    ("escuchar", "听", "Escucho música.", "我听音乐。", []),
    ("oír", "听见", "Oigo un ruido.", "我听见一个声音。", []),
    ("mirar", "看，瞧", "Miro la televisión.", "我看电视。", []),
    ("estudiar", "学习", "Estudio español.", "我学西班牙语。", []),
    ("aprender", "学会", "Aprendo palabras nuevas.", "我学新单词。", []),
    ("enseñar", "教", "Enseño matemáticas.", "我教数学。", []),
    ("trabajar", "工作", "Trabajo en una fábrica.", "我在一家工厂工作。", []),
    ("necesitar", "需要", "Necesito ayuda.", "我需要帮助。", []),
    ("comprar", "买", "Compro pan.", "我买面包。", []),
    ("vender", "卖", "Vendo frutas.", "我卖水果。", []),
    ("pagar", "支付", "Pago la cuenta.", "我付账。", []),
    ("costar", "花费", "Cuesta diez pesos.", "这个卖十比索。", ["ue"]),
    ("esperar", "等待，希望", "Espero el autobús.", "我等公交车。", []),
    ("buscar", "寻找", "Busco mis llaves.", "我找我的钥匙。", []),
    ("encontrar", "找到", "Encuentro el libro.", "我找到那本书。", ["ue"]),
    ("llegar", "到达", "Llego a las ocho.", "我八点到。", []),
    ("salir", "出去", "Salgo de casa.", "我出门。", ["go"]),
    ("entrar", "进入", "Entro al cuarto.", "我进房间。", []),
    ("subir", "上去，上传", "Subo las escaleras.", "我上楼梯。", []),
    ("bajar", "下来，下载", "Bajo del coche.", "我下车。", []),
    ("abrir", "打开", "Abro la puerta.", "我开门。", []),
    ("cerrar", "关闭", "Cierro la ventana.", "我关窗。", ["ie"]),
    ("empezar", "开始", "Empiezo a trabajar.", "我开始工作。", ["ie"]),
    ("terminar", "结束", "Termino la tarea.", "我完成任务。", []),
    ("seguir", "继续", "Sigo estudiando.", "我继续学习。", ["i", "go"]),
    ("volver", "回来", "Vuelvo a casa.", "我回家。", ["ue"]),
    ("venir", "来", "Vengo mañana.", "我明天来。", []),
    ("ir", "去，走", "Voy al mercado.", "我去市场。", []),
    ("viajar", "旅行", "Viajo a México.", "我去墨西哥旅行。", []),
    ("caminar", "走路", "Camino al parque.", "我走路去公园。", []),
    ("correr", "跑", "Corro cada mañana.", "我每天早上跑步。", []),
    ("nadar", "游泳", "Nado en la piscina.", "我在游泳池游泳。", []),
    ("jugar", "玩，踢（球）", "Juego al fútbol.", "我踢足球。", []),
    ("ganar", "赢，赚", "Gano el partido.", "我赢了比赛。", []),
    ("perder", "输，丢失", "Pierdo el tren.", "我错过火车。", ["ie"]),
    ("descansar", "休息", "Descanso un rato.", "我休息一会儿。", []),
    ("dormir", "睡觉", "Duermo ocho horas.", "我睡八小时。", []),
    ("levantarse", "起床", "Me levanto temprano.", "我起得早。", []),
    ("sentirse", "感觉", "Me siento bien.", "我感觉不错。", ["ie"]),
    ("sentir", "感觉，遗憾", "Siento el frío.", "我感到冷。", ["ie"]),
    ("pensar", "想，思考", "Pienso en ti.", "我想你。", ["ie"]),
    ("entender", "理解", "Entiendo la pregunta.", "我明白这个问题。", ["ie"]),
    ("conocer", "认识，知道", "Conozco México.", "我了解墨西哥。", ["zco"]),
    ("recordar", "记得", "Recuerdo tu nombre.", "我记得你的名字。", ["ue"]),
    ("olvidar", "忘记", "Olvido las llaves.", "我忘了钥匙。", []),
    ("creer", "相信", "Creo en ti.", "我相信你。", ["y"]),
    ("saber", "知道（事实）", "Sé dónde vive.", "我知道他住哪。", []),
    ("contar", "数，讲述", "Cuento un cuento.", "我讲一个故事。", ["ue"]),
    ("mostrar", "展示", "Muestro la foto.", "我展示照片。", ["ue"]),
    ("pedir", "请求，点（餐）", "Pido un taxi.", "我叫一辆出租车。", ["i"]),
    ("servir", "服务，有用", "Sirvo la comida.", "我上菜。", ["i"]),
    ("repetir", "重复", "Repito la palabra.", "我重复这个词。", ["i"]),
    ("conseguir", "得到", "Consigo un trabajo.", "我找到一份工作。", ["i", "go"]),
    ("poner", "放，摆", "Pongo la mesa.", "我摆桌子。", []),
    ("traer", "带来", "Traigo el libro.", "我把书带来。", []),
    ("llevar", "带走，穿", "Llevo una chaqueta.", "我穿着外套。", []),
    ("tomar", "拿，乘坐", "Tomo el autobús.", "我坐公交车。", []),
    ("usar", "使用", "Uso el diccionario.", "我用字典。", []),
    ("ayudar", "帮助", "Ayudo a mi mamá.", "我帮妈妈。", []),
    ("cuidar", "照顾", "Cuido a mi hermano.", "我照顾弟弟。", []),
    ("limpiar", "打扫", "Limpio la casa.", "我打扫房子。", []),
    ("cocinar", "做饭", "Cocino la cena.", "我做晚饭。", []),
    ("cantar", "唱歌", "Canto una canción.", "我唱一首歌。", []),
    ("bailar", "跳舞", "Bailo salsa.", "我跳萨尔萨。", []),
    ("gustar", "使喜欢", "Me gusta el café.", "我喜欢咖啡。", []),
    ("amar", "爱", "Amo mi país.", "我爱我的国家。", []),
    ("deber", "应该，欠", "Debo estudiar.", "我应该学习。", []),
    ("querer", "想（礼貌）", "Quisiera un vaso.", "我想要一杯水。", []),
    ("preferir", "更喜欢", "Prefiero el té.", "我更喜欢茶。", ["ie"]),
    ("morir", "死", "El pez muere.", "那条鱼死了。", []),
    ("nacer", "出生", "Nazco en Beijing.", "我出生在北京。", ["zco"]),
    ("crecer", "成长", "El niño crece.", "孩子在长大。", ["zco"]),
    ("parecer", "看起来", "Parece difícil.", "看起来很难。", ["zco"]),
    ("ofrecer", "提供", "Ofrezco mi ayuda.", "我提供帮助。", ["zco"]),
    ("producir", "生产", "La fábrica produce.", "工厂在生产。", []),
    ("traducir", "翻译", "Traduzco el texto.", "我翻译这篇文章。", []),
    ("recibir", "收到", "Recibo una carta.", "我收到一封信。", []),
    ("permitir", "允许", "Permito la entrada.", "我允许进入。", []),
    ("decidir", "决定", "Decido quedarme.", "我决定留下。", []),
    ("descubrir", "发现", "Descubro un error.", "我发现一个错误。", []),
    ("compartir", "分享", "Comparto la comida.", "我分享食物。", []),
    ("cumplir", "完成，满（岁）", "Cumplo veinte años.", "我满二十岁。", []),
    ("existir", "存在", "Existe un problema.", "存在一个问题。", []),
    ("asistir", "参加，出席", "Asisto a la clase.", "我去上课。", []),
    ("practicar", "练习，运动", "Practico deporte.", "我运动。", []),
    ("preguntar", "问", "Pregunto la hora.", "我问时间。", []),
    ("contestar", "回答", "Contesto el teléfono.", "我接电话。", []),
    ("llamar", "叫，打电话", "Llamo a Juan.", "我给胡安打电话。", []),
    ("visitar", "拜访", "Visito a mi abuela.", "我看望奶奶。", []),
    ("invitar", "邀请", "Invito a mis amigos.", "我邀请朋友。", []),
    ("saludar", "打招呼", "Saludo al maestro.", "我向老师问好。", []),
    ("desear", "想要，祝愿", "Deseo un buen día.", "祝你一天愉快。", []),
    ("preparar", "准备", "Preparo la cena.", "我准备晚饭。", []),
    ("regresar", "返回", "Regreso pronto.", "我很快回来。", []),
    ("cambiar", "改变，换", "Cambio de ropa.", "我换衣服。", []),
    ("terminar", "完成", "Termino el trabajo.", "我完成工作。", []),
    ("empezar", "开始（课）", "La clase empieza.", "课开始了。", ["ie"]),
    ("pagar", "付（钱）", "Pago en efectivo.", "我付现金。", []),
    ("faltar", "缺少，缺席", "Falta un libro.", "少一本书。", []),
    ("soñar", "做梦", "Sueño con viajar.", "我梦见旅行。", ["ue"]),
    ("almorzar", "吃午饭", "Almuerzo a las doce.", "我十二点吃午饭。", ["ue"]),
    ("desayunar", "吃早饭", "Desayuno temprano.", "我很早吃早饭。", []),
    ("cenar", "吃晚饭", "Ceno con mi familia.", "我和家人吃晚饭。", []),
    ("bañarse", "洗澡", "Me baño por la noche.", "我晚上洗澡。", []),
    ("vestirse", "穿衣服", "Me visto rápido.", "我穿得很快。", ["i"]),
    ("lavar", "洗", "Lavo los platos.", "我洗盘子。", []),
    ("arreglar", "修理，整理", "Arreglo el coche.", "我修车。", []),
    ("romper", "打破", "Rompo el vaso.", "我打碎杯子。", []),
    ("construir", "建造", "Construyo una casa.", "我建房子。", ["y"]),
    ("destruir", "破坏", "No destruyas eso.", "别弄坏那个。", ["y"]),
    ("incluir", "包括", "Incluyo tu nombre.", "我把你的名字包括进去。", ["y"]),
    ("caer", "落下", "Caigo en la cuenta.", "我明白了。", ["go"]),
    ("valer", "值得", "Vale la pena.", "值得。", ["go"]),
    ("reír", "笑", "Río con sus chistes.", "他的笑话让我笑。", ["i"]),
    ("sonreír", "微笑", "Sonrío siempre.", "我总是微笑。", ["i"]),
    ("sentarse", "坐下", "Me siento aquí.", "我坐这里。", ["ie"]),
    ("quedarse", "留下", "Me quedo en casa.", "我待在家。", []),
    ("quedar", "剩下，约定", "Quedamos a las tres.", "我们三点见。", []),
    ("dejar", "留下，让", "Dejo la puerta abierta.", "我让门开着。", []),
    ("seguir", "跟随", "Sigo sus pasos.", "我跟着他的脚步。", ["i", "go"]),
    ("mantener", "维持", "Mantengo la calma.", "我保持冷静。", []),
    ("obtener", "获得", "Obtengo buenas notas.", "我取得好成绩。", []),
    ("suponer", "假设", "Supongo que sí.", "我想是的。", ["go"]),
    ("componer", "组成，修理", "Compongo la canción.", "我写这首歌。", ["go"]),
    ("disponer", "安排，有", "Dispongo de tiempo.", "我有时间。", ["go"]),
    ("proponer", "提议", "Propongo una idea.", "我提个想法。", ["go"]),
    ("oponer", "反对", "Me opongo al plan.", "我反对这个计划。", ["go"]),
    ("exponer", "展示，讲解", "Expongo el tema.", "我讲解这个主题。", ["go"]),
    ("imponer", "强加", "Impongo reglas.", "我立规矩。", ["go"]),
    ("deshacer", "撤销，拆开", "Deshago la maleta.", "我打开行李。", ["go"]),
    ("rehacer", "重做", "Rehago el trabajo.", "我重做这个工作。", ["go"]),
    ("satisfacer", "使满意", "Satisfago al cliente.", "我让客户满意。", ["go"]),
    ("retener", "保留，扣留", "Retengo el dinero.", "我留下这笔钱。", []),
    ("contener", "包含", "El libro contiene.", "这本书包含。", []),
    ("abstenerse", " abstain", "Me abstengo.", "我弃权。", ["go"]),
    ("detener", "停下，逮捕", "Detengo el coche.", "我停车。", []),
    ("entretener", "使开心", "Entretengo a los niños.", "我逗孩子们。", []),
    ("atreverse", "敢于", "Me atrevo a decirlo.", "我敢说出来。", []),
    ("parecerse", "相像", "Me parezco a mi papá.", "我长得像爸爸。", []),
    ("dedicarse", "从事", "Me dedico a la venta.", "我做销售。", []),
    ("acordarse", "想起", "Me acuerdo de ti.", "我想起你。", ["ue"]),
    ("encontrarse", "处于，相遇", "Me encuentro bien.", "我感觉不错。", ["ue"]),
    ("despedirse", "告别", "Me despido de ella.", "我和她道别。", ["i"]),
    ("divertirse", "玩得开心", "Me divierto mucho.", "我玩得很开心。", ["ie"]),
    ("dormirse", "入睡", "Me duermo tarde.", "我睡得晚。", []),
    ("irse", "离开", "Me voy ahora.", "我现在走了。", []),
]


def rule_hint(word: str, tags: list[str]) -> str | None:
    """现在时的规律提示。只在真有规律可循时给，ser / ir 这类给了也没用。"""
    if word in IRREGULAR:
        return None
    if word.endswith("ar"):
        base = "-ar：-o / -as / -a / -amos / -an"
    elif word.endswith("er"):
        base = "-er：-o / -es / -e / -emos / -en"
    elif word.endswith("ir"):
        base = "-ir：-o / -es / -e / -imos / -en"
    else:
        return None
    extras = []
    if "ie" in tags:
        extras.append("e→ie（ nosotros 不变）")
    if "ue" in tags or "u2ue" in tags:
        extras.append("o→ue（ nosotros 不变）")
    if "i" in tags:
        extras.append("e→i（ nosotros 不变）")
    if "go" in tags:
        extras.append("yo 加 -go")
    if "zco" in tags:
        extras.append("yo 加 -zco")
    return base + ("；" + "、".join(extras) if extras else "")


def build():
    words = []
    seen: set[str] = set()
    ordered = []
    for w, cn, ex, excn, tags in VERBS:
        if w in seen:
            continue          # 列表里偶有重复，去重
        seen.add(w)
        ordered.append((w, cn, ex, excn, tags))

    # 只要前 100 个：列表是按常用度排的，后面那些 -uir / í 类
    # （construir、reír…）变位太特殊，不适合放在入门阶段
    ordered = ordered[:100]

    for i, (word, cn, ex, excn, tags) in enumerate(ordered, start=1):
        pres, pret = conjugate(word, tags)
        unit_order = (i - 1) // PER_UNIT + 1
        words.append({
            "id": f"{BOOK_ID}-{i:04d}",
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
            "book": BOOK_ID,
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
            "conjugations": [
                {
                    "tense": "presente",
                    "tenseCn": "现在时",
                    "rule": rule_hint(word, tags),
                    "forms": dict(zip(PERSONS, pres)),
                },
                {
                    "tense": "preterito",
                    "tenseCn": "简单过去时",
                    # 过去时的不规则太杂，只给正字法相关的提示
                    "rule": (
                        "yo 保音：car→-qué、gar→-gué、zar→-cé"
                        if word.endswith(("car", "gar", "zar"))
                        else None
                    ),
                    "forms": dict(zip(PERSONS, pret)),
                },
            ],
        })
    return words


def purge_stale_audio():
    """删掉本词库的旧音频。

    动词列表一改顺序，id 指向的词就变了（0001 从 hablar 变成 ser），
    而音频是按 id 命名的。gen_audio.py 见到文件存在就跳过，于是旧的
    "hablo" 会被当成 ser 的发音播出来 —— 张冠李戴，而且很隐蔽。

    宁可多花几分钟重新生成，也不能让孩子听到错的读音。
    """
    n = 0
    for sub in ("words", "examples"):
        d = ROOT / "public" / "audio" / sub
        if not d.is_dir():
            continue
        for f in d.glob(f"{BOOK_ID}-*.mp3"):
            f.unlink()
            n += 1
    if n:
        print(f"已清理 {n} 个旧音频（动词列表变了，id 指向的词可能已经不同）")


def sync(words):
    """同步到前端能加载的地方 + 音频脚本读的 all.json。

    - public/data/{id}.json  前端 fetch 词条用
    - data/books.json + public/data/books.json  词书目录
    - data/all.json  gen_audio.py 读它生成发音（不进包）

    public/data/{id}.json 必须是 {meta, words} 结构 —— 前端取的是
    data.words（见 useAppStore.loadBook）。给裸数组的话 importEntries
    收到 undefined，一读 .length 就崩。
    """
    pub = ROOT / "public" / "data"
    pub.mkdir(parents=True, exist_ok=True)

    units = sorted({w["unitOrder"] for w in words})
    payload = {
        "meta": {
            "id": BOOK_ID,
            "name": f"西语常用动词 {len(words)}",
            "grade": "西语动词",
            "source": "常用动词",
            "lang": "es",
            "wordCount": len(words),
            "units": [f"Unidad {u}" for u in units],
        },
        "words": words,
    }
    (pub / f"{BOOK_ID}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    entry = {
        "id": BOOK_ID,
        "name": payload["meta"]["name"],
        "grade": "西语动词",
        "source": "常用动词",
        "lang": "es",
        "wordCount": len(words),
        "unitCount": len(units),
    }
    bpath = ROOT / "data" / "books.json"
    catalog = json.loads(bpath.read_text(encoding="utf-8"))
    catalog = [c for c in catalog if c["id"] != BOOK_ID] + [entry]
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
    print(f"已同步：public/data/{BOOK_ID}.json、books.json、all.json（合计 {len(by_id)} 条）")


def main():
    words = build()
    OUT.write_text(
        json.dumps(words, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"已写入 {OUT.relative_to(ROOT)}  {len(words)} 个动词（去重后）")

    # 自检：每种时态都必须 5 个人称齐全、无空值
    bad = []
    for w in words:
        for c in w["conjugations"]:
            if len(c["forms"]) != 5 or any(not v for v in c["forms"].values()):
                bad.append(w["word"])
    print("自检 人称齐全: " + ("无缺失 ✓" if not bad else "缺 -> " + ", ".join(bad)))

    purge_stale_audio()
    sync(words)

    print("\n抽样（校验变位是否正确）:")
    for name in ["hablar", "tener", "leer", "pedir", "salir", "nacer", "construir"]:
        w = next((x for x in words if x["word"] == name), None)
        if not w:
            continue
        p = w["conjugations"][0]["forms"]
        q = w["conjugations"][1]["forms"]
        print(f"  {name:11s} 现在 {p['yo']}/{p['el']}/{p['nosotros']}"
              f"   过去 {q['yo']}/{q['el']}")


if __name__ == "__main__":
    main()
