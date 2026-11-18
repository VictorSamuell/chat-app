# Zap 2 — verificação da versão 2

Verificado localmente em 18/11/2026 com Node.js 24.14.1.

## Testes automatizados

`npm test`: 6 testes aprovados, 0 falhas.

- Clientes reais WebSocket e HTTP polling recebem a mesma mensagem.
- Uma sala não recebe nem pesquisa mensagens de outra.
- Validação rejeita mensagens vazias, tipos inválidos e tamanho excessivo.
- Apelidos duplicados são rejeitados; reenvio com o mesmo identificador não duplica mensagens.
- Limite de envio, limite de cinco fixados, autoria e moderação são aplicados no servidor.
- Banco reaberto após parar o servidor mantém sala, identidade, histórico e fixados.
- Histórico com 85 mensagens pagina 80 + 5, sem lacunas ou duplicação.
- Aplicação HTTP e política de conteúdo presentes; origem externa e sala inexistente rejeitadas.

## Navegador

- Criação de sala pela tela inicial e entrada automática.
- Convite aberto em outro contexto de armazenamento solicita apelido.
- Duas pessoas conectadas, envio e recebimento em tempo real e presença atualizada.
- Busca encontra mensagem por texto; fixação aparece na faixa e no painel.
- Recarregar a página preserva identidade, histórico e fixados.
- Layout a 390 × 844 sem rolagem horizontal; detalhes acessíveis pelo botão do cabeçalho.
- Console sem erros ou avisos durante o fluxo testado.

## Limites da verificação

Hospedagem pública e build Docker não foram executados. Comportamento de teclado virtual em aparelho físico não foi testado. A aplicação não usa contas nem oferece criptografia de ponta a ponta; o README descreve o funcionamento da identidade e o acesso por convite.
