from __future__ import annotations

from sqlalchemy import String, Integer, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db


class Hall(db.Model):
    __tablename__ = "hall"
    __table_args__ = (
        CheckConstraint("capacity > 0", name="ck_hall_capacity_pos"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)

    screenings: Mapped[list["Screening"]] = relationship(
        back_populates="hall"
    )

    def __repr__(self) -> str:
        return f"<Hall {self.name} cap={self.capacity}>"


from app.models.screening import Screening