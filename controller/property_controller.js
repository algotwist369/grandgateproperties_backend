const Property = require('../model/properties_model');
const createSlug = require('../utils/createSlug');
const parseJsonField = require('../utils/parseJson');
const { uploadToCloudinary, deleteFromCloudinary, getPublicIdFromUrl } = require('../utils/cloudinaryService');

const createProperty = async (req, res) => {
    try {
        // 1. Basic Fields
        const {
            title, headline, description, developer,
            community, location, emirate, country,
            property_category, starting_price, currency,
            handover, featured, is_new
        } = req.body;

        if (!title || !description || !property_category || !starting_price || !country) {
            return res.status(400).json({ message: 'Please provide all required fields' });
        }

        // 2. Handle Hero Image (File > URL)
        let hero_image = req.body.hero_image || null;
        if (req.files && req.files['hero_image']) {
            const result = await uploadToCloudinary(req.files['hero_image'][0].buffer, 'images/properties');
            hero_image = result.secure_url;
        }

        // 3. Handle Gallery (Mixed URLs and Uploads)
        let gallery = req.body.gallery ? parseJsonField(req.body.gallery, 'gallery') : [];
        if (!Array.isArray(gallery)) gallery = [gallery];

        if (req.files && req.files['gallery']) {
            const uploadPromises = req.files['gallery'].map(file => uploadToCloudinary(file.buffer, 'images/properties'));
            const results = await Promise.all(uploadPromises);
            const uploadedGallery = results.map(r => r.secure_url);
            gallery = [...gallery, ...uploadedGallery];
        }

        // 4. Handle Brochures (Mixed URLs and Uploads with Metadata)
        let brochure_metadata = req.body.brochure_pdfs ? parseJsonField(req.body.brochure_pdfs, 'brochure_pdfs') : [];
        if (!Array.isArray(brochure_metadata)) brochure_metadata = [brochure_metadata];

        let brochure_pdfs = [];
        let uploadedBrochureFiles = (req.files && req.files['brochure_pdfs']) ? req.files['brochure_pdfs'] : [];

        if (uploadedBrochureFiles.length > 0) {
            const uploadPromises = uploadedBrochureFiles.map(file => uploadToCloudinary(file.buffer, 'files', 'raw'));
            const results = await Promise.all(uploadPromises);

            let resultIndex = 0;
            brochure_metadata.forEach(meta => {
                if (meta.isFile || !meta.file_url) {
                    if (results[resultIndex]) {
                        brochure_pdfs.push({
                            title: meta.title || uploadedBrochureFiles[resultIndex].originalname,
                            language: meta.language || 'en',
                            file_url: results[resultIndex].secure_url
                        });
                        resultIndex++;
                    }
                } else {
                    brochure_pdfs.push(meta);
                }
            });
        } else {
            brochure_pdfs = brochure_metadata;
        }

        // 5. Handle Other Arrays
        const property_types = req.body.property_types ? parseJsonField(req.body.property_types, 'property_types') : [];
        const amenities = req.body.amenities ? parseJsonField(req.body.amenities, 'amenities') : [];
        const units = req.body.units ? parseJsonField(req.body.units, 'units') : [];
        const agents = req.body.agents ? parseJsonField(req.body.agents, 'agents') : [];
        const nearby_locations = req.body.nearby_locations ? parseJsonField(req.body.nearby_locations, 'nearby_locations') : [];
        const payment_plan = req.body.payment_plan ? parseJsonField(req.body.payment_plan, 'payment_plan') : [];

        // 6. Slug Generation
        let slug = createSlug(title);
        const slugExists = await Property.findOne({ slug });
        if (slugExists) {
            slug = `${slug}-${Date.now()}`;
        }

        // 7. Create Property
        const property = await Property.create({
            slug,
            is_new: is_new === 'true' || is_new === true,
            title,
            headline,
            description,
            developer,
            community,
            location,
            emirate,
            country,
            property_category,
            property_types,
            starting_price,
            currency,
            handover,
            featured: featured === 'true' || featured === true,
            hero_image,
            gallery,
            brochure_pdfs,
            payment_plan,
            amenities,
            units,
            agents,
            nearby_locations,
            createdBy: req.user._id
        });

        res.status(201).json(property);

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const getAllProperties = async (req, res) => {
    try {
        const pageSize = Number(req.query.limit) || 10;
        const page = Number(req.query.page) || 1;

        // Build Filter
        const query = {};

        if (req.query.category) {
            query.property_category = req.query.category;
        }
        if (req.query.property_types) {
            query.property_types = req.query.property_types;
        }
        if (req.query.country) {
            query.$or = [
                { country: req.query.country },
                { emirate: req.query.country }
            ];
        }
        if (req.query.featured) {
            query.featured = req.query.featured === 'true';
        }
        if (req.query.is_new) {
            query.is_new = req.query.is_new === 'true';
        }
        if (req.query.createdBy) {
            query.createdBy = req.query.createdBy;
        }

        // --- New Advanced Filters ---
        if (req.query.bedrooms) {
            query['units.bedrooms'] = Number(req.query.bedrooms);
        }

        if (req.query.minPrice || req.query.maxPrice) {
            query.starting_price = {};
            if (req.query.minPrice) query.starting_price.$gte = Number(req.query.minPrice);
            if (req.query.maxPrice) query.starting_price.$lte = Number(req.query.maxPrice);
        }

        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            const searchConditions = [
                { title: searchRegex },
                { community: searchRegex },
                { location: searchRegex }
            ];

            if (query.$or) {
                const countryOr = query.$or;
                delete query.$or;
                query.$and = [
                    { $or: countryOr },
                    { $or: searchConditions }
                ];
            } else {
                query.$or = searchConditions;
            }
        }

        const count = await Property.countDocuments(query);
        const properties = await Property.find(query)
            .populate('agents', 'agent_name avatar_url slug agent_role')
            .limit(pageSize)
            .skip(pageSize * (page - 1))
            .sort({ createdAt: -1 });

        res.json({
            properties,
            page,
            pages: Math.ceil(count / pageSize),
            total: count
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getPropertyBySlug = async (req, res) => {
    try {
        const property = await Property.findOne({ slug: req.params.slug })
            .populate('agents', 'agent_name avatar_url slug agent_role agent_phone agent_email')
            .populate('createdBy', 'user_name');

        if (property) {
            res.json(property);
        } else {
            res.status(404).json({ message: 'Property not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateProperty = async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);

        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }

        const {
            title, headline, description, developer,
            community, location, emirate, country,
            property_category, starting_price, currency,
            handover, featured, is_new
        } = req.body;

        // Update fields if provided
        property.title = title || property.title;
        property.headline = headline || property.headline;
        property.description = description || property.description;
        property.developer = developer || property.developer;
        property.community = community || property.community;
        property.location = location || property.location;
        property.emirate = emirate || property.emirate;
        property.country = country || property.country;
        property.property_category = property_category || property.property_category;
        property.starting_price = starting_price || property.starting_price;
        property.currency = currency || property.currency;
        property.handover = handover || property.handover;
        if (featured !== undefined) property.featured = featured === 'true' || featured === true;
        if (is_new !== undefined) property.is_new = is_new === 'true' || is_new === true;

        // Handle JSON arrays
        if (req.body.property_types) property.property_types = parseJsonField(req.body.property_types, 'property_types');
        if (req.body.amenities) property.amenities = parseJsonField(req.body.amenities, 'amenities');
        if (req.body.units) property.units = parseJsonField(req.body.units, 'units');
        if (req.body.agents) property.agents = parseJsonField(req.body.agents, 'agents');
        if (req.body.nearby_locations) property.nearby_locations = parseJsonField(req.body.nearby_locations, 'nearby_locations');
        if (req.body.payment_plan) property.payment_plan = parseJsonField(req.body.payment_plan, 'payment_plan');


        // Handle Files & URLs

        // Hero Image
        if (req.files && req.files['hero_image']) {
            // Delete old hero image if it was on Cloudinary
            const oldPublicId = getPublicIdFromUrl(property.hero_image);
            if (oldPublicId) await deleteFromCloudinary(oldPublicId);

            const result = await uploadToCloudinary(req.files['hero_image'][0].buffer, 'images/properties');
            property.hero_image = result.secure_url;
        } else if (req.body.hero_image && req.body.hero_image !== property.hero_image) {
            // If updating via URL, still delete the old one if it was on Cloudinary
            const oldPublicId = getPublicIdFromUrl(property.hero_image);
            if (oldPublicId) await deleteFromCloudinary(oldPublicId);
            property.hero_image = req.body.hero_image;
        }

        // Gallery
        let newGallery = req.body.gallery ? parseJsonField(req.body.gallery, 'gallery') : undefined;
        if (newGallery) {
            if (!Array.isArray(newGallery)) newGallery = [newGallery];

            // Cleanup: Delete Cloudinary images that are being removed from gallery
            const imagesToRemove = (property.gallery || []).filter(url => !newGallery.includes(url));
            for (const url of imagesToRemove) {
                const publicId = getPublicIdFromUrl(url);
                if (publicId) await deleteFromCloudinary(publicId);
            }
            property.gallery = newGallery;
        }

        if (req.files && req.files['gallery']) {
            const uploadPromises = req.files['gallery'].map(file => uploadToCloudinary(file.buffer, 'images/properties'));
            const results = await Promise.all(uploadPromises);
            const uploadedGallery = results.map(r => r.secure_url);
            property.gallery = [...(property.gallery || []), ...uploadedGallery];
        }

        // Brochures
        let brochure_metadata = req.body.brochure_pdfs ? parseJsonField(req.body.brochure_pdfs, 'brochure_pdfs') : undefined;
        if (brochure_metadata) {
            if (!Array.isArray(brochure_metadata)) brochure_metadata = [brochure_metadata];

            // Cleanup: Delete Cloudinary files that are being removed
            const filesToRemove = (property.brochure_pdfs || []).filter(oldMeta =>
                !brochure_metadata.some(newMeta => newMeta.file_url === oldMeta.file_url)
            );
            for (const meta of filesToRemove) {
                const publicId = getPublicIdFromUrl(meta.file_url);
                if (publicId) await deleteFromCloudinary(publicId);
            }

            let final_brochures = [];
            let uploadedBrochureFiles = (req.files && req.files['brochure_pdfs']) ? req.files['brochure_pdfs'] : [];

            if (uploadedBrochureFiles.length > 0) {
                const uploadPromises = uploadedBrochureFiles.map(file => uploadToCloudinary(file.buffer, 'files', 'raw'));
                const results = await Promise.all(uploadPromises);

                let resultIndex = 0;
                brochure_metadata.forEach(meta => {
                    if (meta.isFile || !meta.file_url) {
                        if (results[resultIndex]) {
                            final_brochures.push({
                                title: meta.title || uploadedBrochureFiles[resultIndex].originalname,
                                language: meta.language || 'en',
                                file_url: results[resultIndex].secure_url
                            });
                            resultIndex++;
                        } else if (meta.file_url) {
                            final_brochures.push(meta);
                        }
                    } else {
                        final_brochures.push(meta);
                    }
                });
            } else {
                final_brochures = brochure_metadata;
            }
            property.brochure_pdfs = final_brochures;
        }

        const updatedProperty = await property.save();
        res.json(updatedProperty);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const deleteProperty = async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);

        if (property) {
            // Delete hero image from Cloudinary
            const heroPublicId = getPublicIdFromUrl(property.hero_image);
            if (heroPublicId) await deleteFromCloudinary(heroPublicId);

            // Delete gallery from Cloudinary
            if (property.gallery && property.gallery.length > 0) {
                for (const url of property.gallery) {
                    const publicId = getPublicIdFromUrl(url);
                    if (publicId) await deleteFromCloudinary(publicId);
                }
            }

            // Delete brochures from Cloudinary
            if (property.brochure_pdfs && property.brochure_pdfs.length > 0) {
                for (const meta of property.brochure_pdfs) {
                    const publicId = getPublicIdFromUrl(meta.file_url);
                    if (publicId) await deleteFromCloudinary(publicId);
                }
            }

            await property.deleteOne();
            res.json({ message: 'Property removed' });
        } else {
            res.status(404).json({ message: 'Property not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const assignAgentsToProperty = async (req, res) => {
    try {
        const { agents } = req.body;
        const property = await Property.findById(req.params.id);

        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }

        // Validate agents exist? Optional but good practice.
        // For now, just Update.

        let parsedAgents = parseJsonField(agents, 'agents');
        if (!parsedAgents) parsedAgents = [];
        if (!Array.isArray(parsedAgents)) parsedAgents = [parsedAgents];

        property.agents = parsedAgents;
        await property.save();

        const updatedProperty = await Property.findById(req.params.id).populate('agents', 'agent_name avatar_url slug agent_role');
        res.json(updatedProperty);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updatePropertyStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const property = await Property.findById(req.params.id);

        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }

        if (status !== 'active' && status !== 'inactive') {
            return res.status(400).json({ message: 'Invalid status. Use active or inactive' });
        }

        property.status = status;
        await property.save();

        res.json({ message: `Property status updated to ${status}`, property });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createProperty,
    getAllProperties,
    getPropertyBySlug,
    updateProperty,
    deleteProperty,
    assignAgentsToProperty,
    updatePropertyStatus
};
