TARGET = r"D:/Synexiun/1-SynexFund/HedgeCalc/FXDemo/frontend/public/product-guide.html"

HEAD = open(r'D:/Synexiun/1-SynexFund/HedgeCalc/FXDemo/part_head.html', encoding='utf-8').read()
NAV = open(r'D:/Synexiun/1-SynexFund/HedgeCalc/FXDemo/part_nav.html', encoding='utf-8').read()
HERO = open(r'D:/Synexiun/1-SynexFund/HedgeCalc/FXDemo/part_hero.html', encoding='utf-8').read()
OVERVIEW = open(r'D:/Synexiun/1-SynexFund/HedgeCalc/FXDemo/part_overview.html', encoding='utf-8').read()
MODULES = open(r'D:/Synexiun/1-SynexFund/HedgeCalc/FXDemo/part_modules.html', encoding='utf-8').read()
WORKFLOW = open(r'D:/Synexiun/1-SynexFund/HedgeCalc/FXDemo/part_workflow.html', encoding='utf-8').read()
RESULTS = open(r'D:/Synexiun/1-SynexFund/HedgeCalc/FXDemo/part_results.html', encoding='utf-8').read()
AUDIT = open(r'D:/Synexiun/1-SynexFund/HedgeCalc/FXDemo/part_audit.html', encoding='utf-8').read()
PIPELINE = open(r'D:/Synexiun/1-SynexFund/HedgeCalc/FXDemo/part_pipeline.html', encoding='utf-8').read()
DATAREF = open(r'D:/Synexiun/1-SynexFund/HedgeCalc/FXDemo/part_dataref.html', encoding='utf-8').read()
FOOTER = open(r'D:/Synexiun/1-SynexFund/HedgeCalc/FXDemo/part_footer.html', encoding='utf-8').read()
html = HEAD + NAV + HERO + OVERVIEW + MODULES + WORKFLOW + RESULTS + AUDIT + PIPELINE + DATAREF + FOOTER
with open(TARGET, 'w', encoding='utf-8') as f:
    f.write(html)
import os
size = os.path.getsize(TARGET)
print(f'Written: {size:,} bytes ({size//1024} KB)')
