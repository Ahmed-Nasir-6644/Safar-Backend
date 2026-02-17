# Contact Form API Documentation

## Endpoint: Submit Contact Form

**URL:** `POST /contact`

**Description:** Handles contact form submissions from the MetroMate "Get in Touch" form. Validates the input and sends an email to the support team.

---

## Request

### Headers
```
Content-Type: application/json
```

### Body Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fullName` | string | Yes | User's full name (max 100 characters) |
| `emailAddress` | string | Yes | User's email address (valid email format) |
| `message` | string | Yes | User's message (10-5000 characters) |

### Example Request

```json
{
  "fullName": "John Doe",
  "emailAddress": "john.doe@example.com",
  "message": "I have a question about route planning. How can I find the fastest route between two stops?"
}
```

---

## Responses

### Success Response

**Code:** `200 OK`

```json
{
  "message": "Email sent successfully",
  "details": "Thank you for contacting MetroMate. We will get back to you soon."
}
```

---

### Error Responses

#### Missing Required Fields

**Code:** `400 Bad Request`

```json
{
  "error": "All fields are required",
  "details": {
    "fullName": "Full name is required",
    "emailAddress": null,
    "message": null
  }
}
```

#### Invalid Email Format

**Code:** `400 Bad Request`

```json
{
  "error": "Invalid email address",
  "details": "Please provide a valid email address"
}
```

#### Invalid Data Types

**Code:** `400 Bad Request`

```json
{
  "error": "Invalid data types",
  "details": "All fields must be strings"
}
```

#### Empty Fields

**Code:** `400 Bad Request`

```json
{
  "error": "All fields must contain valid content",
  "details": "Fields cannot be empty or contain only whitespace"
}
```

#### Full Name Too Long

**Code:** `400 Bad Request`

```json
{
  "error": "Full name is too long",
  "details": "Full name must be 100 characters or less"
}
```

#### Message Too Short

**Code:** `400 Bad Request`

```json
{
  "error": "Message is too short",
  "details": "Message must be at least 10 characters"
}
```

#### Message Too Long

**Code:** `400 Bad Request`

```json
{
  "error": "Message is too long",
  "details": "Message must be 5000 characters or less"
}
```

#### Email Sending Failed

**Code:** `500 Internal Server Error`

```json
{
  "error": "Failed to send email",
  "details": "We encountered an issue while sending your message. Please try again later or contact us directly."
}
```

#### Internal Server Error

**Code:** `500 Internal Server Error`

```json
{
  "error": "Internal server error",
  "details": "An unexpected error occurred. Please try again later."
}
```

---

## Email Configuration

The email sent to the support team includes:

- **To:** `support@metromate.com` (configured via `SUPPORT_EMAIL` env variable)
- **Reply-To:** User's email address from the form
- **Subject:** `New Contact Form Submission from [fullName]`
- **Body:** HTML-formatted email with user's name, email, and message

---

## Testing Examples

### Using cURL

```bash
curl -X POST http://localhost:5000/contact \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Jane Smith",
    "emailAddress": "jane.smith@example.com",
    "message": "I would like to learn more about MetroMate premium features."
  }'
```

### Using JavaScript (fetch)

```javascript
const response = await fetch('http://localhost:5000/contact', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    fullName: 'Jane Smith',
    emailAddress: 'jane.smith@example.com',
    message: 'I would like to learn more about MetroMate premium features.'
  })
});

const data = await response.json();
console.log(data);
```

### Using Postman

1. **Method:** POST
2. **URL:** `http://localhost:5000/contact`
3. **Headers:**
   - Key: `Content-Type`
   - Value: `application/json`
4. **Body:** (raw JSON)
```json
{
  "fullName": "Jane Smith",
  "emailAddress": "jane.smith@example.com",
  "message": "I would like to learn more about MetroMate premium features."
}
```

---

## Environment Variables

Add these to your `.env` file:

```env
# Email Configuration (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SUPPORT_EMAIL=support@metromate.com
```

### Gmail Setup Instructions

1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account Settings
   - Security → 2-Step Verification → App passwords
   - Select "Mail" and your device
   - Copy the generated 16-character password
3. Use this app password in `SMTP_PASS`

### Alternative Email Services

#### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key
```

#### AWS SES
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your_ses_smtp_username
SMTP_PASS=your_ses_smtp_password
```

#### Mailgun
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=your_mailgun_smtp_username
SMTP_PASS=your_mailgun_smtp_password
```

---

## Validation Rules

| Field | Min Length | Max Length | Format |
|-------|-----------|------------|--------|
| `fullName` | 1 | 100 | Any string |
| `emailAddress` | - | - | Valid email (regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) |
| `message` | 10 | 5000 | Any string |

---

## Security Considerations

1. **Rate Limiting:** Consider adding rate limiting to prevent spam
2. **CAPTCHA:** Implement reCAPTCHA on frontend to prevent bot submissions
3. **Input Sanitization:** All inputs are trimmed and validated
4. **Email Validation:** Regex-based email validation
5. **Error Messages:** Safe error messages that don't expose system details

---

## Frontend Integration Example (React)

```jsx
import { useState } from 'react';

function ContactForm() {
  const [formData, setFormData] = useState({
    fullName: '',
    emailAddress: '',
    message: ''
  });
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ type: '', message: '' });

    try {
      const response = await fetch('http://localhost:5000/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        setStatus({ type: 'success', message: data.details });
        setFormData({ fullName: '', emailAddress: '', message: '' });
      } else {
        setStatus({ type: 'error', message: data.details || data.error });
      }
    } catch (error) {
      setStatus({ 
        type: 'error', 
        message: 'Network error. Please check your connection.' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Full Name"
        value={formData.fullName}
        onChange={(e) => setFormData({...formData, fullName: e.target.value})}
        required
      />
      <input
        type="email"
        placeholder="Email Address"
        value={formData.emailAddress}
        onChange={(e) => setFormData({...formData, emailAddress: e.target.value})}
        required
      />
      <textarea
        placeholder="Your Message"
        value={formData.message}
        onChange={(e) => setFormData({...formData, message: e.target.value})}
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Sending...' : 'Send Message'}
      </button>
      {status.message && (
        <div className={status.type}>{status.message}</div>
      )}
    </form>
  );
}
```

---

## Troubleshooting

### Email not sending

1. Check SMTP credentials in `.env` file
2. Verify SMTP server is accessible
3. Check console logs for detailed error messages
4. For Gmail: Ensure App Password is used (not regular password)
5. Check firewall settings for port 587

### Validation errors

1. Ensure all fields are provided
2. Check email format is valid
3. Message should be 10-5000 characters
4. Full name should be max 100 characters

---

## Files Created

1. **`controllers/contactController.js`** - Request validation and handling
2. **`services/emailService.js`** - Email sending logic with Nodemailer
3. **`routes/contactRoutes.js`** - Route definition
4. **Updated `server.js`** - Added contact routes
5. **Updated `.env`** - Added email configuration

---

## Additional Notes

- The endpoint is public (no authentication required)
- All inputs are sanitized and validated
- HTML and plain text email versions are sent
- Reply-To is set to user's email for easy responses
- Professional email template with MetroMate branding
