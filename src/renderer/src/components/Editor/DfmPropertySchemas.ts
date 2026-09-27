import type { DfmPropertyType } from './DfmEditor'

export interface DfmInspectorProperty {
  name: string
  label: string
  section: string
  type: DfmPropertyType
  defaultValue: string
  options?: string[]
}

const ALIGN = ['alNone', 'alTop', 'alBottom', 'alLeft', 'alRight', 'alClient', 'alCustom']
const TEXT_ALIGNMENT = ['taLeftJustify', 'taRightJustify', 'taCenter']
const FONT_COLORS = ['clWindowText', 'clBlack', 'clGray', 'clSilver', 'clWhite', 'clRed', 'clGreen', 'clBlue', 'clNavy']
const FONT_STYLES = ['[]', '[fsBold]', '[fsItalic]', '[fsUnderline]', '[fsStrikeOut]', '[fsBold, fsItalic]', '[fsBold, fsUnderline]']
const COLORS = ['clBtnFace', 'clWindow', 'clWhite', 'clBlack', 'clRed', 'clGreen', 'clBlue', 'clYellow', 'clGray', 'clSilver', 'clNavy', 'clSkyBlue', 'clMoneyGreen']
const BOOL = ['True', 'False']

const align = (): DfmInspectorProperty => ({ name: 'Align', label: 'Align', section: 'Layout', type: 'identifier', defaultValue: 'alNone', options: ALIGN })
const font = (): DfmInspectorProperty[] => [
  { name: 'ParentFont', label: 'Herdar do formulário', section: 'Fonte', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'Font.Name', label: 'Nome', section: 'Fonte', type: 'string', defaultValue: 'Segoe UI' },
  { name: 'Font.Height', label: 'Altura', section: 'Fonte', type: 'number', defaultValue: '-12' },
  { name: 'Font.Color', label: 'Cor', section: 'Fonte', type: 'identifier', defaultValue: 'clWindowText', options: FONT_COLORS },
  { name: 'Font.Style', label: 'Estilo', section: 'Fonte', type: 'set', defaultValue: '[]', options: FONT_STYLES }
]

const PANEL_PROPERTIES: DfmInspectorProperty[] = [
  align(),
  { name: 'Alignment', label: 'Alignment', section: 'Layout', type: 'identifier', defaultValue: 'taCenter', options: TEXT_ALIGNMENT },
  { name: 'BevelOuter', label: 'BevelOuter', section: 'Aparência', type: 'identifier', defaultValue: 'bvRaised', options: ['bvNone', 'bvLowered', 'bvRaised', 'bvSpace'] },
  { name: 'BorderStyle', label: 'BorderStyle', section: 'Aparência', type: 'identifier', defaultValue: 'bsNone', options: ['bsNone', 'bsSingle'] },
  { name: 'ParentBackground', label: 'ParentBackground', section: 'Aparência', type: 'boolean', defaultValue: 'True', options: BOOL },
  ...font()
]

const BITBTN_PROPERTIES: DfmInspectorProperty[] = [
  align(),
  { name: 'Layout', label: 'Layout do Glyph', section: 'Layout', type: 'identifier', defaultValue: 'blGlyphLeft', options: ['blGlyphLeft', 'blGlyphRight', 'blGlyphTop', 'blGlyphBottom'] },
  { name: 'Margin', label: 'Margem', section: 'Layout', type: 'number', defaultValue: '-1' },
  { name: 'Spacing', label: 'Espaçamento', section: 'Layout', type: 'number', defaultValue: '4' },
  { name: 'Cancel', label: 'Cancel', section: 'Comportamento', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'Default', label: 'Default', section: 'Comportamento', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'ModalResult', label: 'ModalResult', section: 'Comportamento', type: 'identifier', defaultValue: 'mrNone', options: ['mrNone', 'mrOk', 'mrCancel', 'mrAbort', 'mrRetry', 'mrIgnore', 'mrYes', 'mrNo', 'mrAll', 'mrNoToAll', 'mrYesToAll', 'mrClose'] },
  { name: 'Kind', label: 'Kind', section: 'Aparência', type: 'identifier', defaultValue: 'bkCustom', options: ['bkCustom', 'bkOK', 'bkCancel', 'bkHelp', 'bkYes', 'bkNo', 'bkClose', 'bkAbort', 'bkRetry', 'bkIgnore', 'bkAll'] },
  { name: 'NumGlyphs', label: 'Quantidade de Glyphs', section: 'Aparência', type: 'number', defaultValue: '1' },
  { name: 'WordWrap', label: 'Quebrar texto', section: 'Aparência', type: 'boolean', defaultValue: 'False', options: BOOL },
  ...font()
]

