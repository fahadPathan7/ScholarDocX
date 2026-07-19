from app.db.session import SessionLocal
from app.db.models import AppSettings

db = SessionLocal()
for s in db.query(AppSettings).filter(AppSettings.key.like('polar%')).all():
    print(s.key, s.value)
