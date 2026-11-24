"""Writes artifact.html (index.html without its document skeleton) and prints the file list to publish with it."""
import json, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
head = '<title>Oliver Below the Valley</title>\n<link rel="stylesheet" href="css/style.css">\n<style>:root{color-scheme:dark}</style>\n'
body = re.search(r"<body>(.*)</body>", s, re.S).group(1)
open(os.path.join(ROOT, "artifact.html"), "w", encoding="utf-8").write(head + body.strip() + "\n")
files = ["css/style.css", "CREDITS.md"]
for d, _, fs in os.walk(os.path.join(ROOT, "assets")):
    for f in fs:
        if f.endswith((".webp", ".mp3")):
            files.append(os.path.relpath(os.path.join(d, f), ROOT).replace("\\", "/"))
files += ["js/%s.js" % n for n in ("atlas", "data", "dungeon", "engine", "audio", "render", "ui", "main")]
print(len(files))
print(json.dumps({f: f for f in sorted(files)}, separators=(",", ":")))
