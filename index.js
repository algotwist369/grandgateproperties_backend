const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const path = require('path');
const cluster = require('cluster');
const os = require('os');
const morgan = require('morgan')

// Security & Performance Middleware
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const cookieParser = require('cookie-parser');

// Load env vars
dotenv.config();

const PORT = process.env.PORT || 5000;

// Clustering Logic
if (cluster.isMaster) {
    const numCPUs = os.cpus().length;
    console.log(`Master ${process.pid} is running`);
    console.log(`Forking ${numCPUs} workers...`);

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // Listen for dying workers
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died. Forking a new one...`);
        cluster.fork();
    });

} else {
    // Worker Process
    const app = express();

    // Trust Proxy (for Nginx/Cloudflare)
    app.set('trust proxy', 1);

    // Connect to database (each worker needs its own connection)
    connectDB();

    // --- Middleware ---

    // Security Headers
    app.use(helmet({
        crossOriginResourcePolicy: false,
    }));

    app.use(morgan('dev'));

    // Enable CORS with specific options
    const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:3000',
        'https://grandgatepropertiesllc.com',
        'http://grandgatepropertiesllc.com',
        'https://www.grandgatepropertiesllc.com'
    ];
    app.use(cors({
        origin: allowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
    }));

    // Compression (Performance)
    app.use(compression());

    // Cookie parser
    app.use(cookieParser());

    // Body parser
    app.use(express.json({ limit: '10kb' })); // Limit body size

    // Sanitize data (NoSQL Injection)
    app.use(mongoSanitize());

    // Prevent Parameter Pollution
    app.use(hpp());

    // Rate Limiting
    const limiter = rateLimit({
        windowMs: 10 * 60 * 1000, // 10 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        message: 'Too many requests from this IP, please try again after 10 minutes'
    });
    app.use(limiter);

    // --- Routes ---
    const userRoutes = require('./routes/user_routes');
    const agentRoutes = require('./routes/agent_routes');
    const propertyRoutes = require('./routes/property_routes');

    app.use('/api/users', userRoutes);
    app.use('/api/agents', agentRoutes);
    app.use('/api/properties', propertyRoutes);

    // Serve key files
    app.use('/upload', express.static(path.join(__dirname, '/upload')));

    const server = app.listen(
        PORT,
        console.log(`Worker ${process.pid} started on port ${PORT}`)
    );

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err, promise) => {
        console.log(`Error: ${err.message}`);
        // Close server & exit process
        server.close(() => process.exit(1));
    });
}
