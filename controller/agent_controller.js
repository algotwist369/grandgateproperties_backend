const User = require('../model/user_model');
const Agent = require('../model/agent_model');
const bcrypt = require('bcryptjs');
const createSlug = require('../utils/createSlug');
const parseJsonField = require('../utils/parseJson');
const { uploadToCloudinary, deleteFromCloudinary, getPublicIdFromUrl } = require('../utils/cloudinaryService');

const getAgentProfile = async (req, res) => {
    try {
        // Only allow users with the 'agent' role to access this route
        if (req.user.role !== 'agent') {
            return res.status(403).json({ message: 'Access denied. Agents only.' });
        }

        let agent = await Agent.findOne({ user_id: req.user._id });

        if (!agent) {
            // Lazy create agent profile if missing but user is an agent
            let slug = createSlug(req.user.user_name);
            const slugExists = await Agent.findOne({ slug });
            if (slugExists) {
                slug = `${slug}-${Date.now()}`;
            }

            agent = await Agent.create({
                user_id: req.user._id,
                slug,
                agent_name: req.user.user_name,
                agent_email: req.user.user_email,
                agent_phone: req.user.user_phone,
                avatar_url: req.user.profile_picture,
                agent_role: 'Agent'
            });
        }

        res.json(agent);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateAgentProfile = async (req, res) => {
    try {
        const {
            agent_name,
            agent_role,
            agent_email,
            agent_phone,
            agent_location,
            agent_bio,
            experience,
            languages,
            communities,
            specialties,
            agent_portfolio
        } = req.body;

        const id = req.params.id || req.user._id;

        // --- HARDENING: Admin Update Restriction ---
        // If an admin is updating by ID (req.params.id), force only status update
        if (req.params.id && req.user.role === 'admin') {
            const agent = await Agent.findOne({ user_id: id });
            if (!agent) return res.status(404).json({ message: 'Agent not found' });

            if (req.body.status) {
                agent.status = req.body.status;
                await agent.save();
                return res.json(agent);
            }
            return res.status(400).json({ message: 'Admin can only update agent status via this endpoint' });
        }
        // ------------------------------------------

        let avatar_url = req.body.avatar_url;
        if (req.file) {
            // Delete old avatar if it exists on Cloudinary
            const oldAgent = await Agent.findOne({ user_id: id });
            if (oldAgent && oldAgent.avatar_url) {
                const publicId = getPublicIdFromUrl(oldAgent.avatar_url);
                if (publicId) await deleteFromCloudinary(publicId);
            }

            const result = await uploadToCloudinary(req.file.buffer, 'images/profiles');
            avatar_url = result.secure_url;
        } else if (req.body.avatar_url) {
            // If updating via URL, delete old avatar if it exists on Cloudinary and is different
            const oldAgent = await Agent.findOne({ user_id: id });
            if (oldAgent && oldAgent.avatar_url && oldAgent.avatar_url !== req.body.avatar_url) {
                const publicId = getPublicIdFromUrl(oldAgent.avatar_url);
                if (publicId) await deleteFromCloudinary(publicId);
            }
            avatar_url = req.body.avatar_url;
        }

        // Parse JSON fields early to catch errors before DB operations
        const parsedLanguages = languages ? parseJsonField(languages, 'languages') : undefined;
        const parsedCommunities = communities ? parseJsonField(communities, 'communities') : undefined;
        const parsedSpecialties = specialties ? parseJsonField(specialties, 'specialties') : undefined;

        let parsedPortfolio = agent_portfolio ? parseJsonField(agent_portfolio, 'agent_portfolio') : undefined;

        // Fix: If portfolio is array of strings (old format), convert to objects
        if (parsedPortfolio && Array.isArray(parsedPortfolio) && parsedPortfolio.length > 0 && typeof parsedPortfolio[0] === 'string') {
            parsedPortfolio = parsedPortfolio.map(url => ({ url, type: 'image' }));
        }

        // Find agent by user_id
        let agent = await Agent.findOne({ user_id: id });

        if (agent) {
            // Update existing agent
            agent.agent_name = agent_name || agent.agent_name;
            agent.agent_role = agent_role || agent.agent_role;
            agent.agent_email = agent_email || agent.agent_email;
            agent.agent_phone = agent_phone || agent.agent_phone;
            agent.agent_location = agent_location !== undefined ? agent_location : agent.agent_location;
            agent.agent_bio = agent_bio !== undefined ? agent_bio : agent.agent_bio;
            agent.experience = experience !== undefined ? experience : agent.experience;
            agent.avatar_url = avatar_url || agent.avatar_url;
            agent.agent_password = req.body.agent_password || agent.agent_password;

            // Assign parsed arrays if they exist
            if (parsedLanguages) agent.languages = parsedLanguages;
            if (parsedCommunities) agent.communities = parsedCommunities;
            if (parsedSpecialties) agent.specialties = parsedSpecialties;

            if (parsedPortfolio) {
                // Cleanup: Delete Cloudinary images that are being removed from portfolio
                const currentUrls = agent.agent_portfolio.map(item => item.url);
                const newUrls = parsedPortfolio.map(item => item.url);
                const itemsToRemove = currentUrls.filter(url => !newUrls.includes(url));

                for (const url of itemsToRemove) {
                    const publicId = getPublicIdFromUrl(url);
                    if (publicId) await deleteFromCloudinary(publicId);
                }
                agent.agent_portfolio = parsedPortfolio;
            }

            const updatedAgent = await agent.save();

            // Sync with User profile
            const userUpdate = {};
            if (agent_email) userUpdate.user_email = agent_email;
            if (agent_phone) userUpdate.user_phone = agent_phone;
            if (agent_name) userUpdate.user_name = agent_name;
            if (avatar_url) userUpdate.profile_picture = avatar_url;

            if (Object.keys(userUpdate).length > 0) {
                await User.findByIdAndUpdate(id, userUpdate);
            }

            res.json(updatedAgent);
        } else {
            // This part usually applies if it's the logged in user or if being created by Admin
            const targetUser = await User.findById(id);
            if (!targetUser) return res.status(404).json({ message: 'User not found' });

            const finalName = agent_name || targetUser.user_name;
            const finalEmail = agent_email || targetUser.user_email;
            const finalPhone = agent_phone || targetUser.user_phone;
            const finalAvatar = avatar_url || targetUser.profile_picture;

            if (!finalName || !finalEmail || !agent_role) {
                return res.status(400).json({ message: 'Please provide required fields (name, email, role)' });
            }

            // Create slug
            let slug = createSlug(finalName);
            const slugExists = await Agent.findOne({ slug });
            if (slugExists) {
                slug = `${slug}-${Date.now()}`;
            }

            const newAgent = await Agent.create({
                user_id: id,
                slug,
                agent_name: finalName,
                agent_role,
                agent_email: finalEmail,
                agent_phone: finalPhone,
                agent_location: agent_location || '',
                agent_bio: agent_bio || '',
                experience: experience || '',
                avatar_url: finalAvatar || 'uploads/default-avatar.png',
                languages: parsedLanguages || [],
                communities: parsedCommunities || [],
                specialties: parsedSpecialties || [],
                agent_portfolio: parsedPortfolio || []
            });

            res.status(201).json(newAgent);

            // AUTO-UPDATE: Promote user to 'agent' role if not already
            const userUpdate = { role: 'agent' };
            if (agent_email) userUpdate.user_email = agent_email;
            if (agent_phone) userUpdate.user_phone = agent_phone;

            await User.findByIdAndUpdate(id, userUpdate);
        }
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const getAllAgents = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Fetch all users with role 'agent' with pagination
        const count = await User.countDocuments({ role: 'agent' });
        const users = await User.find({ role: 'agent' })
            .select('-password')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        // Fetch agent profiles for these users
        const userIds = users.map(u => u._id);
        const agentProfiles = await Agent.find({ user_id: { $in: userIds } });

        // Merge users with their agent profile data
        const agents = users.map(user => {
            const profile = agentProfiles.find(p => p.user_id?.toString() === user._id.toString());
            return {
                _id: profile?._id || user._id,
                user_id: user._id,
                agent_name: profile?.agent_name || user.user_name,
                agent_email: profile?.agent_email || user.user_email,
                agent_phone: profile?.agent_phone || user.user_phone,
                avatar_url: profile?.avatar_url || user.profile_picture,
                agent_role: profile?.agent_role || 'Agent',
                // agent_password: profile?.agent_password || '',
                slug: profile?.slug || '',
                status: profile?.status || user.status || 'active'
            };
        });

        res.json({
            agents,
            page,
            pages: Math.ceil(count / limit),
            total: count
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAgentBySlug = async (req, res) => {
    try {
        const agent = await Agent.findOne({ slug: req.params.slug })
            .select('agent_name agent_email agent_phone agent_location agent_bio experience languages communities specialties agent_portfolio slug user_id avatar_url agent_password status createdAt updatedAt');

        if (agent) {
            res.json(agent);
        } else {
            res.status(404).json({ message: 'Agent not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateAgentStatus = async (req, res) => {
    try {
        const { status } = req.body;

        // Validate status value
        const validStatuses = ['active', 'inactive', 'suspended'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        // Find agent by user_id or slug
        let agent;
        if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            // It's a valid MongoDB ObjectId, search by user_id
            agent = await Agent.findOne({ user_id: req.params.id });
        } else {
            // It's a slug
            agent = await Agent.findOne({ slug: req.params.id });
        }

        if (!agent) {
            return res.status(404).json({ message: 'Agent not found' });
        }

        // Update status: use provided value, or toggle between active/inactive if not provided
        agent.status = status || (agent.status === 'active' ? 'inactive' : 'active');
        const updatedAgent = await agent.save();

        // Return only essential fields
        res.json({
            id: updatedAgent._id,
            slug: updatedAgent.slug,
            status: updatedAgent.status,
            message: `Agent status updated to ${updatedAgent.status}`
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addAgent = async (req, res) => {
    try {
        const { user_name, user_email, user_phone, password, agent_role } = req.body;

        if (!user_name || !user_email || !user_phone || !password) {
            return res.status(400).json({ message: 'Please provide all required fields (Name, Email, Phone, Password)' });
        }

        // Check if user already exists
        const userExists = await User.findOne({
            $or: [{ user_email: user_email.toLowerCase() }, { user_phone }]
        });

        if (userExists) {
            return res.status(400).json({ message: 'User with this email or phone already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create User
        const user = await User.create({
            user_name,
            user_email: user_email.toLowerCase(),
            user_phone,
            password: hashedPassword,
            role: 'agent',
            profile_picture: 'uploads/default-avatar.png',
            status: 'active'
        });

        // Create initial Agent profile
        let slug = createSlug(user_name);
        const slugExists = await Agent.findOne({ slug });
        if (slugExists) {
            slug = `${slug}-${Date.now()}`;
        }

        const agent = await Agent.create({
            user_id: user._id,
            slug,
            agent_name: user_name,
            agent_email: user_email.toLowerCase(),
            agent_phone: user_phone,
            agent_role: agent_role || 'Agent',
            agent_password: password,
            avatar_url: 'uploads/default-avatar.png',
            status: 'active'
        });

        res.status(201).json({
            message: 'Agent created successfully',
            user: {
                _id: user._id,
                user_name: user.user_name,
                user_email: user.user_email,
                user_phone: user.user_phone,
                role: user.role
            },
            agent
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


module.exports = {
    getAgentProfile,
    updateAgentProfile,
    getAllAgents,
    getAgentBySlug,
    updateAgentStatus,
    addAgent
};
