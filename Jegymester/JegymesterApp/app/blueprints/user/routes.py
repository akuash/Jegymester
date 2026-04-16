from app.blueprints.user.service import UserService
from app.blueprints.user.shemas import UserLoginRequestSchema, UserRequestSchema, UserResponseSchema
from app.blueprints.user import bp
from apiflask import HTTPError

@bp.route('/')
def index():
    return 'User blueprint'

@bp.post('/register')
@bp.input(UserRequestSchema, location="json")
@bp.output(UserResponseSchema)
def user_register(json_data):
    success, user = UserService.create_user(json_data)
    if success:
        return user, 201
    raise HTTPError(message=user,status_code=400)

@bp.post('/login')
@bp.input(UserLoginRequestSchema, location="json")
@bp.output(UserResponseSchema)
def user_login(json_data):
    success, user = UserService.login_user(json_data)
    if success:
        return user, 201
    raise HTTPError(message=user,status_code=400)