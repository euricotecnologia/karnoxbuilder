import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, rmSync, statSync } from 'fs'

let db: Database.Database | null = null

const FIXED_DATA_DIR = 'C:\\KarnoX\\Builder'
const DATABASE_FILE_NAME = 'karnoxbuilder.db'

function escapeSqliteString(value: string): string {
  return value.replace(/'/g, "''")
}

/**
 * Move o banco usado nas versões anteriores em AppData para o diretório
 * fixo da IDE. VACUUM INTO produz uma cópia SQLite consistente mesmo quando
 * a instalação antiga utilizava journal_mode=WAL.
 */
function migrateLegacyDatabase(destinationPath: string): void {
  if (existsSync(destinationPath)) return

  const legacyPath = join(app.getPath('userData'), DATABASE_FILE_NAME)
  if (!existsSync(legacyPath)) return

  const legacyDatabase = new Database(legacyPath)
  try {
    legacyDatabase.pragma('wal_checkpoint(TRUNCATE)')
    legacyDatabase.exec(`VACUUM INTO '${escapeSqliteString(destinationPath)}'`)
  } finally {
    legacyDatabase.close()
  }

  if (!existsSync(destinationPath) || statSync(destinationPath).size === 0) {
    throw new Error(`Não foi possível migrar o banco para ${destinationPath}.`)
  }

  // A remoção acontece somente depois da validação do novo arquivo.
  for (const suffix of ['', '-wal', '-shm']) {
    const oldFile = legacyPath + suffix
    if (existsSync(oldFile)) rmSync(oldFile, { force: true })
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  api_key_encrypted BLOB,
  default_model TEXT,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS database_profiles (
  kind TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  install_path TEXT,
  database_path TEXT,
  host TEXT,
  port TEXT,
  database_name TEXT,
  username TEXT,
  password_encrypted BLOB,
  options_json TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  last_opened_at TEXT NOT NULL,
  delphi_profile TEXT NOT NULL DEFAULT 'delphi10_13'
);

CREATE TABLE IF NOT EXISTS project_library_paths (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  platform TEXT NOT NULL,
  path_type TEXT NOT NULL,
  path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE(project_path, platform, path_type, path)
);

CREATE TABLE IF NOT EXISTS publish_profiles (
  project_path TEXT NOT NULL,
  environment TEXT NOT NULL,
  config_json TEXT NOT NULL,
  certificate_password_encrypted BLOB,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(project_path, environment)
);

CREATE TABLE IF NOT EXISTS prompt_history (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  prompt TEXT NOT NULL,
  response_summary TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_suggestions (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  category TEXT,
  is_default INTEGER NOT NULL DEFAULT 0
);
`

const DEFAULT_SUGGESTIONS: Array<{ label: string; prompt: string; category: string }> = [
  {
    label: 'Tela de cadastro CRUD',
    prompt:
      'Crie uma tela de cadastro (CRUD) com um DBGrid listando os registros e um formulário lateral com campos, além de botões Novo, Editar, Salvar, Cancelar e Excluir.',
    category: 'CRUD'
  },
  {
    label: 'Novo formulário',
    prompt: 'Crie um novo formulário Delphi em branco pronto para receber componentes.',
    category: 'Geral'
  },
  {
    label: 'Conexão com banco de dados (FireDAC)',
    prompt:
      'Adicione um data module com conexão FireDAC configurável (parâmetros de host, porta, usuário e senha) para SQL Server ou Firebird.',
    category: 'Dados'
  },
  {
    label: 'Menu principal',
    prompt:
      'Crie um formulário principal (MDI ou com painel lateral) com um menu de navegação para outras telas do sistema.',
    category: 'Geral'
  },
  {
    label: 'Tela de login',
    prompt: 'Crie uma tela de login com campos de usuário e senha, botão Entrar e validação básica.',
    category: 'Geral'
  },
  {
    label: 'Corrigir erros de compilação',
    prompt: 'Corrija os erros de compilação apresentados no console, mantendo o comportamento original do formulário.',
    category: 'Manutenção'
  }
]

const SMART_SUGGESTIONS: Array<{ label: string; prompt: string; category: string }> = [
  { label: 'Criar DataModule', prompt: 'Crie um DataModule separado para centralizar conexões, consultas e regras de acesso a dados, respeitando o perfil Delphi e o banco configurado na IDE.', category: 'Dados' },
  { label: 'Cadastro mestre/detalhe', prompt: 'Crie um cadastro mestre/detalhe completo, com transação, validações e interface VCL consistente com o projeto.', category: 'Dados' },
  { label: 'Pesquisa com filtros', prompt: 'Adicione uma tela de pesquisa com filtros combináveis, ordenação, paginação e seleção do registro.', category: 'Interface' },
  { label: 'Dashboard com indicadores', prompt: 'Crie um dashboard VCL com indicadores, filtros por período e gráficos compatíveis com os componentes disponíveis no perfil Delphi selecionado.', category: 'Interface' },
  { label: 'Usuários e permissões', prompt: 'Implemente controle de usuários, perfis e permissões por funcionalidade, armazenando senhas com hash seguro e sem expor credenciais.', category: 'Segurança' },
  { label: 'Auditoria de alterações', prompt: 'Implemente auditoria de inclusão, alteração e exclusão, registrando usuário, data, tabela, chave e valores alterados.', category: 'Segurança' },
  { label: 'Consumir API REST', prompt: 'Crie uma integração REST com autenticação configurável, serialização JSON, tratamento de timeout e mensagens de erro.', category: 'Integração' },
  { label: 'Exportar dados', prompt: 'Adicione exportação dos dados exibidos para CSV, Excel e PDF, preservando filtros e cabeçalhos.', category: 'Relatórios' },
  { label: 'Relatório e impressão', prompt: 'Crie um relatório imprimível com cabeçalho, filtros, totalizadores, paginação e visualização antes de imprimir.', category: 'Relatórios' },
  { label: 'Refatorar unit atual', prompt: 'Refatore a unit atualmente aberta para melhorar legibilidade, separação de responsabilidades e manutenção, sem alterar o comportamento.', category: 'Qualidade' },
  { label: 'Revisar memória e recursos', prompt: 'Revise a unit atual procurando vazamentos de memória, objetos sem liberação, datasets abertos e recursos sem try/finally; aplique correções seguras.', category: 'Qualidade' },
  { label: 'Documentar código', prompt: 'Documente classes, métodos e regras relevantes da unit atual com comentários objetivos, sem poluir trechos triviais.', category: 'Qualidade' },
  { label: 'Organizar uses', prompt: 'Organize as cláusulas uses do projeto, remova units comprovadamente não utilizadas e preserve dependências necessárias aos formulários.', category: 'Manutenção' },
  { label: 'Migrar versão Delphi', prompt: 'Analise o projeto e adapte o código para o perfil Delphi selecionado, corrigindo namespaces, APIs, componentes e codificação incompatíveis.', category: 'Migração' },
  { label: 'Criar serviço Windows', prompt: 'Crie a estrutura de um serviço Windows Delphi com instalação, inicialização, parada, log e tratamento seguro de exceções.', category: 'Projeto' },
  { label: 'Backup do banco', prompt: 'Implemente uma rotina de backup e restauração para o banco configurado, com validação do destino, progresso, log e mensagens claras.', category: 'Dados' }
]

const BUSINESS_SUGGESTIONS: Array<{ label: string; prompt: string; category: string }> = [
  {
    label: 'Criar NF-e com ACBr',
    prompt: 'Crie um módulo completo de emissão de NF-e modelo 55 usando ACBrNFe: configuração por empresa e ambiente, certificado, montagem dos itens e tributos, validação, assinatura, envio, consulta, DANFE, cancelamento, carta de correção, inutilização e contingência. Antes de gerar, examine as units e exemplos da versão do ACBr instalada; não invente classes ou propriedades e use os schemas e Notas Técnicas oficiais vigentes.',
    category: 'Fiscal / ACBr'
  },
  {
    label: 'Reforma Tributária 2026',
    prompt: 'Crie ou evolua no projeto Delphi um módulo completo para a Reforma Tributária do Consumo de 2026, contemplando CBS, IBS e IS e a integração fiscal com a versão do ACBr instalada. Antes de alterar o projeto, identifique o banco de dados ativo nas Configurações da IDE, a versão do Delphi, os componentes ACBr disponíveis e a estrutura fiscal já existente. Crie migrações compatíveis com o dialeto do banco ativo e uma modelagem normalizada para vigências, CST, classificações tributárias/cClassTrib, regras por operação, NCM/NBS, produtos e serviços, bases, alíquotas, reduções, diferimentos, créditos, estornos, devoluções, regimes, benefícios, jurisdições do IBS, totalizadores, documentos fiscais, fontes oficiais e histórico das importações. Implemente um importador idempotente e transacional que obtenha e importe todos os dados oficiais disponíveis para CBS, IBS e IS, com pré-visualização, validação, upsert, controle de versão e vigência, checksum, log, auditoria, rollback e prevenção de duplicidades; nunca invente dados, alíquotas ou regras ausentes. Preserve os tributos e leiautes necessários ao período de transição, atualize NF-e e NFC-e conforme os schemas e Notas Técnicas oficiais vigentes e use somente classes, propriedades e exemplos existentes na instalação local do ACBr. Crie telas para configurar, importar, consultar e atualizar as tabelas, uma camada de cálculo separada da interface, testes com cenários de transição e relatório de inconsistências. Senhas e credenciais não podem ser gravadas no código. Tudo que depender de legislação atual, UF, município, regime, contador ou parametrização do cliente deve permanecer configurável e ser sinalizado para validação fiscal antes do uso em produção.',
    category: 'Fiscal / ACBr'
  },
  {
    label: 'Criar NFC-e com ACBr',
    prompt: 'Crie um módulo de NFC-e modelo 65 com ACBrNFe, incluindo CSC/Token, QR Code vigente, certificado, emissão normal e contingência offline, impressão do DANFCE, cancelamento e reconsulta. Use a versão instalada do ACBr e os schemas oficiais atuais.',
    category: 'Fiscal / ACBr'
  },
  {
    label: 'Criar NFS-e com ACBr',
    prompt: 'Crie um módulo de NFS-e usando ACBrNFSeX, com configuração de município e provedor, certificado, geração, envio, consulta, cancelamento e impressão. Separe as particularidades do provedor em configuração e valide os métodos disponíveis na versão instalada do ACBr.',
    category: 'Fiscal / ACBr'
  },
  {
    label: 'Criar CT-e com ACBr',
    prompt: 'Crie um módulo completo de CT-e usando ACBrCTe, com tomador, remetente, destinatário, documentos vinculados, componentes do valor, impostos, emissão, DACTE, cancelamento, carta de correção e eventos, conforme schemas oficiais vigentes.',
    category: 'Fiscal / ACBr'
  },
  {
    label: 'Criar MDF-e com ACBr',
    prompt: 'Crie um módulo de MDF-e usando ACBrMDFe, incluindo veículos, condutores, percurso, documentos vinculados, seguros, vale-pedágio, autorização, DAMDFE, encerramento, cancelamento e inclusão de condutor, conforme schemas oficiais vigentes.',
    category: 'Fiscal / ACBr'
  },
  {
    label: 'Manifestação do destinatário',
    prompt: 'Implemente manifestação do destinatário de NF-e com ACBr, incluindo consulta de documentos, ciência da operação, confirmação, desconhecimento, operação não realizada, download e armazenamento seguro do XML.',
    category: 'Fiscal / ACBr'
  },
  {
    label: 'Atualizar schemas fiscais',
    prompt: 'Analise o módulo fiscal e prepare uma atualização segura dos schemas e regras de NF-e/NFC-e para as Notas Técnicas oficiais vigentes. Identifique a versão atual, faça backup, valide a versão do ACBr instalada e liste incompatibilidades antes de alterar código ou configurações.',
    category: 'Fiscal / ACBr'
  },
  {
    label: 'Gerar SPED Fiscal',
    prompt: 'Crie a estrutura de geração e validação da EFD ICMS/IPI (SPED Fiscal) usando ACBrSPEDFiscal, com blocos parametrizáveis, inventário, apuração, registros filhos, validações e arquivo de auditoria. Não invente regras fiscais e sinalize dados que exigem definição do contador.',
    category: 'Fiscal / ACBr'
  },
  {
    label: 'Gerar SPED Contribuições',
    prompt: 'Crie a estrutura de EFD Contribuições usando o componente ACBr correspondente, com cadastros, documentos, apuração e validações parametrizáveis conforme leiaute oficial vigente. Separe regras fiscais do código e destaque o que precisa de validação contábil.',
    category: 'Fiscal / ACBr'
  },
  {
    label: 'Criar eSocial / Reinf',
    prompt: 'Crie uma base de integração para os eventos do eSocial e/ou EFD-Reinf necessários ao projeto, com filas, XML, assinatura, envio por lote, consulta, armazenamento de recibos e logs. Use exclusivamente leiautes oficiais vigentes e confirme quais eventos serão implementados antes de concluir regras trabalhistas ou tributárias.',
    category: 'Fiscal / ACBr'
  },
  {
    label: 'Enviar documentos por e-mail',
    prompt: 'Implemente envio de XML e PDF de documentos fiscais usando ACBrMail, com configuração SMTP criptografada, TLS, modelos de mensagem, múltiplos destinatários, fila, tentativas e log sem expor credenciais.',
    category: 'Fiscal / ACBr'
  },
  {
    label: 'Criar boleto com ACBr',
    prompt: 'Crie emissão de boletos usando ACBrBoleto, com configuração bancária, beneficiário, carteira, remessa, retorno, linha digitável, código de barras, impressão e baixa. Valide banco, leiaute CNAB e versão do ACBr antes de implementar.',
    category: 'Financeiro / ACBr'
  },
  {
    label: 'Criar PIX com ACBr',
    prompt: 'Crie integração PIX usando ACBrPIXCD, com configuração segura do PSP, OAuth/certificados, cobrança imediata, QR Code, consulta, devolução, webhook, conciliação e logs protegidos. Use a API e exemplos correspondentes ao PSP e à versão instalada do ACBr.',
    category: 'Financeiro / ACBr'
  },
  {
    label: 'Integrar TEF com ACBr',
    prompt: 'Implemente pagamento TEF com ACBrTEFD no fluxo do PDV, incluindo inicialização, venda, cancelamento, confirmação, desfazimento, impressão de vias, queda de comunicação e recuperação segura de transações pendentes.',
    category: 'Financeiro / ACBr'
  },
  {
    label: 'Criar contas a pagar',
    prompt: 'Crie um módulo de contas a pagar com fornecedores, parcelas, recorrência, centros de custo, juros, descontos, baixa parcial, estorno, anexos, fluxo de aprovação e relatórios.',
    category: 'Financeiro'
  },
  {
    label: 'Criar contas a receber',
    prompt: 'Crie um módulo de contas a receber com clientes, parcelas, baixa parcial, juros, descontos, renegociação, estorno, cobrança, conciliação e relatórios de inadimplência.',
    category: 'Financeiro'
  },
  {
    label: 'Criar fluxo de caixa',
    prompt: 'Crie um fluxo de caixa realizado e projetado, com contas, categorias, centros de custo, filtros, conciliação, saldo diário e gráficos, integrado às contas a pagar e receber.',
    category: 'Financeiro'
  },
  {
    label: 'Criar frente de caixa PDV',
    prompt: 'Crie uma frente de caixa VCL com leitura de código de barras, pesquisa de produtos, quantidade, descontos autorizados, múltiplos pagamentos, sangria, suprimento, fechamento e integração fiscal configurada.',
    category: 'Comercial'
  },
  {
    label: 'Criar controle de estoque',
    prompt: 'Crie um controle de estoque com entradas, saídas, reservas, transferências, inventário, lotes, validade, custo médio, estoque mínimo e rastreabilidade por documento.',
    category: 'Comercial'
  },
  {
    label: 'Criar pedidos e vendas',
    prompt: 'Crie um módulo de orçamento, pedido e venda com clientes, vendedores, tabelas de preço, descontos por permissão, reserva de estoque, faturamento parcial e histórico.',
    category: 'Comercial'
  },
  {
    label: 'Criar compras e cotações',
    prompt: 'Crie um módulo de solicitação, cotação e pedido de compra, com comparação de fornecedores, aprovação, previsão de entrega, recebimento parcial e atualização de estoque.',
    category: 'Comercial'
  },
  {
    label: 'Criar ordem de serviço',
    prompt: 'Crie um módulo de ordem de serviço com cliente, equipamento, defeito relatado, diagnóstico, peças, mão de obra, técnico, etapas, fotos, aprovação e impressão.',
    category: 'Comercial'
  },
  {
    label: 'Criar comissão de vendedores',
    prompt: 'Crie cálculo de comissão por vendedor, produto, categoria e faixa de desconto, com regras parametrizáveis, estorno por devolução, apuração por período e relatório detalhado.',
    category: 'Comercial'
  },
  {
    label: 'Importar XML de NF-e',
    prompt: 'Crie importação segura de XML de NF-e com validação de assinatura e schema, leitura de emitente, itens, tributos e duplicatas, associação de produtos, prevenção de duplicidade e geração opcional de entrada e contas a pagar.',
    category: 'Fiscal / ACBr'
  },
  {
    label: 'Consultar CNPJ e endereço',
    prompt: 'Crie uma consulta de CNPJ e CEP usando os componentes ACBr ou serviços configurados, preenchendo o cadastro com validação, timeout, cache, tratamento de indisponibilidade e respeito aos termos do serviço.',
    category: 'Integração'
  },
  {
    label: 'Adequar sistema à LGPD',
    prompt: 'Analise o projeto e implemente melhorias de LGPD: minimização de dados, consentimento quando aplicável, finalidade, controle de acesso, auditoria, criptografia de dados sensíveis, anonimização e rotinas de retenção e exclusão. Gere um relatório do que depende de decisão jurídica ou operacional.',
    category: 'Segurança'
  }
]

function migrate(database: Database.Database): void {
  const columns = database.prepare('PRAGMA table_info(ai_providers)').all() as Array<{ name: string }>
  const colNames = new Set(columns.map((c) => c.name))

  if (!colNames.has('kind')) {
    database.exec('ALTER TABLE ai_providers ADD COLUMN kind TEXT')
    database.exec("UPDATE ai_providers SET kind = provider_type WHERE kind IS NULL")
  }
  if (!colNames.has('base_url')) {
    database.exec('ALTER TABLE ai_providers ADD COLUMN base_url TEXT')
  }
  database.exec("UPDATE ai_providers SET provider_type = 'openai-compatible' WHERE provider_type = 'openai'")

  const projectColumns = database.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>
  if (!projectColumns.some((column) => column.name === 'delphi_profile')) {
    database.exec("ALTER TABLE projects ADD COLUMN delphi_profile TEXT NOT NULL DEFAULT 'delphi10_13'")
  }

  // Remove credenciais persistidas por versões que ainda exigiam conta e assinatura.
  database.exec('DROP TABLE IF EXISTS license_session')
}

export function initDatabase(): Database.Database {
  if (db) return db

  mkdirSync(FIXED_DATA_DIR, { recursive: true })
  const dbPath = join(FIXED_DATA_DIR, DATABASE_FILE_NAME)
  migrateLegacyDatabase(dbPath)
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  migrate(db)

  const insert = db.prepare(
    `INSERT INTO prompt_suggestions (id, label, prompt_text, category, is_default)
     VALUES (?, ?, ?, ?, 1)`
  )
  const updateDefault = db.prepare(
    'UPDATE prompt_suggestions SET prompt_text = ?, category = ? WHERE label = ? AND is_default = 1'
  )
  const syncDefaultSuggestions = db.transaction((rows: typeof DEFAULT_SUGGESTIONS) => {
    for (const row of rows) {
      const updated = updateDefault.run(row.prompt, row.category, row.label)
      if (updated.changes === 0) insert.run(randomUUID(), row.label, row.prompt, row.category)
    }
  })
  syncDefaultSuggestions([...DEFAULT_SUGGESTIONS, ...SMART_SUGGESTIONS, ...BUSINESS_SUGGESTIONS])

  return db
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
