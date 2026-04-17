from marshmallow import Schema, fields


class HallRequestSchema(Schema):
    name = fields.String(required=True)
    capacity = fields.Integer(required=True)


class HallUpdateSchema(Schema):
    name = fields.String(required=False)
    capacity = fields.Integer(required=False)


class HallResponseSchema(Schema):
    id = fields.Integer()
    name = fields.String()
    capacity = fields.Integer()


class ActionResponseSchema(Schema):
    message = fields.String()