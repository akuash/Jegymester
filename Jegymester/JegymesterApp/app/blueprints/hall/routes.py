from apiflask import HTTPError

from app.extensions import auth
from app.blueprints import role_required

from app.blueprints.hall import bp
from app.blueprints.hall.schemas import (
    HallRequestSchema,
    HallUpdateSchema,
    HallResponseSchema,
    ActionResponseSchema,
)
from app.blueprints.hall.service import HallService

@bp.route('/')
def index():
    return 'Hall blueprint'

@bp.get("/")
@bp.output(HallResponseSchema(many=True), 200)
@bp.auth_required(auth)
@role_required(["felhasznalo","penztaros","adminisztrator"])
def get_halls():
    success, response = HallService.get_all()
    if success:
        return response
    raise HTTPError(status_code=400, message=response)


@bp.get("/<int:hall_id>")
@bp.output(HallResponseSchema, 200)
@bp.auth_required(auth)
@role_required(["felhasznalo","penztaros","adminisztrator"])
def get_hall(hall_id: int):
    success, response = HallService.get_by_id(hall_id)
    if success:
        return response
    raise HTTPError(status_code=404, message=response)


@bp.post("/")
@bp.input(HallRequestSchema)
@bp.output(HallResponseSchema, 201)
@bp.auth_required(auth)
@role_required(["adminisztrator"])
def create_hall(json_data):
    success, response = HallService.create(json_data)
    if success:
        return response, 201
    raise HTTPError(status_code=400, message=response)


@bp.put("/<int:hall_id>")
@bp.input(HallUpdateSchema)
@bp.output(HallResponseSchema, 200)
@bp.auth_required(auth)
@role_required(["adminisztrator"])
def update_hall(hall_id: int, json_data):
    success, response = HallService.update(hall_id, json_data)
    if success:
        return response
    raise HTTPError(status_code=400, message=response)


@bp.delete("/<int:hall_id>")
@bp.output(ActionResponseSchema, 200)
@bp.auth_required(auth)
@role_required(["adminisztrator"])
def delete_hall(hall_id: int):
    success, response = HallService.delete(hall_id)
    if success:
        return response
    raise HTTPError(status_code=400, message=response)