
import base64, os

TARGET = r"D:/Synexiun/1-SynexFund/HedgeCalc/FXDemo/frontend/public/product-guide.html"
PARTS_DIR = r"D:/Synexiun/1-SynexFund/HedgeCalc/FXDemo"

def rp(name):
    return open(os.path.join(PARTS_DIR, name), encoding="utf-8").read()

html = rp("p0.html") + rp("p1.html") + rp("p2.html") + rp("p3.html") + rp("p4.html") + rp("p5.html") + rp("p6.html") + rp("p7.html") + rp("p8.html") + rp("p9.html") + rp("pZ.html")

with open(TARGET, "w", encoding="utf-8") as f:
    f.write(html)

size = os.path.getsize(TARGET)
print(f"Written: {size:,} bytes ({size//1024} KB)")
