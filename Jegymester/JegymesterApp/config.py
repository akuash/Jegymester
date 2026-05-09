import os

basedir = os.path.abspath(os.path.dirname(__file__))


def load_private_key():
    """Betölti a régi .ssh/private-key.pem fájlt, ha létezik.

    Ha a fájl nincs meg, akkor sem áll le a backend: fejlesztéshez kap egy
    stabil SECRET_KEY értéket. Éles környezetben érdemes környezeti változóból
    megadni a SECRET_KEY-t.
    """
    key_path = os.path.join(basedir, ".ssh", "private-key.pem")
    if os.path.exists(key_path):
        with open(key_path, "r", encoding="utf-8") as f:
            return f.read()
    return "jegymester-dev-secret-key-2026"


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY") or load_private_key()
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URI') \
        or 'sqlite:///' + os.path.join(basedir, 'app.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_ALGORITHM = 'HS256'
    JWT_ACCESS_TOKEN_EXPIRES = 60 * 60 * 24
