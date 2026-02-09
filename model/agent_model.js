const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema(
    {
        slug: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
            lowercase: true
        },

        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },

        agent_name: {
            type: String,
            required: true,
            trim: true,
            index: true
        },

        avatar_url: {
            type: String,
            default: 'uploads/default-avatar.png'
        },

        agent_email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            index: true
        },

        agent_phone: {
            type: String,
            required: true,
            index: true
        },

        agent_role: {
            type: String,
            required: true,
            index: true
        },

        agent_location: {
            type: String,
            default: '',
            index: true
        },

        agent_bio: {
            type: String,
            default: '',
            maxlength: 2000
        },

        experience: {
            type: String,
            default: ''
        },

        languages: [
            {
                type: String,
                required: true
            }
        ],

        communities: [
            {
                type: String
            }
        ],

        specialties: [
            {
                type: String
            }
        ],

        agent_portfolio: [
            {
                url: {
                    type: String,
                    required: true
                },
                type: {
                    type: String,
                    enum: ['image', 'video'],
                    default: 'image'
                }
            }
        ],
        status: {
            type: String,
            enum: ['active', 'inactive', 'suspended'],
            default: 'active',
            index: true
        },
        agent_password: {
            type: String,
            default: ''
        },
    },
    {
        timestamps: true
    }
);

/* Compound indexes for faster filtering */
agentSchema.index({ agent_location: 1, agent_role: 1 });
agentSchema.index({ specialties: 1 });
agentSchema.index({ languages: 1 });

/* Text search (optional but powerful later) */
agentSchema.index({
    agent_name: 'text',
    agent_bio: 'text'
});

const Agent = mongoose.model('Agent', agentSchema);
module.exports = Agent;
