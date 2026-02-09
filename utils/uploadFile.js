const multer = require('multer');
const path = require('path');

// Set memory storage for Cloudinary upload
const storage = multer.memoryStorage();

// Check file type
function checkFileType(file, cb) {
    // Allowed ext
    const filetypes = /jpeg|jpg|png|gif|webp|pdf/;
    // Check ext
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime
    const mimetype = filetypes.test(file.mimetype) || file.mimetype === 'application/pdf';

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb('Error: Images and PDFs Only!');
    }
}

// Init upload
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
});

module.exports = upload;
