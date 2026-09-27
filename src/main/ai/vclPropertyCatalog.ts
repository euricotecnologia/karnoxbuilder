/**
 * Catálogo de propriedades REAIS por classe VCL, organizado por herança —
 * exatamente como o Delphi decide em tempo de execução se uma propriedade
 * existe (via RTTI da classe e de seus ancestrais). Isso substitui a
 * abordagem anterior de ir bloqueando uma propriedade inválida de cada vez
 * conforme aparecia um novo relato: cada nova classe adicionada aqui já cobre
 * TODAS as propriedades dela de uma vez, então erros como "TStringGrid não
 * tem ReadOnly" ou "TStatusBar não tem TabOrder" não se repetem para nenhuma
 * outra propriedade da mesma classe.
 *
 * Cobre exatamente os componentes que `DELPHI_SYSTEM_PROMPT` autoriza a IA a
 * usar (ver delphiKnowledge.ts) — não é "toda a VCL", é o conjunto fechado e
 * conhecido de componentes que este gerador realmente produz. Isso mantém o
 * catálogo verificável e evita reivindicar precisão sobre componentes que
 * nunca são gerados aqui.
 *
 * Cada entrada de classe some com o conjunto de propriedades do(s) nível(is)
 * de herança acima dela (COMPONENT_PROPS -> CONTROL_PROPS ->
 * GRAPHIC_CONTROL_PROPS/WIN_CONTROL_PROPS -> propriedades próprias da
 * classe). Uma propriedade com "." (ex.: "Font.Color") valida o prefixo
 * inteiro ("Font") como aceito; sub-propriedades de Font/Constraints não
 * precisam ser listadas uma a uma.
 */

// TComponent: toda classe publicada no DFM tem, no mínimo, isto. "Left"/"Top"
// valem mesmo para componentes não-visuais (TTimer, TDataSource, TFDConnection
// etc.) — o streamer do Delphi os grava/lê via DesignInfo para posicionar o
// ícone no designer, independentemente de a classe declarar Left/Top como
// propriedade visual de verdade. Tratar isso como exclusivo de TControl
// removeria erroneamente essas linhas de componentes não-visuais.
const COMPONENT_PROPS = ['Name', 'Tag', 'Left', 'Top']

// TControl: todo controle visual (windowed ou não) herda isto. Inclui as
// propriedades "Explicit*"/Margins/AlignWithMargins/StyleElements/BiDiMode:
// o PRÓPRIO Delphi Designer grava essas linhas automaticamente em qualquer
// controle com Align/Anchors não-padrão ou com VCL Styles habilitado — não
// são exclusividade de código gerado por IA. Uma auditoria encontrou que a
// primeira versão deste catálogo não as incluía, o que faria o sanitizador
// apagar essas linhas de QUALQUER projeto Delphi real reaberto e recompilado
// na IDE (não só de projetos gerados por IA) — o oposto do que este catálogo
// deveria proteger.
const CONTROL_PROPS = [
  ...COMPONENT_PROPS,
  'Width', 'Height', 'Anchors', 'Align', 'Visible', 'Enabled',
  'Hint', 'ShowHint', 'ParentShowHint', 'Cursor', 'PopupMenu',
  'Constraints', 'DragMode', 'DragCursor', 'DragKind', 'Touch',
  'ExplicitLeft', 'ExplicitTop', 'ExplicitWidth', 'ExplicitHeight',
  'Margins', 'AlignWithMargins', 'StyleElements', 'BiDiMode', 'ParentBiDiMode'
]

// TGraphicControl: controles visuais SEM handle de janela própria — por isso
// NÃO têm TabOrder/TabStop/Ctl3D (não recebem foco do Windows diretamente).
// Ex.: TLabel, TImage, TShape, TBevel, TPaintBox.
const GRAPHIC_CONTROL_PROPS = [...CONTROL_PROPS]

