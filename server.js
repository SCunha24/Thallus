const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Servir os ficheiros do projeto
app.use(express.static(path.join(__dirname)));

app.get('/', (request, message) => {
  message.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n http://localhost:${PORT}\n`);
});

module.exports = app;
