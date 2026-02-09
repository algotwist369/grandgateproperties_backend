const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    user_name: {
        type: String,
        required: true,
        trim: true
    },

    profile_picture: {
        type: String,
        required: true
    },

    user_email: {
        type: String,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },

    user_phone: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    password: {
        type: String,
        required: true,
        minlength: 6,
        select: false
    },

    role: {
        type: String,
        enum: ['admin', 'agent', 'user'],
        default: 'user',
        index: true
    },

    status: {
        type: String,
        enum: ['active', 'blocked'],
        default: 'active',
        index: true
    }
},
    {
        timestamps: true
    });

const User = mongoose.model('User', userSchema);
module.exports = User;
