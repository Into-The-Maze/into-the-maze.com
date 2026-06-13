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
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email' });

  try {
    const { error } = await resend.contacts.create({ email });
    if (error) return res.status(500).json({ error: 'Failed to subscribe' });

    await resend.emails.send({
      from: 'Into The Maze <dylan@intothemaze.com>',
      to: email,
      subject: "You're in the maze now.",
      html: `<p>You're on the list.</p>
             <p>You'll hear about the maze.</p>
             <p>— Dylan & Jonty</p>`,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// END

app.listen(PORT);
console.log(`Server listening on port ${PORT}`);