// TWinControl: controles com handle de janela própria (recebem foco,
// participam da ordem de tabulação). A maioria dos componentes de entrada.
// "Color"/"ParentColor" NÃO entram aqui: vários TWinControl reais (TButton,
// TCheckBox, TRadioButton, TGroupBox) são desenhados pelo tema nativo do
// Windows e não publicam Color — incluir aqui exigiria memorizar exceção por
// exceção de novo, o mesmo problema que este catálogo existe para resolver.
// Cada classe declara Color/ParentColor no próprio "own" só quando é
// realmente publicado por ela. "Padding" é exclusivo de TWinControl (área
// interna reservada), também gravado automaticamente pelo Designer.
const WIN_CONTROL_PROPS = [
  ...CONTROL_PROPS,
  'TabOrder', 'TabStop', 'Font', 'ParentFont', 'Padding',
  'Ctl3D', 'ParentCtl3D', 'DoubleBuffered', 'ParentDoubleBuffered', 'ImeMode', 'ImeName'
]

const COLOR_PROPS = ['Color', 'ParentColor']

/**
 * Catálogo por classe (chave em minúsculas). O array é a lista de
 * propriedades ADICIONAIS além da base indicada — a validação em runtime
 * combina automaticamente com COMPONENT/CONTROL/GRAPHIC/WIN conforme a
 * classe. Ver `resolveClassProperties` no fim do arquivo.
 */
interface ClassEntry {
  base: 'graphic' | 'win' | 'component'
  own: string[]
  /** Propriedades da base que esta classe específica NÃO possui de verdade. */
  remove?: string[]
}

