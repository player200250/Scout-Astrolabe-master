import React from 'react'

export interface BoardInfo {
    id: string
    name: string
    thumbnail: string | null
}

export const BoardsContext = React.createContext<BoardInfo[]>([])
