from tkinter import CURRENT
from apiflask import APIBlueprint, HTTPError

bp = APIBlueprint('main', __name__)

@bp.route('/')
def index():
    return 'This is The Main Blueprint'

from app.extensions import auth
from flask import current_app
from authlib.jose import jwt
from datetime import datetime, timedelta
from functools import wraps

@auth.verify_token
def verify_token(token):
    try:
        data = jwt.decode(
            token.encode('ascii'),
            current_app.config['SECRET_KEY']
            )
        if data["exp"] < int(datetime.now().timestamp()):
            return None
        return data
    except:
        return None

def role_required(allowed_roles):
    def wrapper(fn):
        @wraps(fn)
        def decorated_func(*args, **kwargs):
            user_role = auth.current_user.get("role")
            if user_role not in allowed_roles:
                return HTTPError(status_code=403, message="Access denied!")
            return fn(*args, **kwargs)
        return decorated_func
    return wrapper


from app.blueprints.user import bp as user_bp
bp.register_blueprint(user_bp, url_prefix='/user')

from app.blueprints.movie import bp as movie_bp
bp.register_blueprint(movie_bp, url_prefix='/movie')

from app.blueprints.screening import bp as screening_bp
bp.register_blueprint(screening_bp, url_prefix='/screening')

from app.blueprints.hall import bp as hall_bp
bp.register_blueprint(hall_bp, url_prefix='/hall')

from app.blueprints.ticket import bp as ticket_bp
bp.register_blueprint(ticket_bp, url_prefix='/ticket')

from app.models import *
