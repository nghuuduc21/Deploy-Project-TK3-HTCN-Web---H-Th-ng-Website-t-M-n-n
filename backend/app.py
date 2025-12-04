from __future__ import annotations

import json
import os
import random
import uuid
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path
from typing import Dict, List, Optional

from dotenv import load_dotenv
from flask import Flask, jsonify, request, g, send_file
from werkzeug.utils import secure_filename
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    get_jwt_identity,
    jwt_required,
)
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from marshmallow import Schema, ValidationError, fields, validate, validates_schema
try:
    from groq import Groq  # type: ignore
except ImportError:
    Groq = None  # type: ignore
    print("[WARNING] Thư viện 'groq' chưa được cài. Chạy: pip install groq")
from sqlalchemy import func
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent

# Load .env đặt cùng thư mục với app.py (backend/.env)
load_dotenv(BASE_DIR / ".env")

# ============================================
# APP & DATABASE CONFIGURATION
# ============================================
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

UPLOAD_DIR = BASE_DIR / "uploads" / "foods"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

DEFAULT_DB_PATH = DATA_DIR / "mtp_food.db"

app = Flask(__name__)
CORS(app, 
     resources={r"/api/*": {"origins": "*"}},
     allow_headers=["Content-Type", "Authorization"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     supports_credentials=True)

# Fix DATABASE_URL: Render trả về postgres:// nhưng SQLAlchemy 2.0+ cần postgresql://
database_url = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH.as_posix()}")
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)
    print(f"[DB] Đã convert DATABASE_URL từ postgres:// sang postgresql://")

app.config.update(
    SQLALCHEMY_DATABASE_URI=database_url,
    SQLALCHEMY_TRACK_MODIFICATIONS=False,
    JWT_SECRET_KEY=os.getenv("JWT_SECRET_KEY", "mtp-dev-secret"),
    JSON_SORT_KEYS=False,
)



db = SQLAlchemy(app)
migrate = Migrate(app, db)
jwt = JWTManager(app)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")  # Free model tốt nhất của Groq

print(f"[AI CONFIG] GROQ_API_KEY loaded: {bool(GROQ_API_KEY)} | MODEL: {GROQ_MODEL}")

groq_client: Optional[Groq] = None

# Khởi tạo Groq client (FREE, không cần credit card)
if GROQ_API_KEY and Groq is not None:
    try:
        groq_client = Groq(api_key=GROQ_API_KEY)  # type: ignore
        print("[AI CONFIG] Groq client initialized thành công (FREE API)")
    except Exception as e:
        print(f"[AI CONFIG] Lỗi khởi tạo Groq client: {e}")
        groq_client = None
elif not GROQ_API_KEY:
    print("[AI CONFIG] Groq client KHÔNG được khởi tạo (thiếu GROQ_API_KEY trong .env?)")
elif Groq is None:
    print("[AI CONFIG] Groq client KHÔNG được khởi tạo (chưa cài thư viện: pip install groq)")


BOOKING_STATUSES = ["pending", "confirmed", "completed", "cancelled"]
STATUS_LABELS = {
    "pending": "Chờ xác nhận",
    "confirmed": "Đã xác nhận",
    "completed": "Hoàn tất",
    "cancelled": "Đã hủy",
}


# ============================================
# DATABASE MODELS
# ============================================
class TimestampMixin:
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Food(TimestampMixin, db.Model):
    __tablename__ = "foods"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    price = db.Column(db.Integer, nullable=False)
    image = db.Column(db.String(500), nullable=False)
    description = db.Column(db.Text, default="")
    is_active = db.Column(db.Boolean, default=True)


