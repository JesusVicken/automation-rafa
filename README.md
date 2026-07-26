# Automation Rafa - Microserviço de OCR Financeiro via WhatsApp

Middleware em Node.js / TypeScript que intercepta comprovantes bancários enviados via WhatsApp, extrai os dados via OCR local (Tesseract.js) e grava os registros no Google Sheets.

## 🚀 Tecnologias

- **Node.js / TypeScript**
- **@whiskeysockets/baileys** (Conexão WhatsApp Multi-Device)
- **Tesseract.js** (OCR 100% Local para extração de comprovantes)
- **google-spreadsheet** (Persistência no Google Sheets)
- **Docker / Docker Compose** (Containerização para VPS)

## 📦 Como Rodar

1. Copie o arquivo `.env.example` para `.env` e preencha as variáveis.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Execute a aplicação:
   ```bash
   npx tsx whatsappConnection.ts
   ```

## 🐳 Rodar via Docker

```bash
docker-compose up -d --build
```
