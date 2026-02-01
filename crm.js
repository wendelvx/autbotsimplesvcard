const fs = require('fs');
require('dotenv').config();
const sleep = (min, max) => {
    const ms = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(r => setTimeout(r, ms));
};

const ARQUIVO_HISTORICO = 'contatos_enviados.json';
const ARQUIVO_LOG_TEXTO = 'log_cadastros.txt';

// --- CONFIGURAÇÕES JETIMOB ---
const JETIMOB_PUBLIC_KEY = process.env.public_key;
const JETIMOB_PRIVATE_KEY = process.env.private_key;

function carregarHistorico() {
    if (fs.existsSync(ARQUIVO_HISTORICO)) {
        try {
            return JSON.parse(fs.readFileSync(ARQUIVO_HISTORICO, 'utf-8'));
        } catch (e) { return []; }
    }
    return [];
}

function registrarNoLogTexto(mensagem) {
    const timestamp = new Date().toLocaleString('pt-BR');
    fs.appendFileSync(ARQUIVO_LOG_TEXTO, `[${timestamp}] ${mensagem}\n`);
}

function salvarNoHistorico(leadsFinalizados) {
    const historico = carregarHistorico();
    const telefonesExistentes = new Set(historico.map(item => item.phone));
    
    leadsFinalizados.forEach(lead => {
        if (!telefonesExistentes.has(lead.whatsappId)) {
            historico.push({
                phone: lead.whatsappId, 
                nome: lead.fullName,
                dataCadastroCRM: new Date().toISOString()
            });
        }
    });
    fs.writeFileSync(ARQUIVO_HISTORICO, JSON.stringify(historico, null, 2));
}

async function cadastrarNoJetimob(lead) {
    const url = `https://api.jetimob.com/leads/${JETIMOB_PUBLIC_KEY}`;
    
    const formData = new FormData();
    formData.append('full_name', lead.fullName);
    formData.append('phone', lead.phoneNumber);
    formData.append('email', `${lead.whatsappId}@lead.com.br`); 
    
    // Identificação do Sistema
    formData.append('source', 'Sistema Ítalo Mello'); 
    formData.append('message', 'Lead importado automaticamente via Sistema de Automação.');
    formData.append('subject', 'Importação via WhatsApp');

    // Deixa vazio para tentar evitar a atribuição automática de responsáveis do CRM
    formData.append('responsible', ''); 

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization-Key': JETIMOB_PRIVATE_KEY },
            body: formData
        });

        if (!response.ok) {
            const erroCorpo = await response.text();
            registrarNoLogTexto(`ERRO API JETIMOB [${response.status}]: ${erroCorpo}`);
        }

        return response.ok;
    } catch (error) {
        console.error(`[ERRO CRM] ${lead.fullName}:`, error.message);
        return false;
    }
}

async function processarEtiquetaParaCRM(labelId) {
    const session = 'default';
    const baseUrl = 'http://localhost:3000';
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    
    const LIMITE_RODADA = 500; 

    try {
        const historico = carregarHistorico();
        const jaEnviados = historico.map(item => item.phone);

        console.log(`[INFO] Lendo etiqueta ${labelId}...`);
        const resLabel = await fetch(`${baseUrl}/api/${session}/labels/${labelId}/chats`, { headers });
        const chats = await resLabel.json();

        let listaLeads = [];

        for (let chat of chats) {
            if (chat.id.includes('@g.us')) continue;

            let num = null;
            if (chat.id.includes('@lid')) {
                try {
                    const resLid = await fetch(`${baseUrl}/api/${session}/lids/${chat.id.replace('@', '%40')}`, { headers });
                    const lidData = await resLid.json();
                    if (lidData.pn) num = lidData.pn.split('@')[0];
                } catch (e) {}
            } else {
                num = chat.id.split('@')[0];
            }

            if (!num || jaEnviados.includes(num)) continue;

            // --- BUSCA DE NOME ROBUSTA ---
            let nomeFinal = chat.name || chat.pushname;

            if (!nomeFinal) {
                try {
                    const resContact = await fetch(`${baseUrl}/api/contacts?contactId=${num}%40c.us&session=${session}`, { headers });
                    const info = await resContact.json();
                    nomeFinal = info.name || info.pushname;
                } catch (e) {}
            }

            listaLeads.push({
                fullName: nomeFinal || `Lead ${num.slice(-4)}`,
                phoneNumber: `+${num}`,
                whatsappId: num
            });

            if (listaLeads.length >= LIMITE_RODADA) break;
        }

        if (listaLeads.length === 0) {
            console.log("[INFO] Nenhum lead novo encontrado para processar.");
            return;
        }

        console.log(`[INÍCIO] Cadastrando ${listaLeads.length} leads no Jetimob...`);

        let cadastradosComSucesso = [];

        for (let i = 0; i < listaLeads.length; i++) {
            const lead = listaLeads[i];
            const sucesso = await cadastrarNoJetimob(lead);
            
            if (sucesso) {
                console.log(`[${i + 1}/${listaLeads.length}] Cadastrado: ${lead.fullName}`);
                registrarNoLogTexto(`SUCESSO: ${lead.fullName} (${lead.phoneNumber}) cadastrado via Sistema Ítalo Mello.`);
                cadastradosComSucesso.push(lead);
            } else {
                registrarNoLogTexto(`FALHA: Não foi possível cadastrar ${lead.fullName} (${lead.phoneNumber}). Verifique logs de resposta acima.`);
            }

            await sleep(400, 800);
        }

        salvarNoHistorico(cadastradosComSucesso);
        console.log(`[FIM] Sucesso! Detalhes em '${ARQUIVO_LOG_TEXTO}'.`);

    } catch (error) {
        console.error('[ERRO FATAL]', error.message);
        registrarNoLogTexto(`ERRO FATAL: ${error.message}`);
    }
}

// EXECUÇÃO PARA A ETIQUETA 6
processarEtiquetaParaCRM('8');