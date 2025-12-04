// ============================================
// CONFIG
// ============================================
// API_URL và BASE_URL được load từ config.js (phải load config.js trước)
const API_URL = window.API_URL || 'http://localhost:5000/api';
const BASE_URL = window.BASE_URL || 'http://localhost:5000';
const VEGAN_KEYWORDS = ['salad', 'rau', 'vegan', 'healthy', 'chay', 'organic', 'sushi'];
let cart = [];
let allFoods = [];
let filteredFoods = [];
let filterState = { search: '', filter: 'all' };
let chatSessionId = localStorage.getItem('mtp_chat_session') || null;

// document.addEventListener('DOMContentLoaded', () => {
//     const chatContainer = document.getElementById('chatbotContainer');
//     if (chatContainer) {
//         chatContainer.addEventListener('click', (e) => {
//             e.stopPropagation();
//         }, true);
//     }
// });
// Ngăn Live Server auto reload khi đang chat

// ============================================
// LOAD FOODS FROM BACKEND
// ============================================
async function loadFoods() {
    try {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('menuGrid').style.display = 'none';
        document.getElementById('emptyState').style.display = 'none';
        
        const response = await fetch(`${API_URL}/foods`);
        allFoods = await response.json();
        filteredFoods = [...allFoods];
        
        document.getElementById('loading').style.display = 'none';
        applyFilters();
    } catch (error) {
        console.error('Error loading foods:', error);
        document.getElementById('loading').innerHTML = `
            <h5 class="text-danger">Không thể kết nối Backend</h5>
            <p class="text-muted">Vui lòng khởi động Flask server</p>
            <button class="btn btn-primary-custom" onclick="loadFoods()">Thử lại</button>
        `;
    }
}

// ============================================
// DISPLAY FOODS
// ============================================
function displayFoods(foods) {
    const grid = document.getElementById('menuGrid');
    const emptyState = document.getElementById('emptyState');
    
    if (!foods.length) {
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        emptyState.querySelector('h4').textContent = allFoods.length === 0
            ? 'Chưa có món ăn nào'
            : 'Không tìm thấy món phù hợp';
        emptyState.querySelector('p').textContent = allFoods.length === 0
            ? 'Vui lòng thêm món từ trang quản trị'
            : 'Hãy thử từ khóa khác hoặc chọn lại bộ lọc';
        return;
    }
    
    emptyState.style.display = 'none';
    grid.style.display = 'flex';
    grid.innerHTML = foods.map(food => `
        <div class="col-md-4 col-sm-6 mb-4">
                <div class="card menu-card" onclick="event.stopPropagation(); viewFoodDetail(${food.id}, event);">
                <img src="${food.image.startsWith('http') ? food.image : BASE_URL + food.image}" class="card-img-top" alt="${food.name}">
                <div class="card-body">
                    <h5 class="card-title">${food.name}</h5>
                    <p class="card-text">${food.description || 'Món ăn ngon, chất lượng cao'}</p>
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="price">${food.price.toLocaleString('vi-VN')}đ</span>
                        <button class="btn btn-add-cart" 
                                onclick="event.stopPropagation(); addToCart(${food.id})">
                            Thêm vào giỏ
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function applyFilters() {
    if (!allFoods.length) {
        displayFoods([]);
        return;
    }
    
    const keyword = filterState.search.trim().toLowerCase();
    filteredFoods = allFoods.filter(food => {
        const searchMatch = !keyword ||
            food.name.toLowerCase().includes(keyword) ||
            (food.description || '').toLowerCase().includes(keyword);
        const filterMatch = matchFilter(food, filterState.filter);
        return searchMatch && filterMatch;
    });
    
    displayFoods(filteredFoods);
}

function matchFilter(food, filter) {
    if (filter === 'premium') {
        return food.price >= 300000;
    }
    if (filter === 'under200') {
        return food.price <= 200000;
    }
    if (filter === 'vegan') {
        const desc = (food.description || '').toLowerCase();
        return VEGAN_KEYWORDS.some(keyword => desc.includes(keyword));
    }
    return true;
}

// ============================================
// DASHBOARD STATS
// ============================================
// async function loadStats() {
//     try {
//         const response = await fetch(`${API_URL}/stats`);
//         if (!response.ok) throw new Error('Cannot load stats');
//         const data = await response.json();
        
//         document.getElementById('statTotalFoods').textContent = data.totalFoods ?? 0;
//         document.getElementById('statTotalBookings').textContent = data.totalBookings ?? 0;
//         document.getElementById('statPending').textContent = data.pendingBookings ?? 0;
//         document.getElementById('statRevenue').textContent = (data.totalRevenue ?? 0).toLocaleString('vi-VN') + 'đ';
        
//         renderUpcomingBookings(data.upcoming || []);
//     } catch (error) {
//         console.error('Error loading stats:', error);
//     }
// }

async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/stats`);
        if (!response.ok) throw new Error('Cannot load stats');
        const data = await response.json();
        
        // FIX: Kiểm tra element có tồn tại trước khi set textContent
        const statTotalFoods = document.getElementById('statTotalFoods');
        const statTotalBookings = document.getElementById('statTotalBookings');
        const statPending = document.getElementById('statPending');
        const statRevenue = document.getElementById('statRevenue');
        
        if (statTotalFoods) statTotalFoods.textContent = data.totalFoods ?? 0;
        if (statTotalBookings) statTotalBookings.textContent = data.totalBookings ?? 0;
        if (statPending) statPending.textContent = data.pendingBookings ?? 0;
        if (statRevenue) statRevenue.textContent = (data.totalRevenue ?? 0).toLocaleString('vi-VN') + 'đ';
        
        renderUpcomingBookings(data.upcoming || []);
    } catch (error) {
        console.error('Error loading stats:', error);
        // Không hiển thị lỗi nếu đang ở trang không có stats section
    }
}

