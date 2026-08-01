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
    Sun, Moon, Ellipsis, Pin, PinOff, Folder, FolderPlus, FolderInput, Plus, LayoutGrid,
    Search, Pencil, Copy, Zap, Calendar, ChartNoAxesColumn, CircleCheck,
    FileText, SquareCheckBig, Link2, Heading, StickyNote, Table, Palette, Paperclip, Image, Frame,
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
