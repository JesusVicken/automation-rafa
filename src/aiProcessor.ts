import { createWorker, Worker } from 'tesseract.js';

export interface OcrResult {
    valor: string;
    favorecido_fornecedor: string;
    data: string;
    descricao: string;
    tipo_documento: string;
    classificacao: string;
    subcategoria: string;
    observacoes: string;
    aba: string; // Nome da aba de destino ("Pessoal", "Materiais" ou "Outros")
}

// Instância reutilizável do Worker do Tesseract (Singleton para alta velocidade)
let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
    if (!workerPromise) {
        console.log('[*] Inicializando Motor de OCR Tesseract.js (Alta Velocidade)...');
        workerPromise = createWorker('por');
    }
    return workerPromise;
}

/**
 * Mapeamento dos meses por extenso para números
 */
const MESES: { [key: string]: string } = {
    'janeiro': '01', 'fevereiro': '02', 'março': '03', 'marco': '03',
    'abril': '04', 'maio': '05', 'junho': '06', 'julho': '07',
    'agosto': '08', 'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
};

/**
 * Processa o comprovante financeiro localmente com máxima velocidade e precisão.
 */
export async function processMediaWithGemini(buffer: Buffer, mimeType: string = 'image/jpeg'): Promise<OcrResult | null> {
    try {
        const startTime = Date.now();
        console.log('[*] Processando comprovante via Tesseract.js Otimizado...');
        
        const worker = await getWorker();
        const { data: { text } } = await worker.recognize(buffer);

        console.log(`[+] OCR concluído em ${(Date.now() - startTime)}ms!`);
        console.log('\n--- Texto Extraído pelo OCR ---');
        console.log(text);
        console.log('-------------------------------\n');

        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

        // =============================================
        // 1. EXTRAÇÃO DO VALOR
        // =============================================
        let valor = 'R$ 0,00';
        
        // Padrões específicos por ordem de precisão:
        const valorTotalMatch = text.match(/Valor\s+total\s*:?\s*(R\$\s?[\d.,]+)/i);
        const totalAPagarMatch = text.match(/Total\s+a\s+pagar\s*:?\s*(R\$\s?[\d.,]+)/i);
        const pagamentoRealizadoMatch = text.match(/Pagamento\s+realizado\s*\n?\s*(R\$\s?[\d.,]+)/i);
        const valorIsoladoMatch = text.match(/^Valor\s*\n?\s*(R\$\s?[\d.,]+)/im);
        
        if (valorTotalMatch) {
            valor = valorTotalMatch[1];
        } else if (totalAPagarMatch) {
            valor = totalAPagarMatch[1];
        } else if (pagamentoRealizadoMatch) {
            valor = pagamentoRealizadoMatch[1];
        } else if (valorIsoladoMatch) {
            valor = valorIsoladoMatch[1];
        } else {
            // Fallback: Pega o primeiro R$ que não seja R$ 0,00
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
        let data = new Date().toLocaleDateString('pt-BR');

        // Formato dd/mm/aaaa
        const dataPagMatch = text.match(/(?:Data\s+d[eo]\s+pagam[^\n]*?|Data\s+de\s+lan[çc]amento\s*:?\s*|Data\s+e\s+hor[áa]rio[^\n]*?)(\d{2}[\/\.-]\d{2}[\/\.-]\d{4})/i);
        // Formato extenso: "24 de julho de 2026"
        const dataExtensoMatch = text.match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/i);

        if (dataPagMatch) {
            data = dataPagMatch[1];
        } else if (dataExtensoMatch) {
            const dia = dataExtensoMatch[1].padStart(2, '0');
            const mesExtenso = dataExtensoMatch[2].toLowerCase();
            const ano = dataExtensoMatch[3];
            const mes = MESES[mesExtenso] || '01';
            data = `${dia}/${mes}/${ano}`;
        } else {
            const dataMatch = text.match(/(\d{2}[\/\.-]\d{2}[\/\.-]\d{4})/);
            if (dataMatch) data = dataMatch[1];
        }

        // =============================================
        // 3. EXTRAÇÃO DO PAGADOR / ORIGEM / NOME
        // =============================================
        let pagador = 'Não identificado';

        // Padrão C6 Bank: "Conta de origem" -> linha seguinte é o nome
        for (let i = 0; i < lines.length; i++) {
            if (/Conta\s+de\s+origem/i.test(lines[i])) {
                for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                    if (lines[j].length > 3 && !/^(Banco|Agência|Conta|JP|GO|\d+)/i.test(lines[j])) {
                        pagador = lines[j];
                        break;
                    }
                }
                break;
            }
        }

        // Padrão Banco Inter: "Quem pagou" -> "Nome <NOME>"
        if (pagador === 'Não identificado') {
            for (let i = 0; i < lines.length; i++) {
                if (/^Quem\s+pagou/i.test(lines[i])) {
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
        }

        // Padrão Banco do Brasil: "Pagador" na linha, nome na linha de baixo
        if (pagador === 'Não identificado') {
            for (let i = 0; i < lines.length; i++) {
                if (/^Pagador$/i.test(lines[i])) {
                    if (i + 1 < lines.length && !/^(CPF|CNPJ|Agência|Conta|Instituição|Chave)/i.test(lines[i + 1])) {
                        pagador = lines[i + 1];
                        break;
                    }
                }
            }
        }

        // Padrão Itaú Detalhe do lançamento: Nome da loja/estabelecimento (Ex: "Ecommerce geoplas")
        if (pagador === 'Não identificado') {
            const detalheLancamento = lines.find(l => /Detalhe\s+do\s+lan[çc]amento/i.test(l));
            if (detalheLancamento) {
                const idx = lines.indexOf(detalheLancamento);
                if (idx + 1 < lines.length) {
                    pagador = lines[idx + 1];
                }
            }
        }

        // Padrão SiPag/Sicoob: "Quem vai receber"
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

        // Fallback: Busca linha "Nome <TEXTO_EM_MAIUSCULAS>"
        if (pagador === 'Não identificado') {
            for (let i = 0; i < lines.length; i++) {
                const nomeMatch = lines[i].match(/^Nome\s+([A-ZÁÉÍÓÚÀÂÊÔÃÕÇ][A-ZÁÉÍÓÚÀÂÊÔÃÕÇ\s]{4,})/);
                if (nomeMatch) {
                    pagador = nomeMatch[1].trim();
                    break;
                }
            }
        }

        // =============================================
        // 4. EXTRAÇÃO DO BANCO / INSTITUIÇÃO
        // =============================================
        let banco = 'Banco não identificado';
        
        if (/C6\s*Bank|336\s*-\s*Banco\s*C6/i.test(text)) {
            banco = 'C6 Bank';
        } else if (/Banco\s*Inter|inter\b/i.test(text)) {
            banco = 'Banco Inter';
        } else if (/Banco\s+do\s+Brasil|Comprovante\s+BB|BCO\s+DO\s+BRASIL/i.test(text)) {
            banco = 'Banco do Brasil';
        } else if (/Itaú|Itau|ITAÚ\s+UNIBANCO/i.test(text)) {
            banco = 'Itaú';
        } else if (/Sicoob|sipag/i.test(text)) {
            banco = 'Sicoob';
        } else if (/Nubank|Nu\s+Pagamentos/i.test(text)) {
            banco = 'Nubank';
        } else if (/Bradesco/i.test(text)) {
            banco = 'Bradesco';
        } else if (/Santander/i.test(text)) {
            banco = 'Santander';
        } else if (/Caixa\s*Econ[oô]mica|CEF\b/i.test(text)) {
            banco = 'Caixa Econômica';
        } else if (/PagBank|PagSeguro/i.test(text)) {
            banco = 'PagBank';
        } else if (/Sicredi/i.test(text)) {
            banco = 'Sicredi';
        } else if (/Mercado\s*Pago/i.test(text)) {
            banco = 'Mercado Pago';
        } else {
            const instMatch = text.match(/Institui[çc][ãa]o\s*:?\s*([^\n\r]+)/i);
            if (instMatch) banco = instMatch[1].trim();
        }

        // =============================================
        // 5. EXTRAÇÃO DO ID DA TRANSAÇÃO / BARCODE / HASH
        // =============================================
        let id_transacao = 'N/A';
        
        const idTransacaoMatch = text.match(/(?:ID\s+da\s+Transa[çc][ãa]o|ID)\s*:?\s*([A-Za-z0-9]{10,})/i);
        if (idTransacaoMatch) {
            id_transacao = idTransacaoMatch[1].trim();
        }

        if (id_transacao === 'N/A') {
            const autMatch = text.match(/(?:C[óo]digo\s+de\s+autentica[çc][ãa]o|Autentica[çc][ãa]o\s*(?:SISBB)?)\s*:?\s*([A-Za-z0-9.:-]+)/i);
            if (autMatch) id_transacao = autMatch[1].trim();
        }

        if (id_transacao === 'N/A') {
            const codBarrasMatch = text.match(/C[óo]digo\s+de\s+barras\s*:?\s*\n?\s*([0-9.\s]{15,})/i);
            if (codBarrasMatch) {
                id_transacao = codBarrasMatch[1].replace(/\s/g, '').substring(0, 32);
            }
        }

        if (id_transacao === 'N/A') {
            const finalCartaoMatch = text.match(/Final\s+(\d{4})/i);
            if (finalCartaoMatch) {
                id_transacao = `Cartão Final ${finalCartaoMatch[1]}`;
            }
        }

        // =============================================
        // 6. EXTRAÇÃO DO STATUS / TIPO DE DOCUMENTO
        // =============================================
        let status = 'Pix Realizado';
        if (/Pix\s+realizado|Pix\s+enviado/i.test(text)) {
            status = 'Pix Realizado';
        } else if (/Pagamento\s+realizado/i.test(text)) {
            status = 'Pagamento Realizado';
        } else if (/Despesa\s+no\s+Brasil|Parcelamento/i.test(text)) {
            status = 'Cartão de Crédito';
        } else if (/Conclu[ií]do|Sucesso/i.test(text)) {
            status = 'Concluído';
        }

        // =============================================
        // 7. ROTEAMENTO DE ABA ("Pessoal", "Materiais" ou "Outros")
        // =============================================
        let classificacao = 'Outros';
        if (/m[ãa]o\s+de\s+obra|engenhar|servi[çc]o|sal[áa]rio|di[áa]ria|empreiteira|pedreiro|ajudante/i.test(text)) {
            classificacao = 'Pessoal';
        } else if (/materiai|cimento|areia|tijolo|ferro|metal|tintas|madeira|brita|equipamento|nf-e|nfe|compras?/i.test(text)) {
            classificacao = 'Materiais';
        }

        // Montagem do resultado para roteamento de abas limpo no Google Sheets
        const result: OcrResult = {
            valor: valor,
            favorecido_fornecedor: pagador,
            data: data,
            descricao: `Pagamento via ${banco} (Autenticação: ${id_transacao})`,
            tipo_documento: status,
            classificacao: classificacao,
            subcategoria: 'Não classificado',
            observacoes: 'Adicionado automaticamente via WhatsApp Bot',
            aba: classificacao // Define a aba de destino ("Pessoal", "Materiais" ou "Outros")
        };

        console.log('[+] Resultado do OCR Otimizado:', result);
        return result;

    } catch (error) {
        console.error('[-] Erro durante a leitura no Tesseract.js:', error);
        return null;
    }
}
