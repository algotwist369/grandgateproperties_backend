const express = require('express');
const router = express.Router();
const {
    createProperty,
    getAllProperties,
    getPropertyBySlug,
    updateProperty,
    deleteProperty,
    assignAgentsToProperty,
    updatePropertyStatus
} = require('../controller/property_controller');
const { protect, admin, adminOrAgent } = require('../middleware/authMiddleware');
const upload = require('../utils/uploadFile');

// Multer configuration for multiple fields
const cpUpload = upload.fields([
    { name: 'hero_image', maxCount: 1 },
    { name: 'gallery', maxCount: 20 },
    { name: 'brochure_pdfs', maxCount: 5 }
]);

// Public routes
router.get('/', getAllProperties);
router.get('/:slug', getPropertyBySlug);

// Protected routes (Admin/Agent)
router.post('/', protect, adminOrAgent, cpUpload, createProperty);
router.put('/:id', protect, adminOrAgent, cpUpload, updateProperty);
router.put('/:id/agents', protect, adminOrAgent, assignAgentsToProperty);
router.put('/:id/status', protect, adminOrAgent, updatePropertyStatus);

// Admin only
router.delete('/:id', protect, admin, deleteProperty);

module.exports = router;