// function renderUpcomingBookings(list) {
//     const container = document.getElementById('upcomingBookings');
//     if (!container) return;
    
//     if (!list.length) {
//         container.innerHTML = '<span class="text-muted">Chưa có lịch hẹn nào</span>';
//         return;
//     }
    
//     container.innerHTML = list.map(item => `
//         <div class="upcoming-card">
//             <strong>${item.guestName}</strong>
//             <span>${new Date(item.dateTime).toLocaleString('vi-VN')}</span>
//             <span>${item.guests} khách • ${item.status}</span>
//         </div>
//     `).join('');
// }

function renderUpcomingBookings(list) {
    const container = document.getElementById('upcomingBookings');
    if (!container) return;  // FIX: Thoát nếu không có element
    
    if (!list.length) {
        container.innerHTML = '<span class="text-muted">Chưa có lịch hẹn nào</span>';
        return;
    }
    
    container.innerHTML = list.map(item => `
        <div class="upcoming-card">
            <strong>${item.guestName}</strong>
            <span>${new Date(item.dateTime).toLocaleString('vi-VN')}</span>
            <span>${item.guests} khách • ${item.status}</span>
        </div>
    `).join('');
}

// ============================================
// CART FUNCTIONS
// ============================================
function addToCart(foodId) {
    const food = allFoods.find(f => f.id === foodId);
    if (!food) return;
    
    cart.push({...food, cartId: Date.now()});
    updateCartUI();
    showNotification(`Đã thêm ${food.name} vào giỏ hàng`);
}

function removeFromCart(cartId) {
    cart = cart.filter(item => item.cartId !== cartId);
    updateCartUI();
    renderCartModal();
}

