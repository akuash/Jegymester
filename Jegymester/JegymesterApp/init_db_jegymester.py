from app import create_app
from app.extensions import db

from app.models.user import User
from app.models.role import Role
from app.models.movie import Movie
from app.models.screening import Screening
from app.models.ticket import Ticket


def get_or_create_role(name: str) -> Role:
    role = Role.query.filter_by(name=name).first()
    if role is None:
        role = Role(name=name)
        db.session.add(role)
        db.session.flush()
    return role


def get_or_create_user(name: str, email: str, phone: str, password: str, role: Role) -> User:
    user = User.query.filter_by(email=email).first()
    if user is None:
        user = User(name=name, email=email, phone=phone, role=role)
        user.set_password(password)
        db.session.add(user)
        db.session.flush()
    return user


app = create_app()

with app.app_context():
    try:
       
        admin_role = get_or_create_role("adminisztrator")
        cashier_role = get_or_create_role("penztaros")
        user_role = get_or_create_role("felhasznalo")

        
        admin = get_or_create_user(
            name="Admin",
            email="admin@jegymester.hu",
            phone="111111111",
            password="admin",
            role=admin_role,
        )

        penztaros = get_or_create_user(
            name="Pénztáros",
            email="cashier@jegymester.hu",
            phone="222222222",
            password="cashier",
            role=cashier_role,
        )

        felhasznalo = get_or_create_user(
            name="Felhasználó",
            email="user@jegymester.hu",
            phone="333333333",
            password="user",
            role=user_role,
        )

        
        movie = Movie.query.filter_by(name="Dune").first()
        if movie is None:
            movie = Movie(name="Dune", description="Sci-fi")
            db.session.add(movie)
            db.session.flush()

        
        screening = Screening.query.filter_by(
            movie_id=movie.id,
            time=1800,
            place="Terem 1"
        ).first()

        if screening is None:
            screening = Screening(time=1800, place="Terem 1", movie=movie)
            db.session.add(screening)
            db.session.flush()

        
        exists_ticket = Ticket.query.filter_by(
            screening_id=screening.id,
            user_id=felhasznalo.id
        ).first()

        if exists_ticket is None:
            ticket = Ticket(
                cost=2500,
                available=True,
                screening=screening,
                user=felhasznalo
            )
            db.session.add(ticket)

        db.session.commit()

        print("Sikeres feltöltés.")
        print("Role-ok:", [r.name for r in Role.query.order_by(Role.id).all()])
        print("Felhasználók:", [(u.name, u.email, u.role.name) for u in User.query.order_by(User.id).all()])

    except Exception as e:
        db.session.rollback()
        print("HIBA a seed futása közben:", e)
        raise