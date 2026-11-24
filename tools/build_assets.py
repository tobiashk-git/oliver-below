"""Builds oliver-deep/assets from the Valley Game Godot project (read-only source).
Run:  py tools/build_assets.py"""
import os, json, colorsys, subprocess, shutil
from PIL import Image, ImageDraw

SRC = os.path.join(os.path.expanduser("~"), "Valley Game Godot", "assets")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets")
for d in ("", "/music", "/sfx", "/layers"):
    os.makedirs(OUT + d, exist_ok=True)
os.makedirs(ROOT + "/js", exist_ok=True)
os.makedirs(ROOT + "/css", exist_ok=True)


def src(p):
    return Image.open(os.path.join(SRC, p)).convert("RGBA")


def trim(im):
    b = im.getbbox()
    return im.crop(b) if b else im


def fit(im, w, h, res=Image.LANCZOS):
    im = im.copy()
    im.thumbnail((w, h), res)
    return im


def tint(im, rgb, amt=.75):
    """Recolour keeping shading: luminance ramp dark->rgb->white."""
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            l = (r * .3 + g * .59 + b * .11) / 255
            if l < .5:
                t = [c * l * 2 for c in rgb]
            else:
                t = [c + (255 - c) * (l - .5) * 1.6 for c in rgb]
            px[x, y] = tuple(int(o * (1 - amt) + n * amt) for o, n in zip((r, g, b), t)) + (a,)
    return im


def hue(im, h):
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s > .35:
                if h is None:
                    s = .05
                r, g, b = [int(c * 255) for c in colorsys.hsv_to_rgb(h or 0, s, v)]
                px[x, y] = (r, g, b, a)
    return im


