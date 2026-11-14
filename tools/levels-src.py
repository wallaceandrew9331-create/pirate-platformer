# Authoring helper: levels are drawn as 15-row chunks side by side, then
# stitched into the ASCII grids in src/game/levels/*.ts. Edit the chunks
# here and run `python tools/levels-src.py` to regenerate the data files.
# (The game only ever reads the generated .ts data.)
import json, pathlib

H = 15
ROCK = "#" * 40  # a full-width rock row, cut to each chunk's width


def chunk(*rows, w):
    rows = list(rows)
    assert len(rows) == H, f"chunk has {len(rows)} rows"
    out = []
    for r in rows:
        if r == ROCK:
            r = "#" * w
        assert len(r) <= w, f"row too long ({len(r)}>{w}): {r!r}"
        out.append(r.ljust(w, "."))
    return out


def stitch(chunks):
    return ["".join(c[i] for c in chunks) for i in range(H)]


E = ""  # empty row shorthand

# ---------------------------------------------------------------- level 1
L1 = [
    chunk(E, E, E, E, E, E, E,
          "...............o.o",
          "..............=====",
          E,
          "..........o.o",
          ".P..y..S...............f",
          "#" * 26, "#" * 26, "#" * 26, w=26),
    chunk(E, E, E, E, E, E, E, E,
          "................o.o",
          "..............d",
          "............############",
          "..S.........############",
          "#" * 24, "#" * 24, "#" * 24, w=24),
    chunk(E, E, E, E, E, E,
          ".................p",
          E, E,
          "............ooo.........ooo",
          "####",
          "####...f..........x",
          "####========...=======...=====",
          "####" + "~" * 26,
          "####" + "~" * 26, w=30),
    chunk(E, E, E, E, E, E, E, E,
          "......o.o.o",
          E,
          E,
          ".S....xxx.......C",
          "#" * 28, "#" * 28, "#" * 28, w=28),
    chunk(E, E, E, E, E, E, E, E, E,
          "............o.o",
          E,
          "..S..........f.......<",
          "#" * 28, "#" * 28, "#" * 28, w=28),
    chunk(E, E, E, E, E, E, E, E,
          "......o.o.o",
          E, E,
          "..S.............b",
          "#" * 30, "#" * 30, "#" * 30, w=30),
    chunk(E, E, E, E, E, E,
          "...............p",
          E,
          "..........ooo",
          "...........................G",
          ".......................#######",
          "....d........d.....BBB########",
          "#######...####################",
          "#######~~~####################",
          "#######~~~####################", w=30),
]
L1_SIGNS = [
    "Arrows or A/D to run. Space, W or Z to jump: hold it to jump higher.",
    "Deckhands: stomp them, or slash with X (or J).",
    "Slash crates for doubloons. Parrots can't be beaten: dodge the dive, or slash to bat them away.",
    "Cannonballs are iron. Parry with C (or K) just as one arrives to send it home.",
    "Brutes block from the front. Jump over and strike from behind, or parry their swing to stun them.",
]

# ---------------------------------------------------------------- level 2
DECK = "B"
L2 = [
    chunk(E, E, E, E, E, E, E, E, E, E,
          "................" + DECK * 8,
          ".P......S....xx." + DECK * 8,
          "=" * 16 + DECK * 8,
          "~" * 16 + DECK * 8,
          "~" * 16 + DECK * 8, w=24),
    chunk(E, E,
          ".........oooo",
          ".........====",
          E,
          "......o.o.o.o",
          "......=========",
          E, E,
          ".....J....m....d........d...f",
          DECK * 30, DECK * 30, DECK * 30, DECK * 30, DECK * 30, w=30),
    chunk(E, E, E, E, E,
          "..p",
          E, E,
          ".ooo",
          "..............x.......<",
          "...." + DECK * 22,
          "...." + DECK * 22,
          "...." + DECK * 22,
          "~~~~" + DECK * 22,
          "~~~~" + DECK * 22, w=26),
    chunk(E, E, E, E, E, E,
          "......................o.o.o.o",
          "......................" + DECK * 8,
          "......................" + DECK * 8,
          "..C...........b......." + DECK * 8,
          DECK * 30, DECK * 30, DECK * 30, DECK * 30, DECK * 30, w=30),
    chunk(E, E, E, E,
          ".............p",
          E, E,
          DECK * 4,
          DECK * 4 + "........oooo",
          DECK * 4 + "........====...........<",
          DECK * 10 + "........" + DECK * 12,
          DECK * 10 + "........" + DECK * 12,
          DECK * 10 + "........" + DECK * 12,
          DECK * 10 + "~~~~~~~~" + DECK * 12,
          DECK * 10 + "~~~~~~~~" + DECK * 12, w=30),
    chunk(E, E, E,
          "........oooooo",
          "........======",
          E,
          ".....................d....G",
          ".................." + DECK * 12,
          "..............." + DECK * 15,
          ".....J.....b..." + DECK * 15,
          DECK * 30, DECK * 30, DECK * 30, DECK * 30, DECK * 30, w=30),
]
L2_SIGNS = [
    "Springy barrels launch you. Hold jump for the full height.",
]

