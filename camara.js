/**
 * Proposições da Câmara – últimos 2 dias – somente primeiro autor
 * Colunas (ordem final):
 *  dataApresentacao | ementa | palavraChave | temas_ong | url | siglaTipo |
 *  autores | siglaPartidoAutor | idDeputadoAutor | siglaUfAutor | generoAutor |
 *  temas | uriAutor | id | numero | ano | casa
 *
 * Pré-requisitos:
 *  • aba “palavras-chaves” (A2:A) com termos
 *  • aba “proposicoes_camara” (cria/atualiza)
 *  • aba “log_camara” (cria/atualiza)
 */
function coletaProposicoes() {

  /* ---------- CONTEXTO ---------- */
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const tz  = ss.getSpreadsheetTimeZone();

  const hoje         = new Date();
  const DATA_FIM     = Utilities.formatDate(hoje, tz, 'yyyy-MM-dd');
  const dtIni        = new Date(); dtIni.setDate(dtIni.getDate() - 3);
  const DATA_INICIO  = Utilities.formatDate(dtIni, tz, 'yyyy-MM-dd');

  const shKW   = ss.getSheetByName('palavras-chaves');
  const shOut  = ss.getSheetByName('proposicoes_camara') || ss.insertSheet('proposicoes_camara');
  const shLog  = ss.getSheetByName('log_camara')          || ss.insertSheet('log_camara');
  const shTema = ss.getSheetByName('temas_ong');

  const keywords = shKW.getRange('A2:A').getValues().flat().filter(String);
  if (!keywords.length) { Logger.log('Sem palavras-chave.'); return; }

  /* ---------- util HTTP ---------- */
  const BASE = 'https://dadosabertos.camara.leg.br/api/v2';
  const HEAD = {accept:'application/json'};
  const J    = url => JSON.parse(UrlFetchApp.fetch(url,{headers:HEAD}).getContentText());

  /* ---------- MAPA DE TEMAS (aba temas_ong) ---------- */
  const temasData = shTema.getRange(2, 1, shTema.getLastRow()-1, 2).getValues();
  const temasMap = temasData.map(([tema, kw]) => ({
    tema,
    kw: (kw || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean)
  }));

  const detectTema = e => {
  const low = (e || '').toLowerCase();
  for (const obj of temasMap)
    for (const k of obj.kw)
      if (low.includes(k)) return obj.tema;
  return 'Sem Classificação';
};


  /* ---------- URLs já gravadas ---------- */
  const colUrl = (() => {
    if (shOut.getLastRow() < 1) return -1;
    const hdr = shOut.getRange(1,1,1,shOut.getLastColumn()).getValues()[0];
    return hdr.indexOf('url') + 1;
  })();
  const urls = new Set();
  if (colUrl > 0 && shOut.getLastRow() > 1)
    shOut.getRange(2,colUrl,shOut.getLastRow()-1,1).getValues()
         .forEach(r => { if (r[0]) urls.add(r[0]); });

  /* ---------- 1. Coletar IDs (últimos 5 dias) ---------- */
  const idKw = {};
  keywords.forEach(kw => {
    let url = `${BASE}/proposicoes?keywords=${encodeURIComponent(kw)}` +
              `&dataApresentacaoInicio=${DATA_INICIO}` +
              `&dataApresentacaoFim=${DATA_FIM}` +
              `&itens=100&ordem=ASC&ordenarPor=id`;
    while (url) {
      const r = J(url);
      (r.dados||[]).forEach(p=>{
        idKw[p.id] = idKw[p.id] ? idKw[p.id] + '|' + kw : kw;
      });
      const nxt = (r.links||[]).find(l=>l.rel==='next');
      url = nxt ? nxt.href : null;
    }
  });
  const ids = Object.keys(idKw);
  if (!ids.length) { log(shLog,tz,0); return; }

  /* ---------- 2. Cache deputados ---------- */
  const depCache = new Map();
  const getDep   = id => {
    if (depCache.has(id)) return depCache.get(id);
    const inf = {sigPart:'Outro', sigUf:'Outro', sexo:'Outro'};
    try {
      const d = J(`${BASE}/deputados/${id}`).dados;
      inf.sigPart = d.ultimoStatus.siglaPartido || 'Outro';
      inf.sigUf   = d.ultimoStatus.siglaUf      || 'Outro';
      inf.sexo    = d.sexo==='F' ? 'Feminino' : d.sexo==='M' ? 'Masculino' : 'Outro';
    } catch(e){}
    depCache.set(id,inf);
    Utilities.sleep(120);
    return inf;
  };

  /* ---------- 3. Montar linhas novas ---------- */
  const linhas = [];
  ids.forEach(id => {
    const urlPub = `https://www.camara.leg.br/propostas-legislativas/${id}`;
    if (urls.has(urlPub)) return;

    const det   = J(`${BASE}/proposicoes/${id}`).dados;
    const prop  = Array.isArray(det) ? det[0] : det || {};

    const aArr  = (J(`${BASE}/proposicoes/${id}/autores`).dados || []);
    const prim  = aArr.find(a=>a.ordemAssinatura===1) ||
                  aArr.find(a=>a.proponente===1)      ||
                  aArr[0] || {};

    let nome = prim.nome || '',
        uri  = prim.uri  || 'Outro',
        part = 'Outro',
        uf   = 'Outro',
        depId= 'Outro',
        gen  = 'Outro';

    if (uri.includes('/deputados/')) {
      depId = uri.split('/').pop();
      const d = getDep(depId);
      part = d.sigPart; uf = d.sigUf; gen = d.sexo;
    } else {
      if (prim.siglaPartido) part = prim.siglaPartido;
      if (prim.siglaUf)      uf   = prim.siglaUf;
    }

    const temasApi = (J(`${BASE}/proposicoes/${id}/temas`).dados || [])
                      .map(t=>t.descricao||t.tema).filter(String);

    let dataAp = '';
    let mesExt = '';
    if (prop.dataApresentacao) {
      const dt = new Date(prop.dataApresentacao);
      dataAp = Utilities.formatDate(dt, tz, 'dd/MM/yyyy');
      const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
      mesExt = meses[dt.getMonth()];

    }

    linhas.push([
      dataAp,                           // dataApresentacao
      prop.ementa || '',                // ementa
      idKw[id],                         // palavraChave
      detectTema(prop.ementa),          // temas_ong
      urlPub,                           // url
      prop.siglaTipo || '',             // siglaTipo
      nome,                             // autores (primeiro)
      part,                             // siglaPartidoAutor
      depId,                            // idDeputadoAutor
      uf,                               // siglaUfAutor
      gen,                              // generoAutor
      temasApi.join(', '),              // temas (API)
      uri,                              // uriAutor
      Number(id),                       // id
      prop.numero || '',                // numero
      prop.ano || '',                   // ano
      mesExt,                           // mês (extenso)
      'Câmara dos Deputados'            // casa
    ]);

    Utilities.sleep(120);
  });

  if (!linhas.length) { log(shLog,tz,0); return; }

  /* ---------- 4. Gravar ---------- */
  const header = [
    'dataApresentacao','ementa','palavraChave','temas_ong','url','siglaTipo',
    'autores','siglaPartidoAutor','idDeputadoAutor','siglaUfAutor','generoAutor',
    'temas','uriAutor','id','numero','ano','mês','casa'
  ];
  if (shOut.getLastRow() === 0) shOut.appendRow(header);
  shOut.getRange(shOut.getLastRow()+1,1,linhas.length,header.length).setValues(linhas);

  log(shLog,tz,linhas.length);
}


/* ---------- LOG ---------- */
function log(sheet,tz,qtd){
  if(sheet.getLastRow()===0)
    sheet.appendRow(['timestamp','novasProposicoes']);
  sheet.appendRow([Utilities.formatDate(new Date(),tz,'yyyy-MM-dd HH:mm:ss'),qtd]);
}