class Booking(TimestampMixin, db.Model):
    __tablename__ = "bookings"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), unique=True, nullable=False)
    customer_name = db.Column(db.String(120), nullable=False)
    customer_phone = db.Column(db.String(20), nullable=False)
    customer_email = db.Column(db.String(120), nullable=False)
    guests = db.Column(db.Integer, nullable=False)
    booking_datetime = db.Column(db.DateTime, nullable=False)
    note = db.Column(db.Text, default="")
    status = db.Column(db.String(20), default="pending", nullable=False)
    total_amount = db.Column(db.Integer, default=0)
    status_history = db.Column(db.Text, default="[]")

    items = db.relationship(
        "BookingItem",
        cascade="all, delete-orphan",
        backref="booking",
        lazy="joined",
    )

    def update_status(self, new_status: str, note: str = "") -> None:
        history = json.loads(self.status_history or "[]")
        history.append(
            {
                "status": new_status,
                "label": STATUS_LABELS.get(new_status, new_status),
                "note": note,
                "time": datetime.utcnow().isoformat(),
            }
        )
        self.status_history = json.dumps(history)
        self.status = new_status


class BookingItem(db.Model):
    __tablename__ = "booking_items"

    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.Integer, db.ForeignKey("bookings.id"), nullable=False)
    food_id = db.Column(db.Integer, db.ForeignKey("foods.id"), nullable=True)
    food_name = db.Column(db.String(120), nullable=False)
    price = db.Column(db.Integer, nullable=False)
    quantity = db.Column(db.Integer, default=1, nullable=False)


class AdminUser(TimestampMixin, db.Model):
    __tablename__ = "admin_users"

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, default=True)


class ChatLog(TimestampMixin, db.Model):
    __tablename__ = "chat_logs"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(36), index=True, nullable=False)
    role = db.Column(db.String(20), nullable=False)  # user / assistant
    message = db.Column(db.Text, nullable=False)
    food_snapshot = db.Column(db.Text, default="[]")


# ============================================
# VALIDATION SCHEMAS
# ============================================
# class FoodSchema(Schema):
#     name = fields.Str(required=True, validate=validate.Length(min=2, max=120))
#     price = fields.Int(required=True, validate=validate.Range(min=0))
#     image = fields.Url(required=True, error_messages={"invalid": "URL hình ảnh không hợp lệ"})
#     description = fields.Str(load_default="")
#     isActive = fields.Bool(load_default=True)

class FoodSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=2, max=120))
    price = fields.Int(required=True, validate=validate.Range(min=0))
    image = fields.Str(required=True, validate=validate.Length(min=5, max=500))  # ĐỔI từ fields.Url
    description = fields.Str(load_default="")
    isActive = fields.Bool(load_default=True)


class CustomerInfoSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=2, max=120))
    phone = fields.Str(
        required=True, validate=validate.Regexp(r"^0\d{9}$", error="Số điện thoại không hợp lệ")
    )
    email = fields.Email(required=True)


class BookingInfoSchema(Schema):
    guests = fields.Int(required=True, validate=validate.Range(min=1, max=40))
    dateTime = fields.DateTime(required=True)
    note = fields.Str(load_default="")


class OrderItemSchema(Schema):
    foodId = fields.Int(required=True)
    quantity = fields.Int(load_default=1, validate=validate.Range(min=1, max=20))


class BookingSchema(Schema):
    customerInfo = fields.Nested(CustomerInfoSchema, required=True)
    booking = fields.Nested(BookingInfoSchema, required=True)
    orders = fields.List(fields.Nested(OrderItemSchema), required=True)

    @validates_schema
    def validate_orders(self, data, **kwargs):
        if not data.get("orders"):
            raise ValidationError("Cần chọn ít nhất một món", "orders")


food_schema = FoodSchema()
booking_schema = BookingSchema()


# ============================================
# HELPERS
# ============================================
# def admin_required(func):
#     @wraps(func)
#     @jwt_required()
#     def wrapper(*args, **kwargs):
#         admin_id = get_jwt_identity()
#         admin = AdminUser.query.get(admin_id)
#         if not admin or not admin.is_active:
#             return jsonify({"error": "Không có quyền truy cập"}), 403
#         g.current_admin = admin
#         return func(*args, **kwargs)