const LABEL_PROPERTIES: DfmInspectorProperty[] = [
  align(),
  { name: 'Alignment', label: 'Alinhamento horizontal', section: 'Layout', type: 'identifier', defaultValue: 'taLeftJustify', options: TEXT_ALIGNMENT },
  { name: 'Layout', label: 'Alinhamento vertical', section: 'Layout', type: 'identifier', defaultValue: 'tlTop', options: ['tlTop', 'tlCenter', 'tlBottom'] },
  { name: 'AutoSize', label: 'Tamanho automático', section: 'Layout', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'WordWrap', label: 'Quebrar texto', section: 'Conteúdo', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'ShowAccelChar', label: 'Usar acelerador (&)', section: 'Conteúdo', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'EllipsisPosition', label: 'Reticências', section: 'Conteúdo', type: 'identifier', defaultValue: 'epNone', options: ['epNone', 'epPathEllipsis', 'epEndEllipsis', 'epWordEllipsis'] },
  { name: 'Transparent', label: 'Transparente', section: 'Aparência', type: 'boolean', defaultValue: 'True', options: BOOL },
  ...font()
]

const EDIT_PROPERTIES: DfmInspectorProperty[] = [
  align(),
  { name: 'Alignment', label: 'Alinhamento', section: 'Layout', type: 'identifier', defaultValue: 'taLeftJustify', options: TEXT_ALIGNMENT },
  { name: 'Text', label: 'Texto', section: 'Conteúdo', type: 'string', defaultValue: '' },
  { name: 'TextHint', label: 'Texto de orientação', section: 'Conteúdo', type: 'string', defaultValue: '' },
  { name: 'AutoSelect', label: 'Selecionar ao entrar', section: 'Comportamento', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'CharCase', label: 'Maiúsculas/minúsculas', section: 'Comportamento', type: 'identifier', defaultValue: 'ecNormal', options: ['ecNormal', 'ecUpperCase', 'ecLowerCase'] },
  { name: 'HideSelection', label: 'Ocultar seleção ao sair', section: 'Comportamento', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'MaxLength', label: 'Tamanho máximo', section: 'Comportamento', type: 'number', defaultValue: '0' },
  { name: 'NumbersOnly', label: 'Somente números', section: 'Comportamento', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'PasswordChar', label: 'Caractere de senha', section: 'Comportamento', type: 'string', defaultValue: '' },
  { name: 'ReadOnly', label: 'Somente leitura', section: 'Comportamento', type: 'boolean', defaultValue: 'False', options: BOOL },
  ...font()
]

const MEMO_PROPERTIES: DfmInspectorProperty[] = [
  align(),
  { name: 'Alignment', label: 'Alinhamento', section: 'Layout', type: 'identifier', defaultValue: 'taLeftJustify', options: TEXT_ALIGNMENT },
  { name: 'ScrollBars', label: 'Barras de rolagem', section: 'Layout', type: 'identifier', defaultValue: 'ssNone', options: ['ssNone', 'ssHorizontal', 'ssVertical', 'ssBoth'] },
  { name: 'WantReturns', label: 'Enter cria nova linha', section: 'Comportamento', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'WantTabs', label: 'Tab insere tabulação', section: 'Comportamento', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'WordWrap', label: 'Quebrar texto', section: 'Comportamento', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'ReadOnly', label: 'Somente leitura', section: 'Comportamento', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'MaxLength', label: 'Tamanho máximo', section: 'Comportamento', type: 'number', defaultValue: '0' },
  ...font()
]

