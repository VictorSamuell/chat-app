# Zap 2 — verificação da migração Cloudflare

Verificado em 18/11/2026.

- 12 testes de integração aprovados: 6 do Node e 6 do Cloudflare.
- Runtime oficial workerd via Miniflare com SQLite real e clientes WebSocket reais.
- Isolamento entre salas, identidade e apelidos, busca literal, paginação 80 + 5, idempotência e limite de envio.
- Permissões de exclusão, moderação pelo criador e limite de cinco fixados.
- Conexão e identidade preservadas após hibernação do Durable Object.
- Histórico e fixados recuperados após parar e reabrir o runtime com o mesmo armazenamento.
- Backend Node continua servindo o cliente Socket.IO pela rota compartilhada `/api/client.js`.
- `npm run check:cloudflare` gerou o pacote e validou os bindings sem publicar.
- Navegador conectado ao Wrangler local: criação de sala pela interface, envio de mensagem, recarga e reconexão com histórico preservado; console sem erros.

A validação local não comprova o deploy na conta do usuário. O estado da publicação é informado separadamente na entrega. Nenhum histórico do Render foi importado automaticamente.
