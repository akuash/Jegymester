from marshmallow import Schema, fields

from apiflask.validators import Email, Length
from marshmallow.validate import OneOf


VALID_ROLES = ["felhasznalo", "penztaros", "adminisztrator"]


class RoleSchema(Schema):
    id = fields.Integer()
    name = fields.String()


class UserRegisterRequestSchema(Schema):
    name = fields.String(required=True, validate=Length(min=2, max=30))
    email = fields.String(required=True, validate=Email())
    password = fields.String(required=True, validate=Length(min=4, max=255))
    phone = fields.String(required=True, validate=Length(min=3, max=30))
    role = fields.String(
        load_default="felhasznalo",
        validate=OneOf(VALID_ROLES),
        metadata={
            "description": "Választható szerepkör: felhasznalo, penztaros vagy adminisztrator"
        },
    )


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


