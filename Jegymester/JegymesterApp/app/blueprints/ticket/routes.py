from apiflask import HTTPError

from app.blueprints.ticket import bp
from app.blueprints.ticket.schemas import (
    TicketRequestSchema,
    TicketBuySchema,
    TicketResponseSchema,
    TicketDetailsSchema,
    ActionResponseSchema,
)
from app.blueprints.ticket.service import TicketService
from app.security import token_auth


@bp.get("/")
@bp.auth_required(token_auth, roles=['adminisztrator', 'penztaros'])
@bp.output(TicketDetailsSchema(many=True), 200)
def get_tickets():
    success, response = TicketService.get_all()
    if success:
        return response
    raise HTTPError(status_code=400, message=response)


@bp.get("/<int:ticket_id>")
@bp.auth_required(token_auth, roles=['adminisztrator', 'penztaros'])
@bp.output(TicketDetailsSchema, 200)
def get_ticket(ticket_id: int):
    success, response = TicketService.get_by_id(ticket_id)
    if success:
        return response
    raise HTTPError(status_code=404, message=response)


@bp.get("/user/<int:user_id>")
@bp.auth_required(token_auth)
@bp.output(TicketDetailsSchema(many=True), 200)
def get_user_tickets(user_id: int):
    current_user = token_auth.current_user
    if current_user.is_user() and current_user.id != user_id:
        raise HTTPError(status_code=403, message='Csak a saját jegyeidet nézheted meg')

    success, response = TicketService.get_by_user(user_id)
    if success:
        return response
    raise HTTPError(status_code=404, message=response)


@bp.post("/")
@bp.auth_required(token_auth, roles=['adminisztrator', 'penztaros'])
@bp.input(TicketRequestSchema)
@bp.output(TicketResponseSchema, 201)
def create_ticket(json_data):
    success, response = TicketService.create(json_data)
    if success:
        return response, 201
    raise HTTPError(status_code=400, message=response)


@bp.post("/<int:ticket_id>/buy")
@bp.auth_required(token_auth)
@bp.input(TicketBuySchema)
@bp.output(TicketResponseSchema, 200)
def buy_ticket(ticket_id: int, json_data):
    current_user = token_auth.current_user

    if current_user.is_user():
        target_user_id = current_user.id
    else:
        target_user_id = json_data.get('user_id', current_user.id)

    success, response = TicketService.buy(ticket_id, target_user_id)
    if success:
        return response
    raise HTTPError(status_code=400, message=response)


@bp.delete("/<int:ticket_id>/cancel")
@bp.auth_required(token_auth)
@bp.output(ActionResponseSchema, 200)
def cancel_ticket(ticket_id: int):
    current_user = token_auth.current_user
    success, response = TicketService.cancel(ticket_id, current_user)
    if success:
        return response
    raise HTTPError(status_code=400, message=response)


@bp.post("/<int:ticket_id>/release")
@bp.auth_required(token_auth, roles=['adminisztrator', 'penztaros'])
@bp.output(TicketResponseSchema, 200)
def release_ticket(ticket_id: int):
    success, response = TicketService.release(ticket_id)
    if success:
        return response
    raise HTTPError(status_code=400, message=response)

