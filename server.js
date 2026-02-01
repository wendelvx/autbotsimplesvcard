const fs = require('fs');

const sleep = (min, max) => {
    const ms = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(r => setTimeout(r, ms));
};

const ARQUIVO_HISTORICO = 'contatos_enviados.json';

function carregarHistorico() {
    if (fs.existsSync(ARQUIVO_HISTORICO)) {
        try {
            const conteudo = fs.readFileSync(ARQUIVO_HISTORICO, 'utf-8');
            return JSON.parse(conteudo);
        } catch (e) {
            console.error("[AVISO] Erro ao ler JSON, iniciando novo.");
            return [];
        }
    }
    return [];
}

function salvarNoHistorico(novosLeads) {
    const historico = carregarHistorico();
    // Comparação agora utiliza a chave 'phone'
    const telefonesExistentes = new Set(historico.map(item => item.phone));
    
    novosLeads.forEach(lead => {
        if (!telefonesExistentes.has(lead.whatsappId)) {
            historico.push({
                phone: lead.whatsappId, // Alterado de 'id' para 'phone'
                nome: lead.fullName,
                dataEnvio: new Date().toISOString()
            });
        }
    });

    fs.writeFileSync(ARQUIVO_HISTORICO, JSON.stringify(historico, null, 2));
}

async function enviarParaChefeSeguro(labelId, meuNumero) {
    const session = 'default';
    const baseUrl = 'http://localhost:3000';
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    
    // CONFIGURAÇÕES OTIMIZADAS
    const LIMITE_TOTAL_RODADA = 50; 
    const BLOCO_PAUSA_LONGA = 25; 

    try {
        const historico = carregarHistorico();
        const jaEnviadosPhones = historico.map(item => item.phone);

        // 1. Buscar contatos da etiqueta
        const resLabel = await fetch(`${baseUrl}/api/${session}/labels/${labelId}/chats`, { headers });
        const chatsDaLabel = await resLabel.json();

        let listaParaProcessar = [];

        for (let chat of chatsDaLabel) {
            if (chat.id.includes('@g.us')) continue;

            let num = null;
            let chatIdOriginal = chat.id;

            if (chatIdOriginal.includes('@lid')) {
                try {
                    const resLid = await fetch(`${baseUrl}/api/${session}/lids/${chatIdOriginal.replace('@', '%40')}`, { headers });
                    const lidData = await resLid.json();
                    if (lidData.pn) num = lidData.pn.split('@')[0];
                } catch (e) {}
            } else {
                num = chatIdOriginal.split('@')[0];
            }

            // Verifica se o telefone já está no histórico
            if (!num || jaEnviadosPhones.includes(num)) continue;

            let nomeFinal = chat.name || chat.pushname;
            if (!nomeFinal) {
                try {
                    const resContact = await fetch(`${baseUrl}/api/contacts?contactId=${num}%40c.us&session=${session}`, { headers });
                    const info = await resContact.json();
                    nomeFinal = info.name || info.pushname;
                } catch (e) {}
            }

            listaParaProcessar.push({
                fullName: nomeFinal || `Lead ${num.slice(-4)}`,
                organization: 'Ítalo Mello',
                phoneNumber: `+${num}`,
                whatsappId: num
            });

            if (listaParaProcessar.length >= LIMITE_TOTAL_RODADA) break;
        }

        if (listaParaProcessar.length === 0) {
            console.log('[INFO] Sem novos contatos para processar hoje.');
            return;
        }

        console.log(`[INÍCIO] Enviando ${listaParaProcessar.length} contatos (Ritmo acelerado)...`);

        let contagemBloco = 0;
        let enviadosSucesso = [];

        for (let i = 0; i < listaParaProcessar.length; i++) {
            const v = listaParaProcessar[i];
            const targetChat = `${meuNumero}@c.us`;

            // Simulação de presença (Reduzido para 2-4s)
            await fetch(`${baseUrl}/api/${session}/presence`, {
                method: 'POST', headers,
                body: JSON.stringify({ chatId: targetChat, presence: 'typing' })
            });

            await sleep(2000, 4000); 

            const resSend = await fetch(`${baseUrl}/api/sendContactVcard`, {
                method: 'POST', headers,
                body: JSON.stringify({ session, chatId: targetChat, contacts: [v] })
            });

            if (resSend.ok) {
                console.log(`[OK] ${i + 1}/${listaParaProcessar.length} - ${v.fullName}`);
                enviadosSucesso.push(v);
                contagemBloco++;
            }

            await fetch(`${baseUrl}/api/${session}/presence`, {
                method: 'POST', headers,
                body: JSON.stringify({ chatId: targetChat, presence: 'paused' })
            });

            // Intervalo entre mensagens reduzido para 5-10s
            await sleep(5000, 10000);

            // Pausa de resfriamento a cada 30 envios (60s fixos para agilizar)
            if (contagemBloco >= BLOCO_PAUSA_LONGA && i !== listaParaProcessar.length - 1) {
                console.log(`[PAUSA] Resfriamento de 60 segundos...`);
                await sleep(60000, 65000);
                contagemBloco = 0;
            }
        }

        salvarNoHistorico(enviadosSucesso);
        console.log(`[FIM] Rodada de 100 concluída com sucesso.`);

    } catch (error) {
        console.error('[ERRO FATAL]', error.message);
    }
}

const ID_ETIQUETA = '8'; 
const DESTINO = '558888714200';

enviarParaChefeSeguro(ID_ETIQUETA, DESTINO);