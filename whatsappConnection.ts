import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import * as qrcode from 'qrcode-terminal';
import * as dotenv from 'dotenv';
import { setupMessageHandler } from './src/messageHandler';

// Carrega as variáveis de ambiente
dotenv.config();

/**
 * Função responsável por estabelecer a conexão com o WhatsApp.
 * É modular e pode ser importada em outros arquivos ou executada isoladamente.
 */
export async function connectToWhatsApp() {
    // Utiliza useMultiFileAuthState para persistir a sessão na pasta especificada
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    // Busca a versão mais recente do WhatsApp Web para evitar o erro 405 Method Not Allowed
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Usando WhatsApp Web v${version.join('.')}, isLatest: ${isLatest}`);

    // Configura o socket (silencia logs excessivos, ajusta o browser e insere a versão correta)
    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }) as any,
        browser: Browsers.macOS('Desktop')
    });

    // Salva as credenciais sempre que houver uma atualização
    sock.ev.on('creds.update', saveCreds);

    // Trata os eventos de atualização de conexão
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('Escaneie o QR Code abaixo com seu WhatsApp:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            // Verifica se o motivo da desconexão não foi um logout intencional
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            
            console.log('Conexão encerrada. Motivo:', lastDisconnect?.error);
            console.log('Tentando reconectar:', shouldReconnect);
            
            if (shouldReconnect) {
                // Reconecta
                connectToWhatsApp();
            } else {
                console.log('Você foi desconectado (logged out). Por favor, apague a pasta auth_info_baileys e leia o QR code novamente.');
            }
        } else if (connection === 'open') {
            console.log('Conexão aberta com sucesso!');
            
            try {
                // Busca todos os grupos em que o número participa
                const groups = await sock.groupFetchAllParticipating();
                
                console.log('\n--- Grupos Disponíveis ---');
                // Itera e imprime o Nome (subject) e o JID (id) de cada grupo
                for (const jid in groups) {
                    const group = groups[jid];
                    console.log(`Nome: ${group.subject} | JID: ${group.id}`);
                }
                console.log('--------------------------\n');
            } catch (error) {
                console.error('Erro ao buscar os grupos:', error);
            }
        }
    });

    // Inicia o interceptador de mídias (Passo 2)
    setupMessageHandler(sock);

    return sock;
}

// Para execução direta (ex: ambiente isolado, Docker, npm start, etc.)
if (require.main === module) {
    connectToWhatsApp().catch(err => console.error('Erro inesperado na aplicação:', err));
}
