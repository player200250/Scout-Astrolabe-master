// src/components/ui/icons.tsx
//
// 介面圖示的唯一來源。取代原本散在各處的 emoji（🏠📥🗂️…）。
//
// **為什麼要換掉 emoji**：emoji 是多色點陣字，每個作業系統長得不一樣、
// 彼此的視覺重量差很多（🗂️ 明顯比 ✅ 重），拿來當 chrome 圖示會讓整個介面
// 看起來像沒有設計主張的範本。線性單色圖示才能跟文字一起排版。
//
// **三條規則，破壞其中任何一條就會開始回到原樣：**
// 1. 一律 `currentColor` —— 圖示顏色由所在文字的 color 決定，不單獨上色。
//    （emoji 最傷的就是每個都自帶顏色，一整排像彩虹。）
// 2. 只用 SIZE 裡的尺寸與單一線寬 STROKE，不要在呼叫端另外傳 size/strokeWidth。
// 3. 只有「使用者自己的內容」可以有 emoji —— 白板名稱前綴（📄🧪🗂️）是使用者
//    拿來當分類標籤用的（BoardRecord 沒有 tags 欄位），**絕對不要動**。
import type { LucideIcon } from 'lucide-react'
import {
    House, Inbox, Library, ListChecks, NotebookPen, Network, Trash2,
    Filter, Archive, ArchiveRestore, History, Keyboard, Command, ShieldCheck, Cloud, BookOpen,
    Sun, Moon, SunMoon, Ellipsis, Pin, PinOff, Folder, FolderPlus, FolderInput, Plus, LayoutGrid,
    Search, Pencil, Copy, Zap, Calendar, ChartNoAxesColumn, CircleCheck,
    FileText, SquareCheckBig, Link2, Heading, StickyNote, Table, Palette, Paperclip, Image, Frame,
    PackageOpen, Tag, ZoomIn, Group, SquarePen, Star, FileInput, FilePlus, LayoutTemplate,
    AlignStartVertical, AlignCenterVertical, AlignEndVertical,
    AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
    AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
    Circle, CircleDashed, CircleOff, CircleDot, Square, SquareCheck,
    Flag, SignalHigh, SignalMedium, SignalLow,
    Users, BookMarked, Bug, Target, Lightbulb, ChevronRight, X,
    Pilcrow, Heading1, Heading2, Heading3, List, ListOrdered, Quote, SquareCode, Minus,
    Sigma, Bold, Italic, Underline, Strikethrough, Highlighter, Code,
} from 'lucide-react'

/** 線寬：1.75 比 lucide 預設的 2 細一點，跟 13–14px 的中文字重比較搭。 */
const STROKE = 1.75

/**
 * 尺寸階：只有兩級。sm 用於密集清單／小按鈕，md 用於主導覽。
 * 刻意不 export —— 這個檔只對外露出 `Icon` 元件本身（`react-refresh/only-export-components`
 * 規定元件檔只能匯出元件；混著匯出常數會讓熱更新退化成整頁重載，CI 也會擋）。
 */
const SIZE = { sm: 14, md: 16 } as const

