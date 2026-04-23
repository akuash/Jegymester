from marshmallow import Schema, fields


class MovieRequestSchema(Schema):
    name = fields.String(required=True)
    description = fields.String(required=False, allow_none=True)


class MovieUpdateSchema(Schema):
    name = fields.String(required=False)
    description = fields.String(required=False, allow_none=True)


class MovieResponseSchema(Schema):
    id = fields.Integer()
    name = fields.String()
    description = fields.String(allow_none=True)