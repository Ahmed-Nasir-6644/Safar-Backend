const express = require('express');
const app = express();
app.use(express.json());

// Import the contact controller
const { submitContactForm } = require('./controllers/contactController');

// Test route
app.post('/contact', submitContactForm);

// Start test server
const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log('\nTest with:');
  console.log(`curl -X POST http://localhost:${PORT}/contact \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"fullName":"Test User","emailAddress":"test@example.com","message":"This is a test message from MetroMate contact form."}'`);
});
