from apiflask import HTTPError

from app.blueprints.user import bp
from app.blueprints.user.service import UserService
from app.blueprints.user.shemas import (
    UserLoginRequestSchema,
    UserLoginResponseSchema,
    UserRegisterRequestSchema,
    UserResponseSchema,
)
from app.security import token_auth


@bp.post('/register')
@bp.post('/registrate')
@bp.input(UserRegisterRequestSchema, location='json')
@bp.output(UserResponseSchema, 201)
def user_register(json_data):
    success, user = UserService.create_user(json_data)
    if success:
        return user, 201
    raise HTTPError(message=user, status_code=400)


@bp.post('/login')
@bp.input(UserLoginRequestSchema, location='json')
@bp.output(UserLoginResponseSchema, 200)
def user_login(json_data):
    success, response = UserService.login_user(json_data)
    if success:
        return response
    raise HTTPError(message=response, status_code=401)


@bp.get('/me')
@bp.auth_required(token_auth)
@bp.output(UserResponseSchema, 200)
def get_current_user():
    return token_auth.current_user


@bp.get('/')
@bp.auth_required(token_auth, roles=['adminisztrator'])
@bp.output(UserResponseSchema(many=True), 200)
def get_users():
    success, response = UserService.get_all_users()
    if success:
        return response
    raise HTTPError(status_code=400, message=response)

