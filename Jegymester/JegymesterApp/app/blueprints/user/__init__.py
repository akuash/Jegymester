from apiflask import APIBlueprint

bp = APIBlueprint('user', __name__)

from app.blueprints.user import routes