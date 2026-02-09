const jwt = require('jsonwebtoken');
const User = require('../model/user_model');

const protect = async (req, res, next) => {
    let token;

    // Check if token in headers
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }
    // Check if token in cookies
    else if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select('-password');
            next();
        } catch (error) {
            console.error(error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    } else {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

const admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(401).json({ message: 'Not authorized as an admin' });
    }
};

const adminOrAgent = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'agent')) {
        next();
    } else {
        res.status(401).json({ message: 'Not authorized as an admin or agent' });
    }
};

module.exports = { protect, admin, adminOrAgent };
