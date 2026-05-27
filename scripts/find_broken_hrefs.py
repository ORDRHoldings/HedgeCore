import os, re

app_dir = "frontend/src/app"
routes = set()
for d in os.listdir(app_dir):
    p = os.path.join(app_dir, d)
    if os.path.isdir(p) and not d.startswith("_") and d != "api":
        routes.add("/" + d)

src = "frontend/src"
broken = {}
href_re = re.compile(r'''href=["\']([\w/\-]+)["\']''')
for root, _, files in os.walk(src):
    for f in files:
        if not f.endswith((".tsx", ".ts")):
            continue
        fp = os.path.join(root, f)
        try:
            with open(fp, "r", encoding="utf-8") as fh:
                content = fh.read()
        except Exception:
            continue
        for m in href_re.finditer(content):
            href = m.group(1)
            if not href.startswith("/"):
                continue
            if href.startswith("//"):
                continue
            top = "/" + href.lstrip("/").split("/")[0]
            if top in ("/api", "/"):
                continue
            if top not in routes:
                broken.setdefault(href, []).append(fp)

for href, files in sorted(broken.items()):
    print(href, "->", list(set(files))[:5])
