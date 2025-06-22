function atualizarDashboardExport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const origem = ss.getSheetByName("dashboard");
  const destinoNome = "dashboard_export";
  
  // Cria a aba se não existir
  let destino = ss.getSheetByName(destinoNome);
  if (!destino) {
    destino = ss.insertSheet(destinoNome);
  } else {
    destino.clearContents();
  }

  const dados = origem.getDataRange().getValues();
  destino.getRange(1, 1, dados.length, dados[0].length).setValues(dados);
}
