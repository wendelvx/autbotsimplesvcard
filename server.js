const fs = require('fs');

const sleep = (min, max) => {
    const ms = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(r => setTimeout(r, ms));
};

// Nome do arquivo que guardará os números já enviados
const ARQUIVO_HISTORICO = 'contatos_enviados.json';

// Função para carregar o histórico
function carregarHistorico() {
    if (fs.existsSync(ARQUIVO_HISTORICO)) {
        return JSON.parse(fs.readFileSync(ARQUIVO_HISTORICO, 'utf-8'));
    }
    return [];
}

// Função para salvar no histórico
function salvarNoHistorico(listaNova) {
    const historicoAntigo = carregarHistorico();
    const historicoAtualizado = [...new Set([...historicoAntigo, ...listaNova])];
    fs.writeFileSync(ARQUIVO_HISTORICO, JSON.stringify(historicoAtualizado, null, 2));
}

async function enviarParaChefeSeguro(groupId, meuNumero) {
    const session = 'default';
    const baseUrl = 'http://localhost:3000';
    const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };

    try {
        // 1. Carregar quem já foi enviado antes
        const jaEnviados = carregarHistorico();
        console.log(`📜 Histórico carregado: ${jaEnviados.length} contatos já foram enviados anteriormente.`);

        const resPart = await fetch(`${baseUrl}/api/${session}/groups/${groupId.replace('@', '%40')}/participants/v2`, { headers });
        const participantes = await resPart.json();
        console.log(`✅ Grupo lido. ${participantes.length} contatos encontrados no grupo.`);

        const listaVcards = [];
        const numerosEnviadosNestaRodada = [];

        // 2. Resolver números reais e FILTRAR duplicados
        for (let i = 0; i < participantes.length; i++) {
            const p = participantes[i];
            
            await sleep(500, 1000); // Leitura mais rápida

            const resContact = await fetch(`${baseUrl}/api/contacts?contactId=${p.id.replace('@', '%40')}&session=${session}`, { headers });
            const info = await resContact.json();
            let num = info.number;

            if (!num || p.id.includes('@lid')) {
                const resLid = await fetch(`${baseUrl}/api/${session}/lids/${p.id.replace('@', '%40')}`, { headers });
                const lidData = await resLid.json();
                if (lidData.pn) num = lidData.pn.split('@')[0];
            }

            // --- FILTRO DE DUPLICADOS ---
            if (num && num.length < 15) {
                if (jaEnviados.includes(num)) {
                    console.log(`⏩ Pulando ${num} (Já enviado em outra rodada)`);
                    continue;
                }

                listaVcards.push({
                    fullName: `Lead ${String(listaVcards.length + 1).padStart(3, '0')}`,
                    organization: "Ítalo Mello",
                    phoneNumber: `+${num}`,
                    whatsappId: num
                });
                numerosEnviadosNestaRodada.push(num);
                console.log(`🔍 Adicionado para envio: ${num}...`);
            }
        }

        if (listaVcards.length === 0) {
            console.log("\n🙌 Nenhum contato novo para enviar!");
            return;
        }

        console.log(`\n🚀 Iniciando envio de ${listaVcards.length} NOVOS VCards...`);

        // 3. Envio dos VCards
        for (let i = 0; i < listaVcards.length; i++) {
            const targetChat = `${meuNumero}@c.us`;

            await fetch(`${baseUrl}/api/${session}/presence`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ chatId: targetChat, presence: 'typing' })
            });

            await sleep(2000, 4000);

            await fetch(`${baseUrl}/api/sendContactVcard`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    session,
                    chatId: targetChat,
                    contacts: [listaVcards[i]] 
                })
            });

            console.log(`📤 [${i + 1}/${listaVcards.length}] VCard enviado: ${listaVcards[i].phoneNumber}`);

            await fetch(`${baseUrl}/api/${session}/presence`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ chatId: targetChat, presence: 'paused' })
            });

            await sleep(5000, 8000);
            
            if ((i + 1) % 10 === 0) {
                console.log("☕ Pausa de segurança de 30 segundos...");
                await sleep(30000, 40000);
            }
        }

        // 4. Salvar os novos números no arquivo para a próxima vez
        salvarNoHistorico(numerosEnviadosNestaRodada);
        console.log("\n✅ Tudo pronto! Histórico atualizado.");

    } catch (error) {
        console.error("❌ Erro:", error.message);
    }
}

const GRUPO = '120363024431816290@g.us';
const DESTINO = '558888714200'; 

enviarParaChefeSeguro(GRUPO, DESTINO);