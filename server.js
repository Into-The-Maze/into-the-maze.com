const path = require('path');

const PORT = process.env.PORT || 8888;

const express = require('express');
const app = express();
app.use(express.static(path.join(__dirname, 'client')));
app.use(express.json());

// API Endpoints



// END

app.listen(PORT);
console.log(`Server listening on port ${PORT}`);
