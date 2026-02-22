require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const gtfsRoutes = require('./routes/gtfsRoutes');
const routeFinderRoutes = require('./routes/routeFinderRoutes');
const contactRoutes = require('./routes/contactRoutes');
const ticketRoutes  = require('./routes/ticketRoutes');
const sosRoutes     = require('./routes/sosRoutes');
const authenticateToken = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// CORS Configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to MetroMate API!' });
});

app.get('/hello', (req, res) => {
  res.json({ message: 'Hello from the API!' });
});

// Auth routes (public)
app.use('/auth', authRoutes);

// User CRUD routes (protected)
app.use('/users', authenticateToken, userRoutes);

// GTFS routes (public)
app.use('/gtfs', gtfsRoutes);

// Route Finder routes (public) - Uses Dijkstra's algorithm
app.use('/routes', routeFinderRoutes);

// Contact form routes (public) - Handle contact form submissions
app.use('/contact', contactRoutes);

// Ticket booking routes (public create, protected /my)
app.use('/tickets', ticketRoutes);

// SOS emergency alert routes (authenticated)
app.use('/api/sos', sosRoutes);

// Error handling
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3001'}`);
});
