// ============================================
// API CONFIG - Tự động detect environment
// ============================================
(function() {
    const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

    // Nếu đang chạy trên production (Netlify/Render), dùng API URL từ env hoặc hardcode
    // Nếu local, dùng localhost
    window.API_URL = isProduction 
        ? (window.API_URL || 'https://mtp-food-backend-2.onrender.com/api')
        : 'http://localhost:5000/api';

    window.BASE_URL = isProduction
        ? (window.BASE_URL || 'https://mtp-food-backend-2.onrender.com')
        : 'http://localhost:5000';
})();