const VCL_CLASS_CATALOG: Record<string, ClassEntry> = {
  tform: {
    base: 'win',
    own: [
      ...COLOR_PROPS,
      'Caption', 'ClientHeight', 'ClientWidth', 'Position', 'FormStyle', 'BorderStyle',
      'BorderIcons', 'WindowState', 'Icon', 'Menu', 'KeyPreview', 'OldCreateOrder',
      'PixelsPerInch', 'TextHeight', 'AutoScroll', 'AutoSize', 'Scaled', 'PrintScale',
      'ShowHint', 'HelpFile', 'ActiveControl', 'OnCreate', 'OnDestroy', 'OnShow', 'OnClose',
      'OnCloseQuery', 'OnActivate', 'OnDeactivate', 'OnKeyDown', 'OnKeyUp', 'OnKeyPress',
      'DesignSize'
    ],
    remove: ['TabOrder', 'TabStop']
  },
  tframe: { base: 'win', own: [] },
  tdatamodule: { base: 'component', own: ['OldCreateOrder', 'Height', 'Width', 'OnCreate', 'OnDestroy'] },

  tlabel: {
    base: 'graphic',
    own: [
      'Caption', 'Color', 'Font', 'ParentFont', 'ParentColor', 'Alignment', 'AutoSize',
      'Layout', 'WordWrap', 'Transparent', 'FocusControl', 'ShowAccelChar', 'EllipsisPosition'
    ]
  },
  tstatictext: {
    base: 'win',
    own: ['Caption', 'Alignment', 'AutoSize', 'BevelInner', 'BevelOuter', 'BevelKind', 'BorderStyle']
  },

  tedit: {
    base: 'win',
    own: [
      ...COLOR_PROPS,
      'Text', 'MaxLength', 'PasswordChar', 'ReadOnly', 'CharCase', 'BorderStyle',
      'AutoSelect', 'HideSelection', 'OEMConvert', 'Alignment', 'NumbersOnly', 'TextHint'
    ]
  },
  tmaskedit: {
    base: 'win',
    own: [
      ...COLOR_PROPS,
      'Text', 'EditMask', 'MaxLength', 'PasswordChar', 'ReadOnly', 'BorderStyle',
      'AutoSelect', 'HideSelection', 'OEMConvert', 'TextHint'
    ]
  },
  tmemo: {
    base: 'win',
    own: [
      ...COLOR_PROPS,
      'Lines', 'ReadOnly', 'ScrollBars', 'WordWrap', 'WantReturns', 'WantTabs',
      'MaxLength', 'Alignment', 'BorderStyle', 'HideSelection', 'OEMConvert'
    ]
  },
  trichedit: {
    base: 'win',
    own: [
      ...COLOR_PROPS,
      'Lines', 'ReadOnly', 'ScrollBars', 'WordWrap', 'WantReturns', 'WantTabs',
      'MaxLength', 'Alignment', 'BorderStyle', 'HideSelection', 'PlainText', 'ZoomPercent'
    ]
  },

  tbutton: { base: 'win', own: ['Caption', 'Default', 'Cancel', 'ModalResult'] },
  tbitbtn: {
    base: 'win',
    own: ['Caption', 'Kind', 'Glyph', 'NumGlyphs', 'Layout', 'Margin', 'Spacing', 'Style', 'Default', 'Cancel', 'ModalResult']
  },
  tspeedbutton: {
    base: 'graphic',
    own: ['Caption', 'Glyph', 'NumGlyphs', 'Layout', 'Margin', 'Spacing', 'GroupIndex', 'Down', 'AllowAllUp', 'Flat']
  },

  tcheckbox: {
    base: 'win',
    own: ['Caption', 'Checked', 'State', 'AllowGrayed', 'Alignment']
  },
  tradiobutton: {
    base: 'win',
    own: ['Caption', 'Checked', 'Alignment', 'TabStop']
  },
  tradiogroup: {
    base: 'win',
    own: ['Caption', 'Items', 'ItemIndex', 'Columns', 'BorderWidth']
  },

  tlistbox: {
    base: 'win',
    own: [...COLOR_PROPS, 'Items', 'ItemIndex', 'MultiSelect', 'Sorted', 'ExtendedSelect', 'Style', 'Columns', 'IntegralHeight', 'BorderStyle']
  },
  tcombobox: {
    // TComboBox (TCustomComboBox) não publica "ReadOnly" de verdade — o modo
    // somente-leitura é obtido com Style = csDropDownList, não uma propriedade
    // própria. "TextHint" existe (placeholder exibido quando Text está vazio).
    base: 'win',
    own: [...COLOR_PROPS, 'Text', 'Items', 'ItemIndex', 'Style', 'Sorted', 'DropDownCount', 'MaxLength', 'AutoComplete', 'CharCase', 'TextHint']
  },
  tcolorbox: {
    base: 'win',
    own: ['Selected', 'Style', 'DefaultColorColor', 'NoneColorColor', 'CustomColorCaption']
  },

  tgroupbox: { base: 'win', own: ['Caption'] },
  tpanel: {
    base: 'win',
    own: [
      ...COLOR_PROPS,
      'Caption', 'Alignment', 'BevelInner', 'BevelOuter', 'BevelWidth', 'BevelEdges',
      'BevelKind', 'BorderWidth', 'BorderStyle', 'FullRepaint', 'ParentBackground', 'ShowCaption'
    ]
  },
  tscrollbox: { base: 'win', own: [...COLOR_PROPS, 'BorderStyle', 'AutoScroll', 'HorzScrollBar', 'VertScrollBar'] },

  tpagecontrol: {
    base: 'win',
    own: ['ActivePage', 'MultiLine', 'HotTrack', 'Style', 'TabHeight', 'TabWidth', 'TabPosition', 'Images', 'OwnerDraw']
  },
  ttabsheet: { base: 'win', own: ['Caption', 'ImageIndex'] },

  tstatusbar: {
    base: 'win',
    own: ['SimplePanel', 'SimpleText', 'Panels', 'SizeGrip'],
    remove: ['TabOrder', 'TabStop']
  },
  ttoolbar: {
    base: 'win',
    own: ['ButtonHeight', 'ButtonWidth', 'Flat', 'Images', 'ShowCaptions', 'Wrapable', 'EdgeBorders', 'EdgeInner', 'EdgeOuter'],
    remove: ['TabOrder']
  },

  tmainmenu: { base: 'component', own: ['Items', 'Images', 'AutoMerge'] },
  tpopupmenu: { base: 'component', own: ['Items', 'Images', 'Alignment', 'AutoPopup'] },
  tmenuitem: {
    base: 'component',
    own: ['Caption', 'Checked', 'Enabled', 'Visible', 'AutoCheck', 'RadioItem', 'GroupIndex', 'ShortCut', 'Default', 'ImageIndex']
  },

  tstringgrid: {
    base: 'win',
    own: [
      ...COLOR_PROPS,
      'ColCount', 'RowCount', 'FixedCols', 'FixedRows', 'Options', 'DefaultColWidth',
      'DefaultRowHeight', 'DefaultDrawing', 'GridLineWidth', 'ScrollBars', 'Cells', 'ColWidths', 'RowHeights'
    ]
  },
  tdrawgrid: {
    base: 'win',
    own: [...COLOR_PROPS, 'ColCount', 'RowCount', 'FixedCols', 'FixedRows', 'Options', 'DefaultColWidth', 'DefaultRowHeight', 'DefaultDrawing', 'GridLineWidth', 'ScrollBars']
  },
  tdbgrid: {
    base: 'win',
    own: [...COLOR_PROPS, 'DataSource', 'Columns', 'Options', 'ReadOnly', 'TitleFont', 'FixedColor', 'FixedFont']
  },

  tmonthcalendar: {
    base: 'win',
    own: ['Date', 'MinDate', 'MaxDate', 'WeekNumbers', 'StartOfWeek', 'CalColors']
  },
  tprogressbar: {
    base: 'win',
    own: ['Min', 'Max', 'Position', 'Step', 'Orientation', 'Smooth', 'State', 'Style']
  },
  ttrackbar: {
    base: 'win',
    own: ['Min', 'Max', 'Position', 'Frequency', 'LineSize', 'PageSize', 'Orientation', 'TickMarks', 'TickStyle', 'ThumbLength']
  },
  tupdown: { base: 'win', own: ['Min', 'Max', 'Position', 'Increment', 'Associate', 'Orientation', 'Wrap'] },
  tdatetimepicker: { base: 'win', own: ['Date', 'Time', 'DateTime', 'Kind', 'Format', 'DateFormat', 'DateMode', 'ShowCheckbox', 'Checked'] },
  ttreeview: { base: 'win', own: ['Items', 'Indent', 'ShowLines', 'ShowRoot', 'ShowButtons', 'ReadOnly', 'RightClickSelect', 'Images', 'HideSelection'] },
  tlistview: { base: 'win', own: ['Items', 'Columns', 'ViewStyle', 'ReadOnly', 'RowSelect', 'GridLines', 'SmallImages', 'LargeImages', 'MultiSelect', 'HideSelection'] },

  ttimer: { base: 'component', own: ['Interval', 'Enabled', 'OnTimer'] },
  tchart: {
    base: 'win',
    own: ['Title', 'Legend', 'View3D', 'BackWall', 'LeftAxis', 'BottomAxis', 'AllowZoom', 'Series']
  },

  tdbnavigator: { base: 'win', own: ['DataSource', 'VisibleButtons', 'ConfirmDelete'] },
  tdatasource: { base: 'component', own: ['DataSet', 'Enabled', 'AutoEdit'] },
  tdbedit: { base: 'win', own: [...COLOR_PROPS, 'DataSource', 'DataField', 'ReadOnly', 'CharCase', 'MaxLength', 'PasswordChar', 'Alignment'] },
  tdbtext: { base: 'graphic', own: ['DataSource', 'DataField', 'Alignment', 'AutoSize', 'Color', 'Font', 'ParentFont', 'ParentColor'] },
  tdbmemo: { base: 'win', own: [...COLOR_PROPS, 'DataSource', 'DataField', 'ReadOnly', 'ScrollBars', 'WordWrap'] },
  tdbcheckbox: { base: 'win', own: ['DataSource', 'DataField', 'Caption', 'ValueChecked', 'ValueUnchecked', 'Alignment'] },
  tdblookupcombobox: { base: 'win', own: ['DataSource', 'DataField', 'ListSource', 'KeyField', 'ListField', 'DropDownWidth'] },
  tdblookuplistbox: { base: 'win', own: ['DataSource', 'DataField', 'ListSource', 'KeyField', 'ListField'] },
  tdbradiogroup: { base: 'win', own: ['DataSource', 'DataField', 'Caption', 'Items', 'Values', 'Columns'] },
  tdbctrlgrid: { base: 'win', own: ['DataSource', 'RowCount', 'PanelWidth', 'PanelHeight', 'ColCount'] },

  tfdconnection: { base: 'component', own: ['Params', 'Connected', 'LoginPrompt', 'DriverName'] },
  tfdquery: { base: 'component', own: ['Connection', 'SQL', 'Active', 'Params'] },
  tfdtable: { base: 'component', own: ['Connection', 'TableName', 'Active'] },
  tfdstoredproc: { base: 'component', own: ['Connection', 'StoredProcName', 'Active', 'Params'] },
  tfdmemtable: { base: 'component', own: ['Active', 'FieldDefs'] },

  timage: {
    base: 'graphic',
    own: ['Picture', 'Stretch', 'Proportional', 'Center', 'Transparent', 'AutoSize', 'IncrementalDisplay']
  },
  tshape: { base: 'graphic', own: ['Shape', 'Brush', 'Pen'] },
  tbevel: { base: 'graphic', own: ['Shape', 'Style'] },
  tpaintbox: { base: 'graphic', own: ['OnPaint'] },
  tsplitter: { base: 'graphic', own: ['MinSize', 'ResizeStyle', 'Beveled'] },

  topendialog: {
    base: 'component',
    own: ['Filter', 'FilterIndex', 'InitialDir', 'DefaultExt', 'FileName', 'Files', 'Options', 'Title']
  },
  tsavedialog: {
    base: 'component',
    own: ['Filter', 'FilterIndex', 'InitialDir', 'DefaultExt', 'FileName', 'Options', 'Title']
  },
  topenpicturedialog: { base: 'component', own: ['Filter', 'FilterIndex', 'InitialDir', 'DefaultExt', 'FileName', 'Options', 'Title'] },
  tfontdialog: { base: 'component', own: ['Font', 'Options', 'MinFontSize', 'MaxFontSize'] },
  tcolordialog: { base: 'component', own: ['Color', 'Options', 'CustomColors'] },
  tprintdialog: { base: 'component', own: ['Options', 'MinPage', 'MaxPage', 'FromPage', 'ToPage', 'Copies', 'PrintRange'] },

  txpmanifest: { base: 'component', own: [] },
  ttrayicon: { base: 'component', own: ['Icon', 'Hint', 'Visible', 'PopupMenu', 'BalloonHint', 'BalloonTitle', 'OnClick', 'OnDblClick'] },
  tactionmanager: { base: 'component', own: ['ActionBars', 'Images'] },
  tballoonhint: { base: 'component', own: ['Title', 'Description', 'Icon', 'Style'] },
  tactionlist: { base: 'component', own: ['Images'] },
  taction: { base: 'component', own: ['Caption', 'Enabled', 'Visible', 'ShortCut', 'ImageIndex', 'OnExecute'] },
  timagelist: { base: 'component', own: ['Width', 'Height', 'Masked'] }
}

