const parseJsonField = (value, fieldName) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    try {
        return JSON.parse(value);
    } catch (error) {
        throw new Error(`Invalid JSON format in field '${fieldName}': ${error.message}`);
    }
};

module.exports = parseJsonField;
