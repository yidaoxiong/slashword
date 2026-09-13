#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成西语入门词库（200 词，8 个单元）。

内容面向刚开始学西语的孩子：高频词 + 短例句，例句里尽量复用前面单元学过的词，
这样后面的单元其实在顺带复习前面。

数据格式：(单词, 冠词, 词性, 中文, 西语例句, 例句中文)
冠词单独存、不拼进单词 —— 拼写练习考的是词本身，冠词只在卡片上提示。

输出 data/es-basico.json，之后用 npm run import-book 并进仓库。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BOOK_ID = "es-basico"
GRADE = "西语入门"
SOURCE = "入门词库"

UNITS = [
    ("Saludos 问候", [
        ("hola", "", "interj.", "你好", "¡Hola! ¿Cómo estás?", "你好！你好吗？"),
        ("buenos días", "", "saludo", "早上好", "Buenos días, profesor.", "老师，早上好。"),
        ("buenas noches", "", "saludo", "晚安", "Buenas noches, mamá.", "晚安，妈妈。"),
        ("gracias", "", "f.", "谢谢", "Muchas gracias por tu ayuda.", "非常感谢你的帮助。"),
        ("por favor", "", "expr.", "请", "Un vaso de agua, por favor.", "请给我一杯水。"),
        ("perdón", "", "m.", "对不起，借过", "Perdón, ¿puedo pasar?", "抱歉，我能过去吗？"),
        ("lo siento", "", "expr.", "我很抱歉", "Lo siento, llego tarde.", "对不起，我迟到了。"),
        ("de nada", "", "expr.", "不客气", "—Gracias. —De nada.", "“谢谢。”“不客气。”"),
        ("adiós", "", "interj.", "再见", "Adiós, hasta mañana.", "再见，明天见。"),
        ("hasta luego", "", "expr.", "回头见", "Hasta luego, amigos.", "朋友们，回头见。"),
        ("sí", "", "adv.", "是，对", "Sí, quiero ir contigo.", "是的，我想和你一起去。"),
        ("no", "", "adv.", "不，没有", "No, gracias.", "不用了，谢谢。"),
        ("nombre", "el", "m.", "名字", "¿Cuál es tu nombre?", "你叫什么名字？"),
        ("amigo", "el", "m.", "朋友（男）", "Mi amigo se llama Pablo.", "我的朋友叫巴勃罗。"),
        ("amiga", "la", "f.", "朋友（女）", "Ana es mi amiga.", "安娜是我的朋友。"),
        ("señor", "el", "m.", "先生", "El señor García es mi vecino.", "加西亚先生是我的邻居。"),
        ("señora", "la", "f.", "女士，太太", "La señora López vive aquí.", "洛佩斯太太住在这儿。"),
        ("niño", "el", "m.", "男孩，小孩", "El niño juega en el parque.", "那个男孩在公园里玩。"),
        ("niña", "la", "f.", "女孩", "La niña tiene cinco años.", "那个女孩五岁。"),
        ("bien", "", "adv.", "好，很好", "Estoy bien, gracias.", "我很好，谢谢。"),
        ("mal", "", "adv.", "不好，糟糕", "Hoy me siento mal.", "我今天感觉不舒服。"),
        ("cómo", "", "adv.", "怎么，怎么样", "¿Cómo te llamas?", "你叫什么名字？"),
        ("qué", "", "pron.", "什么", "¿Qué es esto?", "这是什么？"),
        ("dónde", "", "adv.", "哪里", "¿Dónde está mi mochila?", "我的书包在哪儿？"),
        ("quién", "", "pron.", "谁", "¿Quién es ese niño?", "那个男孩是谁？"),
    ]),
    ("Familia 家人", [
        ("familia", "la", "f.", "家庭", "Mi familia es muy grande.", "我的家庭很大。"),
        ("padre", "el", "m.", "父亲", "Mi padre trabaja en un hospital.", "我爸爸在医院工作。"),
        ("madre", "la", "f.", "母亲", "Mi madre cocina muy bien.", "我妈妈做饭很好吃。"),
        ("papá", "el", "m.", "爸爸", "Papá, ¿puedes ayudarme?", "爸爸，你能帮我吗？"),
        ("mamá", "la", "f.", "妈妈", "Mamá está en la cocina.", "妈妈在厨房里。"),
        ("hermano", "el", "m.", "兄弟", "Tengo un hermano mayor.", "我有一个哥哥。"),
        ("hermana", "la", "f.", "姐妹", "Mi hermana estudia música.", "我姐姐学音乐。"),
        ("abuelo", "el", "m.", "爷爷，外公", "Mi abuelo tiene setenta años.", "我爷爷七十岁了。"),
        ("abuela", "la", "f.", "奶奶，外婆", "La abuela hace galletas.", "奶奶做饼干。"),
        ("hijo", "el", "m.", "儿子", "Él es mi hijo menor.", "他是我的小儿子。"),
        ("hija", "la", "f.", "女儿", "Su hija va a la escuela.", "他女儿在上学。"),
        ("tío", "el", "m.", "叔叔，舅舅", "Mi tío vive en México.", "我叔叔住在墨西哥。"),
        ("tía", "la", "f.", "阿姨，姑姑", "Mi tía es profesora.", "我姑姑是老师。"),
        ("primo", "el", "m.", "堂表兄弟", "Mi primo juega al fútbol.", "我表哥踢足球。"),
        ("prima", "la", "f.", "堂表姐妹", "Mi prima tiene diez años.", "我表妹十岁。"),
        ("bebé", "el", "m./f.", "婴儿", "El bebé duerme en la cuna.", "宝宝在摇篮里睡觉。"),
        ("hombre", "el", "m.", "男人", "Ese hombre es mi tío.", "那个男人是我叔叔。"),
        ("mujer", "la", "f.", "女人", "Esa mujer es mi maestra.", "那位女士是我的老师。"),
        ("maestro", "el", "m.", "男老师", "El maestro enseña matemáticas.", "老师教数学。"),
        ("maestra", "la", "f.", "女老师", "La maestra lee un cuento.", "女老师在读故事。"),
        ("médico", "el", "m.", "医生", "El médico me revisa la garganta.", "医生检查我的喉咙。"),
        ("estudiante", "el", "m./f.", "学生", "Soy estudiante de quinto grado.", "我是五年级学生。"),
        ("vecino", "el", "m.", "邻居", "Mi vecino tiene un perro.", "我邻居有一只狗。"),
        ("compañero", "el", "m.", "同学", "Mi compañero de clase es simpático.", "我的同学很友好。"),
        ("gente", "la", "f.", "人们", "Hay mucha gente en la plaza.", "广场上有很多人。"),
    ]),
    ("Números y colores 数字与颜色", [
        ("uno", "", "num.", "一", "Tengo un hermano.", "我有一个兄弟。"),
        ("dos", "", "num.", "二", "Compré dos libros nuevos.", "我买了两本新书。"),
        ("tres", "", "num.", "三", "Somos tres en casa.", "我们家三口人。"),
        ("cuatro", "", "num.", "四", "Mi gato tiene cuatro patas.", "我的猫有四条腿。"),
        ("cinco", "", "num.", "五", "Son las cinco de la tarde.", "现在是下午五点。"),
        ("diez", "", "num.", "十", "Tengo diez años.", "我十岁了。"),
        ("cien", "", "num.", "一百", "Cien es un número grande.", "一百是个大数字。"),
        ("rojo", "", "adj.", "红色的", "Mi camisa es roja.", "我的衬衫是红色的。"),
        ("azul", "", "adj.", "蓝色的", "El cielo está azul hoy.", "今天天空是蓝色的。"),
        ("verde", "", "adj.", "绿色的", "Me gusta el té verde.", "我喜欢绿茶。"),
        ("amarillo", "", "adj.", "黄色的", "El sol es amarillo.", "太阳是黄色的。"),
        ("blanco", "", "adj.", "白色的", "La nieve es blanca.", "雪是白色的。"),
        ("negro", "", "adj.", "黑色的", "Tengo un gato negro.", "我有一只黑猫。"),
        ("morado", "", "adj.", "紫色的", "Las uvas son moradas.", "葡萄是紫色的。"),
        ("grande", "", "adj.", "大的", "Mi casa es muy grande.", "我家很大。"),
        ("pequeño", "", "adj.", "小的", "Es un pueblo pequeño.", "那是个小镇。"),
        ("nuevo", "", "adj.", "新的", "Tengo un libro nuevo.", "我有一本新书。"),
        ("viejo", "", "adj.", "旧的，老的", "Este pupitre es viejo.", "这张课桌很旧。"),
        ("bonito", "", "adj.", "漂亮的", "¡Qué bonito es tu dibujo!", "你的画真漂亮！"),
        ("feo", "", "adj.", "难看的", "Ese sombrero es feo.", "那顶帽子不好看。"),
        ("largo", "", "adj.", "长的", "Este río es muy largo.", "这条河很长。"),
        ("corto", "", "adj.", "短的", "Mi pelo es corto.", "我的头发很短。"),
        ("alto", "", "adj.", "高的", "Mi hermano es muy alto.", "我哥哥很高。"),
        ("bajo", "", "adj.", "矮的", "Yo soy más bajo que él.", "我比他矮。"),
        ("círculo", "el", "m.", "圆形", "Dibuja un círculo rojo.", "画一个红色的圆形。"),
    ]),
    ("La escuela 学校", [
        ("escuela", "la", "f.", "学校", "Voy a la escuela en autobús.", "我坐公交车去学校。"),
        ("clase", "la", "f.", "课，班级", "La clase empieza a las ocho.", "八点开始上课。"),
        ("aula", "el", "f.", "教室", "El aula está en el segundo piso.", "教室在二楼。"),
        ("libro", "el", "m.", "书", "Este libro es muy interesante.", "这本书很有趣。"),
        ("cuaderno", "el", "m.", "笔记本", "Escribo en mi cuaderno azul.", "我在我的蓝本子上写。"),
        ("lápiz", "el", "m.", "铅笔", "Necesito un lápiz afilado.", "我需要一支削好的铅笔。"),
        ("bolígrafo", "el", "m.", "圆珠笔", "Mi bolígrafo es de color azul.", "我的圆珠笔是蓝色的。"),
        ("mochila", "la", "f.", "书包", "Mi mochila está muy pesada.", "我的书包很重。"),
        ("papel", "el", "m.", "纸", "Dame una hoja de papel.", "给我一张纸。"),
        ("mesa", "la", "f.", "桌子", "Pon el libro en la mesa.", "把书放在桌上。"),
        ("silla", "la", "f.", "椅子", "Hay veinte sillas en el aula.", "教室里有二十把椅子。"),
        ("pizarra", "la", "f.", "黑板", "El profesor escribe en la pizarra.", "老师在黑板上写字。"),
        ("tarea", "la", "f.", "作业", "Tengo mucha tarea hoy.", "我今天作业很多。"),
        ("examen", "el", "m.", "考试", "Mañana tengo un examen.", "明天我有考试。"),
        ("pregunta", "la", "f.", "问题", "Tengo una pregunta, profe.", "老师，我有一个问题。"),
        ("respuesta", "la", "f.", "回答", "Tu respuesta es correcta.", "你的回答是对的。"),
        ("lección", "la", "f.", "一课", "Hoy aprendo la lección tres.", "今天我学第三课。"),
        ("palabra", "la", "f.", "单词", "¿Qué significa esta palabra?", "这个词是什么意思？"),
        ("leer", "", "v.", "读，阅读", "Me gusta leer cuentos.", "我喜欢读故事。"),
        ("escribir", "", "v.", "写", "Escribo mi nombre aquí.", "我把名字写在这里。"),
        ("aprender", "", "v.", "学习", "Quiero aprender español.", "我想学西班牙语。"),
        ("enseñar", "", "v.", "教", "Ella enseña inglés.", "她教英语。"),
        ("estudiar", "", "v.", "学习，用功", "Estudio todos los días.", "我每天学习。"),
        ("entender", "", "v.", "懂，理解", "No entiendo la pregunta.", "我不懂这个问题。"),
        ("hablar", "", "v.", "说，讲", "Hablo español y chino.", "我会说西班牙语和中文。"),
    ]),
    ("La comida 食物", [
        ("comida", "la", "f.", "食物，饭菜", "La comida ya está lista.", "饭已经做好了。"),
        ("desayuno", "el", "m.", "早餐", "El desayuno es a las siete.", "七点吃早餐。"),
        ("almuerzo", "el", "m.", "午餐", "El almuerzo es a mediodía.", "午餐在中午。"),
        ("cena", "la", "f.", "晚餐", "La cena es a las ocho.", "晚餐在八点。"),
        ("pan", "el", "m.", "面包", "Compro pan cada mañana.", "我每天早上买面包。"),
        ("leche", "la", "f.", "牛奶", "Bebo leche antes de dormir.", "我睡前喝牛奶。"),
        ("agua", "el", "f.", "水", "Necesito un vaso de agua.", "我需要一杯水。"),
        ("jugo", "el", "m.", "果汁", "Quiero jugo de naranja.", "我要橙汁。"),
        ("café", "el", "m.", "咖啡", "Mi papá toma café con leche.", "我爸爸喝加奶的咖啡。"),
        ("té", "el", "m.", "茶", "El té está muy caliente.", "茶很烫。"),
        ("arroz", "el", "m.", "米饭", "Me gusta el arroz con pollo.", "我喜欢鸡肉配米饭。"),
        ("pollo", "el", "m.", "鸡肉", "Como pollo todos los días.", "我每天吃鸡肉。"),
        ("pescado", "el", "m.", "鱼（食用）", "El pescado está muy fresco.", "这鱼很新鲜。"),
        ("huevo", "el", "m.", "蛋", "Como un huevo en el desayuno.", "我早餐吃一个鸡蛋。"),
        ("queso", "el", "m.", "奶酪", "El queso es mi favorito.", "奶酪是我的最爱。"),
        ("fruta", "la", "f.", "水果", "La fruta es muy saludable.", "水果很健康。"),
        ("manzana", "la", "f.", "苹果", "Como una manzana al día.", "我每天吃一个苹果。"),
        ("plátano", "el", "m.", "香蕉", "El plátano es dulce.", "香蕉很甜。"),
        ("naranja", "la", "f.", "橙子", "La naranja es jugosa.", "橙子很多汁。"),
        ("uva", "la", "f.", "葡萄", "Las uvas son moradas.", "葡萄是紫色的。"),
        ("verdura", "la", "f.", "蔬菜", "Debo comer más verduras.", "我应该多吃蔬菜。"),
        ("sopa", "la", "f.", "汤", "La sopa está muy caliente.", "汤很烫。"),
        ("azúcar", "el", "m.", "糖", "El café tiene mucha azúcar.", "咖啡里糖很多。"),
        ("sal", "la", "f.", "盐", "Falta sal en la sopa.", "汤里少盐。"),
        ("postre", "el", "m.", "甜点", "De postre hay helado.", "甜点是冰淇淋。"),
    ]),
    ("Animales 动物与自然", [
        ("animal", "el", "m.", "动物", "Mi animal favorito es el delfín.", "我最喜欢的动物是海豚。"),
        ("perro", "el", "m.", "狗", "Mi perro se llama Max.", "我的狗叫马克斯。"),
        ("gato", "el", "m.", "猫", "El gato duerme en el sofá.", "猫睡在沙发上。"),
        ("pájaro", "el", "m.", "鸟", "El pájaro canta en el árbol.", "鸟在树上唱歌。"),
        ("pez", "el", "m.", "鱼", "El pez nada en el agua.", "鱼在水里游。"),
        ("caballo", "el", "m.", "马", "El caballo corre muy rápido.", "马跑得很快。"),
        ("vaca", "la", "f.", "奶牛", "La vaca nos da leche.", "奶牛给我们牛奶。"),
        ("cerdo", "el", "m.", "猪", "El cerdo come mucho.", "猪吃得很多。"),
        ("gallina", "la", "f.", "母鸡", "La gallina pone huevos.", "母鸡下蛋。"),
        ("oso", "el", "m.", "熊", "El oso vive en el bosque.", "熊住在森林里。"),
        ("león", "el", "m.", "狮子", "El león es el rey de la selva.", "狮子是丛林之王。"),
        ("elefante", "el", "m.", "大象", "El elefante es muy grande.", "大象很大。"),
        ("mono", "el", "m.", "猴子", "El mono come plátanos.", "猴子吃香蕉。"),
        ("conejo", "el", "m.", "兔子", "El conejo salta muy alto.", "兔子跳得很高。"),
        ("mariposa", "la", "f.", "蝴蝶", "La mariposa tiene muchos colores.", "蝴蝶有很多颜色。"),
        ("árbol", "el", "m.", "树", "Ese árbol es muy alto.", "那棵树很高。"),
        ("flor", "la", "f.", "花", "La flor del jardín es roja.", "花园里的花是红色的。"),
        ("hierba", "la", "f.", "草", "La hierba está muy verde.", "草很绿。"),
        ("río", "el", "m.", "河", "El río pasa por el pueblo.", "河穿过小镇。"),
        ("mar", "el", "m.", "海", "Nadamos en el mar en verano.", "夏天我们在海里游泳。"),
        ("montaña", "la", "f.", "山", "La montaña está muy lejos.", "山很远。"),
        ("bosque", "el", "m.", "森林", "En el bosque hay muchos árboles.", "森林里有很多树。"),
        ("sol", "el", "m.", "太阳", "El sol brilla hoy.", "今天阳光灿烂。"),
        ("luna", "la", "f.", "月亮", "La luna sale de noche.", "月亮在晚上出现。"),
        ("estrella", "la", "f.", "星星", "Veo muchas estrellas.", "我看见很多星星。"),
    ]),
    ("El cuerpo 身体与日常", [
        ("cuerpo", "el", "m.", "身体", "Debo cuidar mi cuerpo.", "我要爱护身体。"),
        ("cabeza", "la", "f.", "头", "Me duele la cabeza.", "我头疼。"),
        ("pelo", "el", "m.", "头发", "Mi pelo es negro y corto.", "我的头发又黑又短。"),
        ("ojo", "el", "m.", "眼睛", "Tengo los ojos marrones.", "我的眼睛是棕色的。"),
        ("oreja", "la", "f.", "耳朵", "Me duelen las orejas.", "我耳朵疼。"),
        ("nariz", "la", "f.", "鼻子", "Mi nariz es pequeña.", "我的鼻子很小。"),
        ("boca", "la", "f.", "嘴", "Abre la boca, por favor.", "请张开嘴。"),
        ("diente", "el", "m.", "牙齿", "Me cepillo los dientes.", "我刷牙。"),
        ("mano", "la", "f.", "手", "Lávate las manos antes de comer.", "吃饭前洗手。"),
        ("pie", "el", "m.", "脚", "Me duele el pie derecho.", "我右脚疼。"),
        ("pierna", "la", "f.", "腿", "Corro con las piernas.", "我用腿跑。"),
        ("brazo", "el", "m.", "手臂", "Levanta el brazo izquierdo.", "举起左臂。"),
        ("corazón", "el", "m.", "心脏，心", "El corazón late muy rápido.", "心跳很快。"),
        ("levantarse", "", "v.", "起床", "Me levanto a las siete.", "我七点起床。"),
        ("dormir", "", "v.", "睡觉", "Duermo ocho horas cada noche.", "我每晚睡八小时。"),
        ("comer", "", "v.", "吃", "Como a la una de la tarde.", "我下午一点吃饭。"),
        ("beber", "", "v.", "喝", "Bebo mucha agua en verano.", "夏天我喝很多水。"),
        ("caminar", "", "v.", "走路", "Camino a la escuela.", "我走路去学校。"),
        ("correr", "", "v.", "跑", "Corro en el parque.", "我在公园跑步。"),
        ("jugar", "", "v.", "玩", "Juego al fútbol con mis amigos.", "我和朋友们踢足球。"),
        ("bañarse", "", "v.", "洗澡", "Me baño por la noche.", "我晚上洗澡。"),
        ("lavar", "", "v.", "洗", "Lavo los platos después de cenar.", "晚饭后我洗盘子。"),
        ("vestirse", "", "v.", "穿衣服", "Me visto muy rápido.", "我穿衣服很快。"),
        ("descansar", "", "v.", "休息", "Descanso después de comer.", "我吃完饭休息。"),
        ("enfermo", "", "adj.", "生病的", "Estoy enfermo, no voy a clase.", "我病了，不去上课。"),
    ]),
    ("El tiempo 时间与天气", [
        ("día", "el", "m.", "天，日子", "Hoy es un día muy bonito.", "今天是很美好的一天。"),
        ("noche", "la", "f.", "夜晚", "La noche está muy tranquila.", "夜晚很安静。"),
        ("mañana", "la", "f.", "早晨", "Por la mañana hace frío.", "早上很冷。"),
        ("tarde", "la", "f.", "下午", "Nos vemos por la tarde.", "下午见。"),
        ("hoy", "", "adv.", "今天", "Hoy es lunes.", "今天是星期一。"),
        ("ayer", "", "adv.", "昨天", "Ayer fui al cine.", "昨天我去看电影了。"),
        ("semana", "la", "f.", "星期，周", "Esta semana tengo un examen.", "这周我有考试。"),
        ("mes", "el", "m.", "月份", "Mi cumpleaños es este mes.", "我的生日在这个月。"),
        ("año", "el", "m.", "年，岁", "Este año aprendo español.", "今年我学西班牙语。"),
        ("hora", "la", "f.", "小时，钟点", "¿Qué hora es, por favor?", "请问几点了？"),
        ("tiempo", "el", "m.", "时间，天气", "No tengo tiempo para jugar.", "我没时间玩。"),
        ("lunes", "el", "m.", "星期一", "El lunes tengo clase de música.", "星期一我有音乐课。"),
        ("domingo", "el", "m.", "星期日", "El domingo voy al parque.", "星期天我去公园。"),
        ("cumpleaños", "el", "m.", "生日", "Mi cumpleaños es en mayo.", "我的生日在五月。"),
        ("calor", "el", "m.", "热", "Hoy hace mucho calor.", "今天很热。"),
        ("frío", "el", "m.", "冷", "Hace frío en invierno.", "冬天很冷。"),
        ("lluvia", "la", "f.", "雨", "Me gusta el sonido de la lluvia.", "我喜欢雨声。"),
        ("viento", "el", "m.", "风", "Hoy hace mucho viento.", "今天风很大。"),
        ("nube", "la", "f.", "云", "Hay una nube blanca en el cielo.", "天上有一朵白云。"),
        ("nieve", "la", "f.", "雪", "La nieve cae en invierno.", "冬天下雪。"),
        ("ser", "", "v.", "是（本质）", "Soy de China.", "我来自中国。"),
        ("estar", "", "v.", "在，处于", "Estoy en casa ahora.", "我现在在家。"),
        ("tener", "", "v.", "有", "Tengo dos hermanos.", "我有两个兄弟。"),
        ("ir", "", "v.", "去", "Voy al colegio en autobús.", "我坐公交车去学校。"),
        ("querer", "", "v.", "想要", "Quiero un helado de chocolate.", "我想要一个巧克力冰淇淋。"),
    ]),
]