function updateQuantity(cartId, delta) {
    const index = cart.findIndex(item => item.cartId === cartId);
    if (index === -1) return;
    
    const item = cart[index];
    
    if (delta > 0) {
        // Thêm một item mới với cùng foodId
        cart.push({...item, cartId: Date.now()});
    } else {
        const sameItems = cart.filter(i => i.id === item.id);
        if (sameItems.length > 1) {
            const toRemove = sameItems[0];
            cart = cart.filter(i => i.cartId !== toRemove.cartId);
        } else {
            cart.splice(index, 1);
        }
    }
    
    updateCartUI();
    renderCartModal();
}

function updateCartUI() {
    const badge = document.getElementById('cartBadge');
    const cartSummary = document.getElementById('cartSummary');
    const cartSummaryPreview = document.getElementById('cartSummaryPreview');
    const totalPrice = document.getElementById('totalPrice');
    const bookingMeta = document.getElementById('bookingMeta');
    
    // Update badge
    if (cart.length > 0) {
        badge.style.display = 'flex';
        badge.textContent = cart.length;
    } else {
        badge.style.display = 'none';
    }
    
    // Update summary in booking form
    if (cart.length === 0) {
        cartSummary.innerHTML = '<p class="text-muted">Chưa có món nào trong giỏ hàng</p>';
        if (cartSummaryPreview) {
            cartSummaryPreview.innerHTML = '<p class="text-muted">Chưa có món nào trong giỏ hàng</p>';
        }
        totalPrice.textContent = '0đ';
        return;
    }
    const grouped = groupCartItems();
    
    let html = '';
    let total = 0;
    
    Object.values(grouped).forEach(item => {
        total += item.subtotal;
        html += `
            <div class="cart-summary-item">
                <span>${item.name} x${item.quantity}</span>
                <span class="text-cyan">${item.subtotal.toLocaleString('vi-VN')}đ</span>
            </div>
        `;
    });
    
    cartSummary.innerHTML = html;
    if (cartSummaryPreview) {
        cartSummaryPreview.innerHTML = html;
    }
    totalPrice.textContent = total.toLocaleString('vi-VN') + 'đ';
    
    if (bookingMeta) {
        bookingMeta.innerHTML = `
            <strong>${Object.keys(grouped).length} món • ${cart.length} phần</strong>
            <p class="text-muted mb-0">Tổng tạm tính: ${total.toLocaleString('vi-VN')}đ (chưa bao gồm VAT)</p>
        `;
    }
}

function groupCartItems() {
    const grouped = {};
    cart.forEach(item => {
        if (grouped[item.id]) {
            grouped[item.id].quantity++;
            grouped[item.id].subtotal += item.price;
        } else {
            grouped[item.id] = {
                ...item,
                quantity: 1,
                subtotal: item.price
            };
        }
    });
    return grouped;
}

// ============================================
// CART MODAL
// ============================================
function openCartModal() {
    renderCartModal();
    const modal = new bootstrap.Modal(document.getElementById('cartModal'));
    modal.show();
}

function renderCartModal() {
    const cartItems = document.getElementById('cartItems');
    const cartTotalPrice = document.getElementById('cartTotalPrice');
    
    if (cart.length === 0) {
        cartItems.innerHTML = '<p class="text-center text-muted">Giỏ hàng trống</p>';
        cartTotalPrice.textContent = '0đ';
        return;
    }
    
    const grouped = groupCartItems();
    
    let total = 0;
    let html = '';
    
    Object.values(grouped).forEach(group => {
        total += group.subtotal;
        
        html += `
            <div class="cart-item">
                <img src="${group.image}" alt="${group.name}">
                <div class="cart-item-info">
                    <h5>${group.name}</h5>
                    <div class="cart-item-price">${group.price.toLocaleString('vi-VN')}đ</div>
                    <div class="quantity-control">
                        <button class="quantity-btn" onclick="updateQuantity(${group.cartId}, -1)">-</button>
                        <span class="quantity-display">${group.quantity}</span>
                        <button class="quantity-btn" onclick="updateQuantity(${group.cartId}, 1)">+</button>
                        <button class="btn-remove" onclick="removeAllItems(${group.id})">Xóa</button>
                    </div>
                </div>
                <div class="text-end">
                    <div class="cart-item-price">${group.subtotal.toLocaleString('vi-VN')}đ</div>
                </div>
            </div>
        `;
    });
    
    cartItems.innerHTML = html;
    cartTotalPrice.textContent = total.toLocaleString('vi-VN') + 'đ';
}

