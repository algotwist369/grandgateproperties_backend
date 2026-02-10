const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

const uploadToCloudinary = (buffer, folder, resourceType = 'auto') => {
    return new Promise((resolve, reject) => {
        if (!buffer) {
            return reject(new Error('No file buffer provided for Cloudinary upload'));
        }

        const stream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: resourceType,
                quality: 'auto:good',
                fetch_format: 'auto'
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );

        const readStream = streamifier.createReadStream(buffer);
        readStream.on('error', (err) => {
            console.error('Buffer read stream error:', err);
            reject(err);
        });
        readStream.pipe(stream);
    });
};

const deleteFromCloudinary = async (publicId) => {
    try {
        if (!publicId) return;
        return await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error('Cloudinary delete error:', error);
        return null;
    }
};

const getPublicIdFromUrl = (url) => {
    if (!url || !url.includes('cloudinary.com')) return null;

    const parts = url.split('/');
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex === -1) return null;

    // Join parts after "upload" (skipping version if present)
    const afterUpload = parts.slice(uploadIndex + 1);
    if (afterUpload[0].startsWith('v') && !isNaN(afterUpload[0].slice(1))) {
        afterUpload.shift();
    }

    const publicIdWithExt = afterUpload.join('/');
    return publicIdWithExt.split('.')[0];
};

module.exports = {
    uploadToCloudinary,
    deleteFromCloudinary,
    getPublicIdFromUrl
};
