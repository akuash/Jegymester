from marshmallow import Schema, fields

from apiflask.validators import Email, Length


class RoleSchema(Schema):
    name = fields.String()


class UserRegisterRequestSchema(Schema):
    name = fields.String(required=True, validate=Length(min=2, max=30))
    email = fields.String(required=True, validate=Email())
    password = fields.String(required=True, validate=Length(min=4, max=255))
    phone = fields.String(required=True, validate=Length(min=3, max=30))


class UserResponseSchema(Schema):
    id = fields.Integer()
    name = fields.String()
    email = fields.String(validate=Email())
    phone = fields.String()
    role = fields.Nested(RoleSchema)


class UserLoginRequestSchema(Schema):
    email = fields.String(required=True, validate=Email())
    password = fields.String(required=True, validate=Length(min=1, max=255))


class UserLoginResponseSchema(Schema):
    access_token = fields.String()
    token_type = fields.String()
    expires_in = fields.Integer()
    user = fields.Nested(UserResponseSchema)