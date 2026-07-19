from app.db.database import get_db
from app.db.models import AppSettings

db = next(get_db())
for s in db.query(AppSettings).filter(AppSettings.key.like('polar%')).all():
    print(s.key, s.value)
