const PORT = 8888;

const express = require('express');
const app = express();
app.use(express.static('client'));
app.use(express.json());

// API Endpoints
app.get('/', (_, res) => {
  res.sendFile('client/index.html');
});


// END

app.listen(PORT);
console.log(`Server listening on port ${PORT}`);
