from sqlalchemy import select, delete
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models.screening import Screening
from app.models.movie import Movie
from app.models.hall import Hall
from app.models.ticket import Ticket


class ScreeningService:
    @staticmethod
    def get_all():
        screenings = db.session.execute(
            select(Screening)
            .options(joinedload(Screening.movie), joinedload(Screening.hall))
            .order_by(Screening.id)
        ).scalars().all()

        return True, screenings

    @staticmethod
    def get_by_id(screening_id: int):
        screening = db.session.execute(
            select(Screening)
            .options(joinedload(Screening.movie), joinedload(Screening.hall))
            .filter(Screening.id == screening_id)
        ).scalar_one_or_none()

        if screening is None:
            return False, "Nincs ilyen vetítés"

        return True, screening

    @staticmethod
    def create(data):
        try:
            movie = db.session.get(Movie, data["movie_id"])
            if movie is None:
                return False, "Nincs ilyen film"

            hall = db.session.get(Hall, data["hall_id"])
            if hall is None:
                return False, "Nincs ilyen terem"

            screening = Screening(
                time=data["time"],
                movie=movie,
                hall=hall,
            )

            db.session.add(screening)
            db.session.commit()

            return True, screening

        except Exception as ex:
            db.session.rollback()
            return False, f"Hiba a vetítés létrehozásakor: {ex}"

    @staticmethod
    def update(screening_id: int, data):
        try:
            screening = db.session.get(Screening, screening_id)

            if screening is None:
                return False, "Nincs ilyen vetítés"

            if "time" in data:
                screening.time = data["time"]

            if "movie_id" in data:
                movie = db.session.get(Movie, data["movie_id"])
                if movie is None:
                    return False, "Nincs ilyen film"
                screening.movie = movie

            if "hall_id" in data:
                hall = db.session.get(Hall, data["hall_id"])
                if hall is None:
                    return False, "Nincs ilyen terem"
                screening.hall = hall

            db.session.commit()

            return True, screening

        except Exception as ex:
            db.session.rollback()
            return False, f"Hiba a vetítés módosításakor: {ex}"

    @staticmethod
    def delete(screening_id: int):
        try:
            screening = db.session.get(Screening, screening_id)

            if screening is None:
                return False, "Nincs ilyen vetítés"

            db.session.execute(
                delete(Ticket).where(Ticket.screening_id == screening_id)
            )

            db.session.delete(screening)
            db.session.commit()

            return True, {"message": "Vetítés és a hozzá tartozó jegyek törölve"}

        except Exception as ex:
            db.session.rollback()
            return False, f"Hiba a vetítés törlésekor: {ex}"