import string
from marshmallow import Schema, fields

from apiflask.validators import Email

class RoleSchema(Schema):
    name = fields.String()

class UserRequestSchema(Schema):
    name = fields.String()
    email  = fields.String(validate=Email())
    password = fields.String()
    phone = fields.String()
    role = fields.Nested(RoleSchema)

class UserResponseSchema(Schema):
    id = fields.Integer()
    name = fields.String()
    email  = fields.String(validate=Email())
    phone = fields.String()
    role = fields.Nested(RoleSchema)

class UserLoginRequestSchema(Schema):
    email = fields.String(validate=Email())
    password = fields.String()