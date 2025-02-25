const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let users = {};
let userCount = 0;

io.on('connection', (socket) => {
    userCount++;
    const userId = `Usuário #${userCount}`;
    users[socket.id] = userId;

    console.log(`${userId} conectou:`);
    io.emit('user connected', userId);

    socket.on('set username', (username) => {
        users[socket.id] = username;
        io.emit('user connected', username);
    });

    socket.on('chat message', (msg) => {
        const username = users[socket.id];
        console.log(`Mensagem recebida de ${username}: ${msg}`);
        io.emit('chat message', { username, msg });
    });

    socket.on('disconnect', () => {
        const username = users[socket.id];
        console.log(`${username} desconectou:`);
        delete users[socket.id];
        io.emit('user disconnected', username);
    });
});

server.listen(3000, () => {
    console.log('Servidor rodando em http://localhost:3000');
});