from apiflask import APIBlueprint

bp = APIBlueprint('main', __name__)


@bp.get('/')
def index():
    return {'message': 'Jegymester API működik'}


from app.blueprints.user import bp as user_bp  # noqa: E402
bp.register_blueprint(user_bp, url_prefix='/user')

from app.blueprints.movie import bp as movie_bp  # noqa: E402
bp.register_blueprint(movie_bp, url_prefix='/movie')

from app.blueprints.screening import bp as screening_bp  # noqa: E402
bp.register_blueprint(screening_bp, url_prefix='/screening')

from app.blueprints.hall import bp as hall_bp  # noqa: E402
bp.register_blueprint(hall_bp, url_prefix='/hall')

from app.blueprints.ticket import bp as ticket_bp  # noqa: E402
bp.register_blueprint(ticket_bp, url_prefix='/ticket')

from app.models import *  # noqa: F401,F403,E402
