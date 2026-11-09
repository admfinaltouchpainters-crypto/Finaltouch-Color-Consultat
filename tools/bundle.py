#!/usr/bin/env python3
"""Bundle the app into one self-contained HTML body (dist/color-consultant.html).
Used to publish the tool as a single page; the normal site uses index.html."""
import base64, re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text()
logo = "data:image/svg+xml;base64," + base64.b64encode((root / "assets/logo.svg").read_bytes()).decode()

title = re.search(r"<title>.*?</title>", html).group(0)
fonts = re.search(r'<link rel="stylesheet" href="https://fonts[^>]+>', html).group(0)
css = "\n".join((root / p).read_text() for p in ["css/app.css", "css/report.css"])
body = html[html.index("<body>") + 6: html.index("<script src=")]
scripts = re.findall(r'<script src="([^"]+)"></script>', html)
js = "\n".join("<script>\n" + (root / s).read_text().replace("</script", "<\\/script") + "\n</script>" for s in scripts)

out = "\n".join([
    title,
    '<meta name="claude:viewport-fit-sides" content="cover">',
    fonts,
    "<style>\n" + css + "\n</style>",
    body,
    js,
]).replace("assets/logo.svg", logo)
dist = root / "dist"
dist.mkdir(exist_ok=True)
(dist / "color-consultant.html").write_text(out)
print("dist/color-consultant.html", len(out) // 1024, "KB")
