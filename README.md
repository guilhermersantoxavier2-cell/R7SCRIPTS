# R7 SCRIPTS

Hub de scripts com painel administrativo, publicação de embeds, links de TikTok/Discord e estatísticas.

## Publicar na Netlify

Consulte o guia completo em **README-NETLIFY.md**. Esta versão já inclui:
- Netlify Functions para executar a API Express;
- Netlify Blobs para persistir publicações e imagens enviadas;
- autenticação administrativa por cookie assinado;
- suporte a imagens por upload (PNG, JPG, WEBP ou GIF, até 5 MB) e por URL.

## Rodar localmente

1. Instale Node.js 20 ou superior.
2. Copie `.env.example` para `.env`.
3. Preencha `SESSION_SECRET` (mínimo de 32 caracteres) e `ADMIN_ACCESS_CODE`, além dos links opcionais.
4. Execute `npm install` e depois `npm start`.
5. Abra `http://localhost:3000`.

## Como funciona

- O botão ☰ abre o login administrativo.
- O painel tem as abas **Publicar**, **Análises** e **Embeds Públicos**.
- Ao publicar, o embed aparece para os visitantes.
- A lista administrativa permite apagar publicações.
- O gráfico compara as visualizações registradas de cada embed.
- Cada clique em “Pegar Script” inicia novamente as duas etapas.

## Observações

- Não existe código administrativo padrão neste pacote. Defina seu próprio `ADMIN_ACCESS_CODE` nas variáveis de ambiente; não reutilize códigos antigos ou previsíveis.
- O site não consegue confirmar tecnicamente se alguém seguiu uma conta ou entrou em um servidor. As respostas “Sim/Não” são autodeclaradas.
- O site não executa Lua; apenas armazena e entrega o texto informado pelo administrador.
- Para Netlify, não envie `.env` ao GitHub. Cadastre os segredos no painel da Netlify.
