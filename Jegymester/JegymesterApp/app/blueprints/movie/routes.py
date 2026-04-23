from apiflask import HTTPError

from app.blueprints.movie import bp
from app.blueprints.movie.schemas import MovieRequestSchema, MovieUpdateSchema, MovieResponseSchema
from app.blueprints.movie.service import MovieService

@bp.route('/')
def index():
    return 'movie blueprint'

@bp.get("/")
@bp.output(MovieResponseSchema(many=True), 200)
def get_movies():
    success, response = MovieService.get_all()
    if success:
        return response
    raise HTTPError(status_code=400, message=response)


@bp.get("/<int:movie_id>")
@bp.output(MovieResponseSchema, 200)
def get_movie(movie_id: int):
    success, response = MovieService.get_by_id(movie_id)
    if success:
        return response
    raise HTTPError(status_code=404, message=response)


@bp.post("/")
@bp.input(MovieRequestSchema)
@bp.output(MovieResponseSchema, 201)
def create_movie(json_data):
    success, response = MovieService.create(json_data)
    if success:
        return response, 201
    raise HTTPError(status_code=400, message=response)


@bp.put("/<int:movie_id>")
@bp.input(MovieUpdateSchema)
@bp.output(MovieResponseSchema, 200)
def update_movie(movie_id: int, json_data):
    success, response = MovieService.update(movie_id, json_data)
    if success:
        return response
    raise HTTPError(status_code=400, message=response)


@bp.delete("/<int:movie_id>")
def delete_movie(movie_id: int):
    success, response = MovieService.delete(movie_id)
    if success:
        return response, 200
    raise HTTPError(status_code=400, message=response)