function expandDotted(names: string[]): Set<string> {
  return new Set(names.map((name) => name.toLowerCase()))
}

const CACHE = new Map<string, Set<string>>()

/** Retorna o conjunto de propriedades válidas (em minúsculas) para uma classe conhecida, ou null se a classe não está no catálogo. */
export function knownPropertiesFor(className: string): Set<string> | null {
  const key = className.toLowerCase()
  if (CACHE.has(key)) return CACHE.get(key) as Set<string>
  const entry = VCL_CLASS_CATALOG[key]
  if (!entry) return null

  const base = entry.base === 'graphic' ? GRAPHIC_CONTROL_PROPS : entry.base === 'win' ? WIN_CONTROL_PROPS : COMPONENT_PROPS
  const removed = new Set((entry.remove ?? []).map((name) => name.toLowerCase()))
  const combined = [...base.filter((name) => !removed.has(name.toLowerCase())), ...entry.own]
  const resolved = expandDotted(combined)
  CACHE.set(key, resolved)
  return resolved
}

/**
 * True se `propertyName` (ex.: "ReadOnly" ou "Font.Color") é reconhecida
 * para `className`. Propriedades com "." só precisam do prefixo cadastrado
 * (ex.: "Font") — sub-propriedades de Font/Constraints/Brush/Pen não são
 * listadas uma a uma. Eventos ("OnClick", "OnCreate" etc.) sempre retornam
 * true — não são "propriedades" no sentido deste catálogo e o gerador cria
 * livremente novos manipuladores de evento com nomes que não dá para prever
 * aqui. Classes fora do catálogo também sempre retornam true (sem validação),
 * para nunca quebrar componentes que este catálogo não cobre. Esta função é o
 * único lugar que decide isso — qualquer chamador (DFM ou .pas) fica
 * protegido automaticamente, sem precisar lembrar de repetir a exceção.
 */
export function isKnownProperty(className: string, propertyName: string): boolean {
  if (/^on[a-z]/i.test(propertyName)) return true
  const known = knownPropertiesFor(className)
  if (!known) return true
  const normalized = propertyName.toLowerCase()
  const prefix = normalized.split('.')[0]
  return known.has(normalized) || known.has(prefix)
}

/** True apenas se a classe está mapeada no catálogo (usado para decidir se vale a pena validar). */
export function isCataloguedClass(className: string): boolean {
  return VCL_CLASS_CATALOG[className.toLowerCase()] !== undefined
}
