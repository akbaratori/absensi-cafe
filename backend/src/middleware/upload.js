const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadDir = 'uploads/others';
        if (req.originalUrl.includes('/attendance') || req.baseUrl.includes('/attendance')) {
            uploadDir = 'uploads/attendance';
        } else if (req.originalUrl.includes('/leaves') || req.baseUrl.includes('/leaves')) {
            uploadDir = 'uploads/leaves';
        }

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        let prefix = 'file';
        if (req.originalUrl.includes('/attendance') || req.baseUrl.includes('/attendance')) {
            prefix = 'attendance';
        } else if (req.originalUrl.includes('/leaves') || req.baseUrl.includes('/leaves')) {
            prefix = 'leave';
        }

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, prefix + '-' + uniqueSuffix + path.extname(file.originalname));
    },
});

// File filter (images only with enhanced validation)
const fileFilter = (req, file, cb) => {
    // List of allowed MIME types
    const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
    ];

    // List of allowed file extensions
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const fileExtension = path.extname(file.originalname).toLowerCase();

    // Check both MIME type and file extension
    if (
        allowedMimeTypes.includes(file.mimetype) &&
        allowedExtensions.includes(fileExtension)
    ) {
        cb(null, true);
    } else {
        cb(
            new Error(
                'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'
            ),
            false
        );
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
});

module.exports = upload;
