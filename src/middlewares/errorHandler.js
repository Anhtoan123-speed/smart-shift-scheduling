/**
 * ==============================================================================
 * 2CE COFFEE ROASTERY · CENTRALIZED ERROR HANDLING MIDDLEWARE
 * ==============================================================================
 */

// Middleware xử lý lỗi tập trung cho toàn bộ ứng dụng Express
function errorHandler(err, req, res, next) {
  console.error('💥 [SERVER UNCAUGHT ERROR]', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Lỗi máy chủ nội bộ. Vui lòng thử lại sau.';

  return res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}

// Xử lý 404 Not Found cho các endpoint không tồn tại
function notFoundHandler(req, res, next) {
  return res.status(404).json({
    success: false,
    message: `Không tìm thấy tài nguyên API tại đường dẫn: ${req.method} ${req.originalUrl}`
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};

