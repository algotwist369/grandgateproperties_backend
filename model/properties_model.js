const mongoose = require('mongoose');

const unit_schema = new mongoose.Schema(
    {
        unit_id: {
            type: String,
        },
        title: {
            type: String,
        },
        bedrooms: {
            type: Number,
        },
        bathrooms: {
            type: Number,
        },
        sqm: {
            type: Number
        },
        sqft: {
            type: Number
        },
        price: {
            type: Number
        },
        description: {
            type: String
        }
    },
    { _id: false }
);

const property_schema = new mongoose.Schema(
    {
        slug: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        is_new: {
            type: Boolean,
            default: false,
            index: true
        },

        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
            index: true
        },

        // -------- Basic Info --------
        title: {
            type: String,
            required: true
        },

        headline: {
            type: String
        },

        description: {
            type: String,
            required: true
        },

        developer: {
            type: String
        },

        // -------- Location --------
        community: {
            type: String
        },

        location: {
            type: String
        },

        emirate: {
            type: String
        },

        country: {
            type: String,
            required: true,
            index: true,
            default: 'UAE'
        },

        // -------- Property Classification --------
        property_category: {
            type: String,
            required: true,
            index: true
        },

        property_types: [
            {
                type: String
            }
        ],

        // -------- Pricing --------
        starting_price: {
            type: Number,
            required: true
        },

        currency: {
            type: String,
            required: true,
            default: 'AED'
        },

        // -------- Timeline --------
        handover: {
            type: String
        },

        featured: {
            type: Boolean,
            default: false
        },

        // -------- Media --------
        hero_image: {
            type: String
        },

        gallery: [
            {
                type: String
            }
        ],

        // NEW: Brochure PDFs
        brochure_pdfs: [
            {
                title: { type: String },       // e.g. "Project Brochure"
                language: { type: String },    // e.g. "en", "ar", "fr"
                file_url: { type: String },    // PDF URL
                uploaded_at: { type: Date, default: Date.now }
            }
        ],

        // -------- Amenities --------
        amenities: [{ type: String }],

        nearby_locations: [
            {
                name: { type: String },
                distance: { type: String }
            }
        ],

        // -------- Units --------
        units: [unit_schema],

        // -------- Payment Plan --------
        payment_plan: [
            {
                percentage: { type: Number }, // e.g. 20
                title: { type: String },      // e.g. "Down Payment"
                subtitle: { type: String }    // e.g. "On Booking Date"
            }
        ],

        // -------- Agents --------
        agents: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Agent'
        }],

        // -------- Creator --------
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },

    },
    {
        timestamps: true
    }
);

// -------- Indexes --------
property_schema.index({ country: 1, property_category: 1 });
property_schema.index({ featured: 1 });
property_schema.index({ starting_price: 1 });
property_schema.index({ title: 'text', description: 'text' });

const Property = mongoose.model('Property', property_schema);
module.exports = Property;
