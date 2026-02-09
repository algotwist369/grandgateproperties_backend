const express = require('express');
const router = express.Router();
const { signup, login, updateProfile, getProfile, logout, deleteUser, getAllUsers, updateUserStatus, updateUserRole, getDashboardStats } = require('../controller/user_controller');
const { protect, admin } = require('../middleware/authMiddleware');
const upload = require('../utils/uploadImage');

// Public routes
router.post('/signup', upload.single('profile_picture'), signup);
router.post('/login', login);

// Protected routes
router.get('/profile', protect, getProfile);
router.put('/profile', protect, upload.single('profile_picture'), updateProfile);
router.post('/logout', protect, logout);

// Admin routes
router.delete('/:id', protect, admin, deleteUser);
router.get('/', protect, admin, getAllUsers);
router.get('/stats', protect, getDashboardStats);
router.put('/:id/status', protect, admin, updateUserStatus);
router.put('/:id/role', protect, admin, updateUserRole);

module.exports = router;