function removeAllItems(foodId) {
    cart = cart.filter(item => item.id !== foodId);
    updateCartUI();
    renderCartModal();
    showNotification('Đã xóa món khỏi giỏ hàng');
}

function goToBooking() {
    bootstrap.Modal.getInstance(document.getElementById('cartModal')).hide();
    
    // Scroll to booking section
    document.getElementById('booking').scrollIntoView({ behavior: 'smooth' });
    
    // Open booking modal after scroll
    setTimeout(() => {
        const bookingModal = new bootstrap.Modal(document.getElementById('bookingModal'));
        bookingModal.show();
    }, 500);
}

// ============================================
// FORM VALIDATION
// ============================================
function validateName() {
    const input = document.getElementById('customerName');
    const error = document.getElementById('errorName');
    const regex = /^[a-zA-ZÀ-ỹ\s]{2,50}$/;
    
    if (!regex.test(input.value.trim())) {
        error.textContent = 'Họ tên phải từ 2-50 ký tự, chỉ chứa chữ cái';
        error.classList.add('show');
        return false;
    }
    
    error.classList.remove('show');
    return true;
}

function validatePhone() {
    const input = document.getElementById('customerPhone');
    const error = document.getElementById('errorPhone');
    const regex = /^0[0-9]{9}$/;
    
    if (!regex.test(input.value.trim())) {
        error.textContent = 'Số điện thoại phải có 10 số, bắt đầu bằng 0';
        error.classList.add('show');
        return false;
    }
    
    error.classList.remove('show');
    return true;
}

function validateEmail() {
    const input = document.getElementById('customerEmail');
    const error = document.getElementById('errorEmail');
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!regex.test(input.value.trim())) {
        error.textContent = 'Email không hợp lệ (vd: example@gmail.com)';
        error.classList.add('show');
        return false;
    }
    
    error.classList.remove('show');
    return true;
}

function validateGuests() {
    const input = document.getElementById('guestCount');
    const error = document.getElementById('errorGuests');
    const value = parseInt(input.value);
    
    if (isNaN(value) || value < 1 || value > 20) {
        error.textContent = 'Số người phải từ 1-20';
        error.classList.add('show');
        return false;
    }
    
    error.classList.remove('show');
    return true;
}

function validateDateTime() {
    const input = document.getElementById('bookingDateTime');
    const error = document.getElementById('errorDateTime');
    const selectedDate = new Date(input.value);
    const now = new Date();
    
    if (!input.value) {
        error.textContent = 'Vui lòng chọn ngày giờ';
        error.classList.add('show');
        return false;
    }
    
    if (selectedDate < now) {
        error.textContent = 'Không thể đặt bàn trong quá khứ';
        error.classList.add('show');
        return false;
    }
    
    error.classList.remove('show');
    return true;
}

