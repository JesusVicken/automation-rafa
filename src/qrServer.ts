import express from 'express';
import QRCode from 'qrcode';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;

// Parse form data (login POST)
app.use(express.urlencoded({ extended: true }));

// Credenciais de login
const AUTH_USER = process.env.AUTH_USER || 'rafa';
const AUTH_PASS = process.env.AUTH_PASS || 'rafa123';

// Token de sessão (gerado a cada reinício do servidor)
const SESSION_TOKEN = crypto.randomBytes(32).toString('hex');
const validSessions = new Set<string>();

let currentQr: string | null = null;
let isConnected: boolean = false;

// Helper para ler cookies do request
function getCookie(req: express.Request, name: string): string | undefined {
    const raw = req.headers.cookie || '';
    const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : undefined;
}

// Middleware de autenticação
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const token = getCookie(req, 'session');
    if (token && validSessions.has(token)) {
        return next();
    }
    res.redirect('/login');
}

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

// CSS comum em Dark Mode
const BASE_CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; padding: 40px; border-radius: 24px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6); max-width: 420px; width: 90%; }
    .logo { font-size: 36px; margin-bottom: 8px; }
    h1 { font-size: 22px; margin-bottom: 6px; color: #f8fafc; }
    .subtitle { color: #64748b; font-size: 13px; margin-bottom: 28px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
`;

// Inicializa o servidor web
export function startWebServer() {

    // =============================================
    // ROTA: Redirect raiz → login
    // =============================================
    app.get('/', (req, res) => {
        res.redirect('/login');
    });

    // =============================================
    // ROTA: Página de Login (GET)
    // =============================================
    app.get('/login', (req, res) => {
        // Se já está logado, vai direto pro QR
        const token = getCookie(req, 'session');
        if (token && validSessions.has(token)) {
            return res.redirect('/qr');
        }

        const error = req.query.error ? '<p class="error">⚠️ Usuário ou senha incorretos.</p>' : '';

        res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Login | Automation Rafa</title>
                <style>
                    ${BASE_CSS}
                    .form-group { margin-bottom: 16px; text-align: left; }
                    label { display: block; color: #94a3b8; font-size: 13px; font-weight: 600; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
                    input { width: 100%; padding: 12px 16px; background: #0f172a; border: 1px solid #334155; border-radius: 12px; color: #f8fafc; font-size: 15px; outline: none; transition: border-color 0.2s; }
                    input:focus { border-color: #38bdf8; }
                    button { width: 100%; padding: 14px; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; margin-top: 8px; }
                    button:hover { transform: translateY(-1px); box-shadow: 0 8px 25px rgba(59,130,246,0.4); }
                    button:active { transform: translateY(0); }
                    .error { color: #f87171; font-size: 13px; margin-bottom: 16px; background: rgba(248,113,113,0.1); padding: 10px; border-radius: 8px; border: 1px solid rgba(248,113,113,0.2); }
                    .footer { margin-top: 24px; color: #475569; font-size: 11px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="logo">🔐</div>
                    <h1>Painel de Controle</h1>
                    <p class="subtitle">Automation Rafa — OCR Financeiro</p>
                    ${error}
                    <form method="POST" action="/login">
                        <div class="form-group">
                            <label>Usuário</label>
                            <input type="text" name="username" placeholder="Digite seu usuário" required autocomplete="username">
                        </div>
                        <div class="form-group">
                            <label>Senha</label>
                            <input type="password" name="password" placeholder="Digite sua senha" required autocomplete="current-password">
                        </div>
                        <button type="submit">Entrar</button>
                    </form>
                    <p class="footer">Acesso restrito ao administrador</p>
                </div>
            </body>
            </html>
        `);
    });

    // =============================================
    // ROTA: Processar Login (POST)
    // =============================================
    app.post('/login', (req, res) => {
        const { username, password } = req.body;

        if (username === AUTH_USER && password === AUTH_PASS) {
            // Gera um token de sessão único
            const token = crypto.randomBytes(24).toString('hex');
            validSessions.add(token);

            // Define o cookie (expira em 7 dias)
            res.cookie('session', token, {
                httpOnly: true,
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
                sameSite: 'lax'
            });

            console.log(`[+] Login bem-sucedido! Usuário: ${username}`);
            return res.redirect('/qr');
        }

        console.log(`[-] Tentativa de login falhou. Usuário: ${username}`);
        res.redirect('/login?error=1');
    });

    // =============================================
    // ROTA: Logout
    // =============================================
    app.get('/logout', (req, res) => {
        const token = getCookie(req, 'session');
        if (token) validSessions.delete(token);
        res.clearCookie('session');
        res.redirect('/login');
    });

    // =============================================
    // ROTA: Página do QR Code (protegida por login)
    // =============================================
    app.get('/qr', requireAuth, async (req, res) => {
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
                            ${BASE_CSS}
                            .icon { font-size: 64px; margin-bottom: 20px; }
                            h1 { font-size: 24px; color: #4ade80; margin-bottom: 10px; }
                            .status { display: inline-block; margin-top: 16px; background: rgba(74,222,128,0.1); color: #4ade80; border: 1px solid rgba(74,222,128,0.2); padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; }
                            .logout { display: inline-block; margin-top: 20px; color: #64748b; font-size: 12px; text-decoration: none; }
                            .logout:hover { color: #f87171; }
                        </style>
                    </head>
                    <body>
                        <div class="card">
                            <div class="icon">✅</div>
                            <h1>WhatsApp Conectado!</h1>
                            <p>O robô de OCR Financeiro está ativo e escutando os comprovantes 24/7.</p>
                            <div><span class="status">🟢 Online — Processando comprovantes</span></div>
                            <a href="/logout" class="logout">Sair do painel</a>
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
                            ${BASE_CSS}
                            .spinner { border: 4px solid #334155; border-top: 4px solid #38bdf8; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
                            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                            h1 { font-size: 20px; color: #38bdf8; }
                            .logout { display: inline-block; margin-top: 20px; color: #64748b; font-size: 12px; text-decoration: none; }
                            .logout:hover { color: #f87171; }
                        </style>
                    </head>
                    <body>
                        <div class="card">
                            <div class="spinner"></div>
                            <h1>Gerando QR Code...</h1>
                            <p>Aguarde alguns segundos. Esta página atualiza automaticamente.</p>
                            <a href="/logout" class="logout">Sair do painel</a>
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
                        ${BASE_CSS}
                        p { margin-bottom: 24px; }
                        .qr-box { background: white; padding: 16px; border-radius: 16px; display: inline-block; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); }
                        .qr-box img { display: block; border-radius: 8px; }
                        .badge { display: inline-block; margin-top: 20px; background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.2); padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; }
                        .logout { display: inline-block; margin-top: 16px; color: #64748b; font-size: 12px; text-decoration: none; }
                        .logout:hover { color: #f87171; }
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
                        <a href="/logout" class="logout">Sair do painel</a>
                    </div>
                </body>
                </html>
            `);

        } catch (error) {
            console.error('[-] Erro ao renderizar a página Web do QR Code:', error);
            res.status(500).send('Erro interno ao gerar página do QR Code.');
        }
    });

    // =============================================
    // ROTA: Healthcheck para UptimeRobot (NÃO exige login)
    // =============================================
    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'ok', connected: isConnected });
    });

    app.listen(Number(PORT), '0.0.0.0', () => {
        console.log(`[+] Servidor Web ativo na porta ${PORT} (0.0.0.0)`);
    });
}
