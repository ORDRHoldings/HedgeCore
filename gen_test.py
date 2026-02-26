import os
path = r"D:\Synexiun-SynexFund\HedgeCalc\FXDemorontend\src\__tests__\policy\policyEngine.test.ts"
print("can write to:", path)
with open(path, "w", encoding="utf-8") as f:
    f.write("// generated
")
print("done")