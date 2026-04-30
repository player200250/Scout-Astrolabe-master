export interface EmbedData {
    embedUrl: string | null
    isEmbeddable: boolean
    domain: string
}

export function getEmbedData(url: string): EmbedData {
    const trimmedUrl = url.trim()
    let domain = trimmedUrl
    let embedUrl: string | null = null
    let isEmbeddable = false

    try {
        const fullUrl = trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`
        const urlObj = new URL(fullUrl)
        domain = urlObj.hostname.replace(/^www\./, '')

        if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
            let videoId = ''
            if (urlObj.hostname.includes('youtube.com')) {
                if (urlObj.pathname.startsWith('/shorts/')) {
                    videoId = urlObj.pathname.replace('/shorts/', '').split('/')[0]
                } else {
                    videoId = new URLSearchParams(urlObj.search).get('v') || ''
                }
            } else if (urlObj.hostname.includes('youtu.be')) {
                videoId = urlObj.pathname.substring(1)
            }
            if (videoId) {
                embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=0&modestbranding=1&rel=0`
                isEmbeddable = true
                domain = 'YouTube'
            }
        } else if (domain.includes('bilibili.com')) {
            const bvMatch = urlObj.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)
            const avMatch = urlObj.pathname.match(/\/video\/av(\d+)/)
            if (bvMatch) {
                embedUrl = `https://player.bilibili.com/player.html?bvid=${bvMatch[1]}&autoplay=0`
                isEmbeddable = true
                domain = 'Bilibili'
            } else if (avMatch) {
                embedUrl = `https://player.bilibili.com/player.html?aid=${avMatch[1]}&autoplay=0`
                isEmbeddable = true
                domain = 'Bilibili'
            }
        } else if (domain.includes('vimeo.com')) {
            const match = urlObj.pathname.match(/\/(\d+)$/)
            if (match && match[1]) {
                embedUrl = `https://player.vimeo.com/video/${match[1]}`
                isEmbeddable = true
                domain = 'Vimeo'
            }
        }
    } catch {
        domain = trimmedUrl
    }

    return { embedUrl, isEmbeddable, domain }
}
