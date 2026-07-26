import { WASocket, WAMessage, downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { processMediaWithGemini } from './aiProcessor';
import { saveToSheets } from './sheetsStorage';

const logger = pino({ level: 'silent' });

export function setupMessageHandler(sock: WASocket) {
    sock.ev.on('messages.upsert', async (m) => {
        // Ignorar se não houver mensagens
        if (!m.messages || m.messages.length === 0) return;

        const msg = m.messages[0];

        // Desativado temporariamente para permitir testes com o próprio número que escaneou o QR Code
        // if (msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        if (!remoteJid) return;

        // Pegar JIDs permitidos do .env
        const allowedJidsStr = process.env.ALLOWED_GROUP_JIDS || '';
        const allowedJids = allowedJidsStr.split(',').map(jid => jid.trim());

        // Se o JID da mensagem não estiver na lista de permitidos, ignoramos
        if (!allowedJids.includes(remoteJid)) {
            return; // Filtro de ruído: Sai silenciosamente
        }

        // Analisar o tipo de mensagem para ver se contém mídia (imagem ou documento)
        const messageType = Object.keys(msg.message || {})[0];
        
        let isMedia = false;
        if (messageType === 'imageMessage' || messageType === 'documentMessage') {
            isMedia = true;
        } else if (messageType === 'extendedTextMessage') {
            // Pode ser um texto encaminhado ou com citação, mas não é a mídia original
            isMedia = false;
        }

        if (!isMedia) {
            console.log(`[!] Mensagem recebida de ${remoteJid}, mas não é uma mídia suportada (é um ${messageType}). Ignorando.`);
            return;
        }

        console.log(`\n[+] Mídia recebida no grupo permitido (${remoteJid})! Tipo: ${messageType}`);

        try {
            // Faz o download do buffer da mídia
            const buffer = await downloadMediaMessage(
                msg,
                'buffer',
                { },
                { 
                    logger: logger as any,
                    reuploadRequest: sock.updateMediaMessage 
                }
            );

            console.log(`[+] Download concluído com sucesso. Tamanho: ${buffer.length} bytes.`);
            
            // Envia o buffer para o Motor de Visão (Gemini) no Passo 3
            // Passamos o messageType para tentar ajudar a IA (por padrão usamos mimetype aproximado)
            const mimeType = messageType === 'imageMessage' ? 'image/jpeg' : 'application/pdf';
            const ocrData = await processMediaWithGemini(buffer, mimeType);

            if (ocrData) {
                // Passo 4: Persistência no Google Sheets
                const result = await saveToSheets(ocrData);

                if (result.success) {
                    // 1. Enviar a reação de emoji ✅ de volta na mensagem do WhatsApp
                    await sock.sendMessage(remoteJid, {
                        react: {
                            text: '✅',
                            key: msg.key
                        }
                    });

                    // 2. Formatar o valor total acumulado na planilha
                    const formattedTotal = result.totalSum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

                    // 3. Montar a mensagem de confirmação detalhada
                    const replyText = `📄 *COMPROVANTE RECEBIDO COM SUCESSO!*\n\n` +
                        `👤 *Pagador:* ${ocrData.pagador}\n` +
                        `🏦 *Banco:* ${ocrData.banco}\n` +
                        `💵 *Valor:* ${ocrData.valor}\n` +
                        `📅 *Data:* ${ocrData.data}\n` +
                        `🆔 *ID:* ${ocrData.id_transacao}\n\n` +
                        `📊 *Total Acumulado na Planilha:* ${formattedTotal}`;

                    // Envia a resposta marcando/citando a mensagem do comprovante (quoted: msg)
                    await sock.sendMessage(remoteJid, { text: replyText }, { quoted: msg });

                    console.log('[+] Reação e resposta com total enviadas com sucesso!');
                } else {
                    // Caso falhe ao salvar na planilha
                    await sock.sendMessage(remoteJid, { react: { text: '❌', key: msg.key } });
                }
            } else {
                // Caso não consiga extrair os dados
                await sock.sendMessage(remoteJid, { react: { text: '❓', key: msg.key } });
            }

        } catch (error) {
            console.error('[-] Erro ao fazer o download da mídia:', error);
        }
    });
}
