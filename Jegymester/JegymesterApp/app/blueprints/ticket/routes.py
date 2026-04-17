from apiflask import HTTPError

from app.blueprints.ticket import bp
from app.blueprints.ticket.schemas import (
    TicketRequestSchema,
    TicketBuySchema,
    TicketCancelSchema,
    TicketResponseSchema,
    TicketDetailsSchema,
    ActionResponseSchema,
)
from app.blueprints.ticket.service import TicketService

@bp.route('/')
def index():
    return 'Ticket blueprint'

@bp.get("/")
@bp.output(TicketDetailsSchema(many=True), 200)
def get_tickets():
    success, response = TicketService.get_all()
    if success:
        return response
    raise HTTPError(status_code=400, message=response)


@bp.get("/<int:ticket_id>")
@bp.output(TicketDetailsSchema, 200)
def get_ticket(ticket_id: int):
    success, response = TicketService.get_by_id(ticket_id)
    if success:
        return response
    raise HTTPError(status_code=404, message=response)


@bp.get("/user/<int:user_id>")
@bp.output(TicketDetailsSchema(many=True), 200)
def get_user_tickets(user_id: int):
    success, response = TicketService.get_by_user(user_id)
    if success:
        return response
    raise HTTPError(status_code=404, message=response)


@bp.post("/")
@bp.input(TicketRequestSchema)
@bp.output(TicketResponseSchema, 201)
def create_ticket(json_data):
    success, response = TicketService.create(json_data)
    if success:
        return response, 201
    raise HTTPError(status_code=400, message=response)


@bp.post("/<int:ticket_id>/buy")
@bp.input(TicketBuySchema)
@bp.output(TicketResponseSchema, 200)
def buy_ticket(ticket_id: int, json_data):
    success, response = TicketService.buy(ticket_id, json_data)
    if success:
        return response
    raise HTTPError(status_code=400, message=response)


@bp.delete("/<int:ticket_id>/cancel")
@bp.input(TicketCancelSchema)
@bp.output(ActionResponseSchema, 200)
def cancel_ticket(ticket_id: int, json_data):
    success, response = TicketService.cancel(ticket_id, json_data)
    if success:
        return response
    raise HTTPError(status_code=400, message=response)


@bp.post("/<int:ticket_id>/release")
@bp.output(TicketResponseSchema, 200)
def release_ticket(ticket_id: int):
    success, response = TicketService.release(ticket_id)
    if success:
        return response
    raise HTTPError(status_code=400, message=response)
