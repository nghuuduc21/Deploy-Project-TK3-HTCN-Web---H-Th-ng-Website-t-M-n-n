// ============================================
// CONFIG & STATE
// ============================================
// API_URL và BASE_URL được load từ config.js (phải load config.js trước)
const API_URL = window.API_URL || 'http://localhost:5000/api';
const BASE_URL = window.BASE_URL || 'http://localhost:5000';
let currentSection = 'dashboard';
let token = localStorage.getItem('mtp_admin_token') || '';
let adminProfile = JSON.parse(localStorage.getItem('mtp_admin_profile') || 'null');
let bookingsCache = [];
let currentBookingFilter = 'all';

// ============================================
// AUTH HELPERS
// ============================================
function setAuthState(isLoggedIn) {
    const authWrapper = document.getElementById('authWrapper');
    const appLayout = document.getElementById('appLayout');
    if (isLoggedIn) {
        authWrapper.style.display = 'none';
        appLayout.style.display = 'block';
        updateGreeting();
    } else {
        authWrapper.style.display = 'flex';
        appLayout.style.display = 'none';
    }
}

function updateGreeting() {
    const greeting = document.getElementById('adminGreeting');
    const sidebarStatus = document.getElementById('sidebarStatus');
    if (!adminProfile) return;
    greeting.textContent = `Xin chào, ${adminProfile.fullName}`;
    sidebarStatus.textContent = new Date().toLocaleTimeString('vi-VN');
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || 'Đăng nhập thất bại');
            return;
        }
        token = data.token;
        adminProfile = data.admin;
        localStorage.setItem('mtp_admin_token', token);
        localStorage.setItem('mtp_admin_profile', JSON.stringify(adminProfile));
        setAuthState(true);
        refreshData();
    } catch (error) {
        console.error(error);
        alert('Không thể đăng nhập, vui lòng thử lại.');
    }
}

// async function handleRegister(event) {
//     event.preventDefault();
//     const payload = {
//         fullName: document.getElementById('registerName').value.trim(),
//         email: document.getElementById('registerEmail').value.trim(),
//         password: document.getElementById('registerPassword').value
//     };
//     try {
//         const response = await fetch(`${API_URL}/auth/register`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
//             body: JSON.stringify(payload)
//         });
//         const data = await response.json();
//         if (!response.ok) {
//             alert(data.error || 'Không thể tạo admin');
//             return;
//         }
//         alert('Tạo admin thành công! Vui lòng đăng nhập.');
//         document.getElementById('registerForm').classList.add('d-none');
//     } catch (error) {
//         console.error(error);
//         alert('Có lỗi xảy ra.');
//     }
// }

async function handleRegister(event) {
    event.preventDefault();
    const payload = {
        fullName: document.getElementById('registerName').value.trim(),
        email: document.getElementById('registerEmail').value.trim(),
        password: document.getElementById('registerPassword').value
    };
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || 'Không thể tạo admin');
            return;
        }
        
        // FIX: Tự động login nếu là admin đầu tiên
        if (data.token && data.admin) {
            token = data.token;
            adminProfile = data.admin;
            localStorage.setItem('mtp_admin_token', token);
            localStorage.setItem('mtp_admin_profile', JSON.stringify(adminProfile));
            setAuthState(true);
            refreshData();
            alert('Tạo admin và đăng nhập thành công!');
        } else {
            alert('Tạo admin thành công! Vui lòng đăng nhập.');
        }
        
        document.getElementById('registerForm').classList.add('d-none');
    } catch (error) {
        console.error(error);
        alert('Có lỗi xảy ra.');
    }
}

function toggleRegisterPanel() {
    document.getElementById('registerForm').classList.toggle('d-none');
}

// Tạo admin mới từ modal trong dashboard (yêu cầu đã đăng nhập)
async function createAdminFromModal(event) {
    event.preventDefault();
    const payload = {
        fullName: document.getElementById('adminFullName').value.trim(),
        email: document.getElementById('adminEmail').value.trim(),
        password: document.getElementById('adminPassword').value
    };
    
    if (!payload.fullName || !payload.email || !payload.password) {
        alert('Vui lòng nhập đầy đủ thông tin');
        return;
    }
    
    try {
        const response = await apiFetch('/auth/register', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        if (!response.ok) {
            alert(data.error || 'Không thể tạo admin');
            return;
        }
        
        alert('Tạo admin mới thành công!');
        document.getElementById('adminForm').reset();
        const modal = bootstrap.Modal.getInstance(document.getElementById('adminModal'));
        if (modal) modal.hide();
    } catch (error) {
        console.error(error);
        alert('Có lỗi xảy ra khi tạo admin mới.');
    }
}

function logoutAdmin(silent = false) {
    token = '';
    adminProfile = null;
    localStorage.removeItem('mtp_admin_token');
    localStorage.removeItem('mtp_admin_profile');
    setAuthState(false);
    if (!silent) alert('Đã đăng xuất.');
}

async function apiFetch(endpoint, options = {}) {
    const config = {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    };
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`${API_URL}${endpoint}`, config);
    if (response.status === 401) {
        logoutAdmin(true);
        throw new Error('Unauthorized');
    }
    return response;
}

