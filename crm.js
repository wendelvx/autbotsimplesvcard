const fs = require('fs');
require('dotenv').config();

const sleep = (min, max) => {
    const ms = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(r => setTimeout(r, ms));
};

const ARQUIVO_HISTORICO = 'contatos_enviados.json';
const ARQUIVO_LOG_TEXTO = 'log_cadastros.txt';

const JETIMOB_PUBLIC_KEY = process.env.public_key;
const JETIMOB_PRIVATE_KEY = process.env.private_key;

// --- FUNÇÕES DE AUXÍLIO ---

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

// --- INTEGRAÇÃO JETIMOB ---

async function cadastrarNoJetimob(lead, nomeEtiqueta) {
    const url = `https://api.jetimob.com/leads/${JETIMOB_PUBLIC_KEY}`;
    
    const formData = new FormData();
    formData.append('full_name', lead.fullName);
    formData.append('phone', lead.phoneNumber);
    formData.append('email', `${lead.whatsappId}@lead.com.br`); 
    
    formData.append('source', 'Sistema Ítalo Mello'); 
    
    // Inserindo o nome da etiqueta na mensagem conforme solicitado
    const mensagemFinal = `Lead importado automaticamente. Etiqueta WhatsApp: ${nomeEtiqueta || 'Sem Etiqueta'}`;
    formData.append('message', mensagemFinal);
    
    formData.append('subject', 'Importação via WhatsApp');
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

// --- PROCESSAMENTO WAHA ---

async function processarEtiquetaParaCRM(labelId) {
    const session = 'default';
    const baseUrl = 'http://localhost:3000';
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    
    const LIMITE_RODADA = 500; 

    try {
        // 1. Buscar o nome da etiqueta no WAHA para usar na mensagem
        console.log(`[INFO] Buscando nome da etiqueta ${labelId}...`);
        const resLabels = await fetch(`${baseUrl}/api/${session}/labels`, { headers });
        const labels = await resLabels.json();
        const etiquetaEncontrada = labels.find(l => l.id === labelId);
        const nomeDaEtiqueta = etiquetaEncontrada ? etiquetaEncontrada.name : `ID ${labelId}`;

        // 2. Carregar chats da etiqueta
        const historico = carregarHistorico();
        const jaEnviados = historico.map(item => item.phone);

        console.log(`[INFO] Lendo chats da etiqueta: ${nomeDaEtiqueta}...`);
        const resLabelChats = await fetch(`${baseUrl}/api/${session}/labels/${labelId}/chats`, { headers });
        const chats = await resLabelChats.json();

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
            console.log("[INFO] Nenhum lead novo encontrado.");
            return;
        }

        // 3. Cadastrar no CRM passando o nome da etiqueta
        console.log(`[INÍCIO] Cadastrando ${listaLeads.length} leads no Jetimob...`);
        let cadastradosComSucesso = [];

        for (let i = 0; i < listaLeads.length; i++) {
            const lead = listaLeads[i];
            const sucesso = await cadastrarNoJetimob(lead, nomeDaEtiqueta);
            
            if (sucesso) {
                console.log(`[${i + 1}/${listaLeads.length}] Cadastrado: ${lead.fullName}`);
                registrarNoLogTexto(`SUCESSO: ${lead.fullName} (${lead.phoneNumber}) - Etiqueta: ${nomeDaEtiqueta}`);
                cadastradosComSucesso.push(lead);
            }
            await sleep(400, 800);
        }

        salvarNoHistorico(cadastradosComSucesso);
        console.log(`[FIM] Concluído.`);

    } catch (error) {
        console.error('[ERRO FATAL]', error.message);
    }
}

// EXECUÇÃO
processarEtiquetaParaCRM('6');