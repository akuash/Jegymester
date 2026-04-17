from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models.ticket import Ticket
from app.models.user import User
from app.models.screening import Screening


class TicketService:
    @staticmethod
    def get_all():
        tickets = db.session.execute(
            select(Ticket)
            .options(joinedload(Ticket.screening), joinedload(Ticket.user))
            .order_by(Ticket.id)
        ).scalars().all()

        return True, tickets

    @staticmethod
    def get_by_id(ticket_id: int):
        ticket = db.session.execute(
            select(Ticket)
            .options(joinedload(Ticket.screening), joinedload(Ticket.user))
            .filter(Ticket.id == ticket_id)
        ).scalar_one_or_none()

        if ticket is None:
            return False, "Nincs ilyen jegy"

        return True, ticket

    @staticmethod
    def get_by_user(user_id: int):
        user = db.session.get(User, user_id)
        if user is None:
            return False, "Nincs ilyen felhasználó"

        tickets = db.session.execute(
            select(Ticket)
            .options(joinedload(Ticket.screening), joinedload(Ticket.user))
            .filter(Ticket.user_id == user_id)
            .order_by(Ticket.id)
        ).scalars().all()

        return True, tickets

    @staticmethod
    def create(data):
        try:
            screening = db.session.get(Screening, data["screening_id"])
            if screening is None:
                return False, "Nincs ilyen vetítés"

            user = None
            user_id = data.get("user_id")

            if user_id is not None:
                user = db.session.get(User, user_id)
                if user is None:
                    return False, "Nincs ilyen felhasználó"

            ticket = Ticket(
                cost=data["cost"],
                available=True,
                screening=screening,
                user=user,
            )

            db.session.add(ticket)
            db.session.commit()

            return True, ticket

        except Exception as ex:
            db.session.rollback()
            return False, f"Hiba a jegy létrehozásakor: {ex}"

    @staticmethod
    def buy(ticket_id: int, data):
        try:
            ticket = db.session.get(Ticket, ticket_id)
            if ticket is None:
                return False, "Nincs ilyen jegy"

            if not ticket.available:
                return False, "Ez a jegy már nem elérhető"

            user_id = data.get("user_id")

            if user_id is not None:
                user = db.session.get(User, user_id)
                if user is None:
                    return False, "Nincs ilyen felhasználó"
                ticket.user = user
            else:
                ticket.user = None

            ticket.available = False

            db.session.commit()

            return True, ticket

        except Exception as ex:
            db.session.rollback()
            return False, f"Hiba a jegyvásárláskor: {ex}"

    @staticmethod
    def cancel(ticket_id: int, data):
        try:
            ticket = db.session.get(Ticket, ticket_id)
            if ticket is None:
                return False, "Nincs ilyen jegy"

            user_id = data.get("user_id")

            if ticket.user_id is not None and user_id != ticket.user_id:
                return False, "Csak a jegy tulajdonosa törölheti a jegyet"

            db.session.delete(ticket)
            db.session.commit()

            return True, {"message": "Jegy törölve"}

        except Exception as ex:
            db.session.rollback()
            return False, f"Hiba a jegy törlésekor: {ex}"

    @staticmethod
    def release(ticket_id: int):
        try:
            ticket = db.session.get(Ticket, ticket_id)
            if ticket is None:
                return False, "Nincs ilyen jegy"

            ticket.user = None
            ticket.available = True

            db.session.commit()

            return True, ticket

        except Exception as ex:
            db.session.rollback()
            return False, f"Hiba a jegy visszaállításakor: {ex}"