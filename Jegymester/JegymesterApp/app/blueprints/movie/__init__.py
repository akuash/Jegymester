from apiflask import APIBlueprint

bp = APIBlueprint('movie',__name__,"movie")

from app.blueprints.movie import routes