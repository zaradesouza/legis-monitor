/****************************************************************
 *  ENVIA RELATÓRIO SEMANAL – ÚLTIMOS 7 DIAS
 *  – destinatários: aba “e-mails”, intervalo A2:A
 *  – fontes de dados: “proposicoes_camara” e “proposicoes_senado”
 *  – acrescenta linhas em ordem cronológica (mais antigas → mais novas)
 ****************************************************************/
 
function enviarRelatorioSemanal() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();

  const shMail = ss.getSheetByName('e-mails');
  const shCam = ss.getSheetByName('proposicoes_camara');
  const shSen = ss.getSheetByName('proposicoes_senado');
  const shLog = ss.getSheetByName('log_email') || ss.insertSheet('log_email');
  if (!shMail || !shCam || !shSen) return;

  const emails = shMail.getRange('A2:A').getValues().flat().filter(e => e && e.toString().trim());
  if (!emails.length) return;

  const hoje = new Date();
  const dtIniObj = new Date(); dtIniObj.setDate(dtIniObj.getDate() - 6);
  const isoIni = Utilities.formatDate(dtIniObj, tz, 'yyyy-MM-dd');
  const isoFim = Utilities.formatDate(hoje, tz, 'yyyy-MM-dd');
  const brIni = Utilities.formatDate(dtIniObj, tz, 'dd/MM/yyyy');
  const brFim = Utilities.formatDate(hoje, tz, 'dd/MM/yyyy');

  const extrair = (sheet, casaAlvo) => {
    if (sheet.getLastRow() < 2) return [];
    const headMap = {};
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .forEach((h, i) => headMap[h] = i);
    const dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    return dados.flatMap(r => {
      const d = r[headMap['dataApresentacao']];
      if (!d) return [];
      const iso = Utilities.formatDate(new Date(d), tz, 'yyyy-MM-dd');
      if (iso < isoIni || iso > isoFim) return [];
      return [{
        dataISO: iso,
        dataBR: Utilities.formatDate(new Date(d), tz, 'dd/MM/yyyy'),
        ementa: r[headMap['ementa']],
        url: r[headMap['url']],
        tipo: r[headMap['siglaTipo']],
        autoria: r[headMap['autores']],
        partido: r[headMap['siglaPartidoAutor']],
        uf: r[headMap['siglaUfAutor']],
        casa: casaAlvo
      }];
    });
  };

  const camara = extrair(shCam, 'Câmara dos Deputados').sort((a, b) => b.dataISO.localeCompare(a.dataISO));
  const senado = extrair(shSen, 'Senado Federal').sort((a, b) => b.dataISO.localeCompare(a.dataISO));
  const total = camara.length + senado.length;

  if (total === 0) {
    logEmail(shLog, tz, emails.length, total);
    return;
  }

const blocoHTML = (titulo, cor, linhas) => {
  if (!linhas.length) return '';
  const blocos = linhas.map(l => `
    <div style="border-bottom:1px solid #ccc; padding:10px 0;">
      <p style="margin:0; font-size:14px;"><strong>• Data:</strong> ${l.dataBR}</p>
      <p style="margin:4px 0 4px 0; font-size:14px; text-align:justify;"><strong>• Ementa:</strong> ${l.ementa}</p>
      <p style="margin:0; font-size:14px;"><strong>• URL:</strong> <a href="${l.url}" target="_blank">${l.url}</a></p>
      <p style="margin:0; font-size:14px;"><strong>• Tipo da Proposição:</strong> ${l.tipo}</p>
      <p style="margin:0; font-size:14px;"><strong>• Autoria:</strong> ${l.autoria} – ${l.partido}-${l.uf}</p>
    </div>
  `).join('\n');

  return `
    <div style="background:${cor}; color:white; padding:6px 12px; font-weight:bold; font-size:14px; margin-top:24px;">
      ${titulo.toUpperCase()}
    </div>
    ${blocos}
  `;
};




  const htmlBody = `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family:Arial, Helvetica, sans-serif; font-size:14px; color:#333; background:#f7f7f7; padding:20px; }
      .card { background:#fff; border-radius:8px; padding:24px; max-width:800px; margin:auto;
              box-shadow:0 4px 12px rgba(0,0,0,.08);}
      .logo { max-width:180px; height:auto; display:block; margin:auto; }
      h1    { font-size:20px; font-weight:600; color:#333; text-align:center; margin:20px 0;}
      p     { line-height:1.6; }
      a     { color:#555; text-decoration:none; }
      .footer { font-size:11px; color:#888; text-align:center; margin-top:24px; }
    </style>
  </head>
  <body>
    <div class="card">
      <img src="https://storage.googleapis.com/atados-v3/user-uploaded/images/6e711713-f0d3-402d-8223-cc7fc0864387.png" class="logo">
      <h1>Monitoramento do Legislativo</h1>

      <p>Olá!</p>
      <p>Esta é uma mensagem automática de monitoramento do Legislativo.<br>
         Segue, abaixo, a relação de proposições apresentadas entre <strong>${brIni}</strong> e <strong>${brFim}</strong>
         que correspondem aos temas acompanhados pela ONG <strong>Elas no Poder</strong>:</p>

      ${blocoHTML('Câmara dos Deputados', '#ce9de8', camara)}
      ${blocoHTML('Senado Federal', '#ae40ff', senado)}

      <div class="footer">Esta é uma mensagem automática – favor não responder.</div>
    </div>
  </body>
  </html>`;

  const assunto = `[ENP] Monitoramento do Legislativo | Relatório Semanal ${Utilities.formatDate(hoje, tz, 'dd/MM/yyyy')}`;
  GmailApp.sendEmail(
    '',
    assunto,
    'Seu cliente de e-mail não suporta HTML.',
    { bcc: emails.join(','), name: 'Monitoramento Legislativo', htmlBody }
  );

  logEmail(shLog, tz, emails.length, total);

}


/* ---------- LOG DE ENVIO DE EMAIL ---------- */
function logEmail(sheet, tz, qtdEmails, qtdProps) {
  if (sheet.getLastRow() === 0)
    sheet.appendRow(['timestamp', 'qtd_emails', 'qtd_proposicoes']);
  sheet.appendRow([
    Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss'),
    qtdEmails,
    qtdProps
  ]);
}

