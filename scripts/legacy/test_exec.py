from sqlalchemy import create_engine
engine = create_engine("sqlite:///:memory:")
with engine.connect() as conn:
    conn.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)")
    res = conn.exec_driver_sql("INSERT INTO users (name) VALUES (?)", ("test",))
    print("LAST ROW ID:", res.lastrowid)
