// ============================================
// CONFIG
// ============================================
// API_URL và BASE_URL được load từ config.js (phải load config.js trước)
const API_URL = window.API_URL || 'http://localhost:5000/api';
const BASE_URL = window.BASE_URL || 'http://localhost:5000';
let currentFood = null;
let quantity = 1;
let allFoods = [];

// ============================================
// LOAD FOOD DETAIL
// ============================================
async function loadFoodDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const foodId = parseInt(urlParams.get('id'));
    
    if (!foodId) {
        showError();
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/foods`);
        allFoods = await response.json();
        
        currentFood = allFoods.find(f => f.id === foodId);
        
        if (!currentFood) {
            showError();
            return;
        }
        
        displayFood();
        displayRelatedFoods();
        
    } catch (error) {
        console.error('Error:', error);
        showError();
    }
}

// ============================================
// DISPLAY FOOD
// ============================================
function displayFood() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('foodDetail').style.display = 'block';
    
    document.getElementById('foodName').textContent = currentFood.name;
    document.getElementById('breadcrumbName').textContent = currentFood.name;
    document.getElementById('foodImage').src = currentFood.image.startsWith('http') ? currentFood.image : BASE_URL + currentFood.image;
    document.getElementById('foodImage').alt = currentFood.name;
    document.getElementById('foodPrice').textContent = currentFood.price.toLocaleString('vi-VN') + 'đ';
    
    const description = currentFood.description || 'Món ăn ngon, chất lượng cao với nguyên liệu tươi sạch được chế biến bởi đầu bếp chuyên nghiệp. Đảm bảo vệ sinh an toàn thực phẩm và hương vị đặc trưng.';
    document.getElementById('foodDescription').textContent = description;
    
    document.title = `${currentFood.name} - MTP Food`;
}

// ============================================
// DISPLAY RELATED FOODS
// ============================================
function displayRelatedFoods() {
    const related = allFoods.filter(f => f.id !== currentFood.id).slice(0, 3);
    
    const html = related.map(food => `
        <div class="col-md-4">
            <div class="related-card" onclick="goToFood(${food.id})">
                <img src="${food.image}" alt="${food.name}">
                <div class="related-card-body">
                    <h6 class="related-card-title">${food.name}</h6>
                    <div class="related-card-price">${food.price.toLocaleString('vi-VN')}đ</div>
                </div>
            </div>
        </div>
    `).join('');
    
    document.getElementById('relatedFoods').innerHTML = html;
}

// ============================================
// QUANTITY CONTROL
// ============================================
function changeQuantity(delta) {
    quantity = Math.max(1, Math.min(10, quantity + delta));
    document.getElementById('quantity').textContent = quantity;
}

// ============================================
// ADD TO CART
// ============================================
function addToCart() {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    
    for (let i = 0; i < quantity; i++) {
        cart.push({
            ...currentFood,
            cartId: Date.now() + i
        });
    }
    
    localStorage.setItem('cart', JSON.stringify(cart));
    
    // Show success notification
    showNotification(`Đã thêm ${quantity} ${currentFood.name} vào giỏ hàng`);
    
    // Redirect to home page after 1.5 seconds
    setTimeout(() => {
        window.location.href = 'index.html#booking';
    }, 1500);
}

// ============================================
// NAVIGATION
// ============================================
function goToFood(id) {
    window.location.href = `food-detail.html?id=${id}`;
}

// ============================================
// ERROR STATE
// ============================================
function showError() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
}

// ============================================
// NOTIFICATION
// ============================================
function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        padding: 15px 30px;
        border-radius: 50px;
        font-weight: 600;
        z-index: 9999;
        box-shadow: 0 10px 40px rgba(16, 185, 129, 0.4);
        animation: slideDown 0.3s ease-out;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 1500);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }
    
    @keyframes slideUp {
        from {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        to {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
        }
    }
`;
document.head.appendChild(style);

// ============================================
// INIT
// ============================================
window.addEventListener('DOMContentLoaded', loadFoodDetail);