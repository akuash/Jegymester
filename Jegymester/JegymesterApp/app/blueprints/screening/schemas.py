from marshmallow import Schema, fields


class ScreeningRequestSchema(Schema):
    time = fields.DateTime(required=True)
    movie_id = fields.Integer(required=True)
    hall_id = fields.Integer(required=True)


class ScreeningUpdateSchema(Schema):
    time = fields.DateTime(required=False)
    movie_id = fields.Integer(required=False)
    hall_id = fields.Integer(required=False)


class ActionResponseSchema(Schema):
    message = fields.String()


class MovieShortSchema(Schema):
    id = fields.Integer()
    name = fields.String()
    description = fields.String(allow_none=True)


class HallShortSchema(Schema):
    id = fields.Integer()
    name = fields.String()
    capacity = fields.Integer()


class ScreeningResponseSchema(Schema):
    id = fields.Integer()
    time = fields.DateTime()
    movie_id = fields.Integer()
    hall_id = fields.Integer()


class ScreeningDetailsSchema(Schema):
    id = fields.Integer()
    time = fields.DateTime()
    movie_id = fields.Integer()
    hall_id = fields.Integer()
    movie = fields.Nested(MovieShortSchema)
    hall = fields.Nested(HallShortSchema)