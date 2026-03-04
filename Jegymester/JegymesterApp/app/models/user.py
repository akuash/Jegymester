from app.extensions import db
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import String
from sqlalchemy import ForeignKey
from typing import List, Optional
from werkzeug.security import generate_password_hash, check_password_hash


class User(db.Model):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(30), nullable=False)

    email: Mapped[Optional[str]] = mapped_column(String(120), unique=True, nullable=True)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)

    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), nullable=False)
    role: Mapped["Role"] = relationship(back_populates="users", lazy="select")

    tickets: Mapped[List["Ticket"]] = relationship(back_populates="user", lazy="select")

    def __repr__(self) -> str:
        role_name = self.role.name if self.role else None
        return f"User(id={self.id!r}, name={self.name!s}, email={self.email!r}, role={role_name!r})"

    def set_password(self, password: str) -> None:
        self.password = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password, password)

    def is_admin(self) -> bool:
        return self.role is not None and self.role.name == "adminisztrator"

    def is_cashier(self) -> bool:
        return self.role is not None and self.role.name == "penztaros"

    def is_user(self) -> bool:
        return self.role is not None and self.role.name == "felhasznalo"