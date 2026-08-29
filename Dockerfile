# Utiliza a imagem oficial mais recente e leve do Node.js
FROM node:24-alpine

# Cria e define a pasta interna do contêiner para o app
WORKDIR /app

# Copia os arquivos de configuração de dependências
COPY package*.json ./

# Instala apenas as dependências necessárias para rodar o servidor
RUN npm install --production

# Copia todo o restante do código (server.js, pastas public e appinfo)
COPY . .

# Expõe a porta interna do contêiner
EXPOSE 3000

# Comando para iniciar o servidor Node.js de forma definitiva
CMD ["node", "server.js"]
