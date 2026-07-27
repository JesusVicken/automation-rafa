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

        // Usa o GID da aba específica se definido, senão usa a primeira aba
        const sheetGid = process.env.GOOGLE_SHEETS_GID ? Number(process.env.GOOGLE_SHEETS_GID) : null;
        const sheet = sheetGid !== null ? doc.sheetsById[sheetGid] : doc.sheetsByIndex[0];

        if (!sheet) {
            console.error(`[-] Aba com GID ${sheetGid} não encontrada na planilha!`);
            return { success: false, totalSum: 0 };
        }
        
        console.log(`[*] Inserindo dados na planilha "${doc.title}" (Aba: "${sheet.title}")...`);
        
        // Adiciona a nova linha com as colunas da planilha oficial "Gastos da Obra — Dona Fátima"
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

        console.log('[+] Dados salvos na planilha com sucesso!');

        // Busca todas as linhas para calcular a soma total do campo 'Valor (R$)'
        console.log('[*] Calculando total acumulado na planilha...');
        const rows = await sheet.getRows();
        let totalSum = 0;
        for (const row of rows) {
            const valStr = row.get('Valor (R$)') || '';
            totalSum += parseCurrency(valStr);
        }

        console.log(`[+] Total acumulado calculado: R$ ${totalSum.toFixed(2)}`);

        return { success: true, totalSum };

    } catch (error) {
        console.error('[-] Erro ao salvar no Google Sheets:', error);
        return { success: false, totalSum: 0 };
    }
}
