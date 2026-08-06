import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { OcrResult } from './aiProcessor';

export interface SaveResult {
    success: boolean;
    totalSum: number;
}

/**
 * Converte strings de valor em formato brasileiro (ex: R$ 1.000,00) ou padrão (1000.00) para número float.
 */
function parseCurrency(str: string): number {
    if (!str) return 0;
    let cleaned = str.replace(/[^\d.,]/g, '').trim();
    if (cleaned.includes(',')) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

export async function saveToSheets(data: OcrResult): Promise<SaveResult> {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const sheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    if (!email || !privateKey || !sheetId) {
        console.error('[-] Erro: Credenciais do Google Sheets ausentes no .env');
        return { success: false, totalSum: 0 };
    }

    try {
        console.log('[*] Autenticando no Google Sheets...');
        
        const auth = new JWT({
            email,
            key: privateKey,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(sheetId, auth);
        await doc.loadInfo();

        // Roteamento dinâmico para a aba correspondente ("Pessoal", "Materiais" ou "Outros")
        const targetTitle = data.aba || data.classificacao || 'Outros';
        const sheet = doc.sheetsByTitle[targetTitle] || doc.sheetsByTitle['Outros'] || doc.sheetsByTitle['Lançamentos'] || doc.sheetsByIndex[0];

        if (!sheet) {
            console.error(`[-] Aba "${targetTitle}" não encontrada na planilha! Abas disponíveis: ${Object.keys(doc.sheetsByTitle).join(', ')}`);
            return { success: false, totalSum: 0 };
        }
        
        console.log(`[*] Inserindo dados na planilha "${doc.title}" (Aba: "${sheet.title}")...`);
        
        // Adiciona a nova linha diretamente via .addRow() (injetada a partir da linha 2 sem interferência de totais fixos no fundo)
        await sheet.addRow({
            'Data': data.data,
            'Favorecido / Fornecedor': data.favorecido_fornecedor,
            'Descrição': data.descricao,
            'Documento (arquivo)': 'Recebido via WhatsApp',
            'Tipo de documento': data.tipo_documento,
            'Classificação': data.classificacao,
            'Subcategoria': data.subcategoria,
            'Valor (R$)': data.valor,
            'Observações': data.observacoes
        });

        console.log(`[+] Dados salvos na aba "${sheet.title}" com sucesso!`);

        // Calcula a soma da aba em que o dado foi inserido para enviar de confirmação no WhatsApp
        console.log(`[*] Calculando total acumulado na aba "${sheet.title}"...`);
        const rows = await sheet.getRows();
        let totalSum = 0;
        for (const row of rows) {
            const valStr = row.get('Valor (R$)') || '';
            totalSum += parseCurrency(valStr);
        }

        console.log(`[+] Total acumulado na aba "${sheet.title}": R$ ${totalSum.toFixed(2)}`);

        return { success: true, totalSum };

    } catch (error) {
        console.error('[-] Erro ao salvar no Google Sheets:', error);
        return { success: false, totalSum: 0 };
    }
}