def main():
    words = []
    units = []
    n = 0
    for i, (title, rows) in enumerate(UNITS, start=1):
        unit = f"Unidad {i}"
        units.append(unit)
        for word, article, pos, cn, ex_es, ex_cn in rows:
            n += 1
            words.append({
                "id": f"{BOOK_ID}-{n:04d}",
                "word": word,
                "note": "",
                "phoneticUk": "",
                "phoneticUs": "",
                "article": article,
                "lang": "es",
                "pos": pos,
                "cn": cn,
                "exampleEn": ex_es,
                "exampleCn": ex_cn,
                "book": BOOK_ID,
                "grade": GRADE,
                "source": SOURCE,
                "unit": unit,
                "unitOrder": i,
                "unitTitle": title,
                "lesson": "",
                "lessonOrder": 999,
                "lessonTitle": "",
                "category": "",
                "phonics": [],
                "definitionEn": "",
            })

    meta = {
        "id": BOOK_ID,
        "name": "西语入门 200 词",
        "grade": GRADE,
        "source": SOURCE,
        "lang": "es",
        "wordCount": len(words),
        "units": units,
    }
    out = ROOT / "data" / f"{BOOK_ID}.json"
    out.write_text(
        json.dumps({"meta": meta, "words": words}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"-> 已写出 {out}（{len(words)} 词，{len(units)} 单元）")

    accented = [w["word"] for w in words if any(c in w["word"] for c in "áéíóúñüÁÉÍÓÚÑÜ")]
    print(f"   带重音/ñ 的词 {len(accented)} 个：{'、'.join(accented[:14])}…")
    with_article = sum(1 for w in words if w["article"])
    print(f"   带冠词 {with_article} 个 · 无冠词 {len(words) - with_article} 个")
    print(f"   缺例句 {sum(1 for w in words if not w['exampleEn'])} 个")


if __name__ == "__main__":
    main()