// ============================================
// NAVIGATION
// ============================================
function showSection(section, evt) {
    if (evt) evt.preventDefault();
    document.getElementById('dashboardSection').style.display = 'none';
    document.getElementById('foodsSection').style.display = 'none';
    document.getElementById('bookingsSection').style.display = 'none';
    
    document.getElementById(`${section}Section`).style.display = 'block';
    document.querySelectorAll('.sidebar .nav-link').forEach(link => link.classList.remove('active'));
    if (evt) evt.target.classList.add('active');
    currentSection = section;
    
    if (section === 'foods') loadFoods();
    if (section === 'bookings') renderBookings(currentBookingFilter);
}

function refreshData() {
    Promise.all([loadStats(), loadFoods(), loadBookings()]).catch(err => console.error(err));
}

// ============================================
// STATISTICS
// ============================================
async function loadStats() {
    try {
        const response = await apiFetch('/stats', { method: 'GET' });
        const stats = await response.json();
        document.getElementById('totalFoods').textContent = stats.totalFoods ?? 0;
        document.getElementById('totalBookings').textContent = stats.totalBookings ?? 0;
        document.getElementById('pendingBookings').textContent = stats.pendingBookings ?? 0;
        document.getElementById('totalRevenue').textContent = (stats.totalRevenue ?? 0).toLocaleString('vi-VN') + 'đ';
        
        const upcomingContainer = document.getElementById('adminUpcoming');
        if (stats.upcoming?.length) {
            upcomingContainer.innerHTML = stats.upcoming.map(item => `
                <div class="upcoming-card">
                    <strong>${item.guestName}</strong>
                    <span>${new Date(item.dateTime).toLocaleString('vi-VN')}</span>
                    <span>${item.guests} khách • ${item.status}</span>
                </div>
            `).join('');
        } else {
            upcomingContainer.innerHTML = '<span class="text-muted">Chưa có lịch</span>';
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ============================================
// FOODS MANAGEMENT
// ============================================
async function loadFoods() {
    try {
        const response = await fetch(`${API_URL}/foods`);
        const foods = await response.json();
        const tbody = document.getElementById('foodsTableBody');
        if (!foods.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">Chưa có món ăn nào</td>
                </tr>
            `;
            return;
        }
        tbody.innerHTML = foods.map(food => `
            <tr>
                <td>${food.id}</td>
                <td><img src="${food.image.startsWith('http') ? food.image : BASE_URL + food.image}" class="food-img-thumb" alt="${food.name}"></td>
                <td>${food.name}</td>
                <td class="text-cyan fw-bold">${food.price.toLocaleString('vi-VN')}đ</td>
                <td>${(food.description || 'Không có mô tả').substring(0, 40)}...</td>
                <td>
                    <button class="btn btn-warning-admin me-2" onclick="editFood(${food.id})">
                        Sửa
                    </button>
                    <button class="btn btn-danger-admin" onclick="deleteFood(${food.id})">
                        Xóa
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading foods:', error);
        alert('Không thể tải danh sách món ăn');
    }
}

function resetFoodForm() {
    document.getElementById('foodForm').reset();
    document.getElementById('foodId').value = '';
    document.getElementById('foodModalTitle').textContent = 'Thêm món mới';
    document.getElementById('imagePreview').style.display = 'none';
}

function previewImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('previewImg').src = e.target.result;
            document.getElementById('imagePreview').style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        document.getElementById('imagePreview').style.display = 'none';
    }
}

async function editFood(id) {
    try {
        const response = await fetch(`${API_URL}/foods/${id}`);
        if (!response.ok) throw new Error('Food not found');
        const food = await response.json();
        document.getElementById('foodId').value = food.id;
        document.getElementById('foodName').value = food.name;
        document.getElementById('foodPrice').value = food.price;
        document.getElementById('foodImage').value = ''; // Reset file input
        document.getElementById('foodDescription').value = food.description || '';
        document.getElementById('foodModalTitle').textContent = 'Sửa món ăn';
        
        // Hiển thị preview ảnh hiện tại
        if (food.image) {
            document.getElementById('previewImg').src = food.image.startsWith('http') 
                ? food.image 
                : BASE_URL + food.image;
            document.getElementById('imagePreview').style.display = 'block';
        } else {
            document.getElementById('imagePreview').style.display = 'none';
        }
        
        const modal = new bootstrap.Modal(document.getElementById('foodModal'));
        modal.show();
    } catch (error) {
        console.error(error);
        alert('Không thể tải thông tin món ăn');
    }
}

// async function saveFoodForm(event) {
//     event.preventDefault();
//     const id = document.getElementById('foodId').value;
//     const payload = {
//         name: document.getElementById('foodName').value.trim(),
//         price: parseInt(document.getElementById('foodPrice').value, 10),
//         image: document.getElementById('foodImage').value.trim(),
//         description: document.getElementById('foodDescription').value.trim()
//     };
//     const url = id ? `/foods/${id}` : '/foods';
//     const method = id ? 'PUT' : 'POST';
//     try {
//         const response = await apiFetch(url, {
//             method,
//             body: JSON.stringify(payload)
//         });
//         if (!response.ok) throw new Error('Save failed');
//         alert(id ? 'Cập nhật món ăn thành công!' : 'Thêm món ăn thành công!');
//         bootstrap.Modal.getInstance(document.getElementById('foodModal')).hide();
//         loadFoods();
//         loadStats();
//     } catch (error) {
//         console.error(error);
//         alert('Không thể lưu món ăn');
//     }
// }

async function saveFoodForm(event) {
    event.preventDefault();
    const id = document.getElementById('foodId').value;
    const imageFile = document.getElementById('foodImage').files[0];
    
    // Tạo FormData để upload file
    const formData = new FormData();
    formData.append('name', document.getElementById('foodName').value.trim());
    formData.append('price', parseInt(document.getElementById('foodPrice').value, 10));
    formData.append('description', document.getElementById('foodDescription').value.trim());
    formData.append('isActive', 'true');
    
    // Chỉ thêm file nếu có chọn ảnh mới
    if (imageFile) {
        formData.append('image', imageFile);
    } else if (!id) {
        // Nếu tạo mới mà không có ảnh
        alert('Vui lòng chọn ảnh cho món ăn');
        return;
    }
    
    const url = id ? `/foods/${id}` : '/foods';
    const method = id ? 'PUT' : 'POST';
    
    try {
        // Lấy token từ localStorage
        const token = localStorage.getItem('mtp_admin_token') || '';
        
        if (!token) {
            alert('Bạn cần đăng nhập để thực hiện thao tác này');
            return;
        }
        
        const response = await fetch(`${API_URL}${url}`, {
            method,
            headers: {
                'Authorization': `Bearer ${token}`
                // KHÔNG set Content-Type, browser sẽ tự set với boundary cho FormData
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            console.error('Error response:', data);
            alert('Lỗi: ' + JSON.stringify(data.error || data));
            return;
        }
        
        alert(id ? 'Cập nhật món ăn thành công!' : 'Thêm món ăn thành công!');
        bootstrap.Modal.getInstance(document.getElementById('foodModal')).hide();
        loadFoods();
        loadStats();
    } catch (error) {
        console.error('Caught error:', error);
        alert('Không thể lưu món ăn: ' + error.message);
    }
}

async function deleteFood(id) {
    if (!confirm('Bạn có chắc muốn xóa món này?')) return;
    try {
        const response = await apiFetch(`/foods/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Delete failed');
        alert('Xóa món ăn thành công!');
        loadFoods();
        loadStats();
    } catch (error) {
        console.error(error);
        alert('Không thể xóa món ăn');
    }
}

async function seedFoods() {
    if (!confirm('Seed dữ liệu mẫu?')) return;
    try {
        const response = await apiFetch('/seed', { method: 'POST' });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || 'Không thể seed');
            return;
        }
        alert(data.message || 'Seed thành công');
        loadFoods();
    } catch (error) {
        console.error(error);
        alert('Không thể seed dữ liệu');
    }
}

// ============================================
// BOOKINGS MANAGEMENT
// ============================================
// async function loadBookings() {
//     try {
//         const response = await fetch(`${API_URL}/bookings`);
//         bookingsCache = await response.json();
//         renderBookings(currentBookingFilter);
//         loadStats();
//     } catch (error) {
//         console.error('Error loading bookings:', error);
//         alert('Không thể tải danh sách đặt bàn');
//     }
// }
async function loadBookings() {
    try {
        const response = await fetch(`${API_URL}/bookings`);  // FIX: Bỏ apiFetch, dùng fetch trực tiếp
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        bookingsCache = await response.json();
        renderBookings(currentBookingFilter);
        loadStats();
    } catch (error) {
        console.error('Error loading bookings:', error);
        document.getElementById('bookingsList').innerHTML = `
            <div class="alert alert-danger">
                Không thể tải danh sách đặt bàn. Vui lòng kiểm tra kết nối.
            </div>
        `;
    }
}

function renderBookings(filter = 'all') {
    currentBookingFilter = filter;
    const container = document.getElementById('bookingsList');
    let list = bookingsCache;
    if (filter !== 'all') {
        list = bookingsCache.filter(booking => booking.status === filter);
    }
    document.querySelectorAll('#bookingsSection .filter-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.status === filter);
    });
    
    if (!list.length) {
        container.innerHTML = `
            <div class="text-center text-muted">
                <p>Không có đơn nào trong bộ lọc này</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = list.map(booking => `
        <div class="booking-card">
            <div class="row">
                <div class="col-md-8">
                    <h5>${booking.customerInfo.name}</h5>
                    <div class="booking-info"><strong>Điện thoại:</strong> ${booking.customerInfo.phone}</div>
                    <div class="booking-info"><strong>Email:</strong> ${booking.customerInfo.email}</div>
                    <div class="booking-info"><strong>Số người:</strong> ${booking.booking.guests} người</div>
                    <div class="booking-info"><strong>Thời gian:</strong> ${new Date(booking.booking.dateTime).toLocaleString('vi-VN')}</div>
                    ${booking.booking.note ? `<div class="booking-info"><strong>Ghi chú:</strong> <em>${booking.booking.note}</em></div>` : ''}
                    
                    <div class="mt-3">
                        <strong>Món đã đặt:</strong>
                        <ul class="mb-0 mt-2">
                            ${booking.orders.map(order => `
                                <li>${order.name} x${order.quantity} - ${order.price.toLocaleString('vi-VN')}đ</li>
                            `).join('')}
                        </ul>
                    </div>
                    
                    <div class="timeline mt-3">
                        ${(booking.statusTimeline || []).map(step => `
                            <span class="timeline-item">
                                <strong>${step.label}</strong>
                                <small>${new Date(step.time).toLocaleString('vi-VN')}</small>
                            </span>
                        `).join('')}
                    </div>
                </div>
                <div class="col-md-4 text-end">
                    <span class="booking-status status-${booking.status}">
                        ${booking.statusLabel || booking.status}
                    </span>
                    <div class="booking-total">
                        ${(booking.totalAmount || 0).toLocaleString('vi-VN')}đ
                    </div>
                    ${renderBookingActions(booking)}
                </div>
            </div>
        </div>
    `).join('');
}

function renderBookingActions(booking) {
    if (booking.status === 'pending') {
        return `
            <button class="btn btn-success-admin mt-3" onclick="updateBookingStatus('${booking.id}', 'confirmed')">
                Xác nhận
            </button>
            <button class="btn btn-danger-admin mt-3 ms-2" onclick="updateBookingStatus('${booking.id}', 'cancelled')">
                Hủy
            </button>
        `;
    }
    if (booking.status === 'confirmed') {
        return `
            <button class="btn btn-success-admin mt-3" onclick="updateBookingStatus('${booking.id}', 'completed')">
                Hoàn tất
            </button>
            <button class="btn btn-danger-admin mt-3 ms-2" onclick="updateBookingStatus('${booking.id}', 'cancelled')">
                Hủy
            </button>
        `;
    }
    return '';
}

async function updateBookingStatus(id, status) {
    if (!confirm(`Cập nhật trạng thái đơn ${id} sang ${status}?`)) return;
    try {
        const response = await apiFetch(`/bookings/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
        if (!response.ok) throw new Error('Update failed');
        alert('Cập nhật trạng thái thành công!');
        loadBookings();
    } catch (error) {
        console.error(error);
        alert('Không thể cập nhật trạng thái');
    }
}

function filterBookings(status) {
    renderBookings(status);
}

// ============================================
// INIT
// ============================================
window.addEventListener('DOMContentLoaded', () => {
    if (token && adminProfile) {
        setAuthState(true);
        refreshData();
    } else {
        setAuthState(false);
    }
});

