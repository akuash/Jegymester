from app.extensions import db
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import String, Integer, Text
from typing import List, Optional
from marshmallow import Schema, fields
class Movie(db.Model):
    __tablename__ = "movies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 1 Movie -> many Screening
    screenings: Mapped[List["Screening"]] = relationship(
        back_populates="movie",
        cascade="all, delete-orphan",
        lazy=True
    )

    def __repr__(self) -> str:
        return f"Movie(id={self.id!r}, name={self.name!r})"