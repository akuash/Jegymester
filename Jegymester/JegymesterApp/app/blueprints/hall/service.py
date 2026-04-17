from sqlalchemy import select, delete

from app.extensions import db
from app.models.hall import Hall
from app.models.screening import Screening
from app.models.ticket import Ticket


class HallService:
    @staticmethod
    def get_all():
        halls = db.session.execute(
            select(Hall).order_by(Hall.id)
        ).scalars().all()

        return True, halls

    @staticmethod
    def get_by_id(hall_id: int):
        hall = db.session.get(Hall, hall_id)

        if hall is None:
            return False, "Nincs ilyen terem"

        return True, hall

    @staticmethod
    def create(data):
        try:
            existing = db.session.execute(
                select(Hall).filter(Hall.name == data["name"])
            ).scalar_one_or_none()

            if existing is not None:
                return False, "Már létezik ilyen nevű terem"

            hall = Hall(
                name=data["name"],
                capacity=data["capacity"]
            )

            db.session.add(hall)
            db.session.commit()

            return True, hall

        except Exception as ex:
            db.session.rollback()
            return False, f"Hiba a terem létrehozásakor: {ex}"

    @staticmethod
    def update(hall_id: int, data):
        try:
            hall = db.session.get(Hall, hall_id)

            if hall is None:
                return False, "Nincs ilyen terem"

            if "name" in data:
                existing = db.session.execute(
                    select(Hall).filter(Hall.name == data["name"], Hall.id != hall_id)
                ).scalar_one_or_none()

                if existing is not None:
                    return False, "Már létezik ilyen nevű terem"

                hall.name = data["name"]

            if "capacity" in data:
                hall.capacity = data["capacity"]

            db.session.commit()

            return True, hall

        except Exception as ex:
            db.session.rollback()
            return False, f"Hiba a terem módosításakor: {ex}"

    @staticmethod
    def delete(hall_id: int):
        try:
            hall = db.session.get(Hall, hall_id)

            if hall is None:
                return False, "Nincs ilyen terem"

            screenings = db.session.execute(
                select(Screening.id).filter(Screening.hall_id == hall_id)
            ).scalars().all()

            if screenings:
                db.session.execute(
                    delete(Ticket).where(Ticket.screening_id.in_(screenings))
                )
                db.session.execute(
                    delete(Screening).where(Screening.hall_id == hall_id)
                )

            db.session.delete(hall)
            db.session.commit()

            return True, {"message": "Terem és a hozzá tartozó vetítések/jegyek törölve"}

        except Exception as ex:
            db.session.rollback()
            return False, f"Hiba a terem törlésekor: {ex}"