declare module 'dom-to-image-more' {
  export type Options = {
    filter?: (node: HTMLElement) => boolean
    filterStyles?: (propertyName: string) => boolean
    adjustClonedNode?: (original: HTMLElement, clone: HTMLElement, after: boolean) => HTMLElement
    onclone?: (clonedNode: HTMLElement) => void
    bgcolor?: string
    height?: number
    width?: number
    style?: Partial<CSSStyleDeclaration>
    quality?: number
    cacheBust?: boolean
    imagePlaceholder?: string
    copyDefaultStyles?: boolean
    disableInlineImages?: boolean
    useCredentialFeatures?: boolean
    useCredentialFilters?: (string | RegExp)[]
    scale?: number
  }

  const domtoimage: {
    toPng(node: HTMLElement, options?: Options): Promise<string>
    toJpeg(node: HTMLElement, options?: Options): Promise<string>
    toSvg(node: HTMLElement, options?: Options): Promise<string>
    toBlob(node: HTMLElement, options?: Options): Promise<Blob>
    toPixelData(node: HTMLElement, options?: Options): Promise<Uint8Array>
    toCanvas(node: HTMLElement, options?: Options): Promise<HTMLCanvasElement>
  }

  export default domtoimage
}
