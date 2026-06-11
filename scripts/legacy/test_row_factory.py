from sqlalchemy import create_engine
import sqlite3
engine = create_engine("sqlite:///:memory:")
conn = engine.raw_connection()
dbapi_conn = conn.connection
dbapi_conn.row_factory = sqlite3.Row
dbapi_conn.execute("CREATE TABLE users (id INT, name TEXT)")
dbapi_conn.execute("INSERT INTO users VALUES (?, ?)", (1, "test"))
res = dbapi_conn.execute("SELECT * FROM users").fetchone()
print(type(res))
try:
    print("NAME:", res["name"])
except Exception as e:
    print("ERROR:", e)