def C(s, a=255):
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def art(rows, pal, scale=4):
    h = len(rows)
    w = max(map(len, rows))
    im = Image.new("RGBA", (w, h))
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c in pal:
                im.putpixel((x, y), pal[c])
    im = im.resize((w * scale, h * scale), Image.NEAREST)
    bg = Image.new("RGBA", (64, 64))
    bg.alpha_composite(im, ((64 - im.width) // 2, (64 - im.height) // 2))
    return bg


def atlas(named, cell, cols, name, q=88, lossless=False):
    n = len(named)
    rows = (n + cols - 1) // cols
    im = Image.new("RGBA", (cols * cell, rows * cell))
    m = {}
    for i, (k, v) in enumerate(named.items()):
        v = fit(v, cell, cell) if max(v.size) > cell else v
        x = i % cols * cell
        y = i // cols * cell
        im.alpha_composite(v, (x + (cell - v.width) // 2, y + (cell - v.height)))
        m[k] = [i % cols, i // cols]
    im.save(os.path.join(OUT, name + ".webp"), quality=q, lossless=lossless, method=6)
    return dict(cell=cell, cols=cols, rows=rows, map=m)


A = {}
# ---- creatures, bottom-anchored in 160px cells
mons = {}
for f in sorted(os.listdir(SRC + "/enemies/art")):
    if f.endswith(".png"):
        mons[f[:-4]] = fit(trim(src("enemies/art/" + f)), 158, 158)
A["mon"] = atlas(mons, 160, 6, "mon")
ports = {}
for p in ["oliver", "luigi", "forest_druid", "frostpeak_ranger", "marsh_guide", "badlands_prospector",
          "village_blacksmith", "village_elder", "village_trader"]:
    ports[p] = fit(src("portraits/%s.png" % p), 128, 128)
A["port"] = atlas(ports, 128, 5, "port")

# ---- icons
MAT = [("wood", None), ("frost", (120, 200, 240)), ("ironwood", (150, 80, 110)), ("ember", (255, 120, 40)),
       ("bogiron", (90, 140, 70)), ("royal", (255, 205, 80))]
ic = {}
for k in ["angel_feather", "antidote", "gold", "healing_potion", "mana_potion", "stone", "fireball", "heal",
          "magic_crystal", "charm_of_warding", "frost_shard", "ember_core", "bog_iron"]:
    ic[k] = src("icons/%s.png" % k)
spear = art(["..............ss", "............ssSs", "...........sSSs.", "...........sSs..", "..........wss...",
             ".........wW.....", "........wW......", ".......wW.......", "......wW........", ".....wW.........",
             "....wW..........", "...wW...........", "..wW............", ".wW.............", "wW..............",
             "W..............."],
            {"s": C("8a929c"), "S": C("e8eef4"), "w": C("8a5a2c"), "W": C("5a3818")})
base = {"blade": src("icons/ironwood_blade.png"), "pick": src("icons/wooden_pickaxe.png"),
        "cleaver": src("icons/bogiron_cleaver.png"), "great": src("icons/bone_greatsword.png"), "spear": spear}
own = {("pick", 1): "frost_pick", ("blade", 3): "ember_blade"}
for t, (m, c) in enumerate(MAT):
    for k, b in base.items():
        if (k, t) in own:
            im = src("icons/%s.png" % own[(k, t)])
        else:
            im = tint(b, c, .7) if c else b
        ic["%s%d" % (k, t)] = im
body = ["leather_armor", "frostweave_coat", "ironwood_mail", "ember_plate", "bogiron_harness", "royal_plate"]
names = ["leather", "frost", "ironwood", "ember", "bogiron"]
PARTS = (("head", "helm"), ("hands", "gloves"), ("legs", "greaves"), ("feet", "boots"))
for t in range(6):
    ic["body%d" % t] = src("icons/%s.png" % body[t])
    for slot, part in PARTS:
        if t == 5:
            im = tint(src("icons/%s_%s.png" % ("ember" if slot != "legs" else "bogiron", part)), (255, 205, 80), .65)
        else:
            im = src("icons/%s_%s.png" % (names[t], "cap" if t == 0 and slot == "head" else part))
        ic["%s%d" % (slot, t)] = im
flask = src("icons/healing_potion.png")
for i, h in enumerate([.08, .15, .30, .45, .52, .72, .80, None]):
    ic["pot%d" % i] = hue(flask, h)
P = {"o": C("5a3d1e"), "p": C("e9d8a6"), "P": C("c9ad6a"), "r": C("8a2f2f")}
ic["scroll"] = art([".oooooooooo..", "oPPPPPPPPPPo.", "oPppppppppPo.", ".opppppppppo.", ".oprrprrrppo.",
                    ".opppppppppo.", ".oprrrrprppo.", ".opppppppppo.", ".oprprrrrppo.", ".opppppppppo.",
                    ".oPppppppppPo", ".oPPPPPPPPPPo", "..oooooooooo."], P)


def tome(c, d):
    return art([".ooooooooo..", "occcccccccop", "ocDDDDDDDcop", "ocDccccgDcop", "ocDcgggcDcop", "ocDggcggDcop",
                "ocDcgggcDcop", "ocDgccccDcop", "ocDDDDDDDcop", "occccccccco.", "oppppppppppo", ".oooooooooo."],
               {"o": C("241a14"), "c": C(c), "D": C(d), "g": C("f2d06b"), "p": C("efe3c0")})


for k, c, d in [("fire", "a8321e", "d9602c"), ("frost", "2f6fa8", "6fb6e0"), ("heal", "3d7d3a", "7cc06a"),
                ("blink", "5a3d8f", "8f6fd0"), ("sleep", "31407a", "5c6fb8"), ("storm", "8a7a1e", "d8c040"),
                ("ward", "5f6670", "a4adb8"), ("root", "4a5a22", "86a040"), ("sling", "6b4a2a", "9a7040")]:
    ic["tome_" + k] = tome(c, d)
ic["pasty"] = art([".....oooooo.....", "...oobbbbbboo...", "..obBbBbBbBbbo..", ".obbbbbbbbbbbbo.", ".obBBbbbbbbBBbo.",
                   "obbbbbsbsbsbbbbo", "obBbbbbbbbbbbBbo", "ocbcbcbcbcbcbcbo", ".ococococococco.", "..oooooooooooo.."],
                  {"o": C("5e3512"), "b": C("d9953f"), "B": C("efbd6c"), "c": C("b06c24"), "s": C("7a4716")})
ic["key"] = art(["...oooo.....", "..oggggo....", ".ogoooggo...", ".ogo.oggo...", ".ogoooggo...", "..oggggo....",
                 "...oggo.....", "...oggo.....", "...oggooo...", "...oggggo...", "...oggooo...", "...ogggo....",
                 "...ooooo...."], {"o": C("5a3d08"), "g": C("f2c84b")})
ic["skull"] = art(["..oooooooo..", ".owwwwwwwwo.", "owwwwwwwwwwo", "owddwwwwddwo", "owddwwwwddwo", "owwwwddwwwwo",
                   ".owwwwwwwwo.", "..owdwdwdo..", "..owwwwwwo..", "...oooooo..."],
                  {"o": C("2a2420"), "w": C("e8e0d0"), "d": C("2a2420")})
ic["zzz"] = art(["ooooooo.....", "owwwwwo.....", "ooooowo.....", "...owo......", "..owo..oooo.", ".owoooowwwo.",
                 "owwwwwoooowo", "ooooooo.owo.", ".......owoo.", "......owwwo.", "......ooooo."],
                {"o": C("26365e"), "w": C("cfe0ff")})
for i, c in enumerate([(230, 70, 70), (80, 160, 255), (240, 200, 70), (150, 90, 220), (90, 200, 120)]):
    ic["charm%d" % i] = tint(src("icons/charm_of_warding.png"), c, .7)
for k, im in list(ic.items()):
    if im.size != (64, 64):
        bg = Image.new("RGBA", (64, 64))
        f = fit(im, 64, 64)
        bg.alpha_composite(f, ((64 - f.width) // 2, (64 - f.height) // 2))
        ic[k] = bg
A["icon"] = atlas(ic, 64, 12, "icon", lossless=True)


# ---- tiles 32px
def dark(im, f, c=(0, 0, 0)):
    im = im.convert("RGBA")
    return Image.blend(im, Image.new("RGBA", im.size, c + (255,)), f)


tl = {}
Z = [("barrow", "dungeon_floor", "dungeon_wall", .34, (40, 30, 24)),
     ("ice", "frostpeak_floor", "frostpeak_wall", .22, (40, 70, 110)),
     ("grove", "verdantwood_floor", "verdantwood_wall", .12, (10, 40, 20)),
     ("caldera", "badlands_floor", "badlands_wall", .42, (60, 16, 6)),
     ("temple", "gloomfen_floor", "gloomfen_wall", .30, (16, 40, 34)),
     ("castle", "castle_floor", "castle_wall", .18, (30, 24, 50))]
for n, f, w, k, c in Z:
    tl["f_" + n] = dark(src(f + ".png").crop((0, 0, 32, 32)), k, c)
    tl["w_" + n] = dark(src(w + ".png").crop((0, 0, 32, 32)), .08, c)
    tl["t_" + n] = dark(src(w + ".png").crop((0, 0, 32, 32)), .80, tuple(v // 5 for v in c))
tl["f_grove"] = dark(src("forest_ground.png").crop((0, 0, 32, 32)), .42, (12, 30, 14))
tl["w_caldera"] = dark(tint(src("dungeon_wall.png").crop((0, 0, 32, 32)), (120, 60, 40), .7), .15, (40, 10, 5))
tl["t_caldera"] = dark(tl["w_caldera"], .8, (12, 4, 2))
tl["lava"] = src("badlands_geyser.png").crop((0, 0, 32, 32))
tl["ice"] = src("frostpeak_ice.png").crop((0, 0, 32, 32))
tl["mud"] = src("gloomfen_mud.png").crop((0, 0, 32, 32))
tl["water"] = dark(src("river.png").crop((0, 0, 32, 32)), .35, (8, 20, 40))


def tile(fn):
    im = Image.new("RGBA", (32, 32))
    fn(ImageDraw.Draw(im))
    return im


def door(d):
    d.rectangle((0, 0, 31, 31), fill=C("17110c"))
    d.rectangle((3, 1, 28, 31), fill=C("3a2415"))
    d.rectangle((5, 3, 26, 31), fill=C("7a4d25"))
    for x in (9, 14, 19, 24):
        d.line((x, 3, x, 31), fill=C("5c3818"))
    for y in (8, 23):
        d.rectangle((4, y, 27, y + 2), fill=C("4b4f55"))
        d.line((4, y, 27, y), fill=C("7c838b"))
    d.ellipse((21, 15, 24, 18), fill=C("e0b34a"))


def dopen(d):
    for x in (0, 27):
        d.rectangle((x, 0, x + 4, 31), fill=C("3a2415"))
        d.rectangle((x + 1, 0, x + 3, 31), fill=C("7a4d25"))


def locked(d):
    door(d)
    d.rectangle((10, 10, 21, 22), fill=C("8a6a1c"))
    d.rectangle((11, 11, 20, 21), fill=C("e0b34a"))
    d.rectangle((14, 14, 17, 19), fill=C("2a1a08"))


def stairs(d):
    d.rectangle((0, 0, 31, 31), fill=C("0a0807"))
    for i in range(5):
        s = 150 - i * 26
        y = 2 + i * 6
        d.rectangle((2 + i * 2, y, 29 - i * 2, y + 5), fill=(s, s - 8, s - 22, 255))
        d.line((2 + i * 2, y, 29 - i * 2, y), fill=(min(255, s + 40), s + 30, s + 10, 255))
    d.rectangle((0, 0, 31, 31), outline=C("2a2018"))


def web(d):
    for a in ((0, 0, 31, 31), (31, 0, 0, 31), (16, 0, 16, 31), (0, 16, 31, 16)):
        d.line(a, fill=(220, 225, 235, 150))
    for r in (5, 10, 14):
        d.ellipse((16 - r, 16 - r, 16 + r, 16 + r), outline=(220, 225, 235, 130))


def trap(d):
    for x in (7, 15, 23):
        for y in (7, 15, 23):
            d.polygon([(x - 3, y + 3), (x, y - 4), (x + 3, y + 3)], fill=C("9aa2aa"))
            d.line((x, y - 4, x + 3, y + 3), fill=C("5a6068"))


for n, fn in (("door", door), ("dopen", dopen), ("locked", locked), ("stairs", stairs), ("web", web), ("trap", trap)):
    tl[n] = tile(fn)
A["tile"] = atlas(tl, 32, 8, "tile", lossless=True)

# ---- props up to 96px
pr = {}
for k, p, w, h in [("chest", "chest.png", 64, 60), ("chest_iron", "chest_dungeon.png", 60, 60), ("altar", "altar.png", 60, 84),
                   ("obelisk", "ancient_barrow.png", 50, 80), ("bed", "furniture/bed.png", 60, 80),
                   ("shelf", "furniture/bookshelf.png", 50, 90), ("barrel", "furniture/barrel.png", 52, 60),
                   ("forge", "furniture/forge.png", 90, 94), ("stove", "furniture/stove.png", 50, 80),
                   ("table", "furniture/table.png", 80, 50), ("crystal", "ice_crystal_shard.png", 80, 84),
                   ("boulder", "ice_boulder.png", 76, 76), ("fern", "swamp_ferns.png", 80, 84),
                   ("bush", "tangled_bush.png", 76, 76), ("mush", "swamp_mushrooms.png", 80, 70),
                   ("pool", "ice_pool.png", 80, 80), ("circle", "druid_circle.png", 94, 64), ("rock", "rock.png", 70, 50),
                   ("geyser", "badlands_fire_geyser.png", 80, 90), ("tumble", "badlands_tumbleweed.png", 74, 74),
                   ("log", "fallen_log.png", 90, 50), ("luigi", "npc_luigi.png", 80, 94), ("oak", "mighty_oak.png", 94, 94),
                   ("cage", "gate.png", 64, 64)]:
    pr[k] = fit(trim(src(p)), w, h)
for k, p in [("trader", "trader.png"), ("elder", "elder.png")]:
    t = trim(src(p))
    pr[k] = fit(t.resize((t.width * 2, t.height * 2), Image.NEAREST), 94, 94)
A["prop"] = atlas(pr, 96, 6, "prop")
fit(src("oliver_portrait.png"), 220, 460).save(OUT + "/hero.webp", quality=90)
for k, p in [("barrow", "entrance_barrow"), ("ice", "entrance_ice_caves"), ("grove", "entrance_grove"),
             ("caldera", "entrance_caldera"), ("temple", "entrance_temple"), ("castle", "castle_entrance")]:
    src(p + ".png").save(OUT + "/gate_%s.webp" % k, quality=90)

# ---- LPC walk layers (576x256, 9 frames x up/left/down/right)
src("player_base.png").save(OUT + "/layers/base.webp", lossless=True)
lay = {"body": body}
for slot, part in PARTS:
    lay[slot] = ["%s_%s" % (n, "cap" if n == "leather" and slot == "head" else part) for n in names]
for slot, l in lay.items():
    for t in range(6):
        if t >= len(l):
            im = tint(src("armour_layers/%s.png" % l[4]), (255, 205, 80), .7)
        else:
            im = src("armour_layers/%s.png" % l[t])
        im.save(OUT + "/layers/%s%d.webp" % (slot, t), lossless=True)


# ---- app icons
def appicon(s):
    im = Image.new("RGBA", (512, 512), C("1d1712"))
    d = ImageDraw.Draw(im)
    for r in range(330, 0, -3):
        k = 1 - r / 330
        d.ellipse((256 - r, 250 - r, 256 + r, 250 + r), fill=(int(29 + 150 * k), int(23 + 95 * k), int(18 + 20 * k), 255))
    g = src("dungeon_entrance.png")
    g = g.resize((470, int(470 * g.height / g.width)), Image.NEAREST)
    im.alpha_composite(g, (21, 50))
    o = trim(src("portraits/oliver.png"))
    o = o.resize((250, int(250 * o.height / o.width)), Image.LANCZOS)
    im.alpha_composite(o, (131, 512 - o.height))
    return im.resize((s, s), Image.LANCZOS).convert("RGB")


for s in (180, 192, 512):
    appicon(s).save(OUT + "/icon-%d.png" % s)
with open(os.path.join(ROOT, "js", "atlas.js"), "w") as fh:
    fh.write("const ATLAS=" + json.dumps(A, separators=(",", ":")) + ";\n")

# ---- audio: MP3: plays on every iPhone
import imageio_ffmpeg
ff = imageio_ffmpeg.get_ffmpeg_exe()
for sub, ch, br in (("music", "2", "72k"), ("sfx", "1", "64k")):
    for f in os.listdir(SRC + "/" + sub):
        if f.endswith((".ogg", ".wav", ".mp3")):
            o = OUT + "/" + sub + "/" + f.rsplit(".", 1)[0] + ".mp3"
            subprocess.run([ff, "-y", "-v", "error", "-i", SRC + "/" + sub + "/" + f, "-ac", ch, "-b:a", br, o], check=True)
# CREDITS.md is kept by hand from here on
print("ok", len(ic), "icons")