#     return wrapper
def admin_required(func):
    @wraps(func)
    @jwt_required()
    def wrapper(*args, **kwargs):
        admin_id = get_jwt_identity()
        # FIX: Convert string back to int
        admin = db.session.get(AdminUser, int(admin_id))
        if not admin or not admin.is_active:
            return jsonify({"error": "Không có quyền truy cập"}), 403
        g.current_admin = admin
        return func(*args, **kwargs)

    return wrapper


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def serialize_food(food: Food) -> Dict:
    # Nếu image là URL (external), dùng trực tiếp
    # Nếu là path local, convert thành URL
    image_url = food.image
    if food.image and not food.image.startswith('http'):
        # Local file path
        image_url = f"/uploads/foods/{food.image}"
    return {
        "id": food.id,
        "name": food.name,
        "price": food.price,
        "image": image_url,
        "description": food.description,
        "isActive": food.is_active,
        "createdAt": food.created_at.isoformat(),
        "updatedAt": food.updated_at.isoformat() if food.updated_at else None,
    }


def serialize_booking(booking: Booking) -> Dict:
    return {
        "id": booking.code,
        "status": booking.status,
        "statusLabel": STATUS_LABELS.get(booking.status, booking.status),
        "customerInfo": {
            "name": booking.customer_name,
            "phone": booking.customer_phone,
            "email": booking.customer_email,
        },
        "booking": {
            "guests": booking.guests,
            "dateTime": booking.booking_datetime.isoformat(),
            "note": booking.note,
        },
        "orders": [
            {
                "foodId": item.food_id,
                "name": item.food_name,
                "price": item.price,
                "quantity": item.quantity,
            }
            for item in booking.items
        ],
        "totalAmount": booking.total_amount,
        "createdAt": booking.created_at.isoformat(),
        "updatedAt": booking.updated_at.isoformat() if booking.updated_at else None,
        "statusTimeline": json.loads(booking.status_history or "[]"),
    }


def generate_booking_code() -> str:
    return f"BK{uuid.uuid4().hex[:8].upper()}"


def fallback_ai_response(message: str, foods: List[Dict]) -> str:
    message_lower = message.lower()

    if any(word in message_lower for word in ["xin chào", "hello", "hi", "chào"]):
        return "Xin chào! Tôi có thể giúp bạn gợi ý món, kiểm tra giá hoặc đặt bàn."

    if "giá" in message_lower or "bao nhiêu" in message_lower:
        if foods:
            cheapest = min(foods, key=lambda x: x.get("price", 0))
            expensive = max(foods, key=lambda x: x.get("price", 0))
            return (
                f"Món rẻ nhất là {cheapest['name']} ({cheapest['price']:,}đ), "
                f"đắt nhất là {expensive['name']} ({expensive['price']:,}đ)."
            )
        return "Hiện chưa có thông tin giá món ăn."

    if any(word in message_lower for word in ["gợi ý", "recommend", "món nào", "ăn gì"]):
        if len(foods) >= 3:
            picks = random.sample(foods, k=min(3, len(foods)))
            lines = [f"- {food['name']} ({food['price']:,}đ)" for food in picks]
            return "Bạn có thể thử:\n" + "\n".join(lines)
        return "Tôi cần thêm món ăn để gợi ý chính xác hơn."

    for food in foods:
        if food["name"].lower() in message_lower:
            return f"{food['name']} đang có giá {food['price']:,}đ."

    return "Tôi có thể giúp bạn tra cứu món ăn, giá cả và đặt bàn. Bạn muốn biết điều gì?"


# ============================================
# AUTH ROUTES
# ============================================
@app.post("/api/auth/register")
@jwt_required(optional=True)
# def register_admin():
#     """Allow first admin to register freely, subsequent ones require login."""
#     data = request.get_json() or {}
#     full_name = data.get("fullName", "").strip()
#     email = (data.get("email") or "").lower().strip()
#     password = data.get("password")

#     if not full_name or not email or not password:
#         return jsonify({"error": "Thiếu thông tin"}), 400

#     admin_count = AdminUser.query.count()
#     current_admin = get_jwt_identity()
#     if admin_count > 0 and not current_admin:
#         return jsonify({"error": "Bạn cần đăng nhập để tạo admin mới"}), 403

#     if AdminUser.query.filter_by(email=email).first():
#         return jsonify({"error": "Email đã tồn tại"}), 400

#     admin = AdminUser(
#         full_name=full_name,
#         email=email,
#         password_hash=generate_password_hash(password),
#     )
#     db.session.add(admin)
#     db.session.commit()

