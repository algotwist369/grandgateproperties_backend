const express = require('express');
const router = express.Router();
const { getAgentProfile, updateAgentProfile, getAllAgents, getAgentBySlug, updateAgentStatus, addAgent } = require('../controller/agent_controller');
const { protect, admin } = require('../middleware/authMiddleware');
const upload = require('../utils/uploadImage');

// Protected routes (Agent/Admin)
router.get('/profile', protect, getAgentProfile);
router.put('/profile', protect, upload.single('avatar_url'), updateAgentProfile);

// Public routes
router.get('/', getAllAgents);
router.get('/:slug', getAgentBySlug);

// Admin routes
router.post('/', protect, admin, addAgent);
router.put('/:id', protect, admin, upload.single('avatar_url'), updateAgentProfile);
router.put('/:id/status', protect, admin, updateAgentStatus);

module.exports = router;