# ---------------------------------------------------------------- level 3
WALL = "." * 22 + "##"
L3 = [
    chunk(ROCK, ROCK, "##....##.......###......#", E, E, E, E, E,
          "....t...............t",
          ".............ooo",
          E,
          ".P....S......^^^",
          "#" * 26, "#" * 26, "#" * 26, w=26),
    chunk(ROCK, ROCK, "###.......##.......###", E,
          "............p",
          E, E, E, E,
          "............BB",
          ".......BB...BB...BB",
          ".......BB...BB...BB......d",
          "####...BB...BB...BB...######",
          "####~~~BB~~~BB~~~BB~~~######",
          "####~~~BB~~~BB~~~BB~~~######", w=28),
    chunk(ROCK, ROCK, ROCK, ROCK, ROCK, ROCK, ROCK, ROCK,
          "......t.............t",
          ".........o.o.o",
          E,
          "..C...........b.........<",
          "#" * 28, "#" * 28, "#" * 28, w=28),
    chunk(ROCK, ROCK, "#.........###........#",
          ".........p.........p",
          E, E,
          "...........ooo",
          "...........===",
          "......ooo.......ooo",
          "......===.......===",
          E,
          "......^^^^^^^^^^^^^^^^...d",
          "#" * 28, "#" * 28, "#" * 28, w=28),
    chunk(ROCK, ROCK, "##......##....##", E, E, E, E, E,
          "...t...........t",
          E, E,
          ".>..........b.....xx..C..|",
          "#" * 26, "#" * 26, "#" * 26, w=26),
    chunk(ROCK, ROCK, *([WALL] * 6),
          "....k..........k......##",
          "..====.........====...##",
          "......................##",
          ".................X.G..##",
          "#" * 24, "#" * 24, "#" * 24, w=24),
]
L3_SIGNS = [
    "Skullrock Hold. Captain Grimtide guards the hoard. Mind the spikes.",
]


LEVELS = [
    dict(file="docks", id=1, name="Gullwing Docks", subtitle="Sun, sand and a lot of rope", theme="docks", goal="chest", par=95, signs=L1_SIGNS, rows=stitch(L1)),
    dict(file="ship", id=2, name="The Saltjaw", subtitle="All hands on deck", theme="ship", goal="flag", par=105, signs=L2_SIGNS, rows=stitch(L2)),
    dict(file="fortress", id=3, name="Skullrock Hold", subtitle="Where the treasure sleeps", theme="fortress", goal="chest", par=150, signs=L3_SIGNS, rows=stitch(L3)),
]

root = pathlib.Path(__file__).resolve().parent.parent / "src" / "game" / "levels"
for lv in LEVELS:
    w = len(lv["rows"][0])
    assert all(len(r) == w for r in lv["rows"]), lv["name"]
    rows = ",\n".join("    " + json.dumps(r) for r in lv["rows"])
    signs = ",\n".join("    " + json.dumps(s) for s in lv["signs"])
    src = f"""// Generated by tools/levels-src.py (edit the chunks there). {w} x {len(lv['rows'])} tiles.
import type {{ LevelDef }} from '../level.ts';

export const {lv['file']}: LevelDef = {{
  id: {lv['id']},
  name: {json.dumps(lv['name'])},
  subtitle: {json.dumps(lv['subtitle'])},
  theme: '{lv['theme']}',
  goal: '{lv['goal']}',
  par: {lv['par']},
  signs: [
{signs},
  ],
  rows: [
{rows},
  ],
}};
"""
    (root / f"{lv['file']}.ts").write_text(src, newline="\n")
    print(lv["name"], w, "x", len(lv["rows"]))