#     return jsonify({"message": "Tạo admin thành công"}), 201
def register_admin():
    """Allow first admin to register freely, subsequent ones require login."""
    data = request.get_json() or {}
    full_name = data.get("fullName", "").strip()
    email = (data.get("email") or "").lower().strip()
    password = data.get("password")

    if not full_name or not email or not password:
        return jsonify({"error": "Thiếu thông tin"}), 400

    admin_count = AdminUser.query.count()
    current_admin = get_jwt_identity()
    if admin_count > 0 and not current_admin:
        return jsonify({"error": "Bạn cần đăng nhập để tạo admin mới"}), 403

    if AdminUser.query.filter_by(email=email).first():
        return jsonify({"error": "Email đã tồn tại"}), 400

    admin = AdminUser(
        full_name=full_name,
        email=email,
        password_hash=generate_password_hash(password),
    )
    db.session.add(admin)
    db.session.commit()

    # FIX: Tự động tạo token cho admin đầu tiên
    token = create_access_token(
        identity=str(admin.id),
        additional_claims={"email": admin.email}
    )

    return jsonify({
        "message": "Tạo admin thành công",
        "token": token,
        "admin": {"id": admin.id, "fullName": admin.full_name, "email": admin.email}
    }), 201

@app.post("/api/auth/login")
# def login_admin():
#     data = request.get_json() or {}
#     email = (data.get("email") or "").lower().strip()
#     password = data.get("password") or ""

#     admin = AdminUser.query.filter_by(email=email).first()
#     if not admin or not check_password_hash(admin.password_hash, password):
#         return jsonify({"error": "Email hoặc mật khẩu không đúng"}), 401

#     token = create_access_token(identity=admin.id, additional_claims={"email": admin.email})

#     return jsonify(
#         {
#             "token": token,
#             "admin": {"id": admin.id, "fullName": admin.full_name, "email": admin.email},
#         }
#     )

def login_admin():
    data = request.get_json() or {}
    email = (data.get("email") or "").lower().strip()
    password = data.get("password") or ""

    admin = AdminUser.query.filter_by(email=email).first()
    if not admin or not check_password_hash(admin.password_hash, password):
        return jsonify({"error": "Email hoặc mật khẩu không đúng"}), 401

    # FIX: Đổi identity thành string
    token = create_access_token(
        identity=str(admin.id),  # PHẢI LÀ STRING
        additional_claims={"email": admin.email}
    )

    return jsonify(
        {
            "token": token,
            "admin": {"id": admin.id, "fullName": admin.full_name, "email": admin.email},
        }
    )


# ============================================
# STATIC FILES (Uploaded images)
# ============================================
@app.route("/uploads/foods/<filename>")
def uploaded_file(filename):
    try:
        file_path = UPLOAD_DIR / filename
        if not file_path.exists():
            return jsonify({"error": "File not found"}), 404
        return send_file(str(file_path))
    except Exception as e:
        print(f"Error serving file {filename}: {e}")
        return jsonify({"error": "Error serving file"}), 500

# ============================================
# FOODS API
# ============================================
@app.get("/api/foods")
def get_foods():
    foods = Food.query.filter_by(is_active=True).order_by(Food.created_at.desc()).all()
    return jsonify([serialize_food(food) for food in foods])


@app.get("/api/foods/<int:food_id>")
def get_food(food_id: int):
    food = db.session.get(Food, food_id)
    if not food:
        return jsonify({"error": "Không tìm thấy món ăn"}), 404
    return jsonify(serialize_food(food))


