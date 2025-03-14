const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

//express
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// pasta public para arquivos estaticos
app.use(express.static(path.join(__dirname, 'public')));

// index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// chat.html
app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

//lista para armazenar os usuários conectados   
let users = {};

io.on('connection', (socket) => {
    console.log('Um usuário conectou:', socket.id);

    // Define o nome de usuário para o socket.id
    socket.on('set username', (username) => {
        users[socket.id] = username;
        console.log(`${username} entrou na sala.`);
        io.emit('user connected', username);
    });

    // Recebe mensagens do cliente
    socket.on('chat message', (msg) => {
        const username = users[socket.id];
        if (username) {
            console.log(`${username} enviou uma mensagem: ${msg}`);
            io.emit('chat message', { username, msg });
        } else {
            console.log('Erro: Nome de usuário não definido para o socket.id:', socket.id);
        }
    });

    //função para desconectar o usuário'
    socket.on('disconnect', () => {
        const username = users[socket.id];
        if (username) {
            console.log(`${username} saiu da sala.`);
            delete users[socket.id];
        }
    });
});

//inicia o servidor tanto no local 
//process.env.PORT vercel, heroku , render
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});