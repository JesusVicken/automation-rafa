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
 * 
 * Modelos suportados: Banco do Brasil, Banco Inter, Nubank, Itaú, Bradesco, Santander,
 * C6 Bank, Caixa Econômica, PagBank, Sicoob/SiPag e outros.
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

        // =============================================
        // 1. EXTRAÇÃO DO VALOR
        // =============================================
        // Prioridade 1: "Valor total" → R$ xxx (evita pegar Desconto/Juros/Multa)
        // Prioridade 2: "Total a pagar" → R$ xxx (padrão SiPag/Sicoob)
        // Prioridade 3: "Pagamento realizado" → R$ xxx (padrão Inter header)
        // Prioridade 4: Primeiro R$ que NÃO seja R$ 0,00
        let valor = 'R$ 0,00';
        
        const valorTotalMatch = text.match(/Valor\s+total\s*:?\s*(R\$\s?[\d.,]+)/i);
        const totalAPagarMatch = text.match(/Total\s+a\s+pagar\s*:?\s*(R\$\s?[\d.,]+)/i);
        const pagamentoRealizadoMatch = text.match(/Pagamento\s+realizado\s*:?\s*(R\$\s?[\d.,]+)/i);
        
        if (valorTotalMatch) {
            valor = valorTotalMatch[1];
        } else if (totalAPagarMatch) {
            valor = totalAPagarMatch[1];
        } else if (pagamentoRealizadoMatch) {
            valor = pagamentoRealizadoMatch[1];
        } else {
            // Fallback: pega todos os R$ e usa o primeiro que NÃO seja R$ 0,00
            const allValues = text.match(/R\$\s?[\d.,]+/gi) || [];
            for (const v of allValues) {
                const cleaned = v.replace(/[^\d,]/g, '').replace(',', '.');
                if (parseFloat(cleaned) > 0) {
                    valor = v;
                    break;
                }
            }
        }

        // =============================================
        // 2. EXTRAÇÃO DA DATA
        // =============================================
        // Prioridade 1: "Data do pagamento" ou "Data do pagam" → dd/mm/aaaa
        // Prioridade 2: Qualquer data dd/mm/aaaa no texto
        let data = new Date().toLocaleDateString('pt-BR');

        const dataPagMatch = text.match(/Data\s+d[eo]\s+pagam[^\n]*?(\d{2}[\/\.-]\d{2}[\/\.-]\d{4})/i);
        if (dataPagMatch) {
            data = dataPagMatch[1];
        } else {
            const dataMatch = text.match(/(\d{2}[\/\.-]\d{2}[\/\.-]\d{4})/);
            if (dataMatch) data = dataMatch[1];
        }

        // =============================================
        // 3. EXTRAÇÃO DO PAGADOR (QUEM PAGOU)
        // =============================================
        // Prioridade 1: Seção "Quem pagou" → procura "Nome" nas linhas seguintes (padrão Inter)
        // Prioridade 2: Linha "Pagador" isolada → próxima linha é o nome (padrão BB/Pix)
        // Prioridade 3: "Nome" seguido de texto EM MAIÚSCULAS (indica nome de pessoa)
        // Prioridade 4: "Quem vai receber" → próxima linha (padrão SiPag, quando não há pagador)
        let pagador = 'Não identificado';

        // Estratégia 1: Seção "Quem pagou" (Inter)
        for (let i = 0; i < lines.length; i++) {
            if (/^Quem\s+pagou/i.test(lines[i])) {
                // Procura "Nome" nas próximas 5 linhas após "Quem pagou"
                for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
                    const nomeMatch = lines[j].match(/^Nome\s+(.+)/i);
                    if (nomeMatch) {
                        pagador = nomeMatch[1].trim();
                        break;
                    }
                }
                break;
            }
        }

        // Estratégia 2: "Pagador" como título de seção (BB / Pix)
        if (pagador === 'Não identificado') {
            for (let i = 0; i < lines.length; i++) {
                // Só faz match se a linha inteira for "Pagador" (ou quase)
                if (/^Pagador$/i.test(lines[i]) || /^Pagador\s*$/i.test(lines[i])) {
                    if (i + 1 < lines.length) {
                        // Próxima linha é o nome (ignora se for CPF, Agência, etc.)
                        const nextLine = lines[i + 1];
                        if (!/^(CPF|CNPJ|Agência|Conta|Instituição|Chave)/i.test(nextLine)) {
                            pagador = nextLine;
                            break;
                        }
                    }
                }
            }
        }

        // Estratégia 3: "Nome" seguido de texto em MAIÚSCULAS (ex: "Nome MARIA FATIMA MARQUES")
        if (pagador === 'Não identificado') {
            for (let i = 0; i < lines.length; i++) {
                const nomeMatch = lines[i].match(/^Nome\s+([A-ZÁÉÍÓÚÀÂÊÔÃÕÇ][A-ZÁÉÍÓÚÀÂÊÔÃÕÇ\s]{4,})/);
                if (nomeMatch) {
                    pagador = nomeMatch[1].trim();
                    break;
                }
            }
        }

        // Estratégia 4: "Quem vai receber" (SiPag/Sicoob - usa beneficiário como referência)
        if (pagador === 'Não identificado') {
            for (let i = 0; i < lines.length; i++) {
                if (/Quem\s+vai\s+receber/i.test(lines[i])) {
                    if (i + 1 < lines.length) {
                        pagador = lines[i + 1].trim();
                        break;
                    }
                }
            }
        }

        // Estratégia 5: "Beneficiário" ou "Benefici" seguido de texto
        if (pagador === 'Não identificado') {
            const benefMatch = text.match(/Benefici[áa]rio\s*:?\s*([^\n\r]+)/i);
            if (benefMatch) pagador = benefMatch[1].trim();
        }

        // =============================================
        // 4. EXTRAÇÃO DO BANCO / INSTITUIÇÃO
        // =============================================
        let banco = 'Banco não identificado';
        
        if (/Banco do Brasil|Comprovante BB|BCO DO BRASIL/i.test(text)) {
            banco = 'Banco do Brasil';
        } else if (/Nubank|Nu Pagamentos/i.test(text)) {
            banco = 'Nubank';
        } else if (/Itaú|Itau/i.test(text)) {
            banco = 'Itaú';
        } else if (/Bradesco/i.test(text)) {
            banco = 'Bradesco';
        } else if (/Banco\s*Inter|inter\s*S[\.\s\/]?A/i.test(text)) {
            banco = 'Banco Inter';
        } else if (/Santander/i.test(text)) {
            banco = 'Santander';
        } else if (/C6\s*S\.A\.|C6\s*Bank/i.test(text)) {
            banco = 'C6 Bank';
        } else if (/Caixa\s*Econ[oô]mica|CEF\b/i.test(text)) {
            banco = 'Caixa Econômica';
        } else if (/PagBank|PagSeguro/i.test(text)) {
            banco = 'PagBank';
        } else if (/Sicoob|sipag/i.test(text)) {
            banco = 'Sicoob';
        } else if (/Sicredi/i.test(text)) {
            banco = 'Sicredi';
        } else if (/Mercado\s*Pago/i.test(text)) {
            banco = 'Mercado Pago';
        } else if (/Picpay/i.test(text)) {
            banco = 'PicPay';
        } else {
            // Fallback: tenta extrair da linha "Instituição"
            const instMatch = text.match(/Institui[çc][ãa]o\s*:?\s*([^\n\r]+)/i);
            if (instMatch) {
                const instText = instMatch[1].trim();
                // Se encontrou instituição, tenta mapear para um nome amigável
                if (/Inter/i.test(instText)) banco = 'Banco Inter';
                else if (/Brasil/i.test(instText)) banco = 'Banco do Brasil';
                else if (/Nubank|Nu\s/i.test(instText)) banco = 'Nubank';
                else banco = instText;
            }
        }

        // =============================================
        // 5. EXTRAÇÃO DO ID / AUTENTICAÇÃO
        // =============================================
        let id_transacao = 'N/A';
        
        // Prioridade 1: "ID:" seguido de hash longo (Pix)
        const pixIdMatch = text.match(/\bID\s*:\s*([A-Za-z0-9]{10,})/i);
        if (pixIdMatch) {
            id_transacao = pixIdMatch[1].trim();
        }
        
        // Prioridade 2: "Autenticação" seguido de código
        if (id_transacao === 'N/A') {
            const autMatch = text.match(/Autentica[çc][ãa]o\s*(?:SISBB\s*)?:?\s*([A-Za-z0-9.:]+)/i);
            if (autMatch) id_transacao = autMatch[1].trim();
        }
        
        // Prioridade 3: "Documento" seguido de número
        if (id_transacao === 'N/A') {
            const docMatch = text.match(/Documento\s*:?\s*([0-9.]+)/i);
            if (docMatch) id_transacao = docMatch[1].trim();
        }

        // Prioridade 4: "NSU" seguido de número
        if (id_transacao === 'N/A') {
            const nsuMatch = text.match(/NSU\s*:?\s*([0-9]+)/i);
            if (nsuMatch) id_transacao = nsuMatch[1].trim();
        }

        // Prioridade 5: "Código de barras" → pega a sequência numérica
        if (id_transacao === 'N/A') {
            const codBarrasMatch = text.match(/C[óo]digo\s+de\s+barras\s*:?\s*\n?\s*([0-9.\s]+)/i);
            if (codBarrasMatch) {
                id_transacao = codBarrasMatch[1].replace(/\s/g, '').substring(0, 30);
            }
        }

        // =============================================
        // 6. EXTRAÇÃO DO STATUS
        // =============================================
        let status = 'Processado';
        if (/Pix\s*Enviado/i.test(text)) {
            status = 'Pix Enviado';
        } else if (/Pagamento\s*realizado/i.test(text)) {
            status = 'Pagamento Realizado';
        } else if (/Conclu[ií]do/i.test(text)) {
            status = 'Concluído';
        } else if (/Pix\s*Recebido/i.test(text)) {
            status = 'Pix Recebido';
        } else if (/Transfer[êe]ncia/i.test(text)) {
            status = 'Transferência';
        } else if (/Total\s+a\s+pagar/i.test(text)) {
            status = 'Link de Pagamento';
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
