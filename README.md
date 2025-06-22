# Monitoramento do Legislativo (Câmara + Senado)  
Projeto voluntário para a **[ONG Elas no Poder](https://elasnopoder.org/)**

Monitora, em tempo (quase) real, a tramitação de proposições na Câmara dos Deputados e no Senado Federal, consolida os dados em uma Planilha Google (Google Sheets).

Esse projeto automatiza a coleta de proposições, classifica por tema, atualiza planilhas no Google Sheets, abastece um Dashboard em Power BI e dispara um boletim semanal por e-mail.


**Com este projeto conseguimos responder, de forma automática, quantas proposições voltadas às mulheres foram apresentadas em cada ano, quem foram os(as) autores(as), quais partidos e quais Casas / parlamentares estão mais engajados em elaborar políticas para as mulheres no Brasil.**

---
## Arquitetura do Projeto
```text
palavras-chaves ─┐
temas_ong ───────┤
                 ├─► camara.js ──► proposicoes_camara
                 │
                 └─► senado.js ──► proposicoes_senado
                                    │
                                    ▼
                            fórmulas (Sheets)
                                    ▼
                                 dashboard
                                    ▼
                              dashboard_export
                                    ▼
                            Power BI (relatório)
                                    ▼
                  log_camara · log_senado · log_email
``` 

---

## Abas da Planilha

| Aba | Gerada por | Descrição |
|-----|------------|-----------|
| **e-mails** | Manual | Lista de destinatários do boletim (coluna A). |
| **palavras-chaves** | Manual | Palavras usadas na busca das APIs (coluna A). |
| **temas_ong** | Manual | Coluna A = *tema* · Coluna B = lista de palavras-chave separadas por vírgula; usada para classificar proposições. |
| **proposicoes_camara** | `camara.js` | Dump das proposições da Câmara nos últimos 3 dias (colunas padronizadas). |
| **proposicoes_senado** | `senado.js` | Dump das proposições do Senado nos últimos 3 dias (colunas padronizadas). |
| **log_camara** | `camara.js` | Timestamp + nº de novas proposições coletadas. |
| **log_senado** | `senado.js` | Timestamp + nº de novas proposições coletadas. |
| **log_email** | `envioemails.js` | Quando e para quantos destinatários o boletim foi enviado. |
| **dashboard** | Fórmulas Sheets | Union + limpeza + classificação; base única para BI. |
| **dashboard_export** | `dashboard.js` | Cópia protegida para evitar quebra em consultas externas. |

---

## Scripts e Gatilhos

| Script | O que faz | Gatilho sugerido |
|--------|-----------|------------------|
| `camara.js` (`coletaProposicoes`) | Busca proposições na API da Câmara de acordo com **palavras-chaves**, aplica classificação (ver abaixo) e grava em `proposicoes_camara`. | Todo dia às 02:00 |
| `senado.js` (`coletaProposicoesSenado`) | Idem para o Senado; inclui parser de autores e partidos. | Todo dia às 02:30 |
| `dashboard.js` (`atualizarDashboardExport`) | Copia a aba `dashboard` para `dashboard_export` e zera conteúdo anterior. | Todo dia às 03:30  |
| `envioemails.js` (`enviarRelatorioSemanal`) | Monta HTML dos últimos 7 dias e envia para os e-mails na aba `e-mails`; registra em `log_email`. | Toda sexta-feira às 08:00 |

---

### Classificação Temática  
1. Para cada linha, concatena **título + ementa**.  
2. Percorre a coluna B da aba **temas_ong**; se encontra qualquer palavra-chave da lista, atribui o tema (coluna A).  
3. Caso nenhuma palavra seja encontrada, retorna **“Sem Classificação”**.  
*(Implementado tanto em `camara.js` quanto em `senado.js` para manter cópia estática na planilha.)*

---

## Dashboard Power BI

**Link:** [Dashboard Monitoramento do Legislativo 2025](https://app.powerbi.com/view?r=eyJrIjoiZTlkNmI0Y2ItNGFjMS00MGYyLW1IODAtZWNiNzYzZTQ2NjIxIiwidCI6IjVyYTI0MTc0LWYxMzgtNGZiMS1iODY2LWFjZWI0TRZjK5MiJ9)

![image](https://github.com/user-attachments/assets/73c5a067-eb60-4cbf-ba79-fbf6bb1e535e)


> Fonte de dados: aba **`dashboard_export`** do Google Sheets — a cada execução do Apps Script, o Power BI é atualizado automaticamente.


| Área | O que você pode filtrar | Observação |
|------|------------------------|------------|
| **Casa** | Câmara ou Senado | Seleção múltipla permitida |
| **Ano, Mês** | Ano, mês ou dia | “Todos” exibe série completa |
| **Região, UF** | Estado de origem de deputados(as)/senadores(as) | Útil para análises regionais |
| **Tema** | Macro-tema classificado via `temas_ong` | Exibido no topo como barra empilhada |


### Visuais principais

1. **Cartão “Proposições Monitoradas”** – Número total de proposições monitoradas após filtragem.  
2. **Gráfico de colunas – Quantidade de Proposições por Temas**: Distribuição das proposições por temas (ex.: Saúde da Mulher, Violência Doméstica, etc.).  
3. **Gráfico de barras – Tipo de Proposições**: Distribuição das proposições por Tipo (ex.: PL, PEC, RQS, etc.).  
4. **Gráfico de rosca - Gênero dos(as) Autores(as)** –  Distribuição das proposições por Gênero dos(as) autores(as) (ex.: Feminino, Masculino, Outro).  
5. **Gráfico de barras – Partidos dos(as) Autores(as)** - Distribuição das proposições por Partido dos(as) autores(as) (ex.: PL, PSD, PT, MDB, etc.).
6. **Botão “Banco de Proposições”** – leva à tabela detalhada com link direto para cada proposição analisada.

---

## Guia de Instalação

```bash
# Pré-requisitos: Node.js LTS + npm

# 1. Clone o repositório
git clone https://github.com/zaradesouza/monitoramento-legislativo.git
cd monitoramento-legislativo

# 2. Instale o 'clasp' e faça login
npm install -g @google/clasp
clasp login

# 3. Configure o Script ID localmente
cp .clasp.json.example .clasp.json   # edite e insira seu SCRIPT_ID

# 4. Envie o código para o Apps Script
clasp push

Depois de publicar, abra o editor Apps Script → Triggers → crie os gatilhos conforme tabela acima.
```  

---

## Contato

Tem dúvidas, achou um bug ou gostaria de sugerir melhorias? 
Me manda um e-mail: [**zara@estudante.ufscar.br**](mailto:zara@estudante.ufscar.br)







