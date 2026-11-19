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

Publicação confirmada em https://zap-2-chat.victorsamklv.workers.dev em 18/11/2026, versão b79d553f-3fbc-4310-9847-faad4b7fd212. A API pública respondeu ok e platform=cloudflare. No navegador, foram confirmados criação de sala, envio, reconexão após recarga e recuperação do histórico, sem erros de console. Nenhum histórico do Render foi importado automaticamente. O deploy automático pelo GitHub ainda não foi conectado.