@app.post("/api/foods")
@admin_required
def create_food():
    try:
        # Kiểm tra có file upload không
        if 'image' in request.files:
            file = request.files['image']
            if file and file.filename and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                # Thêm timestamp để tránh trùng tên
                import time
                filename = f"{int(time.time())}_{filename}"
                file.save(UPLOAD_DIR / filename)
                image_path = filename
            else:
                return jsonify({"error": "File ảnh không hợp lệ. Chỉ chấp nhận: png, jpg, jpeg, gif, webp"}), 400
        else:
            # Fallback: nhận URL từ JSON (backward compatible)
            data = request.get_json() or {}
            image_path = data.get("image", "")
            if not image_path:
                return jsonify({"error": "Cần có ảnh (upload file hoặc URL)"}), 400
        
        # Lấy các field khác từ form data hoặc JSON
        name = request.form.get('name') or (request.get_json() or {}).get('name', '')
        price = int(request.form.get('price') or (request.get_json() or {}).get('price', 0))
        description = request.form.get('description') or (request.get_json() or {}).get('description', '')
        is_active = request.form.get('isActive', 'true').lower() == 'true' if request.form.get('isActive') else (request.get_json() or {}).get('isActive', True)
        
        if not name or price <= 0:
            return jsonify({"error": "Tên và giá là bắt buộc"}), 400
        
        food = Food(
            name=name,
            price=price,
            image=image_path,
            description=description,
            is_active=is_active,
        )
        db.session.add(food)
        db.session.commit()
        return jsonify(serialize_food(food)), 201
    except ValidationError as err:  
        return jsonify({"error": err.messages}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500  


# @app.put("/api/foods/<int:food_id>")
@app.route("/api/foods/<int:food_id>", methods=["PUT"])
@admin_required
def update_food(food_id: int):
    food = db.session.get(Food, food_id)
    if not food:
        return jsonify({"error": "Không tìm thấy món ăn"}), 404

    try:
        # Xử lý upload ảnh mới nếu có
        if 'image' in request.files:
            file = request.files['image']
            if file and file.filename and allowed_file(file.filename):
                # Xóa ảnh cũ nếu có
                if food.image and not food.image.startswith('http'):
                    old_path = UPLOAD_DIR / food.image
                    if old_path.exists():
                        old_path.unlink()
                
                # Lưu ảnh mới
                filename = secure_filename(file.filename)
                import time
                filename = f"{int(time.time())}_{filename}"
                file.save(UPLOAD_DIR / filename)
                food.image = filename
        
        # Cập nhật các field khác
        if request.is_json:
            payload = food_schema.load(request.get_json() or {}, partial=True)
            for key, value in payload.items():
                if key == "isActive":
                    food.is_active = value
                elif key != "image":  # Bỏ qua image nếu là JSON (đã xử lý ở trên)
                    setattr(food, key, value)
        else:
            # Form data
            if request.form.get('name'):
                food.name = request.form.get('name')
            if request.form.get('price'):
                food.price = int(request.form.get('price'))
            if request.form.get('description') is not None:
                food.description = request.form.get('description')
            if request.form.get('isActive'):
                food.is_active = request.form.get('isActive').lower() == 'true'
        
        db.session.commit()
        return jsonify(serialize_food(food))
    except ValidationError as err:  
        return jsonify({"error": err.messages}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500  


@app.delete("/api/foods/<int:food_id>")
@admin_required
def delete_food(food_id: int):
    food = db.session.get(Food, food_id)
    if not food:
        return jsonify({"error": "Không tìm thấy món ăn"}), 404
    
    # Xóa file ảnh nếu có
    if food.image and not food.image.startswith('http'):
        image_path = UPLOAD_DIR / food.image
        if image_path.exists():
            image_path.unlink()
    
    db.session.delete(food)
    db.session.commit()
    return jsonify({"message": "Xóa món ăn thành công"})


# ============================================
# BOOKINGS API
# ============================================
def _hydrate_orders(orders: List[Dict]) -> List[Dict]:
    """Fetch food data to ensure price integrity."""
    grouped: Dict[int, int] = {}
    for order in orders:
        food_id = order["foodId"]
        grouped[food_id] = grouped.get(food_id, 0) + order.get("quantity", 1)

    hydrated = []
    for food_id, quantity in grouped.items():
        food = db.session.get(Food, food_id)
        if not food:
            raise ValidationError(f"Món với ID {food_id} không tồn tại", "orders")
        hydrated.append(
            {
                "food": food,
                "quantity": quantity,
                "price": food.price,
                "name": food.name,
            }
        )
    return hydrated


@app.get("/api/bookings")
def get_bookings():
    bookings = Booking.query.order_by(Booking.created_at.desc()).all()
    return jsonify([serialize_booking(booking) for booking in bookings])


@app.get("/api/bookings/<string:code>")
def get_booking(code: str):
    booking = Booking.query.filter_by(code=code).first()
    if not booking:
        return jsonify({"error": "Không tìm thấy đặt bàn"}), 404
    return jsonify(serialize_booking(booking))


@app.post("/api/bookings")
def create_booking():
    payload = booking_schema.load(request.get_json() or {})

    hydrated_orders = _hydrate_orders(payload["orders"])
    booking_info = payload["booking"]
    customer_info = payload["customerInfo"]

    booking = Booking(
        code=generate_booking_code(),
        customer_name=customer_info["name"],
        customer_phone=customer_info["phone"],
        customer_email=customer_info["email"],
        guests=booking_info["guests"],
        booking_datetime=booking_info["dateTime"],
        note=booking_info.get("note", ""),
        status="pending",
    )
    booking.update_status("pending", "Đơn mới được tạo từ website")

    total = 0
    for order in hydrated_orders:
        total += order["price"] * order["quantity"]
        booking.items.append(
            BookingItem(
                food_id=order["food"].id,
                food_name=order["name"],
                price=order["price"],
                quantity=order["quantity"],
            )
        )

    booking.total_amount = total
    db.session.add(booking)
    db.session.commit()

    return jsonify(serialize_booking(booking)), 201


@app.put("/api/bookings/<string:code>")
@admin_required
def update_booking(code: str):
    booking = Booking.query.filter_by(code=code).first()
    if not booking:
        return jsonify({"error": "Không tìm thấy đặt bàn"}), 404

    status = request.json.get("status")
    if status not in BOOKING_STATUSES:
        return jsonify({"error": "Trạng thái không hợp lệ"}), 400

    note = request.json.get("note", "")
    booking.update_status(status, note or f"Cập nhật trạng thái: {status}")
    db.session.commit()
    return jsonify(serialize_booking(booking))


@app.delete("/api/bookings/<string:code>")
@admin_required
def delete_booking(code: str):
    booking = Booking.query.filter_by(code=code).first()
    if not booking:
        return jsonify({"error": "Không tìm thấy đặt bàn"}), 404
    db.session.delete(booking)
    db.session.commit()
    return jsonify({"message": "Xóa đơn thành công"})


# ============================================
# AI CHATBOT API
# ============================================
@app.post("/api/ai/chat")
# def ai_chat():
#     data = request.get_json() or {}
#     message = (data.get("message") or "").strip()
#     foods = data.get("foods") or []
#     session_id = data.get("sessionId") or str(uuid.uuid4())

#     if not message:
#         return jsonify({"error": "Vui lòng nhập nội dung"}), 400

#     response_text = fallback_ai_response(message, foods)
#     if openai_client:
#         try:
#             full_prompt = (
#                 "Bạn là trợ lý ẩm thực của nhà hàng MTP Food. "
#                 "Hãy tư vấn ngắn gọn, thân thiện bằng tiếng Việt."
#             )
#             result = openai_client.chat.completions.create(
#                 model=OPENAI_MODEL,
#                 message=[
#                     {"role": "system", "content": full_prompt},
#                     {
#                         "role": "user",
#                         "content": json.dumps({
#                             "message": message,
#                             "menu": foods[:10],
#                         }, ensure_ascii=False),
#                     },
#                 ],
#                 temperature=0.6,
#                 max_output_tokens=350,
#             )
#             if result.choices:
#                 response_text = result.choices[0].message.content or response_text
#         except Exception:
#             # fallback already set
#             pass

#     db.session.add(
#         ChatLog(
#             session_id=session_id,
#             role="user",
#             message=message,
#             food_snapshot=json.dumps(foods[:10], ensure_ascii=False),
#         )
#     )
#     db.session.add(
#         ChatLog(
#             session_id=session_id,
#             role="assistant",
#             message=response_text,
#             food_snapshot=json.dumps(foods[:10], ensure_ascii=False),
#         )
#     )
#     db.session.commit()

#     return jsonify({"sessionId": session_id, "response": response_text})

@app.post("/api/ai/chat")
def ai_chat():
    data = request.get_json() or {}
    message = (data.get("message") or "").strip()
    foods = data.get("foods") or []
    session_id = data.get("sessionId") or str(uuid.uuid4())

    if not message:
        return jsonify({"error": "Vui lòng nhập nội dung"}), 400

    response_text = fallback_ai_response(message, foods)
    
    full_prompt = (
        "Bạn là trợ lý ẩm thực của nhà hàng MTP Food. "
        "Hãy tư vấn ngắn gọn, thân thiện bằng tiếng Việt."
    )
    
    # Chỉ dùng Groq (FREE API)
    if groq_client:
        try:
            print("[AI CHAT] Gọi Groq (FREE) cho message:", message[:60])
            result = groq_client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[
                    {"role": "system", "content": full_prompt},
                    {
                        "role": "user",
                        "content": json.dumps(
                            {"message": message, "menu": foods[:10]},
                            ensure_ascii=False,
                        ),
                    },
                ],
                temperature=0.6,
                max_tokens=350,
            )
            if result.choices:
                response_text = result.choices[0].message.content or response_text
                print("[AI CHAT] Nhận được câu trả lời từ Groq")
        except Exception as e:
            print(f"[AI CHAT] Groq Error: {e}")
            # fallback đã gán sẵn
    else:
        print("[AI CHAT] Không có Groq client, dùng fallback_ai_response")

    # Lưu chat log
    try:
        db.session.add(
            ChatLog(
                session_id=session_id,
                role="user",
                message=message,
                food_snapshot=json.dumps(foods[:10], ensure_ascii=False),
            )
        )
        db.session.add(
            ChatLog(
                session_id=session_id,
                role="assistant",
                message=response_text,
                food_snapshot=json.dumps(foods[:10], ensure_ascii=False),
            )
        )
        db.session.commit()
    except Exception as e:
        print(f"DB Error: {e}")

    return jsonify({"sessionId": session_id, "response": response_text})
# ============================================
# STATISTICS API
# ============================================
@app.get("/api/stats")
# def get_stats():
#     total_foods = Food.query.count()
#     total_bookings = Booking.query.count()
#     pending = Booking.query.filter_by(status="pending").count()
#     confirmed = Booking.query.filter_by(status="confirmed").count()
#     revenue = (
#         db.session.query(func.coalesce(func.sum(Booking.total_amount), 0))
#         .filter(Booking.status.in_(["confirmed", "completed"]))
#         .scalar()
#     )

#     upcoming = (
#         Booking.query.filter(
#             Booking.booking_datetime >= datetime.utcnow(),
#             Booking.status.in_(["pending", "confirmed"]),
#         )
#         .order_by(Booking.booking_datetime)
#         .limit(3)
#         .all()
#     )
@app.get("/api/stats")
def get_stats():
    total_foods = Food.query.count()
    total_bookings = Booking.query.count()
    pending = Booking.query.filter_by(status="pending").count()
    confirmed = Booking.query.filter_by(status="confirmed").count()
    revenue = (
        db.session.query(func.coalesce(func.sum(Booking.total_amount), 0))
        .filter(Booking.status.in_(["confirmed", "completed"]))
        .scalar()
    )

    # FIX: Đổi datetime.utcnow() thành datetime.now(timezone.utc)
    from datetime import timezone
    upcoming = (
        Booking.query.filter(
            Booking.booking_datetime >= datetime.now(timezone.utc),
            Booking.status.in_(["pending", "confirmed"]),
        )
        .order_by(Booking.booking_datetime)
        .limit(3)
        .all()
    )
    
    return jsonify(
        {
            "totalFoods": total_foods,
            "totalBookings": total_bookings,
            "pendingBookings": pending,
            "confirmedBookings": confirmed,
            "totalRevenue": revenue,
            "upcoming": [
                {
                    "id": booking.code,
                    "guestName": booking.customer_name,
                    "guests": booking.guests,
                    "dateTime": booking.booking_datetime.isoformat(),
                    "status": booking.status,
                }
                for booking in upcoming
            ],
        }
    )


# ============================================
# SEED DATA
# ============================================
@app.post("/api/seed")
@admin_required
def seed_data():
    if Food.query.count() > 0:
        return jsonify({"message": "Đã tồn tại dữ liệu, không cần seed"}), 400

    sample_foods = [
        {
            "name": "Bò bít tết",
            "price": 150000,
            "image": "https://images.pexels.com/photos/461198/pexels-photo-461198.jpeg",
            "description": "Thịt bò Úc cao cấp, nướng chín mềm",
            "is_active": True  # FIX: Đổi key từ "isActive" sang "is_active"
        },
        {
            "name": "Pizza hải sản",
            "price": 200000,
            "image": "https://images.pexels.com/photos/70497/pexels-photo-70497.jpeg",
            "description": "Pizza phô mai tươi với tôm, mực, nghêu",
            "is_active": True
        },
        {
            "name": "Mì Ý sốt kem",
            "price": 120000,
            "image": "https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg",
            "description": "Mì Ý truyền thống với sốt kem béo ngậy",
            "is_active": True
        },
        {
            "name": "Gà nướng mật ong",
            "price": 130000,
            "image": "https://images.pexels.com/photos/410648/pexels-photo-410648.jpeg",
            "description": "Gà tươi ướp mật ong, nướng giòn da",
            "is_active": True
        },
        {
            "name": "Lẩu Thái chua cay",
            "price": 220000,
            "image": "https://images.pexels.com/photos/1482803/pexels-photo-1482803.jpeg",
            "description": "Lẩu Tom Yum chuẩn vị Thái Lan",
            "is_active": True
        },
        {
            "name": "Sushi tổng hợp",
            "price": 180000,
            "image": "https://images.pexels.com/photos/357756/pexels-photo-357756.jpeg",
            "description": "Set sushi 15 miếng đa dạng",
            "is_active": True
        }
    ]
    
    for food_data in sample_foods:
        db.session.add(Food(**food_data))

    db.session.commit()
    return jsonify({"message": "Seed dữ liệu thành công", "foods": len(sample_foods)})


# ============================================
# ROOT & ERROR HANDLERS
# ============================================
@app.get("/")
def index():
    return jsonify(
        {
            "name": "MTP Food API",
            "version": "2.0.0",
            "documentation": "https://github.com/mtp-food/docs",
            "endpoints": {
                "foods": "/api/foods",
                "bookings": "/api/bookings",
                "auth": "/api/auth/*",
                "ai": "/api/ai/chat",
                "stats": "/api/stats",
            },
        }
    )


@app.errorhandler(ValidationError)
def handle_validation_error(error: ValidationError):
    return jsonify({"error": error.messages}), 400


@app.errorhandler(404)
def not_found(_):
    return jsonify({"error": "Không tìm thấy tài nguyên"}), 404


@app.errorhandler(500)
def internal_error(e):
    print(f"Internal error: {e}")  
    return jsonify({"error": "Lỗi hệ thống"}), 500


# ============================================
# BOOTSTRAP - Tự động tạo database khi app start
# ============================================
def init_db():
    """Khởi tạo database tables (chạy khi app start, kể cả trên Render)"""
    with app.app_context():
        try:
            print(f"[DB] Đang khởi tạo database...")
            print(f"[DB] DATABASE_URL: {database_url[:50]}..." if len(database_url) > 50 else f"[DB] DATABASE_URL: {database_url}")
            db.create_all()
            print("[DB] ✅ Database tables đã được khởi tạo thành công")
        except Exception as e:
            print(f"[DB] ❌ Lỗi khởi tạo database: {e}")
            import traceback
            traceback.print_exc()

# Gọi init_db() khi module được import (chạy trên cả local và Render)
init_db()

# Thêm route để trigger init_db() nếu cần (cho admin)
@app.route("/api/init-db", methods=["GET", "POST"])
def trigger_init_db():
    """Route để trigger khởi tạo database (dùng khi cần)"""
    try:
        with app.app_context():
            db.create_all()
        return jsonify({"message": "Database tables đã được khởi tạo thành công"}), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    print("=" * 60)
    print(" MTP Food Backend Server (SQL + Auth + AI)")
    print("=" * 60)
    print(" http://localhost:5000")
    print(" Admin register: POST /api/auth/register")
    print(" AI Chat: POST /api/ai/chat")
    print("=" * 60)
    app.run(debug=True, host="127.0.0.1", port=5000)