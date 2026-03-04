from typing import Optional
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import String, Integer, Text
from marshmallow import Schema, fields


class Ticket(db.Model):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    cost: Mapped[int] = mapped_column(String(30),nullable=False)
    available: Mapped[bool] = mapped_column(Booelean,nullable=False)

    screening_id: Mapped[int] = mapped_column(ForeignKey("screenings.id"), nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)

    screening: Mapped["Screening"] = relationship(back_populates="tickets")
    user: Mapped[Optional["User"]] = relationship(back_populates="tickets")

    def __repr__(self) -> str:
        return f"<Ticket id={self.id} cost={self.cost} available={self.available}>"