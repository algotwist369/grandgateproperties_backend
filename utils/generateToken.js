const jwt = require('jsonwebtoken');

const generateToken = (id) => {
    // TODO: Add JWT_SECRET and JWT_EXPIRE (e.g., '30d') to your .env file
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '30d',
    });
};

module.exports = generateToken;