const CHECKBOX_PROPERTIES: DfmInspectorProperty[] = [
  align(),
  { name: 'Alignment', label: 'Posição da caixa', section: 'Layout', type: 'identifier', defaultValue: 'taRightJustify', options: ['taLeftJustify', 'taRightJustify'] },
  { name: 'AllowGrayed', label: 'Permitir indeterminado', section: 'Comportamento', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'Checked', label: 'Marcado', section: 'Comportamento', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'State', label: 'Estado', section: 'Comportamento', type: 'identifier', defaultValue: 'cbUnchecked', options: ['cbUnchecked', 'cbChecked', 'cbGrayed'] },
  { name: 'WordWrap', label: 'Quebrar texto', section: 'Aparência', type: 'boolean', defaultValue: 'False', options: BOOL },
  ...font()
]

const RADIOBUTTON_PROPERTIES: DfmInspectorProperty[] = [
  align(),
  { name: 'Alignment', label: 'Posição do indicador', section: 'Layout', type: 'identifier', defaultValue: 'taRightJustify', options: ['taLeftJustify', 'taRightJustify'] },
  { name: 'Checked', label: 'Selecionado', section: 'Comportamento', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'WordWrap', label: 'Quebrar texto', section: 'Aparência', type: 'boolean', defaultValue: 'False', options: BOOL },
  ...font()
]

const COMBOBOX_PROPERTIES: DfmInspectorProperty[] = [
  align(),
  { name: 'Style', label: 'Estilo', section: 'Aparência', type: 'identifier', defaultValue: 'csDropDown', options: ['csDropDown', 'csSimple', 'csDropDownList', 'csOwnerDrawFixed', 'csOwnerDrawVariable'] },
  { name: 'Text', label: 'Texto', section: 'Conteúdo', type: 'string', defaultValue: '' },
  { name: 'TextHint', label: 'Texto de orientação', section: 'Conteúdo', type: 'string', defaultValue: '' },
  { name: 'ItemIndex', label: 'Item selecionado', section: 'Conteúdo', type: 'number', defaultValue: '-1' },
  { name: 'DropDownCount', label: 'Itens visíveis', section: 'Comportamento', type: 'number', defaultValue: '8' },
  { name: 'AutoComplete', label: 'Autocompletar', section: 'Comportamento', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'AutoDropDown', label: 'Abrir automaticamente', section: 'Comportamento', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'CharCase', label: 'Maiúsculas/minúsculas', section: 'Comportamento', type: 'identifier', defaultValue: 'ecNormal', options: ['ecNormal', 'ecUpperCase', 'ecLowerCase'] },
  { name: 'MaxLength', label: 'Tamanho máximo', section: 'Comportamento', type: 'number', defaultValue: '0' },
  { name: 'Sorted', label: 'Ordenar itens', section: 'Comportamento', type: 'boolean', defaultValue: 'False', options: BOOL },
  ...font()
]

const LISTBOX_PROPERTIES: DfmInspectorProperty[] = [
  align(),
  { name: 'Style', label: 'Estilo', section: 'Aparência', type: 'identifier', defaultValue: 'lbStandard', options: ['lbStandard', 'lbOwnerDrawFixed', 'lbOwnerDrawVariable', 'lbVirtual', 'lbVirtualOwnerDraw'] },
  { name: 'Columns', label: 'Colunas', section: 'Layout', type: 'number', defaultValue: '0' },
  { name: 'ItemHeight', label: 'Altura do item', section: 'Layout', type: 'number', defaultValue: '13' },
  { name: 'ItemIndex', label: 'Item selecionado', section: 'Conteúdo', type: 'number', defaultValue: '-1' },
  { name: 'MultiSelect', label: 'Seleção múltipla', section: 'Comportamento', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'ExtendedSelect', label: 'Seleção estendida', section: 'Comportamento', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'IntegralHeight', label: 'Altura integral', section: 'Comportamento', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'Sorted', label: 'Ordenar itens', section: 'Comportamento', type: 'boolean', defaultValue: 'False', options: BOOL },
  ...font()
]

