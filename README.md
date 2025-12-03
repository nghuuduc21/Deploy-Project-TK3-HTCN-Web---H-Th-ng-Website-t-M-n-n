## MTP Food Platform

Hệ thống web cho nhà hàng cao cấp gồm:

- **Frontend tĩnh** (Bootstrap + JS) với landing page, quy trình đặt bàn, chatbot AI, dashboard quản trị.
- **Backend Flask + SQLAlchemy** cung cấp API cho món ăn, đặt bàn, thống kê, AI chat, xác thực JWT.
- **MySQL (hoặc SQLite)** thông qua SQLAlchemy ORM, hỗ trợ migrations (Flask-Migrate) và seed dữ liệu mẫu.
- **Triển khai Docker**: `api` (Flask), `db` (MySQL 8), `frontend` (Nginx), cấu hình qua `docker-compose.yml`.

### Chuẩn bị môi trường

```bash
python -m venv .venv
source .venv/bin/activate  # hoặc .venv\Scripts\activate
pip install -r backend/requirements.txt
```

Tạo file `.env` (tham khảo `env.sample`):

```
DATABASE_URL=mysql+pymysql://mtp:mtp123@localhost:3306/mtp_food
JWT_SECRET_KEY=change-me
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Khởi chạy backend:

```bash
cd backend
flask db upgrade  # nếu dùng MySQL
python app.py
```

Frontend nằm trong `frontend/html`. Có thể mở trực tiếp `index.html` hoặc phục vụ bằng bất kỳ static server nào.

### Chạy Docker Compose

```bash
docker compose up --build
# Frontend: http://localhost:8080
# Backend API: http://localhost:5000
# MySQL: port 3307 (map từ container 3306)
```

- `DATABASE_URL` trong `.env` được tự động trỏ đến dịch vụ `db`.
- Muốn dùng SQLite: cập nhật `DATABASE_URL=sqlite:///data/mtp_food.db`.

### Các endpoint chính

- `POST /api/auth/register` – tạo admin (chỉ tự do khi chưa có admin nào).
- `POST /api/auth/login` – trả JWT token cho trang quản trị.
- `CRUD /api/foods` – quản lý món ăn (cần Bearer token cho actions ghi).
- `CRUD /api/bookings` – tạo/duyệt/hủy đơn đặt bàn.
- `POST /api/ai/chat` – trợ lý AI (OpenAI nếu có key, fallback rule-based).
- `GET /api/stats` – thống kê tổng hợp, lịch đặt bàn sắp tới.

### Kiểm thử

```bash
cd backend
pytest
```

### Triển khai cloud gợi ý

1. Push image backend lên registry (GHCR, Docker Hub) và deploy trên Render/Railway/Fly.io.
2. Deploy frontend (thư mục `frontend`) lên Netlify/Vercel/S3 + CloudFront hoặc giữ trong Docker Nginx như compose.
3. Sử dụng dịch vụ MySQL managed (PlanetScale, Neon for MySQL, RDS) và cập nhật `DATABASE_URL`.
4. Cấu hình CI/CD (GitHub Actions) để chạy `pytest`, build image, deploy tự động.

### Tính năng nổi bật

- UI landing mới: bộ lọc menu, thống kê realtime, quy trình đặt bàn trực quan.
- Workflow đặt bàn: xác thực client-side, tổng quan giỏ hàng, timeline trạng thái, mã đơn trả về.
- Admin dashboard: đăng nhập JWT, quản lý món ăn + seed, duyệt đơn với các trạng thái `pending/confirmed/completed/cancelled`, quan sát timeline.
- Chatbot AI thật (OpenAI SDK) và logging hội thoại.
- Bộ Docker + compose giúp deploy nhanh cùng MySQL, cấu hình Nginx phục vụ frontend statics.

