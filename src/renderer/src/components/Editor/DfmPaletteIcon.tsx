import {
  AlignLeft, Bell, CalendarDays, ChartLine, CircleDot, Database, FolderOpen, Gauge,
  Image as ImageIcon, List, ListChecks, ListFilter, ListTodo, Menu, MousePointerClick,
  MessageCircleMore, Navigation, Palette, PanelsTopLeft, PanelTop, Plug, Printer, Puzzle, Save, ScrollText, ShieldCheck,
  SearchCode, SquareCheckBig, SquareDashed, Table2, TextCursorInput, Timer, Workflow,
  Type
} from 'lucide-react'

interface Props {
  className: string
  size?: number
}

/** Escolhe um símbolo semântico para cada família de componentes Delphi. */
export function DfmPaletteIcon({ className, size = 13 }: Props): JSX.Element {
  const name = className.replace(/^T/, '')
  const props = { size, strokeWidth: 1.8, 'aria-hidden': true as const }

  if (/XPManifest/i.test(name)) return <ShieldCheck {...props} />
  if (/TrayIcon/i.test(name)) return <Bell {...props} />
  if (/BalloonHint/i.test(name)) return <MessageCircleMore {...props} />
  if (/ActionManager/i.test(name)) return <Workflow {...props} />
  if (/OpenPictureDialog/i.test(name)) return <ImageIcon {...props} />
  if (/OpenDialog/i.test(name)) return <FolderOpen {...props} />
  if (/SaveDialog/i.test(name)) return <Save {...props} />
  if (/PrintDialog/i.test(name)) return <Printer {...props} />
  if (/DBNavigator/i.test(name)) return <Navigation {...props} />
  if (/DBCtrlGrid|DBGrid|StringGrid|DrawGrid/i.test(name)) return <Table2 {...props} />
  if (/DataSource/i.test(name)) return <Database {...props} />
  if (/FDConnection|Connection/i.test(name)) return <Plug {...props} />
  if (/FDQuery|Query|StoredProc|Table/i.test(name)) return <SearchCode {...props} />
  if (/ActionList|Action$/i.test(name)) return <ListTodo {...props} />
  if (/Timer/i.test(name)) return <Timer {...props} />
  if (/MonthCalendar|Calendar/i.test(name)) return <CalendarDays {...props} />
  if (/ProgressBar|Gauge/i.test(name)) return <Gauge {...props} />
  if (/Chart/i.test(name)) return <ChartLine {...props} />
  if (/MainMenu|PopupMenu|Menu/i.test(name)) return <Menu {...props} />
  if (/PageControl|TabSheet/i.test(name)) return <PanelsTopLeft {...props} />
  if (/ScrollBox/i.test(name)) return <ScrollText {...props} />
  if (/RadioGroup/i.test(name)) return <ListChecks {...props} />
  if (/GroupBox/i.test(name)) return <SquareDashed {...props} />
  if (/Panel|Frame/i.test(name)) return <PanelTop {...props} />
  if (/ColorBox|Color/i.test(name)) return <Palette {...props} />
  if (/Image|Picture/i.test(name)) return <ImageIcon {...props} />
  if (/RadioButton/i.test(name)) return <CircleDot {...props} />
  if (/CheckBox/i.test(name)) return <SquareCheckBig {...props} />
  if (/ComboBox|LookupCombo/i.test(name)) return <ListFilter {...props} />
  if (/ListBox|LookupList/i.test(name)) return <List {...props} />
  if (/Memo|RichEdit/i.test(name)) return <AlignLeft {...props} />
  if (/BitBtn|SpeedButton|Button/i.test(name)) return <MousePointerClick {...props} />
  if (/Label|StaticText|DBText/i.test(name)) return <Type {...props} />
  if (/MaskEdit|Edit/i.test(name)) return <TextCursorInput {...props} />
  return <Puzzle {...props} />
}