const IMAGE_PROPERTIES: DfmInspectorProperty[] = [
  align(),
  { name: 'AutoSize', label: 'Tamanho automático', section: 'Layout', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'Center', label: 'Centralizar', section: 'Exibição', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'Proportional', label: 'Proporcional', section: 'Exibição', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'Stretch', label: 'Esticar', section: 'Exibição', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'Transparent', label: 'Transparente', section: 'Exibição', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'IncrementalDisplay', label: 'Exibição incremental', section: 'Comportamento', type: 'boolean', defaultValue: 'False', options: BOOL }
]

const MASKEDIT_PROPERTIES: DfmInspectorProperty[] = [
  ...EDIT_PROPERTIES.filter((property) => !['NumbersOnly'].includes(property.name)),
  { name: 'EditMask', label: 'Máscara', section: 'Conteúdo', type: 'string', defaultValue: '' }
]

const COLORBOX_PROPERTIES: DfmInspectorProperty[] = [
  align(),
  { name: 'Selected', label: 'Cor selecionada', section: 'Conteúdo', type: 'identifier', defaultValue: 'clBlack', options: COLORS },
  { name: 'Style', label: 'Grupos de cores', section: 'Conteúdo', type: 'set', defaultValue: '[cbStandardColors, cbExtendedColors, cbSystemColors, cbPrettyNames]', options: ['[cbStandardColors]', '[cbStandardColors, cbExtendedColors]', '[cbStandardColors, cbExtendedColors, cbSystemColors]', '[cbStandardColors, cbExtendedColors, cbSystemColors, cbPrettyNames]', '[cbCustomColors, cbPrettyNames]'] },
  { name: 'DropDownCount', label: 'Itens visíveis', section: 'Layout', type: 'number', defaultValue: '8' },
  { name: 'ItemHeight', label: 'Altura do item', section: 'Layout', type: 'number', defaultValue: '16' },
  ...font()
]

const STRINGGRID_PROPERTIES: DfmInspectorProperty[] = [
  align(),
  { name: 'ColCount', label: 'Quantidade de colunas', section: 'Grade', type: 'number', defaultValue: '5' },
  { name: 'RowCount', label: 'Quantidade de linhas', section: 'Grade', type: 'number', defaultValue: '5' },
  { name: 'FixedCols', label: 'Colunas fixas', section: 'Grade', type: 'number', defaultValue: '1' },
  { name: 'FixedRows', label: 'Linhas fixas', section: 'Grade', type: 'number', defaultValue: '1' },
  { name: 'DefaultColWidth', label: 'Largura padrão', section: 'Grade', type: 'number', defaultValue: '64' },
  { name: 'DefaultRowHeight', label: 'Altura padrão', section: 'Grade', type: 'number', defaultValue: '24' },
  { name: 'GridLineWidth', label: 'Espessura das linhas', section: 'Grade', type: 'number', defaultValue: '1' },
  { name: 'ScrollBars', label: 'Barras de rolagem', section: 'Layout', type: 'identifier', defaultValue: 'ssBoth', options: ['ssNone', 'ssHorizontal', 'ssVertical', 'ssBoth'] },
  { name: 'DrawingStyle', label: 'Estilo visual', section: 'Aparência', type: 'identifier', defaultValue: 'gdsThemed', options: ['gdsClassic', 'gdsThemed', 'gdsGradient'] },
  { name: 'FixedColor', label: 'Cor fixa', section: 'Aparência', type: 'identifier', defaultValue: 'clBtnFace', options: COLORS },
  { name: 'Options', label: 'Opções', section: 'Comportamento', type: 'set', defaultValue: '[goFixedVertLine, goFixedHorzLine, goVertLine, goHorzLine, goRangeSelect]', options: ['[goFixedVertLine, goFixedHorzLine, goVertLine, goHorzLine, goRangeSelect]', '[goFixedVertLine, goFixedHorzLine, goVertLine, goHorzLine, goEditing]', '[goVertLine, goHorzLine, goEditing, goTabs]', '[goEditing, goAlwaysShowEditor, goTabs]'] },
  ...font()
]

