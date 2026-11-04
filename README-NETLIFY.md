# R7 SCRIPTS — publicação na Netlify

Esta versão mantém a interface e adapta a API Express para Netlify Functions. Publicações e imagens enviadas são guardadas em Netlify Blobs (armazenamento persistente da Netlify). Imagens externas continuam sendo usadas por URL.

## Publicar

1. Extraia este ZIP.
2. Envie a pasta `r7-scripts` para um repositório privado no GitHub (não publique arquivos `.env`).
3. Na Netlify, escolha **Add new project → Import an existing project** e conecte o repositório.
4. A configuração está em `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `public`
   - Functions directory: `netlify/functions`
5. Em **Project configuration → Environment variables**, crie:
   - `SESSION_SECRET`: uma sequência aleatória longa, com pelo menos 32 caracteres.
   - `ADMIN_ACCESS_CODE`: um código administrativo forte e privado.
   - `TIKTOK_LINK`: opcional.
   - `DISCORD_SERVER_LINK`: opcional.
   - `NODE_ENV`: `production`.
6. Faça o deploy. Netlify Blobs fica disponível às Functions; os stores `r7-scripts-data` e `r7-scripts-images` são criados no primeiro uso.

## Importante

- Não envie `.env` nem credenciais para o GitHub. Este pacote não inclui o `.env` anterior.
- A sessão administrativa usa cookie assinado e expira em 8 horas; o segredo é `SESSION_SECRET`.
- Os arquivos enviados são limitados a 5 MB e aceitam PNG, JPG, WEBP e GIF.
- Dados são armazenados em Netlify Blobs. Blobs é armazenamento chave/valor; esta implementação mantém o conjunto de publicações em um documento JSON. Para um volume alto de alterações simultâneas, o ideal é migrar os dados para um banco de dados transacional.
- O ambiente local continua funcionando com `npm install` e `npm start`; localmente os dados ficam em `data/embeds.json` e as imagens em `public/uploads/`.

## Variáveis locais

Copie `.env.example` para `.env` e preencha os valores antes de iniciar localmente.
