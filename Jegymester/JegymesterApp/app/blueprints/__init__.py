from apiflask import APIBlueprint

bp = APIBlueprint('main', __name__)

@bp.route('/')
def index():
    return 'This is The Main Blueprint'


from app.models import *
