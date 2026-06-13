const path = require('path');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const PORT = process.env.PORT || 8888;

const express = require('express');
const app = express();
app.use(express.static(path.join(__dirname, 'client')));
app.use(express.json());

// API Endpoints

app.post('/api/subscribe', async (req, res) => {
  console.log('Subscribe hit');
  console.log('API key present:', !!process.env.RESEND_API_KEY);
  console.log('Body:', req.body);

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'Missing API key' });
  }

  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  try {
    console.log('Creating contact...');
    const { data, error } = await resend.contacts.create({
      email,
      firstName: '',
      lastName: '',
      unsubscribed: false,
    });
    console.log('Contact result - data:', JSON.stringify(data), 'error:', JSON.stringify(error));

    if (error) return res.status(500).json({ error: 'Failed to subscribe', detail: error });

    console.log('Sending email...');
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'Into The Maze <dylan@intothemaze.com>',
      to: email,
      subject: "You're in the maze now.",
      html: `<p>You're on the list.</p>
             <p>You'll hear about the maze.</p>
             <p>— Dylan & Jonty</p>`,
    });
    console.log('Email result - data:', JSON.stringify(emailData), 'error:', JSON.stringify(emailError));

    if (emailError) return res.status(500).json({ error: 'Failed to send email', detail: emailError });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Caught exception:', err.message, err.stack);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
});
// END

app.listen(PORT);
console.log(`Server listening on port ${PORT}`);
