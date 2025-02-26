const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve arquivos estáticos da pasta "public"
app.use(express.static('public'));

// Rota padrão para o index.html
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Rota para o chat.html
app.get('/chat', (req, res) => {
    res.sendFile(__dirname + '/public/chat.html');
});

// Lógica do Socket.IO
let users = {};

io.on('connection', (socket) => {
    console.log('Um usuário conectou:', socket.id);

    // Define o nome de usuário
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

    // Notifica quando um usuário desconecta
    socket.on('disconnect', () => {
        const username = users[socket.id];
        if (username) {
            console.log(`${username} saiu da sala.`);
            delete users[socket.id];
        }
    });
});

// Inicia o servidor
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});