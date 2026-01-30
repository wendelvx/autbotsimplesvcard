const sleep = (min, max) => {
    const ms = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(r => setTimeout(r, ms));
};

async function enviarParaChefeSeguro(groupId, meuNumero) {
    const session = 'default';
    const baseUrl = 'http://localhost:3000';
    const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };

    try {
        const resPart = await fetch(`${baseUrl}/api/${session}/groups/${groupId.replace('@', '%40')}/participants/v2`, { headers });
        const participantes = await resPart.json();
        console.log(`✅ Grupo lido. ${participantes.length} contatos encontrados.`);

        const listaVcards = [];

        for (let i = 0; i < participantes.length; i++) {
            const p = participantes[i];
            await sleep(800, 2000);

            const resContact = await fetch(`${baseUrl}/api/contacts?contactId=${p.id.replace('@', '%40')}&session=${session}`, { headers });
            const info = await resContact.json();
            let num = info.number;

            if (!num || p.id.includes('@lid')) {
                const resLid = await fetch(`${baseUrl}/api/${session}/lids/${p.id.replace('@', '%40')}`, { headers });
                const lidData = await resLid.json();
                if (lidData.pn) num = lidData.pn.split('@')[0];
            }

            if (num && num.length < 15) {
                listaVcards.push({
                    fullName: `Lead ${String(listaVcards.length + 1).padStart(3, '0')}`,
                    organization: "Ítalo Mello",
                    phoneNumber: `+${num}`,
                    whatsappId: num
                });
                console.log(`🔍 Processando: ${num}...`);
            }
        }

        console.log(`\n🚀 Iniciando envio de ${listaVcards.length} VCards para você...`);

        for (let i = 0; i < listaVcards.length; i++) {
            const targetChat = `${meuNumero}@c.us`;

            await fetch(`${baseUrl}/api/${session}/presence`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    chatId: targetChat,
                    presence: 'typing' 
                })
            });

            await sleep(2000, 5000);

            await fetch(`${baseUrl}/api/sendContactVcard`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    session,
                    chatId: targetChat,
                    contacts: [listaVcards[i]] 
                })
            });

            console.log(`📤 [${i + 1}/${listaVcards.length}] VCard enviado!`);

            await fetch(`${baseUrl}/api/${session}/presence`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    chatId: targetChat,
                    presence: 'paused'
                })
            });

            await sleep(5000, 10000);
            
            if ((i + 1) % 10 === 0) {
                console.log("☕ Pausa de segurança de 30 segundos...");
                await sleep(30000, 40000);
            }
        }

        console.log("\n✅ Pronto! Todos os contatos foram enviados com segurança.");

    } catch (error) {
        console.error("❌ Erro:", error.message);
    }
}

const GRUPO = '120363210031058131@g.us';
const DESTINO = '558888714200'; 

enviarParaChefeSeguro(GRUPO, DESTINO);