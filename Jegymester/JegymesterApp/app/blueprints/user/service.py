from sqlalchemy import select
from app.extensions import db
from app.blueprints.user.shemas import UserRequestSchema, UserLoginRequestSchema, UserResponseSchema
from app.models.user import User
from app.models.role import Role

class UserService:
    @staticmethod
    def create_user(request: UserRequestSchema):
        try:
            if db.session.execute(
                        db.select(User).filter_by(email=request["email"])
                    ).scalar_one_or_none():
                return False, "User with this email already exists"
            
            role_info = request.get("role") if isinstance(request, dict) else None
            role_obj = None
            if role_info:
                role_name = role_info.get("name") if isinstance(role_info, dict) else getattr(role_info, "name", None)
                role_obj = db.session.execute(select(Role).filter_by(name=role_name)).scalar_one_or_none()
                if role_obj is None:
                    role_obj = Role(**role_info) if isinstance(role_info, dict) else Role(name=role_name)
                    db.session.add(role_obj)
                    db.session.flush()

            user_data = dict(request) if isinstance(request, dict) else request
            user_data.pop("role", None)

            user = User(**user_data)
            user.set_password(user.password)
            if role_obj:
                user.role = role_obj
            db.session.add(user)
            db.session.commit()
            return True, UserResponseSchema().dump(user)
        except Exception as ex:
            db.session.rollback()
            return False, str(ex)
   
    @staticmethod
    def login_user(request: UserLoginRequestSchema):
        try:
            user = db.session.execute(
                        db.select(User).filter_by(email=request["email"])
                    ).scalar_one_or_none()
            if not user:
                return False, "Incorrect E-mail"
            if not user.check_password(request["password"]):
                return False, "Incorrect password"
            return True, UserResponseSchema().dump(user)
        except Exception as ex:
            return False, str(ex)