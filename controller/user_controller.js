const User = require('../model/user_model');
const bcrypt = require('bcryptjs');
const generateToken = require('../utils/generateToken');
const Property = require('../model/properties_model');
const Agent = require('../model/agent_model');
const createSlug = require('../utils/createSlug');
const parseJsonField = require('../utils/parseJson');
const { uploadToCloudinary, deleteFromCloudinary, getPublicIdFromUrl } = require('../utils/cloudinaryService');

const signup = async (req, res) => {
    try {
        const { user_name, user_email, user_phone, password, role } = req.body;

        let profile_picture = req.body.profile_picture || 'default-avatar.png';

        // If file uploaded, use Cloudinary
        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer, 'images/profiles');
            profile_picture = result.secure_url;
        }

        // Check if user exists (email or phone)
        const userExists = await User.findOne({
            $or: [{ user_email }, { user_phone }]
        });

        if (userExists) {
            return res.status(400).json({ message: 'User already exists with this email or phone' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Determine role (default to 'user', allow 'agent', prevent 'admin' from signup)
        let finalRole = 'user';
        if (role === 'agent') {
            finalRole = 'agent';
        }

        // Create user
        const user = await User.create({
            user_name,
            user_email,
            user_phone,
            password: hashedPassword,
            profile_picture,
            role: finalRole,
            status: 'active'
        });

        if (user) {
            const token = generateToken(user._id);

            // AUTO-CREATE: Create Agent profile if user signed up as an agent
            if (user.role === 'agent') {
                let slug = createSlug(user.user_name);
                const slugExists = await Agent.findOne({ slug });
                if (slugExists) {
                    slug = `${slug}-${Date.now()}`;
                }

                await Agent.create({
                    user_id: user._id,
                    slug,
                    agent_name: user.user_name,
                    agent_email: user.user_email,
                    agent_phone: user.user_phone,
                    avatar_url: user.profile_picture || 'uploads/default-avatar.png',
                    agent_role: 'Agent'
                });
            }

            // Set cookie
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
            });

            res.status(201).json({
                _id: user._id,
                user_name: user.user_name,
                user_email: user.user_email,
                user_phone: user.user_phone,
                profile_picture: user.profile_picture,
                role: user.role,
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const login = async (req, res) => {
    try {
        const { login_id, password } = req.body; // login_id can be email or phone

        // Find user by email or phone
        const user = await User.findOne({
            $or: [{ user_email: login_id }, { user_phone: login_id }]
        }).select('+password'); // Explicitly select password

        if (user && (await bcrypt.compare(password, user.password))) {
            // Check agent status if user is an agent
            if (user.role === 'agent') {
                const agent = await Agent.findOne({ user_id: user._id });

                if (agent) {
                    if (agent.status === 'inactive') {
                        return res.status(403).json({
                            message: 'Contact admin, your account is inactive'
                        });
                    }

                    if (agent.status === 'suspended') {
                        return res.status(403).json({
                            message: 'Your account is suspended, connect administration'
                        });
                    }
                }
            }

            const token = generateToken(user._id);

            // Set cookie
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
            });

            res.json({
                _id: user._id,
                user_name: user.user_name,
                user_email: user.user_email,
                user_phone: user.user_phone,
                profile_picture: user.profile_picture,
                role: user.role,
            });
        } else {
            res.status(401).json({ message: 'Invalid email/phone or password' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateProfile = async (req, res) => {
    try {
        // req.user.id comes from auth middleware
        const user = await User.findById(req.user._id).select('+password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Update User model fields
        user.user_name = req.body.user_name || user.user_name;
        user.user_email = req.body.user_email || user.user_email;
        user.user_phone = req.body.user_phone || user.user_phone;

        // Handle profile picture update
        if (req.file) {
            // Delete old picture if it exists on Cloudinary
            const oldPublicId = getPublicIdFromUrl(user.profile_picture);
            if (oldPublicId) await deleteFromCloudinary(oldPublicId);

            const result = await uploadToCloudinary(req.file.buffer, 'images/profiles');
            user.profile_picture = result.secure_url;
        }
        else if (req.body.profile_picture && req.body.profile_picture !== user.profile_picture) {
            // If updating via URL, delete old picture if it exists on Cloudinary
            const oldPublicId = getPublicIdFromUrl(user.profile_picture);
            if (oldPublicId) await deleteFromCloudinary(oldPublicId);
            user.profile_picture = req.body.profile_picture;
        }
        // 3. Otherwise keep existing (default behavior of || operator in JS doesn't apply cleanly here due to logic above)

        if (req.body.password) {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(req.body.password, salt);
        }

        const updatedUser = await user.save();

        // Sync with Agent profile if user is an agent
        if (updatedUser.role === 'agent') {
            const {
                agent_location,
                agent_bio,
                experience,
                languages,
                communities,
                specialties,
                agent_portfolio
            } = req.body;

            // Build agent update object
            const agentUpdate = {};

            // Sync core fields from User model
            if (req.body.user_name) agentUpdate.agent_name = req.body.user_name;
            if (req.body.user_email) agentUpdate.agent_email = req.body.user_email;
            if (req.body.user_phone) agentUpdate.agent_phone = req.body.user_phone; // FIX: was user_phone
            if (updatedUser.profile_picture) agentUpdate.avatar_url = updatedUser.profile_picture;

            // Add agent-specific professional fields
            if (agent_location !== undefined) agentUpdate.agent_location = agent_location;
            if (agent_bio !== undefined) agentUpdate.agent_bio = agent_bio;
            if (experience !== undefined) agentUpdate.experience = experience;

            // Parse JSON fields
            if (languages) {
                const parsedLanguages = parseJsonField(languages, 'languages');
                if (parsedLanguages) agentUpdate.languages = parsedLanguages;
            }
            if (communities) {
                const parsedCommunities = parseJsonField(communities, 'communities');
                if (parsedCommunities) agentUpdate.communities = parsedCommunities;
            }
            if (specialties) {
                const parsedSpecialties = parseJsonField(specialties, 'specialties');
                if (parsedSpecialties) agentUpdate.specialties = parsedSpecialties;
            }
            if (agent_portfolio) {
                let parsedPortfolio = parseJsonField(agent_portfolio, 'agent_portfolio');
                // Convert string URLs to objects if needed
                if (parsedPortfolio && Array.isArray(parsedPortfolio) && parsedPortfolio.length > 0 && typeof parsedPortfolio[0] === 'string') {
                    parsedPortfolio = parsedPortfolio.map(url => ({ url, type: 'image' }));
                }
                if (parsedPortfolio) agentUpdate.agent_portfolio = parsedPortfolio;
            }

            if (Object.keys(agentUpdate).length > 0) {
                await Agent.findOneAndUpdate({ user_id: updatedUser._id }, agentUpdate);
            }
        }

        const token = generateToken(updatedUser._id);

        // Set cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });

        res.json({
            _id: updatedUser._id,
            user_name: updatedUser.user_name,
            user_email: updatedUser.user_email,
            user_phone: updatedUser.user_phone,
            profile_picture: updatedUser.profile_picture,
            role: updatedUser.role,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const logout = (req, res) => {
    res.cookie('token', '', {
        httpOnly: true,
        expires: new Date(0)
    });
    res.status(200).json({ message: 'Logged out successfully' });
};

const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (user) {
            // --- DEEP CASCADE DELETE ---

            // 1. Handle Agent Profile Cleanup
            if (user.role === 'agent') {
                const agent = await Agent.findOne({ user_id: user._id });
                if (agent) {
                    // Delete avatar from Cloudinary
                    const avatarPublicId = getPublicIdFromUrl(agent.avatar_url);
                    if (avatarPublicId) await deleteFromCloudinary(avatarPublicId);

                    // Delete portfolio items from Cloudinary
                    if (agent.agent_portfolio && agent.agent_portfolio.length > 0) {
                        for (const item of agent.agent_portfolio) {
                            const publicId = getPublicIdFromUrl(item.url);
                            if (publicId) await deleteFromCloudinary(publicId);
                        }
                    }
                    await agent.deleteOne();
                }
            }

            // 2. Handle Properties Cleanup
            const properties = await Property.find({ agent: user._id });
            for (const prop of properties) {
                // Delete hero image
                const heroId = getPublicIdFromUrl(prop.hero_image);
                if (heroId) await deleteFromCloudinary(heroId);

                // Delete gallery
                if (prop.gallery && prop.gallery.length > 0) {
                    for (const url of prop.gallery) {
                        const id = getPublicIdFromUrl(url);
                        if (id) await deleteFromCloudinary(id);
                    }
                }

                // Delete brochures
                if (prop.brochure_pdfs && prop.brochure_pdfs.length > 0) {
                    for (const doc of prop.brochure_pdfs) {
                        const id = getPublicIdFromUrl(doc.file_url);
                        if (id) await deleteFromCloudinary(id);
                    }
                }
                await prop.deleteOne();
            }

            // 3. Delete Profile Picture from Cloudinary
            const publicId = getPublicIdFromUrl(user.profile_picture);
            if (publicId) await deleteFromCloudinary(publicId);

            await user.deleteOne();
            res.json({ message: 'User removed and all associated data/media cleared' });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const filter = { _id: { $ne: req.user._id } };
        if (req.query.role) {
            filter.role = req.query.role;
        }

        const count = await User.countDocuments(filter);
        const users = await User.find(filter)
            .select('-password') // Exclude password
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 }); // Newest first

        res.json({
            users,
            page,
            pages: Math.ceil(count / limit),
            total: count,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateUserStatus = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (user) {
            user.status = req.body.status;
            await user.save();
            res.json({ message: 'User status updated successfully' });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateUserRole = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (user) {
            user.role = req.body.role;
            await user.save();
            res.json({ message: 'User role updated successfully' });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getDashboardStats = async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin';

        let propertiesCount;
        let agentsCount;
        let usersCount;
        let sales = isAdmin ? "2.4M" : "0"; // Placeholder

        if (isAdmin) {
            propertiesCount = await Property.countDocuments();
            agentsCount = await User.countDocuments({ role: 'agent' });
            usersCount = await User.countDocuments({ role: 'user' });
        } else {
            // Agent stats
            propertiesCount = await Property.countDocuments({ createdBy: req.user._id });
            agentsCount = await User.countDocuments({ role: 'agent' }); // Show total partners
            usersCount = 0; // Agents don't manage users directly yet
        }

        res.json({
            properties: propertiesCount,
            agents: agentsCount,
            users: usersCount,
            sales: sales
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // For regular users, return user data only
        if (user.role !== 'agent') {
            return res.json(user);
        }

        // For agents, fetch and merge Agent model
        let agent = await Agent.findOne({ user_id: user._id });

        // Lazy create agent profile if missing
        if (!agent) {
            let slug = createSlug(user.user_name);
            const slugExists = await Agent.findOne({ slug });
            if (slugExists) {
                slug = `${slug}-${Date.now()}`;
            }

            agent = await Agent.create({
                user_id: user._id,
                slug,
                agent_name: user.user_name,
                agent_email: user.user_email,
                agent_phone: user.user_phone,
                avatar_url: user.profile_picture,
                agent_role: 'Agent'
            });
        }

        // Return merged User + Agent data
        res.json({
            // User model fields
            _id: user._id,
            user_name: user.user_name,
            user_email: user.user_email,
            user_phone: user.user_phone,
            profile_picture: user.profile_picture,
            role: user.role,
            status: user.status,

            // Agent model fields
            agent_id: agent._id,
            slug: agent.slug,
            agent_role: agent.agent_role,
            agent_location: agent.agent_location,
            agent_bio: agent.agent_bio,
            experience: agent.experience,
            languages: agent.languages,
            communities: agent.communities,
            specialties: agent.specialties,
            agent_portfolio: agent.agent_portfolio,
            agent_password: agent.agent_password
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    signup,
    login,
    updateProfile,
    getProfile,
    logout,
    deleteUser,
    getAllUsers,
    updateUserStatus,
    updateUserRole,
    getDashboardStats,
};
