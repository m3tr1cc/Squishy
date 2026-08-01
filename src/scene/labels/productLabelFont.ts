import fredokaFontUrl from '../../assets/fonts/Fredoka-Variable.ttf?url'

export const PRODUCT_LABEL_FONT_FAMILY = 'Squishy Fredoka'

let productLabelFontPromise: Promise<void> | null = null

export function loadProductLabelFont() {
  if (productLabelFontPromise) {
    return productLabelFontPromise
  }
  if (
    typeof document === 'undefined' ||
    typeof FontFace === 'undefined'
  ) {
    productLabelFontPromise = Promise.resolve()
    return productLabelFontPromise
  }

  productLabelFontPromise = new FontFace(
    PRODUCT_LABEL_FONT_FAMILY,
    `url(${fredokaFontUrl})`,
    { style: 'normal', weight: '600' },
  )
    .load()
    .then((font) => {
      document.fonts.add(font)
    })
  return productLabelFontPromise
}
