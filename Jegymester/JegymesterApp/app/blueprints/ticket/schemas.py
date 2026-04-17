from marshmallow import Schema, fields


class TicketRequestSchema(Schema):
    cost = fields.Integer(required=True)
    screening_id = fields.Integer(required=True)
    user_id = fields.Integer(required=False, allow_none=True)


class TicketBuySchema(Schema):
    user_id = fields.Integer(required=False, allow_none=True)


class TicketCancelSchema(Schema):
    user_id = fields.Integer(required=False, allow_none=True)


class ActionResponseSchema(Schema):
    message = fields.String()


class UserShortSchema(Schema):
    id = fields.Integer()
    name = fields.String()
    email = fields.Email(allow_none=True)
    phone = fields.String()


class ScreeningShortSchema(Schema):
    id = fields.Integer()
    time = fields.Integer()
    place = fields.String()
    movie_id = fields.Integer()
    hall_id = fields.Integer()


class TicketResponseSchema(Schema):
    id = fields.Integer()
    cost = fields.Integer()
    available = fields.Boolean()
    screening_id = fields.Integer()
    user_id = fields.Integer(allow_none=True)


class TicketDetailsSchema(Schema):
    id = fields.Integer()
    cost = fields.Integer()
    available = fields.Boolean()
    screening_id = fields.Integer()
    user_id = fields.Integer(allow_none=True)
    screening = fields.Nested(ScreeningShortSchema)
    user = fields.Nested(UserShortSchema, allow_none=True)
