from app.extensions import db, Base
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import String, Integer
from sqlalchemy import ForeignKey, Column, Table
from typing import List, Optional
from werkzeug.security import generate_password_hash, check_password_hash
from marshmallow import Schema, fields

class User(db.Model):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(30))
    email: Mapped[Optional[str]]
    password: Mapped[str] = mapped_column(String(30))
    phone : Mapped[str] = mapped_column(String(30))
    
    role: Mapped[str] = mapped_column(String(30))

    tickets: Mapped[List["Ticket"]] = relationship(back_populates="user", lazy=True)
        
    def __repr__(self) -> str:
        return f"User(id={self.id!r}, name={self.name!s}, email={self.email!r})"
    
    def set_password(self, password):
        self.password = generate_password_hash(password)
        
    def check_password(self, password):
        return check_password_hash(self.password, password)