const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);


app.use(express.static('public'));


io.on('connection', (socket) => {
    console.log('Um usuário conectou:', socket.id);

    
    socket.on('chat message', (msg) => {
        console.log(`Mensagem recebida: ${msg}`);
        io.emit('chat message', msg); 
    });


    socket.on('disconnect', () => {
        console.log('Um usuário desconectou:', socket.id);
    });
});

//ip local : 10.0.0.130
// http://10.0.0.130:3000

server.listen(3000, '0.0.0.0', () => {
    console.log('Servidor rodando em http://localhost:3000 ou pelo IP local');
});
