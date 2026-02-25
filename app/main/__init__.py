from apiflask import APIBlueprint

bp = APIBlueprint('main', __name__,tag='main')

from app.main import routes
from app.models import *