// ============================================
// SUBMIT BOOKING
// ============================================
async function submitBooking(event) {
    event.preventDefault();
    
    // Validate all fields
    const isNameValid = validateName();
    const isPhoneValid = validatePhone();
    const isEmailValid = validateEmail();
    const isGuestsValid = validateGuests();
    const isDateTimeValid = validateDateTime();
    
    if (!isNameValid || !isPhoneValid || !isEmailValid || !isGuestsValid || !isDateTimeValid) {
        showNotification('Vui lòng kiểm tra lại thông tin', 'danger');
        return false;
    }
    
    if (cart.length === 0) {
        showNotification('Vui lòng chọn ít nhất một món', 'warning');
        return false;
    }
    
    const groupedItems = groupCartItems();
    const orders = Object.values(groupedItems).map(item => ({
        foodId: item.id,
        quantity: item.quantity
    }));
    
    const booking = {
        customerInfo: {
            name: document.getElementById('customerName').value.trim(),
            phone: document.getElementById('customerPhone').value.trim(),
            email: document.getElementById('customerEmail').value.trim()
        },
        booking: {
            guests: parseInt(document.getElementById('guestCount').value),
            dateTime: document.getElementById('bookingDateTime').value,
            note: document.getElementById('bookingNote').value.trim()
        },
        orders
    };
    
    try {
        const response = await fetch(`${API_URL}/bookings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(booking)
        });
        
        const data = await response.json();
        if (response.ok) {
            displayBookingSuccess(data);
        } else {
            showNotification('Có lỗi xảy ra, vui lòng thử lại', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Không thể kết nối server', 'danger');
    }
    
    return false;
}

// ============================================
// CHATBOT
// ============================================
// function toggleChatbot() {
//     const widget = document.getElementById('chatbotWidget');
//     widget.style.display = widget.style.display === 'none' || !widget.style.display ? 'flex' : 'none';
// }
function toggleChatbot(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    const widget = document.getElementById('chatbotWidget');
    if (!widget) return false;
    
    if (widget.style.display === 'none' || !widget.style.display) {
        widget.style.display = 'flex';
    } else {
        widget.style.display = 'none';
    }
    
    return false;
}

// async function sendMessage() {
//     const input = document.getElementById('chatInput');
//     const message = input.value.trim();
    
//     if (!message) return;
    
//     // Add user message
//     addChatMessage(message, 'user');
//     input.value = '';
    
//     // Get AI response
//     try {
//         const response = await fetch(`${API_URL}/ai/chat`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ message, foods: allFoods, sessionId: chatSessionId })
//         });
        
//         const data = await response.json();
//         if (data.sessionId) {
//             chatSessionId = data.sessionId;
//             localStorage.setItem('mtp_chat_session', chatSessionId);
//         }
//         addChatMessage(data.response || 'Xin cảm ơn bạn!', 'bot');
//     } catch (error) {
//         addChatMessage('Xin lỗi, tôi đang gặp sự cố. Vui lòng thử lại sau.', 'bot');
//     }
// }

async function sendMessage(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    const input = document.getElementById('chatInput');
    if (!input) return false;
    
    const message = input.value.trim();
    if (!message) return false;
    
    addChatMessage(message, 'user');
    input.value = '';
    
    try {
        const response = await fetch(`${API_URL}/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message, 
                foods: allFoods, 
                sessionId: chatSessionId 
            })
        });
        
        const data = await response.json();
        
        if (data.sessionId) {
            chatSessionId = data.sessionId;
            localStorage.setItem('mtp_chat_session', chatSessionId);
        }
        
        addChatMessage(data.response || 'Xin cảm ơn bạn!', 'bot');
    } catch (error) {
        console.error('Chat error:', error);
        addChatMessage('Xin lỗi, tôi đang gặp sự cố. Vui lòng thử lại sau.', 'bot');
    }
    console.log('API data:', data);
    return false;
}

// function addChatMessage(text, sender) {
//     const messagesDiv = document.getElementById('chatMessages');
//     const messageDiv = document.createElement('div');
//     messageDiv.className = `chat-message ${sender}`;
//     messageDiv.textContent = text;
//     messagesDiv.appendChild(messageDiv);
//     messagesDiv.scrollTop = messagesDiv.scrollHeight;
// }

