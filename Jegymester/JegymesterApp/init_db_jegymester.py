from app import create_app
from app.extensions import db

from app.models.role import Role
from app.models.user import User
from app.models.movie import Movie
from app.models.hall import Hall
from app.models.screening import Screening
from app.models.ticket import Ticket


def get_or_create_role(name: str) -> tuple[Role, bool]:
    item = Role.query.filter_by(name=name).first()
    if item is not None:
        return item, False

    item = Role(name=name)
    db.session.add(item)
    db.session.flush()
    return item, True


def get_or_create_user(name: str, email: str, phone: str, password: str, role: Role) -> tuple[User, bool]:
    item = User.query.filter_by(email=email).first()
    if item is not None:
        changed = False
        if item.name != name:
            item.name = name
            changed = True
        if item.phone != phone:
            item.phone = phone
            changed = True
        if item.role_id != role.id:
            item.role = role
            changed = True
        return item, changed

    item = User(
        name=name,
        email=email,
        phone=phone,
        role=role,
    )
    item.set_password(password)
    db.session.add(item)
    db.session.flush()
    return item, True


def get_or_create_hall(name: str, capacity: int) -> tuple[Hall, bool]:
    item = Hall.query.filter_by(name=name).first()
    if item is not None:
        changed = False
        if item.capacity != capacity:
            item.capacity = capacity
            changed = True
        return item, changed

    item = Hall(name=name, capacity=capacity)
    db.session.add(item)
    db.session.flush()
    return item, True


def get_or_create_movie(name: str, description: str | None) -> tuple[Movie, bool]:
    item = Movie.query.filter_by(name=name).first()
    if item is not None:
        changed = False
        if item.description != description:
            item.description = description
            changed = True
        return item, changed

    item = Movie(name=name, description=description)
    db.session.add(item)
    db.session.flush()
    return item, True


def get_or_create_screening(time: int, place: str, movie: Movie, hall: Hall) -> tuple[Screening, bool]:
    item = Screening.query.filter_by(
        time=time,
        place=place,
        movie_id=movie.id,
        hall_id=hall.id,
    ).first()
    if item is not None:
        return item, False

    item = Screening(
        time=time,
        place=place,
        movie=movie,
        hall=hall,
    )
    db.session.add(item)
    db.session.flush()
    return item, True


def get_or_create_ticket(cost: int, available: bool, screening: Screening, user: User | None) -> tuple[Ticket, bool]:
    item = Ticket.query.filter_by(
        cost=cost,
        available=available,
        screening_id=screening.id,
        user_id=user.id if user is not None else None,
    ).first()
    if item is not None:
        return item, False

    item = Ticket(
        cost=cost,
        available=available,
        screening=screening,
        user=user,
    )
    db.session.add(item)
    db.session.flush()
    return item, True


def print_state() -> None:
    print("\n=== AKTUÁLIS ADATOK AZ ADATBÁZISBAN ===")
    print("Szerepkörök:", [(r.id, r.name) for r in Role.query.order_by(Role.id).all()])
    print("Felhasználók:", [(u.id, u.name, u.email, u.role_id) for u in User.query.order_by(User.id).all()])
    print("Termek:", [(h.id, h.name, h.capacity) for h in Hall.query.order_by(Hall.id).all()])
    print("Filmek:", [(m.id, m.name) for m in Movie.query.order_by(Movie.id).all()])
    print("Vetítések:", [(s.id, s.time, s.place, s.movie_id, s.hall_id) for s in Screening.query.order_by(Screening.id).all()])
    print("Jegyek:", [(t.id, t.cost, t.available, t.screening_id, t.user_id) for t in Ticket.query.order_by(Ticket.id).all()])
    print("Darabszámok:", {
        "roles": Role.query.count(),
        "users": User.query.count(),
        "halls": Hall.query.count(),
        "movies": Movie.query.count(),
        "screenings": Screening.query.count(),
        "tickets": Ticket.query.count(),
    })


def main() -> None:
    app = create_app()

    with app.app_context():
        try:
            db.create_all()

            print("Adatbázis URI:", db.engine.url)
            print_state()

            created = []
            updated = []

            admin_role, c = get_or_create_role("adminisztrator")
            if c:
                created.append("role: adminisztrator")

            cashier_role, c = get_or_create_role("penztaros")
            if c:
                created.append("role: penztaros")

            user_role, c = get_or_create_role("felhasznalo")
            if c:
                created.append("role: felhasznalo")

            _, c = get_or_create_user(
                name="Admin",
                email="admin@jegymester.hu",
                phone="111111111",
                password="admin123",
                role=admin_role,
            )
            (created if c else updated).append("user: admin@jegymester.hu")

            _, c = get_or_create_user(
                name="Pénztáros",
                email="cashier@jegymester.hu",
                phone="222222222",
                password="cashier123",
                role=cashier_role,
            )
            (created if c else updated).append("user: cashier@jegymester.hu")

            user1, c = get_or_create_user(
                name="Teszt Felhasználó",
                email="user@jegymester.hu",
                phone="333333333",
                password="user123",
                role=user_role,
            )
            (created if c else updated).append("user: user@jegymester.hu")

            hall1, c = get_or_create_hall("Terem 1", 120)
            (created if c else updated).append("hall: Terem 1")

            hall2, c = get_or_create_hall("Terem 2", 80)
            (created if c else updated).append("hall: Terem 2")

            hall3, c = get_or_create_hall("VIP terem", 40)
            (created if c else updated).append("hall: VIP terem")

            movie1, c = get_or_create_movie("Dune", "Sci-fi film")
            (created if c else updated).append("movie: Dune")

            movie2, c = get_or_create_movie("Avatar", "Fantasy / sci-fi film")
            (created if c else updated).append("movie: Avatar")

            movie3, c = get_or_create_movie("Batman", "Akció film")
            (created if c else updated).append("movie: Batman")

            screening1, c = get_or_create_screening(1800, "Terem 1", movie1, hall1)
            (created if c else updated).append("screening: Dune")

            screening2, c = get_or_create_screening(2000, "Terem 2", movie2, hall2)
            (created if c else updated).append("screening: Avatar")

            screening3, c = get_or_create_screening(2130, "VIP terem", movie3, hall3)
            (created if c else updated).append("screening: Batman")

            _, c = get_or_create_ticket(2500, True, screening1, user1)
            (created if c else updated).append("ticket: 2500 / user")

            _, c = get_or_create_ticket(3000, True, screening2, None)
            (created if c else updated).append("ticket: 3000 / guest")

            admin = User.query.filter_by(email="admin@jegymester.hu").first()
            _, c = get_or_create_ticket(4500, True, screening3, admin)
            (created if c else updated).append("ticket: 4500 / admin")

            db.session.commit()

            print("\n=== EREDMÉNY ===")
            print("Létrehozva:", created)
            print("Már létezett vagy frissítve:", updated)
            print_state()
            print("\nSikeres adatfeltöltés.")

        except Exception as e:
            db.session.rollback()
            print("HIBA:", repr(e))
            raise


if __name__ == "__main__":
    main()
