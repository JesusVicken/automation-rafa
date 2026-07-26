import { createWorker } from 'tesseract.js';

export interface OcrResult {
    valor: string;
    pagador: string;
    banco: string;
    data: string;
    id_transacao: string;
    status: string;
}

/**
 * Processa o comprovante financeiro localmente sem gastar APIs pagas ou depender de cupons de IA.
 * Usa Tesseract.js (OCR local) + Regex inteligente pré-configurado para bancos brasileiros.
 */
export async function processMediaWithGemini(buffer: Buffer, mimeType: string = 'image/jpeg'): Promise<OcrResult | null> {
    try {
        console.log('[*] Processando comprovante via Tesseract.js (OCR 100% Local)...');
        
        // Inicializa o worker do Tesseract para português
        const worker = await createWorker('por');
        const { data: { text } } = await worker.recognize(buffer);
        await worker.terminate();

        console.log('\n--- Texto Extraído pelo OCR ---');
        console.log(text);
        console.log('-------------------------------\n');

        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

        // 1. Extração do Valor (Ex: R$ 1.000,00 ou R$1000,00)
        const valorMatch = text.match(/R\$\s?[\d.,]+/i);
        const valor = valorMatch ? valorMatch[0] : 'R$ 0,00';

        // 2. Extração da Data (Ex: 25/07/2026 ou 25-07-2026)
        const dataMatch = text.match(/\d{2}[\/\.-]\d{2}[\/\.-]\d{4}/);
        const data = dataMatch ? dataMatch[0] : new Date().toLocaleDateString('pt-BR');

        // 3. Extração do Pagador (Procura por "Pagador", "De:", "Origem:" ou linha subsequente)
        let pagador = 'Não identificado';
        for (let i = 0; i < lines.length; i++) {
            if (/^Pagador|^De:|^Origem:/i.test(lines[i])) {
                // Se a palavra "Pagador" estiver sozinha na linha, o nome está na linha de baixo
                if (i + 1 < lines.length && !lines[i].includes(':')) {
                    pagador = lines[i + 1];
                    break;
                } else if (lines[i].includes(':')) {
                    pagador = lines[i].split(':')[1].trim();
                    break;
                }
            }
        }
        if (pagador === 'Não identificado') {
            const pagadorRegex = /(?:Pagador|De|Nome do Pagador)\s*:?\s*([^\n\r]+)/i;
            const match = text.match(pagadorRegex);
            if (match) pagador = match[1].trim();
        }

        // 4. Extração do Banco / Instituição
        let banco = 'Banco não identificado';
        if (/Banco do Brasil|Comprovante BB|BCO DO BRASIL/i.test(text)) {
            banco = 'Banco do Brasil';
        } else if (/Nubank|Nu Pagamentos/i.test(text)) {
            banco = 'Nubank';
        } else if (/Itaú|Itau/i.test(text)) {
            banco = 'Itaú';
        } else if (/Bradesco/i.test(text)) {
            banco = 'Bradesco';
        } else if (/Inter/i.test(text)) {
            banco = 'Banco Inter';
        } else if (/Santander/i.test(text)) {
            banco = 'Santander';
        } else if (/C6 S\.A\.|C6 Bank/i.test(text)) {
            banco = 'C6 Bank';
        } else if (/Caixa Econômica|CEF/i.test(text)) {
            banco = 'Caixa Econômica';
        } else if (/PagBank|PagSeguro/i.test(text)) {
            banco = 'PagBank';
        } else {
            const instMatch = text.match(/Instituiç[ãa]o\s*:?\s*([^\n\r]+)/i);
            if (instMatch) banco = instMatch[1].trim();
        }

        // 5. Extração do ID Transação / Autenticação / Hash Pix
        let id_transacao = 'N/A';
        const pixIdMatch = text.match(/ID:\s*([A-Za-z0-9]+)/i);
        if (pixIdMatch) {
            id_transacao = pixIdMatch[1].trim();
        } else {
            const autMatch = text.match(/(?:Autenticaç[ãa]o|Documento|NSU)\s*:?\s*([A-Za-z0-9.-]+)/i);
            if (autMatch) id_transacao = autMatch[1].trim();
        }

        // 6. Extração do Status (Pix Enviado, Concluído, etc.)
        let status = 'Pix Enviado';
        if (/Pix Enviado/i.test(text)) {
            status = 'Pix Enviado';
        } else if (/Conclu[ií]do|Sucesso|Realizado/i.test(text)) {
            status = 'Concluído';
        }

        const result: OcrResult = {
            valor,
            pagador,
            banco,
            data,
            id_transacao,
            status
        };

        console.log('[+] Resultado do OCR Local extraído:', result);
        return result;

    } catch (error) {
        console.error('[-] Erro durante a leitura no Tesseract.js:', error);
        return null;
    }
}
