from apiflask import APIBlueprint

bp = APIBlueprint('hall',__name__,"hall")

from app.blueprints.hall import routes