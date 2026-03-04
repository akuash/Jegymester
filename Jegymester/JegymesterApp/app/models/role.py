from app.extensions import db
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import String, Integer
from typing import List


class Role(db.Model):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)

    users: Mapped[List["User"]] = relationship(back_populates="role", lazy="select")

    def __repr__(self) -> str:
        return f"Role(id={self.id!r}, name={self.name!r})"