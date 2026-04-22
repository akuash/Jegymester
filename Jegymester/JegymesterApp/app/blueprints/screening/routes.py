from apiflask import HTTPError

from app.blueprints.screening import bp
from app.blueprints.screening.schemas import (
    ScreeningRequestSchema,
    ScreeningUpdateSchema,
    ScreeningResponseSchema,
    ScreeningDetailsSchema,
    ActionResponseSchema,
)
from app.blueprints.screening.service import ScreeningService


@bp.route("/")
def index():
    return "Screening blueprint"


@bp.get("/")
@bp.output(ScreeningDetailsSchema(many=True), 200)
def get_screenings():
    success, response = ScreeningService.get_all()
    if success:
        return response
    raise HTTPError(status_code=400, message=response)


@bp.get("/<int:screening_id>")
@bp.output(ScreeningDetailsSchema, 200)
def get_screening(screening_id: int):
    success, response = ScreeningService.get_by_id(screening_id)
    if success:
        return response
    raise HTTPError(status_code=404, message=response)


@bp.post("/")
@bp.input(ScreeningRequestSchema)
@bp.output(ScreeningResponseSchema, 201)
def create_screening(json_data):
    success, response = ScreeningService.create(json_data)
    if success:
        return response, 201
    raise HTTPError(status_code=400, message=response)


@bp.put("/<int:screening_id>")
@bp.input(ScreeningUpdateSchema)
@bp.output(ScreeningResponseSchema, 200)
def update_screening(screening_id: int, json_data):
    success, response = ScreeningService.update(screening_id, json_data)
    if success:
        return response
    raise HTTPError(status_code=400, message=response)


@bp.delete("/<int:screening_id>")
@bp.output(ActionResponseSchema, 200)
def delete_screening(screening_id: int):
    success, response = ScreeningService.delete(screening_id)
    if success:
        return response
    raise HTTPError(status_code=400, message=response)