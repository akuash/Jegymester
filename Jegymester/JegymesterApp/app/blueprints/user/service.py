from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models.role import Role
from app.models.user import User
from app.security import generate_access_token


class UserService:
    @staticmethod
    def create_user(request):
        try:
            existing_user = db.session.execute(
                select(User).filter(User.email == request["email"])
            ).scalar_one_or_none()
            if existing_user is not None:
                return False, "Már létezik felhasználó ezzel az e-mail címmel"

            role = db.session.execute(
                select(Role).filter(Role.name == "felhasznalo")
            ).scalar_one_or_none()
            if role is None:
                role = Role(name="felhasznalo")
                db.session.add(role)
                db.session.flush()

            user = User(
                name=request["name"],
                email=request["email"],
                password="",
                phone=request["phone"],
                role=role,
            )
            user.set_password(request["password"])

            db.session.add(user)
            db.session.commit()
            db.session.refresh(user)

            return True, user
        except Exception as ex:
            db.session.rollback()
            return False, str(ex)

    @staticmethod
    def login_user(request):
        try:
            user = db.session.execute(
                select(User)
                .options(joinedload(User.role))
                .filter(User.email == request["email"])
            ).scalar_one_or_none()

            if user is None:
                return False, "Hibás e-mail vagy jelszó"

            if not user.check_password(request["password"]):
                return False, "Hibás e-mail vagy jelszó"

            access_token, expires_in = generate_access_token(user)
            return True, {
                "access_token": access_token,
                "token_type": "Bearer",
                "expires_in": expires_in,
                "user": user,
            }
        except Exception as ex:
            return False, str(ex)

    @staticmethod
    def get_all_users():
        users = db.session.execute(
            select(User)
            .options(joinedload(User.role))
            .order_by(User.id)
        ).scalars().all()
        return True, users
