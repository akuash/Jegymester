from app.extensions import db, Base
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import String, Integer
from sqlalchemy import ForeignKey, Column, Table

class Screening(db.Model):
    __tablename__ = "screenings"
    id: Mapped[int] = mapped_column(primary_key=True)
    time: Mapped[int] = mapped_column(Integer)
    placel: Mapped[str] = mapped_column(String(30))
    
    movie: Mapped["Movie"] = relationship(back_populates="screening", lazy=True)
        
    def __repr__(self) -> str:
        return f"Screening(id={self.id!r}, place={self.place!r})"
    