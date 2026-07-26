import express from 'express';
import QRCode from 'qrcode';

const app = express();
const PORT = process.env.PORT || 3000;

let currentQr: string | null = null;
let isConnected: boolean = false;

// Atualiza o estado do QR Code
export function updateQrCode(qr: string) {
    currentQr = qr;
    isConnected = false;
}

// Atualiza o estado da Conexão
export function updateConnectionStatus(connected: boolean) {
    isConnected = connected;
    if (connected) {
        currentQr = null; // Limpa o QR quando conectar
    }
}

// Inicializa o servidor web
export function startWebServer() {
    app.get('/', (req, res) => {
        res.redirect('/qr');
    });

    app.get('/qr', async (req, res) => {
        try {
            if (isConnected) {
                return res.send(`
                    <!DOCTYPE html>
                    <html lang="pt-BR">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>WhatsApp Conectado | Automation Rafa</title>
                        <style>
                            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                            .card { background: #1e293b; border: 1px solid #334155; padding: 40px; border-radius: 20px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); max-width: 400px; width: 90%; }
                            .icon { font-size: 64px; margin-bottom: 20px; }
                            h1 { font-size: 24px; color: #4ade80; margin-bottom: 10px; }
                            p { color: #94a3b8; font-size: 15px; }
                        </style>
                    </head>
                    <body>
                        <div class="card">
                            <div class="icon">✅</div>
                            <h1>WhatsApp Conectado!</h1>
                            <p>O robô de OCR Financeiro está ativo e escutando os comprovantes 24/7.</p>
                        </div>
                    </body>
                    </html>
                `);
            }

            if (!currentQr) {
                return res.send(`
                    <!DOCTYPE html>
                    <html lang="pt-BR">
                    <head>
                        <meta charset="UTF-8">
                        <meta http-equiv="refresh" content="5">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Gerando QR Code... | Automation Rafa</title>
                        <style>
                            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                            .card { background: #1e293b; border: 1px solid #334155; padding: 40px; border-radius: 20px; text-align: center; max-width: 400px; width: 90%; }
                            .spinner { border: 4px solid #334155; border-top: 4px solid #38bdf8; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
                            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                            h1 { font-size: 20px; color: #38bdf8; }
                            p { color: #94a3b8; font-size: 14px; }
                        </style>
                    </head>
                    <body>
                        <div class="card">
                            <div class="spinner"></div>
                            <h1>Gerando QR Code...</h1>
                            <p>Aguarde alguns segundos. Esta página atualiza automaticamente.</p>
                        </div>
                    </body>
                    </html>
                `);
            }

            // Converte o QR Code para DataURL de imagem PNG
            const qrImageUrl = await QRCode.toDataURL(currentQr, { width: 300, margin: 2 });

            res.send(`
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                    <meta charset="UTF-8">
                    <meta http-equiv="refresh" content="8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Escanear WhatsApp | Automation Rafa</title>
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
                        .card { background: #1e293b; border: 1px solid #334155; padding: 35px; border-radius: 24px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6); max-width: 420px; width: 90%; }
                        h1 { font-size: 22px; margin-bottom: 8px; color: #f8fafc; }
                        p { color: #94a3b8; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
                        .qr-box { background: white; padding: 16px; border-radius: 16px; display: inline-block; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); }
                        .qr-box img { display: block; border-radius: 8px; }
                        .badge { display: inline-block; margin-top: 20px; background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.2); padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>Conectar WhatsApp</h1>
                        <p>Abra o WhatsApp no seu celular → <b>Aparelhos Conectados</b> → <b>Conectar um Aparelho</b> e aponte a câmera para a imagem abaixo:</p>
                        <div class="qr-box">
                            <img src="${qrImageUrl}" alt="QR Code WhatsApp" width="280" height="280">
                        </div>
                        <div>
                            <span class="badge">🔄 Atualização automática ativa</span>
                        </div>
                    </div>
                </body>
                </html>
            `);

        } catch (error) {
            console.error('[-] Erro ao renderizar a página Web do QR Code:', error);
            res.status(500).send('Erro interno ao gerar página do QR Code.');
        }
    });

    app.listen(Number(PORT), '0.0.0.0', () => {
        console.log(`[+] Servidor Web do QR Code ativo na porta ${PORT} (0.0.0.0)`);
    });
}
