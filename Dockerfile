FROM node:22-alpine

# Cria e define o diretório de trabalho
WORKDIR /app

# Copia os arquivos de dependência
COPY package*.json ./

# Instala as dependências (sem gerar node_modules de dev caso estivéssemos usando flag, mas aqui instalamos tudo para o tsc)
RUN npm install

# Copia o restante do código
COPY . .

# Comando para iniciar o serviço
# O npx tsx será usado para executar diretamente sem precisar de build prévio
CMD ["npx", "tsx", "whatsappConnection.ts"]
