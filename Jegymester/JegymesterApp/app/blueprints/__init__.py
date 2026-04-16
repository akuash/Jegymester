from apiflask import APIBlueprint

bp = APIBlueprint('main', __name__)

@bp.route('/')
def index():
    return 'This is The Main Blueprint'

from app.blueprints.user import bp as user_bp
bp.register_blueprint(user_bp, url_prefix='/user')

from app.models import *