function addChatMessage(text, sender) {
    const messagesDiv = document.getElementById('chatMessages');
    if (!messagesDiv) return; // FIX: Kiểm tra element tồn tại
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;
    messageDiv.textContent = text;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ============================================
// FOOD DETAIL
// ============================================
// function viewFoodDetail(foodId) {
//     // Redirect to detail page (you need to create food-detail.html)
//     window.location.href = `food-detail.html?id=${foodId}`;
// }
function viewFoodDetail(foodId, event) {
    // Ngăn chặn nếu click từ chatbot
    if (event) {
        const target = event.target;
        if (target.closest('#chatbotContainer') || target.closest('.chatbot-widget')) {
            return false;
        }
    }
    
    window.location.href = `food-detail.html?id=${foodId}`;
}
// ============================================
// UTILITY
// ============================================
function showNotification(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} position-fixed top-0 start-50 translate-middle-x mt-3`;
    toast.style.zIndex = '9999';
    toast.style.minWidth = '300px';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

function displayBookingSuccess(data) {
    const successMessage = document.getElementById('successMessage');
    const codeDisplay = document.getElementById('bookingCodeDisplay');
    
    document.getElementById('bookingForm').reset();
    cart = [];
    updateCartUI();
    setProcessStep(3);
    
    if (codeDisplay) {
        codeDisplay.textContent = data?.id ? `Mã đặt bàn: ${data.id}` : '';
    }
    
    successMessage.style.display = 'block';
    showNotification('Đặt bàn thành công! Chúng tôi sẽ liên hệ trong ít phút.', 'success');
    
    setTimeout(() => {
        successMessage.style.display = 'none';
        setProcessStep(0);
    }, 6000);
}

function setProcessStep(activeIndex) {
    document.querySelectorAll('.process-step').forEach((step, index) => {
        step.classList.toggle('active', index === activeIndex);
        step.classList.toggle('completed', index < activeIndex);
    });
}

function initFilters() {
    const searchInput = document.getElementById('menuSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (event) => {
            filterState.search = event.target.value;
            applyFilters();
        });
    }
    
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filterState.filter = chip.dataset.filter;
            applyFilters();
        });
    });
}

function initBookingDateField() {
    const picker = document.getElementById('bookingDateTime');
    if (!picker) return;
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    picker.min = now.toISOString().slice(0, 16);
}

// ============================================
// INIT
// ============================================
// window.addEventListener('DOMContentLoaded', () => {
//     loadFoods();
//     loadStats();
//     initFilters();
//     initBookingDateField();
//     setProcessStep(0);
    
//     const savedCart = localStorage.getItem('cart');
//     if (savedCart) {
//         try {
//             cart = JSON.parse(savedCart);
//             updateCartUI();
//         } catch (e) {
//             console.error('Error loading cart:', e);
//         }
//     }
// });

// // Save cart to localStorage before leaving
// window.addEventListener('beforeunload', () => {
//     localStorage.setItem('cart', JSON.stringify(cart));
// });

// ============================================
// INIT
// ============================================
window.addEventListener('DOMContentLoaded', () => {
    loadFoods();
    
    if (document.getElementById('statTotalFoods')) {
        loadStats();
    }
    
    initFilters();
    initBookingDateField();
    setProcessStep(0);
    
    // Setup chatbot - QUAN TRỌNG: Ngăn chặn mọi submit
    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');
    const toggleChatBtn = document.getElementById('toggleChatBtn');
    const closeChatBtn = document.getElementById('closeChatBtn');
    
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                sendMessage(e);
                return false;
            }
        });
        
        // Ngăn form submit khi focus vào input
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        });
    }
    
    if (sendChatBtn) {
        sendChatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            sendMessage(e);
            return false;
        });
    }
    
    if (toggleChatBtn) {
        toggleChatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleChatbot(e);
            return false;
        });
    }
    
    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleChatbot(e);
            return false;
        });
    }
    
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
        try {
            cart = JSON.parse(savedCart);
            updateCartUI();
        } catch (e) {
            console.error('Error loading cart:', e);
        }
    }
});

window.addEventListener('beforeunload', () => {
    localStorage.setItem('cart', JSON.stringify(cart));
});