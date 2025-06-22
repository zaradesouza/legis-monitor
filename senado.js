/****************************************************************
 *  COLETA DIÁRIA − SENADO FEDERAL (últimos 2 dias)
 *  Não sobrescreve linhas existentes
 *  Agora com log na aba “log_senado”
 ****************************************************************/
function coletaProposicoesSenado() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const tz   = ss.getSpreadsheetTimeZone();
  const shKW = ss.getSheetByName('palavras-chaves');
  const shBD = ss.getSheetByName('proposicoes_senado') || ss.insertSheet('proposicoes_senado');
  const shLog = ss.getSheetByName('log_senado') || ss.insertSheet('log_senado');
  const shTema = ss.getSheetByName('temas_ong');

  const kws = shKW.getRange('A2:A').getValues().flat().filter(String);
  if (!kws.length) {
    SpreadsheetApp.getUi().alert('Aba “palavras-chaves” vazia.'); return;
  }

  const hoje = new Date();
  const dtIni = new Date(); dtIni.setDate(dtIni.getDate() - 3);
  const DATA_FIM = Utilities.formatDate(hoje, tz, 'yyyy-MM-dd');
  const DATA_INI = Utilities.formatDate(dtIni, tz, 'yyyy-MM-dd');

  const BASE = 'https://legis.senado.leg.br/dadosabertos';
  const HEAD = { accept: 'application/json' };
  const safeJ = url => {
    try {
      const r = UrlFetchApp.fetch(url, { headers: HEAD, muteHttpExceptions: true });
      return r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : null;
    } catch (e) { return null; }
  };

  const temasData = shTema.getRange(2, 1, shTema.getLastRow() - 1, 2).getValues();
  const temasMap = temasData.map(([tema, kw]) => ({
    tema,
    kw: (kw || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean)
  }));
  const detectTema = txt => {
  for (const obj of temasMap)
    for (const k of obj.kw)
      if (new RegExp(`\\b${k}\\b`, 'i').test(txt)) return obj.tema;
  return 'Sem Classificação';
};


  const colUrl = (() => {
    if (shBD.getLastRow() < 1) return -1;
    const h = shBD.getRange(1, 1, 1, shBD.getLastColumn()).getValues()[0];
    return h.indexOf('url') + 1;
  })();

  const urls = new Set();
  if (colUrl > 0 && shBD.getLastRow() > 1)
    shBD.getRange(2, colUrl, shBD.getLastRow() - 1, 1).getValues()
      .forEach(r => { if (r[0]) urls.add(r[0]); });

  const meta = {};
  kws.forEach(kw => {
    const u = `${BASE}/materia/pesquisa/lista.json?palavraChave=${encodeURIComponent(kw)}&dataInicio=${DATA_INI}&dataFim=${DATA_FIM}&itens=100&pagina=1`;
    const r = safeJ(u); if (!r) return;
    const lista = r.PesquisaBasicaMateria?.Materias?.Materia || r.PesquisaBasicaMateria?.Materia || [];
    (Array.isArray(lista) ? lista : [lista]).forEach(m => {
      if (!m?.Codigo) return;
      const c = m.Codigo;
      if (!meta[c]) {
        meta[c] = {
          data: m.Data || '', ementa: m.Ementa || '', sigla: m.Sigla || '',
          numero: m.Numero || '', ano: m.Ano || '', autores: m.Autor || '', palavras: kw
        };
      } else if (!meta[c].palavras.split('|').includes(kw)) {
        meta[c].palavras += `|${kw}`;
      }
    });
    Utilities.sleep(120);
  });
  const codigos = Object.keys(meta);
  if (!codigos.length) { logSenado(shLog, tz, 0); return; }

  const senCache = new Map();
  const getSen = id => {
    if (senCache.has(id)) return senCache.get(id);
    const info = { sigPart: 'Outro', sigUf: 'Outro', sexo: 'Outro' };
    const d = safeJ(`${BASE}/senador/${id}.json`);
    if (d) {
      const p = d.DetalheParlamentar.Parlamentar;
      info.sigPart = p.FiliacaoPartidaria?.SiglaPartido || 'Outro';
      info.sigUf = p.UfParlamentar || 'Outro';
      info.sexo = p.Sexo === 'F' ? 'Feminino' : p.Sexo === 'M' ? 'Masculino' : 'Outro';
    }
    senCache.set(id, info); return info;
  };

  const parseAutorString = s => {
    const re = /^\s*Senador(a)?\s+(.+?)\s+\(([^\/]+)\/([^\)]+)\)/i;
    const m = s.match(re);
    if (!m) return null;
    return {
      nome: m[2].trim(),
      partido: m[3].trim(),
      uf: m[4].trim(),
      sexo: m[1] ? 'Feminino' : 'Masculino'
    };
  };

  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  const linhas = [];
  for (const cod of codigos) {
    const urlPub = `https://www25.senado.leg.br/web/atividade/materias/-/materia/${cod}`;
    if (urls.has(urlPub)) continue;

    const m = meta[cod];
    let dataFmt = m.data ? Utilities.formatDate(new Date(m.data), tz, 'dd/MM/yyyy') : '';
    let mesExt = m.data ? meses[new Date(m.data).getMonth()] : '';
    let ementa = m.ementa;
    let sigla = m.sigla;
    let numero = m.numero;
    let anoMat = m.ano;
    let autorStr = m.autores;

    const det = safeJ(`${BASE}/materia/${cod}.json`);
    let mat = det?.Materia || det?.DetalheMateria?.Materia ||
              (Array.isArray(det?.DetalheMateria?.Materia) ? det.DetalheMateria.Materia[0] : null);
    if (mat) {
      if (mat.DataApresentacao) {
        const dt = new Date(mat.DataApresentacao);
        dataFmt = Utilities.formatDate(dt, tz, 'dd/MM/yyyy');
        mesExt = meses[dt.getMonth()];
      }
      ementa = mat.EmentaMateria || mat.Ementa || ementa;
      sigla = mat.SiglaSubtipoMateria || mat.SiglaTipoMateria || sigla;
      numero = mat.NumeroMateria || numero;
      anoMat = mat.AnoMateria || anoMat;
    }

    let nome = '', sigPart = 'Outro', uf = 'Outro', idPar = 'Outro', sexo = 'Outro', uriAutor = 'Outro';
    const aRes = safeJ(`${BASE}/materia/${cod}/autores.json`);
    let prim = null;
    if (aRes) {
      let arr = aRes.ListaAutoresMateria?.Autores?.AutorMateria || [];
      arr = Array.isArray(arr) ? arr : [arr];
      prim = arr.find(a => a?.OrdemAutor === '1') || arr[0];
    }
    if (prim) {
      nome = prim.NomeAutor || prim.Nome || '';
      uf = prim.UfAutor || uf;
      if (prim.CodigoParlamentar) {
        idPar = prim.CodigoParlamentar;
        const s = getSen(idPar);
        sigPart = s.sigPart; uf = s.sigUf; sexo = s.sexo;
        uriAutor = `${BASE}/senador/${idPar}`;
      }
    } else {
      const first = autorStr.split(',')[0];
      const parsed = parseAutorString(first);
      if (parsed) {
        nome = parsed.nome; sigPart = parsed.partido; uf = parsed.uf; sexo = parsed.sexo;
      } else {
        nome = first.trim();
      }
    }

    let temasAPI = '';
    const tRes = safeJ(`${BASE}/materia/${cod}/assunto.json`);
    let tArr = tRes?.ListaAssuntoMateria?.Assuntos?.Assunto || [];
    if (!tArr.length && mat?.Assunto) tArr = Array.isArray(mat.Assunto) ? mat.Assunto : [mat.Assunto];
    if (tArr.length) {
      temasAPI = (Array.isArray(tArr) ? tArr : [tArr])
        .map(a => a.DescricaoAssunto || a.Descricao || '')
        .filter(String).join(', ');
    }

    linhas.push([
      dataFmt, ementa, m.palavras, detectTema(ementa), urlPub, sigla,
      nome, sigPart, idPar, uf, sexo, temasAPI, uriAutor,
      Number(cod), numero, anoMat, mesExt, 'Senado Federal'
    ]);
    Utilities.sleep(80);
  }

  // FILTRO DE DATA FINAL (garante apenas os últimos 5 dias reais)
  const linhasFiltradas = linhas.filter(l => {
    const partes = l[0].split('/');
    const dt = new Date(`${partes[2]}-${partes[1]}-${partes[0]}`);
    return dt >= dtIni && dt <= hoje;
  });

  if (!linhasFiltradas.length) {
    logSenado(shLog, tz, 0);
    return;
  }

  const header = ['dataApresentacao', 'ementa', 'palavraChave', 'temas_ong', 'url', 'siglaTipo',
                  'autores', 'siglaPartidoAutor', 'idDeputadoAutor', 'siglaUfAutor', 'generoAutor',
                  'temas', 'uriAutor', 'id', 'numero', 'ano', 'mês', 'casa'];
  if (shBD.getLastRow() === 0) shBD.appendRow(header);
  shBD.getRange(shBD.getLastRow() + 1, 1, linhasFiltradas.length, header.length).setValues(linhasFiltradas);

  logSenado(shLog, tz, linhasFiltradas.length);
}


function logSenado(sheet, tz, qtd) {
  if (sheet.getLastRow() === 0)
    sheet.appendRow(['timestamp', 'novasProposicoes']);
  sheet.appendRow([Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss'), qtd]);
}
