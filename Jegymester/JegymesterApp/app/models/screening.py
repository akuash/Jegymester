from app.extensions import db
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import String, Integer
from sqlalchemy import ForeignKey
from typing import List

class Screening(db.Model):
    __tablename__ = "screenings"

    id: Mapped[int] = mapped_column(primary_key=True)
    time: Mapped[int] = mapped_column(Integer, nullable=False)
    place: Mapped[str] = mapped_column(String(30), nullable=False)

    movie_id: Mapped[int] = mapped_column(ForeignKey("movies.id"), nullable=False)

    movie: Mapped["Movie"] = relationship(back_populates="screenings", lazy=True)
    tickets: Mapped[List["Ticket"]] = relationship(back_populates="screening", lazy=True)

    def __repr__(self) -> str:
        return f"Screening(id={self.id!r}, place={self.place!r}, time={self.time!r})"
    