const REGISTRY = {
    // 側邊欄主導覽
    home: House,
    inbox: Inbox,
    cardLibrary: Library,
    taskCenter: ListChecks,
    reviewCenter: NotebookPen,
    knowledgeGraph: Network,
    trash: Trash2,

    // 側邊欄工具列／footer
    filter: Filter,
    // 「自動備份」用 History 不用 Archive：Archive 留給白板的「封存」狀態，
    // 兩個不同概念共用同一個圖示會讓人以為是同一件事。
    backup: History,
    hotkey: Keyboard,
    command: Command,
    dataSafety: ShieldCheck,
    cloudSync: Cloud,
    onboarding: BookOpen,
    themeLight: Sun,
    themeDark: Moon,
    more: Ellipsis,

    // 清單／群組
    pin: Pin,
    unpin: PinOff,
    archive: Archive,
    unarchive: ArchiveRestore,
    folder: Folder,
    folderNew: FolderPlus,
    folderMove: FolderInput,
    boardNew: Plus,
    overview: LayoutGrid,
    search: Search,
    rename: Pencil,
    duplicate: Copy,

    // 儀表板
    quickCapture: Zap,
    calendar: Calendar,
    stats: ChartNoAxesColumn,
    done: CircleCheck,

    // 命令面板／選單的其餘入口
    inboxTriage: PackageOpen,
    tag: Tag,
    // 「切換深色/淺色」用 SunMoon（一個圖示表達「切換」）；themeLight／themeDark
    // 是側邊欄那顆「目前是什麼主題」的指示，語意不同，不要互換。
    themeToggle: SunMoon,
    template: LayoutTemplate,
    star: Star,
    close: X,
    chevronRight: ChevronRight,

    // 右鍵選單：卡片操作
    zoomToCard: ZoomIn,
    edit: SquarePen,
    /** 卡片移到別塊白板（不是資料夾搬移，那個是 folderMove）。 */
    moveToBoard: FileInput,
    blankCard: FilePlus,

    // 右鍵選單：對齊／分佈（多選時才出現）
    alignGroup: Group,
    alignLeft: AlignStartVertical,
    alignCenterX: AlignCenterVertical,
    alignRight: AlignEndVertical,
    alignTop: AlignStartHorizontal,
    alignCenterY: AlignCenterHorizontal,
    alignBottom: AlignEndHorizontal,
    distributeX: AlignHorizontalDistributeCenter,
    distributeY: AlignVerticalDistributeCenter,

    // 右鍵選單：批次狀態／優先級
    // 狀態走「同一顆圓的四種狀態」，優先級走 Signal 高低階梯 —— 兩組都靠**形狀**
    // 表達等級，不靠顏色（原本的 🔴🟠🟡 正是規則 1 說的「一排彩虹」）。
    statusTodo: Circle,
    statusInProgress: CircleDashed,
    statusNone: CircleOff,
    priority: Flag,
    priorityHigh: SignalHigh,
    priorityMedium: SignalMedium,
    priorityLow: SignalLow,
    // 「清除」共用 CircleOff（與 statusNone 同一顆），刻意不用 SignalZero：
    // 實測 SignalZero 只畫底部一個點，在選單裡看起來像圖示沒載出來。
    // 而且「清除」是與三個等級不同性質的動作，長得不一樣才對。
    priorityNone: CircleOff,

    // 選單裡的勾選／單選狀態
    checkboxOn: SquareCheck,
    checkboxOff: Square,
    radioOn: CircleDot,
    radioOff: Circle,

    // 內建文字模板（右鍵 →「從模板新增」）
    tmplMeeting: Users,
    tmplReading: BookMarked,
    tmplDebug: Bug,
    tmplGoal: Target,
    tmplIdea: Lightbulb,

    // 文字卡的 `/` 選單（見 utils/slashCommands.ts）
    fmtParagraph: Pilcrow,
    fmtH1: Heading1,
    fmtH2: Heading2,
    fmtH3: Heading3,
    fmtBulletList: List,
    fmtOrderedList: ListOrdered,
    fmtQuote: Quote,
    fmtCodeBlock: SquareCode,
    fmtDivider: Minus,
    fmtCallout: Lightbulb,
    fmtToggle: ChevronRight,
    fmtMath: Sigma,
    fmtBold: Bold,
    fmtItalic: Italic,
    fmtUnderline: Underline,
    fmtStrike: Strikethrough,
    fmtHighlight: Highlighter,
    fmtCode: Code,

    // 卡片型別（對照 CardType，見 utils/cardMeta.ts 的 TYPE_LABEL／TYPE_COLOR）
    cardText: FileText,
    cardTodo: SquareCheckBig,
    cardLink: Link2,
    cardJournal: NotebookPen,
    cardHeading: Heading,
    cardSticky: StickyNote,
    cardTable: Table,
    cardColor: Palette,
    cardFile: Paperclip,
    cardImage: Image,
    cardBoard: Frame,
} satisfies Record<string, LucideIcon>

// CardType → 圖示名稱的對照表放在 `utils/cardMeta.ts`（與 TYPE_LABEL／TYPE_COLOR 同處），
// 不放這裡：本檔是元件檔，只能匯出元件。

export type IconName = keyof typeof REGISTRY

interface IconProps {
    name: IconName
    /** 預設 sm（14px）。主導覽用 md。 */
    size?: keyof typeof SIZE
    /** 只在需要與文字基線對齊時微調，不要拿來調顏色。 */
    style?: React.CSSProperties
}

export function Icon({ name, size = 'sm', style }: IconProps) {
    const Cmp = REGISTRY[name]
    return (
        <Cmp
            size={SIZE[size]}
            strokeWidth={STROKE}
            color="currentColor"
            // flexShrink:0 —— 圖示放在 flex 列裡被文字擠扁是最常見的破圖。
            style={{ flexShrink: 0, display: 'block', ...style }}
            aria-hidden="true"
        />
    )
}