const MONTHCALENDAR_PROPERTIES: DfmInspectorProperty[] = [
  align(),
  { name: 'AutoSize', label: 'Tamanho automático', section: 'Layout', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'MultiSelect', label: 'Selecionar período', section: 'Comportamento', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'MaxSelectRange', label: 'Máximo de dias', section: 'Comportamento', type: 'number', defaultValue: '31' },
  { name: 'ShowToday', label: 'Mostrar hoje', section: 'Aparência', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'ShowTodayCircle', label: 'Destacar hoje', section: 'Aparência', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'WeekNumbers', label: 'Número das semanas', section: 'Aparência', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'CalColors.BackColor', label: 'Fundo', section: 'Cores do calendário', type: 'identifier', defaultValue: 'clWindow', options: COLORS },
  { name: 'CalColors.TitleBackColor', label: 'Fundo do título', section: 'Cores do calendário', type: 'identifier', defaultValue: 'clActiveCaption', options: [...COLORS, 'clActiveCaption'] },
  { name: 'CalColors.TitleTextColor', label: 'Texto do título', section: 'Cores do calendário', type: 'identifier', defaultValue: 'clWhite', options: COLORS },
  { name: 'CalColors.MonthBackColor', label: 'Fundo do mês', section: 'Cores do calendário', type: 'identifier', defaultValue: 'clWindow', options: COLORS },
  { name: 'CalColors.TextColor', label: 'Texto', section: 'Cores do calendário', type: 'identifier', defaultValue: 'clWindowText', options: [...COLORS, 'clWindowText'] },
  ...font()
]

const PROGRESSBAR_PROPERTIES: DfmInspectorProperty[] = [
  align(),
  { name: 'Orientation', label: 'Orientação', section: 'Layout', type: 'identifier', defaultValue: 'pbHorizontal', options: ['pbHorizontal', 'pbVertical'] },
  { name: 'Min', label: 'Mínimo', section: 'Progresso', type: 'number', defaultValue: '0' },
  { name: 'Max', label: 'Máximo', section: 'Progresso', type: 'number', defaultValue: '100' },
  { name: 'Position', label: 'Posição', section: 'Progresso', type: 'number', defaultValue: '0' },
  { name: 'Step', label: 'Incremento', section: 'Progresso', type: 'number', defaultValue: '10' },
  { name: 'Smooth', label: 'Suavizado', section: 'Aparência', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'Style', label: 'Estilo', section: 'Aparência', type: 'identifier', defaultValue: 'pbstNormal', options: ['pbstNormal', 'pbstMarquee'] },
  { name: 'State', label: 'Estado', section: 'Aparência', type: 'identifier', defaultValue: 'pbsNormal', options: ['pbsNormal', 'pbsError', 'pbsPaused'] },
  { name: 'MarqueeInterval', label: 'Intervalo da animação', section: 'Comportamento', type: 'number', defaultValue: '10' },
  { name: 'BarColor', label: 'Cor da barra', section: 'Aparência', type: 'identifier', defaultValue: 'clHighlight', options: [...COLORS, 'clHighlight'] },
  { name: 'BackgroundColor', label: 'Cor de fundo', section: 'Aparência', type: 'identifier', defaultValue: 'clBtnFace', options: COLORS }
]

