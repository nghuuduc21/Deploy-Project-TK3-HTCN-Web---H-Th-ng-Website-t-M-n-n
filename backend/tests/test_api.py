import pytest

from app import app, db, Food


@pytest.fixture()
def client():
    app.config.update(
        TESTING=True,
        SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
        JWT_SECRET_KEY="test-secret",
    )
    with app.app_context():
        db.create_all()
        db.session.add(
            Food(
                name="Test Food",
                price=120000,
                image="https://example.com/image.jpg",
                description="Delicious test food",
            )
        )
        db.session.commit()

    with app.test_client() as client:
        yield client

    with app.app_context():
        db.drop_all()


def test_get_foods(client):
    response = client.get("/api/foods")
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, list)
    assert data[0]["name"] == "Test Food"


def test_create_booking(client):
    payload = {
        "customerInfo": {
            "name": "Nguyen Van A",
            "phone": "0901234567",
            "email": "a@example.com",
        },
        "booking": {
            "guests": 2,
            "dateTime": "2099-12-31T18:00:00",
            "note": "Near the window",
        },
        "orders": [{"foodId": 1, "quantity": 2}],
    }
    response = client.post("/api/bookings", json=payload)
    assert response.status_code == 201
    data = response.get_json()
    assert data["totalAmount"] == 240000
    assert data["status"] == "pending"

