const fs = require('fs');

const sleep = (min, max) => {
    const ms = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(r => setTimeout(r, ms));
};

const ARQUIVO_HISTORICO = 'contatos_enviados.json';

function carregarHistorico() {
    if (fs.existsSync(ARQUIVO_HISTORICO)) {
        return JSON.parse(fs.readFileSync(ARQUIVO_HISTORICO, 'utf-8'));
    }
    return [];
}

function salvarNoHistorico(listaNova) {
    const historicoAntigo = carregarHistorico();
    const historicoAtualizado = [...new Set([...historicoAntigo, ...listaNova])];
    fs.writeFileSync(ARQUIVO_HISTORICO, JSON.stringify(historicoAtualizado, null, 2));
}

async function enviarParaChefeSeguro(groupId, meuNumero) {
    const session = 'default';
    const baseUrl = 'http://localhost:3000';
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };

    try {
        const jaEnviados = carregarHistorico();
        let contadorLead = jaEnviados.length;

        const resPart = await fetch(
            `${baseUrl}/api/${session}/groups/${groupId.replace('@', '%40')}/participants/v2`,
            { headers }
        );

        const participantes = await resPart.json();

        const listaVcards = [];
        const numerosEnviadosNestaRodada = [];

        for (let i = 0; i < participantes.length; i++) {
            const p = participantes[i];

            await sleep(500, 1000);

            const resContact = await fetch(
                `${baseUrl}/api/contacts?contactId=${p.id.replace('@', '%40')}&session=${session}`,
                { headers }
            );

            const info = await resContact.json();
            let num = info.number;

            if (!num || p.id.includes('@lid')) {
                const resLid = await fetch(
                    `${baseUrl}/api/${session}/lids/${p.id.replace('@', '%40')}`,
                    { headers }
                );

                const lidData = await resLid.json();
                if (lidData.pn) num = lidData.pn.split('@')[0];
            }

            if (num && num.length < 15) {
                if (jaEnviados.includes(num)) {
                    continue;
                }

                contadorLead++;

                listaVcards.push({
                    fullName: `Lead ${String(contadorLead).padStart(3, '0')}`,
                    organization: 'Ítalo Mello',
                    phoneNumber: `+${num}`,
                    whatsappId: num
                });

                numerosEnviadosNestaRodada.push(num);
            }
        }

        if (listaVcards.length === 0) {
            return;
        }

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

            await fetch(`${baseUrl}/api/${session}/presence`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ chatId: targetChat, presence: 'paused' })
            });

            await sleep(5000, 8000);

            if ((i + 1) % 10 === 0) {
                await sleep(30000, 40000);
            }
        }

        salvarNoHistorico(numerosEnviadosNestaRodada);
    } catch (error) {
        console.error(error.message);
    }
}

const GRUPO = '120363296259413976@g.us';
const DESTINO = '558896891064';

enviarParaChefeSeguro(GRUPO, DESTINO);