const RADIOGROUP_PROPERTIES: DfmInspectorProperty[] = [
  align(),
  { name: 'Alignment', label: 'Posição dos indicadores', section: 'Layout', type: 'identifier', defaultValue: 'taRightJustify', options: ['taLeftJustify', 'taRightJustify'] },
  { name: 'Columns', label: 'Colunas', section: 'Layout', type: 'number', defaultValue: '1' },
  { name: 'ItemIndex', label: 'Item selecionado', section: 'Conteúdo', type: 'number', defaultValue: '-1' },
  { name: 'WordWrap', label: 'Quebrar texto', section: 'Aparência', type: 'boolean', defaultValue: 'False', options: BOOL },
  ...font()
]

const MAINMENU_PROPERTIES: DfmInspectorProperty[] = [
  { name: 'AutoHotkeys', label: 'Teclas de acesso automáticas', section: 'Comportamento', type: 'identifier', defaultValue: 'maAutomatic', options: ['maAutomatic', 'maManual', 'maParent'] },
  { name: 'AutoLineReduction', label: 'Redução automática de linhas', section: 'Comportamento', type: 'identifier', defaultValue: 'maAutomatic', options: ['maAutomatic', 'maManual', 'maParent'] },
  { name: 'OwnerDraw', label: 'Desenho personalizado', section: 'Aparência', type: 'boolean', defaultValue: 'False', options: BOOL }
]

const CHART_PROPERTIES: DfmInspectorProperty[] = [
  align(),
  { name: 'AllowPanning', label: 'Permitir deslocamento', section: 'Interação', type: 'set', defaultValue: '[pmHorizontal, pmVertical]', options: ['[]', '[pmHorizontal]', '[pmVertical]', '[pmHorizontal, pmVertical]'] },
  { name: 'AllowZoom', label: 'Permitir zoom', section: 'Interação', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'AnimatedZoom', label: 'Zoom animado', section: 'Interação', type: 'boolean', defaultValue: 'False', options: BOOL },
  { name: 'AutoRepaint', label: 'Redesenhar automaticamente', section: 'Comportamento', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'AxisVisible', label: 'Mostrar eixos', section: 'Aparência', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'BevelOuter', label: 'Relevo externo', section: 'Aparência', type: 'identifier', defaultValue: 'bvNone', options: ['bvNone', 'bvLowered', 'bvRaised', 'bvSpace'] },
  { name: 'Legend.Visible', label: 'Mostrar legenda', section: 'Aparência', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'Title.Visible', label: 'Mostrar título', section: 'Aparência', type: 'boolean', defaultValue: 'True', options: BOOL },
  { name: 'View3D', label: 'Visualização 3D', section: 'Aparência', type: 'boolean', defaultValue: 'True', options: BOOL },
  ...font()
]

const CATALOG: Record<string, DfmInspectorProperty[]> = {
  tlabel: LABEL_PROPERTIES, tedit: EDIT_PROPERTIES, tbitbtn: BITBTN_PROPERTIES, tmemo: MEMO_PROPERTIES,
  tcheckbox: CHECKBOX_PROPERTIES, tradiobutton: RADIOBUTTON_PROPERTIES, tcombobox: COMBOBOX_PROPERTIES,
  tlistbox: LISTBOX_PROPERTIES, timage: IMAGE_PROPERTIES, tmaskedit: MASKEDIT_PROPERTIES,
  tcolorbox: COLORBOX_PROPERTIES, tstringgrid: STRINGGRID_PROPERTIES, tmonthcalendar: MONTHCALENDAR_PROPERTIES,
  tprogressbar: PROGRESSBAR_PROPERTIES, tpanel: PANEL_PROPERTIES, tradiogroup: RADIOGROUP_PROPERTIES,
  tmainmenu: MAINMENU_PROPERTIES, tchart: CHART_PROPERTIES
}

/** Retorna as propriedades publicadas mais relevantes da classe VCL. */
export function propertiesForComponent(className: string): DfmInspectorProperty[] {
  return CATALOG[className.toLowerCase()] ?? []
}
