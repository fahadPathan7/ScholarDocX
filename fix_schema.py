import re

with open("backend/app/db/schema.py", "r") as f:
    schema = f.read()

# Just replace `)` followed by a newline with `);` followed by a newline, BUT only for CREATE TABLE bodies.
# It's easier: just replace all `\n)\n` with `\n);\n`
schema = schema.replace("\n)\n", "\n);\n")

with open("backend/app/db/schema.py", "w") as f:
    f.write(schema)
print("Fixed schema syntax")
