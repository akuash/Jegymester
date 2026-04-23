from sqlalchemy import select

from app.extensions import db
from app.models.movie import Movie


class MovieService:
    @staticmethod
    def get_all():
        movies = db.session.execute(select(Movie).order_by(Movie.id)).scalars().all()
        return True, movies

    @staticmethod
    def get_by_id(movie_id: int):
        movie = db.session.get(Movie, movie_id)
        if movie is None:
            return False, "Nincs ilyen film"
        return True, movie

    @staticmethod
    def create(data):
        try:
            movie = Movie(
                name=data["name"],
                description=data.get("description")
            )
            db.session.add(movie)
            db.session.commit()
            return True, movie
        except Exception as ex:
            db.session.rollback()
            return False, f"Hiba a film létrehozásakor: {ex}"

    @staticmethod
    def update(movie_id: int, data):
        try:
            movie = db.session.get(Movie, movie_id)
            if movie is None:
                return False, "Nincs ilyen film"

            if "name" in data:
                movie.name = data["name"]
            if "description" in data:
                movie.description = data["description"]

            db.session.commit()
            return True, movie
        except Exception as ex:
            db.session.rollback()
            return False, f"Hiba a film módosításakor: {ex}"

    @staticmethod
    def delete(movie_id: int):
        try:
            movie = db.session.get(Movie, movie_id)
            if movie is None:
                return False, "Nincs ilyen film"

            if movie.screenings:
                return False, "A film nem törölhető, mert tartozik hozzá vetítés"

            db.session.delete(movie)
            db.session.commit()
            return True, {"message": "Film törölve"}
        except Exception as ex:
            db.session.rollback()
            return False, f"Hiba a film törlésekor: {ex}"
